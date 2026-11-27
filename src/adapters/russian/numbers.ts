/**
 * Cardinal numbers 0 … 999 999 999 999 in Russian words, nominative case, for speech normalisation (a digit is spoken, never left
 * as a digit). Machine-drafted, not reviewed by a native speaker.
 *
 * Agreement the function gets right:
 *   - the last digit group takes the gender asked for (`opts.gender`, masculine by default): один / одна / одно, два / две / два.
 *     21 → двадцать один, 22 feminine → двадцать две. 11–14 never change (одиннадцать, двенадцать).
 *   - тысяча is feminine, so the thousands group counts with одна / две: 1000 одна тысяча, 2000 две тысячи, 21000 двадцать одна тысяча.
 *     (Speech also says plain «тысяча» for 1000; «одна тысяча» is equally correct and keeps every group written the same way.)
 *   - миллион and миллиард are masculine: один миллион, два миллиона.
 *   - the noun after a group counts by its last two digits: …1 (not 11) singular (тысяча, миллион), …2–4 (not 12–14) the "few" form
 *     (тысячи, миллиона), everything else, including 11–14, the genitive plural (тысяч, миллионов).
 *   - a group of 000 is skipped (1 000 001 is один миллион один, not … тысяч).
 *
 * Only the nominative is produced. After a preposition or with another case the words change (с пятью, до пяти) and this module does not
 * know the context; the caller (speech.ts) says so.
 */

export type RuGender = 'm' | 'f' | 'n';

const UNITS_M = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

/** The unit word of 1 or 2 in a gender; every other unit is the same in all three. */
function unit(d: number, g: RuGender): string {
  if (d === 1) return g === 'f' ? 'одна' : g === 'n' ? 'одно' : 'один';
  if (d === 2) return g === 'f' ? 'две' : 'два';
  return UNITS_M[d];
}

/** 0 < n < 1000 as words (n = 0 gives the empty string: a zero group is not spoken). */
function below1000(n: number, g: RuGender): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r >= 10 && r < 20) parts.push(TEENS[r - 10]);
  else {
    if (r >= 20) parts.push(TENS[Math.floor(r / 10)]);
    if (r % 10) parts.push(unit(r % 10, g));
  }
  return parts.join(' ');
}

/** Which of the three noun forms a count asks for: 0 singular, 1 "few" (2–4), 2 "many" (genitive plural). */
function form(n: number): 0 | 1 | 2 {
  const t = n % 100;
  if (t >= 11 && t <= 19) return 2;
  const d = n % 10;
  return d === 1 ? 0 : d >= 2 && d <= 4 ? 1 : 2;
}

const GROUPS: ReadonlyArray<{ gender: RuGender; forms: readonly [string, string, string] }> = [
  { gender: 'm', forms: ['', '', ''] },
  { gender: 'f', forms: ['тысяча', 'тысячи', 'тысяч'] },
  { gender: 'm', forms: ['миллион', 'миллиона', 'миллионов'] },
  { gender: 'm', forms: ['миллиард', 'миллиарда', 'миллиардов'] },
];

/**
 * The words of an integer 0 … 999 999 999 999 in the nominative, or undefined for a non-integer, a negative number or anything
 * larger. `gender` (default masculine) is the gender of the thing counted, which matters only for the last group's 1 and 2.
 */
export function ruNumberToWords(n: number, opts?: { gender?: RuGender }): string | undefined {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) return undefined;
  if (n === 0) return 'ноль';
  const gender = opts?.gender ?? 'm';
  const out: string[] = [];
  for (let g = GROUPS.length - 1; g >= 0; g--) {
    const count = Math.floor(n / 1000 ** g) % 1000;
    if (!count) continue;
    const spec = GROUPS[g];
    out.push(below1000(count, g === 0 ? gender : spec.gender));
    if (g > 0) out.push(spec.forms[form(count)]);
  }
  return out.join(' ');
}
