/**
 * The cells of the dictionary's inflection table that a selected Russian reading occupies.
 *
 * The Russian adapter generates no paradigm of its own: the dictionary's table (Wiktionary's, 60,000 lexemes with every cell and its
 * stress) stands alone. But the table writes its forms WITH stress marks (кни́гу) and a text writes them without, so the shared
 * fallback that matches the written form (core/paradigm.ts `cellsWithForm`: NFC + lower case) would never find the selection.
 * Here the features decide first, and the form is compared through the Russian key (stress marks removed).
 */
import { cellsForSelection, type Paradigm, type ParadigmCell } from '../../core/paradigm';
import { ruKey } from './text';

const sameForm = (cell: ParadigmCell, key: string): boolean => ruKey(cell.form) === key || (cell.alternatives ?? []).some((a) => ruKey(a) === key);

export function ruCellsFor(paradigm: Pick<Paradigm, 'cells' | 'kind' | 'pos'>, features: Record<string, string>, surface?: string): ParadigmCell[] {
  // the features of the reading name the cells; of those, the ones that really spell the selection are the answer
  const byFeatures = cellsForSelection(paradigm, features);
  if (!surface) return byFeatures;
  const key = ruKey(surface);
  const exact = byFeatures.filter((c) => sameForm(c, key));
  if (exact.length) return exact;
  // the reading's features name no cell with this spelling (a union the table splits differently, a key the cells lack): the cells
  // that spell the selection are still true of it
  const byForm = paradigm.cells.filter((c) => sameForm(c, key));
  return byForm.length ? byForm : byFeatures;
}
