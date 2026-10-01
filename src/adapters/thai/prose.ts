/**
 * Reading units for long Thai prose. Thai has no full stop, so a printed paragraph can come out of
 * segmentThaiSentences as one span of fifty words. This divides such a span at its clause spaces by rule:
 *
 *  - only a span of more than 28 word tokens is touched; shorter spans come out exactly as before;
 *  - only a single space is a candidate, and only when the unit so far has at least 6 word tokens and what is
 *    left of the span has at least 3;
 *  - never inside quotation marks or brackets that open and close within the span, and never next to a digit, a
 *    Latin-script letter, ๆ or ฯ;
 *  - among the candidates a space followed by a connective (แต่ แล้ว และ เพราะ จึง ถ้า เมื่อ ส่วน ดังนั้น ก็)
 *    is preferred; failing that, the first candidate with at least 10 word tokens before it, failing that the
 *    last one that keeps the unit at 28 words or fewer.
 *
 * Spans slice the text exactly and cover every non-space character in order. A reading unit is not a
 * grammarian's sentence: this is a way to keep a paragraph from being one unreadable block.
 */
import type { Span } from '../../core';
import { segmentThaiSentences, thaiTokenize } from './text';

export const PROSE_MAX_WORDS = 28;
const MIN_BEFORE = 6;
const MIN_AFTER = 3;
const PREFERRED_BEFORE = 10;

export const PROSE_CONNECTIVES: readonly string[] = ['แต่', 'แล้ว', 'และ', 'เพราะ', 'จึง', 'ถ้า', 'เมื่อ', 'ส่วน', 'ดังนั้น', 'ก็'];
const CONNECTIVE_SET = new Set(PROSE_CONNECTIVES);

const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '«': '»', '“': '”', '‘': '’', '「': '」', '『': '』', '《': '》' };
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));
const FORBIDDEN_NEIGHBOUR = /[\p{Nd}\p{Script=Latin}ๆฯ]/u;

/** Index ranges [open, close] of quotes and brackets that open and close inside the text. */
function protectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const stack: Array<{ close: string; at: number }> = [];
  let quoteOpen = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoteOpen < 0) quoteOpen = i; else { ranges.push([quoteOpen, i]); quoteOpen = -1; }
    } else if (OPEN_TO_CLOSE[ch]) {
      stack.push({ close: OPEN_TO_CLOSE[ch], at: i });
    } else if (CLOSERS.has(ch)) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].close === ch) { ranges.push([stack[k].at, i]); stack.length = k; break; }
      }
    }
  }
  return ranges;
}

function divide(span: Span): Span[] {
  const text = span.text;
  const tokens = thaiTokenize(text);
  const words = tokens.filter((t) => t.isWord);
  if (words.length <= PROSE_MAX_WORDS) return [span];

  const ranges = protectedRanges(text);
  const startsAt = new Map<number, string>();
  for (const t of tokens) startsAt.set(t.start, t.normalized);
  const wordsBetween = (a: number, b: number): number => words.filter((w) => w.start >= a && w.end <= b).length;

  const cands: Array<{ at: number }> = [];
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== ' ' || text[i - 1] === ' ' || text[i + 1] === ' ') continue;
    if (/\s/u.test(text[i - 1]) || /\s/u.test(text[i + 1])) continue;
    if (FORBIDDEN_NEIGHBOUR.test(text[i - 1]) || FORBIDDEN_NEIGHBOUR.test(text[i + 1])) continue;
    if (ranges.some(([a, b]) => i > a && i < b)) continue;
    cands.push({ at: i });
  }

  const out: Span[] = [];
  let from = 0;
  while (wordsBetween(from, text.length) > PROSE_MAX_WORDS) {
    const valid = cands
      .filter((c) => c.at > from)
      .map((c) => ({ at: c.at, before: wordsBetween(from, c.at), after: wordsBetween(c.at + 1, text.length) }))
      .filter((c) => c.before >= MIN_BEFORE && c.after >= MIN_AFTER);
    if (!valid.length) break;
    const fit = valid.filter((c) => c.before <= PROSE_MAX_WORDS);
    const pick =
      fit.find((c) => CONNECTIVE_SET.has(startsAt.get(c.at + 1) ?? '')) ??
      fit.find((c) => c.before >= PREFERRED_BEFORE) ??
      fit[fit.length - 1] ??
      valid[0];
    out.push({ start: span.start + from, end: span.start + pick.at, text: text.slice(from, pick.at) });
    from = pick.at + 1;
  }
  out.push({ start: span.start + from, end: span.end, text: text.slice(from) });
  return out;
}

/** Sentence spans (segmentThaiSentences) with every span of more than 28 word tokens divided at clause spaces. */
export function segmentThaiProse(text: string): Span[] {
  return segmentThaiSentences(text).flatMap(divide);
}
