import { describe, expect, it } from 'vitest';
import type { Span } from '../../src/core';
import { thAdapter, segmentThaiSentences } from '../../src/adapters/th';
import { PROSE_CONNECTIVES, PROSE_MAX_WORDS, segmentThaiProse } from '../../src/adapters/thai/prose';
import { thaiTokenize } from '../../src/adapters/thai/text';
import { adapter } from './helpers';
import { readFileSync, readdirSync } from 'node:fs';

const th = adapter('th');
const wordCount = (s: string) => thaiTokenize(s).filter((t) => t.isWord).length;
const nonSpace = (s: string) => s.replace(/\s+/gu, '');

// one printed paragraph: single clause spaces only, several connectives, no sentence mark
const PARA =
  'ฉันกินข้าวที่บ้านทุกวัน แล้วฉันก็ไปโรงเรียนกับเพื่อน เพราะฉันชอบเรียนหนังสือมาก แต่เด็กบางคนไม่ชอบอ่านหนังสือ ' +
  'ส่วนครูก็พูดว่าเด็กต้องอ่านหนังสือทุกวัน ดังนั้นฉันจึงอ่านหนังสือก่อนนอน เมื่อฝนตกเราก็อยู่บ้าน และแม่ก็ทำอาหารให้เรากิน';

function checkInvariants(text: string, spans: Span[]) {
  spans.forEach((s) => {
    expect(text.slice(s.start, s.end)).toBe(s.text);
    expect(s.text).toBe(s.text.trim());
    expect(s.end).toBeGreaterThan(s.start);
  });
  for (let k = 1; k < spans.length; k++) expect(spans[k].start).toBeGreaterThanOrEqual(spans[k - 1].end);
  // every non-space character, in order
  expect(nonSpace(spans.map((s) => s.text).join(''))).toBe(nonSpace(text));
}

describe('segmentThaiProse', () => {
  it('has the documented limit and connectives', () => {
    expect(PROSE_MAX_WORDS).toBe(28);
    expect([...PROSE_CONNECTIVES].sort()).toEqual(['แต่', 'แล้ว', 'และ', 'เพราะ', 'จึง', 'ถ้า', 'เมื่อ', 'ส่วน', 'ดังนั้น', 'ก็'].sort());
  });

  it('is the adapter\'s segmentSentences', () => {
    expect(th.segmentSentences(PARA)).toEqual(segmentThaiProse(PARA));
  });

  it('divides a long paragraph, slicing the text exactly and covering every non-space character in order', () => {
    expect(wordCount(PARA)).toBeGreaterThan(PROSE_MAX_WORDS);
    expect(segmentThaiSentences(PARA)).toHaveLength(1); // the base rules leave it as one block
    const spans = segmentThaiProse(PARA);
    expect(spans.length).toBeGreaterThan(1);
    checkInvariants(PARA, spans);
  });

  it('divides at single spaces only, with at least 6 words in the unit and 3 left after it', () => {
    const spans = segmentThaiProse(PARA);
    for (let k = 0; k < spans.length - 1; k++) {
      expect(PARA[spans[k].end]).toBe(' ');
      expect(spans[k + 1].start).toBe(spans[k].end + 1);
      expect(wordCount(spans[k].text), `unit ${k}`).toBeGreaterThanOrEqual(6);
      expect(wordCount(PARA.slice(spans[k].end + 1)), `rest after unit ${k}`).toBeGreaterThanOrEqual(3);
    }
    // the remainder after the last cut is within the limit
    expect(wordCount(spans[spans.length - 1].text)).toBeLessThanOrEqual(PROSE_MAX_WORDS);
  });

  it('prefers a space followed by a connective', () => {
    const spans = segmentThaiProse(PARA);
    const startsWithConnective = spans.slice(1).map((s) => PROSE_CONNECTIVES.some((c) => s.text.startsWith(c)));
    expect(startsWithConnective.every(Boolean)).toBe(true);
  });

  it('never divides short text: the bundled sentences and a 28-word span come out as before', () => {
    const dir = 'data/corpus/th/';
    for (const f of readdirSync(dir)) {
      const doc = JSON.parse(readFileSync(dir + f, 'utf8')) as { paragraphs?: Array<{ sentences?: Array<{ text: string }> }> };
      const texts: string[] = [];
      const walk = (o: unknown) => {
        if (o && typeof o === 'object') {
          const rec = o as Record<string, unknown>;
          if (typeof rec.text === 'string' && /[ก-๙]/u.test(rec.text)) texts.push(rec.text);
          for (const k of Object.keys(rec)) walk(rec[k]);
        }
      };
      walk(doc);
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) expect(segmentThaiProse(t), `${f}: ${t}`).toEqual(segmentThaiSentences(t));
    }
    const short = 'ตอนที่ฉันยังเด็ก ฉันไม่เข้าใจหัวใจของฉัน';
    expect(segmentThaiProse(short).map((s) => s.text)).toEqual([short]);
  });

  it('a span of exactly 28 words is left alone; 29 words may be divided', () => {
    const unit = 'ฉันกินข้าว ';
    // each "ฉันกินข้าว" is 3 words (ฉัน กิน ข้าว)
    const n = (k: number) => Array.from({ length: k }, () => unit.trim()).join(' ');
    const w28 = n(9) + ' ฉัน'; // 27 + 1
    expect(wordCount(w28)).toBe(28);
    expect(segmentThaiProse(w28)).toHaveLength(1);
    const w30 = n(10);
    expect(wordCount(w30)).toBe(30);
    const spans = segmentThaiProse(w30);
    expect(spans.length).toBeGreaterThan(1);
    checkInvariants(w30, spans);
  });

  it('keeps the existing sentence rules: newline, double space, a final particle plus a space', () => {
    const t = `${PARA}\nสวัสดีค่ะ สบายดีไหมคะ`;
    const spans = segmentThaiProse(t);
    checkInvariants(t, spans);
    const last = spans.slice(-2).map((s) => s.text);
    expect(last).toEqual(['สวัสดีค่ะ', 'สบายดีไหมคะ']);
    expect(spans.some((s) => s.text.includes('\n'))).toBe(false);
  });

  it('never divides inside brackets or quotation marks that open and close within the span', () => {
    const open = 'ฉันกินข้าวที่บ้านทุกวัน แล้วฉันก็ไปโรงเรียนกับเพื่อน (เพราะฉันชอบ เรียนหนังสือมาก แต่เด็กบางคน ไม่ชอบอ่านหนังสือ) ';
    const t = open + 'ส่วนครูก็พูดว่า "เด็กต้องอ่านหนังสือ ทุกวัน ดังนั้นฉันจึง อ่านหนังสือ" เมื่อฝนตกเราก็อยู่บ้าน และแม่ก็ทำอาหารให้เรากิน';
    expect(wordCount(t)).toBeGreaterThan(PROSE_MAX_WORDS);
    const spans = segmentThaiProse(t);
    expect(spans.length).toBeGreaterThan(1);
    checkInvariants(t, spans);
    for (const s of spans) {
      expect((s.text.match(/\(/gu) ?? []).length, s.text).toBe((s.text.match(/\)/gu) ?? []).length);
      expect((s.text.match(/"/gu) ?? []).length % 2, s.text).toBe(0);
    }
  });

  it('never divides next to a digit, a Latin-script word, ๆ or ฯ', () => {
    const t =
      'ฉันกินข้าวที่บ้านทุกวัน 2 วัน แล้วฉันก็ไปโรงเรียนกับเพื่อน iPhone แล้วฉันก็กินข้าวอีก ' +
      'เด็กๆ ชอบกินขนมที่แม่ทำให้ ส่วนครูก็พูดว่าเด็กต้องอ่านหนังสือทุกวัน เมื่อฝนตกเราก็อยู่บ้าน และแม่ก็ทำอาหาร ' +
      'ให้เรากินที่ร้านใน กทม. แต่เด็กบางคนไม่ชอบอ่านหนังสือเลย';
    expect(wordCount(t)).toBeGreaterThan(PROSE_MAX_WORDS);
    const spans = segmentThaiProse(t);
    checkInvariants(t, spans);
    for (let k = 0; k < spans.length - 1; k++) {
      const before = t[spans[k].end - 1];
      const after = t[spans[k + 1].start];
      expect(before, `before cut ${k}`).not.toMatch(/[\p{Nd}\p{Script=Latin}ๆฯ]/u);
      expect(after, `after cut ${k}`).not.toMatch(/[\p{Nd}\p{Script=Latin}ๆฯ]/u);
    }
  });

  it('is deterministic and leaves the input untouched', () => {
    const copy = `${PARA}`;
    expect(segmentThaiProse(PARA)).toEqual(segmentThaiProse(copy));
    expect(PARA).toBe(copy);
  });

  it('a long run with no usable space stays one span', () => {
    const t = Array.from({ length: 12 }, () => 'ฉันกินข้าว').join('');
    expect(wordCount(t)).toBeGreaterThan(PROSE_MAX_WORDS);
    expect(segmentThaiProse(t)).toHaveLength(1);
  });

  it('offsets round-trip on a paragraph of mixed Thai, digits and Latin', () => {
    const text =
      'วันที่ 12 เดือนนี้ ฉันซื้อ iPhone ราคา 25,000 บาท ให้แม่ แล้วแม่ก็ดีใจมาก เพราะแม่อยากได้มานานแล้ว ' +
      'ส่วนพ่อบอกว่า OK ดีมาก เมื่อกลับบ้าน เราก็กินข้าวด้วยกัน และคุยกันเรื่อง Wi-Fi ของบ้านอีก 3 ชั่วโมง\nบรรทัดใหม่ 2 บรรทัด';
    const spans = th.segmentSentences(text);
    checkInvariants(text, spans);
    for (const s of spans) {
      const tokens = th.tokenize(s.text);
      tokens.forEach((t) => {
        expect(s.text.slice(t.start, t.end)).toBe(t.surface);
        expect(text.slice(s.start + t.start, s.start + t.end)).toBe(t.surface); // global offsets too
      });
      // tokens appear in order and do not overlap
      for (let k = 1; k < tokens.length; k++) expect(tokens[k].start).toBeGreaterThanOrEqual(tokens[k - 1].end);
    }
    // the digits and the Latin words are kept, not dropped
    const all = spans.flatMap((s) => thAdapter.tokenize(s.text)).map((t) => t.surface);
    expect(all).toEqual(expect.arrayContaining(['12', 'iPhone', 'OK']));
  });
});
