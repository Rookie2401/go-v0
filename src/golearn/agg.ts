/**
 * Item aggregates (`evidence@6`) — what makes folding one event cost the same on the first day and on the thousandth.
 *
 * Before evidence@6 an item's state was RE-DERIVED from every encounter it had ever had, on every fold. Now each stored
 * item row carries an aggregate (`agg`) from which its `LearnerItemState` is a pure function, and a fold only touches the
 * aggregates of the items in the event's sentence.
 *
 * Per modality the aggregate has
 *   settled  counts for every encounter of EARLIER sittings: they can no longer change (help and reports are scoped to the
 *            sitting they happen in), so they are plain numbers (n, evidence in micro-units, exposures, assisted …, the
 *            help flags of the last two encounters, how many earlier sittings had a help-free encounter, capped at what
 *            the estimate rule needs).
 *   head     (reading and listening only) the encounters of the CURRENT sitting, one small entry per sentence: help or a
 *            report arriving later in the sitting changes an entry, never a number somebody else has already counted.
 * The state is `fold(settled, head entries in creation order)`, so it is the same whatever order help, views and reports
 * arrived in within a sitting: live folding and a rebuild from the log reach identical rows. When an encounter of a NEW
 * sitting arrives the old head is folded into the settled counts and a new head starts. The head is bounded by the length
 * of a sitting, never by the learner's history.
 *
 * Writing-system (`orth`) items have no encounter rows at all: the aggregate IS their record (counts by text, the first
 * meeting, how often the romanization rescue was used). Word, lemma, phrase and pattern items also keep one encounter row
 * per sentence ("where did I meet this word"), written through from the same entries.
 *
 * Evidence is summed in integer micro-units so that no order of additions can change the result.
 */
import { LEVEL_ORDER } from '../core';
import type { AssistanceLevel, DimensionState, ItemKind, LanguageCode, LearnerItemState, LearnerLevel, Modality } from '../core';
import { ESTIMATE, confidenceFor, levelIndex, toLevel } from './policy';
import type { Ctx } from './state';
import { emptyDimension, isReceptive, isUnassisted } from './state';

export const K_EXPOSURE = 0;
export const K_ASSISTED = 1;
export const K_DEMONSTRATED = 2;
export const K_PRODUCTION = 3;
export const KIND_OF = ['exposure', 'assisted', 'demonstrated', 'production'] as const;
export const kindCode = (k: string): number => Math.max(0, KIND_OF.indexOf(k as (typeof KIND_OF)[number]));

/** [kind, assistance, itemHelp, weight × 1e6, priorLevel index, romanized 0|1] — one encounter of the current sitting. */
export type Entry = [kind: number, assistance: number, itemHelp: number, weightMicro: number, prior: number, roman: number];
export interface Head { sitting: string; e: Record<string, Entry> }

export interface Settled {
  n: number;
  ev: number; // Σ weight × 1e6
  exposures: number;
  unassisted: number;
  assisted: number;
  demo: number;
  plain: number;
  /** earlier sittings with at least one help-free encounter, capped at ESTIMATE.minSittings */
  plainOlder: number;
  /** item-targeted-help flags (0|1) of the last ESTIMATE.cleanTail encounters, oldest first */
  tail: number[];
  rom: number;
  helped: number;
  firstAt?: string;
  lastAt?: string;
}

export interface ItemAgg {
  reading: Settled;
  listening: Settled;
  writing: Settled;
  speaking: Settled;
  headR?: Head;
  headL?: Head;
  /** The first receptive meeting. */
  first?: { textId: string; sentenceId: string; at: string };
  /** Distinct texts met in, in the order first met, with the number of receptive encounters in each. */
  texts: string[];
  counts: number[];
  /** Listening encounters per text (textId → n). Present only once something was heard, so a reading-only aggregate is unchanged. */
  lt?: Record<string, number>;
}

/** A stored learner item: the contract row plus its aggregate. Readers outside GoLearn never see `agg` (see `publicRow`). */
export type StoredItem = LearnerItemState & { agg: ItemAgg };

export const blankSettled = (): Settled => ({
  n: 0, ev: 0, exposures: 0, unassisted: 0, assisted: 0, demo: 0, plain: 0, plainOlder: 0, tail: [], rom: 0, helped: 0,
});
export const blankAgg = (): ItemAgg => ({
  reading: blankSettled(), listening: blankSettled(), writing: blankSettled(), speaking: blankSettled(), texts: [], counts: [],
});

export function publicRow(row: LearnerItemState): LearnerItemState {
  if (!('agg' in row)) return row;
  const { agg: _agg, ...rest } = row as StoredItem;
  void _agg;
  return rest;
}

const headOf = (agg: ItemAgg, m: Modality): Head | undefined => (m === 'reading' ? agg.headR : m === 'listening' ? agg.headL : undefined);
const dimOf = (agg: ItemAgg, m: Modality): Settled => agg[m];

function add(t: Settled, m: Modality, e: Entry) {
  t.n += 1;
  t.ev += e[3];
  if (e[0] === K_EXPOSURE) t.exposures += 1;
  if (isUnassisted(m, e[1] as AssistanceLevel)) t.unassisted += 1; else t.assisted += 1;
  if (e[0] === K_DEMONSTRATED) t.demo += 1;
  if (e[1] === 0) t.plain += 1;
  t.tail.push(e[2] > 0 ? 1 : 0);
  if (t.tail.length > ESTIMATE.cleanTail) t.tail.shift();
  if (e[5]) t.rom += 1;
  if (e[2] > 0) t.helped += 1;
}

/** Fold a finished sitting into the settled counts. */
function settle(s: Settled, m: Modality, head: Head) {
  let anyPlain = false;
  for (const e of Object.values(head.e)) { add(s, m, e); if (e[1] === 0) anyPlain = true; }
  if (anyPlain) s.plainOlder = Math.min(ESTIMATE.minSittings, s.plainOlder + 1);
}

export interface Totals extends Settled { plainSittings: number }

/** The counts of one modality: settled ⊕ the current sitting's entries (in creation order). */
export function totalsOf(agg: ItemAgg, m: Modality): Totals {
  const s = dimOf(agg, m);
  const t: Totals = { ...s, tail: [...s.tail], plainSittings: s.plainOlder };
  const head = headOf(agg, m);
  if (head) {
    let anyPlain = false;
    for (const e of Object.values(head.e)) { add(t, m, e); if (e[1] === 0) anyPlain = true; }
    if (anyPlain) t.plainSittings += 1;
  }
  return t;
}

export function levelOf(ctx: Ctx, m: Modality, t: Settled): LearnerLevel {
  if (t.n === 0) return 'unseen';
  const second = isReceptive(m) ? t.demo : t.unassisted;
  const level = toLevel(ctx.policy.level(m, Math.round(t.ev) / 1e6, second, t.assisted));
  return level === 'unseen' ? 'encountered' : level;
}

function estimated(m: Modality, t: Totals, level: LearnerLevel): boolean {
  return isReceptive(m)
    && t.plain >= ESTIMATE.minUnassisted
    && t.plainSittings >= ESTIMATE.minSittings
    && t.tail.length >= ESTIMATE.cleanTail && t.tail.every((h) => h === 0)
    && levelIndex(level) < levelIndex('recognized');
}

/**
 * Re-derive `priorLevel` of the current sitting's entries (the level before each encounter, in creation order).
 * Returns the sentences whose entry changed.
 */
export function relevel(ctx: Ctx, agg: ItemAgg, m: Modality): Array<{ sentenceId: string; sitting: string; prior: LearnerLevel }> {
  const head = headOf(agg, m);
  if (!head) return [];
  const s = dimOf(agg, m);
  const t: Totals = { ...s, tail: [...s.tail], plainSittings: s.plainOlder };
  const changed: Array<{ sentenceId: string; sitting: string; prior: LearnerLevel }> = [];
  for (const [sentenceId, e] of Object.entries(head.e)) {
    const idx = levelIndex(levelOf(ctx, m, t));
    if (e[4] !== idx) { e[4] = idx; changed.push({ sentenceId, sitting: head.sitting, prior: LEVEL_ORDER[idx] }); }
    add(t, m, e);
  }
  return changed;
}

/** The entry of (modality, sentence) in the current sitting, if any. */
export function entryOf(agg: ItemAgg, m: Modality, sitting: string, sentenceId: string): Entry | undefined {
  const head = headOf(agg, m);
  return head && head.sitting === sitting ? head.e[sentenceId] : undefined;
}

export interface Meeting { textId: string; sentenceId: string; at: string }

/** Record a NEW receptive encounter (reading or listening) in the current sitting. */
export function addReceptive(agg: ItemAgg, m: 'reading' | 'listening', sitting: string, entry: Entry, meeting: Meeting) {
  let head = headOf(agg, m);
  if (!head || head.sitting !== sitting) {
    if (head) settle(agg[m], m, head);
    head = { sitting, e: {} };
    if (m === 'reading') agg.headR = head; else agg.headL = head;
  }
  head.e[meeting.sentenceId] = entry;
  const s = agg[m];
  if (s.firstAt === undefined || meeting.at < s.firstAt) s.firstAt = meeting.at;
  if (s.lastAt === undefined || meeting.at > s.lastAt) s.lastAt = meeting.at;
  if (!agg.first) agg.first = { textId: meeting.textId, sentenceId: meeting.sentenceId, at: meeting.at };
  const i = agg.texts.indexOf(meeting.textId);
  if (i < 0) { agg.texts.push(meeting.textId); agg.counts.push(1); } else agg.counts[i] += 1;
  if (m === 'listening') { agg.lt ??= {}; agg.lt[meeting.textId] = (agg.lt[meeting.textId] ?? 0) + 1; }
}

/** The texts this item was READ in (a text it was only heard in is left out). Absent from the row unless something was heard. */
export function readingTextsOf(agg: ItemAgg): string[] | undefined {
  const lt = agg.lt;
  if (!lt) return undefined;
  return agg.texts.filter((t, i) => agg.counts[i] - (lt[t] ?? 0) > 0);
}

/** Record a production (writing / speaking): never changes afterwards, so it is simply counted. */
export function addProduction(agg: ItemAgg, m: 'writing' | 'speaking', entry: Entry, at: string) {
  const s = agg[m];
  add(s, m, entry);
  if (s.firstAt === undefined || at < s.firstAt) s.firstAt = at;
  if (s.lastAt === undefined || at > s.lastAt) s.lastAt = at;
}

export function isEmptyAgg(agg: ItemAgg): boolean {
  return (['reading', 'listening', 'writing', 'speaking'] as const).every((m) => totalsOf(agg, m).n === 0);
}

/** The contract row for an item. Undefined when there is nothing to keep (no encounter and no explicit mark). */
export function buildRow(
  ctx: Ctx, userId: string, itemId: string, meta: { lang: LanguageCode; itemKind: ItemKind }, agg: ItemAgg, manualMark?: 'known' | 'unknown',
): StoredItem | undefined {
  if (isEmptyAgg(agg) && !manualMark) return undefined;
  const dim = (m: Modality): DimensionState => {
    const t = totalsOf(agg, m);
    if (t.n === 0) return emptyDimension();
    const evidence = Math.round(t.ev) / 1e6;
    const level = levelOf(ctx, m, t);
    const est = estimated(m, t, level);
    const d: DimensionState = {
      level,
      confidence: est ? Math.max(ESTIMATE.confidence, confidenceFor(evidence)) : confidenceFor(evidence),
      evidence, exposures: t.exposures, estimatedFamiliar: est, unassisted: t.unassisted, assisted: t.assisted,
    };
    if (t.lastAt) d.lastEvidenceAt = t.lastAt;
    return d;
  };
  const reading = totalsOf(agg, 'reading');
  const listening = totalsOf(agg, 'listening');
  // encounterCount / firstSeenAt / lastSeenAt describe "met in any receptive modality" (display only). READING measures never use
  // them: coverage, forecast, ranking and recommendations read `reading.level` / the reading dimension (evidence@8).
  const seen = reading.n + listening.n;
  const row: StoredItem = {
    id: `${userId}|${itemId}`, userId, lang: meta.lang, itemId, itemKind: meta.itemKind,
    reading: dim('reading'), listening: dim('listening'), writing: dim('writing'), speaking: dim('speaking'),
    encounterCount: seen, textIds: [...agg.texts], agg,
  };
  const readTexts = readingTextsOf(agg);
  if (readTexts) row.readingTextIds = readTexts;
  if (seen > 0) {
    const firsts = [reading.firstAt, listening.firstAt].filter((x): x is string => !!x).sort();
    const lasts = [reading.lastAt, listening.lastAt].filter((x): x is string => !!x).sort();
    row.firstSeenAt = firsts[0];
    row.lastSeenAt = lasts[lasts.length - 1];
  }
  if (manualMark) row.manualMark = manualMark;
  return row;
}

/** What retention needs of a word's reading history, from the aggregate alone. */
export function readingSummary(agg: ItemAgg | undefined): { n: number; firstAt?: string; lastAt?: string; lastHelped: boolean } {
  if (!agg) return { n: 0, lastHelped: false };
  const t = totalsOf(agg, 'reading');
  return { n: t.n, firstAt: t.firstAt, lastAt: t.lastAt, lastHelped: t.tail[t.tail.length - 1] === 1 };
}

/** Item-targeted-help flag of the last `k` reading encounters (oldest first). */
export function readingTail(agg: ItemAgg | undefined): number[] {
  return agg ? totalsOf(agg, 'reading').tail : [];
}
