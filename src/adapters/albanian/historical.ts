/**
 * Older spellings related to today's (pre-1972 spelling habits; the alphabets before 1908 are a matter of the
 * edition, recorded on the work, not of single words). The text is never changed. Package Q4.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */
import type { SqCorrespondence } from './gheg';

/** Today's spelling of an older written form, restricted to forms `known` accepts. May be empty. */
export function historicalToModern(_form: string, _known: (form: string) => boolean): SqCorrespondence[] {
  return [];
}
