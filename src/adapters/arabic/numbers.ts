/**
 * Arabic cardinal numbers 0 … 999 999 999 999 as words, for speech normalisation and for reading digits aloud. MACHINE-DRAFTED, not
 * reviewed by a native speaker or an Arabist.
 *
 * The words are UNVOCALIZED (the usual spelling of print), except the tanwīn written on ألفاً, مليوناً, ملياراً, which is part of their spelling. A voice or a learner supplies the other vowels; this module does not claim them.
 *
 * WHAT THE FUNCTION CHOOSES, because Arabic number words depend on what is counted and on the case, which a bare digit does not say:
 *   - GENDER POLARITY. 3 to 10 take the OPPOSITE gender of the thing counted: the form with ة (ثلاثة, أربعة …) counts a MASCULINE
 *     noun, the form without it (ثلاث, أربع …) counts a feminine one. The default is `gender: 'm'`, the masculine-counted form
 *     (ثلاثة), the one used for counting in the abstract and for most masculine nouns. `gender: 'f'` gives the feminine-counted forms
 *     (ثلاث) and the feminine واحدة / اثنتان. 1 and 2 agree with the noun (واحد / واحدة, اثنان / اثنتان). 11 to 19 take it on both
 *     parts as described below. The tens, the hundreds and the thousands do not change with gender.
 *   - 11 to 19: units 3 to 9 keep the polarity (ثلاثة عشر m, ثلاث عشرة f); 11 is أحد عشر / إحدى عشرة; 12 is اثنا عشر / اثنتا عشرة.
 *   - CASE. The default is the NOMINATIVE (اثنان, عشرون, مائتان, ألفان, اثنا عشر). `case: 'oblique'` gives the accusative / genitive
 *     (اثنين, عشرين, مائتين, ألفين, اثني عشر). Only the forms that change with case change.
 *   - the hundreds are written fused (ثلاثمائة, أربعمائة …) with مائة, which is also written مئة; 200 is مائتان.
 *   - the noun after a group of thousands, millions, billions: 1 ألف (alone), 2 ألفان, 3 to 10 آلاف, 11 to 99 ألفاً (accusative
 *     singular, with the tanwīn written on the alif), a round hundred ألف (مائة ألف, مائتا ألف). The same pattern for مليون,
 *     مليونان, ملايين, مليوناً and مليار, ملياران, مليارات, ملياراً.
 *   - groups and the parts of a number are joined with و: ألف ومائتان وأربعة وثلاثون; units come before tens (واحد وعشرون).
 *
 * WHAT IT DOES NOT DO: it does not make the counted noun agree (a noun after 3 to 10 is a genitive plural, after 11 to 99 an accusative
 * singular, after 100 a genitive singular), it does not give ordinals (الأول, الثاني …), fractions, decimals, or vowels, and it does
 * not know the case of a number in a sentence: a caller that does passes `case`. A negative number, a non-integer or a number above
 * 999 999 999 999 gets undefined.
 */
import { asciiDigits } from './text';

export type ArGender = 'm' | 'f';
export interface ArNumberOptions {
  /** Gender of the thing counted (default 'm'): see the file comment on polarity. */
  gender?: ArGender;
  /** 'nominative' (default) or 'oblique' (accusative and genitive). */
  case?: 'nominative' | 'oblique';
}

const UNITS_M = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const UNITS_F = ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر'];
const TENS_NOM = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const TENS_OBL = TENS_NOM.map((t) => (t.endsWith('ون') ? `${t.slice(0, -2)}ين` : t));
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

interface Noun { one: string; two: string; twoObl: string; few: string; many: string }
const NOUNS: readonly Noun[] = [
  { one: 'ألف', two: 'ألفان', twoObl: 'ألفين', few: 'آلاف', many: 'ألفاً' },
  { one: 'مليون', two: 'مليونان', twoObl: 'مليونين', few: 'ملايين', many: 'مليوناً' },
  { one: 'مليار', two: 'ملياران', twoObl: 'مليارين', few: 'مليارات', many: 'ملياراً' },
];

/** 1 … 99 as words. */
function below100(n: number, g: ArGender, obl: boolean): string {
  const U = g === 'f' ? UNITS_F : UNITS_M;
  if (n <= 10) {
    if (n === 2) return obl ? (g === 'f' ? 'اثنتين' : 'اثنين') : U[2];
    return U[n];
  }
  if (n < 20) {
    const d = n - 10;
    if (d === 1) return g === 'f' ? 'إحدى عشرة' : 'أحد عشر';
    if (d === 2) return g === 'f' ? (obl ? 'اثنتي عشرة' : 'اثنتا عشرة') : obl ? 'اثني عشر' : 'اثنا عشر';
    return g === 'f' ? `${U[d]} عشرة` : `${U[d]} عشر`;
  }
  const t = Math.floor(n / 10);
  const u = n % 10;
  const tens = (obl ? TENS_OBL : TENS_NOM)[t];
  return u ? `${below100(u, g, obl)} و${tens}` : tens;
}

/** 1 … 999 as words, the counted noun being of gender `g`. */
function below1000(n: number, g: ArGender, obl: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(h === 2 && obl ? 'مائتين' : HUNDREDS[h]);
  if (r) parts.push(below100(r, g, obl));
  return parts.join(' و');
}

/** A group of 1 … 999 (thousands, millions or billions) with its noun. */
function groupWithNoun(v: number, noun: Noun, obl: boolean): string {
  const h = Math.floor(v / 100);
  const r = v % 100;
  if (r === 0) return `${h === 2 ? (obl ? 'مائتي' : 'مائتا') : HUNDREDS[h]} ${noun.one}`;
  const parts: string[] = [];
  if (h) parts.push(h === 2 && obl ? 'مائتين' : HUNDREDS[h]);
  if (r === 1) parts.push(noun.one);
  else if (r === 2) parts.push(obl ? noun.twoObl : noun.two);
  else if (r <= 10) parts.push(`${UNITS_M[r]} ${noun.few}`);
  else parts.push(`${below100(r, 'm', obl)} ${noun.many}`);
  return parts.join(' و');
}

/**
 * The words of an integer 0 … 999 999 999 999, unvocalized. See the file comment for gender, case and what is not done. Undefined for
 * a non-integer, a negative number or a number above the range.
 */
export function arNumberToWords(n: number, opts?: ArNumberOptions): string | undefined {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) return undefined;
  if (n === 0) return 'صفر';
  const g = opts?.gender ?? 'm';
  const obl = opts?.case === 'oblique';
  const parts: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const v = Math.floor(n / 1000 ** (i + 1)) % 1000;
    if (v) parts.push(groupWithNoun(v, NOUNS[i], obl));
  }
  const low = n % 1000;
  if (low) parts.push(below1000(low, g, obl));
  return parts.join(' و');
}

/**
 * The integer a written number stands for: ASCII, Arabic-Indic (٠–٩) and extended Arabic-Indic (۰–۹) digits read alike, with spaces
 * and the thousands separators , and ٬ (only between groups of exactly three) allowed; a full stop is NOT a separator (1.234 may be a decimal). A decimal (٫), a sign, letters or
 * anything else gives undefined.
 */
export function arDigitsToNumber(text: string): number | undefined {
  const s = asciiDigits(text.trim());
  if (!/^\d+$/.test(s.replace(/(?<=\d)[\s,\u066C](?=\d{3}(?!\d))/g, ''))) return undefined;
  const n = Number(s.replace(/[\s,\u066C]/g, ''));
  return Number.isSafeInteger(n) ? n : undefined;
}

/** The words for a number written in digits of either script (see `arDigitsToNumber`). */
export function arDigitsToWords(text: string, opts?: ArNumberOptions): string | undefined {
  const n = arDigitsToNumber(text);
  return n === undefined ? undefined : arNumberToWords(n, opts);
}
