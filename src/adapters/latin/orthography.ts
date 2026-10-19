/**
 * Latin orthography for lookup (never for display): the written form of a text is NEVER changed. The Clementine Vulgate prints
 * æ and œ ligatures (cælum, præcepit), j (juxta, Jesus) and u / v by position; other editions mark vowel length (macrons) or use
 * i / u for the consonants. All of those fold to one lookup key: NFC, lower case, macrons and breves off, æ → ae, œ → oe,
 * j → i, v → u. The lexicon is written in the same folded spelling, so one key finds every spelling of a word.
 *
 * The key is also the identity of a token (`RawToken.normalized`): "Cælum", "caelum" and "coelum" differ (coelum is a spelling
 * of caelum the lexicon pairs with it: `lemmaVariants`), "Jesus" and "Iesus" do not.
 */
import type { RawToken, Span } from '../../core';
import { splitSentences } from '../shared';
import { latinNormalize } from '../../dict/latin-normalize';

const MARKS = new RegExp('[' + String.fromCharCode(0x304, 0x306) + ']', 'g');

/** The lookup key of a written form (see above). */
export function foldKey(s: string): string {
  // ligatures first (before any decomposition), then every combining mark (macron, breve, acute, ogonek) off
  return s
    .normalize('NFC').toLowerCase()
    .replace(/æ|ǽ|ǣ|ę/g, 'ae')
    .replace(/œ/g, 'oe')
    .normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC')
    .replace(/j/g, 'i')
    .replace(/v/g, 'u');
}

/** The same fold without lower-casing, for a lemma kept in its own letters (the lemma is shown as written: Iesus, not iesus). */
export function stripMarks(s: string): string {
  return s.normalize('NFD').replace(MARKS, '').normalize('NFC');
}

/** The dictionary key and the identity of a token: exactly the dictionary build's rule (src/dict/latin-normalize.ts; j, v, u, i are kept as written). `foldKey` is the coarser key the lexicon and the morphology look words up under. */
export const lookupKey = (s: string): string => latinNormalize(s);
export const normalizeLatin = lookupKey;

// Latin letters: the basic alphabet, vowels with macron / breve (precomposed or combining), the ligatures, and the characters of
// the Latin-1 / Extended-A block some editions use for them.
const LETTER_CLASS = 'A-Za-z' + String.fromCharCode(0xc0) + '-' + String.fromCharCode(0xd6) + String.fromCharCode(0xd8) + '-' + String.fromCharCode(0xf6) + String.fromCharCode(0xf8) + '-' + String.fromCharCode(0x17f, 0x1fc, 0x1fd, 0x300) + '-' + String.fromCharCode(0x36f);
const LETTER = new RegExp('[' + LETTER_CLASS + ']');
const WORD = new RegExp('[' + LETTER_CLASS + ']+', 'y');
const DIGITS = /[0-9]+/y;

/**
 * The tokenizer: a word is a run of Latin letters (with ligatures and length marks), a number is a run of digits, every other
 * character is a token of its own (punctuation, including the space-before-colon of the Clementine). Offsets are exact;
 * enclitics (-que, -ne, -ve) stay inside the word token and the analysis splits them. Roman numerals are ordinary words
 * (the analysis recognises capitalised ones).
 */
export function tokenizeLatin(text: string): RawToken[] {
  const out: RawToken[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/u.test(ch) || ch === String.fromCharCode(0x200b) || ch === String.fromCharCode(0xfeff)) { i++; continue; }
    WORD.lastIndex = i;
    const w = LETTER.test(ch) ? WORD.exec(text) : null;
    if (w && w.index === i) {
      // an apostrophe inside a word (dixit 'ne) is not part of it
      out.push({ surface: w[0], start: i, end: i + w[0].length, isWord: true, normalized: lookupKey(w[0]) });
      i += w[0].length;
      continue;
    }
    DIGITS.lastIndex = i;
    const d = DIGITS.exec(text);
    if (d && d.index === i) {
      out.push({ surface: d[0], start: i, end: i + d[0].length, isWord: false, normalized: d[0] });
      i += d[0].length;
      continue;
    }
    const cp = String.fromCodePoint(text.codePointAt(i) as number);
    out.push({ surface: cp, start: i, end: i + cp.length, isWord: false, normalized: cp });
    i += cp.length;
  }
  return out;
}

/** Latin editions end a sentence at . ! ? (the Clementine writes " ?" with a space before); an abbreviation (cos., imp., s.) does not end one. */
export function segmentLatinSentences(text: string): Span[] {
  return splitSentences(text, {
    terminators: '.!?',
    abbreviations: ['cos', 'coss', 'imp', 'kal', 'non', 'id', 'cf', 'sc', 'fr', 'pr', 'trib', 'pl', 'leg', 'etc', 'st', 'cap', 'lib', 'v', 'vv', 'vers', 'sq', 'sqq', 'seq', 'a', 'd', 'c', 'm', 'q', 'l', 'p', 't', 'ti', 'cn', 'sex', 'ser', 'app'],
  });
}

/** Roman numerals written in capitals (XL, MDCCC): their value, or undefined. A lower-case word is never read as a numeral (mi, di, mil, vix are words). */
export function romanValue(surface: string): number | undefined {
  if (!/^[IVXLCDM]+$/.test(surface)) return undefined;
  if (surface.length === 1 && !'XVLCDM'.includes(surface)) return undefined;
  if (!/^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(surface)) return undefined;
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  for (let k = 0; k < surface.length; k++) {
    const cur = v[surface[k]];
    const next = v[surface[k + 1]] ?? 0;
    n += cur < next ? -cur : cur;
  }
  return n;
}

export type Enclitic = 'que' | 'ne' | 've';
/** Words that end in -que / -ne / -ve without being host + enclitic. The analysis splits an enclitic only when the whole word has no reading of its own, so this list is a safety net for words the lexicon lacks. */
const NOT_ENCLITIC = new Set([
  'atque', 'neque', 'itaque', 'quisque', 'quaeque', 'quodque', 'uterque', 'utraque', 'utrumque', 'undique', 'ubique', 'usque', 'denique', 'utique', 'namque', 'quoque', 'quinque', 'absque',
  'bene', 'sine', 'omne', 'nonne', 'plane', 'sane', 'paene', 'breve', 'grave', 'leve', 'suave', 'nave', 'ave', 'salve', 'vive', 'neve', 'sive', 'seu', 'nisi', 'ne',
  'homine', 'nomine', 'flumine', 'lumine', 'crimine', 'carmine', 'sanguine', 'virgine', 'origine', 'ordine', 'imagine', 'fine', 'mane', 'pane', 'cane', 'iuvene', 'legione', 'natione', 'ratione', 'regione', 'religione', 'sermone', 'leone', 'ratione', 'oratione', 'mine',
]);
export function splitEnclitic(key: string): [host: string, enc: Enclitic] | undefined {
  if (NOT_ENCLITIC.has(key)) return undefined;
  for (const enc of ['que', 'ne', 've'] as const) {
    if (key.length >= enc.length + 2 && key.endsWith(enc)) return [key.slice(0, -enc.length), enc];
  }
  // -ve is written -ue once v and u are folded (actionemve, austrive)
  if (key.length >= 5 && key.endsWith('ue') && !key.endsWith('que')) return [key.slice(0, -2), 've'];
  return undefined;
}

/** Spellings a text may use for a lemma the lexicon writes the classical way (caelum ~ coelum ~ celum; saeculum ~ seculum; paenitentia ~ poenitentia). Most likely first. */
export function spellingVariants(lemma: string): string[] {
  const out = new Set<string>();
  const l = lemma;
  if (/ae/.test(l)) { out.add(l.replace(/ae/g, 'e')); out.add(l.replace(/ae/g, 'oe')); }
  if (/oe/.test(l)) { out.add(l.replace(/oe/g, 'e')); out.add(l.replace(/oe/g, 'ae')); }
  if (/ph/.test(l)) out.add(l.replace(/ph/g, 'f'));
  if (/ti(?=[aeou])/.test(l)) out.add(l.replace(/ti(?=[aeou])/g, 'ci'));
  if (/ci(?=[aeou])/.test(l)) out.add(l.replace(/ci(?=[aeou])/g, 'ti'));
  if (/^[Ii]/.test(l)) out.add(l.replace(/^I/, 'J').replace(/^i/, 'j'));
  out.delete(l);
  return [...out];
}

// ───────────────────────────── spelling variants for lookup ─────────────────────────────

export interface SpellingAlternative { key: string; period: string; why: string }

const ASSIMILATION: Array<[string, string]> = [
  ['adf', 'aff'], ['adl', 'all'], ['adp', 'app'], ['adc', 'acc'], ['adt', 'att'], ['adg', 'agg'], ['adn', 'ann'], ['adr', 'arr'], ['ads', 'ass'], ['adq', 'acq'],
  ['conr', 'corr'], ['conl', 'coll'], ['conm', 'comm'], ['conp', 'comp'], ['conb', 'comb'], ['inl', 'ill'], ['inr', 'irr'], ['inm', 'imm'], ['inp', 'imp'], ['inb', 'imb'],
  ['subm', 'summ'], ['subp', 'supp'], ['subc', 'succ'], ['subf', 'suff'], ['subg', 'sugg'], ['subr', 'surr'], ['obc', 'occ'], ['obp', 'opp'], ['obf', 'off'], ['obt', 'ott'],
  ['exf', 'eff'], ['ecf', 'eff'], ['disf', 'diff'], ['mpt', 'nt'], ['mps', 'ns'],
];
const PAIRS: Array<[string, string, string, string]> = [
  // [from, to, period, why]
  ['xc', 'sc', 'la-orthographic', 'x for s before c (sexcenti, sescenti)'], ['gesim', 'cesim', 'la-orthographic', 'g for c (vigesimus, vicesimus)'],
  ['ol', 'ul', 'la-archaic', 'o for u before l (voltus, vultus)'], ['ul', 'ol', 'la-archaic', 'u for o before l'], ['quu', 'cu', 'la-archaic', 'quu for cu (relinquus, relicuus)'], ['cu', 'quu', 'la-archaic', 'cu for quu'],
  ['ch', 'h', 'la-medieval', 'ch for h (michi, nichil)'], ['h', 'ch', 'la-medieval', 'h for ch'], ['y', 'i', 'la-medieval', 'y for i'], ['i', 'y', 'la-medieval', 'i for y'],
  ['ph', 'f', 'la-orthographic', 'ph for f'], ['f', 'ph', 'la-orthographic', 'f for ph'], ['th', 't', 'la-orthographic', 'th for t'], ['t', 'th', 'la-orthographic', 't for th'],
  ['ti', 'ci', 'la-medieval', 'ti for ci before a vowel (nuntius, nuncius)'], ['ci', 'ti', 'la-medieval', 'ci for ti before a vowel'],
  ['np', 'mp', 'la-orthographic', 'n for m before p'], ['nb', 'mb', 'la-orthographic', 'n for m before b'], ['nm', 'mm', 'la-orthographic', 'n for m before m'], ['mn', 'nn', 'la-orthographic', 'mn for nn'],
  ['ae', 'e', 'la-medieval', 'ae for e'], ['oe', 'e', 'la-medieval', 'oe for e'], ['ae', 'oe', 'la-orthographic', 'ae for oe'], ['oe', 'ae', 'la-orthographic', 'oe for ae'],
  ['md', 'nd', 'la-orthographic', 'm for n before d (quemdam, eamdem, eumdem)'], ['mq', 'nq', 'la-orthographic', 'm for n before q'],
  ['ii', 'i', 'la-orthographic', 'ii for i'], ['ce', 'cae', 'la-medieval', 'e for ae after c'], ['mihi', 'michi', 'la-medieval', 'mihi'], ['uu', 'u', 'la-orthographic', 'uu for u'],
];

/** The other spellings a word may have in the texts (assimilated prefixes, medieval e for ae and ch for h, doubled and single consonants, o for u), most likely first. Looked up only when the written form itself is unknown. */
export function spellingAlternatives(key: string): SpellingAlternative[] {
  const seen = new Set<string>([key]);
  const out: SpellingAlternative[] = [];
  const add = (k: string, period: string, why: string): void => { if (k.length >= 2 && !seen.has(k)) { seen.add(k); out.push({ key: k, period, why }); } };
  const step = (k: string, push: (k2: string, period: string, why: string) => void): void => {
    for (const [a, b] of ASSIMILATION) {
      let i = k.indexOf(a);
      if (i >= 0 && i <= 6) push(k.slice(0, i) + b + k.slice(i + a.length), 'la-assimilation', `prefix assimilation (${a} / ${b})`);
      i = k.indexOf(b);
      if (i >= 0 && i <= 6) push(k.slice(0, i) + a + k.slice(i + b.length), 'la-assimilation', `prefix assimilation (${b} / ${a})`);
    }
    for (const [from, to, period, why] of PAIRS) {
      let i = k.indexOf(from);
      let n = 0;
      while (i >= 0 && n < 4) {
        push(k.slice(0, i) + to + k.slice(i + from.length), period, why);
        i = k.indexOf(from, i + 1);
        n++;
      }
    }
    // an e for ae / oe (celum, tenebre): each e in turn
    for (let i = 0; i < k.length; i++) {
      if (k[i] === 'e' && !/[ao]/.test(k[i - 1] ?? '')) { push(k.slice(0, i) + 'ae' + k.slice(i + 1), 'la-medieval', 'e for ae'); push(k.slice(0, i) + 'oe' + k.slice(i + 1), 'la-medieval', 'e for oe'); }
    }
    // doubled consonants made single and single ones doubled (cottidie, adlabor)
    for (let i = 1; i < k.length; i++) if (k[i] === k[i - 1] && /[bcdfglmnprst]/.test(k[i])) push(k.slice(0, i) + k.slice(i + 1), 'la-orthographic', 'doubled consonant written single');
    for (let i = 1; i < k.length - 1; i++) if (/[bcdfglmnprst]/.test(k[i]) && /[aeiou]/.test(k[i - 1]) && /[aeiou]/.test(k[i + 1])) push(k.slice(0, i) + k[i] + k.slice(i), 'la-orthographic', 'single consonant written doubled');
    // i for ii at the end (consili, imperi)
    if (/[^i]i$/.test(k)) push(k + 'i', 'la-orthographic', 'i for ii in the genitive (consili)');
    if (/[^i]is$/.test(k)) push(k.slice(0, -2) + 'iis', 'la-orthographic', 'is for iis');
    if (/^h/.test(k)) push(k.slice(1), 'la-orthographic', 'initial h dropped');
    else push('h' + k, 'la-orthographic', 'initial h added');
  };
  const first: SpellingAlternative[] = [];
  step(key, (k, p, w) => { if (!seen.has(k)) { seen.add(k); first.push({ key: k, period: p, why: w }); } });
  out.push(...first);
  // two changes at once, only for the short list the first round gave (a word with a prefix and a medieval spelling)
  if (first.length < 60) for (const f of first.slice(0, 40)) step(f.key, (k, p, w) => add(k, p, `${f.why}; ${w}`));
  return out.slice(0, 400);
}
