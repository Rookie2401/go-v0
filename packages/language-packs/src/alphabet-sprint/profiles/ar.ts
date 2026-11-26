/**
 * Arabic (ar), Arabic script, right to left, read as Modern Standard Arabic with VOCALIZED words (the short vowels written as marks).
 *
 * Units: the 28 letters; the spellings that are not letters of the alphabet (hamza and its seats, alif madda, tāʾ marbūṭa, alif maqṣūra)
 * and the lām-alif ligature; the vowel marks; twenty-three POSITIONAL SHAPES (how a letter looks when it is joined, grouped by shape family);
 * and four rules. A letter's key is the bare letter, so a letter already practised in an Alphabet deck of Arabic would carry over (there
 * is none yet: packages/goreview/app/alphabetLetters.ts has no Arabic table).
 *
 * Reading model, stated plainly:
 *   - Only FULLY VOCALIZED words are decoded from their letters (tashkilLevel 'full'). Ordinary Arabic print leaves the short vowels out
 *     (rule-unvowelled); which vowels a bare word has is knowledge of the word, not of its letters, so a form that is not fully vocalized
 *     returns undefined, with ONE exception: the stage-7 cards (words/ar.ts READ_AS), an unvocalized spelling that stands for a taught,
 *     vocalized word, whose dependencies are the vocalized word's units plus rule-unvowelled.
 *   - The article ال before a sun letter is detected by spelling (the shadda on the sun letter shows it); case endings, stress, pausal forms
 *     and the Quranic marks are not modelled.
 *   - A long vowel is an alif, wāw or yāʾ with no mark of its own after the matching short vowel (rule-long-vowels).
 *   - A positional shape is needed when a letter of that family really stands joined in that position (a letter joins the one before it when
 *     that letter is not one of the six that never join forward; it joins the one after it when it is a joiner and not last).
 */
import {
  DAMMA, DAMMATAN, DAGGER_ALIF, FATHA, FATHATAN, KASRA, KASRATAN, NON_JOINING, SHADDA, SUKUN, SUN_LETTERS, splitVocal, tashkilLevel,
} from '../../../../../src/adapters/arabic/text';
import { PHRASES, READ_AS, WORDS } from '../words/ar';
import type { ScriptProfile, ScriptUnit } from '../types';

const DOT = '◌';
const TATWEEL = 'ـ';

export const KEY = {
  fatha: DOT + FATHA, kasra: DOT + KASRA, damma: DOT + DAMMA, sukun: DOT + SUKUN, shadda: DOT + SHADDA,
  fathatan: DOT + FATHATAN, kasratan: DOT + KASRATAN, dammatan: DOT + DAMMATAN, dagger: DOT + DAGGER_ALIF,
  hamza: 'ء', madda: 'آ', taMarbuta: 'ة', maqsura: 'ى', lamAlif: 'لا',
  longVowels: 'rule-long-vowels', articleSun: 'rule-article-sun', joining: 'rule-joining', unvowelled: 'rule-unvowelled',
  // positional shapes, by shape family
  tooth: 'shape-tooth', boatEnd: 'shape-boat-end', nunEnd: 'shape-nun-end', yaEnd: 'shape-ya-end', hook: 'shape-hook', hookEnd: 'shape-hook-end',
  sin: 'shape-sin', sinEnd: 'shape-sin-end', aynInit: 'shape-ayn-init', aynMid: 'shape-ayn-mid', aynEnd: 'shape-ayn-end', fq: 'shape-fq',
  faEnd: 'shape-fa-end', qafEnd: 'shape-qaf-end', kaf: 'shape-kaf', kafEnd: 'shape-kaf-end', stem: 'shape-stem', stemEnd: 'shape-stem-end',
  mim: 'shape-mim', mimEnd: 'shape-mim-end', haInit: 'shape-ha-init', haMid: 'shape-ha-mid', haEnd: 'shape-ha-end',
} as const;

const NON_JOINERS = new Set([...'ادذرزو']);

type Row = readonly [letter: string, sound: string, difficulty: 1 | 2 | 3];
/** The 28 letters in alphabet order, with the scholarly transliteration and an English hint. Machine-drafted; one romanization throughout. */
const LETTERS: readonly Row[] = [
  ['ا', 'alif: ā, a long "a" as in father; at the start of a word it only carries a vowel (a, i or u)', 1],
  ['ب', 'bāʾ: b as in bat', 1],
  ['ت', 'tāʾ: t as in tea', 1],
  ['ث', 'thāʾ: th as in think', 2],
  ['ج', 'jīm: j as in jam (g in some regions)', 1],
  ['ح', 'ḥāʾ: ḥ, a strong breathy h made low in the throat; no English sound', 2],
  ['خ', 'khāʾ: kh as in Scottish loch', 2],
  ['د', 'dāl: d as in dog', 1],
  ['ذ', 'dhāl: dh as in this', 2],
  ['ر', 'rāʾ: r, tapped or rolled', 1],
  ['ز', 'zāy: z as in zoo', 1],
  ['س', 'sīn: s as in sun', 1],
  ['ش', 'shīn: sh as in ship', 1],
  ['ص', 'ṣād: ṣ, a deeper s said with the tongue drawn back (emphatic)', 2],
  ['ض', 'ḍād: ḍ, a deeper d said with the tongue drawn back (emphatic)', 2],
  ['ط', 'ṭāʾ: ṭ, a deeper t said with the tongue drawn back (emphatic)', 2],
  ['ظ', 'ẓāʾ: ẓ, a deeper dh or z said with the tongue drawn back (emphatic)', 2],
  ['ع', 'ʿayn: ʿ, a squeezed voiced sound deep in the throat; no English sound', 2],
  ['غ', 'ghayn: gh, a rasping sound at the back of the throat, like a gargled r', 2],
  ['ف', 'fāʾ: f as in fan', 1],
  ['ق', 'qāf: q, a k made further back in the throat (g in some regions)', 2],
  ['ك', 'kāf: k as in kit', 1],
  ['ل', 'lām: l as in lamp', 1],
  ['م', 'mīm: m as in man', 1],
  ['ن', 'nūn: n as in net', 1],
  ['ه', 'hāʾ: h as in hat', 1],
  ['و', 'wāw: w as in way; after a ḍamma with no mark of its own it is the long vowel ū', 1],
  ['ي', 'yāʾ: y as in yes; after a kasra with no mark of its own it is the long vowel ī', 1],
];

/** How a letter joins: the three connected shapes (initial, medial, final) for a joiner, or only the final shape for the six that never join forward. */
function joinNote(letter: string): string {
  if (NON_JOINERS.has(letter)) return `joins the letter before it (${TATWEEL}${letter}) but never the letter after it`;
  return `joins both sides: ${letter}${TATWEEL} ${TATWEEL}${letter}${TATWEEL} ${TATWEEL}${letter}`;
}

const SPELLINGS: readonly ScriptUnit[] = [
  { key: KEY.hamza, kind: 'letter', display: 'ء أ إ ؤ ئ', sound: 'hamza (ʾ): a catch in the throat, as in the middle of "uh-oh". It sits on a "seat": أ (on alif, above), إ (on alif, below), ؤ (on wāw), ئ (on a yāʾ without dots) or alone as ء', note: 'one sound, several seats: the seat follows the neighbouring vowel and does not change the sound', difficulty: 3 },
  { key: KEY.madda, kind: 'letter', display: 'آ', sound: 'alif madda: ʾā, a hamza followed by a long ā (the wavy line above the alif is that hamza)', note: 'never joins the letter after it', difficulty: 2 },
  { key: KEY.taMarbuta, kind: 'final-form', display: 'ة', sound: 'tāʾ marbūṭa: -a at the end of a word (-at when a word follows closely); a ه-like body with the two dots of ت above it', note: 'only at the end of a word, usually marks a feminine noun; joins the letter before it, never the one after', difficulty: 2 },
  { key: KEY.maqsura, kind: 'final-form', display: 'ى', sound: 'alif maqṣūra: a long ā at the end of a word, written like a ي without dots', note: 'only at the end of a word; joins the letter before it, never the one after', difficulty: 2 },
  { key: KEY.lamAlif, kind: 'digraph', display: 'لا', sound: 'lām-alif: ل followed by ا (or by أ إ آ, as لأ لإ لآ) is always written as this one joined shape: lā', note: 'two letters in one shape; joins the letter before it, never the one after', difficulty: 1 },
];

const MARKS: readonly ScriptUnit[] = [
  { key: KEY.fatha, kind: 'vowel-sign', display: DOT + FATHA, sound: 'fatḥa: short a (as in cat); a small slanted stroke above the letter', difficulty: 1 },
  { key: KEY.kasra, kind: 'vowel-sign', display: DOT + KASRA, sound: 'kasra: short i (as in sit); a small slanted stroke below the letter', difficulty: 1 },
  { key: KEY.damma, kind: 'vowel-sign', display: DOT + DAMMA, sound: 'ḍamma: short u (as in put); a small curl like a tiny و above the letter', difficulty: 1 },
  { key: KEY.sukun, kind: 'mark', display: DOT + SUKUN, sound: 'sukūn: no vowel after this letter; a small circle above it', note: 'the letter ends its syllable and the next consonant follows at once', difficulty: 1 },
  { key: KEY.shadda, kind: 'mark', display: DOT + SHADDA, sound: 'shadda: the letter is doubled (said twice, held); a small w-shape above it, with a vowel mark above or below that', difficulty: 2 },
  { key: KEY.fathatan, kind: 'vowel-sign', display: DOT + FATHATAN, sound: 'fatḥatān: -an at the end of a word; two slanted strokes above, usually on the letter before a final ا', difficulty: 2 },
  { key: KEY.kasratan, kind: 'vowel-sign', display: DOT + KASRATAN, sound: 'kasratān: -in at the end of a word; two slanted strokes below', difficulty: 2 },
  { key: KEY.dammatan, kind: 'vowel-sign', display: DOT + DAMMATAN, sound: 'ḍammatān: -un at the end of a word; two curls above', difficulty: 2 },
  { key: KEY.dagger, kind: 'vowel-sign', display: DOT + DAGGER_ALIF, sound: 'dagger alif: a long ā written as a small upright stroke above the letter instead of a full ا', note: 'found in a few common words such as هٰذَا (this) and ذٰلِكَ (that)', difficulty: 2 },
];

/**
 * The positional shapes, by shape family: ONE unit for each statement that is true of every letter it names, in the position it names. A joining
 * letter has an initial (joined to the next letter only), a medial (joined on both sides) and a final (joined to the letter before only) shape;
 * the stand-alone shape is the letter unit itself. The display is the real positional form (src/adapters/arabic/alphabet.ts arShapes): the
 * tatweel ـ stands for the side that joins. Machine-drafted descriptions, not reviewed against a type specimen by a teacher.
 */
const pos = (letters: string, where: 'i' | 'm' | 'f'): string => [...letters].map((l) => (where === 'i' ? l + TATWEEL : where === 'm' ? TATWEEL + l + TATWEEL : TATWEEL + l)).join(' ');
const SHAPES: readonly ScriptUnit[] = [
  { key: KEY.tooth, kind: 'positional-form', display: pos('بتثني', 'i') + '  ' + pos('بتثني', 'm'), sound: 'ب ت ث ن ي joined to the NEXT letter (at the start or in the middle of a word) are all the same small upright tooth on the line', note: 'only the dots tell the five apart: one below ب, two above ت, three above ث, one above ن, two below ي', difficulty: 2 },
  { key: KEY.boatEnd, kind: 'final-form', display: pos('بتث', 'f'), sound: 'at the end of a word, joined to the letter before, ب ت ث are a wide shallow boat lying on the line, with the same dots as always', note: 'ن and ي do NOT take this shape: they have units of their own', difficulty: 2 },
  { key: KEY.nunEnd, kind: 'final-form', display: pos('ن', 'f'), sound: 'ن at the end of a word is a deep bowl that drops below the line, with its one dot above (the stand-alone ن is the same bowl)', difficulty: 2 },
  { key: KEY.yaEnd, kind: 'final-form', display: pos('ي', 'f'), sound: 'ي at the end of a word, joined to the letter before, ends in a long tail that sweeps back to the left below the line, with two dots below', note: 'ن is a deep bowl with a dot above; ي has the long tail and two dots below', difficulty: 2 },
  { key: KEY.hook, kind: 'positional-form', display: pos('جحخ', 'i') + '  ' + pos('جحخ', 'm'), sound: 'ج ح خ joined to the next letter (at the start or in the middle) lose their lower hook and become a small head with a flat top', note: 'the dot tells them apart: one below ج, none on ح, one above خ', difficulty: 2 },
  { key: KEY.hookEnd, kind: 'final-form', display: pos('جحخ', 'f'), sound: 'at the end of a word, joined to the letter before, ج ح خ get their curved hook back below the line (the tail returns), after a short joining stroke from the right', note: 'one dot below ج, none on ح, one above خ', difficulty: 2 },
  { key: KEY.sin, kind: 'positional-form', display: pos('سشصض', 'i') + '  ' + pos('سشصض', 'm'), sound: 'س ش joined to the next letter (at the start or in the middle) are a row of three small teeth with no tail; ص ض are a small closed loop on the line', note: 'ش has three dots above, ض one dot above', difficulty: 2 },
  { key: KEY.sinEnd, kind: 'final-form', display: pos('سشصض', 'f'), sound: 'at the end of a word, joined to the letter before, the tail of س ش ص ض returns: the teeth (س ش) or the loop (ص ض) are followed by a sweep curving back to the left below the line', difficulty: 2 },
  { key: KEY.aynInit, kind: 'positional-form', display: pos('عغ', 'i'), sound: 'ع غ at the START of a word, joined to the next letter: an open curve like a c, the same as the top of the stand-alone letter', note: 'غ has a dot above', difficulty: 2 },
  { key: KEY.aynMid, kind: 'positional-form', display: pos('عغ', 'm'), sound: 'ع غ in the MIDDLE of a word, joined on both sides: a small closed knot with a flat top (not the open c of the start)', note: 'غ has a dot above', difficulty: 2 },
  { key: KEY.aynEnd, kind: 'final-form', display: pos('عغ', 'f'), sound: 'ع غ at the end of a word, joined to the letter before: a closed knot with a curved tail dropping below the line', note: 'غ has a dot above', difficulty: 2 },
  { key: KEY.fq, kind: 'positional-form', display: pos('فق', 'i') + '  ' + pos('فق', 'm'), sound: 'ف ق joined to the next letter (at the start or in the middle) are a round head sitting on the line', note: 'one dot above ف, two dots above ق', difficulty: 2 },
  { key: KEY.faEnd, kind: 'final-form', display: pos('ف', 'f'), sound: 'ف at the end of a word: the round head followed by a flat tail running left along the line, with one dot above', difficulty: 2 },
  { key: KEY.qafEnd, kind: 'final-form', display: pos('ق', 'f'), sound: 'ق at the end of a word: the round head followed by a deep round tail that drops below the line, with two dots above', note: 'ـف has a flat tail, ـق a deep one', difficulty: 2 },
  { key: KEY.kaf, kind: 'positional-form', display: pos('ك', 'i') + '  ' + pos('ك', 'm'), sound: 'ك joined to the next letter (at the start or in the middle) is a tall bar slanting back over a short base on the line; the small mark inside the stand-alone and end shapes is gone', difficulty: 2 },
  { key: KEY.kafEnd, kind: 'final-form', display: pos('ك', 'f'), sound: 'ك at the end of a word, joined to the letter before: a tall stroke over a base on the line, with the small slanted mark tucked inside the corner', note: 'the stand-alone ك has the same shape without the joining stroke', difficulty: 2 },
  { key: KEY.stem, kind: 'positional-form', display: pos('لطظ', 'i') + '  ' + pos('لطظ', 'm'), sound: 'ل ط ظ joined to the next letter (at the start or in the middle) keep their tall upright stem (ط ظ also keep their small loop at the foot)', note: 'ظ has a dot above, ط none', difficulty: 2 },
  { key: KEY.stemEnd, kind: 'final-form', display: pos('لطظ', 'f'), sound: 'ل ط ظ at the end of a word, joined to the letter before, keep the tall stem and take a short joining stroke from the right: ـل ends in a curved tail below the line, ـط ـظ in their small loop at the foot', note: 'ظ has a dot above, ط none', difficulty: 2 },
  { key: KEY.mim, kind: 'positional-form', display: pos('م', 'i') + '  ' + pos('م', 'm'), sound: 'م joined to the next letter (at the start or in the middle) is a small closed knot sitting on the line, with no tail', difficulty: 2 },
  { key: KEY.mimEnd, kind: 'final-form', display: pos('م', 'f'), sound: 'م at the end of a word, joined to the letter before: the knot with a tail hanging down below the line', difficulty: 2 },
  { key: KEY.haInit, kind: 'positional-form', display: pos('ه', 'i'), sound: 'ه at the START of a word, joined to the next letter: a rounded loop with a second, smaller loop inside it', difficulty: 2 },
  { key: KEY.haMid, kind: 'positional-form', display: pos('ه', 'm'), sound: 'ه in the MIDDLE of a word, joined on both sides: two small loops, one above the line and one below it, like a figure 8', difficulty: 2 },
  { key: KEY.haEnd, kind: 'final-form', display: pos('ه', 'f'), sound: 'ه at the end of a word, joined to the letter before: a rounded, leaning loop on the line (the stand-alone ه is a separate round shape, the letter card)', difficulty: 2 },
];

const RULES: readonly ScriptUnit[] = [
  { key: KEY.longVowels, kind: 'rule', display: 'بَا بُو بِي', sound: 'a long vowel is a short vowel plus ا, و or ي with no mark of its own: fatḥa + ا = ā, ḍamma + و = ū, kasra + ي = ī (fatḥa + ى = ā at the end of a word)', note: 'a و or ي that carries its own vowel or a sukūn is a consonant (w, y), not a long vowel', difficulty: 2 },
  { key: KEY.articleSun, kind: 'rule', display: 'الشَّمْس', sound: 'the article ال before a "sun letter" (ت ث د ذ ر ز س ش ص ض ط ظ ل ن): the ل is not said and the next letter is doubled (shown by a shadda): ash-shams, not al-shams', note: 'before the other letters (the "moon letters") the ل is said: الْقَمَر al-qamar', difficulty: 2 },
  { key: KEY.joining, kind: 'rule', display: 'ب بـ ـبـ ـب', sound: 'letters join and change shape by position (alone, start, middle, end); the six letters ا د ذ ر ز و never join the letter after them, so a word breaks after one', note: 'Arabic is not written in separate letters: each letter card shows its connected shapes and the shape units test them', difficulty: 2 },
  { key: KEY.unvowelled, kind: 'rule', display: 'كتاب', sound: 'print usually leaves the short vowels out (كتاب for كِتَاب): the letters alone give the consonants, and you say the word from knowing it', note: 'the stage-7 cards ask a taught word without its vowels, and show the vocalized word on the back', difficulty: 3 },
];

/** The units in order: letters (alphabet order, so the selector's tie-break follows it), spellings, marks, shapes, rules. */
const BASE: readonly ScriptUnit[] = [
  ...LETTERS.map(([letter, sound, difficulty]): ScriptUnit => ({ key: letter, kind: 'letter', display: letter, sound, note: joinNote(letter), difficulty })),
  ...SPELLINGS, ...MARKS, ...SHAPES, ...RULES,
];

const VOWEL_KEY: Readonly<Record<string, string>> = {
  [FATHA]: KEY.fatha, [KASRA]: KEY.kasra, [DAMMA]: KEY.damma, [SUKUN]: KEY.sukun,
  [FATHATAN]: KEY.fathatan, [KASRATAN]: KEY.kasratan, [DAMMATAN]: KEY.dammatan,
};
const LETTER_KEYS = new Set(LETTERS.map((r) => r[0]));
const HAMZA_SEATS = new Set([...'ءأإؤئ']);
const LIGATURE_NEXT = new Set([...'اأإآ']);

/** The shape unit a letter needs where it stands (joined to the previous and/or the next letter), or undefined when its shape is the stand-alone one. */
function shapeOf(ch: string, joinedPrev: boolean, joinedNext: boolean): string | undefined {
  if (joinedNext) {
    if ('بتثني'.includes(ch)) return KEY.tooth;
    if ('جحخ'.includes(ch)) return KEY.hook;
    if ('سشصض'.includes(ch)) return KEY.sin;
    if ('عغ'.includes(ch)) return joinedPrev ? KEY.aynMid : KEY.aynInit;
    if ('فق'.includes(ch)) return KEY.fq;
    if (ch === 'ك') return KEY.kaf;
    if ('لطظ'.includes(ch)) return KEY.stem;
    if (ch === 'م') return KEY.mim;
    if (ch === 'ه') return joinedPrev ? KEY.haMid : KEY.haInit;
    return undefined;
  }
  if (joinedPrev) {
    if ('بتث'.includes(ch)) return KEY.boatEnd;
    if (ch === 'ن') return KEY.nunEnd;
    if (ch === 'ي') return KEY.yaEnd;
    if ('جحخ'.includes(ch)) return KEY.hookEnd;
    if ('سشصض'.includes(ch)) return KEY.sinEnd;
    if ('عغ'.includes(ch)) return KEY.aynEnd;
    if (ch === 'ف') return KEY.faEnd;
    if (ch === 'ق') return KEY.qafEnd;
    if (ch === 'ك') return KEY.kafEnd;
    if ('لطظ'.includes(ch)) return KEY.stemEnd;
    if (ch === 'م') return KEY.mimEnd;
    if (ch === 'ه') return KEY.haEnd;
  }
  return undefined;
}

/**
 * Where each of the 28 letters stands in a form: 'initial' (joined to the next letter only), 'medial' (both sides), 'final' (joined to the letter
 * before only) or 'isolated' (neither). The lām of a lām-alif shape is not a lām here. Used by the coverage test.
 */
export function arLetterPositions(form: string): Array<[letter: string, position: 'initial' | 'medial' | 'final' | 'isolated']> {
  const out: Array<[string, 'initial' | 'medial' | 'final' | 'isolated']> = [];
  for (const token of form.normalize('NFC').split(/[^\p{L}\p{M}]+/u)) {
    const { key } = splitVocal(token);
    for (let i = 0; i < key.length; i++) {
      const ch = key[i];
      if (ch === 'ل' && i < key.length - 1 && LIGATURE_NEXT.has(key[i + 1])) { i++; continue; }
      if (!LETTER_KEYS.has(ch)) continue;
      const jp = i > 0 && !NON_JOINING.has(key[i - 1]);
      const jn = i < key.length - 1 && !NON_JOINING.has(ch);
      out.push([ch, jn ? (jp ? 'medial' : 'initial') : jp ? 'final' : 'isolated']);
    }
  }
  return out;
}

/**
 * Whether a token is fully vocalized: tashkilLevel 'full'. The article ال (alone or after one prefix letter) before a sun letter is not
 * counted, because its lām carries no mark by design; آ carries its own vowel.
 */
function fullyVocalized(token: string): boolean {
  const { key, marks } = splitVocal(token);
  let from = 0;
  if (/^[وفبكل]?ال./.test(key)) {
    const a = key[0] === 'ا' ? 0 : 1;
    if (key[a] === 'ا' && key[a + 1] === 'ل' && marks[a + 2]?.shadda) from = a + 2;
  }
  let rest = '';
  for (let i = from; i < key.length; i++) {
    const c = key[i] === 'آ' ? 'أ' : key[i];
    rest += c + (key[i] === 'آ' ? FATHA : marks[i].vowel) + (marks[i].shadda ? SHADDA : '') + (marks[i].dagger ? DAGGER_ALIF : '');
  }
  return from < key.length && tashkilLevel(rest) === 'full';
}

/** The units of one fully vocalized token (false when the token is not fully vocalized or has something unmapped). */
function tokenUnits(token: string, add: (k: string) => void): boolean {
  const { key, marks } = splitVocal(token);
  if (!key || !fullyVocalized(token)) return false;
  const joinsForward = (c: string | undefined): boolean => !!c && !NON_JOINING.has(c);
  const mark = (m: { vowel: string; shadda: boolean; dagger: boolean }): boolean => {
    if (m.vowel) { const v = VOWEL_KEY[m.vowel]; if (!v) return false; add(v); }
    if (m.shadda) add(KEY.shadda);
    if (m.dagger) add(KEY.dagger);
    return true;
  };
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    const m = marks[i];
    const prev = i > 0 ? marks[i - 1] : undefined;
    const bare = !m.vowel && !m.shadda && !m.dagger;
    const joinedPrev = i > 0 && joinsForward(key[i - 1]);
    const joinedNext = i < key.length - 1 && joinsForward(ch);
    // lām followed by an alif (ا أ إ آ) is the one joined lām-alif shape
    if (ch === 'ل' && i < key.length - 1 && LIGATURE_NEXT.has(key[i + 1])) {
      add(KEY.lamAlif);
      add('ل'); // the ligature is the two letters joined: the learner needs both
      if (!mark(m)) return false;
      const nx = key[i + 1];
      const am = marks[i + 1];
      if (nx === 'آ') add(KEY.madda);
      else if (nx === 'ا') add('ا');
      else add(KEY.hamza);
      if (!mark(am)) return false;
      if (nx === 'ا' && !am.vowel && !am.shadda && !am.dagger && m.vowel === FATHA) add(KEY.longVowels);
      i++;
      continue;
    }
    if (HAMZA_SEATS.has(ch)) add(KEY.hamza);
    else if (ch === 'آ') add(KEY.madda);
    else if (ch === 'ة') add(KEY.taMarbuta);
    else if (ch === 'ى') add(KEY.maqsura);
    else if (LETTER_KEYS.has(ch)) add(ch);
    else return false;
    const shape = shapeOf(ch, joinedPrev, joinedNext);
    if (shape) add(shape);
    if (!mark(m)) return false;
    // a long vowel: a bare ا و ي (or ى) after the matching short vowel
    if (bare && prev) {
      const pv = prev.vowel;
      if ((ch === 'ا' && pv === FATHA) || (ch === 'و' && pv === DAMMA) || (ch === 'ي' && pv === KASRA) || (ch === 'ى' && pv === FATHA)) add(KEY.longVowels);
    }
    // the article before a sun letter: ال (alone or after a one-letter prefix) with the next letter doubled
    if (ch === 'ا' && key[i + 1] === 'ل' && (i === 0 || (i === 1 && 'وفبكل'.includes(key[0])))) {
      const sun = key[i + 2];
      if (sun && SUN_LETTERS.has(sun) && marks[i + 2]?.shadda) add(KEY.articleSun);
    }
  }
  return true;
}

/**
 * The unit keys a form needs, in order of first use. A form is a decoding exercise only when it is FULLY vocalized (tashkilLevel 'full');
 * otherwise undefined, as for non-Arabic text and for a letter or mark this model does not map. A phrase is the union of its words. The one
 * exception is an unvocalized spelling listed in READ_AS (the stage-7 cards): the units of the vocalized text it stands for, plus
 * rule-unvowelled.
 */
export function arabicDependencies(form: string): string[] | undefined {
  const text = form.normalize('NFC').trim().replace(/^[.؟!،\s]+|[.؟!،\s]+$/g, '');
  const read = Object.prototype.hasOwnProperty.call(READ_AS, text) ? READ_AS[text] : undefined;
  if (read) {
    const d = arabicDependencies(read);
    return d ? [...d, KEY.unvowelled] : undefined;
  }
  const keys: string[] = [];
  const add = (k: string): void => { if (!keys.includes(k)) keys.push(k); };
  let sawLetters = false;
  for (const token of text.split(/[^\p{L}\p{M}]+/u)) {
    if (!token) continue;
    if (!/^[ء-غف-ٰٟـٱ]+$/.test(token)) return undefined; // not Arabic, or a letter this model does not map
    if (!tokenUnits(token, add)) return undefined;
    sawLetters = true;
  }
  return sawLetters && keys.length ? keys : undefined;
}

/**
 * THE COURSE STAGES (the brief's order). Every unit has a stage; the table is exported so tests and the deck can read it.
 *   1  ا ب ت ن ي م ل و with fatḥa, kasra, ḍamma, sukūn and the long-vowel rule, and ء (the brief's own Stage 1 word مَاء needs it)
 *   2  ث ج ح خ د ذ ر ز
 *   3  س ش ص ض ط ظ ع غ ف ق ك ه
 *   4  the twenty-three positional-shape units and rule-joining
 *   5  shadda, the three tanwīn, the dagger alif, آ ة ى, the lām-alif shape, the article before a sun letter
 *   7  rule-unvowelled (stage 6, the article forms, and stage 8, reading, add words, not units)
 */
export const AR_STAGES: Readonly<Record<string, number>> = (() => {
  const t: Record<string, number> = {};
  const put = (n: number, keys: readonly string[]): void => { for (const k of keys) t[k] = n; };
  put(1, [...'ابتنيملو', KEY.fatha, KEY.kasra, KEY.damma, KEY.sukun, KEY.longVowels, KEY.hamza]);
  put(2, [...'ثجحخدذرز']);
  put(3, [...'سشصضطظعغفقكه']);
  put(4, [KEY.joining, ...Object.values(KEY).filter((k) => k.startsWith('shape-'))]);
  put(5, [KEY.shadda, KEY.fathatan, KEY.kasratan, KEY.dammatan, KEY.dagger, KEY.madda, KEY.taMarbuta, KEY.maqsura, KEY.lamAlif, KEY.articleSun]);
  put(7, [KEY.unvowelled]);
  return t;
})();
const stageOfKey = (k: string): number => AR_STAGES[k] ?? 1;
const isShapeKey = (k: string): boolean => k.startsWith('shape-');
const ALL_KEYS = BASE.map((u) => u.key);
const gate = (below: number): string[] => ALL_KEYS.filter((k) => stageOfKey(k) < below);

/**
 * The words the brief names. A brief word keeps the stage the brief lists it in (by its LETTERS and vowel marks) even when it contains a later
 * unit: غُرْفَة and هُدًى are Stage 3 words but pull ة / ى / the tanwīn in early; مَدْرَسَة, سَلَام, حَيَاة, عَلَّمَ, ثَلَاثَة likewise pull ة,
 * the lām-alif shape or shadda. The test lists these early units explicitly.
 */
export const AR_BRIEF_WORDS: ReadonlySet<string> = new Set(
  'بَاب بَيْت بِنْت لَبَن مَاء لَيْل ثَلَاثَة بَحْر بَحْث خُبْز دَار جَمِيل شَمْس قَمَر كِتَاب قَلْب عِلْم غُرْفَة صَبْر هُدًى عَلَم عَالَم مَدْرَسَة إِنْسَان حَيَاة مَعْرِفَة حَقِيقَة حِكْمَة سَلَام عَلَّمَ عَلِمَ'.split(' ').map((f) => f.normalize('NFC')),
);
const STARTER_FORMS: ReadonlySet<string> = new Set([...WORDS.map((w) => w.form), ...PHRASES.map((p) => p.form)].map((f) => f.normalize('NFC')));
const isArticleForm = (f: string): boolean => f.startsWith('ال') && !Object.prototype.hasOwnProperty.call(READ_AS, f);

/** The STAGE-4 SHAPE WORDS: plain words (letters and marks of stages 1–3 only), at least three per shape unit, that unlock the shape units. */
const SHAPE_WORD_COUNT = 3;
export const AR_SHAPE_WORDS: ReadonlySet<string> = (() => {
  const out = new Set<string>();
  const cands = WORDS.map((w) => ({ w, d: arabicDependencies(w.form) })).filter((x): x is { w: (typeof WORDS)[number]; d: string[] } => !!x.d)
    .filter(({ w, d }) => !AR_BRIEF_WORDS.has(w.form) && !Object.prototype.hasOwnProperty.call(READ_AS, w.form) && !isArticleForm(w.form)
      && d.filter((k) => !isShapeKey(k)).every((k) => stageOfKey(k) <= 3) && d.some(isShapeKey));
  for (const key of Object.values(KEY).filter(isShapeKey)) {
    cands.filter((x) => x.d.includes(key)).sort((a, b) => a.d.length - b.d.length || b.w.weight - a.w.weight).slice(0, SHAPE_WORD_COUNT).forEach((x) => out.add(x.w.form));
  }
  return out;
})();

/**
 * What the Sprint needs for a STARTER word or phrase: the stage rule of the course, written into the dependencies (the engine only reads
 * dependencies). A word of stages 1–3 lists its letters and marks (no shape units: the letter card shows the joined shapes) and every unit of the
 * stages before its own; a stage-4 shape word lists its shape units, rule-joining and all of stages 1–3; a word with a stage-5 unit, an article
 * form (stage 6) or an unvocalized card (stage 7) lists its honest units WITH shapes and every earlier stage. A brief word keeps its brief
 * stage. A form that is not a starter word gets the honest list (arabicDependencies), so a page's readiness is measured truthfully.
 */
export function arCourseDependencies(form: string): readonly string[] | undefined {
  const honest = arabicDependencies(form);
  const f = form.normalize('NFC');
  if (!honest || !STARTER_FORMS.has(f)) return honest;
  const sans = honest.filter((k) => !isShapeKey(k) && k !== KEY.joining);
  let deps: string[];
  if (Object.prototype.hasOwnProperty.call(READ_AS, f)) deps = [...honest, ...gate(7)];
  else if (isArticleForm(f)) deps = [...honest, ...gate(6)];
  else if (AR_BRIEF_WORDS.has(f)) { const s = Math.max(1, ...sans.filter((k) => stageOfKey(k) <= 3).map(stageOfKey)); deps = [...sans, ...gate(s)]; }
  else {
    const s = Math.max(1, ...sans.map(stageOfKey));
    if (s >= 5) deps = [...honest, ...gate(5)];
    else if (AR_SHAPE_WORDS.has(f)) deps = [...sans, ...honest.filter(isShapeKey), KEY.joining, ...gate(4)];
    else deps = [...sans, ...gate(s)];
  }
  return [...new Set(deps)];
}

/** Attach to each unit one example: the most useful starter word that needs it, preferring the one with the fewest other units. */
function withExamples(units: readonly ScriptUnit[]): ScriptUnit[] {
  const modelled = WORDS.map((w) => ({ w, d: arCourseDependencies(w.form) })).filter((x): x is { w: (typeof WORDS)[number]; d: readonly string[] } => !!x.d);
  return units.map((u) => {
    const hits = modelled.filter((x) => x.d.includes(u.key));
    const best = hits.filter((x) => x.d.length <= 6).sort((a, b) => a.d.length - b.d.length || b.w.weight - a.w.weight)[0]
      ?? hits.sort((a, b) => a.d.length - b.d.length || b.w.weight - a.w.weight)[0];
    return best ? { ...u, example: { form: best.w.form, gloss: best.w.gloss } } : u;
  });
}

export const AR_PROFILE: ScriptProfile = {
  languageId: 'ar', scriptId: 'Arab', rtl: true, firstBatch: 4, laterBatch: 3, pagesAfterFirstWord: true,
  units: withExamples(BASE),
  words: WORDS, phrases: PHRASES,
  confusions: [
    // shapes that differ by dots
    { a: 'ب', b: 'ت', tell: 'both have one low bowl; ب has one dot below, ت has two dots above' },
    { a: 'ت', b: 'ث', tell: 'ت has two dots above, ث has three dots above' },
    { a: 'ب', b: 'ن', tell: 'ب has its dot below the line, ن has its dot above' },
    { a: 'ن', b: 'ي', tell: 'ن has one dot above, ي has two dots below (and a tail at the end of a word)' },
    { a: 'ج', b: 'ح', tell: 'ج has a dot inside its hook, ح has no dot' },
    { a: 'ح', b: 'خ', tell: 'خ has a dot above, ح has none' },
    { a: 'د', b: 'ذ', tell: 'ذ has a dot above, د has none' },
    { a: 'ر', b: 'ز', tell: 'ز has a dot above, ر has none' },
    { a: 'س', b: 'ش', tell: 'ش has three dots above, س has none' },
    { a: 'ص', b: 'ض', tell: 'ض has a dot above, ص has none' },
    { a: 'ط', b: 'ظ', tell: 'ظ has a dot above, ط has none' },
    { a: 'ع', b: 'غ', tell: 'غ has a dot above, ع has none' },
    { a: 'ف', b: 'ق', tell: 'ف has one dot above, ق has two dots above (and a deeper tail at the end of a word)' },
    // sounds that an English ear blurs
    { a: 'س', b: 'ص', tell: 'ص is a deeper s with the tongue drawn back; س is the plain s' },
    { a: 'ت', b: 'ط', tell: 'ط is a deeper t with the tongue drawn back; ت is the plain t' },
    { a: 'د', b: 'ض', tell: 'ض is a deeper d with the tongue drawn back; د is the plain d' },
    { a: 'ح', b: 'ه', tell: 'ح is a strong breathy h low in the throat; ه is the light h of hat' },
    { a: 'ك', b: 'ق', tell: 'ق is a k made further back in the throat; ك is the plain k' },
    { a: KEY.hamza, b: 'ع', tell: 'ء is a quick catch of the breath; ع is a longer squeezed sound deeper in the throat' },
    // the vowel marks (عَلَم flag, عِلْم knowledge, عَلَّمَ he taught, عَلِمَ he knew differ only by marks)
    { a: KEY.fatha, b: KEY.kasra, tell: 'fatḥa sits above the letter (a), kasra below it (i): عَلَم ʿalam, عِلْم ʿilm' },
    { a: KEY.fatha, b: KEY.damma, tell: 'fatḥa is a slanted stroke (a), ḍamma a small curl like a tiny و (u)' },
    { a: KEY.tooth, b: KEY.boatEnd, tell: 'the same three letters ب ت ث: at the start or middle a small tooth, at the end a wide shallow boat' },
    { a: KEY.boatEnd, b: KEY.nunEnd, tell: 'the end of ب ت ث is a wide shallow boat on the line; the end of ن is a deep bowl dropping below it' },
    { a: KEY.nunEnd, b: KEY.yaEnd, tell: 'the end of ن is a deep bowl with one dot above; the end of ي has a long tail and two dots below' },
    { a: KEY.faEnd, b: KEY.qafEnd, tell: 'the end of ف has a flat tail and one dot; the end of ق has a deep round tail and two dots' },
    { a: KEY.aynInit, b: KEY.aynMid, tell: 'at the start ع غ are an open c-curve; in the middle a closed flat-topped knot' },
    { a: KEY.haMid, b: KEY.haEnd, tell: 'the middle shape of ه is two loops, one above and one below the line; the end shape is a single leaning loop' },
  ],
  dependencies: arCourseDependencies,
  notes: 'Arabic script, right to left, read as Modern Standard Arabic from FULLY VOCALIZED words. Letters are shown with a transliteration (one scholarly romanization throughout) and an English hint; each letter card also shows how it joins, and twenty-three shape units test the connected shapes by family (start and middle, end). Hamza and its seats (أ إ ؤ ئ) are one unit; ة, ى, آ and the lām-alif shape لا (also لأ لإ لآ) are units of their own; the short vowels, sukūn, shadda, the three tanwīn and the dagger alif are marks; four rules are taught (long vowels, the article before a sun letter, joining, and that print usually leaves the vowels out). Only a fully vocalized form is a decoding exercise: a form that is not returns no dependencies, because which vowels it has comes from knowing the word, not from its letters. Stage 7 is explicit: a few taught words, with and without the article, and five short sentences, are asked WITHOUT their vowels, and the back shows the vocalized text, its sound and its meaning; reading other unvocalized text comes from vocabulary and context and is not taught here. Not taught: handwriting, calligraphic styles, the regional pronunciations of ج ق ث ذ, stress, case endings beyond the three indefinite examples, the full sound system and the Quranic marks. Words are chosen by judgement and each is confirmed against Wiktionary Arabic entries (via kaikki.org, CC BY-SA 4.0) before it is included; the meanings are the source\'s own words, shortened; the five sentences\' English is written for this deck. The unit sounds, notes and tells are machine-drafted and have not been reviewed by a native speaker or a teacher.',
};
