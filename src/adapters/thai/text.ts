/**
 * Thai text basics shared by the adapter and the prose splitter: normalisation, the compound list the
 * segmenter is repaired with, the tokenizer, and the base sentence-break rules. No lexical knowledge here.
 */
import type { RawToken, Span } from '../../core';
import { makeWordTokenizer, nfc } from '../shared';

export const normalizeThai = (s: string) => nfc(s).replace(/ํา/gu, 'ำ').replace(/[​﻿]/gu, '');

/** Words ICU splits but the course treats as one lexical unit. */
export const THAI_COMPOUNDS = ['นิรันดร์', 'พระบุตร', 'ตอนนี้', 'ทุกคน', 'วันหนึ่ง', 'หลอกลวง', 'สัตย์ซื่อ', 'ทั้งสิ้น',
  'ผู้หญิง', 'โรงพยาบาล', 'ผลไม้', 'วันนี้', 'พรุ่งนี้', 'เมื่อวาน', 'พระเยซู', 'พระคัมภีร์', 'คริสตจักร', 'น่าจะ', 'ดังนั้น'];

export const thaiTokenize: (text: string) => RawToken[] = makeWordTokenizer({ locale: 'th', normalize: normalizeThai, compounds: THAI_COMPOUNDS });

/** Final particles after which a single space ends a reading unit. */
export const SENTENCE_FINAL_PARTICLES = ['ครับ', 'ค่ะ', 'คะ', 'นะ', 'จ้ะ', 'จ๊ะ', 'ฮะ', 'เหรอ', 'ล่ะ'];

/** Words of address: "พี่ครับ", "คุณครูคะ" call someone; the particle there does not end a sentence. */
const ADDRESS_TERMS = new Set([
  'พี่', 'น้อง', 'ลุง', 'ป้า', 'น้า', 'อา', 'ตา', 'ยาย', 'ปู่', 'ย่า', 'คุณ', 'หนู', 'แม่', 'พ่อ', 'ครู', 'อาจารย์', 'หมอ', 'ท่าน',
  'คุณครู', 'คุณแม่', 'คุณพ่อ', 'คุณหมอ', 'คุณลุง', 'คุณป้า', 'คุณน้า', 'คุณอา', 'คุณตา', 'คุณยาย', 'คุณปู่', 'คุณย่า',
]);

const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '«': '»', '“': '”', '‘': '’', '「': '」', '『': '』', '《': '》' };
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));

/**
 * Index ranges [open, close] of quotation marks and brackets that open and close on the same line. An unpaired mark
 * is ignored; a pair never spans a line break.
 */
export function pairedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let stack: Array<{ close: string; at: number }> = [];
  let quoteOpen = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') { stack = []; quoteOpen = -1; continue; }
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

/** A bracket or quotation pair of at most this many word tokens, without terminal punctuation, is one short phrase. */
const SHORT_PAIR_WORDS = 6;

// ── deterministic hazards of the full stop ──
const THAI_ABBREV_GROUPS = /(?:^|[^ก-๙])((?:[ก-ฮ]{1,3}\.)+)$/u;
const THAI_TITLES = new Set(['ดร.', 'นพ.', 'พญ.', 'รศ.', 'ผศ.']); // one group with two letters or more: only these
const LATIN_DOTTED = /(?:^|[^A-Za-z])(?:[A-Za-z]\.){2,}$/u; // a.m. p.m. e.g. i.e. U.S.
const LATIN_TITLES = /(?:^|[^A-Za-z])(?:Dr|Mr|Mrs|Ms|Prof|Jr|Sr|St|vs)\.$/iu;
const LIST_MARKER = /^(?:[0-9๐-๙]{1,3}|[A-Za-z]|[ก-ฮ])$/u;

/**
 * The text up to and including the full stop at index `dot` ends in an abbreviation: Thai letters with dots (พ.ศ.
 * ร.ร. ก.ค. พล.อ., one consonant such as ก. น. ม.; ดร. นพ. รศ. ผศ.) or Latin ones (Dr. Mr. a.m. p.m. e.g.). Such a
 * stop never ends a reading unit. A word of two or three letters with one dot (นก.) is not taken for one.
 */
export function endsInAbbreviation(text: string, dot: number): boolean {
  const upto = text.slice(Math.max(0, dot - 24), dot + 1);
  const thai = THAI_ABBREV_GROUPS.exec(upto);
  if (thai) {
    const groups = thai[1].split('.').filter(Boolean);
    if (groups.length >= 2) return true;
    if (groups[0].length === 1) return true;
    if (THAI_TITLES.has(thai[1])) return true;
  }
  return LATIN_DOTTED.test(upto) || LATIN_TITLES.test(upto);
}

/**
 * Thai sentence breaks (heuristic, conservative — a wrong split is worse than a long sentence):
 *  - a newline always breaks (a hard-wrapped book therefore breaks inside sentences: a known limit);
 *  - . ? ! … followed by space/end breaks, except: a full stop that closes an abbreviation (พ.ศ. ดร. น. Dr. a.m.),
 *    the stop of a list marker at the start of a unit (1. ๑. ก.), and an ellipsis (… ... ....), which ends a unit
 *    only at the end of the text, possibly followed by closing quotation marks; a dot between digits (10.30, 3.5) is
 *    never followed by a space, so it never breaks;
 *  - ฯ and ฯลฯ do not break by themselves (กรุงเทพฯ ใหญ่ is one unit);
 *  - two or more spaces break;
 *  - a single space after a sentence-final particle (ครับ ค่ะ คะ นะ …) breaks, except inside a bracket or quotation
 *    pair that holds no terminal punctuation, and after a bare form of address at the start of a unit (พี่ครับ ช่วย…).
 * A lone space elsewhere is a clause pause and does NOT split. Very long spans are divided further by
 * segmentThaiProse (prose.ts).
 */
export function segmentThaiSentences(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  const push = (a: number, b: number) => {
    while (a < b && /\s/u.test(text[a])) a++;
    while (b > a && /\s/u.test(text[b - 1])) b--;
    if (b > a) spans.push({ start: a, end: b, text: text.slice(a, b) });
  };
  const ranges = pairedRanges(text);
  /**
   * Inside a pair whose content is a single short phrase, never cut: no terminal punctuation and at most
   * SHORT_PAIR_WORDS word tokens (a longer quotation may hold several sentences, which is not decided by rule).
   */
  const insideShortPair = (at: number) =>
    ranges.some(([a, b]) => {
      if (at <= a || at >= b) return false;
      const inner = text.slice(a + 1, b);
      return !/[.?!…]/u.test(inner) && thaiTokenize(inner).filter((t) => t.isWord).length <= SHORT_PAIR_WORDS;
    });
  /** The unit so far is only a form of address plus the particle: พี่ครับ, คุณครูคะ. */
  const isAddress = (before: string) => {
    const words = thaiTokenize(before).filter((t) => t.isWord).map((t) => t.normalized);
    return words.length >= 2 && words.length <= 3 && SENTENCE_FINAL_PARTICLES.includes(words[words.length - 1])
      && words.slice(0, -1).every((w) => ADDRESS_TERMS.has(w));
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i;
      while (j < text.length && (text[j] === '\n' || text[j] === '\r')) j++;
      push(start, i); start = j; i = j; continue;
    }
    if ('.?!…'.includes(ch)) {
      let j = i;
      while (j < text.length && '.?!…'.includes(text[j])) j++;
      const run = text.slice(i, j);
      let k = j;
      while (k < text.length && '"\'”’)»'.includes(text[k])) k++;
      const ellipsis = /^[.…]+$/u.test(run) && (run.includes('…') || run.length >= 2);
      let ends = k >= text.length || /\s/u.test(text[k]);
      if (ends && ellipsis) ends = k >= text.length; // "…" ends a unit only at the end of the text
      else if (ends && run === '.') {
        if (endsInAbbreviation(text, i)) ends = false;
        else if (LIST_MARKER.test(text.slice(start, i).trim())) ends = false; // "1." at the start of a unit
      }
      if (ends) { push(start, k); start = k; }
      i = k; continue;
    }
    if (ch === ' ' || ch === ' ' || ch === '\t') {
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === ' ' || text[j] === '\t')) j++;
      const before = text.slice(start, i);
      let cut = j - i >= 2;
      if (!cut && SENTENCE_FINAL_PARTICLES.some((p) => before.endsWith(p))) cut = !insideShortPair(i) && !isAddress(before);
      if (cut) { push(start, i); start = j; }
      i = j; continue;
    }
    i++;
  }
  push(start, text.length);
  return spans;
}
