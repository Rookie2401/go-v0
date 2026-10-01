/**
 * The word-segmentation systems under test, all behind one interface: text → boundaries (UTF-16 offsets at which a
 * new word starts, excluding the first word; canonical, see src/bench/shared.ts).
 *
 *  - `adapter`   the real `thAdapter.tokenize`: ICU dictionary segmentation plus the course compound list.
 *  - `icu`       `Intl.Segmenter('th')` alone, no course compounds.
 *  - `dict-mm`   OUR OWN baseline, not an established tokenizer: maximal matching over the Wiktionary headwords,
 *                fewest unknown characters first, then fewest words. Written for this benchmark.
 *  - `external:<name>`  segmentations produced by another tool (PyThaiNLP newmm, …) read from a file in the
 *                editing format (docs/thai/BENCHMARKS.md, scripts/external/pythainlp_tokenize.py).
 */
import { thAdapter } from '../../adapters/th';
import { boundaryProblem, canonicalBoundaries, graphemeBoundaries, isWs } from '../shared';
import { fromEditing } from '../gold/format';

export type SegmentFn = (text: string, id?: string) => number[];

export interface WordSystem {
  /** Short name used in tables and file names: "adapter", "icu", "dict-mm", "external:newmm". */
  name: string;
  /** One honest line: what this system is. */
  label: string;
  kind: 'course' | 'platform' | 'ours' | 'external';
  segment: SegmentFn;
}

const startsOfTokens = (text: string, tokens: ReadonlyArray<{ start: number }>): number[] =>
  canonicalBoundaries(text, tokens.map((t) => t.start));

// ───────────────────────────── adapter, icu ─────────────────────────────

export const adapterSystem: WordSystem = {
  name: 'adapter',
  label: 'the course Thai adapter as shipped (ICU dictionary segmentation + course compound list)',
  kind: 'course',
  segment: (text) => startsOfTokens(text, thAdapter.tokenize(text)),
};

const icuSegmenter = new Intl.Segmenter('th', { granularity: 'word' });

export const icuSystem: WordSystem = {
  name: 'icu',
  label: "Intl.Segmenter('th') alone: ICU dictionary segmentation, no course compounds",
  kind: 'platform',
  segment: (text) => {
    const starts: number[] = [];
    for (const s of icuSegmenter.segment(text)) if (!/^[\s​﻿]+$/u.test(s.segment)) starts.push(s.index);
    return canonicalBoundaries(text, starts);
  },
};

// ───────────────────────────── dict-mm ─────────────────────────────

const THAI_CH = /[\p{Script=Thai}]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

interface Cost { unknown: number; tokens: number }
const better = (a: Cost, b: Cost): boolean => a.unknown < b.unknown || (a.unknown === b.unknown && a.tokens < b.tokens);

/**
 * Maximal matching over `words`: among all ways to cover the text with dictionary words and unknown stretches,
 * take the one with the fewest unknown characters, then the fewest tokens (ties go to the longer first word).
 * Whitespace separates chunks; a word never starts before a Thai vowel sign / tone mark nor ends after a leading
 * vowel; adjacent unknown Thai stretches are merged into one token; a run of non-Thai letters or digits is one
 * token and any other character stands alone.
 */
export function makeDictMM(words: ReadonlySet<string>, maxLen = 40): SegmentFn {
  return (text) => {
    const graphemes = graphemeBoundaries(text);
    const starts: number[] = [];
    let i = 0;
    while (i < text.length) {
      if (isWs(text[i])) { i++; continue; }
      let j = i;
      while (j < text.length && !isWs(text[j])) j++;
      starts.push(i); // a chunk starts a word (the first one is dropped by canonicalBoundaries)
      segmentChunk(text, i, j, words, maxLen, graphemes, starts);
      i = j;
    }
    return canonicalBoundaries(text, starts);
  };
}

function segmentChunk(
  text: string, from: number, to: number, words: ReadonlySet<string>, maxLen: number, graphemes: Set<number>, starts: number[],
): void {
  const n = to - from;
  const legal = (p: number): boolean => p === from || p === to || boundaryProblem(text, p, graphemes) === undefined;
  const best: Cost[] = new Array<Cost>(n + 1);
  const choice: Array<{ len: number; known: boolean }> = new Array(n + 1);
  best[n] = { unknown: 0, tokens: 0 };
  for (let p = n - 1; p >= 0; p--) {
    const at = from + p;
    let bestCost: Cost | undefined;
    let bestChoice = { len: 1, known: false };
    if (legal(at)) {
      // dictionary words, longest first
      const maxL = Math.min(maxLen, n - p);
      for (let L = maxL; L >= 1; L--) {
        if (!legal(at + L) || best[p + L] === undefined) continue;
        if (!words.has(text.slice(at, at + L))) continue;
        const c = { unknown: best[p + L].unknown, tokens: best[p + L].tokens + 1 };
        if (!bestCost || better(c, bestCost)) { bestCost = c; bestChoice = { len: L, known: true }; }
      }
      // one unknown unit: the next legal stretch (a cluster, or a non-Thai run)
      let u = unitLength(text, at, to, graphemes);
      while (at + u < to && !legal(at + u)) u++;
      if (best[p + u] !== undefined) {
        const c = { unknown: best[p + u].unknown + u, tokens: best[p + u].tokens + 1 };
        if (!bestCost || better(c, bestCost)) { bestCost = c; bestChoice = { len: u, known: false }; }
      }
    }
    if (bestCost) { best[p] = bestCost; choice[p] = bestChoice; }
  }
  // walk, merging adjacent unknown Thai units
  let p = 0;
  let prevUnknownThai = false;
  while (p < n) {
    const ch = choice[p];
    if (!ch) { p++; continue; } // not a legal start (cannot happen from a legal path)
    const at = from + p;
    const unknownThai = !ch.known && THAI_CH.test(text[at]);
    if (!(unknownThai && prevUnknownThai) && p > 0) starts.push(at);
    prevUnknownThai = unknownThai;
    p += ch.len;
  }
}

/** Length of one unknown unit starting at `at` (before extending to a legal edge). */
function unitLength(text: string, at: number, to: number, graphemes: Set<number>): number {
  if (!THAI_CH.test(text[at]) && LETTER_OR_DIGIT.test(text[at])) {
    let e = at + 1;
    while (e < to && !THAI_CH.test(text[e]) && LETTER_OR_DIGIT.test(text[e])) e++;
    return e - at;
  }
  let e = at + 1;
  while (e < to && !graphemes.has(e)) e++;
  return e - at;
}

export const dictMMSystem = (words: ReadonlySet<string>): WordSystem => ({
  name: 'dict-mm',
  label: 'OUR OWN baseline, not an established tokenizer: maximal matching over the Wiktionary headwords, fewest unknown characters first',
  kind: 'ours',
  segment: makeDictMM(words),
});

// ───────────────────────────── external ─────────────────────────────

/**
 * Segmentations from another tool, read from a file in the editing format. Sentences are matched by id, then by
 * text. Asking for a sentence the file does not contain throws (a silent gap would score as "no boundaries").
 */
export function externalSystem(name: string, editingText: string): WordSystem {
  const parsed = fromEditing(editingText);
  if (parsed.problems.length) throw new Error(`external:${name}: ${parsed.problems.slice(0, 3).join('; ')}`);
  const byId = new Map(parsed.entries.map((e) => [e.id, e]));
  const byText = new Map(parsed.entries.map((e) => [e.text, e]));
  return {
    name: `external:${name}`,
    label: `segmentation by "${name}", read from a file in the editing format (produced outside this repository)`,
    kind: 'external',
    segment: (text, id) => {
      const hit = (id !== undefined ? byId.get(id) : undefined) ?? byText.get(text);
      if (!hit) throw new Error(`external:${name}: no segmentation for ${id ?? 'a sentence'} in the file`);
      if (hit.text !== text) throw new Error(`external:${name}: the text of ${hit.id} differs from the gold text (the tool changed it)`);
      return canonicalBoundaries(text, hit.boundaries);
    },
  };
}
