/**
 * Letters and spelling: the identity of a written form, the Albanian letters and digraphs a beginner must learn to
 * see (ë ç dh gj ll nj rr sh th xh zh), and reading a text typed without ë and ç. Package Q4.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */

/** NFC, lower case, typographic apostrophe folded to ' — ë and ç are kept (they distinguish words). */
export function sqNormalize(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase('sq').replace(/[\u2019\u02BC\u2018]/g, "'");
}

/** Forgiving search: people type without ë and ç. */
export function sqSearchNormalize(q: string): string {
  return sqNormalize(q).replace(/ë/g, 'e').replace(/ç/g, 'c').trim();
}

/** One letter or digraph of the Albanian alphabet as Stage 0 teaches it. */
export interface SqLetter { letter: string; ipa: string; hint: string; example: string; exampleGloss: string }
export const SQ_LETTERS: SqLetter[] = [];

/** The letters of a word in alphabet order units: "xhaxha" → ['xh', 'a', 'xh', 'a'] (digraphs are single letters). */
export function sqLetters(_word: string): string[] {
  return [];
}

/**
 * A form typed without diacritics ("eshte", "cfare") → the properly spelled forms it could be ("është", "çfarë"),
 * restricted to forms `known` accepts. Never returns the input itself; empty when nothing known fits.
 */
export function restoreDiacritics(_form: string, _known: (form: string) => boolean): string[] {
  return [];
}
