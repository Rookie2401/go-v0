/**
 * Greek (Greek script) read in TWO traditions with one set of unit keys:
 *   EL_PROFILE            Modern Greek (default tradition: card ids are the Alphabet deck's own, so practised letters carry over)
 *   EL_CLASSICAL_PROFILE  the classroom ("Erasmian") values used for Ancient, Koine and Homeric reading; its card ids carry `~classical`
 *
 * A letter key is the Alphabet deck's glyph pair (alphabetLetters.ts), so `Β β` is one key in both traditions with a different sound.
 * New keys of the Sprint: the final sigma `ς`, the digraphs and the rules (Modern: accent, diaeresis; Classical: breathing, accent,
 * iota subscript, diaeresis).
 *
 * Modern sound values are those of standard spoken Modern Greek; the Classical values are the classroom Erasmian convention
 * (src/adapters/greek/pronunciation.ts says plainly that no one spoke that way: it is a reading convention, and a reconstruction of
 * Koine would differ). WRITTEN FOR THIS DECK, not reviewed by a native speaker or a classicist. Greek is read letter by letter with
 * the digraphs; the context rules of Modern Greek (γ before e/i sounds, αυ/ευ before voiced or voiceless sounds, μπ ντ γκ at the
 * start of a word or inside) are in the unit sounds, not modelled as separate units.
 */
import { greedyDependencies, type Spelling } from '../segment';
import { PHRASES as MODERN_PHRASES, WORDS as MODERN_WORDS } from '../words/el';
import { WORDS as CLASSICAL_WORDS } from '../words/el-classical';
import type { ScriptProfile, ScriptUnit, StarterWord } from '../types';

const U = (key: string, kind: ScriptUnit['kind'], display: string, sound: string, extra: Partial<ScriptUnit> = {}): ScriptUnit => ({ key, kind, display, sound, ...extra });

/** [key, modern sound, classical sound, difficulty modern, difficulty classical, note modern, note classical] for the 24 letters. */
type LetterDef = [key: string, modern: string, classical: string, dm?: 1 | 2 | 3, dc?: 1 | 2 | 3, nm?: string, nc?: string];
const LETTERS: LetterDef[] = [
  ['Α α', 'a as in father', 'a as in father (long or short)'],
  ['Β β', 'v', 'b as in boy', 2, 1, 'Not b: it only looks like Latin B. Modern b is written μπ.'],
  ['Γ γ', 'a soft gh (like a gargled g); y as in yes before e and i sounds', 'g as in go', 3, 1, 'Before ε ι η υ and the digraphs αι ει οι it is y.'],
  ['Δ δ', 'th as in this', 'd as in dog', 2],
  ['Ε ε', 'e as in bet', 'e as in bet (short)'],
  ['Ζ ζ', 'z as in zoo', 'zd, as in wisdom (the classroom value; some say dz)', 1, 2],
  ['Η η', 'ee as in see', 'a long e, like ay in they', 2, 2, 'Looks like Latin H; it is a vowel.', 'Looks like Latin H; it is a long vowel.'],
  ['Θ θ', 'th as in thin', 'th as in thin (a t with a puff of breath)'],
  ['Ι ι', 'ee as in see', 'i as in machine'],
  ['Κ κ', 'k', 'k'],
  ['Λ λ', 'l', 'l'],
  ['Μ μ', 'm', 'm'],
  ['Ν ν', 'n', 'n', 2, 2, 'Looks like a Latin v; it is n.', 'Looks like a Latin v; it is n.'],
  ['Ξ ξ', 'ks as in box', 'ks as in box'],
  ['Ο ο', 'o as in more', 'o as in more (short)'],
  ['Π π', 'p', 'p'],
  ['Ρ ρ', 'a tapped r (not p)', 'a rolled r (not p)', 2, 2, 'Looks like Latin P; it is r.', 'Looks like Latin P; it is r.'],
  ['Σ σ ς', 's as in sit', 's as in sit (never z)', 1, 1, 'Written ς at the end of a word.', 'Written ς at the end of a word.'],
  ['Τ τ', 't', 't'],
  ['Υ υ', 'ee as in see', 'ü, like the French u or German ü', 2, 3, 'Looks like Latin Y or U; in Modern Greek it is ee.', 'Looks like Latin Y or U; it is ü.'],
  ['Φ φ', 'f', 'ph, a p with a puff of breath (often said f)'],
  ['Χ χ', 'a rough h, as in loch', 'kh, a k with a puff of breath (often said as in loch)', 2, 2, 'Looks like Latin X; it is a rough h.', 'Looks like Latin X; it is kh.'],
  ['Ψ ψ', 'ps as in lapse', 'ps as in lapse'],
  ['Ω ω', 'o as in more (the same as ο)', 'a long o, as in oh', 2, 2],
];

const DIGRAPH = (key: string, sound: string, difficulty: 1 | 2 | 3 = 2): ScriptUnit => U(key, 'digraph', key, sound, { difficulty });

const MODERN_DIGRAPHS: ScriptUnit[] = [
  DIGRAPH('ου', 'oo as in food', 1),
  DIGRAPH('αι', 'e as in bet'),
  DIGRAPH('ει', 'ee as in see'),
  DIGRAPH('οι', 'ee as in see'),
  DIGRAPH('υι', 'ee as in see'),
  DIGRAPH('αυ', 'av (af before κ ξ π σ τ φ χ ψ θ)'),
  DIGRAPH('ευ', 'ev (ef before κ ξ π σ τ φ χ ψ θ)'),
  DIGRAPH('μπ', 'b at the start of a word; mb inside a word', 3),
  DIGRAPH('ντ', 'd at the start of a word; nd inside a word', 3),
  DIGRAPH('γκ', 'g as in go at the start of a word; ng inside a word', 3),
  DIGRAPH('γγ', 'ng as in finger'),
  DIGRAPH('τσ', 'ts as in cats'),
  DIGRAPH('τζ', 'dz, as in adze (like j in some words)'),
];
const CLASSICAL_DIGRAPHS: ScriptUnit[] = [
  DIGRAPH('ου', 'oo as in food', 1),
  DIGRAPH('αι', 'ai as in aisle'),
  DIGRAPH('ει', 'ei as in eight'),
  DIGRAPH('οι', 'oi as in oil'),
  DIGRAPH('αυ', 'au as in house'),
  DIGRAPH('ευ', 'eu: e and u run together (eh-oo)'),
  DIGRAPH('ηυ', 'ēu: a long e and u run together', 3),
  DIGRAPH('γγ', 'ng as in finger'),
  DIGRAPH('γκ', 'nk as in sink'),
];

const FINAL = U('ς', 'final-form', 'ς', 's (the same sound as σ)', { difficulty: 1, note: 'The shape σ takes at the end of a word.' });
const DIAERESIS = U('rule-diaeresis', 'rule', 'ϊ ϋ', 'two dots keep two vowels apart: they are not a digraph (αϊ = a, then i)', { difficulty: 2 });

const MODERN_RULES: ScriptUnit[] = [
  U('rule-accent', 'rule', 'ά έ ή ί ό ύ ώ', 'the one accent (tonos) marks the stressed syllable; the vowel keeps its sound', { difficulty: 1 }),
  DIAERESIS,
];
const CLASSICAL_RULES: ScriptUnit[] = [
  U('rule-breathing', 'rule', 'ἁ ἀ', 'a mark over a first vowel (or ρ): rough = h before it, smooth = nothing', { difficulty: 2 }),
  U('rule-accent', 'rule', 'ά ὰ ᾶ', 'the acute, grave and circumflex all mark the accented syllable; read it as stress', { difficulty: 1 }),
  U('rule-iota-subscript', 'rule', 'ᾳ ῃ ῳ', 'a small iota under a vowel is silent in reading', { difficulty: 1 }),
  DIAERESIS,
];

function build(modern: boolean, digraphs: ScriptUnit[], rules: ScriptUnit[]): ScriptUnit[] {
  const letters = LETTERS.map(([key, m, c, dm, dc, nm, nc]) => {
    const note = modern ? nm : nc;
    return U(key, 'letter', key, modern ? m : c, { difficulty: (modern ? dm : dc) ?? 1, ...(note ? { note } : {}) });
  });
  return [...letters, FINAL, ...digraphs, ...rules];
}

// ---- reading a form into unit keys ------------------------------------------------------------------------------------------
const LETTER_KEY = new Map(LETTERS.map(([key]) => [key.split(' ')[1], key] as const)); // α → 'Α α'
const SEP = '|'; // keeps the two vowels of a diaeresis apart so no digraph forms across them

interface Folded { text: string; rules: Set<string>; rough: boolean; ok: boolean }

/** NFD → the marks become rule keys → stripped → lower case → NFC. ς stays distinct. A diaeresis puts a separator before its vowel. */
function fold(form: string, modern: boolean): Folded {
  const rules = new Set<string>();
  let text = '';
  let ok = true;
  let rough = false;
  for (const ch of [...form.normalize('NFD')]) {
    if (/\p{M}/u.test(ch)) {
      const cp = ch.codePointAt(0)!;
      if (cp === 0x301) rules.add('rule-accent');
      else if (cp === 0x300 || cp === 0x342) { if (modern) ok = false; else rules.add('rule-accent'); }
      else if (cp === 0x313 || cp === 0x314) { if (modern) ok = false; else { rules.add('rule-breathing'); if (cp === 0x314) rough = true; } }
      else if (cp === 0x345) { if (modern) ok = false; else rules.add('rule-iota-subscript'); }
      else if (cp === 0x308) { rules.add('rule-diaeresis'); if (text.length) text = text.slice(0, -1) + SEP + text.slice(-1); }
      else if (cp === 0x304 || cp === 0x306) { /* length marks: not part of reading */ }
      else ok = false;
      continue;
    }
    text += ch.toLowerCase();
  }
  return { text: text.normalize('NFC'), rules, rough, ok };
}

function dependenciesFor(form: string, modern: boolean, digraphs: readonly string[]): readonly string[] | undefined {
  const f = fold(form, modern);
  if (!f.ok) return undefined;
  const spellings: Spelling[] = [
    ...digraphs.map((d) => ({ written: d, key: d })),
    { written: 'ς', key: ['ς', 'Σ σ ς'] },
    ...[...LETTER_KEY].map(([written, key]) => ({ written, key })),
  ];
  const keys = greedyDependencies(f.text, { spellings, ignorable: (ch) => !/\p{L}/u.test(ch) });
  if (!keys) return undefined;
  // a rule is a dependency only when ignoring it would misread the word: a rough breathing (h) and a diaeresis (no digraph). The accent
  // (stress), the iota subscript (silent) and a smooth breathing (silent) leave every letter's sound alone, so a word never waits for them.
  if (f.rough) keys.push('rule-breathing');
  if (f.rules.has('rule-diaeresis')) keys.push('rule-diaeresis');
  return keys;
}

/** A unit's example: its own word with the fewest units that needs it (best weight on a tie). */
function withExamples(units: ScriptUnit[], words: readonly StarterWord[], deps: (form: string) => readonly string[] | undefined): ScriptUnit[] {
  return units.map((u) => {
    let best: { w: StarterWord; n: number } | undefined;
    for (const w of words) {
      const d = deps(w.form);
      if (!d || !d.includes(u.key)) continue;
      if (!best || d.length < best.n || (d.length === best.n && w.weight > best.w.weight)) best = { w, n: d.length };
    }
    return best ? { ...u, example: { form: best.w.form, gloss: best.w.gloss } } : u;
  });
}

const MODERN_DIGRAPH_KEYS = MODERN_DIGRAPHS.map((d) => d.key);
const CLASSICAL_DIGRAPH_KEYS = CLASSICAL_DIGRAPHS.map((d) => d.key);
const modernDeps = (form: string) => dependenciesFor(form, true, MODERN_DIGRAPH_KEYS);
const classicalDeps = (form: string) => dependenciesFor(form, false, CLASSICAL_DIGRAPH_KEYS);

const MODERN_UNITS = withExamples(build(true, MODERN_DIGRAPHS, MODERN_RULES), MODERN_WORDS, modernDeps);
const CLASSICAL_UNITS = withExamples(build(false, CLASSICAL_DIGRAPHS, CLASSICAL_RULES), CLASSICAL_WORDS, classicalDeps);

export const EL_PROFILE: ScriptProfile = {
  languageId: 'el', scriptId: 'Grek',
  tradition: { id: 'default', label: 'Modern Greek', varieties: ['el-mod'] },
  firstBatch: 5, laterBatch: 4,
  units: MODERN_UNITS, words: MODERN_WORDS, phrases: MODERN_PHRASES,
  confusions: [
    { a: 'Ρ ρ', b: 'Π π', tell: 'ρ has a tail and is r; π is a table-top shape and is p' },
    { a: 'Ν ν', b: 'Υ υ', tell: 'ν is n (two strokes joined at the bottom corner); υ is a cup shape and is ee' },
    { a: 'Η η', b: 'Ν ν', tell: 'η is ee (a vowel, with a tail on the right); ν is n' },
    { a: 'Χ χ', b: 'Ξ ξ', tell: 'χ is a plain cross, a rough h; ξ is three bars, ks' },
    { a: 'Β β', b: 'Ρ ρ', tell: 'β is v (it goes below the line); ρ is r' },
    { a: 'Ο ο', b: 'Ω ω', tell: 'the same sound in Modern Greek: o' },
    { a: 'Ε ε', b: 'Η η', tell: 'ε is a short e (bet); η is ee' },
    { a: 'Ι ι', b: 'Υ υ', tell: 'the same sound in Modern Greek: ee' },
    { a: 'Σ σ ς', b: 'ς', tell: 'the same sound; ς is only written at the end of a word' },
  ],
  dependencies: modernDeps,
  notes: 'Modern Greek (monotonic): the 24 letters, final sigma, the common digraphs and the accent. Words are Modern headwords that occur in the pack course-authored texts and the hand-annotated Wikipedia sentences, glossed from Wiktionary (a thin list; machine-drafted, not native-reviewed). A polytonic form (breathings, iota subscript, grave, circumflex) is not modelled here: use the Classical tradition. Sound values written for this deck.',
};

export const EL_CLASSICAL_PROFILE: ScriptProfile = {
  languageId: 'el', scriptId: 'Grek',
  tradition: { id: 'classical', label: 'Classical (Ancient and Koine) pronunciation', varieties: ['el-att', 'el-koi', 'el-hom'] },
  firstBatch: 5, laterBatch: 4,
  units: CLASSICAL_UNITS, words: CLASSICAL_WORDS, phrases: [],
  confusions: [
    { a: 'Ρ ρ', b: 'Π π', tell: 'ρ has a tail and is r; π is a table-top shape and is p' },
    { a: 'Ν ν', b: 'Υ υ', tell: 'ν is n; υ is a cup shape and is ü' },
    { a: 'Η η', b: 'Ν ν', tell: 'η is a long e (a vowel, with a tail on the right); ν is n' },
    { a: 'Χ χ', b: 'Ξ ξ', tell: 'χ is a plain cross, kh; ξ is three bars, ks' },
    { a: 'Β β', b: 'Ρ ρ', tell: 'β is b (it goes below the line); ρ is r' },
    { a: 'Ο ο', b: 'Ω ω', tell: 'ο is a short o; ω is a long o' },
    { a: 'Ε ε', b: 'Η η', tell: 'ε is a short e; η is a long e' },
    { a: 'Σ σ ς', b: 'ς', tell: 'the same sound; ς is only written at the end of a word' },
  ],
  dependencies: classicalDeps,
  notes: 'Classroom (Erasmian) values for reading Ancient, Koine and Homeric Greek: a convention for reading, not a recording of how anyone spoke (Koine itself was probably said nearer to Modern Greek). Words are the lemmas of the compiled Koine (New Testament) core, polytonic, glossed from Dodson / Abbott-Smith; pronunciation by transliterateGreek(form, erasmian). Breathings, accents and iota subscript are modelled as rules. Written for this deck; not reviewed by a classicist.',
};
