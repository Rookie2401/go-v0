/**
 * Chapter headings in plain text. One place for the converter (`plaintext.ts`) and the quality check (`quality.ts`).
 *
 * Thai and English-with-digits headings ("บทที่ ๑", "ตอนที่ 3", "Chapter 4") are recognised for every language, exactly as
 * before. For the other languages the Western forms are recognised as well: "Capítulo I", "CAPÍTULO PRIMERO",
 * "Capítulo 12", "Libro segundo", "Parte tercera", "Chapter Two", and bare Roman numerals ("I." or "IV. Title") — the
 * last only when they form a sequence starting at I, because a lone "C." or "V." is far more often an initial.
 */
import type { LanguageCode } from '../core';

export interface Heading {
  /** The whole (indentation-trimmed) line. */
  line: string;
  /** The title that follows the numeral on the same line, when there is one. */
  title?: string;
  /** The number the heading states (digits, Roman numeral or ordinal word), when it states one. */
  number?: number;
  kind: 'numbered' | 'roman';
}

// Chapter words, written as escapes so no editor can change a character:
//   บทที่ (U+0E1A U+0E17 U+0E17 U+0E35 U+0E48), ตอนที่ (U+0E15 U+0E2D U+0E19 …), ภาคที่ (U+0E20 U+0E32 U+0E04 …).
// "ที่" is accepted with the tone mark before or after the vowel, as sloppy files have both orders.
const THI = '\\u0E17(?:\\u0E35\\u0E48|\\u0E48\\u0E35)';
const CHAPTER_WORD = `(?:\\u0E1A\\u0E17${THI}|\\u0E15\\u0E2D\\u0E19${THI}|\\u0E20\\u0E32\\u0E04${THI}|chapter)`;
/** Western digits and Thai digits ๐–๙ (U+0E50–U+0E59). */
const DIGITS = '[0-9\\u0E50-\\u0E59]+';
const AUTO_HEADING = new RegExp(`^(${CHAPTER_WORD})\\s*(${DIGITS})(.*)$`, 'iu');
const HEADING_SEPARATOR = /^[\s:：.\-–—)\]]/u;
const PUNCT_SEPARATOR = /^\s*[:：.\-–—)\]]/u;
const MAX_TITLE_LENGTH = 100;

const thaiDigitsToAscii = (s: string): string => s.replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0E50));

/** The original Thai / "Chapter N" recognition, unchanged. */
export function autoHeading(line: string): Heading | undefined {
  const m = AUTO_HEADING.exec(line);
  if (!m) return undefined;
  const rest = m[3];
  let title: string | undefined;
  if (rest !== '') {
    if (!HEADING_SEPARATOR.test(rest)) return undefined; // "บทที่ 1abc": not a heading
    title = rest.replace(/^[\s:：.\-–—)\]]+/u, '').trim();
    if (title.length > MAX_TITLE_LENGTH) return undefined; // a sentence that happens to begin with a chapter word
  }
  return { line, ...(title ? { title } : {}), number: Number(thaiDigitsToAscii(m[2])), kind: 'numbered' };
}

// ── Western headings ──

const ROMAN = '(?:X{0,3})(?:IX|IV|V?I{0,3})';
const ROMAN_ONLY = new RegExp(`^${ROMAN}$`);

const WORDS: Record<string, number> = {
  uno: 1, una: 1, primero: 1, primera: 1, primer: 1, dos: 2, segundo: 2, segunda: 2, tres: 3, tercero: 3, tercera: 3, tercer: 3,
  cuatro: 4, cuarto: 4, cuarta: 4, cinco: 5, quinto: 5, quinta: 5, seis: 6, sexto: 6, sexta: 6, siete: 7, septimo: 7, septima: 7,
  ocho: 8, octavo: 8, octava: 8, nueve: 9, noveno: 9, novena: 9, diez: 10, decimo: 10, decima: 10, once: 11, undecimo: 11, undecima: 11,
  doce: 12, duodecimo: 12, duodecima: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7,
  eight: 8, eighth: 8, nine: 9, ninth: 9, ten: 10, tenth: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const WORD_LIST = Object.keys(WORDS).join('|');
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const romanValue = (s: string): number => {
  const v: Record<string, number> = { I: 1, V: 5, X: 10 };
  let total = 0;
  for (let i = 0; i < s.length; i++) total += v[s[i]] < (v[s[i + 1]] ?? 0) ? -v[s[i]] : v[s[i]];
  return total;
};

// "Capítulo", "Cap.", "Libro", "Parte", "Canto", "Tomo", "Acto", "Escena", "Chapter", "Book", "Part" — then a number, Roman numeral or word
const WESTERN_WORD = '(?:cap[ií]tulo|cap\\.|libro|parte|canto|tomo|acto|escena|chapter|book|part)';
const WESTERN = new RegExp(`^(${WESTERN_WORD})\\s+(\\d+|${ROMAN}|${WORD_LIST})(?![\\p{L}\\d])(.*)$`, 'iu');
const ROMAN_HEADING = new RegExp(`^(${ROMAN})\\.?(?:\\s+(\\p{Lu}.*))?$`, 'u');

/** "Capítulo I", "CAPÍTULO PRIMERO", "Libro segundo", "Parte tercera", "Capítulo 12", "Chapter Two" (+ a title after a separator). */
export function westernHeading(line: string): Heading | undefined {
  const m = WESTERN.exec(line);
  if (m) {
    const token = m[2];
    const rest = m[3];
    const isDigits = /^\d+$/.test(token);
    let title: string | undefined;
    if (rest !== '') {
      // a number may be followed by a title after a space ("Capítulo 12 El regreso"); a Roman numeral or a word needs a
      // punctuation separator ("Capítulo I. El regreso"), otherwise "Parte tercera del libro ..." would be taken for a heading
      if (isDigits ? !HEADING_SEPARATOR.test(rest) : !PUNCT_SEPARATOR.test(rest) && rest.trim() !== '') return undefined;
      title = rest.replace(/^[\s:：.\-–—)\]]+/u, '').trim();
      if (title.length > MAX_TITLE_LENGTH) return undefined;
    }
    if (token === '') return undefined;
    const upper = token.toUpperCase();
    const number = isDigits ? Number(token) : /^[IVX]+$/.test(upper) && ROMAN_ONLY.test(upper) ? romanValue(upper) : WORDS[strip(token)];
    return { line, ...(title ? { title } : {}), ...(number !== undefined ? { number } : {}), kind: 'numbered' };
  }
  const r = ROMAN_HEADING.exec(line);
  if (r && r[1] !== '' && line.length <= MAX_TITLE_LENGTH + 12) {
    const title = r[2]?.trim();
    return { line, ...(title ? { title } : {}), number: romanValue(r[1]), kind: 'roman' };
  }
  return undefined;
}

// ── Hindi headings ──

// "अध्याय 3", "अध्याय ३", "भाग 2: शीर्षक", "पाठ 5", "खंड 1", "परिच्छेद 4", and the ordinal before the word ("पहला अध्याय", "दूसरा भाग").
const nfc = (s: string) => s.normalize('NFC');
const HINDI_WORD = `(?:${['अध्याय', 'भाग', 'पाठ', 'खंड', 'खण्ड', 'परिच्छेद', 'सर्ग', 'प्रकरण'].map(nfc).join('|')})`;
/** Western digits and Devanagari digits ०–९ (U+0966–U+096F). */
const HINDI_DIGITS = '[0-9\\u0966-\\u096F]+';
const HINDI_ORDINALS: Record<string, number> = Object.fromEntries(([
  ['पहला', 1], ['प्रथम', 1], ['दूसरा', 2], ['द्वितीय', 2], ['तीसरा', 3], ['तृतीय', 3], ['चौथा', 4], ['चतुर्थ', 4], ['पाँचवाँ', 5], ['पांचवां', 5], ['पंचम', 5],
  ['छठा', 6], ['छठवाँ', 6], ['सातवाँ', 7], ['सातवां', 7], ['आठवाँ', 8], ['आठवां', 8], ['नौवाँ', 9], ['नौवां', 9], ['दसवाँ', 10], ['दसवां', 10],
] as Array<[string, number]>).map(([w, n]) => [nfc(w), n]));
const HINDI_NUMBERED = new RegExp(`^(${HINDI_WORD})\\s*(${HINDI_DIGITS})(.*)$`, 'u');
const HINDI_ORDINAL = new RegExp(`^(${Object.keys(HINDI_ORDINALS).join('|')})\\s+(${HINDI_WORD})(.*)$`, 'u');
const devanagariDigitsToAscii = (s: string): string => s.replace(/[\u0966-\u096F]/g, (c) => String(c.charCodeAt(0) - 0x0966));

/** A Hindi chapter heading on a line of its own (+ a title after a separator). A sentence that begins with a chapter word is not one. */
export function hindiHeading(raw: string): Heading | undefined {
  const line = nfc(raw);
  const titleOf = (rest: string): string | undefined | false => {
    if (rest === '') return undefined;
    if (!HEADING_SEPARATOR.test(rest)) return false;
    const title = rest.replace(/^[\s:：.\-–—)\]]+/u, '').trim();
    return title.length > MAX_TITLE_LENGTH || /[\u0964?!]$/u.test(title) ? false : title || undefined;
  };
  const m = HINDI_NUMBERED.exec(line);
  if (m) {
    const title = titleOf(m[3]);
    if (title === false) return undefined;
    return { line: raw, ...(title ? { title } : {}), number: Number(devanagariDigitsToAscii(m[2])), kind: 'numbered' };
  }
  const o = HINDI_ORDINAL.exec(line);
  if (o) {
    const title = titleOf(o[3]);
    if (title === false) return undefined;
    return { line: raw, ...(title ? { title } : {}), number: HINDI_ORDINALS[o[1]], kind: 'numbered' };
  }
  return undefined;
}

// ── German headings ──

// "Kapitel 1", "Kapitel IV", "Kapitel drei", "Teil 2: Die Reise", and the ordinal before the word: "1. Kapitel", "Erstes Kapitel",
// "Zweiter Teil", "Drittes Buch", "IV. Kapitel", "Erster Aufzug".
const GERMAN_WORD = '(?:kapitel|teil|buch|abschnitt|band|aufzug|akt|auftritt|szene)';
const GERMAN_CARDINALS: Record<string, number> = {
  eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14,
  fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20,
};
const GERMAN_ORDINAL_STEMS: Record<string, number> = {
  erst: 1, zweit: 2, dritt: 3, viert: 4, fünft: 5, sechst: 6, siebt: 7, siebent: 7, acht: 8, neunt: 9, zehnt: 10, elft: 11, zwölft: 12, dreizehnt: 13,
  vierzehnt: 14, fünfzehnt: 15, sechzehnt: 16, siebzehnt: 17, achtzehnt: 18, neunzehnt: 19, zwanzigst: 20,
};
const GERMAN_AFTER = new RegExp(`^(${GERMAN_WORD})\\s+(\\d+|${ROMAN}|${Object.keys(GERMAN_CARDINALS).join('|')})(?![\\p{L}\\d])(.*)$`, 'iu');
const GERMAN_BEFORE = new RegExp(`^(?:(\\d+)\\.|(${ROMAN})\\.|(${Object.keys(GERMAN_ORDINAL_STEMS).join('|')})e[rs]?)\\s+(${GERMAN_WORD})(?![\\p{L}\\d])(.*)$`, 'iu');

/** A German chapter heading on a line of its own (+ a title after a separator). A sentence that begins with such words is not one. */
export function germanHeading(line: string): Heading | undefined {
  // the same rule as the Western forms: digits may be followed by a title after a space, anything else needs punctuation
  const titleOf = (rest: string, afterDigits: boolean): string | undefined | false => {
    if (rest === '') return undefined;
    if (afterDigits ? !HEADING_SEPARATOR.test(rest) : !PUNCT_SEPARATOR.test(rest) && rest.trim() !== '') return false;
    const title = rest.replace(/^[\s:：.\-–—)\]]+/u, '').trim();
    return title.length > MAX_TITLE_LENGTH || /[.?!]$/u.test(title) ? false : title || undefined;
  };
  const numberOf = (digits: string | undefined, roman: string | undefined, word: number | undefined): number | undefined | false => {
    if (digits) return Number(digits);
    if (roman !== undefined) return roman !== '' && ROMAN_ONLY.test(roman.toUpperCase()) ? romanValue(roman.toUpperCase()) : false;
    return word;
  };
  const a = GERMAN_AFTER.exec(line);
  if (a) {
    const isDigits = /^\d+$/.test(a[2]);
    const isRoman = !isDigits && /^[IVX]+$/i.test(a[2]);
    const number = numberOf(isDigits ? a[2] : undefined, isRoman ? a[2] : undefined, GERMAN_CARDINALS[a[2].toLowerCase()]);
    const title = titleOf(a[3], isDigits);
    if (number === false || number === undefined || title === false) return undefined;
    return { line, ...(title ? { title } : {}), number, kind: 'numbered' };
  }
  const b = GERMAN_BEFORE.exec(line);
  if (b) {
    const number = numberOf(b[1], b[2], b[3] ? GERMAN_ORDINAL_STEMS[b[3].toLowerCase()] : undefined);
    const title = titleOf(b[5], false);
    if (number === false || number === undefined || title === false) return undefined;
    return { line, ...(title ? { title } : {}), number, kind: 'numbered' };
  }
  return undefined;
}

/**
 * Detect the headings among already indentation-trimmed lines (blank lines are `''`). Returns the 0-based line index of each.
 * Thai: exactly the original rule. Other languages: also the Western forms; bare Roman headings are kept only when they run
 * 1, 2, 3 … (at least two, starting at I, most steps +1).
 */
export function detectHeadings(lines: readonly string[], lang: LanguageCode): Array<{ index: number; heading: Heading }> {
  const found: Array<{ index: number; heading: Heading }> = [];
  lines.forEach((line, index) => {
    if (line === '') return;
    const h = autoHeading(line) ?? (lang === 'hi' ? hindiHeading(line) : undefined) ?? (lang === 'de' ? germanHeading(line) : undefined) ?? (lang === 'th' ? undefined : westernHeading(line));
    if (h) found.push({ index, heading: h });
  });
  const roman = found.filter((f) => f.heading.kind === 'roman');
  if (!roman.length) return found;
  const values = roman.map((f) => f.heading.number!);
  const steps = values.slice(1).filter((v, i) => v === values[i] + 1).length;
  const keep = values.length >= 2 && values[0] === 1 && steps >= Math.ceil((values.length - 1) * 0.7);
  return keep ? found : found.filter((f) => f.heading.kind !== 'roman');
}
