/**
 * Devanagari spelling helpers for the Hindi morphology engine (package H2, docs/PLAN12.md).
 *
 * MACHINE-DRAFTED from the author's own knowledge of Hindi orthography; no external source. Everything here is plain
 * string work: what a word ends in, how an ending written as an independent vowel (ए, ओ, ऊँ) is attached to a stem
 * (as a matra after a consonant, as the independent letter after a vowel), how a long vowel shortens, and how the
 * nasal sign is spelled (anusvara ं or chandrabindu ँ — the engine folds both to ं when comparing).
 */

export const ANUSVARA = 'ं';
export const CHANDRA = 'ँ';

/** The kind of letter a string ends in: a consonant (with or without its nukta), or a vowel sign / independent vowel. */
export type Kind = 'C' | 'aa' | 'ii' | 'uu' | 'i' | 'u' | 'e' | 'ai' | 'o' | 'au' | 'other';

const KIND: Record<string, Kind> = {
  'ा': 'aa', 'आ': 'aa', 'ी': 'ii', 'ई': 'ii', 'ू': 'uu', 'ऊ': 'uu', 'ि': 'i', 'इ': 'i', 'ु': 'u', 'उ': 'u',
  'े': 'e', 'ए': 'e', 'ै': 'ai', 'ऐ': 'ai', 'ो': 'o', 'ओ': 'o', 'ौ': 'au', 'औ': 'au',
};

const MATRA: Record<string, string> = { 'आ': 'ा', 'इ': 'ि', 'ई': 'ी', 'उ': 'ु', 'ऊ': 'ू', 'ए': 'े', 'ऐ': 'ै', 'ओ': 'ो', 'औ': 'ौ' };

export const isConsonantCode = (c: number): boolean => (c >= 0x915 && c <= 0x939) || (c >= 0x958 && c <= 0x95f) || c === 0x93c;

export function kindOf(s: string): Kind {
  if (!s) return 'other';
  const c = s.charCodeAt(s.length - 1);
  if (isConsonantCode(c)) return 'C';
  return KIND[s[s.length - 1]] ?? 'other';
}

/** Number of consonant letters in `s` (a nukta belongs to its consonant and is not counted). */
export function consonantCount(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 0x93c && isConsonantCode(c)) n++;
  }
  return n;
}

/** Attach an ending to a stem: a leading independent vowel of the ending becomes a matra after a consonant. */
export function join(stem: string, ending: string): string {
  if (!ending) return stem;
  const m = MATRA[ending[0]];
  if (m !== undefined && kindOf(stem) === 'C') return stem + m + ending.slice(1);
  return stem + ending;
}

/** The long vowel at the end shortens: ी → ि, ू → ु (also the independent letters). */
export function shorten(s: string): string {
  const k = s[s.length - 1];
  if (k === 'ी') return s.slice(0, -1) + 'ि';
  if (k === 'ू') return s.slice(0, -1) + 'ु';
  if (k === 'ई') return s.slice(0, -1) + 'इ';
  if (k === 'ऊ') return s.slice(0, -1) + 'उ';
  return s;
}

/** A chandrabindu on a sign that rises above the line is written as an anusvara (ें, ीं, ों, ैं, ौं). */
export const fixNasal = (s: string): string => s.replace(/([ीेैोौ])ँ/g, '$1ं');

/** Fold chandrabindu to anusvara: the comparison key for every table and generated form (हूँ = हूं, लड़कियाँ = लड़कियां). */
export const fold = (s: string): string => (s.includes(CHANDRA) ? s.replace(/ँ/g, ANUSVARA) : s);

// A glide य between a vowel and ए / ई is written or left out: आए / आये, गई / गयी (after a vowel sign or independent vowel).
const GLIDE = /([ाोूुिआओऊउइ])य([ेी])/g;
// the glide also stands after a consonant that carries the inherent a: नया → नए / नये, गया → गए / गये (one rule for adjectives and verbs)
const UNGLIDE = new RegExp('([\u0915-\u0939\u093c\u093e\u094b\u0942\u0941\u093f\u0906\u0913\u090a\u0909\u0907])([\u090f\u0908])', 'g');

/** आये → आए, दिये → दिए, हुयी → हुई: the form written with the independent vowel. */
export const unglide = (s: string): string => s.replace(GLIDE, (_m, a: string, b: string) => a + (b === 'े' ? 'ए' : 'ई'));

/** आए → आये, दिए → दिये, हुई → हुयी: the spelling with the glide य. */
export const glide = (s: string): string => s.replace(UNGLIDE, (_m, a: string, b: string) => a + 'य' + (b === 'ए' ? 'े' : 'ी'));

/** Every string only once, order kept. */
export function uniq(list: string[]): string[] {
  return list.length < 2 ? list : [...new Set(list)];
}

/** NFC, and the nukta letters in their decomposed (NFC) shape; the engine only works on NFC text. */
export function nfc(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x958 && c <= 0x95f) return s.normalize('NFC');
  }
  return s;
}

/** Devanagari letters and signs only (U+0900–U+0963 and U+0971–U+097F; no digits, no danda, no other script). */
export function isDevanagariWord(s: string): boolean {
  if (!s) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x900 || c > 0x97f || (c > 0x963 && c < 0x971)) return false;
  }
  return true;
}

/**
 * Could this be the shape of a Hindi word? No vowel sign after a vowel sign, an independent vowel, a nasal mark, a
 * virama or at the start; no second आ right after an आ / ा; no doubled virama or nasal mark.
 */
export function validWordShape(s: string): boolean {
  let prev = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const matra = c >= 0x93e && c <= 0x94c;
    const prevMatra = prev >= 0x93e && prev <= 0x94c;
    const prevIndep = prev >= 0x905 && prev <= 0x914;
    const prevSign = prev >= 0x901 && prev <= 0x903;
    if (matra && (prev === 0 || prevMatra || prevIndep || prevSign || prev === 0x94d)) return false;
    if (c === 0x906 && (prev === 0x93e || prev === 0x906)) return false;
    if ((c === 0x94d || (c >= 0x901 && c <= 0x903)) && (prev === 0 || prevSign || prev === 0x94d)) return false;
    prev = c;
  }
  return true;
}
