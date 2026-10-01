/**
 * Benchmark helpers shared by the word-segmentation benchmark (src/bench/words, src/bench/gold) and the
 * reading-unit benchmark: boundary sets, word spans, precision / recall / F1, a seeded shuffle, a stable hash.
 * Pure and dependency-free. NOTHING under src/bench is imported by the app bundle (src/main.tsx).
 *
 * Conventions (written down once, used everywhere):
 *  - offsets are UTF-16 code units into the sentence text, exactly as `text.slice` counts them;
 *  - a "boundary" is the offset at which a NEW word starts, excluding the first word's start; whitespace is never
 *    a word, so a boundary never points at whitespace (`canonicalBoundaries` moves a cut forward past whitespace);
 *  - a word is the slice between two cuts, trimmed of whitespace; an empty slice is not a word;
 *  - punctuation marks are words of their own (the adapter and ICU both emit them as separate tokens).
 */

/** Whitespace as the adapters see it (SKIP_SEGMENT in adapters/shared.ts): \s plus zero-width space and BOM. */
export const WS_RE = /^[\s​﻿]$/u;
export const isWs = (ch: string | undefined): boolean => ch !== undefined && WS_RE.test(ch);

export interface WordSpan { start: number; end: number }

// ───────────────────────────── characters that cannot sit at a word edge ─────────────────────────────

/** Thai characters that follow their consonant and so can never start a word (vowel signs, tone marks, ำ, ๅ …). */
const THAI_FOLLOWING = /[ะ-ฺๅ็-๎]/u;
/** Thai leading vowels เ แ โ ใ ไ: a word can never end right after one. */
const THAI_LEADING = /[เ-ไ]/u;

const graphemeSegmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

/** Offsets of every user-perceived character boundary of `text`, including 0 and `text.length`. */
export function graphemeBoundaries(text: string): Set<number> {
  const out = new Set<number>([0, text.length]);
  for (const s of graphemeSegmenter.segment(text)) out.add(s.index);
  return out;
}

/**
 * Whether a word may start at `i` (and the previous one end there): inside the text, on a grapheme boundary, not
 * before a Thai following vowel / tone mark, not right after a Thai leading vowel. `graphemes` may be passed to avoid
 * recomputing it per call.
 */
export function isBreakable(text: string, i: number, graphemes: Set<number> = graphemeBoundaries(text)): boolean {
  if (i <= 0 || i >= text.length) return false;
  if (!graphemes.has(i)) return false;
  if (THAI_FOLLOWING.test(text[i])) return false;
  if (THAI_LEADING.test(text[i - 1])) return false;
  return true;
}

/** Why `i` is not a legal boundary, or undefined when it is one. Used by the validator for its messages. */
export function boundaryProblem(text: string, i: number, graphemes: Set<number> = graphemeBoundaries(text)): string | undefined {
  if (!Number.isInteger(i)) return 'not an integer';
  if (i <= 0 || i >= text.length) return 'outside the text (a boundary is strictly between 0 and the text length)';
  if (!graphemes.has(i)) return 'inside a character cluster (a base letter and its marks, or a surrogate pair)';
  if (THAI_FOLLOWING.test(text[i])) return 'before a Thai vowel sign or tone mark, which belongs to the preceding consonant';
  if (THAI_LEADING.test(text[i - 1])) return 'right after a Thai leading vowel, which belongs to the following consonant';
  if (isWs(text[i])) return 'on whitespace (a boundary points at the start of a word)';
  return undefined;
}

// ───────────────────────────── boundaries and words ─────────────────────────────

/**
 * Canonical boundary list for `text` from arbitrary cut offsets: each cut moves forward past whitespace to the
 * next word start; cuts that land before the first word, at/after the end, or duplicate another are dropped.
 */
export function canonicalBoundaries(text: string, cuts: Iterable<number>): number[] {
  let first = 0;
  while (first < text.length && isWs(text[first])) first++;
  const out = new Set<number>();
  for (const c of cuts) {
    let b = c;
    while (b < text.length && isWs(text[b])) b++;
    if (b <= first || b >= text.length) continue;
    out.add(b);
  }
  return [...out].sort((a, b) => a - b);
}

/** The words of `text` cut at `boundaries`: trimmed slices, with offsets. */
export function wordSpans(text: string, boundaries: readonly number[]): WordSpan[] {
  const cuts = [0, ...boundaries, text.length];
  const out: WordSpan[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    let a = cuts[k];
    let b = cuts[k + 1];
    while (a < b && isWs(text[a])) a++;
    while (b > a && isWs(text[b - 1])) b--;
    if (b > a) out.push({ start: a, end: b });
  }
  return out;
}

export const wordsOf = (text: string, boundaries: readonly number[]): string[] =>
  wordSpans(text, boundaries).map((w) => text.slice(w.start, w.end));

/** Boundaries from word spans (every span start except the first). */
export const boundariesFromSpans = (spans: readonly WordSpan[]): number[] => spans.slice(1).map((s) => s.start);

// ───────────────────────────── precision / recall / F1 ─────────────────────────────

export interface Prf { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number }

/** 0/0 is reported as 1 (nothing to find, nothing wrongly found); the counts are always carried so it can be told. */
export function prf(tp: number, fp: number, fn: number): Prf {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

/** True positives / false positives / false negatives of two sorted-or-not integer sets. */
export function setCounts(gold: readonly number[], system: readonly number[]): { tp: number; fp: number; fn: number } {
  const g = new Set(gold);
  const s = new Set(system);
  let tp = 0;
  for (const x of s) if (g.has(x)) tp++;
  return { tp, fp: s.size - tp, fn: g.size - tp };
}

// ───────────────────────────── seeded randomness, stable hash ─────────────────────────────

/** mulberry32: a small deterministic PRNG, 0 ≤ x < 1. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates on a copy; the same seed and input always give the same order. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rnd = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 8 hex digits of FNV-1a over the UTF-16 code units: a stable short id for a text. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const pct = (x: number, digits = 2): string => `${(100 * x).toFixed(digits)}`;
