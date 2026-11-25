/**
 * Korean speech normalisation (`speech-ko@1`): the text a ko-KR voice is given, made from the display text. Deterministic; never
 * romanises; never touches the display text. Built on `speechNormalizeGeneric` (NFC, verse markers out, whitespace). Machine-drafted,
 * not reviewed by a native speaker.
 *
 * DECISIONS
 * 1. A homonym number written after Hangul (눈², 쓰다¹: the identity a card or a word list may print) is removed WITHOUT a space, before the
 *    generic step that strips verse markers: the voice says the word (koBareLemma), never "two".
 * 2. Integers are read in Sino-Korean (3 → 삼, 2024년 → 이천이십사년, 15분 → 십오분): the reading of a bare number and of years, months,
 *    days, minutes, money and floors. Korean counts people, things, animals, cups, age and the hour with the NATIVE numerals (3명 is 세
 *    명): before those counters the digits are LEFT AS DIGITS (and recorded), since a Sino-Korean word would be wrong there.
 * 3. No abbreviations are expanded (none is safe without the sentence: 등 is "etc." and a noun "back").
 */
import type { SpeechNormalizationResult } from '../../core';
import { DETERMINISTIC_AT, speechNormalizeGeneric } from '../shared';

export const KO_SPEECH_TOOL = 'speech-ko@1';
/** The voice locale of the pack (GoListen's ko-KR voices). */
export const KO_SPEECH_LOCALE = 'ko-KR';

const HOMONYM_AFTER_HANGUL = /(?<=[가-힣])[⁰¹²³⁴-⁹]+/gu;

const DIGIT_WORDS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
/** A whole number up to 9,999 in Sino-Korean words (일 is left out before 십, 백, 천: 십오, 백, 천이백). */
function under10000(n: number): string {
  let out = '';
  for (const [unit, word] of [[1000, '천'], [100, '백'], [10, '십']] as const) {
    const d = Math.floor(n / unit) % 10;
    if (d) out += (d === 1 ? '' : DIGIT_WORDS[d]) + word;
  }
  return out + DIGIT_WORDS[n % 10];
}
/** Sino-Korean reading of an integer (0 to 99,999,999): 영, 삼, 이십일, 만 이천 → 만이천. */
export function koSinoNumberWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 99_999_999) return null;
  if (n === 0) return '영';
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  return (man ? (man === 1 ? '' : under10000(man)) + '만' : '') + under10000(rest);
}

/**
 * Native-numeral counters (a number before them is said 한, 두, 세 …): digits before one of them are LEFT AS DIGITS for the voice, because
 * the Sino-Korean reading would be wrong (3명 is 세 명, not 삼 명) and the native forms are not generated here. Everywhere else a number
 * is read in Sino-Korean, the reading of a bare number, years, months, days, minutes, money and floors.
 */
const NATIVE_COUNTER_AFTER = /^\s?(명|개|마리|권|잔|병|장|대|살|시(?!간)|그릇|켤레|송이|사람|번(?!째|호))/u;

export function koSpeechNormalize(displayText: string, opts?: { isScripture?: boolean }): SpeechNormalizationResult {
  const nfc = displayText.normalize('NFC');
  const stripped = nfc.replace(HOMONYM_AFTER_HANGUL, '');
  const r = speechNormalizeGeneric(stripped, {
    tool: KO_SPEECH_TOOL, ...(opts ?? {}),
    numberToWords: () => null,
  });
  // integers: Sino-Korean words, except before a native-numeral counter (recorded either way)
  const left: string[] = [];
  let changed = false;
  const spoken = r.speechText.replace(/(?<![\p{N}.,:])\d{1,8}(?![\p{N}]|[.,:]\d)/gu, (m, off: number, whole: string) => {
    if (NATIVE_COUNTER_AFTER.test(whole.slice(off + m.length))) { left.push(m); return m; }
    const w = koSinoNumberWords(Number(m));
    if (w === null) { left.push(m); return m; }
    changed = true;
    return w;
  });
  r.transformations = r.transformations.filter((t) => !/^left unexpanded/u.test(t.description));
  if (changed) r.transformations.push({ at: DETERMINISTIC_AT, tool: KO_SPEECH_TOOL, description: 'integers expanded to Sino-Korean words' });
  if (left.length) r.transformations.push({ at: DETERMINISTIC_AT, tool: KO_SPEECH_TOOL, description: `left unexpanded (before a native-numeral counter, or out of range): ${left.join(' ')}` });
  r.speechText = spoken;
  if (stripped !== nfc) r.transformations.unshift({ at: DETERMINISTIC_AT, tool: KO_SPEECH_TOOL, description: 'removed homonym numbers written after Hangul (the word is said, not its entry number)' });
  if (nfc !== displayText && !r.transformations.some((t) => t.description === 'unicode NFC')) r.transformations.unshift({ at: DETERMINISTIC_AT, tool: KO_SPEECH_TOOL, description: 'unicode NFC' });
  return r;
}
