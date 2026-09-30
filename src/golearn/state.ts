/**
 * Learner-state maintenance. Encounters are the durable evidence rows; a LearnerItemState is always
 * *recomputed* from its item's encounters (sorted by time, id), never incrementally patched. That makes
 * re-weighting idempotent and makes `rebuild` trivially reproducible.
 */
import type {
  AdapterRegistry, AppStore, AssistanceLevel, DimensionState, Encounter, EventBus, EvidencePolicy, ItemKind, ProductionKind,
  LanguageCode, LearnerItemState, LearnerLevel, Modality,
} from '../core';
import { ids } from '../core';
import { confidenceFor, levelIndex, toLevel } from './policy';

export interface Ctx {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  policy: EvidencePolicy;
  clock: () => string;
}

export const MODALITIES: readonly Modality[] = ['reading', 'listening', 'writing', 'speaking'];
const RECEPTIVE: readonly Modality[] = ['reading', 'listening'];

export const emptyDimension = (): DimensionState => ({ level: 'unseen', confidence: 0, evidence: 0, unassisted: 0, assisted: 0 });

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
  assistance: AssistanceLevel;
  weight: number;
  playbackSpeed?: number;
  productionKind?: ProductionKind;
}

/**
 * Creates the encounter unless (user, item, sentence, modality, session) already has one.
 * `upgrade` (listening): an existing encounter is replaced by the better evidence (higher weight), which is
 * idempotent and order-independent.
 */
export async function addEncounter(
  ctx: Ctx, n: NewEncounter, upgrade = false,
): Promise<{ changed: boolean; created: boolean; encounter: Encounter }> {
  const id = ids.encounter(n.userId, n.itemId, n.sentenceId, n.modality, n.session);
  const existing = await ctx.store.encounters.get(id);
  if (existing) {
    if (upgrade && n.weight > existing.weight) {
      const up: Encounter = { ...existing, weight: n.weight, assistance: n.assistance, playbackSpeed: n.playbackSpeed ?? existing.playbackSpeed };
      await ctx.store.encounters.put(up);
      return { changed: true, created: false, encounter: up };
    }
    return { changed: false, created: false, encounter: existing };
  }
  const enc: Encounter = {
    id, userId: n.userId, lang: n.lang, itemId: n.itemId, itemKind: n.itemKind, sentenceId: n.sentenceId,
    textId: n.textId, surface: n.surface, modality: n.modality, at: n.at, assistance: n.assistance,
    priorLevel: 'unseen', weight: n.weight,
  };
  if (n.playbackSpeed !== undefined) enc.playbackSpeed = n.playbackSpeed;
  if (n.productionKind) enc.productionKind = n.productionKind;
  await ctx.store.encounters.put(enc);
  return { changed: true, created: true, encounter: enc };
}

interface Acc { evidence: number; unassisted: number; assisted: number; last?: string }

/** Recompute one LearnerItemState (and the priorLevel of each of its encounters) from the encounters. */
export async function recomputeItem(
  ctx: Ctx, userId: string, itemId: string, meta: { lang: LanguageCode; itemKind: ItemKind },
): Promise<LearnerItemState | undefined> {
  const rowId = ids.learnerItem(userId, itemId);
  const existing = await ctx.store.learnerItems.get(rowId);
  const encs = (await ctx.store.encounters.where('itemId', itemId)).filter((e) => e.userId === userId).sort(byAtThenId);
  if (encs.length === 0 && !existing?.manualMark) {
    if (existing) await ctx.store.learnerItems.delete(rowId);
    return undefined;
  }

  const acc: Record<Modality, Acc> = {
    reading: { evidence: 0, unassisted: 0, assisted: 0 },
    listening: { evidence: 0, unassisted: 0, assisted: 0 },
    writing: { evidence: 0, unassisted: 0, assisted: 0 },
    speaking: { evidence: 0, unassisted: 0, assisted: 0 },
  };
  for (const enc of encs) {
    const a = acc[enc.modality];
    const prior: LearnerLevel = toLevel(ctx.policy.level(enc.modality, a.evidence, a.unassisted, a.assisted));
    if (enc.priorLevel !== prior) {
      enc.priorLevel = prior;
      await ctx.store.encounters.put(enc);
    }
    a.evidence += enc.weight;
    if (isUnassisted(enc.modality, enc.assistance)) a.unassisted += 1; else a.assisted += 1;
    if (!a.last || enc.at > a.last) a.last = enc.at;
  }

  const dim = (m: Modality): DimensionState => {
    const a = acc[m];
    if (a.unassisted + a.assisted === 0) return emptyDimension();
    const evidence = round6(a.evidence);
    const d: DimensionState = {
      level: toLevel(ctx.policy.level(m, evidence, a.unassisted, a.assisted)),
      confidence: confidenceFor(evidence), evidence, unassisted: a.unassisted, assisted: a.assisted,
    };
    if (a.last) d.lastEvidenceAt = a.last;
    return d;
  };

  const seen = encs.filter((e) => RECEPTIVE.includes(e.modality));
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
 * Manual marks only cap / floor the *displayed* reading level: `known` floors it at `recognized`,
 * `unknown` caps it at `recognized_with_help`. Stored evidence is untouched.
 */
export function effectiveReadingLevel(state: LearnerItemState | undefined): LearnerLevel {
  if (!state) return 'unseen';
  const level = state.reading.level;
  if (state.manualMark === 'known' && levelIndex(level) < levelIndex('recognized')) return 'recognized';
  if (state.manualMark === 'unknown' && levelIndex(level) > levelIndex('recognized_with_help')) return 'recognized_with_help';
  return level;
}
