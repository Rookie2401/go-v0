/**
 * The varieties of Albanian the adapter can label. The course's active target is Standard Albanian; Gheg, Arbëresh,
 * Arvanitika and older spellings are recognised and labelled, never suppressed and never mixed into it. Package Q4.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */
import type { Variety } from '../../core';

export const SQ_VARIETIES: Record<string, Variety> = {};

/** A dictionary's own region and usage labels ("Gheg", "Tosk", "Kosovo", "Arbëresh", "archaic") → variety codes above. */
export function sqVarietiesFromTags(_tags: readonly string[]): string[] {
  return [];
}
