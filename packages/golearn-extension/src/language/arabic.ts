/**
 * Arabic-script text is not Arabic because it is Arabic-script: the script is shared by Persian, Urdu, Pashto, Kurdish, Uyghur, Sindhi and
 * more. The Arabic pack reads Arabic only, so before a word list is asked, the letters themselves are checked: a letter that Arabic does
 * not have (پ چ ژ گ ٹ ڈ ں ے ہ ...) names another language outright. The check is made on the PRINTED text, before any folding (the analyser's
 * key folds ک and ی, which Persian prints, so a folded text would hide them): `NOT_ARABIC_LETTERS` of the adapter's own text module.
 *
 * This says only what the text is NOT. That a text with no such letter IS Arabic is shown by the commonest Arabic function words (the same
 * evidence the Russian path takes from its word list): at least MIN_HITS of them and a fifth of the words. Persian prints some Arabic
 * words, so the list leaves out the ones Persian shares (من, ما, او, ان, هم, كل). Pure; no data beyond the list.
 */
import { NOT_ARABIC_LETTERS } from '../../../../src/adapters/arabic/text';

/** Letters of other Arabic-script alphabets, with the language(s) each belongs to (the first match names the language). */
const OTHER_LETTERS: ReadonlyArray<{ re: RegExp; language: string }> = [
  { re: /[ٹڈڑںےہھۓ]/u, language: 'Urdu' },
  { re: /[پچژگ]/u, language: 'Persian (or Urdu, Pashto or Kurdish)' },
  { re: /[ټډړږښڅځڼ]/u, language: 'Pashto' },
  { re: /[ڕڵۆێ]/u, language: 'Kurdish (Sorani)' },
  { re: /[ەۇۈۋۉ]/u, language: 'Uyghur' },
];

export interface NotArabic {
  /** What the text looks like instead, in plain words. */
  language: string;
  /** The letters that say so. */
  evidence: string;
}

/**
 * Why Arabic-script text is not Arabic, when its own letters say so; undefined when they do not (which is NOT a statement that it is
 * Arabic). One stray letter in a long text does not decide (a Persian name in an Arabic article): the foreign letters must be at least
 * `minShare` of the Arabic letters and at least two, or, in a text of under 40 letters, at least one.
 */
export function notArabicScript(text: string, minShare = 0.01): NotArabic | undefined {
  let letters = 0;
  const found = new Map<string, number>();
  for (const ch of text) {
    if (!/\p{Script=Arabic}/u.test(ch) || !/\p{L}/u.test(ch)) continue;
    letters++;
    if (NOT_ARABIC_LETTERS.test(ch)) found.set(ch, (found.get(ch) ?? 0) + 1);
  }
  if (!letters) return undefined;
  const total = [...found.values()].reduce((a, b) => a + b, 0);
  if (!(total >= 1 && (letters < 40 || (total >= 2 && total / letters >= minShare)))) return undefined;
  const top = [...found.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const named = OTHER_LETTERS.find((o) => top.some(([ch]) => o.re.test(ch)));
  return { language: named?.language ?? 'another language written in the Arabic script', evidence: `the letter${top.length === 1 ? '' : 's'} ${top.map(([ch]) => ch).join(' ')}` };
}

/** The share of a text's letters that are in the Arabic script. */
export function arabicShare(text: string): number {
  let letters = 0, ar = 0;
  for (const ch of text) { if (!/\p{L}/u.test(ch)) continue; letters++; if (/\p{Script=Arabic}/u.test(ch)) ar++; }
  return letters ? ar / letters : 0;
}

/** The commonest Arabic function words, written without vowels, hamza seats folded to alif and final alif maqsura to yeh (see `fold`). */
const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'في', 'علي', 'الي', 'عن', 'مع', 'التي', 'الذي', 'الذين', 'هذا', 'هذه', 'ذلك', 'تلك', 'كان', 'كانت', 'قد', 'لم', 'لن', 'بين', 'حتي', 'بعد', 'عند',
  'ثم', 'هناك', 'كما', 'لكن', 'انه', 'انها', 'فيه', 'منه', 'عليه', 'هو', 'هي', 'نحن', 'ايضا', 'اذا', 'لان', 'هل',
]);
export const ARABIC_MIN_HITS = 3;
export const ARABIC_MIN_SHARE = 0.2;

/** The vowel marks, shadda, sukun, dagger alif (U+064B-U+065F, U+0670) and the tatweel (U+0640), built from code points so that no invisible mark sits in the source. */
const MARKS = new RegExp('[' + String.fromCharCode(0x64b) + '-' + String.fromCharCode(0x65f) + String.fromCharCode(0x670) + String.fromCharCode(0x640) + ']', 'gu');
const ARABIC_WORD = new RegExp('[\\p{Script=Arabic}' + String.fromCharCode(0x64b) + '-' + String.fromCharCode(0x65f) + String.fromCharCode(0x670) + String.fromCharCode(0x640) + ']+', 'gu');

/** A written word reduced to the form the list is written in: no vowel marks or tatweel, hamza seats folded, alif maqsura as yeh. */
function fold(word: string): string {
  return word.normalize('NFC').replace(MARKS, '').replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي');
}

/** How many of a text's Arabic-script words are commonest Arabic function words (alone, or with one of و ف attached). */
export function arabicFunctionShare(text: string): { hits: number; words: number; share: number } {
  const words = text.match(ARABIC_WORD) ?? [];
  let n = 0, hits = 0;
  for (const raw of words) {
    const w = fold(raw);
    if (!w || !/\p{L}/u.test(w)) continue;
    n++;
    if (FUNCTION_WORDS.has(w) || ((w[0] === 'و' || w[0] === 'ف') && FUNCTION_WORDS.has(w.slice(1)))) hits++;
  }
  return { hits, words: n, share: n ? hits / n : 0 };
}

export interface ArabicVerdict { languageId?: string; why: 'declared' | 'detected' | 'page' | 'short' | 'none' }

/**
 * The language of a block's Arabic-script text: Arabic, or none. `page` is 'ar' when the page's Arabic-script text is Arabic on evidence
 * (declared, chosen for this page, or shown by its text). Arabic script is never Arabic by default.
 */
export function arabicLanguageOf(text: string, page: string | undefined): ArabicVerdict {
  const words = (text.match(/[\p{Script=Arabic}]+/gu) ?? []).filter((w) => /\p{L}/u.test(w));
  if (!words.length) return { why: 'none' };
  const own = words.join(' ');
  if (notArabicScript(text)) return { why: 'none' }; // its own letters say Persian, Urdu, Pashto, Kurdish, Uyghur ...
  const s = arabicFunctionShare(own);
  if (s.hits >= ARABIC_MIN_HITS && s.share >= ARABIC_MIN_SHARE) return { languageId: 'ar', why: 'detected' };
  if (words.length < 3) return page === 'ar' ? { languageId: 'ar', why: 'page' } : { why: 'short' };
  return page === 'ar' ? { languageId: 'ar', why: 'page' } : { why: 'none' };
}
