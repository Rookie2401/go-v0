/**
 * Folding for names. Browser-safe, dependency-free.
 *
 * Only the combining marks of the Latin, Greek and Cyrillic diacritics block (U+0300 to U+036F) are removed, so
 * "Año" matches "ano" but Thai tone marks and Devanagari matras are never touched.
 */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const NOT_WORD = /[^\p{L}\p{M}\p{N}]+/u;

/** The folded words of a title or an author: letters, marks and digits; everything else separates. */
export const wordsOf = (s: string): string[] => fold(s).split(NOT_WORD).filter((w) => w.length > 0);

/** The index bucket of a word or of the start of a query term: its first three characters (fewer for a short word). */
export const PREFIX_LENGTH = 3;
export const prefixOf = (word: string): string => [...word].slice(0, PREFIX_LENGTH).join('');

/** Round a share to four decimals so built files are small and stable. */
export const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** Code-unit order: the same on every machine, unlike localeCompare. */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
