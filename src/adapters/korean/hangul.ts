/**
 * Korean script: Hangul arithmetic, jamo tables, the identity of a written form (`koKey`), the offset map from a key back to the
 * original text (`koNormalize`), the shard letters of a key, and the script decoding of one word (`syllablesOf`).
 *
 * Everything here is pure and imports nothing from the other Korean files. The page's text is never changed: a key is an identity,
 * and every offset the analyser reports is an offset into the ORIGINAL string.
 *
 * Jamo are always written as COMPATIBILITY jamo (U+3131–318E) in this file's tables and outputs, because that is what the other
 * packages type and compare. Conjoining jamo (U+1100–11FF, the canonically decomposed form of a syllable) only ever appear in
 * input, and `koKey` composes them.
 */
import type { SyllableAnalysis } from '../../core';

// ───────────────────────────── tables ─────────────────────────────

/** The 19 leads (초성), standard order. */
export const LEADS: readonly string[] = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
/** The 21 vowels (중성), standard order. */
export const VOWELS: readonly string[] = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
/** The 28 finals (종성), standard order; index 0 is no final (''). */
export const FINALS: readonly string[] = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export const SYLLABLE_BASE = 0xac00;
export const SYLLABLE_END = 0xd7a3;
const V_COUNT = 21;
const T_COUNT = 28;

/** The compound vowels and the two simple vowels each is written from. */
export const COMPOUND_VOWELS: Readonly<Record<string, readonly [string, string]>> = {
  ㅘ: ['ㅗ', 'ㅏ'], ㅙ: ['ㅗ', 'ㅐ'], ㅚ: ['ㅗ', 'ㅣ'], ㅝ: ['ㅜ', 'ㅓ'], ㅞ: ['ㅜ', 'ㅔ'], ㅟ: ['ㅜ', 'ㅣ'], ㅢ: ['ㅡ', 'ㅣ'],
};
/** The double consonants and the plain consonant each doubles. */
export const DOUBLE_CONSONANTS: Readonly<Record<string, string>> = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' };
/** The compound finals (겹받침) and their two consonants. */
export const COMPOUND_FINALS: Readonly<Record<string, readonly [string, string]>> = {
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'], ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'],
  ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'],
};

const LEAD_INDEX = new Map(LEADS.map((c, i) => [c, i]));
const VOWEL_INDEX = new Map(VOWELS.map((c, i) => [c, i]));
const FINAL_INDEX = new Map(FINALS.map((c, i) => [c, i]));
const COMPOUND_FINAL_BY_PARTS = new Map(Object.entries(COMPOUND_FINALS).map(([k, [a, b]]) => [a + b, k]));
const COMPOUND_VOWEL_BY_PARTS = new Map(Object.entries(COMPOUND_VOWELS).map(([k, [a, b]]) => [a + b, k]));

export const isLead = (c: string): boolean => LEAD_INDEX.has(c);
export const isVowelJamo = (c: string): boolean => VOWEL_INDEX.has(c);
/** A jamo that can stand as a final (one of the 27 written finals). */
export const isFinalJamo = (c: string): boolean => c !== '' && FINAL_INDEX.has(c);
export const splitCompoundFinal = (f: string): readonly [string, string] | undefined => COMPOUND_FINALS[f];
export const splitCompoundVowel = (v: string): readonly [string, string] | undefined => COMPOUND_VOWELS[v];

// ───────────────────────────── Revised Romanization of the letters ─────────────────────────────

/** RR of each lead (ㅇ is silent); the key is the compatibility jamo. */
export const RR_LEAD: Readonly<Record<string, string>> = {
  ㄱ: 'g', ㄲ: 'kk', ㄴ: 'n', ㄷ: 'd', ㄸ: 'tt', ㄹ: 'r', ㅁ: 'm', ㅂ: 'b', ㅃ: 'pp', ㅅ: 's', ㅆ: 'ss', ㅇ: '', ㅈ: 'j', ㅉ: 'jj',
  ㅊ: 'ch', ㅋ: 'k', ㅌ: 't', ㅍ: 'p', ㅎ: 'h',
};
export const RR_VOWEL: Readonly<Record<string, string>> = {
  ㅏ: 'a', ㅐ: 'ae', ㅑ: 'ya', ㅒ: 'yae', ㅓ: 'eo', ㅔ: 'e', ㅕ: 'yeo', ㅖ: 'ye', ㅗ: 'o', ㅘ: 'wa', ㅙ: 'wae', ㅚ: 'oe', ㅛ: 'yo',
  ㅜ: 'u', ㅝ: 'wo', ㅞ: 'we', ㅟ: 'wi', ㅠ: 'yu', ㅡ: 'eu', ㅢ: 'ui', ㅣ: 'i',
};
/** RR of the seven sounds a final can have. */
export const RR_FINAL: Readonly<Record<string, string>> = { ㄱ: 'k', ㄴ: 'n', ㄷ: 't', ㄹ: 'l', ㅁ: 'm', ㅂ: 'p', ㅇ: 'ng' };
/** Every written final as the one of the seven finals it is said as at the end of a word (compound finals by the usual rule). */
export const NEUTRAL_FINAL: Readonly<Record<string, string>> = {
  ㄱ: 'ㄱ', ㄲ: 'ㄱ', ㅋ: 'ㄱ', ㄳ: 'ㄱ', ㄺ: 'ㄱ',
  ㄴ: 'ㄴ', ㄵ: 'ㄴ', ㄶ: 'ㄴ',
  ㄷ: 'ㄷ', ㅅ: 'ㄷ', ㅆ: 'ㄷ', ㅈ: 'ㄷ', ㅊ: 'ㄷ', ㅌ: 'ㄷ', ㅎ: 'ㄷ',
  ㄹ: 'ㄹ', ㄼ: 'ㄹ', ㄽ: 'ㄹ', ㄾ: 'ㄹ', ㅀ: 'ㄹ',
  ㅁ: 'ㅁ', ㄻ: 'ㅁ',
  ㅂ: 'ㅂ', ㅍ: 'ㅂ', ㅄ: 'ㅂ', ㄿ: 'ㅂ',
  ㅇ: 'ㅇ',
};

/**
 * Revised Romanization of a string that is already a pronunciation respelling: a per-jamo mapping. ㄹ is r before a vowel and l
 * otherwise (a lead ㄹ right after a final ㄹ is l too, so ㄹㄹ is ll); a final is one of k n t l m p ng. Characters that are not
 * Hangul syllables pass through. No capitalisation, no hyphens.
 */
export function romanizeRespelling(s: string): string {
  let out = '';
  let prevFinalL = false;
  for (const ch of s.normalize('NFC')) {
    const d = decompose(ch);
    if (!d) { out += ch; prevFinalL = false; continue; }
    const lead = LEADS[d.l];
    out += lead === 'ㄹ' ? (prevFinalL ? 'l' : 'r') : RR_LEAD[lead];
    out += RR_VOWEL[VOWELS[d.v]];
    const fin = FINALS[d.t];
    if (fin) {
      const n = NEUTRAL_FINAL[fin] ?? fin;
      out += RR_FINAL[n];
      prevFinalL = n === 'ㄹ';
    } else prevFinalL = false;
  }
  return out;
}

// ───────────────────────────── arithmetic ─────────────────────────────

export function isHangulSyllable(ch: string): boolean {
  if (!ch) return false;
  const c = ch.codePointAt(0)!;
  return c >= SYLLABLE_BASE && c <= SYLLABLE_END && ch.length === 1;
}

/** The three indexes of a syllable (lead 0–18, vowel 0–20, final 0–27, 0 = none), or undefined for any other character. */
export function decompose(syllable: string): { l: number; v: number; t: number } | undefined {
  if (!isHangulSyllable(syllable)) return undefined;
  const s = syllable.charCodeAt(0) - SYLLABLE_BASE;
  return { l: Math.floor(s / (V_COUNT * T_COUNT)), v: Math.floor((s % (V_COUNT * T_COUNT)) / T_COUNT), t: s % T_COUNT };
}

export function compose(l: number, v: number, t = 0): string {
  return String.fromCharCode(SYLLABLE_BASE + (l * V_COUNT + v) * T_COUNT + t);
}

export const leadOf = (syllable: string): string => { const d = decompose(syllable); return d ? LEADS[d.l] : ''; };
export const vowelOf = (syllable: string): string => { const d = decompose(syllable); return d ? VOWELS[d.v] : ''; };
export const finalOf = (syllable: string): string => { const d = decompose(syllable); return d ? FINALS[d.t] : ''; };
export const hasFinal = (syllable: string): boolean => { const d = decompose(syllable); return !!d && d.t > 0; };

/** The syllable with this final (a compatibility jamo, '' for none). An unknown final leaves the syllable unchanged. */
export function withFinal(syllable: string, finalJamo: string): string {
  const d = decompose(syllable);
  const t = FINAL_INDEX.get(finalJamo);
  return d && t !== undefined ? compose(d.l, d.v, t) : syllable;
}
export const withoutFinal = (syllable: string): string => withFinal(syllable, '');

/** The last character of the word (after NFC) when it is a Hangul syllable; undefined otherwise. */
export function lastSyllable(word: string): string | undefined {
  const w = word.normalize('NFC');
  const ch = w[w.length - 1];
  return ch && isHangulSyllable(ch) ? ch : undefined;
}

/** Compatibility jamo of a Hangul word: lead, vowel, final (when there is one) for each syllable; anything else passes through. */
export function toJamo(word: string): string[] {
  const out: string[] = [];
  for (const ch of word.normalize('NFC')) {
    const d = decompose(ch);
    if (!d) { out.push(ch); continue; }
    out.push(LEADS[d.l], VOWELS[d.v]);
    if (d.t) out.push(FINALS[d.t]);
  }
  return out;
}

/**
 * Recompose a jamo sequence greedily: a lead and a vowel (or two simple vowels that make a compound) start a syllable; a following
 * consonant is its final unless a vowel follows it (then it leads the next syllable); two consonants that make a compound final are
 * taken together unless a vowel follows the second. The inverse of `toJamo` for Hangul syllables. Anything that cannot take part
 * passes through unchanged.
 */
export function fromJamo(jamo: readonly string[]): string {
  let out = '';
  let i = 0;
  const vowelAt = (j: number): { v: string; len: number } | undefined => {
    const a = jamo[j];
    if (a === undefined || !VOWEL_INDEX.has(a)) return undefined;
    const b = jamo[j + 1];
    if (b !== undefined) { const c = COMPOUND_VOWEL_BY_PARTS.get(a + b); if (c) return { v: c, len: 2 }; }
    return { v: a, len: 1 };
  };
  while (i < jamo.length) {
    const l = jamo[i];
    const v = LEAD_INDEX.has(l) ? vowelAt(i + 1) : undefined;
    if (!v) { out += l; i++; continue; }
    let j = i + 1 + v.len;
    let t = '';
    const c1 = jamo[j];
    const c2 = jamo[j + 1];
    const c3 = jamo[j + 2];
    if (c1 !== undefined && COMPOUND_FINALS[c1]) { t = c1; j += 1; }
    else if (c1 !== undefined && isFinalJamo(c1)) {
      if (c2 !== undefined && VOWEL_INDEX.has(c2)) { /* c1 leads the next syllable */ }
      else {
        const pair = c2 !== undefined ? COMPOUND_FINAL_BY_PARTS.get(c1 + c2) : undefined;
        if (pair && !(c3 !== undefined && VOWEL_INDEX.has(c3))) { t = pair; j += 2; } else { t = c1; j += 1; }
      }
    }
    out += compose(LEAD_INDEX.get(l)!, VOWEL_INDEX.get(v.v)!, FINAL_INDEX.get(t) ?? 0);
    i = j;
  }
  return out;
}

// ───────────────────────────── classification ─────────────────────────────

export const isCompatJamo = (ch: string): boolean => { const c = ch.codePointAt(0) ?? 0; return c >= 0x3130 && c <= 0x318f; };
export const isConjoiningJamo = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x1100 && c <= 0x11ff) || (c >= 0xa960 && c <= 0xa97f) || (c >= 0xd7b0 && c <= 0xd7ff);
};
const isHalfwidthJamo = (ch: string): boolean => { const c = ch.codePointAt(0) ?? 0; return c >= 0xffa0 && c <= 0xffdc; };

/** A Hangul syllable or a jamo of any block (compatibility, conjoining, halfwidth). */
export const isHangul = (ch: string): boolean => isHangulSyllable(ch) || isCompatJamo(ch) || isConjoiningJamo(ch) || isHalfwidthJamo(ch);

export function isHanja(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0xf900 && c <= 0xfaff);
}

export function scriptOf(ch: string): 'hangul' | 'hanja' | 'latin' | 'digit' | 'other' {
  if (isHangul(ch)) return 'hangul';
  if (isHanja(ch)) return 'hanja';
  if (/^\p{Script=Latin}$/u.test(ch)) return 'latin';
  if (/^\p{Nd}$/u.test(ch)) return 'digit';
  return 'other';
}

// ───────────────────────────── keys and offsets ─────────────────────────────

/**
 * Invisible characters that never belong to a word, written as escapes on purpose (an editor may drop a literal one):
 * U+00AD soft hyphen, U+200B zero-width space, U+200C zero-width non-joiner, U+200D zero-width joiner, U+2060 word joiner,
 * U+FEFF byte-order mark (zero-width no-break space).
 */
const INVISIBLE_CLASS = '[\\u00ad\\u200b\\u200c\\u200d\\u2060\\ufeff]';
const INVISIBLE_ONE = new RegExp(`^${INVISIBLE_CLASS}$`);
const INVISIBLE_G = new RegExp(INVISIBLE_CLASS, 'g');
export const isInvisible = (ch: string): boolean => INVISIBLE_ONE.test(ch);
/** Halfwidth jamo, written as escapes (U+FFA0 is an invisible filler). */
const HALFWIDTH = /[\uffa0-\uffdc]/g;
/** Halfwidth jamo (U+FFA0–FFDC) run in the same order as the compatibility jamo (U+3164, 3131–314E, 314F–3163) with gaps. */
const HALF_BLOCKS: ReadonlyArray<readonly [number, number, number]> = [
  [0xffa0, 0xffa0, 0x3164], [0xffa1, 0xffbe, 0x3131], [0xffc2, 0xffc7, 0x314f], [0xffca, 0xffcf, 0x3155], [0xffd2, 0xffd7, 0x315b], [0xffda, 0xffdc, 0x3161],
];
function halfwidthToCompat(ch: string): string {
  const c = ch.charCodeAt(0);
  for (const [a, b, to] of HALF_BLOCKS) if (c >= a && c <= b) return String.fromCharCode(to + (c - a));
  return ch;
}

/**
 * The identity of a written form: halfwidth jamo mapped to compatibility jamo, then NFC (so conjoining jamo compose to
 * syllables where canonical composition allows). Compatibility jamo are KEPT: a lone ㅋㅋ is not folded into a syllable. Nothing
 * else is folded, case included.
 */
export function koKey(form: string): string {
  return form.replace(INVISIBLE_G, '').replace(HALFWIDTH, halfwidthToCompat).normalize('NFC');
}

/** Does this code point attach to the character before it under composition (conjoining vowel or final jamo, any combining mark)? */
function attaches(cp: number, ch: string): boolean {
  return (cp >= 0x1160 && cp <= 0x11ff) || (cp >= 0xd7b0 && cp <= 0xd7ff) || /^\p{M}$/u.test(ch);
}

/**
 * The key of `text` and a map from each UTF-16 unit of the key to the offset, in `text`, where the original character run that
 * produced it starts. `map.length === key.length + 1` and `map[key.length] === text.length`. A run is a character together with the
 * conjoining jamo and combining marks that compose with it, so '한' written as three conjoining jamo is one run and one key unit.
 */
export function koNormalize(text: string): { key: string; map: number[] } {
  let key = '';
  const map: number[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    const first = String.fromCodePoint(text.codePointAt(i)!);
    i += first.length;
    if (isInvisible(first)) continue; // no key unit: the next unit's run starts after it
    while (i < text.length) {
      const ch = String.fromCodePoint(text.codePointAt(i)!);
      if (!attaches(ch.codePointAt(0)!, ch)) break;
      i += ch.length;
    }
    const k = koKey(text.slice(start, i));
    for (let u = 0; u < k.length; u++) map.push(start);
    key += k;
  }
  map.push(text.length);
  return { key, map };
}

/** The span of the original text covering whole original characters for the key span [keyStart, keyEnd). */
export function originalSpan(map: readonly number[], keyStart: number, keyEnd: number): [number, number] {
  const last = map.length - 1;
  const s = map[Math.min(Math.max(keyStart, 0), last)];
  if (keyEnd <= keyStart) return [s, s];
  const from = map[Math.min(keyEnd - 1, last)];
  let j = Math.min(keyEnd, last);
  while (j < last && map[j] <= from) j++;
  return [s, map[j]];
}

/** The compatibility jamo of a key's first syllable (lead, vowel, final): the shard prefix. '' for Hanja or anything else. */
export function koShardLetters(key: string): string {
  const first = key[0];
  if (!first) return '';
  const d = decompose(first);
  return d ? LEADS[d.l] + VOWELS[d.v] + FINALS[d.t] : '';
}

// ───────────────────────────── script decoding ─────────────────────────────

/** One entry per Hangul syllable of the word: its lead, vowel and final named, and its sound in Revised Romanization. */
export function syllablesOf(word: string): SyllableAnalysis[] {
  const { key, map } = koNormalize(word);
  const out: SyllableAnalysis[] = [];
  for (let i = 0; i < key.length; i++) {
    const d = decompose(key[i]);
    if (!d) continue;
    const [start, end] = originalSpan(map, i, i + 1);
    const lead = LEADS[d.l];
    const vowel = VOWELS[d.v];
    const fin = FINALS[d.t];
    const sound = fin ? RR_FINAL[NEUTRAL_FINAL[fin]] : undefined;
    const s: SyllableAnalysis = {
      text: word.slice(start, end),
      start,
      end,
      initial: lead,
      vowel,
      vowelSound: RR_VOWEL[vowel],
      romanization: romanizeRespelling(key[i]),
      rule: syllableRule(lead, vowel, fin),
      source: 'rule',
      confidence: 1,
    };
    if (fin) { s.final = fin; s.finalSound = sound; }
    out.push(s);
  }
  return out;
}

/** Plain-English reading of one syllable's letters: what each part is and, for a final, which sound is said. */
function syllableRule(lead: string, vowel: string, fin: string): string {
  const out: string[] = [];
  out.push(lead === 'ㅇ' ? 'ㅇ is silent at the start of a syllable' : `starts with ${lead} (${RR_LEAD[lead]})`);
  out.push(`vowel ${vowel} (${RR_VOWEL[vowel]})`);
  if (fin) {
    const n = NEUTRAL_FINAL[fin];
    const parts = COMPOUND_FINALS[fin];
    if (parts) out.push(`final ${fin} is two letters, ${parts[0]} and ${parts[1]}; only ${n} is said at the end of a word`);
    else if (n !== fin) out.push(`final ${fin} is said ${n} at the end of a word`);
    else out.push(`final ${fin}`);
  }
  return out.join('; ');
}
