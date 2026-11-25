/**
 * Reading Analysis: the arithmetic. Known coverage = Known and Automatic occurrences / all eligible occurrences.
 *
 * Counted by OCCURRENCE, not by dictionary entry: a word the learner knows that the text uses 150 times is 150 of the total. Whole numbers
 * are kept throughout and the percentage is rounded only where it is shown (`formatPercent`). Pure: no document, no Repository.
 */
import type { KnowledgeLevel } from '../../../repository-contract/src/knowledge-levels';
import type { Coverage, CoverageCounts, WireVerdict } from './protocol';

/** One distinct word of the text and how often the text uses it. */
export interface CountedVerdict { occurrences: number; verdict: WireVerdict }

export const emptyCounts = (): CoverageCounts => ({ total: 0, known: 0, automatic: 0, familiar: 0, recognized: 0, seen: 0, new: 0, unsettled: 0, ambiguous: 0, unidentified: 0 });

const BELOW: readonly KnowledgeLevel[] = ['new', 'seen', 'recognized', 'familiar'];

/** Where one word's occurrences are counted. Exactly one bucket for every verdict the protocol allows; anything else throws (a damaged answer must not be counted as something). */
export function bucketOf([verdict, level]: WireVerdict): Exclude<keyof CoverageCounts, 'total'> {
  switch (verdict) {
    case 'known':
      if (level === 'known' || level === 'automatic') return level;
      throw new RangeError(`a word called known at level ${String(level)}`);
    case 'below':
      if (BELOW.includes(level)) return level as 'new' | 'seen' | 'recognized' | 'familiar';
      throw new RangeError(`a word called below Known at level ${String(level)}`);
    case 'unsettled': return 'unsettled';
    case 'ambiguous': return 'ambiguous';
    case 'unidentified': return 'unidentified';
    default: throw new RangeError(`unknown verdict ${String(verdict)}`);
  }
}

export function coverageOf(words: Iterable<CountedVerdict>): Coverage {
  const counts = emptyCounts();
  let distinctWords = 0;
  for (const w of words) {
    if (!Number.isInteger(w.occurrences) || w.occurrences <= 0) throw new RangeError('a word with no whole, positive number of occurrences');
    counts[bucketOf(w.verdict)] += w.occurrences;
    counts.total += w.occurrences;
    distinctWords += 1;
  }
  const knownOccurrences = counts.known + counts.automatic;
  const undecided = counts.unsettled + counts.ambiguous + counts.unidentified;
  const percent = (n: number): number | null => (counts.total > 0 ? (n / counts.total) * 100 : null);
  return { counts, knownOccurrences, knownPercent: percent(knownOccurrences), upperPercent: percent(knownOccurrences + undecided), exact: undecided === 0, distinctWords };
}

/**
 * The percentage as it is shown: one decimal, rounded half up on the exact fraction (8,760 of 10,000 is 87.6; 1 of 3 is 33.3). Worked in
 * whole numbers so that a binary fraction cannot round 85.05 down. A figure that is not 100 is never shown as 100.0, nor one above 0 as 0.0.
 */
export function formatPercent(part: number, total: number): string {
  if (!(total > 0)) return '–';
  const tenths = Math.floor((part * 2000 + total) / (2 * total)); // round(part / total * 1000), half up, in integers
  const clamped = part < total && tenths >= 1000 ? 999 : part > 0 && tenths === 0 ? 1 : tenths;
  return `${Math.floor(clamped / 10)}.${clamped % 10}%`;
}
