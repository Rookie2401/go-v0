/**
 * Russian speech normalisation (`speech-ru@1`): the text a voice is given, made from the display text. Deterministic; never
 * transliterates; never touches the display text. Built on `speechNormalizeGeneric` (NFC, verse markers out, abbreviations,
 * percent, integers to words, whitespace). Machine-drafted, not reviewed by a native speaker.
 *
 * DECISIONS (each is a judgement, not a measurement of any particular voice):
 *
 * 1. Stress marks (U+0301 acute, U+0300 grave) ARE STRIPPED from the speech text. A voice has no portable way to take a stress mark in
 *    plain text; a combining mark after a vowel is, at best, ignored and, at worst, read as a stray symbol or breaks the word in two
 *    for the voice's own dictionary. The display text keeps the marks; the voice reads the plain spelling and chooses stress itself.
 *    ё is a letter and is kept (it tells the voice the stress and the vowel).
 *
 * 2. Numbers are read as masculine nominative cardinals (numbers.ts). That is wrong where Russian needs another word, so a numeral is
 *    LEFT AS DIGITS (and the transformation list says so) in the shapes where a guess would be spoken wrongly:
 *      - a numeral ending in 1 or 2 (but not 11 or 12) directly before a word: «1 книга» is одна, «2 окна» is два, «21 год» is один:
 *        the gender is the next word's and this module does not know it;
 *      - a numeral before a month in the genitive («5 января» is пятого января, an ordinal);
 *      - a year or a number before г. / гг. / год…: «в 2020 г.» is «в две тысячи двадцатом году», an ordinal in another case; «5 г» is grams;
 *      - a numeral with an ordinal ending («5-й», «3-го»): the ending would be left behind.
 *    A year with no г. after it («с 1990 по 2000») is still read as a cardinal, which is wrong; this module cannot tell a year from a quantity.
 *    Everywhere else the cardinal is correct only when the context is a plain nominative (or an accusative that looks like it:
 *    «пять книг»). After prepositions that need another case («с 5 людьми», «до 5 часов») it is not, and that is a known limit.
 *
 * 3. Percent: «5 %» → «5 процентов», «1 %» → «1 процент», «3 %» → «3 процента» (by the last digits, as numbers.ts counts), then spoken.
 *    A decimal («2,5 %») is left alone: its noun is genitive singular and its digits are not read here.
 *
 * 4. Abbreviations expanded: т. е. → то есть; т. д. → так далее; т. п. → тому подобное; т. к. → так как; в т. ч. → в том числе;
 *    и др. → и другие («и др.» can also stand for «и другое»; «и другие» is the usual reading). A full stop that ends the sentence
 *    is kept. «г.» becomes «город» ONLY at the start of a line or after a colon and before a capital letter («г. Москва»): inside a
 *    sentence the word after it takes the case of the sentence («в г. Москве» must be «в городе Москве») and a bare «город» would be
 *    wrong. «г.» after digits is a year (see 2) and is left alone. Not expanded, because the word needed depends on a case or a
 *    meaning this module cannot see: см. (смотри / centimetre), руб., коп., тыс., млн, млрд, т. н., ул., д., им., и пр.
 */
import type { SpeechNormalizationResult, TransformationRecord } from '../../core';
import { DETERMINISTIC_AT, speechNormalizeGeneric, type SpeechConfig } from '../shared';
import { ruNumberToWords } from './numbers';

const TOOL = 'speech-ru@1';
const rec = (description: string): TransformationRecord => ({ at: DETERMINISTIC_AT, tool: TOOL, description });

const STRESS_MARKS = /[\u0301\u0300]/gu;

/** A full stop that really ends the sentence after an abbreviation: end of text, a line break, or a capital letter next. */
const END = String.raw`(?=\s*$|\s*\n|\s+[А-ЯЁA-Z])`;
const NOT_AFTER_LETTER = String.raw`(?<![\p{L}\p{N}])`;
const SP = String.raw`[  ]?`;

const ABBREVIATIONS: NonNullable<SpeechConfig['abbreviations']> = [
  { pattern: new RegExp(`${NOT_AFTER_LETTER}в\\s+т\\.${SP}ч\\.`, 'gu'), replacement: 'в том числе', label: 'в т. ч.' },
  { pattern: new RegExp(`${NOT_AFTER_LETTER}т\\.${SP}е\\.`, 'gu'), replacement: 'то есть', label: 'т. е.' },
  { pattern: new RegExp(`${NOT_AFTER_LETTER}т\\.${SP}к\\.`, 'gu'), replacement: 'так как', label: 'т. к.' },
  { pattern: new RegExp(`${NOT_AFTER_LETTER}т\\.${SP}д\\.${END}`, 'gu'), replacement: 'так далее.', label: 'т. д. (end of sentence)' },
  { pattern: new RegExp(`${NOT_AFTER_LETTER}т\\.${SP}д\\.`, 'gu'), replacement: 'так далее', label: 'т. д.' },
  { pattern: new RegExp(`${NOT_AFTER_LETTER}т\\.${SP}п\\.${END}`, 'gu'), replacement: 'тому подобное.', label: 'т. п. (end of sentence)' },
  { pattern: new RegExp(`${NOT_AFTER_LETTER}т\\.${SP}п\\.`, 'gu'), replacement: 'тому подобное', label: 'т. п.' },
  { pattern: new RegExp(`${NOT_AFTER_LETTER}и\\s+др\\.${END}`, 'gu'), replacement: 'и другие.', label: 'и др. (end of sentence)' },
  { pattern: new RegExp(`${NOT_AFTER_LETTER}и\\s+др\\.`, 'gu'), replacement: 'и другие', label: 'и др.' },
  // г. before a capital: only where nothing before it can govern a case (start of a line, after a colon)
  { pattern: /(?<=^|:[  ])г\.[  ]+(?=[А-ЯЁ])/gmu, replacement: 'город ', label: 'г. (city)' },
  // percent, by the noun form the number asks for; integers only. Matched before the generic percent step, which is not used.
  { pattern: /(?<![\d.,])(\d*(?<!1)1)\s*%/gu, replacement: '$1 процент', label: '% (singular)' },
  { pattern: /(?<![\d.,])(\d*(?<!1)[2-4])\s*%/gu, replacement: '$1 процента', label: '% (2–4)' },
  { pattern: /(?<![\d.,])(\d+)\s*%/gu, replacement: '$1 процентов', label: '% (other numbers)' },
];

const MONTHS = 'января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря';
const MONTH_AFTER = new RegExp(`^\\s*(?:${MONTHS})(?![\\p{L}])`, 'u');
const YEAR_AFTER = /^\s*(?:гг?|год\p{L}*)(?![\p{L}])/u;
const ORDINAL_AFTER = /^[-–‑]\p{L}/u;
const WORD_AFTER = /^\s+\p{L}/u;

/** True when the numeral must stay as digits (see decision 2 in the header). */
function mustHold(digits: string, after: string): boolean {
  if (ORDINAL_AFTER.test(after) || YEAR_AFTER.test(after) || MONTH_AFTER.test(after)) return true;
  const n = Number(digits);
  const last2 = n % 100;
  const needsGender = n % 10 === 1 || n % 10 === 2 ? last2 !== 11 && last2 !== 12 : false;
  return needsGender && WORD_AFTER.test(after);
}

// Private-use code points stand in for the digits of a held numeral while the generic steps run, so they cannot be expanded.
const HOLD_BASE = 0xe000;
const hide = (d: string): string => [...d].map((c) => String.fromCharCode(HOLD_BASE + Number(c))).join('');
const reveal = (s: string): string => s.replace(/[-]/gu, (c) => String(c.charCodeAt(0) - HOLD_BASE));

function holdNumerals(text: string): { text: string; held: string[] } {
  const held: string[] = [];
  // not inside a bracketed verse marker, a decimal, a date or a number run
  const re = /(?<![\p{L}\p{N}.,:\[<\/\-–])(\d{1,7})(?![\p{N}\]]|[.,:]\d)/gu;
  const out = text.replace(re, (m, digits: string, offset: number, whole: string) => {
    const after = whole.slice(offset + m.length);
    if (!mustHold(digits, after)) return m;
    held.push(digits);
    return hide(digits);
  });
  return { text: out, held };
}

const CONFIG: SpeechConfig = {
  tool: TOOL,
  numberToWords: (n) => ruNumberToWords(n) ?? null,
  abbreviations: ABBREVIATIONS,
};

/** The text for a voice: see the header for what is changed and what is deliberately left alone. */
export function ruSpeechNormalize(displayText: string, _opts?: { isScripture?: boolean }): SpeechNormalizationResult {
  const before: TransformationRecord[] = [];
  let text = displayText.normalize('NFC');
  const noMarks = text.replace(STRESS_MARKS, '');
  if (noMarks !== text) { before.push(rec('removed stress marks (a voice chooses the stress itself)')); text = noMarks; }
  const { text: guarded, held } = holdNumerals(text);
  const r = speechNormalizeGeneric(guarded, CONFIG);
  const after: TransformationRecord[] = [];
  if (held.length) after.push(rec(`left as digits (gender, case or ordinal depends on the next word): ${[...new Set(held)].join(' ')}`));
  return { speechText: reveal(r.speechText), transformations: [...before, ...r.transformations, ...after], normalizerVersion: TOOL };
}
