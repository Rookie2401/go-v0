/**
 * Sound tables for Devanagari used by the Hindi pronunciation and transliteration code: ISO 15919 letters for
 * consonants, vowels and vowel signs, and the consonant classes that decide what an anusvara stands for.
 *
 * MACHINE-DRAFTED from general knowledge of the script and of ISO 15919; no native speaker has checked it.
 * Pure data and tiny lookups, no logic about words (package H1, docs/PLAN12.md).
 */

/** ISO 15919 of each consonant letter written without a nukta (as Hindi is usually said). */
export const CONSONANT_ISO: Readonly<Record<string, string>> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ṅ',
  'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'ñ',
  'ट': 'ṭ', 'ठ': 'ṭh', 'ड': 'ḍ', 'ढ': 'ḍh', 'ण': 'ṇ',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'ḷ', 'व': 'v',
  'श': 'ś', 'ष': 'ṣ', 'स': 's', 'ह': 'h',
  'ऩ': 'ṉ', 'ऱ': 'ṟ', 'ऴ': 'ḻ',
};

const NUKTA = '़';

/** ISO 15919 of the letters that carry a nukta (keys are base letter + U+093C, the NFC form). */
export const NUKTA_ISO: Readonly<Record<string, string>> = {
  ['क' + NUKTA]: 'q',
  ['ख' + NUKTA]: 'ḵẖ',
  ['ग' + NUKTA]: 'ġ',
  ['ज' + NUKTA]: 'z',
  ['फ' + NUKTA]: 'f',
  ['ड' + NUKTA]: 'ṛ',
  ['ढ' + NUKTA]: 'ṛh',
  ['य' + NUKTA]: 'y',
};

/** Which sound a nukta adds, for the word sheet ("borrowed sound z"). */
export const NUKTA_NOTE: Readonly<Record<string, string>> = {
  ['क' + NUKTA]: 'q, a back-of-the-throat k (Arabic and Persian words)',
  ['ख' + NUKTA]: 'a scraped kh as in Scottish "loch" (Arabic and Persian words)',
  ['ग' + NUKTA]: 'a scraped g (Arabic and Persian words)',
  ['ज' + NUKTA]: 'z (Arabic, Persian and English words)',
  ['फ' + NUKTA]: 'f (Arabic, Persian and English words)',
  ['ड' + NUKTA]: 'a flapped ṛ, the tongue tip tapping back',
  ['ढ' + NUKTA]: 'a flapped ṛh',
};

/** ISO of one consonant letter, nukta included when it has one. */
export function consonantIso(letter: string): string {
  const n = letter.normalize('NFC');
  if (NUKTA_ISO[n]) return NUKTA_ISO[n];
  const base = n.charAt(0);
  return CONSONANT_ISO[base] ?? base;
}

/** The nasal an anusvara stands for before this consonant letter ('' when the consonant is not a stop or nasal). */
export function classNasal(letter: string): '' | 'ṅ' | 'ñ' | 'ṇ' | 'n' | 'm' {
  const b = letter.normalize('NFC').charAt(0);
  if ('कखगघङ'.includes(b)) return 'ṅ';
  if ('चछजझञ'.includes(b)) return 'ñ';
  if ('टठडढण'.includes(b)) return 'ṇ';
  if ('तथदधन'.includes(b)) return 'n';
  if ('पफबभम'.includes(b)) return 'm';
  return '';
}

export interface VowelInfo {
  /** ISO 15919 letters of the vowel. */
  iso: string;
  /** The plain sound shown in `vowelSound`. */
  sound: string;
  length: 'short' | 'long';
}

const v = (iso: string, length: 'short' | 'long', sound = iso): VowelInfo => ({ iso, sound, length });

/** Independent vowel letters. */
export const INDEPENDENT_VOWELS: Readonly<Record<string, VowelInfo>> = {
  'अ': v('a', 'short'), 'आ': v('ā', 'long'), 'इ': v('i', 'short'), 'ई': v('ī', 'long'),
  'उ': v('u', 'short'), 'ऊ': v('ū', 'long'), 'ऋ': v('r̥', 'short', 'ri'), 'ॠ': v('r̥̄', 'long', 'rī'),
  'ऌ': v('l̥', 'short'), 'ॡ': v('l̥̄', 'long'),
  'ए': v('e', 'long'), 'ऐ': v('ai', 'long'), 'ओ': v('o', 'long'), 'औ': v('au', 'long'),
  'ऑ': v('ô', 'short'), 'ऍ': v('ê', 'short'), 'ऎ': v('ĕ', 'short'), 'ऒ': v('ŏ', 'short'), 'ऄ': v('a', 'short'),
};

/** Dependent vowel signs (matras). */
export const VOWEL_SIGNS: Readonly<Record<string, VowelInfo>> = {
  'ा': v('ā', 'long'), 'ि': v('i', 'short'), 'ी': v('ī', 'long'), 'ु': v('u', 'short'), 'ू': v('ū', 'long'),
  'ृ': v('r̥', 'short', 'ri'), 'ॄ': v('r̥̄', 'long', 'rī'), 'ॢ': v('l̥', 'short'), 'ॣ': v('l̥̄', 'long'),
  'े': v('e', 'long'), 'ै': v('ai', 'long'), 'ो': v('o', 'long'), 'ौ': v('au', 'long'),
  'ॉ': v('ô', 'short'), 'ॅ': v('ê', 'short'), 'ॆ': v('ĕ', 'short'), 'ॊ': v('ŏ', 'short'),
};

/** The inherent vowel written as a vowel sign slot. */
export const INHERENT_A: VowelInfo = v('a', 'short');

/** Names of the consonant letters' sounds used in one-line descriptions (letter -> plain sound). */
export function letterSound(letter: string): string {
  const iso = consonantIso(letter);
  return iso;
}
