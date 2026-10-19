/**
 * Greek text: the identities, the tokenizer and the sentence splitter, shared by the adapter and the build scripts (scripts/el-*.mts).
 *
 * Three views of one written word:
 *   printed    exactly as the text has it (polytonic or monotonic, with any final punctuation already split off by the tokenizer)
 *   key        the identity of a form: NFC, lower-cased, with the polytonic marks KEPT (ἦν and ἤν are two forms; λόγος and λογός
 *              two cells) but normalised: the two Unicode spellings of the acute (U+0301 / U+0384 forms vs U+1FFD / U+0344)
 *              folded by NFC, a grave accent folded to the acute (a grave is the acute of a word followed by another word),
 *              the final sigma kept.
 *   bare       every diacritic removed (breathings, accents, iota subscript, diaeresis, macron/breve), final sigma kept: the bridge
 *              between monotonic and polytonic spellings of the same letters, and the key an uncertain lookup falls back to.
 */
import type { RawToken, Span } from '../../core';
import { makeWordTokenizer } from '../shared';

/** Polytonic marks that monotonic Greek does not write: breathings, iota subscript, grave, circumflex (as combining marks after NFD). */
const POLYTONIC_ONLY = /[̓̔͂̀̄̆ͅ]/g;
/** Every combining mark used by Greek (after NFD): accents, breathings, diaeresis, iota subscript, macron, breve. */
const ALL_MARKS = /[̀-ͯ]/g;
export const GREEK_LETTER = /[Ͱ-Ͽἀ-῿]/u;

/** NFC, lower case, grave → acute; polytonic marks kept; the macron and breve a dictionary writes for vowel length (ῡ, ῐ) removed, since no text has them. */
export function elKey(surface: string): string {
  return surface.normalize('NFD').replace(/̀/g, '́').replace(/[̄̆]/g, '').normalize('NFC').toLowerCase().replace(/;$/, '');
}
/** Letters only (final sigma kept), lower case. */
export function bare(surface: string): string {
  return surface.normalize('NFD').replace(ALL_MARKS, '').normalize('NFC').toLowerCase();
}
/** Monotonic rendering of a polytonic form: breathings, iota subscript, grave and circumflex dropped, circumflex → acute. */
export function toMonotonic(surface: string): string {
  return surface.normalize('NFD').replace(/͂/g, '́').replace(/̀/g, '́').replace(POLYTONIC_ONLY, '').normalize('NFC');
}
/** True when the form carries a polytonic mark (breathing, circumflex, grave, iota subscript): it is ancient or learned spelling. */
export function isPolytonic(surface: string): boolean {
  return /[̓̔͂̀ͅ]/.test(surface.normalize('NFD'));
}
/** True when the form has an accent at all (a monotonic text accents every polysyllable; an all-caps or unaccented text does not). */
export function hasAccent(surface: string): boolean {
  return /[́͂̀]/.test(surface.normalize('NFD'));
}

export const elNormalize = elKey;
/** Forgiving search: no diacritics, final sigma folded to sigma. */
export const elSearchNormalize = (s: string): string => bare(s).replace(/ς/g, 'σ');

/**
 * Tokens: Intl.Segmenter('el') keeps an accented word whole; an elided word's apostrophe (δ᾽, ἔσθ᾽) and the ano teleia (·) become
 * non-word tokens; the Greek question mark (;) is punctuation.
 */
export const elTokenize: (text: string) => RawToken[] = makeWordTokenizer({ locale: 'el', normalize: elNormalize });

/** Sentences end at . ; (the Greek question mark) ! … and the ano teleia is NOT a sentence end; a line break always ends one. */
export function elSegmentSentences(text: string): Span[] {
  const spans: Span[] = [];
  const push = (a: number, b: number) => {
    while (a < b && /\s/u.test(text[a])) a++;
    while (b > a && /\s/u.test(text[b - 1])) b--;
    if (b > a) spans.push({ start: a, end: b, text: text.slice(a, b) });
  };
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') { push(start, i); start = i + 1; continue; }
    if (ch === '.' || ch === ';' || ch === ';' || ch === '!' || ch === '?' || ch === '…') {
      let j = i + 1;
      while (j < text.length && /[.;;!?…"'”’»)\]]/u.test(text[j])) j++;
      if (ch === '.' && j < text.length && /[\p{L}\p{N}]/u.test(text[j])) continue; // 3.5, an abbreviation
      // a verse or chapter number follows without a space in some editions; still a break
      push(start, j);
      start = j;
      i = j - 1;
    }
  }
  push(start, text.length);
  return spans;
}
