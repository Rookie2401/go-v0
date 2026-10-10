/**
 * GoLearn Active: how well the learner knows a word on the page, read from the learner model's rows for its unit ids
 * (lemma and form), as one of the six knowledge levels of the contract (`KnowledgeLevel`: new, seen, recognized, familiar,
 * known, automatic). The Repository's engine computes the level of a unit itself (`KnowledgeView.level`); when a row carries
 * it, it is used as it stands. The thresholds below are the page's reading of the same rows for an engine that does not send
 * one yet, and they match the engine's: this file is the one place on the page side that states them.
 *
 * Every word gets a level: a word with no row at all, or no encounter, is `new` (the unknown words are underlined too), and the
 * learner's own mark on a word (the newest mark among the word's rows, read through `levelOfMark`, so the three marks stored
 * before the six levels keep their meaning) decides the level outright, until they mark it again. Nothing here decides a
 * status in the Repository: the levels are a reading of the projection, the same rows the card's rating row shows.
 */
import { KNOWLEDGE_LEVELS, KNOWLEDGE_LEVEL_RANK, KNOWLEDGE_LEVEL_WORDS, levelOfMark, type KnowledgeLevel, type LevelMark } from '../../../repository-contract/src/knowledge-levels';
import type { KnowledgeView } from '../protocol';

export type ActiveLevel = KnowledgeLevel;

/** From the least to the most established. */
export const ACTIVE_LEVELS: readonly ActiveLevel[] = KNOWLEDGE_LEVELS;

/**
 * The thresholds, over a row's dimensions (a dimension's `score` is the estimate in 0..1, `observations` how many events moved it):
 *   new         no observation at all
 *   seen        an exposure (or a lookup) or any other observation, nothing that shows it was understood
 *   recognized  assisted recognition observed at least once, or reading recognition observed (once, or below the familiar bar)
 *   familiar    reading recognition ≥ 0.6 over ≥ 2 observations
 *   known       reading recognition ≥ 0.8 over ≥ 4 observations
 *   automatic   productive retrieval or contextual production ≥ 0.7 over ≥ 2 observations
 */
export const LEVEL_RULES = {
  familiar: { minScore: 0.6, minObservations: 2 },
  known: { minScore: 0.8, minObservations: 4 },
  automatic: { minScore: 0.7, minObservations: 2 },
} as const;

/** The legend the popup shows, one line per level, in the order of ACTIVE_LEVELS. The words come from the contract (`KNOWLEDGE_LEVEL_WORDS`). */
export const LEVEL_LEGEND: Record<ActiveLevel, { title: string; detail: string; style: string }> = {
  new: { ...KNOWLEDGE_LEVEL_WORDS.new, style: 'light-blue highlight' },
  seen: { ...KNOWLEDGE_LEVEL_WORDS.seen, style: 'heavy underline' },
  recognized: { ...KNOWLEDGE_LEVEL_WORDS.recognized, style: 'lighter underline' },
  familiar: { ...KNOWLEDGE_LEVEL_WORDS.familiar, style: 'faint underline' },
  known: { ...KNOWLEDGE_LEVEL_WORDS.known, style: 'no mark' },
  automatic: { ...KNOWLEDGE_LEVEL_WORDS.automatic, style: 'no mark' },
};

/** What the learner's own mark means for the underline (a mark stored before the six levels is read through `levelOfMark`). */
export const levelOfSelfMark = (mark: LevelMark): ActiveLevel => levelOfMark(mark);

/** The level one row's evidence supports (or the level the engine sent), or undefined when there is no row. A row with nothing observed is `new`; the learner's own mark is not read here. */
export function levelOfRow(row: KnowledgeView | undefined): ActiveLevel | undefined {
  if (!row) return undefined;
  if (row.level && (KNOWLEDGE_LEVELS as readonly string[]).includes(row.level)) return row.level;
  const d = row.dimensions;
  const obs = (k: keyof typeof d): number => d[k]?.observations ?? 0;
  const score = (k: keyof typeof d): number => d[k]?.score ?? 0;
  const automatic = (['productiveRetrieval', 'contextualProduction'] as const).some((k) => obs(k) >= LEVEL_RULES.automatic.minObservations && score(k) >= LEVEL_RULES.automatic.minScore);
  if (automatic) return 'automatic';
  if (obs('readingRecognition') >= LEVEL_RULES.known.minObservations && score('readingRecognition') >= LEVEL_RULES.known.minScore) return 'known';
  if (obs('readingRecognition') >= LEVEL_RULES.familiar.minObservations && score('readingRecognition') >= LEVEL_RULES.familiar.minScore) return 'familiar';
  if (obs('assistedRecognition') > 0 || obs('readingRecognition') > 0) return 'recognized';
  if (Object.values(d).some((x) => (x?.observations ?? 0) > 0)) return 'seen';
  return 'new';
}

/** The newest of the learner's own marks among a word's rows, if any. */
export function selfMarkOfRows(rows: Array<KnowledgeView | undefined>): { mark: LevelMark; at: string } | undefined {
  let best: { mark: LevelMark; at: string } | undefined;
  for (const r of rows) if (r?.selfMark && (!best || r.selfMark.at > best.at)) best = r.selfMark;
  return best;
}

/**
 * The level of a word: the learner's own mark when they made one; else the highest level any of its rows supports (its
 * lemma row and its form row are both consulted); else `new`.
 */
export function levelOfRows(rows: Array<KnowledgeView | undefined>): ActiveLevel {
  const mark = selfMarkOfRows(rows);
  if (mark) {
    // the engine already weighed the mark against the evidence dated after it (including "new is released by any later meeting"): its level for the row(s) carrying that mark stands
    let engine: ActiveLevel | undefined;
    for (const r of rows) {
      if (!r || r.selfMark?.at !== mark.at || !r.level || !(KNOWLEDGE_LEVELS as readonly string[]).includes(r.level)) continue;
      if (!engine || KNOWLEDGE_LEVEL_RANK[r.level] > KNOWLEDGE_LEVEL_RANK[engine]) engine = r.level;
    }
    if (engine) return engine;
    const marked = levelOfMark(mark.mark);
    // no engine level: the same rule on the row's own dates. A mark of "new" says not met; anything observed after it (a click that looked the word up) makes it seen.
    if (marked === 'new' && rows.some((r) => !!r?.lastSeenAt && Date.parse(r.lastSeenAt) > Date.parse(mark.at))) return 'seen';
    return marked;
  }
  let best: ActiveLevel = 'new';
  for (const r of rows) {
    const l = levelOfRow(r);
    if (l && KNOWLEDGE_LEVEL_RANK[l] > KNOWLEDGE_LEVEL_RANK[best]) best = l;
  }
  return best;
}

/**
 * How many times the learner has met a word: the sum of the observations over all dimensions of a row, and the larger of the
 * lemma row's and the form row's (the two rows describe the same meetings, so they are not added). A row that carries the
 * engine's own `encounters` is read as it stands.
 */
export function encountersOfRows(rows: Array<KnowledgeView | undefined>): number {
  let best = 0;
  for (const r of rows) {
    if (!r) continue;
    const n = typeof r.encounters === 'number' && r.encounters >= 0 ? r.encounters : Object.values(r.dimensions).reduce((sum, d) => sum + (d?.observations ?? 0), 0);
    if (n > best) best = n;
  }
  return best;
}
