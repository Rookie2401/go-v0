/**
 * Guards that protect reading pace, encounter counts and audio alignment from bad unit boundaries. They need no gold:
 * they read a system's units over any paragraphs and count the shapes a bad boundary leaves behind.
 *
 *  - words per unit (median, 95th percentile by nearest rank, maximum, mean) — a unit's dwell, its words-per-minute
 *    share, its encounters and its audio segment all scale with it;
 *  - units over 40 words — too long to read as one unit, to time fairly or to cut as one audio segment;
 *  - units of one word — most often an orphaned marker, a title or a stranded particle: a dwell of 1.5 s floor each;
 *  - units that begin or end INSIDE a quotation that opens and closes within the paragraph (“ ” « » 「 」 『 』 and
 *    straight "…" pairs): the unit carries half a quotation, so its audio loses or gains an opening / closing voice
 *    change. (A gold that deliberately splits a multi-sentence quotation will count these too: they say where a
 *    quotation is divided, not that the division is wrong.);
 *  - units that split a number (a boundary right after `.` or `,` between two digits, or between two digits);
 *  - units that split an abbreviation (a boundary right after a dotted Thai abbreviation such as พ.ศ. ร.ร. ก.ค., a
 *    title from a short list — ดร. นพ. พญ. ผศ. รศ. ศ. อ. ด.ช. ด.ญ. Dr. Mr. Mrs. Ms. Prof. — or a single capital
 *    initial such as "J."). A lone Thai letter with a dot (น. as in 10.30 น.) is NOT counted: it can end a sentence.
 * A unit that splits two things is counted once per guard. The counts are heuristics for MEASURING contamination, not
 * a verdict on any one boundary; `samples` keeps the first examples so a person can look.
 */
import { thAdapter } from '../../adapters/th';
import { isWs } from '../shared';
import type { UnitSystem } from './systems';
import { coversParagraph } from './systems';

export const LONG_UNIT_WORDS = 40;

const QUOTE_PAIRS: Record<string, string> = { '“': '”', '«': '»', '「': '」', '『': '』' };
const CLOSERS = new Set(Object.values(QUOTE_PAIRS));

/** Index ranges [open, close] of quotations that open and close inside the paragraph. */
export function quotationRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const stack: Array<{ close: string; at: number }> = [];
  let straight = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (straight < 0) straight = i; else { ranges.push([straight, i]); straight = -1; }
    } else if (QUOTE_PAIRS[ch]) {
      stack.push({ close: QUOTE_PAIRS[ch], at: i });
    } else if (CLOSERS.has(ch)) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].close === ch) { ranges.push([stack[k].at, i]); stack.length = k; break; }
      }
    }
  }
  return ranges;
}

const DIGIT = /\p{Nd}/u;
const THAI_DOTTED = /^(?:[ก-ฮ]{1,3}\.){2,}$/u;
const TITLES = new Set(['ดร.', 'นพ.', 'พญ.', 'ผศ.', 'รศ.', 'ศ.', 'อ.', 'ด.ช.', 'ด.ญ.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.']);
const LATIN_INITIAL = /^\p{Lu}\.$/u;

/** The last whitespace-delimited token before `b`, with its end offset; undefined at the start. */
function tokenBefore(text: string, b: number): { token: string; end: number } | undefined {
  let end = b;
  while (end > 0 && isWs(text[end - 1])) end--;
  if (end === 0) return undefined;
  let start = end;
  while (start > 0 && !isWs(text[start - 1])) start--;
  return { token: text.slice(start, end), end };
}

export const isAbbreviationToken = (raw: string): boolean => {
  const token = raw.replace(/^[(\[“"'‘«「『]+/u, '');
  return THAI_DOTTED.test(token) || TITLES.has(token) || LATIN_INITIAL.test(token);
};

/** Whether the boundary at `b` (a unit start) cuts through a number. */
export function splitsNumber(text: string, b: number): boolean {
  if (b <= 0 || b >= text.length || !DIGIT.test(text[b])) return false;
  if (DIGIT.test(text[b - 1])) return true; // digits on both sides, nothing between
  const t = tokenBefore(text, b);
  return !!t && /[.,]/.test(text[t.end - 1]) && t.end - 2 >= 0 && DIGIT.test(text[t.end - 2]);
}

/** Whether the boundary at `b` cuts right after an abbreviation. */
export function splitsAbbreviation(text: string, b: number): boolean {
  const t = tokenBefore(text, b);
  return !!t && isAbbreviationToken(t.token);
}

// ───────────────────────────── statistics ─────────────────────────────

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Nearest-rank percentile, p in (0, 100]. */
export function percentile(xs: readonly number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

// ───────────────────────────── the guards ─────────────────────────────

export interface GuardSample { guard: string; paragraph: number; context: string }

export interface GuardReport {
  system: string;
  paragraphs: number;
  units: number;
  words: number;
  wordsPerUnit: { median: number; p95: number; max: number; mean: number };
  overLong: number;
  oneWord: number;
  quoteBegin: number;
  quoteEnd: number;
  /** Units that begin or end inside a quotation (counted once). */
  quoteEither: number;
  numberSplits: number;
  abbreviationSplits: number;
  /** Paragraphs whose spans do not slice the text exactly or drop a non-space character. */
  notCovering: number;
  samples: GuardSample[];
}

export const wordCount = (unit: string): number => thAdapter.tokenize(unit).filter((t) => t.isWord).length;

const ctx = (text: string, at: number, r = 10): string => `${text.slice(Math.max(0, at - r), at).replace(/\n/g, '↵')}⟂${text.slice(at, at + r).replace(/\n/g, '↵')}`;

export function runGuards(paragraphs: readonly string[], system: UnitSystem, opts: { maxSamples?: number } = {}): GuardReport {
  const maxSamples = opts.maxSamples ?? 40;
  const counts: number[] = [];
  const samples: GuardSample[] = [];
  const note = (guard: string, paragraph: number, text: string, at: number) => { if (samples.length < maxSamples) samples.push({ guard, paragraph, context: ctx(text, at) }); };
  let overLong = 0, oneWord = 0, quoteBegin = 0, quoteEnd = 0, quoteEither = 0, numberSplits = 0, abbreviationSplits = 0, notCovering = 0, units = 0;

  paragraphs.forEach((p, pi) => {
    const spans = system.split(p);
    if (!coversParagraph(p, spans)) notCovering++;
    const quotes = quotationRanges(p);
    spans.forEach((s, k) => {
      units++;
      const w = wordCount(s.text);
      counts.push(w);
      if (w > LONG_UNIT_WORDS) { overLong++; note('over-long', pi, p, s.start); }
      if (w === 1) { oneWord++; note('one-word', pi, p, s.start); }
      const begin = quotes.some(([a, c]) => s.start > a && s.start <= c);
      const end = quotes.some(([a, c]) => s.end > a && s.end <= c);
      if (begin) { quoteBegin++; note('quote-begin', pi, p, s.start); }
      if (end) { quoteEnd++; note('quote-end', pi, p, s.end); }
      if (begin || end) quoteEither++;
      if (k > 0) {
        if (splitsNumber(p, s.start)) { numberSplits++; note('number-split', pi, p, s.start); }
        if (splitsAbbreviation(p, s.start)) { abbreviationSplits++; note('abbreviation-split', pi, p, s.start); }
      }
    });
  });
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    system: system.id, paragraphs: paragraphs.length, units, words: total,
    wordsPerUnit: { median: median(counts), p95: percentile(counts, 95), max: counts.length ? Math.max(...counts) : 0, mean: counts.length ? total / counts.length : 0 },
    overLong, oneWord, quoteBegin, quoteEnd, quoteEither, numberSplits, abbreviationSplits, notCovering, samples,
  };
}
