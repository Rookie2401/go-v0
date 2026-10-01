import { describe, expect, it } from 'vitest';
import { adapter, applySuggestion, best, errors, patterns, phrases, run, words } from './helpers';
import { THAI_COMPOUNDS, thLexicon, thNumberToWords, thaiInitialClass } from '../../src/adapters/th';

const th = adapter('th');

describe('Thai adapter', () => {
  it('segments unspaced Thai into words with Intl.Segmenter (พระเจ้าทรงรักโลก → ≥ 4 words)', () => {
    const text = 'พระเจ้าทรงรักโลก';
    expect(text.includes(' ')).toBe(false);
    const r = run('th', text);
    expect(words(r)).toEqual(['พระเจ้า', 'ทรง', 'รัก', 'โลก']);
    expect(words(r).length).toBeGreaterThanOrEqual(4);
    r.tokens.forEach((t) => expect(text.slice(t.start, t.end)).toBe(t.surface));
    // tokens tile the text exactly (no whitespace to drop)
    expect(r.tokens.map((t) => t.surface).join('')).toBe(text);
  });

  it('drops the clause-pause spaces but keeps exact offsets', () => {
    const text = 'ตอนที่ฉันยังเด็ก ฉันไม่เข้าใจหัวใจของฉัน';
    const r = run('th', text);
    expect(r.tokens.some((t) => /\s/u.test(t.surface))).toBe(false);
    r.tokens.forEach((t) => expect(text.slice(t.start, t.end)).toBe(t.surface));
  });

  it('re-joins the listed compounds ICU splits (นิรันดร์, พระบุตร, ตอนนี้, ทุกคน)', () => {
    expect(words(run('th', 'แต่มีชีวิตนิรันดร์'))).toEqual(['แต่', 'มี', 'ชีวิต', 'นิรันดร์']);
    expect(words(run('th', 'ตอนนี้ทุกคนเชื่อในพระบุตร'))).toEqual(['ตอนนี้', 'ทุกคน', 'เชื่อ', 'ใน', 'พระบุตร']);
  });

  it('tags classifiers CLF and final particles PART; ทรง is an auxiliary', () => {
    const r = run('th', 'หนังสือสองเล่มครับ');
    expect(best(r, 'เล่ม').pos).toBe('CLF');
    expect(best(r, 'สอง').pos).toBe('NUM');
    expect(best(r, 'ครับ').pos).toBe('PART');
    expect(best(run('th', 'พระเจ้าทรงรักโลก'), 'ทรง').pos).toBe('AUX');
    // ตัว is a classifier after a number, a noun (self) before a pronoun
    expect(best(run('th', 'แมวสองตัว'), 'ตัว').pos).toBe('CLF');
    expect(best(run('th', 'หลอกลวงตัวเราเอง'), 'ตัว').pos).toBe('NOUN');
  });

  it('gives romanization from the lexicon and tone-class notes; never a tone guess', () => {
    const r = run('th', 'พระเจ้า');
    const p = th.pronunciation(r.tokens[0], r.analyses[0]);
    expect(p.transliteration).toBe('phrachao');
    expect(p.notes?.join(' ')).toMatch(/consonant class: (mid|high|low)/);
    expect(thaiInitialClass('กา')).toBe('mid');
    expect(thaiInitialClass('ขา')).toBe('high');
    expect(thaiInitialClass('คา')).toBe('low');
    expect(thaiInitialClass('เกา')).toBe('mid'); // leading vowel skipped
    // a word without lexicon romanization has none of its own — nothing is invented: it is the decoder's (when
    // every syllable is certain) or absent
    const u = run('th', 'ภูมิศาสตร์');
    const tr = th.pronunciation(u.tokens[0], u.analyses[0]).transliteration;
    if (tr !== undefined) expect(tr).toBe(th.decode!(u.tokens[0].surface).map((s) => s.romanization).join('-'));
    // a romanization the decoder contradicts is not kept: these hand values were dropped
    for (const w of ['สัตย์ซื่อ', 'ยุติธรรม', 'อธรรม', 'เหรอ']) {
      expect(thLexicon.lookup(w)[0].entry.translit, w).toBeUndefined();
    }
  });

  it('segments the new compounds as one unit (วันนี้, ผลไม้, ผู้หญิง, พระเยซู, น่าจะ …) without touching the old ones', () => {
    expect(words(run('th', 'วันนี้พรุ่งนี้เมื่อวาน'))).toEqual(['วันนี้', 'พรุ่งนี้', 'เมื่อวาน']);
    expect(words(run('th', 'ผู้หญิงกินผลไม้'))).toEqual(['ผู้หญิง', 'กิน', 'ผลไม้']);
    expect(words(run('th', 'พระเยซูทรงรัก'))).toEqual(['พระเยซู', 'ทรง', 'รัก']);
    expect(words(run('th', 'เขาน่าจะไปโรงพยาบาล'))).toEqual(['เขา', 'น่าจะ', 'ไป', 'โรงพยาบาล']);
    for (const c of THAI_COMPOUNDS) {
      const r = run('th', c);
      expect(r.tokens.map((t) => t.surface), c).toEqual([c]);
    }
  });

  it('the analysis version was raised when the lexicon grew (stored analyses are re-made)', () => {
    expect(Number(th.version)).toBeGreaterThanOrEqual(2);
    expect(run('th', 'ฉันกิน').analyses[0].analyzer).toBe(`adapter-th@${th.version}`);
  });

  it('says honestly what it is: a seed lexicon, not native-reviewed, with a tone statement', () => {
    const lim = th.support.limitations.join(' ');
    expect(th.support.lemmatization).toBe('seed-only');
    expect(lim).toMatch(/not been checked by a native speaker/);
    expect(lim).toMatch(/never a guess|does not guess|not a guess/i);
    expect(lim).not.toMatch(/Tone is not guessed: only the initial consonant class/); // the old statement is gone
    expect(th.support.phraseDetection).toBe('seed-only');
  });

  it('unknown words give empty candidates', () => {
    const r = run('th', 'ภูมิศาสตร์');
    r.analyses.filter((a) => a.token.isWord).forEach((a) => expect(a.candidates).toEqual([]));
  });

  it('detects the target phrases', () => {
    expect(phrases('th', 'ตอนที่ฉันยังเด็ก ฉันมีบาปในหัวใจ').map((p) => p.pattern.join(' '))).toContain('ตอน เด็ก');
    expect(phrases('th', 'วันหนึ่งฉันเริ่มเข้าใจบาปของฉัน').map((p) => p.pattern.join(' '))).toContain('เริ่ม เข้าใจ');
    expect(phrases('th', 'ฉันไม่เชื่อในพระเจ้า').map((p) => p.pattern.join(' '))).toContain('เชื่อ ใน _');
    expect(phrases('th', 'เพื่อทุกคนที่เชื่อในพระบุตรนั้น').map((p) => p.pattern.join(' '))).toContain('เชื่อ ใน _');
    expect(phrases('th', 'พระเจ้าทรงยกโทษให้ทุกคน').map((p) => p.pattern.join(' '))).toContain('ยก โทษ');
  });

  it('detects royal ทรง, classifier phrases, negation and final particles', () => {
    expect(patterns('th', 'พระเจ้าทรงรักโลก').map((p) => p.key)).toContain('royal-verb');
    expect(patterns('th', 'หนังสือสองเล่ม').map((p) => p.key)).toContain('classifier-phrase');
    expect(patterns('th', 'ผมไม่เข้าใจครับ').map((p) => p.key)).toEqual(expect.arrayContaining(['negation-mai', 'final-particle']));
  });

  describe('segmentSentences (conservative heuristics)', () => {
    it('does not split on a lone clause-pause space', () => {
      const t = 'ตอนที่ฉันยังเด็ก ฉันไม่เข้าใจหัวใจของฉัน';
      expect(th.segmentSentences(t).map((s) => s.text)).toEqual([t]);
    });
    it('splits after a final particle, on double space, newline, question marks and ฯ', () => {
      expect(th.segmentSentences('สวัสดีค่ะ สบายดีไหมคะ').map((s) => s.text)).toEqual(['สวัสดีค่ะ', 'สบายดีไหมคะ']);
      expect(th.segmentSentences('ฉันรักพระเจ้า  ฉันเชื่อ').map((s) => s.text)).toEqual(['ฉันรักพระเจ้า', 'ฉันเชื่อ']);
      expect(th.segmentSentences('บรรทัดหนึ่ง\nบรรทัดสอง').map((s) => s.text)).toEqual(['บรรทัดหนึ่ง', 'บรรทัดสอง']);
      expect(th.segmentSentences('คุณเชื่อไหม? ฉันเชื่อ').map((s) => s.text)).toEqual(['คุณเชื่อไหม?', 'ฉันเชื่อ']);
      expect(th.segmentSentences('กรุงเทพฯ ใหญ่').length).toBe(2);
      expect(th.segmentSentences('ดีมาก ฯลฯ และอื่นๆ').length).toBe(1);
    });
    it('spans slice the input exactly', () => {
      const t = 'สวัสดีค่ะ สบายดีไหมคะ\nขอบคุณครับ ผมสบายดี';
      th.segmentSentences(t).forEach((s) => expect(t.slice(s.start, s.end)).toBe(s.text));
    });
  });

  describe('checkProduction', () => {
    it('flags a counted noun without a classifier', () => {
      const e = errors('th', 'ฉันมีหนังสือสอง');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('classifier');
      expect(errors('th', 'ฉันมีหนังสือสองเล่ม')).toEqual([]);
    });
    it('flags a number placed before the noun', () => {
      const e = errors('th', 'ฉันมีสองหนังสือ');
      expect(e.some((x) => x.category === 'classifier')).toBe(true);
    });
    it('does not flag unit nouns that count themselves (เรื่องหนึ่ง, วัน)', () => {
      expect(errors('th', 'ผมไม่เข้าใจเรื่องหนึ่ง')).toEqual([]);
      expect(errors('th', 'วันหนึ่งฉันเริ่มเข้าใจ')).toEqual([]);
    });
    it('flags the polite particle before another particle and suggests the swap', () => {
      const e = errors('th', 'ดีครับนะ');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('particle');
      expect(e[0].confidence).toBeLessThan(0.7);
      expect(applySuggestion('ดีครับนะ', e[0].suggestion!)).toBe('ดีนะครับ');
      expect(errors('th', 'ดีนะครับ')).toEqual([]);
    });
  });

  describe('speechNormalize', () => {
    it('reads digits as Thai number words, strips verse markers, never transliterates', () => {
      const r = th.speechNormalize('ฉันมีหนังสือ 21 เล่ม [16] และ ๓ ตัว', { isScripture: true });
      expect(r.speechText).toBe('ฉันมีหนังสือ ยี่สิบเอ็ด เล่ม และ สาม ตัว');
      expect(/[A-Za-z]/.test(r.speechText)).toBe(false);
      expect(r.normalizerVersion).toBe('speech-th@1');
    });
    it('number words', () => {
      expect([0, 1, 10, 11, 20, 21, 101, 1000, 100000].map(thNumberToWords)).toEqual(
        ['ศูนย์', 'หนึ่ง', 'สิบ', 'สิบเอ็ด', 'ยี่สิบ', 'ยี่สิบเอ็ด', 'หนึ่งร้อยเอ็ด', 'หนึ่งพัน', 'หนึ่งแสน']);
    });
  });
});
