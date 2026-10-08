/**
 * Norwegian text handling: normalization, tokenizer with exact offsets, sentence splitter.
 *
 * Tokenizer rules (offsets always slice the input):
 *  - a word with a letter is a word token; numbers and punctuation are kept as non-word tokens;
 *  - a hyphenated compound is ONE word token when letters or digits stand on both sides of a hyphen with no space:
 *    USA-president, 3-årig, e-post, sjø- og landtransport (the first part "sjø-" is one token: a suspended hyphen);
 *  - the apostrophe genitive (Hans' bok) is the name and a separate "'" token (the sentence layer reads the genitive);
 *  - a listed abbreviation (bl.a., f.eks., osv., ca.) is one word token including its dots.
 * Machine-drafted rules, not checked by a native speaker.
 */
import type { RawToken, Span } from '../../core';
import { nfc, splitSentences } from '../shared';

export const normalizeNo = (s: string): string => nfc(s).toLocaleLowerCase('nb');

/** Abbreviations written with dots, longest first so that "bl.a." wins over "bl.". */
export const ABBREVIATIONS: readonly string[] = [
  'bl.a.', 'f.eks.', 'm.fl.', 'm.a.o.', 'o.l.', 'o.a.', 'm.m.', 't.o.m.', 'f.o.m.', 'e.kr.', 'f.kr.', 'd.v.s.', 'm.v.',
  'dvs.', 'osv.', 'ca.', 'mv.', 'nr.', 'kl.', 'jf.', 'pga.', 'ifm.', 'mht.', 'evt.', 'mfl.', 'dr.', 'prof.', 'kr.', 'tlf.', 'mob.',
].sort((a, b) => b.length - a.length);

const SENTENCE_ABBR = ['bl', 'f', 'eks', 'm', 'fl', 'dvs', 'osv', 'ca', 'mv', 'nr', 'kl', 'jf', 'pga', 'ifm', 'mht', 'evt', 'mfl', 'bla', 'hr', 'dr', 'prof', 'st', 'kr', 'tlf', 'mob', 'o', 'l', 'a', 'v', 't', 'kr', 'sr', 'jr', 'resp'];

const seg = new Intl.Segmenter('nb', { granularity: 'word' });
const SKIP = /^[\s​﻿]+$/u;
const HYPHEN = /^[-‐‑–]$/u;

function abbreviationAt(text: string, i: number): string | undefined {
  const rest = text.slice(i, i + 8).toLowerCase();
  for (const a of ABBREVIATIONS) {
    if (!rest.startsWith(a)) continue;
    const after = text[i + a.length];
    // a letter right after the dot would make it something else (osv.xyz); a capital after "kl." is fine
    if (after !== undefined && /\p{L}/u.test(after) && !a.endsWith('.')) continue;
    if (i > 0 && /\p{L}/u.test(text[i - 1])) continue;
    return text.slice(i, i + a.length);
  }
  return undefined;
}

export function tokenizeNo(text: string): RawToken[] {
  const segs = [...seg.segment(text)];
  const out: RawToken[] = [];
  const mk = (start: number, end: number, isWord: boolean): void => {
    const surface = text.slice(start, end);
    out.push({ surface, start, end, isWord, normalized: normalizeNo(surface) });
  };
  for (let i = 0; i < segs.length;) {
    const s = segs[i];
    if (SKIP.test(s.segment)) { i++; continue; }
    // listed abbreviation
    const ab = abbreviationAt(text, s.index);
    if (ab) {
      const end = s.index + ab.length;
      mk(s.index, end, true);
      while (i < segs.length && segs[i].index < end) i++;
      continue;
    }
    const wordLike = (x: { segment: string; isWordLike?: boolean } | undefined): boolean => !!x && x.isWordLike === true && /[\p{L}\p{N}]/u.test(x.segment);
    if (wordLike(s)) {
      // hyphenated compound: word - word (no spaces)
      let end = s.index + s.segment.length;
      let j = i + 1;
      while (j + 1 < segs.length && HYPHEN.test(segs[j].segment) && segs[j].index === end && wordLike(segs[j + 1]) && segs[j + 1].index === end + segs[j].segment.length) {
        end = segs[j + 1].index + segs[j + 1].segment.length;
        j += 2;
      }
      // suspended hyphen: "sjø- og landtransport"
      if (j < segs.length && HYPHEN.test(segs[j].segment) && segs[j].index === end && j + 1 < segs.length && /^\s+(og|eller)\s/u.test(text.slice(end + segs[j].segment.length, end + segs[j].segment.length + 8) + ' ')) {
        end = segs[j].index + segs[j].segment.length;
        j += 1;
      }
      const surface = text.slice(s.index, end);
      const isWord = /\p{L}/u.test(surface);
      mk(s.index, end, isWord);
      i = j;
      continue;
    }
    mk(s.index, s.index + s.segment.length, false);
    i++;
  }
  return out;
}

export function segmentSentencesNo(text: string): Span[] {
  return splitSentences(text, { terminators: '.!?…', abbreviations: SENTENCE_ABBR, ordinalDot: false });
}
