/**
 * Sentence boundaries in Albanian prose: abbreviations (p.sh., etj., Dr., Prof., z., znj.), dialogue dashes, quotation
 * marks, ellipses. Package Q4.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */
import type { Span } from '../../core';
import { splitSentences } from '../shared';

export function segmentSqSentences(text: string): Span[] {
  return splitSentences(text, { terminators: '.!?…', abbreviations: ['dr', 'p', 'sh', 'etj', 'z', 'znj', 'prof'] });
}
