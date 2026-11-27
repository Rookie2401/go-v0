/**
 * Arabic speech normalisation (`speech-ar@1`): the text a voice is given, made from the display text. Deterministic; never
 * transliterates; never touches the display text. Built on `speechNormalizeGeneric` (NFC, verse markers out, integers to words,
 * whitespace). MACHINE-DRAFTED, not reviewed by a native speaker or an Arabist.
 *
 * WHAT IS CHANGED (each step is recorded when it changed the text):
 *   1. Tatweel (ـ, U+0640) is removed: it is a typographic stretch, not a letter, and a voice may stumble on it.
 *   2. Arabic-Indic (٠–٩) and extended Arabic-Indic (۰–۹) digits become ASCII digits, so one rule reads them all alike.
 *   3. The Arabic percent sign ٪ becomes % and «5 %» is read «5 في المئة» («خمسة في المئة»).
 *   4. A thousands separator (the Arabic ٬ or a comma between groups of three: ١٬٢٣٤, 1,234) is removed so the number is read as one.
 *   5. Whole numbers of up to seven digits become words (numbers.ts), the masculine counted forms in the nominative.
 *   6. The Arabic decimal separator ٫ is written as a full stop, and a decimal number (٣٫٥) is LEFT AS DIGITS: its reading needs
 *      the word for the fraction and a voice reads the digits itself.
 *
 * WHAT IS DELIBERATELY NOT CHANGED:
 *   - The vowel marks, shadda, sukūn, hamza and every letter are left exactly as written. The voice (or the learner) reads them.
 *     Nothing is "restored", spelled out or respelled; a voice given diacritics may or may not use them, and the display text is
 *     the learner's text, not a pronunciation.
 *   - Numbers are read as masculine-counted nominative cardinals. That is wrong where Arabic needs another form: «٣ مدارس» is read
 *     «ثلاثة مدارس» but the feminine noun needs «ثلاث مدارس»; after a preposition that takes the oblique the number changes («في ٢ بيوت»
 *     needs «اثنين»); an ordinal («الـ٣» is «الثالث»), a year read as an ordinal and a date are not recognised. This module does not
 *     know the next word's gender or the case, and it does not guess. A numeral stuck to letters («٣كتب», «ب٥») is left as written.
 *   - No abbreviation is expanded (Arabic abbreviations such as ص. (page) are ambiguous without the context).
 *   - A device voice that is tagged `ar` is Modern Standard only; the text is not made "classical" in any way, and a synthetic voice
 *     reading it is not a Classical recitation (tajwīd).
 */
import type { SpeechNormalizationResult, TransformationRecord } from '../../core';
import { DETERMINISTIC_AT, speechNormalizeGeneric, type SpeechConfig } from '../shared';
import { arNumberToWords } from './numbers';
import { asciiDigits } from './text';

const TOOL = 'speech-ar@1';
const rec = (description: string): TransformationRecord => ({ at: DETERMINISTIC_AT, tool: TOOL, description });

const CONFIG: SpeechConfig = {
  tool: TOOL,
  numberToWords: (n) => arNumberToWords(n) ?? null,
  percentWord: 'في المئة',
};

/** The text for a voice: see the header for what is changed and what is deliberately left alone. */
export function arSpeechNormalize(displayText: string, _opts?: { isScripture?: boolean }): SpeechNormalizationResult {
  const before: TransformationRecord[] = [];
  let text = displayText.normalize('NFC');
  const step = (next: string, description: string): void => {
    if (next !== text) { before.push(rec(description)); text = next; }
  };
  step(text.replace(/ـ/g, ''), 'removed tatweel (a typographic stretch, not a letter)');
  step(asciiDigits(text), 'Arabic-Indic digits to ASCII digits');
  step(text.replace(/٪/g, '%'), 'Arabic percent sign to %');
  step(text.replace(/(?<![\d.,٫٬])(\d{1,3}(?:[,٬]\d{3})+)(?![\d]|[.,٫]\d)/g, (m) => m.replace(/[,٬]/g, '')), 'removed the thousands separators of a number');
  step(text.replace(/(\d)٫(?=\d)/g, '$1.'), 'Arabic decimal separator to a full stop (the decimal number is left as digits)');
  const r = speechNormalizeGeneric(text, CONFIG);
  return { speechText: r.speechText, transformations: [...before, ...r.transformations], normalizerVersion: TOOL };
}
