/**
 * Korean text: the tokenizer and the sentence splitter. Offsets always index the ORIGINAL text; `normalized` is `koKey(surface)`.
 *
 * Token rule: a maximal run of Hangul (syllables or jamo of any block) and Hanja is ONE word token (so 學校에서 is one token and a
 * word written in conjoining jamo stays whole; an invisible character (soft hyphen, zero-width space or joiner, word joiner, BOM)
 * between two letters of the run stays inside it, and at a token's edge it is skipped like whitespace); digits are their own token (an inner . or , between digits stays inside:
 * 3.14, 1,000); Latin letters, with an inner apostrophe or hyphen, are their own token (KBS가 is KBS + 가); each punctuation or
 * symbol character is its own non-word token; whitespace is never a token.
 */
import type { RawToken, Span } from '../../core';
import { isHangul, isHanja, isInvisible, koKey } from './hangul';

const LATIN = /^\p{Script=Latin}$/u;
const DIGIT = /^\p{Nd}$/u;
const LETTER = /^\p{L}$/u;
const MARK = /^\p{M}$/u;
const SPACE = /^\s$/u;
const APOSTROPHES = new Set(["'", '’']);
const HYPHENS = new Set(['-', '‐', '‑']);

const cpAt = (text: string, i: number): string => String.fromCodePoint(text.codePointAt(i)!);
const isKoreanWordChar = (ch: string): boolean => isHangul(ch) || isHanja(ch);

export const koNormalizeSurface = (surface: string): string => koKey(surface);

export function koTokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  const push = (start: number, end: number, isWord: boolean) => {
    const surface = text.slice(start, end);
    out.push({ surface, start, end, isWord, normalized: koKey(surface) });
  };
  let i = 0;
  while (i < text.length) {
    const ch = cpAt(text, i);
    if (SPACE.test(ch) || isInvisible(ch)) { i += ch.length; continue; }
    const start = i;
    if (isKoreanWordChar(ch)) {
      i += ch.length;
      while (i < text.length) {
        const c = cpAt(text, i);
        if (isInvisible(c)) {
          // inside a word (a Hangul or Hanja letter follows the run of invisibles): it stays in the token; at the edge it is left to be skipped
          let j = i;
          while (j < text.length && isInvisible(cpAt(text, j))) j += 1;
          if (j < text.length && isKoreanWordChar(cpAt(text, j))) { i = j; continue; }
          break;
        }
        if (!isKoreanWordChar(c) && !(MARK.test(c) && !LATIN.test(c))) break;
        i += c.length;
      }
      push(start, i, true);
    } else if (DIGIT.test(ch)) {
      i += ch.length;
      while (i < text.length) {
        const c = cpAt(text, i);
        if (DIGIT.test(c)) { i += c.length; continue; }
        if ((c === '.' || c === ',') && i + 1 < text.length && DIGIT.test(cpAt(text, i + 1))) { i += 1; continue; }
        break;
      }
      push(start, i, false);
    } else if (LATIN.test(ch)) {
      i += ch.length;
      while (i < text.length) {
        const c = cpAt(text, i);
        if (LATIN.test(c) || MARK.test(c)) { i += c.length; continue; }
        if ((APOSTROPHES.has(c) || HYPHENS.has(c)) && i + 1 < text.length && LATIN.test(cpAt(text, i + 1))) { i += 1; continue; }
        break;
      }
      push(start, i, true);
    } else if (LETTER.test(ch)) {
      // a letter of some other script: one word token per run
      i += ch.length;
      while (i < text.length) {
        const c = cpAt(text, i);
        if (!(LETTER.test(c) && !LATIN.test(c) && !isKoreanWordChar(c)) && !MARK.test(c)) break;
        i += c.length;
      }
      push(start, i, true);
    } else {
      i += ch.length;
      push(start, i, false);
    }
  }
  return out;
}

// ───────────────────────────── sentences ─────────────────────────────

const TERMINATORS = new Set(['.', '!', '?', '…', '。', '！', '？', '．']);
/** Terminators that end a sentence even with no space after them. */
const WIDE = new Set(['。', '！', '？', '．']);
const CLOSERS = new Set(['"', "'", '”', '’', '»', '›', ')', ']', '}', '」', '』', '）', '］', '】', '》', '〉', '』', '｣', '”']);
/** Lower-case Latin abbreviations (without the dot) after which a full stop does not end a sentence. */
/** After a number and a full stop, these Hangul words continue a date or time: 2024. 5. 3. 오후 (오전 and 오후 also with a particle). */
export const DATE_WORDS: ReadonlySet<string> = new Set(['오전', '오후', '일', '월', '년', '시']);
export const KO_ABBREVIATIONS = ['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'jr', 'sr', 'no', 'fig', 'inc', 'ltd', 'co', 'corp', 'e.g', 'i.e'];

/** Sentences end at . ! ? … 。 ！ ？ and runs of them, with closing quotes and brackets that follow; a line break ends one too. */
export function koSegmentSentences(text: string): Span[] {
  const spans: Span[] = [];
  const abbr = new Set(KO_ABBREVIATIONS);
  let start = 0;
  const push = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && SPACE.test(text[a])) a++;
    while (b > a && SPACE.test(text[b - 1])) b--;
    if (b > a) spans.push({ start: a, end: b, text: text.slice(a, b) });
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i;
      while (j < text.length && (text[j] === '\n' || text[j] === '\r')) j++;
      push(start, i);
      start = j;
      i = j;
      continue;
    }
    if (!TERMINATORS.has(ch)) { i++; continue; }
    let j = i;
    while (j < text.length && TERMINATORS.has(text[j])) j++;
    const run = text.slice(i, j);
    let k = j;
    while (k < text.length && CLOSERS.has(text[k])) k++;
    const atEnd = k >= text.length;
    const spaced = atEnd || SPACE.test(text[k]);
    let isBreak = spaced || [...run].some((c) => WIDE.has(c));
    if (isBreak && run === '.' && !atEnd) {
      const before = text.slice(start, i);
      const word = /([\p{L}\p{N}.]+)$/u.exec(before)?.[1]?.toLowerCase() ?? '';
      if (abbr.has(word)) isBreak = false;
      else if (/\p{Script=Latin}\.\p{Script=Latin}$/u.test(before)) isBreak = false; // U.S. A.
      else if (/\d$/.test(before)) {
        // a date or an outline number: "2024. 5. 3. 오후", "1. 서론" (the next thing is a digit)
        let n = k;
        while (n < text.length && SPACE.test(text[n])) n++;
        if (n < text.length && /\d/.test(text[n])) isBreak = false;
        else if (n < text.length) {
          // 2024. 5. 3. 오후: the next word continues a date or time
          const w = /^[가-힣]+/u.exec(text.slice(n))?.[0] ?? '';
          if (DATE_WORDS.has(w) || w.startsWith('오전') || w.startsWith('오후')) isBreak = false;
        }
      }
    }
    if (isBreak && k > j && !atEnd) {
      // a closed quotation that a quotative continues: "왜?"라고 물었다. is one sentence
      let n = k;
      while (n < text.length && text[n] === ' ') n++;
      const rest = text.slice(n, n + 4);
      if (/^(라고|하고|이라고|라며|라는)/u.test(rest) || /^고(?![가-힣])/u.test(rest)) isBreak = false;
    }
    if (isBreak) { push(start, k); start = k; }
    i = k > i ? k : i + 1;
  }
  push(start, text.length);
  return spans;
}

/** A search query in the form the keys are in: NFC, halfwidth jamo mapped, whitespace collapsed and trimmed. */
export const koSearchNormalize = (query: string): string => koKey(query).replace(/\s+/gu, ' ').trim();
