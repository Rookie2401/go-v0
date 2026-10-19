/**
 * Pronunciation help for Latin, and the spoken form of a number. Two living traditions matter for a reader of the Vulgate: the
 * ecclesiastical ("Italianate") pronunciation of the Church and the restored Classical one; the notes name both where they differ.
 * Vowel length is not marked in the text, so the stressed syllable is shown only when the spelling decides it (two syllables: the
 * first; three or more: the penult when a vowel stands before two consonants, a diphthong or x, else the antepenult when the
 * penult is short by nature: the notes say that this last case cannot be seen without length marks).
 */
import type { PronunciationSupport } from '../../core';
import { stripMarks } from './orthography';

const VOWELS = 'aeiouy';
const LIQUID_CLUSTERS = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'ph', 'th', 'ch']);

/** Split a word into syllables (a rule-of-thumb split: one consonant goes to the next syllable, two are divided, a stop + liquid stays together). */
export function syllabify(word: string): string[] {
  const w = stripMarks(word).toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe');
  // mark nuclei: vowels, with ae oe au as one nucleus and qu / ngu as consonants
  const chars = [...w];
  const isV = (i: number): boolean => VOWELS.includes(chars[i] ?? '') && !(chars[i] === 'u' && (chars[i - 1] === 'q' || (chars[i - 1] === 'g' && chars[i - 2] === 'n' && VOWELS.includes(chars[i + 1] ?? ''))));
  const nuclei: Array<[number, number]> = [];
  for (let i = 0; i < chars.length; i++) {
    if (!isV(i)) continue;
    const pair = chars[i] + (chars[i + 1] ?? '');
    if ((pair === 'ae' || pair === 'oe' || pair === 'au') && isV(i + 1)) { nuclei.push([i, i + 1]); i++; }
    else nuclei.push([i, i]);
  }
  if (nuclei.length <= 1) return [w];
  const cuts: number[] = [];
  for (let n = 0; n < nuclei.length - 1; n++) {
    const from = nuclei[n][1] + 1;
    const to = nuclei[n + 1][0];
    const between = chars.slice(from, to).join('');
    let cut: number;
    if (between.length <= 1) cut = from + (between === 'x' ? 1 : 0);
    else if (LIQUID_CLUSTERS.has(between.slice(-2))) cut = to - 2;
    else cut = from + 1;
    cuts.push(cut);
  }
  const out: string[] = [];
  let prev = 0;
  for (const c of cuts) { out.push(w.slice(prev, c)); prev = c; }
  out.push(w.slice(prev));
  return out.filter(Boolean);
}

/** Index of the stressed syllable when the spelling decides it, else undefined. */
function stressedIndex(sy: string[]): number | undefined {
  if (sy.length === 1) return 0;
  if (sy.length === 2) return 0;
  const penult = sy[sy.length - 2];
  const nucleus = penult.match(/(ae|oe|au|[aeiouy])/)?.[0] ?? '';
  const after = penult.slice(penult.indexOf(nucleus) + nucleus.length);
  const next = sy[sy.length - 1][0] ?? '';
  const heavyByPosition = nucleus.length === 2 || /[^aeiouy]/.test(after) || (!after && /[^aeiouy]/.test(next) && false);
  if (heavyByPosition) return sy.length - 2;
  return undefined;
}

export function latinPronunciation(surface: string): PronunciationSupport {
  const w = stripMarks(surface).toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe');
  const sy = syllabify(w);
  const notes: string[] = [];
  const si = stressedIndex(sy);
  const shown = sy.map((s, i) => (i === si ? s.toUpperCase() : s)).join('·');
  if (sy.length > 2 && si === undefined) notes.push('Stress is on the penultimate syllable if its vowel is long, otherwise on the one before it; the text does not mark vowel length, so look the word up with its macrons.');
  else if (sy.length === 2) notes.push('A two-syllable word is stressed on the first syllable.');
  if (/ae|oe/.test(w)) notes.push('ae and oe: "e" in the ecclesiastical pronunciation (caelum: CHAY-loom), "ai" and "oi" in the classical one.');
  if (/c(?=[eiy]|ae|oe)/.test(w)) notes.push('c before e, i, y, ae, oe: "ch" (as in church) in the ecclesiastical pronunciation, "k" in the classical one.');
  if (/g(?=[eiy]|ae|oe)/.test(w)) notes.push('g before e, i, y, ae, oe: "j" (as in gem) in the ecclesiastical pronunciation, hard "g" in the classical one.');
  if (/sc(?=[eiy]|ae|oe)/.test(w)) notes.push('sc before e, i, y, ae, oe: "sh" in the ecclesiastical pronunciation, "sk" in the classical one.');
  if (/ti(?=[aeou])/.test(w)) notes.push('ti before a vowel: "tsee" in the ecclesiastical pronunciation (gratia: GRAH-tsee-ah), "ti" in the classical one.');
  if (/^h|h/.test(w)) notes.push('h is silent in the ecclesiastical pronunciation (mihi, nihil: "mee-kee", "nee-keel" in the Church tradition).');
  if (/gn/.test(w)) notes.push('gn: "ny" in the ecclesiastical pronunciation (agnus: AH-nyoos).');
  if (/(^|[^a-z])v|u(?=[aeio])/.test(w)) notes.push('v (or consonantal u): "v" in the ecclesiastical pronunciation, "w" in the classical one.');
  if (/j|(^|[^a-z])i(?=[aeou])/.test(w)) notes.push('j (or consonantal i): "y" as in yes.');
  if (/ph/.test(w)) notes.push('ph: "f"; th: "t"; ch: "k" (Greek letters).');
  if (/qu/.test(w)) notes.push('qu: "kw".');
  return { transliteration: shown, notes };
}

const U = ['nulla', 'unus', 'duo', 'tres', 'quattuor', 'quinque', 'sex', 'septem', 'octo', 'novem', 'decem', 'undecim', 'duodecim', 'tredecim', 'quattuordecim', 'quindecim', 'sedecim', 'septendecim', 'duodeviginti', 'undeviginti'];
const T: Record<number, string> = { 2: 'viginti', 3: 'triginta', 4: 'quadraginta', 5: 'quinquaginta', 6: 'sexaginta', 7: 'septuaginta', 8: 'octoginta', 9: 'nonaginta' };
const H: Record<number, string> = { 1: 'centum', 2: 'ducenti', 3: 'trecenti', 4: 'quadringenti', 5: 'quingenti', 6: 'sescenti', 7: 'septingenti', 8: 'octingenti', 9: 'nongenti' };

/** A cardinal number in words (masculine nominative): 1-999; null outside that range, so the digits are left alone. */
export function latinNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  if (n < 20) return U[n];
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(H[h]);
  if (r) {
    if (r < 20) parts.push(U[r]);
    else { parts.push(T[Math.floor(r / 10)]); if (r % 10) parts.push(U[r % 10]); }
  }
  return parts.join(' ');
}
