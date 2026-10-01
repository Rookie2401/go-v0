import { describe, expect, it } from 'vitest';
import { PHRASE_UNITS, buildPhraseRules, phraseParts } from '../../src/adapters/thai/phrases';
import { thaiTokenize } from '../../src/adapters/thai/text';
import { patterns, phrases, run } from './helpers';

const patternsOf = (text: string) => phrases('th', text).map((p) => p.pattern.join(' '));

describe('Thai phrase units', () => {
  it('lists about sixty units, each with a plain gloss and a kind', () => {
    expect(PHRASE_UNITS.length).toBeGreaterThanOrEqual(60);
    const forms = new Set<string>();
    for (const [form, gloss, kind] of PHRASE_UNITS) {
      expect(forms.has(form), form).toBe(false);
      forms.add(form);
      expect(gloss.length, form).toBeGreaterThan(0);
      expect(['collocation', 'formula', 'idiom', 'frame', 'construction']).toContain(kind);
    }
  });

  it('every unit written alone is found, as one phrase spanning the whole text', () => {
    for (const [form, gloss, kind] of PHRASE_UNITS) {
      const r = run('th', form);
      if (r.tokens.length === 1) continue; // kept whole alone (ไปหา): matched by its split form in running text, tested below
      const found = phrases('th', form).filter((p) => p.pattern[0] === form);
      expect(found.length, form).toBeGreaterThanOrEqual(1);
      const p = found[0];
      expect(p.display, form).toBe(form);
      expect(p.gloss, form).toBe(gloss);
      expect(p.kind, form).toBe(kind);
      expect(p.confidence, form).toBeGreaterThanOrEqual(0.85);
      // the phrase covers the whole written form
      const covered = p.tokenIndexes.map((i) => r.tokens[i].surface).join('');
      expect(covered, form).toBe(form);
    }
  });

  it('parts come from the segmenter, not from typing (they re-join to the written form)', () => {
    for (const [form] of PHRASE_UNITS) expect(phraseParts(form, thaiTokenize).join(''), form).toBe(form);
  });

  it('the units the plan names are all there', () => {
    const forms = new Set(PHRASE_UNITS.map((u) => u[0]));
    const lexiconWords = ['เข้าใจ', 'ทำไม', 'เท่าไร', 'ทันที', 'ที่สุด', 'ตั้งใจ', 'ดีใจ', 'เสียใจ', 'ตกใจ', 'ก็ได้', 'ไม่ใช่'];
    for (const f of [
      'ไปหา', 'ไปเที่ยว', 'กลับบ้าน', 'ไม่เป็นไร', 'เป็นอย่างไร', 'ด้วยกัน', 'เหมือนกัน', 'อีกครั้ง', 'นิดหน่อย', 'ก็แล้วกัน',
      'ไม่ค่อย', 'ไม่เคย', 'ยังไม่', 'เกือบจะ',
    ]) expect(forms.has(f), f).toBe(true);
    // the segmenter keeps these whole, so they are lexicon words with a gloss rather than phrase units
    for (const f of lexiconWords) {
      const t = thaiTokenize(f);
      if (t.length === 1) expect(run('th', f).analyses[0].candidates.length, f).toBeGreaterThan(0);
    }
  });

  it('is found in running text, including units the segmenter splits there but not alone (ไปหา)', () => {
    expect(patternsOf('ฉันไปหาเพื่อน')).toContain('ไปหา');
    expect(patternsOf('พรุ่งนี้เขาจะไปหาหมอ')).toContain('ไปหา');
    expect(patternsOf('ฉันไปโรงเรียนทุกวัน')).toEqual(expect.arrayContaining(['ไปโรงเรียน', 'ทุกวัน']));
    expect(patternsOf('เขากลับบ้านแล้ว')).toContain('กลับบ้าน');
    expect(patternsOf('ไปเที่ยวด้วยกัน')).toEqual(expect.arrayContaining(['ไปเที่ยว', 'ด้วยกัน']));
    expect(patternsOf('เขาไม่เคยไป')).toContain('ไม่เคย');
    expect(patternsOf('ฉันไม่ค่อยหิว')).toContain('ไม่ค่อย');
    expect(patternsOf('ฉันยังไม่หิว')).toContain('ยังไม่');
    expect(patternsOf('ฉันไม่ได้กินข้าว')).toEqual(expect.arrayContaining(['ไม่ได้', 'กินข้าว']));
    expect(patternsOf('ขอบคุณมากครับ')).toContain('ขอบคุณมาก');
    expect(patternsOf('ยินดีที่ได้รู้จักครับ')).toContain('ยินดีที่ได้รู้จัก');
    expect(patternsOf('เพราะว่าฉันหิว')).toContain('เพราะว่า');
    expect(patternsOf('ฉันไปตลาด แล้วก็กลับบ้าน')).toEqual(expect.arrayContaining(['แล้วก็', 'กลับบ้าน']));
    expect(patternsOf('อย่างไรก็ตาม เขามา')).toContain('อย่างไรก็ตาม');
    expect(patternsOf('คุณหิวหรือเปล่า')).toContain('หรือเปล่า');
    expect(patternsOf('คุณหิวใช่ไหม')).toContain('ใช่ไหม');
    expect(patternsOf('ทั้งๆที่เขาป่วย เขาก็ไปทำงาน')).toContain('ทั้งๆที่');
  });

  it('does not fire when the parts are not next to each other', () => {
    expect(patternsOf('กลับไปบ้าน')).not.toContain('กลับบ้าน');
    expect(patternsOf('ฉันกินผลไม้ข้าวไม่กิน')).not.toContain('กินข้าว');
    expect(patternsOf('เขาไม่ไป')).not.toContain('ไม่เคย');
    expect(patternsOf('ยังหิว')).not.toContain('ยังไม่');
    expect(patternsOf('เขาเคยไม่ไป')).not.toContain('ไม่เคย');
  });

  it('keeps the five original rules', () => {
    expect(patternsOf('ตอนที่ฉันยังเด็ก ฉันมีบาปในหัวใจ')).toContain('ตอน เด็ก');
    expect(patternsOf('วันหนึ่งฉันเริ่มเข้าใจบาปของฉัน')).toContain('เริ่ม เข้าใจ');
    expect(patternsOf('ฉันไม่เชื่อในพระเจ้า')).toContain('เชื่อ ใน _');
    expect(patternsOf('พระเจ้าทรงยกโทษให้ทุกคน')).toContain('ยก โทษ');
    expect(patternsOf('พระเจ้าทรงยกบาปของฉัน')).toContain('ยก บาป');
  });

  it('rules are deterministic and built from the same tokenizer as the adapter', () => {
    const a = buildPhraseRules(thaiTokenize);
    const b = buildPhraseRules(thaiTokenize);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThanOrEqual(65);
  });

  it('phrase detection does not disturb the tokens or offsets', () => {
    const text = 'ฉันไปเที่ยวกับเพื่อนทุกวัน';
    const r = run('th', text);
    r.tokens.forEach((t) => expect(text.slice(t.start, t.end)).toBe(t.surface));
    expect(patterns('th', text).every((p) => p.tokenIndexes.every((i) => i >= 0 && i < r.tokens.length))).toBe(true);
  });
});
