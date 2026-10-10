/**
 * GoLearn Active: how well the learner knows a word on the page, read from the learner model's rows for its unit ids
 * (lemma and form), as one of four levels. The thresholds live here and nowhere else; the popup's legend and the
 * underline styles name the same four levels. A word with no row at all gets no level and no mark.
 *
 * Nothing here decides a status: the levels are a reading of the projection's estimates for the underline only,
 * the same rows the card's history line shows.
 */
import type { KnowledgeView } from '../protocol';

export type ActiveLevel = 'met' | 'assisted' | 'known' | 'produced';

/** From the faintest to the most established. */
export const ACTIVE_LEVELS: readonly ActiveLevel[] = ['met', 'assisted', 'known', 'produced'];

/** The thresholds (docs/ecosystem/GOLEARN-ACTIVE-DESIGN.md §3). */
export const LEVEL_RULES = {
  /** Reading recognition estimate at least this, with at least this many observations. */
  known: { minScore: 0.6, minObservations: 2 },
  /** Productive retrieval or contextual production estimate at least this, with at least one observation. */
  produced: { minScore: 0.6, minObservations: 1 },
} as const;

/** The legend the popup shows, one line per level, in the order of ACTIVE_LEVELS. */
export const LEVEL_LEGEND: Record<ActiveLevel, { title: string; detail: string; style: string }> = {
  met: { title: 'Met', detail: 'you have looked it up, but nothing shows you understood it', style: 'dotted, faint' },
  assisted: { title: 'Understood with help', detail: 'you read it with the card open', style: 'dotted' },
  known: { title: 'Recognised', detail: `your reading estimate is at least ${LEVEL_RULES.known.minScore} over ${LEVEL_RULES.known.minObservations}+ observations`, style: 'thin solid, faint' },
  produced: { title: 'Produced', detail: 'you have retrieved or written it yourself', style: 'hairline, barely visible' },
};

const RANK: Record<ActiveLevel, number> = { met: 1, assisted: 2, known: 3, produced: 4 };

/** The level one row supports, or undefined when the row shows no encounter at all. */
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

/** The highest level any of a word's rows supports (its lemma row and its form row are both consulted). */
export function levelOfRows(rows: Array<KnowledgeView | undefined>): ActiveLevel | undefined {
  let best: ActiveLevel | undefined;
  for (const r of rows) {
    const l = levelOfRow(r);
    if (l && (!best || RANK[l] > RANK[best])) best = l;
  }
  return best;
}
