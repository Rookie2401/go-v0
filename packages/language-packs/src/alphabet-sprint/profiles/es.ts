/**
 * Spanish (Latin script) for an English reader. The shapes are known, so only what an English reader would decode WRONG is taught:
 * the five pure vowels, the letters whose Spanish value differs (c, g, h, j, ll, ñ, qu, r/rr, v, y, z, x, ch) and the written accent.
 * The other letters are marked familiar (b d f k l m n p s t w): close enough to English to read with.
 *
 * Unit keys are the Alphabet deck's own glyphs (alphabetLetters.ts), so a letter already practised there carries over. Sounds are the
 * deck's hints, shortened. WRITTEN FOR THIS DECK, not reviewed by a native speaker; Latin American values first (the pack's variety is
 * Honduran Spanish), Spain's where it differs.
 */
import { greedyDependencies, type Spelling } from '../segment';
import { PHRASES, WORDS } from '../words/es';
import type { ScriptProfile, ScriptUnit } from '../types';

const U = (key: string, kind: ScriptUnit['kind'], display: string, sound: string, extra: Partial<ScriptUnit> = {}): ScriptUnit => ({ key, kind, display, sound, ...extra });

const UNITS: ScriptUnit[] = [
  U('A a', 'letter', 'a', 'a as in father', { example: { form: 'casa', gloss: 'house' } }),
  U('E e', 'letter', 'e', 'e as in bet', { example: { form: 'mesa', gloss: 'table' } }),
  U('I i', 'letter', 'i', 'ee as in see', { example: { form: 'sí', gloss: 'yes' } }),
  U('O o', 'letter', 'o', 'o as in more, short', { example: { form: 'no', gloss: 'no' } }),
  U('U u', 'letter', 'u', 'oo as in food', { example: { form: 'uno', gloss: 'one' } }),
  U('C c', 'letter', 'c', 'k before a, o, u; s before e, i (th in Spain)', { difficulty: 3, example: { form: 'casa', gloss: 'house' } }),
  U('G g', 'letter', 'g', 'g as in go before a, o, u; a rough h before e, i', { difficulty: 3, example: { form: 'gato', gloss: 'cat' } }),
  U('H h', 'letter', 'h', 'silent', { difficulty: 2, example: { form: 'hola', gloss: 'hello' } }),
  U('J j', 'letter', 'j', 'a rough h, as in loch', { example: { form: 'hijo', gloss: 'son' } }),
  U('Ñ ñ', 'letter', 'ñ', 'ny as in canyon', { example: { form: 'niño', gloss: 'child' } }),
  U('Q q', 'digraph', 'qu', 'k (the u is silent: que, qui)', { difficulty: 2, example: { form: 'que', gloss: 'that' } }),
  U('R r', 'letter', 'r', 'a quick tap of the tongue; trilled at the start of a word', { difficulty: 2, example: { form: 'pero', gloss: 'but' } }),
  U('rr', 'digraph', 'rr', 'a rolled, trilled r', { example: { form: 'perro', gloss: 'dog' } }),
  U('V v', 'letter', 'v', 'the same sound as b', { example: { form: 'vida', gloss: 'life' } }),
  U('Y y', 'letter', 'y', 'y as in yes; the word y, "and", is said ee', { difficulty: 2, example: { form: 'yo', gloss: 'I' } }),
  U('Z z', 'letter', 'z', 's (th in Spain)', { example: { form: 'vez', gloss: 'time, occasion' } }),
  U('X x', 'letter', 'x', 'ks (in México and some names, a rough h)', { difficulty: 2 }),
  U('ch', 'digraph', 'ch', 'ch as in church', { example: { form: 'mucho', gloss: 'much' } }),
  U('ll', 'digraph', 'll', 'y as in yes, in most places', { example: { form: 'llamar', gloss: 'to call' } }),
  U('rule-accent', 'rule', 'á é í ó ú', 'the accent marks the stressed syllable; the vowel keeps its sound', { difficulty: 1, example: { form: 'café', gloss: 'coffee' } }),
  U('rule-gu', 'rule', 'gue gui', 'g stays hard before e and i when a silent u follows it (güe, güi: the u is said)', { difficulty: 2 }),
  // familiar to an English reader: shapes and sounds close enough to read with
  ...['B b', 'D d', 'F f', 'K k', 'L l', 'M m', 'N n', 'P p', 'S s', 'T t', 'W w'].map((k) => U(k, 'letter', k.split(' ')[1], `${k.split(' ')[1]} as in English`, { familiar: true })),
];

const SPELLINGS: Spelling[] = [
  { written: 'ch', key: 'ch' }, { written: 'll', key: 'll' }, { written: 'rr', key: 'rr' },
  { written: 'qu', key: 'Q q' },
  { written: 'gue', key: ['G g', 'rule-gu', 'E e'] }, { written: 'gui', key: ['G g', 'rule-gu', 'I i'] },
  { written: 'güe', key: ['G g', 'rule-gu', 'U u', 'E e'] }, { written: 'güi', key: ['G g', 'rule-gu', 'U u', 'I i'] },
  { written: 'á', key: ['A a', 'rule-accent'] }, { written: 'é', key: ['E e', 'rule-accent'] }, { written: 'í', key: ['I i', 'rule-accent'] },
  { written: 'ó', key: ['O o', 'rule-accent'] }, { written: 'ú', key: ['U u', 'rule-accent'] }, { written: 'ü', key: 'U u' },
  ...UNITS.filter((u) => u.kind === 'letter').map((u) => ({ written: u.key.split(' ')[1], key: u.key })),
];

export const ES_PROFILE: ScriptProfile = {
  languageId: 'es', scriptId: 'Latn', firstBatch: 5, laterBatch: 4,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'J j', b: 'H h', tell: 'j is a rough h; h is never said' },
    { a: 'V v', b: 'B b', tell: 'the same sound: b' },
    { a: 'll', b: 'Y y', tell: 'both usually y as in yes' },
    { a: 'R r', b: 'rr', tell: 'r is a tap (pero, but); rr is a trill (perro, dog)' },
  ],
  dependencies: (form) => greedyDependencies(form, { spellings: SPELLINGS, fold: (s) => s.toLowerCase() }),
  notes: 'Only what an English reader would read wrong is taught: the vowels, c g h j ñ qu r rr v y z x ch ll and the accent. Written for this deck; not reviewed by a native speaker.',
};
