/**
 * Thai "paradigm" and segmentation alternatives (Linguistic Engine V2, Stage 3): Thai does not inflect, so `paradigm()` is
 * `kind: 'none'` with constructions; `thSegmentations` gives the tokenizer's cut and the plausible other cuts of a selection.
 * Machine-drafted word list; no native review.
 */
import { describe, expect, it } from 'vitest';
import { thAdapter, thSegmentations, THAI_CONSTRUCTION_IDS } from '../../src/adapters/th';
import { THAI_CONSTRUCTIONS } from '../../src/adapters/thai/constructions';
import { classifiersFor, thaiConstructionsFor } from '../../src/adapters/thai/paradigm';
import { thFeaturesFromTableTags } from '../../src/adapters/thai/table-tags';
import { patterns } from './helpers';

const para = (lemma: string, pos: Parameters<NonNullable<typeof thAdapter.paradigm>>[1]) => {
  const p = thAdapter.paradigm!(lemma, pos);
  if (!p) throw new Error(`no paradigm for ${lemma}`);
  return p;
};

describe('the adapter exposes generation hooks', () => {
  it('has paradigm and featuresFromTableTags; Thai has no tables to map', () => {
    expect(typeof thAdapter.paradigm).toBe('function');
    expect(typeof thAdapter.featuresFromTableTags).toBe('function');
    expect(thAdapter.featuresFromTableTags!(['plural', 'classifier', 'romanization'], 'NOUN')).toBeUndefined();
    expect(thFeaturesFromTableTags([], 'VERB')).toBeUndefined();
  });
  it('exposes segmentations on the contract (the card cuts section) in the core shape, beside the richer named export', () => {
    expect(typeof thAdapter.segmentations).toBe('function');
    expect(typeof thSegmentations).toBe('function');
    const s = thAdapter.segmentations!('ตากลม');
    expect(s).toBeDefined();
    expect(s!.chosen.words.map((w) => w.text).join('')).toBe(s!.text);
    for (const a of s!.alternatives) expect(a.words.map((w) => w.text).join('')).toBe(s!.text);
  });
});

describe('construction vocabulary', () => {
  const baseSentences = ['พระเจ้าทรงรักโลก', 'ผมไม่เข้าใจครับ', 'หนังสือสองเล่ม', 'ความจริง'];
  const fromDetectors = new Set<string>();
  for (const c of THAI_CONSTRUCTIONS) {
    for (const s of [c.example.th, ...c.nearMiss]) for (const p of patterns('th', s)) fromDetectors.add(p.key);
  }
  for (const s of baseSentences) for (const p of patterns('th', s)) fromDetectors.add(p.key);

  it('lists the five first-seed ids and every THAI_CONSTRUCTIONS key, once', () => {
    const ids = [...THAI_CONSTRUCTION_IDS];
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of ['royal-verb', 'negation-mai', 'classifier-phrase', 'final-particle', 'nominalizer-khwam']) expect(ids).toContain(k);
    for (const c of THAI_CONSTRUCTIONS) expect(ids, c.key).toContain(c.key);
    expect(ids.length).toBe(THAI_CONSTRUCTIONS.length + 5);
  });
  it('every id the detectors report on their examples is in the vocabulary', () => {
    for (const k of fromDetectors) expect(THAI_CONSTRUCTION_IDS, k).toContain(k);
  });
  it('the first-seed ids are reported by detectPatterns', () => {
    for (const k of ['royal-verb', 'negation-mai', 'classifier-phrase', 'final-particle', 'nominalizer-khwam']) expect(fromDetectors.has(k), k).toBe(true);
  });
});

describe('paradigm(): kind none with constructions', () => {
  it('VERB: no cells, one note that Thai does not change form, aspect / negation constructions', () => {
    const p = para('กิน', 'VERB');
    expect(p.kind).toBe('none');
    expect(p.cells).toEqual([]);
    expect(p.notes[0]).toMatch(/never change form/);
    expect(p.constructions).toEqual(expect.arrayContaining(['progressive-kamlang', 'continuing-yu', 'future-ja', 'completed-laeo', 'negation-mai']));
    expect(new Set(p.constructions).size).toBe(p.constructions!.length);
    for (const id of p.constructions!) expect(THAI_CONSTRUCTION_IDS, id).toContain(id);
  });
  it('a verb of saying also lists complement-wa first; a directional verb lists directional-after-verb first', () => {
    expect(para('บอก', 'VERB').constructions![0]).toBe('complement-wa');
    expect(para('ไป', 'VERB').constructions![0]).toBe('directional-after-verb');
  });
  it('NOUN: classifier constructions, and the classifier named by the word list when it records one', () => {
    const p = para('หนังสือ', 'NOUN');
    expect(p.kind).toBe('none');
    expect(p.cells).toEqual([]);
    expect(p.constructions).toEqual(expect.arrayContaining(['classifier-phrase', 'classifier-demonstrative']));
    expect(p.notes.join(' ')).toMatch(/Classifier: เล่ม/);
    for (const id of p.constructions!) expect(THAI_CONSTRUCTION_IDS, id).toContain(id);
  });
  it('NOUN: a self-counting noun says so; a noun with no recorded classifier says that, and invents none', () => {
    expect(para('วัน', 'NOUN').notes.join(' ')).toMatch(/counts itself/);
    const nok = para('นก', 'NOUN').notes.join(' ');
    expect(nok).toMatch(/records no classifier/);
    expect(nok).not.toMatch(/Classifier: /);
  });
  it('PART: politeness and sentence particles list final-particle', () => {
    for (const w of ['ครับ', 'ค่ะ', 'คะ', 'นะ']) {
      const p = para(w, 'PART');
      expect(p.kind).toBe('none');
      expect(p.constructions).toEqual(['final-particle']);
    }
    expect(para('ไหม', 'PART').constructions).toEqual(['yes-no-question', 'final-particle']);
    expect(para('ไม่', 'PART').constructions).toEqual(expect.arrayContaining(['negation-mai', 'not-at-all-mai-loei']));
  });
  it('aspect and modal markers head their own construction', () => {
    expect(thaiConstructionsFor('กำลัง', 'AUX')[0]).toBe('progressive-kamlang');
    expect(thaiConstructionsFor('จะ', 'AUX')).toEqual(['future-ja']);
    expect(thaiConstructionsFor('แล้ว', 'ADV')).toEqual(['completed-laeo']);
    expect(thaiConstructionsFor('อยู่', 'AUX')).toContain('continuing-yu');
  });
  it('a proper noun or an interjection has notes and no constructions', () => {
    const p = para('พระเจ้า', 'PROPN');
    expect(p.kind).toBe('none');
    expect(p.constructions).toEqual([]);
  });
  it('is the same for a word the list does not hold (every Thai word is invariable)', () => {
    const p = para('ไม่มีในรายการ', 'VERB');
    expect(p.kind).toBe('none');
    expect(p.cells).toEqual([]);
  });
  it('classifiersFor matches by what the classifier counts, singular or plural', () => {
    const list = [{ lemma: 'เล่ม', counts: 'books, knives' }, { lemma: 'ใบ', counts: 'leaves, bags, cards' }, { lemma: 'ขวด', counts: 'bottles, and what is in them' }];
    expect(classifiersFor('book', list).map((c) => c.lemma)).toEqual(['เล่ม']);
    expect(classifiersFor('leaf; sheet', list).map((c) => c.lemma)).toEqual(['ใบ']);
    expect(classifiersFor('bottle', list).map((c) => c.lemma)).toEqual(['ขวด']);
    expect(classifiersFor('table', list)).toEqual([]);
  });
});

describe('thSegmentations: the tokenizer\'s cut and the plausible alternatives', () => {
  const cut = (s: { words: Array<{ text: string }> }) => s.words.map((w) => w.text).join('-');

  it('ตากลม: ตา-กลม is chosen; ตากลม and ตาก-ลม are the alternatives', () => {
    const r = thSegmentations('ตากลม');
    expect(cut(r.chosen)).toBe('ตา-กลม');
    expect(r.chosen.basis).toBe('tokenizer');
    expect(r.alternatives.map(cut)).toEqual(expect.arrayContaining(['ตากลม', 'ตาก-ลม']));
    expect(r.alternatives.length).toBeLessThanOrEqual(3);
    expect(r.reason).toBeUndefined();
    for (const s of [r.chosen, ...r.alternatives]) {
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.confidence).toBeLessThanOrEqual(0.95);
    }
  });
  it('every alternative is made of known words only, and covers the selection exactly', () => {
    for (const text of ['ตากลม', 'ตากลมหน้าที่', 'คนใน', 'ไปตากลม']) {
      const r = thSegmentations(text);
      for (const s of [r.chosen, ...r.alternatives]) {
        expect(s.words.map((w) => w.text).join(''), text).toBe(r.text);
        let at = 0;
        for (const w of s.words) { expect(w.start).toBe(at); at = w.end; }
      }
      for (const a of r.alternatives) for (const w of a.words) expect(w.known, `${text}: ${w.text}`).toBe(true);
    }
  });
  it('words carry the readings of analyze; a word the list lacks is marked unknown with no reading', () => {
    const r = thSegmentations('ตากลม');
    expect(r.chosen.words[0].readings[0]).toMatchObject({ lemma: 'ตา', pos: 'NOUN' });
    expect(r.chosen.words[1]).toMatchObject({ text: 'กลม', known: false, readings: [] });
    const whole = r.alternatives.find((a) => cut(a) === 'ตากลม')!;
    expect(whole.words[0].readings[0]).toMatchObject({ lemma: 'ตากลม', pos: 'VERB' });
  });
  it('a dictionary word test (isWord) makes กลม known', () => {
    const r = thSegmentations('ตากลม', { isWord: (w) => w === 'กลม' });
    expect(r.chosen.words[1].known).toBe(true);
  });
  it('the sentence context decides the chosen cut: after ไป the tokenizer keeps ตากลม whole', () => {
    const r = thSegmentations('ตากลม', { context: { before: 'ฉันไป' } });
    expect(cut(r.chosen)).toBe('ตากลม');
    expect(r.chosen.basis).toBe('tokenizer-in-context');
  });
  it('an unambiguous word has no alternative and says why', () => {
    for (const text of ['ข้าว', 'ฉันกินข้าว', 'หนังสือสองเล่ม']) {
      const r = thSegmentations(text);
      expect(r.alternatives, text).toEqual([]);
      expect(r.reason, text).toMatch(/\S/);
      expect(r.chosen.confidence, text).toBeGreaterThanOrEqual(0.9);
    }
    expect(cut(thSegmentations('ฉันกินข้าว').chosen)).toBe('ฉัน-กิน-ข้าว');
  });
  it('a cut that is possible but far less plausible is not offered, and the reason names it', () => {
    const r = thSegmentations('คนใน');
    expect(r.alternatives).toEqual([]);
    expect(r.reason).toMatch(/คน-ใน/);
  });
  it('a selection with spaces or Latin letters is read as written, with a reason', () => {
    const r = thSegmentations('ฉัน coffee');
    expect(r.alternatives).toEqual([]);
    expect(r.reason).toMatch(/not Thai letters/);
  });
  it('respects maxAlternatives', () => {
    expect(thSegmentations('ตากลมหน้าที่', { maxAlternatives: 1 }).alternatives.length).toBeLessThanOrEqual(1);
  });
});
