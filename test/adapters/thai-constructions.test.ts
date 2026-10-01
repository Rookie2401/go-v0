import { describe, expect, it } from 'vitest';
import { THAI_CONSTRUCTIONS } from '../../src/adapters/thai/constructions';
import { patterns } from './helpers';

const keysOf = (text: string) => patterns('th', text).map((p) => p.key);
const find = (text: string, key: string) => patterns('th', text).filter((p) => p.key === key);

describe('Thai constructions', () => {
  it('has the five original keys and about thirty constructions, with unique keys', () => {
    const keys = THAI_CONSTRUCTIONS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(25);
    // the five originals are emitted by the first-seed detectors
    const seed = ['royal-verb', 'negation-mai', 'classifier-phrase', 'final-particle', 'nominalizer-khwam'];
    expect(keysOf('พระเจ้าทรงรักโลก')).toContain(seed[0]);
    expect(keysOf('ผมไม่เข้าใจครับ')).toEqual(expect.arrayContaining([seed[1], seed[3]]));
    expect(keysOf('หนังสือสองเล่ม')).toContain(seed[2]);
    expect(keysOf('ความจริง')).toContain(seed[4]);
    for (const k of keys) expect(seed).not.toContain(k);
  });

  it('every construction has a title, a plain explanation with its Thai example and English, and an example', () => {
    for (const c of THAI_CONSTRUCTIONS) {
      expect(c.title.length, c.key).toBeGreaterThan(3);
      expect(c.explanation, c.key).toContain(c.example.th);
      expect(c.explanation.length, c.key).toBeLessThanOrEqual(260);
      expect(c.explanation, c.key).not.toMatch(/!/);
      expect(c.example.en.length, c.key).toBeGreaterThan(3);
      expect(c.nearMiss, c.key).toBeInstanceOf(Array);
    }
  });

  describe.each(THAI_CONSTRUCTIONS.map((c) => [c.key, c] as const))('%s', (_key, c) => {
    it('fires on its example, with confidence of at least 0.6 and a valid span', () => {
      const hits = find(c.example.th, c.key);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      for (const h of hits) {
        expect(h.confidence).toBeGreaterThanOrEqual(0.6);
        expect(h.confidence).toBeLessThanOrEqual(1);
        expect(h.title).toBe(c.title);
        expect(h.explanation).toBe(c.explanation);
        expect(h.tokenIndexes.length).toBeGreaterThanOrEqual(1);
        expect([...h.tokenIndexes].sort((a, b) => a - b)).toEqual(h.tokenIndexes);
      }
    });

    it('stays silent on its near misses', () => {
      for (const n of c.nearMiss) expect(keysOf(n), `${c.key} on ${n}`).not.toContain(c.key);
    });
  });

  it('a detector that rests on a lexical coincidence reports below 0.6', () => {
    // กำลัง before a word the lexicon does not know
    expect(find('ฉันกำลังเปียกน้ำ', 'progressive-kamlang').every((p) => p.confidence < 0.6)).toBe(true);
    // ไม่มีอะไร is "nothing", not a question
    const nothing = find('ฉันไม่มีอะไร', 'question-word-in-place');
    expect(nothing.length).toBe(1);
    expect(nothing[0].confidence).toBeLessThan(0.6);
    // ว่า after a verb that does not introduce speech or thought
    const wa = find('ฉันกินว่า', 'complement-wa');
    expect(wa.length).toBe(1);
    expect(wa.every((p) => p.confidence < 0.6)).toBe(true);
  });

  it('a question word stays in place and is found each time', () => {
    expect(find('คุณชอบกินอะไร', 'question-word-in-place')).toHaveLength(1);
    expect(find('คุณอยู่ที่ไหน', 'question-word-in-place')).toHaveLength(1);
    expect(find('ราคาเท่าไร', 'question-word-in-place')).toHaveLength(1);
    expect(find('คุณชอบกินอะไร ใครกิน', 'question-word-in-place')).toHaveLength(2);
  });

  it('the polite particle after a question marker is handled (ไหมครับ, หรือเปล่าคะ)', () => {
    expect(find('คุณหิวไหมครับ', 'yes-no-question')).toHaveLength(1);
    expect(find('คุณหิวหรือเปล่าคะ', 'yes-no-question')).toHaveLength(1);
    expect(find('คุณหิวใช่ไหม', 'yes-no-question')[0].tokenIndexes).toHaveLength(2);
    expect(find('คุณหิวครับ', 'yes-no-question')).toHaveLength(0);
  });

  it('ability and "did not" are told apart by where ได้ stands', () => {
    expect(keysOf('ฉันกินไม่ได้')).toContain('ability-dai');
    expect(keysOf('ฉันกินไม่ได้')).not.toContain('did-not-mai-dai');
    expect(keysOf('ฉันไม่ได้กิน')).toContain('did-not-mai-dai');
    expect(keysOf('ฉันไม่ได้กิน')).not.toContain('ability-dai');
    expect(keysOf('เขากินได้')).toContain('ability-dai');
    expect(keysOf('เขาได้กิน')).not.toContain('ability-dai');
  });

  it('ให้ is causative before a person + verb, benefactive after a verb and its object', () => {
    expect(keysOf('ฉันอยากให้เขาไป')).toContain('causative-hai');
    expect(keysOf('ฉันอยากให้เขาไป')).not.toContain('benefactive-hai');
    expect(keysOf('ฉันซื้อหนังสือให้เขา')).toContain('benefactive-hai');
    expect(keysOf('ฉันซื้อหนังสือให้เขา')).not.toContain('causative-hai');
    expect(keysOf('ฝนทำให้ฉันเหนื่อย')).toContain('causative-hai');
  });

  it('ถูก is passive before a verb (with or without the doer) and not "cheap"', () => {
    expect(find('เด็กถูกหมากัด', 'passive-thuk')[0].tokenIndexes).toHaveLength(3);
    expect(find('ฉันถูกกัด', 'passive-thuk')[0].tokenIndexes).toHaveLength(2);
    expect(keysOf('ของถูกมาก')).not.toContain('passive-thuk');
    expect(keysOf('ราคาถูก')).not.toContain('passive-thuk');
  });

  it('directions after a verb are one construction, including เข้าไป kept whole by the segmenter', () => {
    expect(find('เขาเดินเข้าไป', 'directional-after-verb')).toHaveLength(1);
    expect(find('เขาวิ่งออกไป', 'directional-after-verb')[0].tokenIndexes).toEqual([1, 2, 3]);
    expect(keysOf('ฉันไปตลาด')).not.toContain('directional-after-verb');
    expect(keysOf('ฉันมาถึง')).not.toContain('directional-after-verb');
  });

  it('ถ้า … ก็ and เพราะ … จึง pair their two words; ๆ is found on its word', () => {
    const cond = find('ถ้าฉันหิว ฉันก็กิน', 'conditional-tha-ko')[0];
    expect(cond.tokenIndexes).toEqual([0, 4]);
    const cause = find('เพราะฉันหิว ฉันจึงกินข้าว', 'cause-result-phro-chung')[0];
    expect(cause.tokenIndexes).toEqual([0, 4]);
    expect(find('เด็กๆชอบกินขนม', 'reduplication-mai-yamok')).toHaveLength(1);
    expect(keysOf('เด็กชอบกินขนม')).not.toContain('reduplication-mai-yamok');
  });

  it('no construction is reported twice for the same span', () => {
    for (const text of ['ฉันกำลังกินข้าวอยู่', 'คุณชอบกินอะไร', 'เขาเดินเข้าไป', 'ถ้าฉันหิว ฉันก็กิน']) {
      const ids = patterns('th', text).map((p) => `${p.key}|${p.tokenIndexes.join(',')}`);
      expect(new Set(ids).size, text).toBe(ids.length);
    }
  });

  it('the bundled seed sentences get the same original patterns as before, plus any new ones', () => {
    const seed = new Set(['royal-verb', 'negation-mai', 'classifier-phrase', 'final-particle', 'nominalizer-khwam']);
    expect(patterns('th', 'พระเจ้าทรงรักโลก').filter((p) => seed.has(p.key)).map((p) => p.key)).toEqual(['royal-verb']);
    expect(patterns('th', 'ผมไม่เข้าใจเรื่องหนึ่ง').filter((p) => seed.has(p.key)).map((p) => p.key)).toEqual(['negation-mai']);
  });
});
