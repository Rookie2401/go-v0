/**
 * The square (Hebrew) script shared by Hebrew (he) and Biblical Aramaic (arc): the same 22 letters, five final forms, vowel points,
 * dots and decoding rules; only the SOUNDS differ by language. Hebrew and Aramaic keep separate profiles, word lists and card ids
 * (the language id is in every id), so nothing learned in one counts for the other.
 *
 * Unit keys of letters and final forms are the Alphabet deck's own glyphs (packages/goreview/app/alphabetLetters.ts), so a letter
 * already practised there carries over. New keys: vowel points (a dotted circle ◌ and the point), the two shin/sin dots, the two
 * vowel-letter digraphs (holam male, shuruq) and the rules.
 *
 * Reading model, stated plainly: cantillation (te'amim), meteg, maqaf, paseq and sof pasuq are never needed to read an ordinary
 * word, so `fold` drops them before decoding (a maqaf and sof pasuq only separate words). Only POINTED text can be decoded from
 * its letters: a word with no vowel points (Modern Hebrew's usual spelling) returns undefined, because which vowels it has is
 * knowledge of the word, not of the letters. Not modelled: qamats qatan is read as qamats; vav carrying a holam is always taken as
 * the vowel letter (holam male); furtive patah, a silent shva versus a vocal one, stress and the doubled sound of a dagesh forte
 * are taught as rules, not computed.
 */
import type { ScriptUnit, StarterWord } from '../types';

export type SquareLang = 'he' | 'arc';

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const DOTTED = '◌';

export const MARK = {
  shva: cp(0x5b0), hatafSegol: cp(0x5b1), hatafPatah: cp(0x5b2), hatafQamats: cp(0x5b3), hiriq: cp(0x5b4), tsere: cp(0x5b5), segol: cp(0x5b6),
  patah: cp(0x5b7), qamats: cp(0x5b8), holam: cp(0x5b9), qubuts: cp(0x5bb), dagesh: cp(0x5bc), shinDot: cp(0x5c1), sinDot: cp(0x5c2),
} as const;
const VAV = cp(0x5d5);

/** The unit keys of the vowel points, digraphs and rules. */
export const KEY = {
  patah: DOTTED + MARK.patah, qamats: DOTTED + MARK.qamats, segol: DOTTED + MARK.segol, tsere: DOTTED + MARK.tsere, hiriq: DOTTED + MARK.hiriq,
  holam: DOTTED + MARK.holam, qubuts: DOTTED + MARK.qubuts, shva: DOTTED + MARK.shva,
  hatafPatah: DOTTED + MARK.hatafPatah, hatafSegol: DOTTED + MARK.hatafSegol, hatafQamats: DOTTED + MARK.hatafQamats,
  shinDot: DOTTED + MARK.shinDot, sinDot: DOTTED + MARK.sinDot,
  holamMale: VAV + MARK.holam, shuruq: VAV + MARK.dagesh,
  dagesh: 'rule-dagesh', mater: 'rule-mater', shvaRule: 'rule-shva',
} as const;

const VOWEL_KEY: Record<string, string> = {
  [MARK.shva]: KEY.shva, [MARK.hatafSegol]: KEY.hatafSegol, [MARK.hatafPatah]: KEY.hatafPatah, [MARK.hatafQamats]: KEY.hatafQamats,
  [MARK.hiriq]: KEY.hiriq, [MARK.tsere]: KEY.tsere, [MARK.segol]: KEY.segol, [MARK.patah]: KEY.patah, [MARK.qamats]: KEY.qamats,
  [MARK.holam]: KEY.holam, [MARK.qubuts]: KEY.qubuts,
};

type Row = readonly [key: string, kind: ScriptUnit['kind'], he: string, arc: string, difficulty: 1 | 2 | 3];

const L = (g: string, kind: ScriptUnit['kind'], he: string, arc: string, d: 1 | 2 | 3 = 1): Row => [g, kind, he, arc, d];

/** Letters and final forms in alphabet order, with the sound in Modern Hebrew (the deck's wording) and the conventional transliteration for Aramaic. */
const LETTER_ROWS: readonly Row[] = [
  L('א', 'letter', 'alef: silent; it carries a vowel', 'aleph: transliterated ʾ (a glottal stop; it carries a vowel)'),
  L('ב', 'letter', 'bet: v (b with a dagesh dot inside)', 'beth: transliterated b'),
  L('ג', 'letter', 'gimel: g as in go', 'gimel: transliterated g'),
  L('ד', 'letter', 'dalet: d', 'daleth: transliterated d'),
  L('ה', 'letter', 'he: h (silent at the end of most words)', 'he: transliterated h'),
  L('ו', 'letter', 'vav: v; it also stands for the vowels o and u', 'waw: transliterated w; it also stands for the vowels ô and û'),
  L('ז', 'letter', 'zayin: z', 'zayin: transliterated z'),
  L('ח', 'letter', 'chet: a rough h from the throat, as in loch', 'heth: transliterated ḥ'),
  L('ט', 'letter', 'tet: t', 'teth: transliterated ṭ'),
  L('י', 'letter', 'yod: y as in yes; it also stands for the vowels i and e', 'yod: transliterated y; it also stands for the vowels î and ê'),
  L('כ', 'letter', 'kaf: kh as in loch (k with a dagesh dot inside)', 'kaph: transliterated k'),
  L('ך', 'final-form', 'final kaf: the shape of kaf at the end of a word, said kh', 'final kaph: the shape of kaph at the end of a word'),
  L('ל', 'letter', 'lamed: l', 'lamedh: transliterated l'),
  L('מ', 'letter', 'mem: m', 'mem: transliterated m'),
  L('ם', 'final-form', 'final mem: the shape of mem at the end of a word, said m', 'final mem: the shape of mem at the end of a word'),
  L('נ', 'letter', 'nun: n', 'nun: transliterated n'),
  L('ן', 'final-form', 'final nun: the shape of nun at the end of a word, said n', 'final nun: the shape of nun at the end of a word'),
  L('ס', 'letter', 'samekh: s', 'samekh: transliterated s'),
  L('ע', 'letter', 'ayin: a throat sound, silent in most modern speech; it carries a vowel', 'ayin: transliterated ʿ (a throat sound; it carries a vowel)'),
  L('פ', 'letter', 'pe: f (p with a dagesh dot inside)', 'pe: transliterated p'),
  L('ף', 'final-form', 'final pe: the shape of pe at the end of a word, said f', 'final pe: the shape of pe at the end of a word'),
  L('צ', 'letter', 'tsadi: ts as in cats', 'tsadhe: transliterated ṣ'),
  L('ץ', 'final-form', 'final tsadi: the shape of tsadi at the end of a word, said ts', 'final tsadhe: the shape of tsadhe at the end of a word'),
  L('ק', 'letter', 'qof: k', 'qoph: transliterated q'),
  L('ר', 'letter', 'resh: r (made in the throat in modern speech)', 'resh: transliterated r'),
  L('ש', 'letter', 'shin: sh with the dot on the right; s with the dot on the left (called sin)', 'shin or sin: transliterated š (dot on the right), ś (dot on the left)'),
  L('ת', 'letter', 'tav: t', 'taw: transliterated t'),
];

const VOWEL_ROWS: readonly Row[] = [
  [KEY.patah, 'vowel-sign', 'a as in father (patach: a short line under the letter)', 'transliterated a (patah)', 1],
  [KEY.qamats, 'vowel-sign', 'a as in father (qamats: a line with a small stem under the letter; the same sound as patach)', 'transliterated ā (qamets)', 1],
  [KEY.segol, 'vowel-sign', 'e as in bet (segol: three dots under the letter)', 'transliterated e (segol)', 1],
  [KEY.tsere, 'vowel-sign', 'e as in they, or in bet in modern speech (tsere: two dots side by side under the letter)', 'transliterated ē (tsere)', 1],
  [KEY.hiriq, 'vowel-sign', 'i as in machine (hiriq: one dot under the letter)', 'transliterated i (hiriq)', 1],
  [KEY.holam, 'vowel-sign', 'o as in more (holam: one dot above the letter, on its left)', 'transliterated ō (holam)', 1],
  [KEY.qubuts, 'vowel-sign', 'u as in food (qubuts: three slanting dots under the letter)', 'transliterated u (qibbuts)', 1],
  [KEY.shva, 'vowel-sign', 'a very short e, or no vowel at all (shva: two dots one over the other under the letter)', 'transliterated ə, or no vowel (shewa)', 2],
  [KEY.hatafPatah, 'vowel-sign', 'a very short a (hataf patach: a shva with a patach)', 'transliterated ă (hateph patah)', 2],
  [KEY.hatafSegol, 'vowel-sign', 'a very short e (hataf segol: a shva with a segol)', 'transliterated ĕ (hateph segol)', 2],
  [KEY.hatafQamats, 'vowel-sign', 'a very short o (hataf qamats: a shva with a qamats)', 'transliterated ŏ (hateph qamets)', 2],
];

const OTHER_ROWS: readonly Row[] = [
  [KEY.shinDot, 'mark', 'a dot at the top right of ש: the letter is shin, sh', 'the dot on the right of ש: transliterated š', 2],
  [KEY.sinDot, 'mark', 'a dot at the top left of ש: the letter is sin, s', 'the dot on the left of ש: transliterated ś', 2],
  [KEY.holamMale, 'digraph', 'ו with a dot above it is the vowel o (holam male), not v', 'ו with a dot above it is the vowel ô (holem male), not w', 2],
  [KEY.shuruq, 'digraph', 'ו with a dot inside it is the vowel u (shuruq), not v', 'ו with a dot inside it is the vowel û (shureq), not w', 2],
  [KEY.dagesh, 'rule', 'a dot inside a letter: in ב כ פ it makes the hard sound (b, k, p); in any other letter it doubles the sound', 'a dot inside a letter: in ב ג ד כ פ ת it makes the hard stop (b g d k p t); in any other letter it doubles it', 3],
  [KEY.mater, 'rule', 'a vowel letter: ו י ה or א with no point of its own, after a vowel, only lengthens that vowel (or is silent); it is not a consonant', 'a vowel letter: ו י ה or א with no point of its own, after a vowel, only lengthens that vowel (or is silent); it is not a consonant', 3],
  [KEY.shvaRule, 'rule', 'a shva opening a syllable (or after a long vowel) is a short e; at the end of a syllable it is silent', 'a shewa opening a syllable (or after a long vowel) is ə; at the end of a syllable it is silent', 3],
];

/**
 * The profile's units for a language, without examples (a profile adds them from its own words with `withExamples`). Order: letters
 * (so the tie-break of the selector follows the alphabet), vowel points, dots, digraphs, rules.
 */
export function squareUnits(lang: SquareLang): ScriptUnit[] {
  const make = ([key, kind, he, arc, difficulty]: Row): ScriptUnit => {
    const shown = kind === 'vowel-sign' || key === KEY.shinDot || key === KEY.sinDot ? key : key;
    return { key, kind, display: shown, sound: lang === 'he' ? he : arc, difficulty };
  };
  const hard = (k: string): 1 | 2 | 3 => (k === 'ש' ? 2 : k === 'ו' || k === 'י' || k === 'ה' || k === 'א' || k === 'ע' ? 2 : 1);
  return [
    ...LETTER_ROWS.map((r) => make([r[0], r[1], r[2], r[3], hard(r[0])])),
    ...VOWEL_ROWS.map(make), ...OTHER_ROWS.map(make),
  ];
}

/** Attach to each unit one example: the most useful starter word that needs it, preferring the one with the fewest other units. */
export function withExamples(units: readonly ScriptUnit[], words: readonly StarterWord[], deps: (form: string) => readonly string[] | undefined): ScriptUnit[] {
  const modelled = words.map((w) => ({ w, d: deps(w.form) })).filter((x): x is { w: StarterWord; d: readonly string[] } => !!x.d);
  return units.map((u) => {
    const hits = modelled.filter((x) => x.d.includes(u.key) && x.d.length <= 5).sort((a, b) => a.d.length - b.d.length || b.w.weight - a.w.weight);
    const best = hits[0] ?? modelled.filter((x) => x.d.includes(u.key)).sort((a, b) => a.d.length - b.d.length || b.w.weight - a.w.weight)[0];
    return best ? { ...u, example: { form: best.w.form, gloss: best.w.gloss } } : u;
  });
}

/**
 * Cantillation, meteg, rafe, the upper and lower dots and the punctuation of a Bible text are not needed to read: dropped. A maqaf, paseq,
 * sof pasuq and geresh only separate words and become spaces. A holam haser for vav reads as holam; qamats qatan as qamats.
 */
export function foldSquare(s: string): string {
  return s.normalize('NFC')
    .replace(/[\u0591-\u05AF\u05BD\u05BF\u05C4\u05C5]/g, '')
    .replace(/\u05BA/g, MARK.holam).replace(/\u05C7/g, MARK.qamats)
    .replace(/[\u05BE\u05C0\u05C3\u05F3\u05F4]/g, ' ');
}

export const hasVowelPoint = (s: string): boolean => /[\u05B0-\u05BB\u05C7]/.test(s);

const LETTERS_SET = new Set(LETTER_ROWS.map((r) => r[0]));
const TOKEN = /([\u05D0-\u05EA])([\u05B0-\u05BC\u05C1\u05C2]*)/gy;

/**
 * The unit keys a pointed square-script form needs, in order of first use; undefined for a form with no vowel points in a word, or with
 * anything this model cannot map.
 */
export function squareDependencies(form: string): string[] | undefined {
  const text = foldSquare(form);
  const keys: string[] = [];
  const add = (k: string): void => { if (!keys.includes(k)) keys.push(k); };
  let sawLetters = false;
  for (const token of text.split(/[^\p{L}\p{M}]+/u)) {
    if (!token) continue;
    if (!/^[\u05D0-\u05EA\u05B0-\u05BC\u05C1\u05C2]+$/.test(token)) return undefined; // a non-Hebrew letter, or a mark this model does not map
    if (!/^[\u05D0-\u05EA]/.test(token)) return undefined; // a mark with no letter before it
    if (!hasVowelPoint(token)) return undefined; // unpointed: the vowels are not in the letters
    sawLetters = true;
    let prevHasVowel = false;
    TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN.exec(token))) {
      const letter = m[1];
      const marks = [...m[2]];
      if (!LETTERS_SET.has(letter)) return undefined;
      const vowels = marks.filter((x) => VOWEL_KEY[x]);
      const dagesh = marks.includes(MARK.dagesh);
      const shin = marks.includes(MARK.shinDot);
      const sin = marks.includes(MARK.sinDot);
      if ((shin || sin) && letter !== 'ש') return undefined;
      if (shin && sin) return undefined;
      const holamVav = letter === 'ו' && vowels.length === 1 && vowels[0] === MARK.holam && !dagesh;
      const shuruq = letter === 'ו' && dagesh && vowels.length === 0;
      if (holamVav) add(KEY.holamMale);
      else if (shuruq) add(KEY.shuruq);
      else {
        add(letter);
        if (shin) add(KEY.shinDot);
        if (sin) add(KEY.sinDot);
        for (const v of vowels) { add(VOWEL_KEY[v]); if (v === MARK.shva) add(KEY.shvaRule); }
        if (dagesh) add(KEY.dagesh);
        if (marks.length === 0 && (letter === 'א' || letter === 'ה' || letter === 'ו' || letter === 'י') && prevHasVowel) add(KEY.mater);
      }
      prevHasVowel = vowels.some((v) => v !== MARK.shva && v !== MARK.hatafSegol && v !== MARK.hatafPatah && v !== MARK.hatafQamats) || holamVav || shuruq;
    }
  }
  return sawLetters ? keys : undefined;
}

/** Word tokens of running pointed text: letters with their points and accents (a maqaf, sof pasuq or space ends a word). */
export function squareWordsOf(text: string): string[] {
  return text.normalize('NFC').match(/[\u05D0-\u05EA][\u05D0-\u05EA\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]*/gu) ?? [];
}
