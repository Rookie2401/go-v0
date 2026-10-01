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

/**
 * Thai sentence breaks (heuristic, conservative — a wrong split is worse than a long sentence):
 * newline; . ? ! … followed by space/end; ฯ followed by space (not ฯลฯ); two or more spaces; or a single
 * space right after a sentence-final particle (ครับ ค่ะ คะ นะ …). A lone space elsewhere is a clause pause
 * and does NOT split. Very long spans are divided further by segmentThaiProse (prose.ts).
 */
export function segmentThaiSentences(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  const push = (a: number, b: number) => {
    while (a < b && /\s/u.test(text[a])) a++;
    while (b > a && /\s/u.test(text[b - 1])) b--;
    if (b > a) spans.push({ start: a, end: b, text: text.slice(a, b) });
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
      let k = j;
      while (k < text.length && '"\'”’)»'.includes(text[k])) k++;
      if (k >= text.length || /\s/u.test(text[k])) { push(start, k); start = k; }
      i = k; continue;
    }
    if (ch === 'ฯ') {
      if (text.startsWith('ฯลฯ', i)) { i += 3; continue; }
      if (i + 1 >= text.length || /\s/u.test(text[i + 1])) { push(start, i + 1); start = i + 1; }
      i++; continue;
    }
    if (ch === ' ' || ch === ' ' || ch === '\t') {
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === ' ' || text[j] === '\t')) j++;
      const before = text.slice(start, i);
      if (j - i >= 2 || SENTENCE_FINAL_PARTICLES.some((p) => before.endsWith(p))) { push(start, i); start = j; }
      i = j; continue;
    }
    i++;
  }
  push(start, text.length);
  return spans;
}
