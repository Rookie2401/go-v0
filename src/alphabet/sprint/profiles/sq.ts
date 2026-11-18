/**
 * Albanian (Latin script) for an English reader. The shapes are known, so only what an English reader would decode WRONG is taught:
 * the vowels whose value differs (a e i o u y ë), the special letters (ç ë), the letters with another value (c j q x y) and the
 * digraphs (dh gj ll nj rr sh th xh zh). The other letters are marked familiar (b d f g h k l m n p s t v z).
 *
 * Unit keys are the Alphabet deck's own glyphs (alphabetLetters.ts), so a letter already practised there carries over. Sounds are the
 * deck's hints, shortened. WRITTEN FOR THIS DECK, not reviewed by a native speaker.
 */
import { sqLetters } from '../../../adapters/albanian/orthography';
import { PHRASES, WORDS } from '../words/sq';
import type { ScriptProfile, ScriptUnit } from '../types';

const U = (key: string, kind: ScriptUnit['kind'], display: string, sound: string, extra: Partial<ScriptUnit> = {}): ScriptUnit => ({ key, kind, display, sound, ...extra });

const UNITS: ScriptUnit[] = [
  U('A a', 'letter', 'a', 'a as in father', { example: { form: 'baba', gloss: 'father' } }),
  U('E e', 'letter', 'e', 'e as in bet', { example: { form: 'nënë', gloss: 'mother' } }),
  U('Ë ë', 'letter', 'ë', 'the a of about; often silent at the end of a word', { difficulty: 2, example: { form: 'nënë', gloss: 'mother' } }),
  U('I i', 'letter', 'i', 'ee as in see', { example: { form: 'di', gloss: 'to know' } }),
  U('O o', 'letter', 'o', 'o as in more', { example: { form: 'jo', gloss: 'no' } }),
  U('U u', 'letter', 'u', 'oo as in food', { example: { form: 'ujë', gloss: 'water' } }),
  U('Y y', 'letter', 'y', 'like the French u or the German ü: say ee with rounded lips', { difficulty: 3, example: { form: 'yt', gloss: 'your, yours' } }),
  U('C c', 'letter', 'c', 'ts as in cats', { difficulty: 2, example: { form: 'cili', gloss: 'which, which one' } }),
  U('Ç ç', 'letter', 'ç', 'ch as in church', { example: { form: 'çaj', gloss: 'tea' } }),
  U('J j', 'letter', 'j', 'y as in yes', { example: { form: 'jam', gloss: 'to be' } }),
  U('Q q', 'letter', 'q', 'a soft ty sound, close to the ch of cheese', { difficulty: 3, example: { form: 'qen', gloss: 'dog' } }),
  U('R r', 'letter', 'r', 'a quick tap of the tongue', { difficulty: 2, example: { form: 'veri', gloss: 'north' } }),
  U('X x', 'letter', 'x', 'dz as in adze', { difficulty: 2 }),
  U('Dh dh', 'digraph', 'dh', 'th as in this', { example: { form: 'dhe', gloss: 'and' } }),
  U('Gj gj', 'digraph', 'gj', 'a soft dy sound, close to the j of jeep', { difficulty: 3, example: { form: 'gjë', gloss: 'thing' } }),
  U('Ll ll', 'digraph', 'll', 'a dark l, as in full', { example: { form: 'shkollë', gloss: 'school' } }),
  U('Nj nj', 'digraph', 'nj', 'ny as in canyon', { example: { form: 'njeri', gloss: 'person, human being' } }),
  U('Rr rr', 'digraph', 'rr', 'a rolled, trilled r', { difficulty: 2, example: { form: 'rrugë', gloss: 'road, street' } }),
  U('Sh sh', 'digraph', 'sh', 'sh as in ship', { example: { form: 'shtëpi', gloss: 'house, home' } }),
  U('Th th', 'digraph', 'th', 'th as in thin', { example: { form: 'them', gloss: 'to say' } }),
  U('Xh xh', 'digraph', 'xh', 'j as in jam', { example: { form: 'xhaxha', gloss: 'uncle' } }),
  U('Zh zh', 'digraph', 'zh', 'the s of measure', { example: { form: 'zhurmë', gloss: 'noise' } }),
  // familiar to an English reader: shapes and sounds close enough to read with
  ...['B b', 'D d', 'F f', 'G g', 'H h', 'K k', 'L l', 'M m', 'N n', 'P p', 'S s', 'T t', 'V v', 'Z z'].map((k) => U(k, 'letter', k.split(' ')[1], `${k.split(' ')[1]} as in English`, { familiar: true })),
];

const KEY = new Map(UNITS.map((u) => [u.display, u.key]));

/** Digraph-aware split of the pack's own orthography; a non-letter (apostrophe, hyphen) is skipped, an unmapped letter makes the form unmodelled. */
function dependencies(form: string): string[] | undefined {
  const keys: string[] = [];
  for (const unit of sqLetters(form)) {
    const k = KEY.get(unit);
    if (k) { if (!keys.includes(k)) keys.push(k); continue; }
    if (/[\p{L}\p{M}]/u.test(unit)) return undefined;
  }
  return keys;
}

export const SQ_PROFILE: ScriptProfile = {
  languageId: 'sq', scriptId: 'Latn', firstBatch: 5, laterBatch: 4,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'C c', b: 'Ç ç', tell: 'c is ts (cats); ç is ch (church)' },
    { a: 'X x', b: 'Xh xh', tell: 'x is dz (adze); xh is j (jam)' },
    { a: 'L l', b: 'Ll ll', tell: 'l is light (leaf); ll is dark (full)' },
    { a: 'R r', b: 'Rr rr', tell: 'r is a tap; rr is a trill' },
  ],
  dependencies,
  notes: 'Only what an English reader would read wrong is taught: the vowels, ë ç c j q x y and the digraphs dh gj ll nj rr sh th xh zh. Written for this deck; not reviewed by a native speaker.',
};
