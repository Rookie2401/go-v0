/** Unicode-safe text helpers shared by the adapter, parser and tests. Pure; no DOM. */

export interface Span { start: number; end: number; text: string }

let graphemeSegmenter: Intl.Segmenter | undefined;
const graphemes = (): Intl.Segmenter => (graphemeSegmenter ??= new Intl.Segmenter('und', { granularity: 'grapheme' }));

/** Sorted UTF-16 offsets where a grapheme cluster starts, plus text.length. */
export function graphemeBoundaries(text: string): number[] {
  const out: number[] = [];
  for (const s of graphemes().segment(text)) out.push(s.index);
  out.push(text.length);
  return out;
}

/** Move a [start,end) range outward to whole grapheme clusters (a base letter keeps its matras, nukta, virama). */
export function snapToGraphemes(text: string, start: number, end: number): { start: number; end: number; moved: boolean } {
  const b = graphemeBoundaries(text);
  let s = start;
  let e = end;
  // largest boundary <= start, smallest boundary >= end
  for (let i = b.length - 1; i >= 0; i--) if (b[i] <= start) { s = b[i]; break; }
  for (let i = 0; i < b.length; i++) if (b[i] >= end) { e = b[i]; break; }
  return { start: s, end: e, moved: s !== start || e !== end };
}

/** A cut position inside a long text, moved to the nearest whitespace-or-grapheme boundary at or before `pos`. */
export function safeCutBefore(text: string, pos: number): number {
  const b = graphemeBoundaries(text);
  let cut = 0;
  for (const x of b) { if (x <= pos) cut = x; else break; }
  // prefer a whitespace edge within 40 characters so a word is not cut in half
  for (let i = cut; i > Math.max(0, cut - 40); i--) if (/\s/u.test(text[i - 1] ?? '')) return i;
  return cut;
}

export function safeCutAfter(text: string, pos: number): number {
  const b = graphemeBoundaries(text);
  let cut = text.length;
  for (const x of b) { if (x >= pos) { cut = x; break; } }
  for (let i = cut; i < Math.min(text.length, cut + 40); i++) if (/\s/u.test(text[i] ?? '')) return i;
  return cut;
}

export const collapseWhitespace = (s: string): string => s.replace(/[\s​﻿]+/gu, ' ').trim();

/** NFC length of the prefix: converts a raw UTF-16 offset (cluster-aligned) to the offset in the NFC text. */
export const nfcOffset = (raw: string, rawOffset: number): number => raw.slice(0, rawOffset).normalize('NFC').length;

const RTL = /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/gu;
const LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿऀ-෿฀-໿]/gu;

/** Dominant strong direction of a text by script; 'unknown' when there is no letter at all. */
export function textDirection(text: string): 'ltr' | 'rtl' | 'unknown' {
  const r = (text.match(RTL) ?? []).length;
  const l = (text.match(LTR) ?? []).length;
  if (!r && !l) return 'unknown';
  return r > l ? 'rtl' : 'ltr';
}

export const hasLatinLetter = (s: string): boolean => /\p{Script=Latin}/u.test(s);

export const wordCount = (s: string): number => {
  let n = 0;
  for (const seg of new Intl.Segmenter('und', { granularity: 'word' }).segment(s)) if (seg.isWordLike) n++;
  return n;
};

/** FNV-1a 64-bit over UTF-8, hex. Same function as the engine's `hash` (src/core/ids.ts): keys join across apps. */
export function fnv1a64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

/** The sentence identity used by the Repository: hash of the exact text, 12 hex digits (src/core/ids.ts sentenceKey). */
export const sentenceKeyOf = (exactText: string): string => fnv1a64(exactText).slice(0, 12);
