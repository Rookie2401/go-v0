/**
 * Hebrew text: the marks, the normalisations, the tokenizer and the sentence splitter. Shared by the adapter at run time and
 * by the build scripts (scripts/he-*.mts), so a form is keyed the same way in the generated index and at lookup.
 *
 * Three views of one written word:
 *   printed      exactly as the text has it (consonants, vowel points, dagesh, shin/sin dots, cantillation, meteg, maqaf …)
 *   pointed      the identity used for Biblical forms: NFC, cantillation / meteg / rafe / paseq / CGJ removed, qamats qatan and
 *                holam haser for vav folded to their ordinary vowels. Vowels and dagesh are kept: they distinguish forms.
 *   consonantal  every mark removed: the identity Modern Hebrew is written in, and the bridge from an unpointed query to the
 *                pointed Biblical forms it could be.
 * Final letters (ך ם ן ף ץ) are kept in all three: they are part of the spelling. `searchNormalize` folds them for a search box.
 */
import type { RawToken, Span } from '../../core';
import { makeWordTokenizer } from '../shared';

/** Cantillation accents U+0591–U+05AF. */
export const CANTILLATION = /[֑-֯]/g;
/** Everything removed from `printed` to reach `pointed`: accents, meteg, rafe, paseq, upper/lower dots, combining grapheme joiner. */
const NOT_POINTING = /[֑-ֽֿ֯׀ׅׄ͏]/g;
/** Every combining mark of the Hebrew block plus CGJ: removed to reach `consonantal`. */
const ALL_MARKS = /[֑-ֽֿ-ׂׄ-ׇ͏]/g;
/** Hebrew letters. */
export const HEBREW_LETTER = /[א-ת]/u;
const HEBREW_LETTERS_G = /[א-ת]/gu;

export const MAQAF = '־';
export const SOF_PASUQ = '׃';
export const PASEQ = '׀';

/** The pointed identity of a written form (see the file comment). */
export function pointed(surface: string): string {
  return surface.normalize('NFC').replace(NOT_POINTING, '').replace(/ׇ/g, 'ָ').replace(/ֺ/g, 'ֹ').replace(/[־׃]/g, '');
}

/** The consonantal skeleton: letters only (no marks, no maqaf, no sof pasuq). */
export function consonantal(surface: string): string {
  return surface.normalize('NFC').replace(ALL_MARKS, '').replace(/[־׃]/g, '');
}

/** True when the form carries any vowel point or dagesh (it is written pointed). */
export function isPointed(surface: string): boolean {
  return /[ְ-ׇּׁׂ]/.test(surface.normalize('NFC'));
}
/** True when the form carries a cantillation accent: it comes from a Masoretic text. */
export function hasCantillation(surface: string): boolean {
  return /[֑-֯]/.test(surface);
}

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
/** Final letters folded to their ordinary forms (a search box; never an identity). */
export function foldFinals(s: string): string {
  return s.replace(/[ךםןףץ]/g, (c) => FINALS[c]);
}

/**
 * The adapter's token identity: NFC, pointed view. Two words that differ only in accents or meteg are one form; two that differ in a
 * vowel are two. An unpointed Modern word is its own consonantal spelling.
 */
export const heNormalize = (s: string): string => pointed(s);
/** Forgiving search: no marks at all, finals folded. */
export const heSearchNormalize = (s: string): string => foldFinals(consonantal(s));

/** Letters of a form, in order (for cutting a pointed word at morpheme boundaries). */
export function letterCount(s: string): number {
  return (s.match(HEBREW_LETTERS_G) ?? []).length;
}

/**
 * Cut a pointed (or printed) word into pieces carrying the given numbers of letters, each mark staying with the letter it follows:
 * splitByLetters('בְּרֵאשִׁית', [1, 5]) → ['בְּ', 'רֵאשִׁית']. Null when the counts do not add up to the word's letters.
 */
export function splitByLetters(word: string, counts: number[]): string[] | null {
  const out: string[] = [];
  let i = 0;
  for (const n of counts) {
    let letters = 0;
    let piece = '';
    while (i < word.length && (letters < n || !HEBREW_LETTER.test(word[i]))) {
      if (HEBREW_LETTER.test(word[i])) {
        if (letters === n) break;
        letters++;
      }
      piece += word[i];
      i++;
    }
    if (letters !== n) return null;
    out.push(piece);
  }
  if (i !== word.length) return null;
  return out;
}

/**
 * Tokens: Intl.Segmenter('he') keeps a pointed and accented word whole and cuts at the maqaf, which becomes its own non-word
 * token (the two words a maqaf joins are two words of the morphology, as in the Open Scriptures alignment). Sof pasuq, paseq
 * and ordinary punctuation are non-word tokens. The apostrophe-like geresh/gershayim inside an abbreviation stay in the token.
 */
export const heTokenize: (text: string) => RawToken[] = makeWordTokenizer({ locale: 'he', normalize: heNormalize });

/**
 * Sentences: a Masoretic verse ends at sof pasuq (׃); Modern prose at . ! ? … ; a line break always ends a sentence. A verse
 * number or chapter mark on its own line is its own span (the caller drops it or reads it as scripture). Spans slice the input.
 */
export function heSegmentSentences(text: string): Span[] {
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
    if (ch === SOF_PASUQ || ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      let j = i + 1;
      while (j < text.length && /[.!?…׃"'”’)\]]/u.test(text[j])) j++;
      // a full stop inside a number or an abbreviation (י"ד., 3.5) does not end a sentence
      if (ch === '.' && j < text.length && /[\p{L}\p{N}]/u.test(text[j])) continue;
      push(start, j);
      start = j;
      i = j - 1;
    }
  }
  push(start, text.length);
  return spans;
}
