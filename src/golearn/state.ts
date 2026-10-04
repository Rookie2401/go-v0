/**
 * Learner-state types and helpers. Encounters are the durable per-sentence evidence rows; a LearnerItemState is a pure
 * function of its aggregate (agg.ts), updated incrementally by the fold and re-derived from the event log by `rebuild`.
 *
 * Encounters carry `sitting` (derived from event time, see sitting.ts), `contentVersion`, `session` (the UI's id of the
 * creating event, informational only) and `replays`. Old rows may lack them; they are rebuilt on the policy bump.
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
  /**
   * Whether listening is part of this version of the product (GoListen is switched off by one flag, PLAN8). It only decides what GoLearn
   * SAYS and RECOMMENDS; listening events already in the log fold exactly as before, so stored state is the same either way.
   */
  listening: boolean;
  /**
   * Time of the latest evidence event of this learner (in that language) that has been folded (the `asOf` of coverage). Wired by
   * `createGoLearn`; reads the folder's in-memory index and therefore never waits on the fold queue.
   */
  evidenceAsOf?: (userId: string, lang: LanguageCode) => Promise<string | undefined>;
  /**
   * The learner's evidence events kept in memory by the folder (see userlog.ts): reads that need the log (progress, pace,
   * readiness) take it from here instead of reading the whole event table. Wired by `createGoLearn`.
   */
  userLog: (userId: string) => Promise<import('./userlog').UserLog>;
}

/**
 * The contract `Encounter` plus what `evidence@6` needs: the highest ITEM-TARGETED help (word, phrase, grammar: 1–3) used
 * on this item in this encounter's sitting + sentence, kept apart from sentence-level help (explanation, English: 4–5),
 * which `assistance` also reflects. Absent ⇒ no item-targeted help. Derived data (rebuilt from the log).
 */
export type StoredEncounter = Encounter & {
  itemHelp?: AssistanceLevel;
  /**
   * Reading only: the romanization rescue was used on this item in this sitting + sentence (a `DecodingRevealed` with
   * `romanization: true`). The contract `Encounter` has no free-form field, so it lives here beside `itemHelp`; the audit and
   * the stage-readiness `decoding` signal read it. Absent ⇒ no romanization. Derived data (rebuilt from the log).
   */
  romanized?: true;
};

/**
 * Item-targeted help of an encounter: a reading encounter records it in `itemHelp`; any other encounter (listening: transcript
 * shown = 2) falls back to its assistance when that is in 1–3. Sentence-level help (4–5) is never item-targeted.
 */
export function itemHelpOf(e: { assistance: AssistanceLevel; itemHelp?: AssistanceLevel }): AssistanceLevel {
  if (e.itemHelp !== undefined) return e.itemHelp;
  return (e.assistance >= 1 && e.assistance <= 3 ? e.assistance : 0) as AssistanceLevel;
}

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
  /** The UI's session id of the event that created the encounter (informational; never used for dedupe or estimates). */
  session: string;
  /** Time-derived sitting key: the dedupe slot of reading / listening encounters. */
  sitting?: string;
  /** Content version the evidence was gathered against. */
  contentVersion?: number;
  /** Overrides the id slot (production encounters are keyed once-ever, whatever the sitting). */
  idKey?: string;
  at: string;
  evidenceKind: EvidenceKind;
  assistance: AssistanceLevel;
  /** Reading only: the item-targeted part of `assistance` (see StoredEncounter). Omitted when 0. */
  itemHelp?: AssistanceLevel;
  /** Reading only: the romanization rescue was used on this item (see StoredEncounter). */
  romanized?: boolean;
  weight: number;
  playbackSpeed?: number;
  replays?: number;
  productionKind?: ProductionKind;
}

/** The id of an encounter: (user, item, sentence, modality, sitting) — or the once-ever slot of a production. */
export const encounterIdOf = (n: Pick<NewEncounter, 'userId' | 'itemId' | 'sentenceId' | 'modality' | 'idKey' | 'sitting' | 'session'>) =>
  ids.encounter(n.userId, n.itemId, n.sentenceId, n.modality, n.idKey ?? n.sitting ?? n.session);

/** The encounter row for a NEW encounter (its `priorLevel` is set by the item book once the item's aggregate is known). */
export function buildEncounter(n: NewEncounter): StoredEncounter {
  const enc: StoredEncounter = {
    id: encounterIdOf(n), userId: n.userId, lang: n.lang, itemId: n.itemId, itemKind: n.itemKind, sentenceId: n.sentenceId,
    textId: n.textId, surface: n.surface, modality: n.modality, at: n.at, evidenceKind: n.evidenceKind,
    assistance: n.assistance, priorLevel: 'unseen', weight: n.weight, session: n.session,
  };
  if (n.itemHelp) enc.itemHelp = n.itemHelp;
  if (n.romanized) enc.romanized = true;
  if (n.sitting !== undefined) enc.sitting = n.sitting;
  if (n.contentVersion !== undefined) enc.contentVersion = n.contentVersion;
  if (n.playbackSpeed !== undefined) enc.playbackSpeed = n.playbackSpeed;
  if (n.replays !== undefined) enc.replays = n.replays;
  if (n.productionKind) enc.productionKind = n.productionKind;
  return enc;
}

/** The sitting an encounter belongs to (rows from before evidence@3 fall back to their session until rebuilt). */
export const sittingOf = (e: { sitting?: string; session?: string }) => e.sitting ?? e.session ?? '';

/** Running totals for one (item, modality) while walking its encounters in time order. */
class Acc {
  n = 0;
  evidence = 0;
  exposures = 0;
  unassisted = 0;
  assisted = 0;
  /** distinct demonstrated (sentence, sitting) units */
  readonly demonstrated = new Set<string>();
  /** encounters with no help at all (exposure or demonstrated): the estimate's raw material. Sentence-level help is not one. */
  plain = 0;
  readonly plainSittings = new Set<string>();
  /** item-targeted-help flags of the last two encounters (sentence-level help never sets one) */
  tail: boolean[] = [];
  last?: string;

  constructor(private readonly modality: Modality) {}

  add(enc: StoredEncounter) {
    this.n += 1;
    this.evidence += enc.weight;
    if (enc.evidenceKind === 'exposure') this.exposures += 1;
    if (isUnassisted(this.modality, enc.assistance)) this.unassisted += 1; else this.assisted += 1;
    if (isReceptive(this.modality)) {
      if (enc.evidenceKind === 'demonstrated') this.demonstrated.add(`${enc.sentenceId}\u0000${sittingOf(enc)}`);
      if (enc.assistance === 0) { this.plain += 1; this.plainSittings.add(sittingOf(enc)); }
      // a heard sentence's transcript / translation is sentence-level help (evidence@8): never an item-targeted flag
      this.tail.push(this.modality === 'reading' && itemHelpOf(enc) > 0);
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
      && this.plainSittings.size >= ESTIMATE.minSittings
      && this.tail.length >= ESTIMATE.cleanTail && this.tail.every((h) => !h)
      && levelIndex(level) < levelIndex('recognized');
  }
}

/**
 * REFERENCE derivation: a learner item's state recomputed from ALL of its encounter rows, the way evidence@5 did it on
 * every fold. The fold no longer uses it (see agg.ts); it is kept as the independent definition the incremental result is
 * tested against, and for audits. Encounters of one time are ordered by `order` (default: id) — the fold orders them by
 * creation, which for equal times is the order of the event's sentences.
 */
export async function referenceItemState(
  ctx: Ctx, userId: string, itemId: string, meta: { lang: LanguageCode; itemKind: ItemKind },
  order: (a: StoredEncounter, b: StoredEncounter) => number = byAtThenId,
): Promise<LearnerItemState | undefined> {
  const existing = await ctx.store.learnerItems.get(ids.learnerItem(userId, itemId));
  const encs = ((await ctx.store.encounters.where('itemId', itemId)) as StoredEncounter[])
    .filter((e) => e.userId === userId).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : order(a, b)));
  if (encs.length === 0 && !existing?.manualMark) return undefined;

  const acc: Record<Modality, Acc> = {
    reading: new Acc('reading'), listening: new Acc('listening'), writing: new Acc('writing'), speaking: new Acc('speaking'),
  };
  for (const enc of encs) acc[enc.modality].add(enc);

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
    id: ids.learnerItem(userId, itemId), userId, lang: meta.lang, itemId, itemKind: meta.itemKind,
    reading: dim('reading'), listening: dim('listening'), writing: dim('writing'), speaking: dim('speaking'),
    encounterCount: seen.length, textIds,
  };
  if (seen.length > 0) { row.firstSeenAt = seen[0].at; row.lastSeenAt = seen[seen.length - 1].at; }
  if (seen.some((e) => e.modality === 'listening')) {
    // same order as the aggregate: texts in the order a receptive encounter first met them, those with a reading encounter kept
    row.readingTextIds = textIds.filter((t) => seen.some((e) => e.modality === 'reading' && e.textId === t));
  }
  if (existing?.manualMark) row.manualMark = existing.manualMark;
  return row;
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
