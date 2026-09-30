/**
 * Learner-state maintenance. Encounters are the durable evidence rows; a LearnerItemState is always
 * *recomputed* from its item's encounters (sorted by time, id), never incrementally patched. That makes
 * re-weighting idempotent and makes `rebuild` trivially reproducible.
 *
 * Encounters carry `session` and `replays` (contract fields; old rows may lack them and are read as session '').
 */
import type {
  AdapterRegistry, AppStore, AssistanceLevel, DimensionState, Encounter, EventBus, EvidenceKind, EvidencePolicy, ItemKind,
  LanguageCode, LearnerItemState, LearnerLevel, Modality, ProductionKind,
} from '../core';
import { ids } from '../core';
import { ESTIMATE, confidenceFor, levelIndex, toLevel } from './policy';

export interface Ctx {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  policy: EvidencePolicy;
  clock: () => string;
  /** True when reviewed, real-speech audio exists for the text (supplied by GoListen). Absent ⇒ never recommend listening. */
  audioEligible?: (textId: string) => Promise<boolean>;
}

/** Kept as an alias: the contract `Encounter` now carries `session` / `replays` (both optional on old rows). */
export type StoredEncounter = Encounter;

export const MODALITIES: readonly Modality[] = ['reading', 'listening', 'writing', 'speaking'];
const RECEPTIVE: readonly Modality[] = ['reading', 'listening'];
export const isReceptive = (m: Modality) => RECEPTIVE.includes(m);

export const emptyDimension = (): DimensionState => ({
  level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0,
});

/**
 * Reading / listening: unassisted = no assistance at all. Writing / speaking: independent (0) and
 * self-repaired (1) count as unassisted; assisted (3) and copied (5) as assisted.
 */
export function isUnassisted(modality: Modality, assistance: AssistanceLevel): boolean {
  return modality === 'writing' || modality === 'speaking' ? assistance <= 1 : assistance === 0;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
export const byAtThenId = (a: { at: string; id: string }, b: { at: string; id: string }) =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export interface NewEncounter {
  userId: string;
  lang: LanguageCode;
  itemId: string;
  itemKind: ItemKind;
  sentenceId: string;
  textId: string;
  surface: Encounter['surface'];
  modality: Modality;
  session: string;
  at: string;
  evidenceKind: EvidenceKind;
  assistance: AssistanceLevel;
  weight: number;
  playbackSpeed?: number;
  replays?: number;
  productionKind?: ProductionKind;
}

/**
 * Creates the encounter unless (user, item, sentence, modality, session) already has one.
 * `replaceIf` (listening): an existing encounter is replaced by the candidate when the caller says the candidate is
 * better evidence; this is idempotent and order-independent. The original `at` is kept.
 */
export async function addEncounter(
  ctx: Ctx, n: NewEncounter, replaceIf?: (existing: StoredEncounter) => boolean,
): Promise<{ changed: boolean; created: boolean; encounter: StoredEncounter }> {
  const id = ids.encounter(n.userId, n.itemId, n.sentenceId, n.modality, n.session);
  const existing = (await ctx.store.encounters.get(id)) as StoredEncounter | undefined;
  if (existing) {
    if (replaceIf?.(existing)) {
      const up: StoredEncounter = {
        ...existing, evidenceKind: n.evidenceKind, weight: n.weight, assistance: n.assistance,
        ...(n.playbackSpeed !== undefined ? { playbackSpeed: n.playbackSpeed } : {}),
        ...(n.replays !== undefined ? { replays: n.replays } : {}),
      };
      await ctx.store.encounters.put(up);
      return { changed: true, created: false, encounter: up };
    }
    return { changed: false, created: false, encounter: existing };
  }
  const enc: StoredEncounter = {
    id, userId: n.userId, lang: n.lang, itemId: n.itemId, itemKind: n.itemKind, sentenceId: n.sentenceId,
    textId: n.textId, surface: n.surface, modality: n.modality, at: n.at, evidenceKind: n.evidenceKind,
    assistance: n.assistance, priorLevel: 'unseen', weight: n.weight, session: n.session,
  };
  if (n.playbackSpeed !== undefined) enc.playbackSpeed = n.playbackSpeed;
  if (n.replays !== undefined) enc.replays = n.replays;
  if (n.productionKind) enc.productionKind = n.productionKind;
  await ctx.store.encounters.put(enc);
  return { changed: true, created: true, encounter: enc };
}

/** Running totals for one (item, modality) while walking its encounters in time order. */
class Acc {
  n = 0;
  evidence = 0;
  exposures = 0;
  unassisted = 0;
  assisted = 0;
  /** distinct demonstrated (sentence, session) units */
  readonly demonstrated = new Set<string>();
  /** encounters with no help at all (exposure or demonstrated): the estimate's raw material */
  plain = 0;
  readonly plainSessions = new Set<string>();
  /** help flags of the last two encounters */
  tail: boolean[] = [];
  last?: string;

  constructor(private readonly modality: Modality) {}

  add(enc: StoredEncounter) {
    this.n += 1;
    this.evidence += enc.weight;
    if (enc.evidenceKind === 'exposure') this.exposures += 1;
    if (isUnassisted(this.modality, enc.assistance)) this.unassisted += 1; else this.assisted += 1;
    if (isReceptive(this.modality)) {
      if (enc.evidenceKind === 'demonstrated') this.demonstrated.add(`${enc.sentenceId}\u0000${enc.session ?? ''}`);
      if (enc.assistance === 0) { this.plain += 1; this.plainSessions.add(enc.session ?? ''); }
      this.tail.push(enc.assistance > 0);
      if (this.tail.length > ESTIMATE.cleanTail) this.tail.shift();
    }
    if (!this.last || enc.at > this.last) this.last = enc.at;
  }

  level(ctx: Ctx): LearnerLevel {
    if (this.n === 0) return 'unseen';
    const second = isReceptive(this.modality) ? this.demonstrated.size : this.unassisted;
    const level = toLevel(ctx.policy.level(this.modality, round6(this.evidence), second, this.assisted));
    return level === 'unseen' ? 'encountered' : level;
  }

  estimated(level: LearnerLevel): boolean {
    return isReceptive(this.modality)
      && this.plain >= ESTIMATE.minUnassisted
      && this.plainSessions.size >= ESTIMATE.minSessions
      && this.tail.length >= ESTIMATE.cleanTail && this.tail.every((h) => !h)
      && levelIndex(level) < levelIndex('recognized');
  }
}

/** Recompute one LearnerItemState (and the priorLevel of each of its encounters) from the encounters. */
export async function recomputeItem(
  ctx: Ctx, userId: string, itemId: string, meta: { lang: LanguageCode; itemKind: ItemKind },
): Promise<LearnerItemState | undefined> {
  const rowId = ids.learnerItem(userId, itemId);
  const existing = await ctx.store.learnerItems.get(rowId);
  const encs = ((await ctx.store.encounters.where('itemId', itemId)) as StoredEncounter[])
    .filter((e) => e.userId === userId).sort(byAtThenId);
  if (encs.length === 0 && !existing?.manualMark) {
    if (existing) await ctx.store.learnerItems.delete(rowId);
    return undefined;
  }

  const acc: Record<Modality, Acc> = {
    reading: new Acc('reading'), listening: new Acc('listening'), writing: new Acc('writing'), speaking: new Acc('speaking'),
  };
  for (const enc of encs) {
    const a = acc[enc.modality];
    const prior = a.level(ctx);
    if (enc.priorLevel !== prior) {
      enc.priorLevel = prior;
      await ctx.store.encounters.put(enc);
    }
    a.add(enc);
  }

  const dim = (m: Modality): DimensionState => {
    const a = acc[m];
    if (a.n === 0) return emptyDimension();
    const evidence = round6(a.evidence);
    const level = a.level(ctx);
    const estimatedFamiliar = a.estimated(level);
    const d: DimensionState = {
      level,
      confidence: estimatedFamiliar ? Math.max(ESTIMATE.confidence, confidenceFor(evidence)) : confidenceFor(evidence),
      evidence, exposures: a.exposures, estimatedFamiliar, unassisted: a.unassisted, assisted: a.assisted,
    };
    if (a.last) d.lastEvidenceAt = a.last;
    return d;
  };

  const seen = encs.filter((e) => isReceptive(e.modality));
  const textIds: string[] = [];
  for (const e of seen) if (!textIds.includes(e.textId)) textIds.push(e.textId);
  const row: LearnerItemState = {
    id: rowId, userId, lang: meta.lang, itemId, itemKind: meta.itemKind,
    reading: dim('reading'), listening: dim('listening'), writing: dim('writing'), speaking: dim('speaking'),
    encounterCount: seen.length, textIds,
  };
  if (seen.length > 0) { row.firstSeenAt = seen[0].at; row.lastSeenAt = seen[seen.length - 1].at; }
  if (existing?.manualMark) row.manualMark = existing.manualMark;
  await ctx.store.learnerItems.put(row);
  return row;
}

export async function recomputeMany(
  ctx: Ctx, userId: string, items: Map<string, { lang: LanguageCode; itemKind: ItemKind }>,
): Promise<void> {
  for (const [itemId, meta] of items) await recomputeItem(ctx, userId, itemId, meta);
}

/**
 * Manual marks only cap / floor the *displayed* reading level: `known` floors it at `recognized` (an explicit mark is a
 * demonstration of that item), `unknown` caps it at `recognized_with_help`. Stored evidence is untouched.
 */
export function effectiveReadingLevel(state: LearnerItemState | undefined): LearnerLevel {
  if (!state) return 'unseen';
  const level = state.reading.level;
  if (state.manualMark === 'known' && levelIndex(level) < levelIndex('recognized')) return 'recognized';
  if (state.manualMark === 'unknown' && levelIndex(level) > levelIndex('recognized_with_help')) return 'recognized_with_help';
  return level;
}

/** "Likely familiar (estimate)": the stored estimate, unless the learner marked the item unknown or it is already recognized. */
export function effectiveEstimate(state: LearnerItemState | undefined): boolean {
  if (!state || !state.reading.estimatedFamiliar) return false;
  if (state.manualMark === 'unknown') return false;
  return levelIndex(effectiveReadingLevel(state)) < levelIndex('recognized');
}
