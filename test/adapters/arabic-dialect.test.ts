/**
 * The two sentence flags (src/adapters/arabic/dialect.ts) and what the sentence layer does with them: a dialect sentence is not read as
 * Standard Arabic (every reading capped at 0.45), a sentence in Persian or Urdu letters credits nothing. Sentences are the test author's own.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzedToken } from '../../src/core/adapters';
import { arDialectSignals, arForeignScript } from '../../src/adapters/arabic/dialect';
import { installArabicIndex, resetArabicIndexes, type ArabicFormIndex } from '../../src/adapters/arabic/index-store';
import { arAnalyze } from '../../src/adapters/arabic/sentence';
import { arTokenize } from '../../src/adapters/arabic/text';

const mini = JSON.parse(fs.readFileSync(new URL('./arabic-mini-index.json', import.meta.url), 'utf8')) as ArabicFormIndex;
beforeAll(() => { resetArabicIndexes(); installArabicIndex(mini); });
afterAll(() => resetArabicIndexes());

const sig = (t: string) => arDialectSignals(arTokenize(t));
const all = (a: AnalyzedToken[]) => a.flatMap((x) => x.candidates);
const credited = (a: AnalyzedToken[]) => all(a).filter((c) => c.confidence >= 0.5 && !c.unconfirmed && c.lemma);

describe('arDialectSignals', () => {
  it('one marker Standard Arabic cannot produce flags the sentence, with its variety', () => {
    expect(sig('هو مش هنا')).toMatchObject({ variety: 'egyptian', markers: ['مش'] });
    expect(sig('شو اسمك')?.variety).toBe('levantine');
    expect(sig('هذا ديال الأستاذ')?.variety).toBe('maghrebi');
    expect(sig('شلون الحال')?.variety).toBe('iraqi');
  });
  it('two different markers flag even when each alone is a Standard word or a clitic chain (ليش، وين)', () => {
    expect(sig('ليش وين')).toBeDefined();
    expect(sig('وين بدك تروح')?.variety).toBe('levantine');
  });
  it('NEGATIVE: one weak marker never flags (ليش، وين، هواية، الحين، كمان)', () => {
    for (const t of ['ليش', 'وين البيت', 'هواية جميلة', 'قرأ الحين', 'عزف على كمان']) expect(sig(t), t).toBeUndefined();
  });
  it('NEGATIVE: a Standard sentence with look-alikes inside longer words is untouched', () => {
    for (const t of ['مشاهدة الأفلام هواية جميلة', 'شوقي يحب الشعر', 'عايشت الحرب في المدينة']) expect(sig(t), t).toBeUndefined();
  });
  it('the Egyptian negation ما … ـش and a بـ-prefixed imperfect count as weak markers (the latter only when the caller says the word is not Standard)', () => {
    expect(sig('ما كتبتش الدرس مش هنا')).toBeDefined();
    const opts = { isStandardKey: () => false, isImperfectKey: (k: string) => k === 'يكتب' };
    expect(arDialectSignals(arTokenize('بيكتب وين'), opts)).toBeDefined();
    expect(arDialectSignals(arTokenize('بيكتب'), opts)).toBeUndefined();
    expect(arDialectSignals(arTokenize('بيكتب وين'), { isStandardKey: () => true, isImperfectKey: () => true })).toBeUndefined();
  });
});

describe('a dialect sentence in the analyser', () => {
  const a = arAnalyze(arTokenize('انا مش عايز اروح هناك دلوقتي'));
  it('every reading is capped at 0.45 and flagged; nothing is credited', () => {
    expect(credited(a)).toEqual([]);
    for (const c of all(a)) {
      expect(c.confidence).toBeLessThanOrEqual(0.45);
      expect(c.notes?.variety).toBe('dialect?');
      expect(c.notes?.dialect).toBe('egyptian');
      expect(c.notes?.context).toBe('dialect sentence: not read as Standard Arabic');
    }
  });
  it('a marker the lexicon does not know still shows what it is: one uncredited reading without a lemma', () => {
    const w = a.filter((x) => x.token.surface === 'عايز')[0];
    expect(w.candidates).toHaveLength(1);
    expect(w.candidates[0]).toMatchObject({ unconfirmed: true });
    expect(w.candidates[0].lemma).toBeUndefined();
  });
  it('the Levantine example is flagged too, and the Classical variety switches the flag off', () => {
    expect(credited(arAnalyze(arTokenize('شو بدك تاكل هلق')))).toEqual([]);
    const cla = arAnalyze(arTokenize('هو مش هنا'), { varietyId: 'ar-cla' });
    expect(all(cla).some((c) => c.notes?.variety === 'dialect?')).toBe(false);
  });
  it('NEGATIVE: a Standard sentence beside a dialect one is not touched (flags are per sentence)', () => {
    const b = arAnalyze(arTokenize('هو مش هنا. في البيت'));
    const std = b.filter((x) => x.token.start > 8 && x.token.isWord);
    for (const c of std.flatMap((x) => x.candidates)) expect(c.notes?.variety).toBeUndefined();
  });
});

describe('arForeignScript', () => {
  it('Persian, Urdu: letters Arabic never uses (or Persian-only borrowed ones in a third of the words)', () => {
    expect(arForeignScript(arTokenize('پدرم در کتابخانه چای نوشید'))).toContain('Persian');
    expect(arForeignScript(arTokenize('او گفت که پدرش آمد'))).toBeDefined();
    expect(arForeignScript(arTokenize('یہ کتاب ہے'))).toBeDefined();
  });
  it('NEGATIVE: one ک or ی typed in an Arabic sentence, one پ in a place name, and plain Arabic are not flagged', () => {
    expect(arForeignScript(arTokenize('الکتاب الجديد في البيت'))).toBeUndefined();
    expect(arForeignScript(arTokenize('سافر إلى پاريس بالطائرة'))).toBeUndefined();
    expect(arForeignScript(arTokenize('هذا كتاب جديد'))).toBeUndefined();
  });
  it('a Persian-letters text with no Arabic-only sign and no article: flagged by the majority of ک / ی', () => {
    expect(arForeignScript(arTokenize('کتاب کهنه را دیدم'))).toBeDefined();
  });
});

describe('a foreign-script sentence in the analyser', () => {
  it('every reading is unconfirmed, at 0.35 or less, "not Arabic"; nothing is credited', () => {
    const a = arAnalyze(arTokenize('پدرم چای هذا'));
    expect(credited(a)).toEqual([]);
    const cs = all(a);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(c.unconfirmed).toBe(true);
      expect(c.confidence).toBeLessThanOrEqual(0.35);
      expect(String(c.notes?.context)).toContain('not Arabic');
    }
  });
  it('NEGATIVE: an Arabic sentence with one ک typo is read as Arabic', () => {
    const a = arAnalyze(arTokenize('هذا الکتاب جديد'));
    expect(all(a).some((c) => c.unconfirmed && c.notes?.notArabic)).toBe(false);
    expect(all(a).length).toBeGreaterThan(0);
  });
});
