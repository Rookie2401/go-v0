/**
 * Small text helpers for the hand-data / dictionary comparison (src/dict/compare.ts). Pure and browser-safe.
 * Everything here is deliberately lenient: a comparison that cannot tell two wordings apart must say "same", so that
 * the disagreements it does record are ones a reviewer has a reason to look at.
 */

// ───────────────────────────── glosses ─────────────────────────────

/** Words that carry no meaning of their own in a gloss ("to eat", "a book", "of", "in order to"). */
const STOP_FULL = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'as', 'be', 'is', 'are', 'was', 'were',
  'been', 'being', 'or', 'and', 'it', 'its', 'which', 'who', 'whom', 'whose', 'one',
  'someone', 'something', 'somebody', 'oneself', 'self', 'etc', 'e', 'g', 'i', 'my', 'me', 'your', 'you', 'he', 'she',
  'we', 'they', 'his', 'her', 'their', 'our', 'especially', 'usually', 'often', 'also', 'used', 'use', 'esp', 'see', 'any',
  'classifier', 'particle', 'prefix', 'suffix', 'marker', 'written', 'spoken', 'informal', 'formal',
  'colloquial', 'polite', 'royal', 'divine', 'male', 'female', 'speaker', 'speaking', 'rude', 'very', 'old', 'style',
]);
/** For glosses made only of such words ("from", "in", "of", "not", "and"): drop just the articles and "to". */
const STOP_MIN = new Set(['a', 'an', 'the', 'e', 'g', 'etc', 'used', 'use', 'esp']);
/** Words of the stop list that carry meaning in a function word's gloss ("for", "in order to", "which", "not"). */
const FUNCTION_KEEP = new Set(['for', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'as', 'or', 'and', 'which', 'who', 'whom', 'if', 'not', 'than']);

const words = (s: string): string[] => s.toLowerCase().replace(/[’']s\b/g, '').split(/[^a-z0-9]+/).filter(Boolean);

/** English number words in a hand gloss; the dictionary often writes the digit ("2 (Thai numeral ...)"). */
const NUMBER_WORDS: Readonly<Record<string, string>> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};

/**
 * A pronoun glossed by the English pronoun ("I", "you", "he; she", "we") is described by the dictionary as "a first
 * person pronoun": the person is the shared content word. Composite tokens stand for that on both sides.
 */
const PERSON_OF: Readonly<Record<string, string>> = {
  i: 'first-person', me: 'first-person', we: 'first-person', us: 'first-person',
  you: 'second-person', thou: 'second-person',
  he: 'third-person', she: 'third-person', it: 'third-person', they: 'third-person', him: 'third-person', her: 'third-person',
};
const personTokens = (text: string): string[] => {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/\b(first|second|third)[- ]person\b/g)) out.push(`${m[1]}-person`);
  return out;
};

/** Light stemming: enough to make "understands / understood-ish / understanding" meet, not a linguist's stemmer. */
export function stemWord(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith('ly')) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  if (s.length > 3 && /(.)\1$/.test(s)) s = s.slice(0, -1); // "stopp" / "stop"
  return s;
}

/** The text of every bracketed remark in a gloss, and the gloss with the remarks removed. */
function splitBrackets(gloss: string): { main: string; remarks: string } {
  const remarks: string[] = [];
  const main = gloss.replace(/\(([^()]*)\)|\[([^\]]*)\]/g, (_m, a: string | undefined, b: string | undefined) => { remarks.push(a ?? b ?? ''); return ' '; });
  return { main, remarks: remarks.join(' ') };
}

const stemsOf = (text: string, stop: ReadonlySet<string>): string[] => words(text).filter((w) => !stop.has(w)).map(stemWord).filter((s) => s.length > 0);

/**
 * The content stems of a hand gloss: bracketed remarks removed ("fault, blame, penalty", "I (male)" -> "i" -> none),
 * falling back to the remark itself when nothing else is left ("(classifier for people)" -> "people"), then to the
 * few words the stop list would have removed ("from", "in", "not").
 */
export function handGlossStems(gloss: string, functionWord = false): string[] {
  const { main, remarks } = splitBrackets(gloss);
  const out = new Set<string>();
  for (const w of words(main)) {
    if (PERSON_OF[w]) { out.add(PERSON_OF[w]); out.add(w); }
    if (functionWord && FUNCTION_KEEP.has(w)) out.add(w);
    if (NUMBER_WORDS[w]) out.add(NUMBER_WORDS[w]);
  }
  let stems = stemsOf(main, STOP_FULL);
  if (!stems.length && !out.size) stems = stemsOf(main, STOP_MIN);
  if (!stems.length && !out.size) stems = stemsOf(remarks, STOP_FULL);
  if (!stems.length && !out.size) stems = stemsOf(remarks, STOP_MIN);
  for (const s of stems) out.add(NUMBER_WORDS[s] ?? s);
  return [...out];
}

/** True when the whole gloss is one bracketed remark: "(urging particle)", "(classifier for people)". */
export const isBracketOnly = (gloss: string): boolean => {
  const g = gloss.trim();
  return g.startsWith('(') && g.endsWith(')') && words(splitBrackets(g).main).length === 0;
};

/**
 * Every stem of a dictionary gloss, brackets included and only articles and "to" dropped: the generous side of the
 * comparison (a hand gloss "of" or "with; and" must be able to meet "of; belonging to").
 */
export function dictGlossStems(gloss: string): string[] {
  const text = gloss.replace(/[()[\]]/g, ' ');
  const stems = stemsOf(text, STOP_MIN);
  const persons = words(text).map((w) => PERSON_OF[w]).filter((p): p is string => !!p);
  return [...new Set([...stems, ...personTokens(text), ...persons])];
}

/** Two stems meet when equal, or when one begins the other and is at least five letters long ("understand" / "understandable"), or ends it and is at least four ("self" / "oneself"). */
export const stemsMeet = (a: string, b: string): boolean =>
  a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a))) || (Math.min(a.length, b.length) >= 4 && (a.endsWith(b) || b.endsWith(a)));

/** True when some content stem of `handGloss` meets some stem of any of `dictGlosses`. `undefined`: the hand gloss has no content word to test. */
export function glossesOverlap(handGloss: string, dictGlosses: readonly string[], functionWord = false): boolean | undefined {
  const hand = handGlossStems(handGloss, functionWord);
  if (!hand.length) return undefined;
  const theirs = new Set<string>();
  for (const g of dictGlosses) for (const s of dictGlossStems(g)) theirs.add(s);
  if (!theirs.size) return undefined;
  for (const h of hand) for (const t of theirs) if (stemsMeet(h, t)) return true;
  return false;
}

// ───────────────────────────── romanization ─────────────────────────────

const COMBINING = /[̀-ͯ]/g;

/**
 * A coarse skeleton of a romanization, to compare the course's loose, toneless transcription (RTGS-like: "khaochai",
 * "nueng") with a dictionary reading (Paiboon: "kâo-jai", "nʉ̀ng"; or the Royal Institute's own, already RTGS). Both are
 * folded to the same lower-case letters: tone marks and vowel length are dropped, repeated letters collapse, Paiboon
 * initials are rewritten to RTGS ones (g -> k, k -> kh, j -> ch, bp -> p, p -> ph, dt -> t, t -> th), Paiboon vowel
 * letters to RTGS digraphs. It cannot tell ฉ from ช or ผ from พ and it ignores tone: two readings with the same skeleton
 * are "not shown to differ", never "the same".
 */
export function romanSkeleton(roman: string, system: 'paiboon' | 'rtgs'): string {
  let s = roman.normalize('NFD').replace(COMBINING, '').normalize('NFC').toLowerCase();
  if (system === 'paiboon') {
    s = s.replace(/(.)\1/g, '$1'); // long vowels are written double: ʉʉ, ɛɛ, aa, ii ...
    s = s.split(/[\s\-·.]+/).filter(Boolean).map(paiboonSyllableToRtgs).join('');
  } else {
    s = s.replace(/[\s\-·.]+/g, '');
  }
  return s
    .replace(/ŋ/g, 'ng').replace(/ɛ/g, 'ae').replace(/ɔ/g, 'o').replace(/[əɤ]/g, 'oe').replace(/[ʉɯ]/g, 'ue').replace(/ʔ/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1/g, '$1');
}

function paiboonSyllableToRtgs(syl: string): string {
  if (syl.startsWith('bp')) return `p${syl.slice(2)}`;
  if (syl.startsWith('dt')) return `t${syl.slice(2)}`;
  if (syl.startsWith('ch')) return syl;
  if (syl.startsWith('ph') || syl.startsWith('th') || syl.startsWith('kh')) return syl;
  const c = syl[0];
  if (c === 'g') return `k${syl.slice(1)}`;
  if (c === 'j') return `ch${syl.slice(1)}`;
  if (c === 'k' || c === 'p' || c === 't') return `${c}h${syl.slice(1)}`;
  return syl;
}

// ───────────────────────────── pronunciation parts ─────────────────────────────

/** Syllables of a respelling ("ขะ-หฺนม" -> 2). */
export const respellingSyllables = (respelling: string): string[] => respelling.split(/[-\s]+/).filter(Boolean);

/** Collapse runs of whitespace and a stray bracket pair so that two respellings can be compared as written. */
export const cleanRespelling = (r: string): string => r.normalize('NFC').replace(/\s+/g, '').trim();
