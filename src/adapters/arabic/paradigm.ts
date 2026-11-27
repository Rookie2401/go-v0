/**
 * The cells of the dictionary's inflection table that a selected Arabic reading occupies.
 *
 * The Arabic adapter generates no paradigm of its own: the dictionary's table (Wiktionary's declensions and conjugations) stands alone.
 * But the table writes its forms WITH vowels (الْكِتَابُ) and a text usually writes them without, so the shared fallback that matches the
 * written form (core/paradigm.ts `cellsWithForm`: NFC + lower case) would never find the selection. Here the features decide first, and
 * the form is compared through the Arabic key (marks removed). A reading with a clitic (بالكتاب) names its cells by its features alone.
 */
import { cellsForSelection, type Paradigm, type ParadigmCell } from '../../core/paradigm';
import { arKey } from './text';

const sameForm = (cell: ParadigmCell, key: string): boolean => arKey(cell.form) === key || (cell.alternatives ?? []).some((a) => arKey(a) === key);

export function arCellsFor(paradigm: Pick<Paradigm, 'cells' | 'kind' | 'pos'>, features: Record<string, string>, surface?: string): ParadigmCell[] {
  const byFeatures = cellsForSelection(paradigm, features);
  if (!surface) return byFeatures;
  const key = arKey(surface);
  const exact = byFeatures.filter((c) => sameForm(c, key));
  if (exact.length) return exact;
  const byForm = paradigm.cells.filter((c) => sameForm(c, key));
  return byForm.length ? byForm : byFeatures;
}
