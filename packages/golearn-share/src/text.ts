/**
 * Unicode-safe helpers for shared text. Pure; no DOM. Same rules as the browser reader's (`golearn-extension/src/text.ts`).
 * Code points are written `\u{…}` so the invisible ones can be read and cannot be lost in an editor.
 */

const segmenters = new Map<string, Intl.Segmenter>();
function segmenter(granularity: 'grapheme' | 'word' | 'sentence', locale?: string): Intl.Segmenter {
  const key = `${granularity}|${locale ?? ''}`;
  let s = segmenters.get(key);
  if (!s) {
    try { s = new Intl.Segmenter(locale || 'und', { granularity }); } catch { s = new Intl.Segmenter('und', { granularity }); }
    segmenters.set(key, s);
  }
  return s;
}

/**
 * Invisible and control characters that carry no text: controls, any whitespace, the zero-width space (U+200B), the byte
 * order mark (U+FEFF), the line and paragraph separators. The zero-width joiner and non-joiner (U+200D, U+200C) are NOT
 * among them: they spell words in Devanagari and Persian.
 */
const SPACE_LIKE = /[\p{Cc}\s\u{200B}\u{FEFF}\u{2028}\u{2029}]+/gu;
/** Direction marks and embeddings (U+200E/F, U+202A–E, U+2066–9) that a copy from an RTL page adds at the edges. */
const EDGE_JUNK = /^[\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]+|[\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]+$/gu;
const LINE_BREAK = /[\r\n\u{2028}\u{2029}]/u;

export interface Cleaned { text: string; hadLineBreak: boolean }

/** NFC, edge direction marks removed, every run of whitespace/controls/zero-width-space collapsed to one space, trimmed. */
export function cleanText(raw: string): Cleaned {
  const nfc = raw.normalize('NFC').replace(EDGE_JUNK, '');
  const hadLineBreak = LINE_BREAK.test(nfc.trim());
  return { text: nfc.replace(SPACE_LIKE, ' ').trim(), hadLineBreak };
}

/**
 * Edge trim of a looked-up surface: removes anything that is not a letter, a number, a combining mark (matras, nukta,
 * virama, Thai vowels and tone marks stay attached to their base) or a joiner (U+200C, U+200D). Whole clusters only.
 */
export const TRIM_EDGES = /^[^\p{L}\p{N}\p{M}\u{200C}\u{200D}]+|[^\p{L}\p{N}\p{M}\u{200C}\u{200D}]+$/gu;
export const trimEdges = (s: string): string => s.replace(TRIM_EDGES, '');

/** Same count the reader contract uses for its limits: word-like segments (so Thai and Chinese count words, not spaces). */
export function wordCount(s: string, locale?: string): number {
  let n = 0;
  for (const seg of segmenter('word', locale).segment(s)) if (seg.isWordLike) n++;
  return n;
}

export function sentenceCount(s: string, locale?: string): number {
  let n = 0;
  for (const seg of segmenter('sentence', locale).segment(s)) if (seg.segment.trim()) n++;
  return n;
}

export interface WordSpan { surface: string; start: number; end: number }

/** The word-like segments of `s`, with UTF-16 offsets into `s`. Segment edges are grapheme-cluster edges. */
export function wordSpans(s: string, locale?: string): WordSpan[] {
  const out: WordSpan[] = [];
  for (const seg of segmenter('word', locale).segment(s)) {
    if (seg.isWordLike) out.push({ surface: seg.segment, start: seg.index, end: seg.index + seg.segment.length });
  }
  return out;
}

/** Sorted UTF-16 offsets where a grapheme cluster starts, plus s.length. */
export function graphemeBoundaries(s: string): number[] {
  const out: number[] = [];
  for (const g of segmenter('grapheme').segment(s)) out.push(g.index);
  out.push(s.length);
  return out;
}

// Hebrew, Arabic, Syriac, Thaana-adjacent and presentation forms (RTL); Latin, Greek, Cyrillic, Indic and Thai/Lao (LTR).
const RTL = /[\u{0590}-\u{06FF}\u{0700}-\u{077F}\u{08A0}-\u{08FF}\u{FB1D}-\u{FDFF}\u{FE70}-\u{FEFF}]/gu;
const LTR = /[A-Za-z\u{00C0}-\u{024F}\u{0370}-\u{03FF}\u{0400}-\u{04FF}\u{0900}-\u{0DFF}\u{0E00}-\u{0EFF}]/gu;

/** Dominant strong direction of a text by script; 'unknown' when there is no letter at all. */
export function textDirection(text: string): 'ltr' | 'rtl' | 'unknown' {
  const r = (text.match(RTL) ?? []).length;
  const l = (text.match(LTR) ?? []).length;
  if (!r && !l) return 'unknown';
  return r > l ? 'rtl' : 'ltr';
}

/** A passage that ends in sentence-final punctuation of the scripts GoLearn reads (including the Devanagari danda and the Arabic question mark). */
export const endsLikeASentence = (s: string): boolean => /[.!?…\u{3002}\u{FF01}\u{FF1F}\u{061F}\u{06D4}\u{0964}\u{0965}]["'\u{201D}\u{2019}\u{00BB})\]]*$/u.test(s);
