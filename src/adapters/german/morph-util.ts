/**
 * Small shared helpers of the German word-form engine (package GA): cell ordering, the spelling rules that decide
 * where a verb takes an inserted -e-, and the shape of a generated form.
 */
import type { DeCell } from './types';

/** One generated written form. `older` marks a form of an older stage of the language (werden: ward). */
export interface Form { form: string; older?: boolean }

export const CASE_ORDER = ['N', 'A', 'D', 'G'] as const;
const GENDER_ORDER = ['m', 'f', 'n', 'p'] as const;
const DECL_ORDER = ['st', 'wk', 'mx'] as const;

/** Cells in the fixed order: declension (none first), case N A D G, then gender m f n plural. */
export function sortCells(cells: readonly DeCell[]): DeCell[] {
  const rank = (c: DeCell): number =>
    (c.decl ? DECL_ORDER.indexOf(c.decl) + 1 : 0) * 100 + CASE_ORDER.indexOf(c.c) * 10 + GENDER_ORDER.indexOf(c.g);
  return [...cells].sort((a, b) => rank(a) - rank(b));
}

/** Add cells to a form-keyed map, merging forms that are spelled the same. */
export function addCells(map: Map<string, DeCell[]>, form: string, cells: readonly DeCell[]): void {
  const list = map.get(form) ?? [];
  for (const c of cells) {
    if (!list.some((x) => x.c === c.c && x.g === c.g && x.decl === c.decl)) list.push(c);
  }
  map.set(form, list);
}

/**
 * A verb stem that takes an inserted -e- before -st / -t / -te: stems in -d or -t (arbeitest, findet), and stems in a
 * consonant plus m or n (atmet, öffnet, zeichnet) except after l, r, m, n or a silent h (filmst, lernt, kommt, wohnt).
 */
export function needsEInsertion(stem: string): boolean {
  return /[dt]$/.test(stem) || /(?:[bdfgkpqtvwxzß]|ch)[mn]$/.test(stem);
}

/** A stem in s, ß, z or x: the du ending -st merges into -t (du reist, du heißt, du tanzt, du mixt). */
export function isSibilant(stem: string): boolean {
  return /[sßzx]$/.test(stem);
}

/** First letter upper-case (German nouns, the first word of a sentence). */
export function isCapitalised(word: string): boolean {
  const first = word.charAt(0);
  return first !== '' && first !== first.toLowerCase();
}

export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Forms from plain strings. */
export function forms(...list: string[]): Form[] {
  return list.map((form) => ({ form }));
}
