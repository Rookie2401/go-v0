/**
 * Spanish orthography helpers for the morphology engine: syllable nuclei, which syllable carries the stress, and
 * where the written accent goes when a word grows or shrinks (decir + se + lo = decírselo; corazón + es = corazones;
 * joven + es = jóvenes). Pure and synchronous.
 */

const PLAIN: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };
const ACUTE: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
const VOWELS = 'aeiouáéíóúü';
const STRONG = 'aeoáéó';

export const stripAccents = (s: string): string => s.replace(/[áéíóú]/g, (c) => PLAIN[c]);
export const addAccent = (v: string): string => ACUTE[v] ?? v;
export const isVowelChar = (c: string | undefined): boolean => !!c && VOWELS.includes(c);
export const hasAccent = (s: string): boolean => /[áéíóú]/.test(s);

/** Is the character at index i a syllable-forming vowel (not the silent u of que / gui, not a consonant)? */
function vowelAt(w: string, i: number): boolean {
  const c = w[i];
  if (c === 'y') return i === w.length - 1 && i > 0 && VOWELS.includes(w[i - 1]);
  if (!VOWELS.includes(c)) return false;
  if (c === 'u') {
    if (w[i - 1] === 'q') return false;
    if (w[i - 1] === 'g' && i + 1 < w.length && 'eiéí'.includes(w[i + 1])) return false;
  }
  return true;
}

function hiatus(a: string, b: string): boolean {
  const sa = STRONG.includes(a), sb = STRONG.includes(b);
  if (sa && sb) return true;
  if ('íú'.includes(a) && sb) return true;
  if ('íú'.includes(b) && sa) return true;
  return false;
}

/** Vowel groups (syllable nuclei) as [start, end) index pairs. Diphthongs are one nucleus; hiatus makes two. */
export function nuclei(w: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  while (i < w.length) {
    if (!vowelAt(w, i)) { i++; continue; }
    let s = i;
    let j = i + 1;
    while (j < w.length && vowelAt(w, j)) {
      if (hiatus(w[j - 1], w[j])) { out.push([s, j]); s = j; }
      j++;
    }
    out.push([s, j]);
    i = j;
  }
  return out;
}

/** Index of the vowel inside a nucleus that carries the written accent: the strong vowel, else the last weak one. */
function markIn(w: string, [s, e]: [number, number]): number {
  for (let k = s; k < e; k++) if (STRONG.includes(w[k])) return k;
  return e - 1;
}

export interface StressInfo { markPos: number; fromEnd: number; total: number }

/** Where the stress of a (correctly written) word falls. */
export function stressInfo(w: string): StressInfo | undefined {
  const ns = nuclei(w);
  if (ns.length === 0) return undefined;
  let idx = -1;
  for (let k = 0; k < ns.length && idx < 0; k++) for (let j = ns[k][0]; j < ns[k][1]; j++) if (PLAIN[w[j]]) idx = k;
  let markPos: number;
  if (idx >= 0) {
    markPos = -1;
    for (let j = ns[idx][0]; j < ns[idx][1]; j++) if (PLAIN[w[j]]) markPos = j;
  } else {
    const last = w[w.length - 1];
    idx = ns.length === 1 ? 0 : 'aeiouns'.includes(last) ? ns.length - 2 : ns.length - 1;
    markPos = markIn(w, ns[idx]);
  }
  return { markPos, fromEnd: ns.length - 1 - idx, total: ns.length };
}

/**
 * Re-write `plain` (no accents) so that the vowel at `markIndex` is the stressed one, adding the written accent only
 * where Spanish spelling requires it.
 */
export function writeStress(plain: string, markIndex: number): string | undefined {
  const v = plain[markIndex];
  if (!v || !'aeiou'.includes(v)) return undefined;
  const marked = plain.slice(0, markIndex) + ACUTE[v] + plain.slice(markIndex + 1);
  const ns = nuclei(marked);
  const k = ns.findIndex(([s, e]) => markIndex >= s && markIndex < e);
  if (k < 0) return undefined;
  const fromEnd = ns.length - 1 - k;
  const last = plain[plain.length - 1];
  let need: boolean;
  const strongAt = (i: number) => i >= 0 && i < marked.length && STRONG.includes(marked[i]);
  // a stressed i / u beside a strong vowel always carries the accent (oíd, reíos), whatever stands on its other side (huíos, construíos)
  if ('íú'.includes(marked[markIndex]) && (strongAt(markIndex - 1) || strongAt(markIndex + 1))) need = true;
  else if (ns.length === 1) need = false;
  else if (fromEnd === 0) need = 'aeiouns'.includes(last);
  else if (fromEnd === 1) need = !'aeiouns'.includes(last);
  else need = true;
  return need ? marked : plain;
}

/**
 * Build a new word from an old one while keeping the same stressed vowel. `newPlain` is written without accents;
 * `shift` is how far the old word's characters moved inside it (the length of a prefix, or minus the length cut off
 * the start).
 */
export function transferStress(old: string, newPlain: string, shift: number): string | undefined {
  const info = stressInfo(old);
  if (!info) return undefined;
  const idx = info.markPos + shift;
  if (idx < 0 || idx >= newPlain.length) return undefined;
  return writeStress(newPlain, idx);
}

/** prefix + word + suffix with the stress of `word` kept (decir + 'selo' → decírselo, joven + 'es' → jóvenes). */
export function restress(word: string, prefix: string, suffix: string): string | undefined {
  return transferStress(word, stripAccents(prefix) + stripAccents(word) + suffix, prefix.length);
}
