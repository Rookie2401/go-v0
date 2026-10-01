import { describe, expect, it } from 'vitest';
import {
  CONSTRUCTED_UNIT_CASES, bookFromGold, coversParagraph, diffEncounters, documentsFromPlainText, dwellFor, paragraphsOfDocuments, replay, sensitivity, withSegmentation,
} from '../../src/bench/units';

// Two paragraphs; the first holds two sentences separated by a space after a final particle, with the word ผม twice.
const TEXT = 'ผมชื่อสมชายครับ ผมอยู่เชียงใหม่ครับ\nวันนี้ฝนตกหนักมาก\n';

describe('boundary sensitivity probe, tiny text', () => {
  const docs = documentsFromPlainText(TEXT);

  it('forces a segmentation with explicit sentences and keeps the paragraph text', () => {
    expect(paragraphsOfDocuments(docs)).toEqual(['ผมชื่อสมชายครับ ผมอยู่เชียงใหม่ครับ', 'วันนี้ฝนตกหนักมาก']);
    const para = withSegmentation(docs[0], 'paragraph');
    expect(para.sections[0].paragraphs).toEqual([
      { sentences: [{ text: 'ผมชื่อสมชายครับ ผมอยู่เชียงใหม่ครับ' }], separator: ' ' },
      { sentences: [{ text: 'วันนี้ฝนตกหนักมาก' }], separator: ' ' },
    ]);
    const spaces = withSegmentation(docs[0], 'spaces');
    expect((spaces.sections[0].paragraphs[0] as { sentences: unknown[] }).sentences).toHaveLength(2);
    expect(withSegmentation(docs[0], 'adapter').sections[0].paragraphs[0]).toEqual({ text: 'ผมชื่อสมชายครับ ผมอยู่เชียงใหม่ครับ' });
  });

  it('the same reading under two segmentations changes the units, the encounter counts and the audio segments', async () => {
    const a = await replay(docs, 'adapter', 'reader');
    const p = await replay(docs, 'paragraph', 'reader');
    expect(a.units).toBe(3);
    expect(p.units).toBe(2);
    expect(a.audioSegments).toBe(3);
    expect(p.audioSegments).toBe(2);
    expect(a.words).toBe(p.words);
    const d = diffEncounters(a.formEncounters, p.formEncounters);
    expect(d.formsDiffering).toBeGreaterThan(0); // ผม, and ครับ, are met once per unit, not once per paragraph
    expect(d.totalA).toBeGreaterThan(d.totalB);
    expect(d.absoluteChange).toBe(d.totalA - d.totalB);
  });

  it('with the reader\'s dwell (floor and cap) the pace moves with the segmentation; with proportional dwell it does not', async () => {
    const r = await sensitivity('tiny', docs, { segmentations: ['adapter', 'paragraph', 'spaces'] });
    const get = (m: string, s: string) => r.runs.find((x) => x.dwellModel === m && x.segmentation === s)!;
    const proportional = ['adapter', 'paragraph', 'spaces'].map((s) => get('proportional', s).ungatedWordsPerMinute);
    expect(Math.max(...proportional) - Math.min(...proportional)).toBeLessThan(0.5);
    expect(get('reader', 'spaces').ungatedWordsPerMinute).toBeLessThan(get('reader', 'paragraph').ungatedWordsPerMinute); // 1.5 s floor on one-word units
    // GoLearn withholds the figure below 30 timed units: the text here is far too small to show one.
    expect(get('reader', 'adapter').wordsPerMinute).toBeUndefined();
    // lookups per 100 words is a ratio of per-word events: it does not depend on where units end
    expect(get('reader', 'adapter').lookupsPer100Words).toBe(get('reader', 'paragraph').lookupsPer100Words);
    expect(r.diffs.map((d) => `${d.base}->${d.against}`)).toEqual(['adapter->paragraph', 'adapter->spaces']);
  });

  it('dwell models: the reader\'s floor and cap, and plain proportional', () => {
    expect(dwellFor('reader', 1)).toBe(1500);
    expect(dwellFor('reader', 10)).toBe(2200);
    expect(dwellFor('reader', 200)).toBe(12000);
    expect(dwellFor('proportional', 1)).toBe(220);
    expect(dwellFor('proportional', 200)).toBe(44000);
  });

  it('diffEncounters on hand-made maps', () => {
    const a = new Map([['x', 3], ['y', 1], ['z', 2]]);
    const b = new Map([['x', 1], ['y', 1], ['w', 2]]);
    const d = diffEncounters(a, b);
    expect(d).toMatchObject({ formsA: 3, formsB: 3, formsDiffering: 3, formsOnlyInOne: 2, totalA: 6, totalB: 4, absoluteChange: 6, maxChange: 2 });
    expect(d.changePercentOfA).toBeCloseTo(100, 10);
    expect(diffEncounters(a, a)).toMatchObject({ formsDiffering: 0, absoluteChange: 0, maxChange: 0 });
  });

  it('a gold segmentation can be supplied and the book from the constructed cases drops paragraphs with a line break', async () => {
    const book = bookFromGold(CONSTRUCTED_UNIT_CASES);
    expect(book.text.includes('\r')).toBe(false);
    expect(book.kept).toBeLessThan(CONSTRUCTED_UNIT_CASES.length);
    expect(book.kept).toBe(book.text.split('\n').length);
    for (const [line, spans] of book.gold) expect(coversParagraph(line, spans), line).toBe(true);
    const small = documentsFromPlainText(book.text.split('\n').slice(0, 3).join('\n'));
    const r = await sensitivity('gold', small, { segmentations: ['adapter', 'gold'], gold: book.gold, models: ['reader'] });
    expect(r.runs.map((x) => x.segmentation)).toEqual(['adapter', 'gold']);
    expect(r.diffs.map((d) => `${d.base}->${d.against}`)).toEqual(['gold->adapter']);
  });
});
