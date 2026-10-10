/**
 * GoLearn Active: how well the learner knows a word on the page, read from the learner model's rows for its unit ids
 * (lemma and form), as one of five levels. The thresholds live here and nowhere else; the popup's legend and the
 * underline styles name the same five levels.
 *
 * Since 2026-10-10 every word gets a level: a word with no row at all, or no encounter, is `new` (the owner wants the
 * unknown words visible too), and the learner's own mark on a word ("New to me", "I recognise it", "I can use it";
 * the newest mark among the word's rows) decides the level outright, until they mark it again. Nothing here decides a
 * status in the Repository: the levels are a reading of the projection for the underline only, the same rows the
 * card's history line shows.
 */
import type { KnowledgeView, SelfMark } from '../protocol';

export type ActiveLevel = 'new' | 'met' | 'assisted' | 'known' | 'produced';

/** From the least to the most established. */
export const ACTIVE_LEVELS: readonly ActiveLevel[] = ['new', 'met', 'assisted', 'known', 'produced'];

/** The thresholds (docs/ecosystem/GOLEARN-ACTIVE-DESIGN.md §3). */
export const LEVEL_RULES = {
  /** Reading recognition estimate at least this, with at least this many observations. */
  known: { minScore: 0.6, minObservations: 2 },
  /** Productive retrieval or contextual production estimate at least this, with at least one observation. */
  produced: { minScore: 0.6, minObservations: 1 },
} as const;

/** The legend the popup shows, one line per level, in the order of ACTIVE_LEVELS. */
export const LEVEL_LEGEND: Record<ActiveLevel, { title: string; detail: string; style: string }> = {
  new: { title: 'New', detail: 'you have not met it yet, or you marked it as new to you', style: 'dashed' },
  met: { title: 'Met', detail: 'you have looked it up, but nothing shows you understood it', style: 'dotted, faint' },
  assisted: { title: 'Understood with help', detail: 'you read it with the card open', style: 'dotted' },
  known: { title: 'Recognised', detail: `your reading estimate is at least ${LEVEL_RULES.known.minScore} over ${LEVEL_RULES.known.minObservations}+ observations, or you marked it as recognised`, style: 'thin solid, faint' },
  produced: { title: 'Produced', detail: 'you have retrieved or written it yourself, or you marked it as one you can use', style: 'hairline, barely visible' },
};

/** What the learner's own mark means for the underline. */
export const SELF_MARK_LEVEL: Record<SelfMark, ActiveLevel> = { learning: 'new', known: 'known', productive: 'produced' };

const RANK: Record<ActiveLevel, number> = { new: 0, met: 1, assisted: 2, known: 3, produced: 4 };

/** The level one row's evidence supports, or undefined when the row shows no encounter at all (the learner's own mark is not read here). */
export function levelOfRow(row: KnowledgeView | undefined): ActiveLevel | undefined {
  if (!row) return undefined;
  const d = row.dimensions;
  const obs = (k: keyof typeof d): number => d[k]?.observations ?? 0;
  const score = (k: keyof typeof d): number => d[k]?.score ?? 0;
  const produced = (['productiveRetrieval', 'contextualProduction'] as const).some((k) => obs(k) >= LEVEL_RULES.produced.minObservations && score(k) >= LEVEL_RULES.produced.minScore);
  if (produced) return 'produced';
  if (obs('readingRecognition') >= LEVEL_RULES.known.minObservations && score('readingRecognition') >= LEVEL_RULES.known.minScore) return 'known';
  if (obs('assistedRecognition') > 0) return 'assisted';
  if (obs('exposure') > 0 || obs('readingRecognition') > 0) return 'met';
  return undefined;
}

/** The newest of the learner's own marks among a word's rows, if any. */
export function selfMarkOfRows(rows: Array<KnowledgeView | undefined>): { mark: SelfMark; at: string } | undefined {
  let best: { mark: SelfMark; at: string } | undefined;
  for (const r of rows) if (r?.selfMark && (!best || r.selfMark.at > best.at)) best = r.selfMark;
  return best;
}

/**
 * The level of a word: the learner's own mark when they made one; else the highest level any of its rows supports (its
 * lemma row and its form row are both consulted); else `new`.
 */
export function levelOfRows(rows: Array<KnowledgeView | undefined>): ActiveLevel {
  const mark = selfMarkOfRows(rows);
  if (mark) return SELF_MARK_LEVEL[mark.mark];
  let best: ActiveLevel | undefined;
  for (const r of rows) {
    const l = levelOfRow(r);
    if (l && (!best || RANK[l] > RANK[best])) best = l;
  }
  return best ?? 'new';
}
