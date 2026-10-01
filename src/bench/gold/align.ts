/**
 * Aligning a Wiktionary usage example to word boundaries.
 *
 * An example carries `text` (Thai, no spaces between words) and `roman` (Paiboon romanization in which the editor
 * put a space between WORDS, hyphens between the syllables of one word and " · " at phrase breaks). The words of
 * `roman` are laid over `text` by dynamic programming: roman word j may be matched, at text position i, by a headword
 * that `text` starts with at i and that the dictionary itself romanizes (in any listed reading) as that roman word.
 * An example is kept only when the whole text is consumed by exactly one sequence of headwords.
 *
 * What this can and cannot show: only words that are headwords of the dictionary can align, so the kept sentences
 * are made of dictionary words (systems that use a dictionary are favoured), and where the editors drew a word
 * boundary is their convention, which is not the course's.
 */
import { boundaryProblem, graphemeBoundaries, isWs } from '../shared';

/** headword → normalized romanizations (hyphens, spaces removed; lower-case; NFC) of every reading listed for it. */
export interface HeadwordIndex { words: Map<string, Set<string>>; romans: Set<string> }

/** Build the index from headword → normalized romanizations. */
export function makeHeadwordIndex(words: Map<string, Set<string>>): HeadwordIndex {
  const romans = new Set<string>();
  for (const set of words.values()) for (const r of set) romans.add(r);
  return { words, romans };
}

export const normRoman = (s: string): string => s.normalize('NFC').toLowerCase().replace(/[-\s ]/gu, '');

/** Longest headword considered (UTF-16 units); longer Thai words are not in the file. */
export const MAX_HEADWORD_LENGTH = 40;

export type AlignReason =
  | 'no-text' | 'no-roman' | 'not-thai-text' | 'empty-roman'
  | 'roman-word-not-a-headword-reading' | 'no-consistent-path' | 'ambiguous';

export type AlignResult =
  | { ok: true; boundaries: number[]; words: string[] }
  | { ok: false; reason: AlignReason; detail?: string };

/** Thai letters, marks, ๆ ฯ and whitespace only: no digits, Latin, punctuation or symbols. */
const THAI_ONLY = /^[\p{Script=Thai}\s​﻿]+$/u;

/** The romanized words of an example: split on spaces, phrase-break dots and bare punctuation tokens dropped. */
export function romanWords(roman: string): string[] {
  return roman
    .split(/\s+/u)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && /[\p{L}\p{M}]/u.test(w));
}

export function alignExample(text: string | undefined, roman: string | undefined, index: HeadwordIndex): AlignResult {
  if (!text || text.trim() === '') return { ok: false, reason: 'no-text' };
  if (!roman || roman.trim() === '') return { ok: false, reason: 'no-roman' };
  if (text !== text.trim() || !THAI_ONLY.test(text)) return { ok: false, reason: 'not-thai-text' };
  const words = romanWords(roman).map(normRoman);
  if (words.length === 0) return { ok: false, reason: 'empty-roman' };

  // some roman word with no headword reading anywhere → can never align
  const missing = words.find((w) => !index.romans.has(w));
  if (missing !== undefined) return { ok: false, reason: 'roman-word-not-a-headword-reading', detail: missing };

  const n = text.length;
  const m = words.length;
  const graphemes = graphemeBoundaries(text);
  const legalEnd = (e: number): boolean => e === n || boundaryProblem(text, e, graphemes) === undefined || isWs(text[e]);
  const skipWs = (i: number): number => { while (i < n && isWs(text[i])) i++; return i; };

  // paths(i, j): number of distinct headword sequences (capped at 2) consuming text[i..] with roman words j..
  const memo = new Map<number, number>();
  const paths = (i0: number, j: number): number => {
    const i = skipWs(i0);
    if (j === m) return i === n ? 1 : 0;
    if (i >= n) return 0;
    const key = i * (m + 1) + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let total = 0;
    for (let L = 1; L <= MAX_HEADWORD_LENGTH && i + L <= n && total < 2; L++) {
      if (isWs(text[i + L - 1])) break;
      const romans = index.words.get(text.slice(i, i + L));
      if (romans && romans.has(words[j]) && legalEnd(i + L)) total += paths(i + L, j + 1);
    }
    total = Math.min(total, 2);
    memo.set(key, total);
    return total;
  };

  const total = paths(0, 0);
  if (total === 0) return { ok: false, reason: 'no-consistent-path' };
  if (total > 1) return { ok: false, reason: 'ambiguous' };

  // walk the unique path
  const spans: Array<[number, number]> = [];
  let i = skipWs(0);
  for (let j = 0; j < m; j++) {
    let next = -1;
    for (let L = 1; L <= MAX_HEADWORD_LENGTH && i + L <= n; L++) {
      if (isWs(text[i + L - 1])) break;
      const romans = index.words.get(text.slice(i, i + L));
      if (romans && romans.has(words[j]) && legalEnd(i + L) && paths(i + L, j + 1) > 0) { next = i + L; break; }
    }
    spans.push([i, next]);
    i = skipWs(next);
  }
  const boundaries = spans.slice(1).map(([s]) => s);
  return { ok: true, boundaries, words: spans.map(([s, e]) => text.slice(s, e)) };
}
