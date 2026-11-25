// @vitest-environment node
/**
 * Arabic number words (unvocalized, nominative by default, masculine-counted by default) and the speech normaliser that uses them.
 * The expected words are the author's own, machine-drafted from general knowledge of Arabic; none has been checked by a native speaker
 * or an Arabist.
 */
import { describe, expect, it } from 'vitest';
import { arDigitsToNumber, arDigitsToWords, arNumberToWords } from '../../src/adapters/arabic/numbers';
import { arSpeechNormalize } from '../../src/adapters/arabic/speech';

const w = (n: number, o?: Parameters<typeof arNumberToWords>[1]): string | undefined => arNumberToWords(n, o);

describe('arNumberToWords: 0 to 99', () => {
  it('zero and the units, counted as for a masculine noun (3 to 10 with ة)', () => {
    expect(w(0)).toBe('صفر');
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => w(n))).toEqual(['واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة']);
  });
  it('11 to 19', () => {
    expect([11, 12, 13, 14, 15, 16, 17, 18, 19].map((n) => w(n))).toEqual(['أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']);
  });
  it('the tens, and units before tens joined with و', () => {
    expect([20, 30, 40, 50, 60, 70, 80, 90].map((n) => w(n))).toEqual(['عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']);
    expect(w(21)).toBe('واحد وعشرون');
    expect(w(22)).toBe('اثنان وعشرون');
    expect(w(35)).toBe('خمسة وثلاثون');
    expect(w(99)).toBe('تسعة وتسعون');
  });
});

describe('arNumberToWords: gender polarity (the masculine-counted form is the default)', () => {
  it('3 to 10 lose the ة for a feminine noun; 1 and 2 agree', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => w(n, { gender: 'f' }))).toEqual(['واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر']);
  });
  it('11 to 19 and compounds', () => {
    expect(w(11, { gender: 'f' })).toBe('إحدى عشرة');
    expect(w(12, { gender: 'f' })).toBe('اثنتا عشرة');
    expect(w(13, { gender: 'f' })).toBe('ثلاث عشرة');
    expect(w(18, { gender: 'f' })).toBe('ثماني عشرة');
    expect(w(23, { gender: 'f' })).toBe('ثلاث وعشرون');
  });
  it('hundreds and thousands do not change with gender', () => {
    expect(w(300, { gender: 'f' })).toBe(w(300));
    expect(w(3000, { gender: 'f' })).toBe(w(3000));
  });
});

describe('arNumberToWords: case', () => {
  it('the oblique forms of 2, 12, the tens, 200 and 2000', () => {
    expect(w(2, { case: 'oblique' })).toBe('اثنين');
    expect(w(12, { case: 'oblique' })).toBe('اثني عشر');
    expect(w(12, { gender: 'f', case: 'oblique' })).toBe('اثنتي عشرة');
    expect(w(20, { case: 'oblique' })).toBe('عشرين');
    expect(w(22, { case: 'oblique' })).toBe('اثنين وعشرين');
    expect(w(200, { case: 'oblique' })).toBe('مائتين');
    expect(w(2000, { case: 'oblique' })).toBe('ألفين');
    expect(w(200000, { case: 'oblique' })).toBe('مائتي ألف');
  });
});

describe('arNumberToWords: hundreds, thousands, millions', () => {
  it('the hundreds', () => {
    expect([100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => w(n))).toEqual(['مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']);
    expect(w(101)).toBe('مائة وواحد');
    expect(w(215)).toBe('مائتان وخمسة عشر');
    expect(w(999)).toBe('تسعمائة وتسعة وتسعون');
  });
  it('thousands: one, two, 3 to 10, 11 to 99, round hundreds', () => {
    expect(w(1000)).toBe('ألف');
    expect(w(2000)).toBe('ألفان');
    expect(w(3000)).toBe('ثلاثة آلاف');
    expect(w(10000)).toBe('عشرة آلاف');
    expect(w(11000)).toBe('أحد عشر ألفاً');
    expect(w(20000)).toBe('عشرون ألفاً');
    expect(w(21000)).toBe('واحد وعشرون ألفاً');
    expect(w(100000)).toBe('مائة ألف');
    expect(w(200000)).toBe('مائتا ألف');
    expect(w(300000)).toBe('ثلاثمائة ألف');
  });
  it('groups joined with و', () => {
    expect(w(1001)).toBe('ألف وواحد');
    expect(w(1234)).toBe('ألف ومائتان وأربعة وثلاثون');
    expect(w(2024)).toBe('ألفان وأربعة وعشرون');
    expect(w(101000)).toBe('مائة وألف');
    expect(w(103000)).toBe('مائة وثلاثة آلاف');
    expect(w(999999)).toBe('تسعمائة وتسعة وتسعون ألفاً وتسعمائة وتسعة وتسعون');
  });
  it('millions and billions', () => {
    expect(w(1000000)).toBe('مليون');
    expect(w(2000000)).toBe('مليونان');
    expect(w(3500000)).toBe('ثلاثة ملايين وخمسمائة ألف');
    expect(w(12000000)).toBe('اثنا عشر مليوناً');
    expect(w(1000000000)).toBe('مليار');
    expect(w(5000000000)).toBe('خمسة مليارات');
    expect(w(999_999_999_999)).toMatch(/^تسعمائة وتسعة وتسعون ملياراً/);
  });
  it('refuses what it cannot read', () => {
    for (const n of [-1, 1.5, 1_000_000_000_000, Number.NaN]) expect(w(n), String(n)).toBeUndefined();
  });
  it('is unvocalized except the tanwīn of ألفاً, مليوناً, ملياراً (it is part of their spelling)', () => {
    for (const n of [0, 1, 2, 13, 21, 200, 1234, 999999, 3500000]) expect(w(n)!.replace(/ً/g, '')).not.toMatch(/[ً-ٰٟ]/);
  });
});

describe('arDigitsToNumber: the three scripts read alike', () => {
  it('ASCII, Arabic-Indic and extended Arabic-Indic', () => {
    expect(arDigitsToNumber('123')).toBe(123);
    expect(arDigitsToNumber('١٢٣')).toBe(123);
    expect(arDigitsToNumber('۱۲۳')).toBe(123);
    expect(arDigitsToWords('٢١')).toBe(w(21));
    expect(arDigitsToWords('۲۱')).toBe(w(21));
    expect(arDigitsToWords('21', { gender: 'f' })).toBe('واحدة وعشرون');
  });
  it('separators between groups of three; nothing else', () => {
    expect(arDigitsToNumber('1,234')).toBe(1234);
    expect(arDigitsToNumber('١٬٢٣٤')).toBe(1234);
    expect(arDigitsToNumber('1 234 567')).toBe(1234567);
    for (const bad of ['1.5', '٣٫٥', '1,23', '-4', '', 'abc', '12a']) expect(arDigitsToNumber(bad), bad).toBeUndefined();
  });
});

describe('arSpeechNormalize', () => {
  it('reads digits as words, ASCII or Arabic-Indic alike', () => {
    expect(arSpeechNormalize('اشتريت 3 كتب').speechText).toBe('اشتريت ثلاثة كتب');
    expect(arSpeechNormalize('اشتريت ٣ كتب').speechText).toBe('اشتريت ثلاثة كتب');
    expect(arSpeechNormalize('عام ٢٠٢٤').speechText).toBe('عام ألفان وأربعة وعشرون');
    expect(arSpeechNormalize('۲۱').speechText).toBe('واحد وعشرون');
  });
  it('reads a number with separators as one number', () => {
    expect(arSpeechNormalize('١٬٢٣٤').speechText).toBe('ألف ومائتان وأربعة وثلاثون');
    expect(arSpeechNormalize('1,234').speechText).toBe('ألف ومائتان وأربعة وثلاثون');
  });
  it('percent', () => {
    expect(arSpeechNormalize('٥٪').speechText).toBe('خمسة في المئة');
    expect(arSpeechNormalize('5 %').speechText).toBe('خمسة في المئة');
  });
  it('leaves a decimal as digits (with a full stop) and says so', () => {
    const r = arSpeechNormalize('٣٫٥ كيلو');
    expect(r.speechText).toBe('3.5 كيلو');
  });
  it('removes tatweel and changes nothing else: every vowel mark stays', () => {
    expect(arSpeechNormalize('السـلام عليكم').speechText).toBe('السلام عليكم');
    const vowelled = 'كَتَبَ الْوَلَدُ الدَّرْسَ.';
    expect(arSpeechNormalize(vowelled).speechText).toBe(vowelled);
    expect(arSpeechNormalize(vowelled).transformations).toEqual([]);
  });
  it('leaves a numeral stuck to letters and a very long number alone', () => {
    expect(arSpeechNormalize('٣كتب').speechText).toBe('3كتب');
    expect(arSpeechNormalize('12345678').speechText).toBe('12345678');
  });
  it('strips verse markers; records every transformation with the tool name', () => {
    const r = arSpeechNormalize('الحمد لله [2] رب');
    expect(r.speechText).not.toMatch(/\[2\]/);
    expect(r.normalizerVersion).toBe('speech-ar@1');
    expect(r.transformations.length).toBeGreaterThan(0);
    for (const t of r.transformations) expect(t.tool).toBe('speech-ar@1');
  });
  it('is deterministic', () => {
    const a = arSpeechNormalize('٣ و ٤٪');
    const b = arSpeechNormalize('٣ و ٤٪');
    expect(a).toEqual(b);
  });
});
