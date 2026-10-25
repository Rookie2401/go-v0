/**
 * Latin spelling rules shared by the dictionary build (headword keys, spelling-variant aliases) and by whoever looks a Latin
 * word up (the Latin adapter's `normalize`, a reader asking the dictionary). Pure, browser-safe, no imports from the core
 * index, so an adapter can `import { latinNormalize } from '../dict/latin-normalize'` without pulling anything else in.
 *
 * The key rule, `latinNormalize`: NFD, drop every combining mark (macron, breve, acute, diaeresis: Wiktionary writes
 * "amō", "puella", "poēta"; an edition of the Vulgate writes "amo", "poeta"), lower-case, `æ` to `ae`, `œ` to `oe`, long
 * s to s, NFC. It does NOT touch `j`, `v`, `u`, `i`: "verbō" is "verbo", "Iēsūs" is "iesus", "Jesus" is "jesus". The i/j and
 * u/v of an edition are a printing choice (j and v are the consonantal i and u), so the dictionary also indexes them:
 *
 *   - `latinVariantKeys(key)`  the spellings other editions give a headword (the build adds them as small form-of entries):
 *                              every `v` as `u` ("uerbum"), a consonantal `i` as `j` ("ejus", "justus", "Joannes"), both;
 *   - `latinLookupKeys(surface)` the keys to ask for, most likely first (j folded to i, a consonantal `u` read as `v`), for a
 *                              caller that can ask for several.
 */

/** Marks, ligatures and case: what every Latin key goes through. */
export function latinNormalize(surface: string): string {
  return surface
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ſ/g, 's')
    .replace(/\s+/g, ' ')
    .trim();
}

const VOWELS = 'aeiouy';
const isVowel = (c: string | undefined): boolean => c !== undefined && c !== '' && VOWELS.includes(c);
/** Prefixes before a consonantal i (adiuuo, coniunx, reicio, inicio = in + iacio). */
const I_PREFIXES: readonly string[] = ['ad', 'con', 'in', 'ob', 'sub', 'ab', 'dis', 'per', 'inter', 'trans', 'circum', 'de', 'pro', 're'];

/** `i` read as `j` where it is consonantal: before a vowel at the start of a word, after a vowel or after a verb prefix. Over-generous on purpose (a spare key costs nothing). */
function iToJ(key: string): string {
  const words = key.split(' ');
  return words
    .map((w) => {
      let out = '';
      for (let k = 0; k < w.length; k++) {
        const c = w[k];
        if (c !== 'i' || !isVowel(w[k + 1])) { out += c; continue; }
        const before = out;
        const consonantal = before === '' || isVowel(before[before.length - 1]) || I_PREFIXES.includes(before);
        out += consonantal ? 'j' : c;
      }
      return out;
    })
    .join(' ');
}

const vToU = (key: string): string => key.replace(/v/g, 'u');

/** The other spellings of a key that editions print (never the key itself, no repeats). */
export function latinVariantKeys(key: string): string[] {
  const out: string[] = [];
  const add = (v: string) => { if (v !== key && v !== '' && !out.includes(v)) out.push(v); };
  const u = vToU(key);
  const j = iToJ(key);
  add(j);
  add(u);
  add(vToU(j));
  return out;
}

/**
 * The most likely consonantal-u positions read as `v`: a u before a vowel, not after q, at the start, after a vowel or after l/r.
 * In a run of two (iuuenis, fluuius against seruus, uiuus) the first stays a vowel when a vowel follows the run.
 */
function uToV(key: string): string {
  let out = '';
  for (let k = 0; k < key.length; k++) {
    const c = key[k];
    const prev = out[out.length - 1];
    const leftOk = prev === undefined || prev === ' ' || isVowel(prev) || prev === 'l' || prev === 'r';
    const next = key[k + 1];
    const consonantal = c === 'u' && prev !== 'q' && leftOk && (next === 'u' ? !isVowel(key[k + 2]) : isVowel(next));
    out += consonantal ? 'v' : c;
  }
  return out;
}

/**
 * The keys to ask the dictionary for, most likely first: the normalized surface, then j read as i, then the same with a
 * consonantal u read as v ("uerbum" to "verbum", "iuuenis" to "iuvenis"), then `v` as the key it is, then, for a v printed where only a vowel
 * can stand (VERBVM, vt), every v as u and the consonantal ones back as v ("verbum", "ut"). At most 6.
 */
export function latinLookupKeys(surface: string): string[] {
  const k = latinNormalize(surface);
  if (!k) return [];
  const out: string[] = [];
  const add = (v: string) => { if (v && !out.includes(v)) out.push(v); };
  add(k);
  const i = k.replace(/j/g, 'i');
  add(i);
  add(uToV(i));
  if (k.includes('v') || i.includes('v')) {
    const u = vToU(i);
    add(u);
    // an edition printing v for every u (VERBVM, VOLVNTAS, vt) gives a v in vowel position: read all as u, then the consonantal ones back as v (2026-10-25)
    add(uToV(u));
  }
  return out.slice(0, 6);
}

/** A key with the printing choices gone (j as i, v as u): two spellings of one word have one skeleton. For comparing, not for lookup. */
export const latinSkeleton = (surface: string): string => vToU(latinNormalize(surface).replace(/j/g, 'i'));
