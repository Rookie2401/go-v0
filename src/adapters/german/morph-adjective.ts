/**
 * Adjective endings and comparison. The three declension tables are the heart of German; every cell is spelled out
 * here and nowhere else (nouns that decline like adjectives and participles used as adjectives share them).
 */
import type { DeAdjective, DeCase, DeCell } from './types';
import { addCells, sortCells } from './morph-util';

type Decl = 'st' | 'wk' | 'mx';
type Slot = 'm' | 'f' | 'n' | 'p';

/** Endings by declension, gender slot and case. strong = no article, weak = after der / dieser / jeder, mixed = after ein / kein / mein. */
export const ENDINGS: Record<Decl, Record<Slot, Record<DeCase, string>>> = {
  st: {
    m: { N: 'er', A: 'en', D: 'em', G: 'en' },
    f: { N: 'e', A: 'e', D: 'er', G: 'er' },
    n: { N: 'es', A: 'es', D: 'em', G: 'en' },
    p: { N: 'e', A: 'e', D: 'en', G: 'er' },
  },
  wk: {
    m: { N: 'e', A: 'en', D: 'en', G: 'en' },
    f: { N: 'e', A: 'e', D: 'en', G: 'en' },
    n: { N: 'e', A: 'e', D: 'en', G: 'en' },
    p: { N: 'en', A: 'en', D: 'en', G: 'en' },
  },
  mx: {
    m: { N: 'er', A: 'en', D: 'en', G: 'en' },
    f: { N: 'e', A: 'e', D: 'en', G: 'en' },
    n: { N: 'es', A: 'es', D: 'en', G: 'en' },
    p: { N: 'en', A: 'en', D: 'en', G: 'en' },
  },
};

export const ENDING_LIST = ['e', 'er', 'es', 'en', 'em'] as const;
const DECLS: Decl[] = ['st', 'wk', 'mx'];
const SLOTS: Slot[] = ['m', 'f', 'n', 'p'];
const CASES: DeCase[] = ['N', 'A', 'D', 'G'];

/** Every cell an ending fills, over all three declensions. */
const CELLS_BY_ENDING = new Map<string, DeCell[]>();
for (const decl of DECLS) {
  for (const g of SLOTS) {
    for (const c of CASES) {
      const e = ENDINGS[decl][g][c];
      const list = CELLS_BY_ENDING.get(e) ?? [];
      list.push({ c, g, decl });
      CELLS_BY_ENDING.set(e, list);
    }
  }
}
for (const [e, cells] of CELLS_BY_ENDING) CELLS_BY_ENDING.set(e, sortCells(cells));

export function endingCells(ending: string): DeCell[] {
  return (CELLS_BY_ENDING.get(ending) ?? []).map((c) => ({ ...c }));
}

/** Every cell of every declension: what an indeclinable adjective (rosa, lila) fills. */
export function allAdjectiveCells(): DeCell[] {
  return sortCells(DECLS.flatMap((decl) => SLOTS.flatMap((g) => CASES.map((c) => ({ c, g, decl })))));
}

/** The stem endings attach to: dunkel → dunkl-, teuer → teur-, müde → müd-; anything else as written. */
function defaultStem(lemma: string): string {
  if (lemma.endsWith('e')) return lemma.slice(0, -1);
  if (/el$/.test(lemma)) return `${lemma.slice(0, -2)}l`;
  if (/(?:eu|au)er$/.test(lemma)) return `${lemma.slice(0, -2)}r`;
  return lemma;
}

export function adjectiveStem(adj: DeAdjective): string {
  return adj.stem ?? defaultStem(adj.lemma);
}

/** The comparative as a whole form (besser, älter, teurer, dunkler, kleiner). */
export function comparativeOf(adj: DeAdjective): string {
  return adj.comparative ?? `${adjectiveStem(adj)}er`;
}

/** The superlative stem without am and without an ending (best, ältest, teuerst, dunkelst, kleinst, frischest). */
export function superlativeOf(adj: DeAdjective): string {
  if (adj.superlative) return adj.superlative;
  const l = adj.lemma;
  if (l.endsWith('e')) return `${l}st`;
  // -est after d t s ß z x and sch (frischest); an unstressed suffix -isch takes plain -st (komischst)
  if (/[dtsßzx]$/.test(l) || /eu$/.test(l) || (/sch$/.test(l) && !/..[a-zäöü]+isch$/.test(l))) return `${l}est`;
  return `${l}st`;
}

export interface AdjectiveForms {
  /** The form with no ending (predicative / adverbial): gut, besser. Absent for the superlative, which has no such word. */
  uninflected?: string;
  forms: Array<{ form: string; cells: DeCell[] }>;
}

/** Forms of one degree with their cells; the uninflected form kept apart. */
export function adjectiveForms(adj: DeAdjective, degree: 'pos' | 'cmp' | 'sup'): AdjectiveForms {
  if (adj.indeclinable) {
    return degree === 'pos' ? { forms: [{ form: adj.lemma, cells: allAdjectiveCells() }] } : { forms: [] };
  }
  const stem = degree === 'pos' ? adjectiveStem(adj) : degree === 'cmp' ? comparativeOf(adj) : superlativeOf(adj);
  const uninflected = degree === 'pos' ? adj.lemma : degree === 'cmp' ? stem : undefined;
  const forms = ENDING_LIST.map((e) => ({ form: `${stem}${e}`, cells: endingCells(e) }));
  return { uninflected, forms };
}

/** Forms of a word that takes the adjective endings on a given stem (a participle, a noun like Deutsche). */
export function formsOnStem(stem: string): Array<{ form: string; cells: DeCell[] }> {
  return ENDING_LIST.map((e) => ({ form: `${stem}${e}`, cells: endingCells(e) }));
}

/** Every inflected form of an adjective in one degree, with the cells (and declensions) it fills. */
export function declineAdjectiveForms(adj: DeAdjective, degree: 'pos' | 'cmp' | 'sup' = 'pos'): Array<{ form: string; cells: DeCell[] }> {
  const { uninflected, forms } = adjectiveForms(adj, degree);
  const merged = new Map<string, DeCell[]>();
  if (uninflected !== undefined) merged.set(uninflected, []);
  for (const f of forms) addCells(merged, f.form, f.cells);
  return [...merged].map(([form, cells]) => ({ form, cells: sortCells(cells) }));
}
