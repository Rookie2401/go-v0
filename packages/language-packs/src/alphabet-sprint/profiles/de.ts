/**
 * German (Latin script) for an English reader. The shapes are known, so only what an English reader would decode WRONG is taught:
 * the vowels, ä ö ü ß, ch (one unit, its sound depends on the vowel before it), sch, ei ie eu/äu, the letters with another value
 * (c j q r s v w y z) and four rules: sp-/st- at the start, final devoicing (b d g at the end sound p t k), long vowels
 * (a following h or a doubled vowel). The other letters are marked familiar (b d f g k l m n p t x).
 *
 * Unit keys are the Alphabet deck's own glyphs (alphabetLetters.ts) where one exists. Sounds are the deck's hints, shortened.
 * WRITTEN FOR THIS DECK, not reviewed by a native speaker.
 */
import { greedyDependencies, type Spelling } from '../segment';
import { PHRASES, WORDS } from '../words/de';
import type { ScriptProfile, ScriptUnit } from '../types';

const U = (key: string, kind: ScriptUnit['kind'], display: string, sound: string, extra: Partial<ScriptUnit> = {}): ScriptUnit => ({ key, kind, display, sound, ...extra });

const UNITS: ScriptUnit[] = [
  U('A a', 'letter', 'a', 'a as in father', { example: { form: 'Hand', gloss: 'hand' } }),
  U('E e', 'letter', 'e', 'e as in bet; long, like the a of gate without the glide', { difficulty: 2, example: { form: 'gehen', gloss: 'to go' } }),
  U('I i', 'letter', 'i', 'i as in sit when short, ee when long', { example: { form: 'bis', gloss: 'until' } }),
  U('O o', 'letter', 'o', 'o as in more', { example: { form: 'Gott', gloss: 'God' } }),
  U('U u', 'letter', 'u', 'oo as in food (short in short syllables)', { example: { form: 'und', gloss: 'and' } }),
  U('Ä ä', 'letter', 'ä', 'e as in bet', { example: { form: 'Mädchen', gloss: 'girl' } }),
  U('Ö ö', 'letter', 'ö', 'say e with rounded lips, like the French peu', { difficulty: 3, example: { form: 'schön', gloss: 'beautiful, nice' } }),
  U('Ü ü', 'letter', 'ü', 'say ee with rounded lips, like the French u', { difficulty: 3, example: { form: 'Tür', gloss: 'door' } }),
  U('ß', 'letter', 'ß', 's as in kiss', { example: { form: 'groß', gloss: 'big, tall' } }),
  U('C c', 'letter', 'c', 'k, or ts before e and i; found mostly in ch, ck and sch', { example: { form: 'doch', gloss: 'yet, after all' } }),
  U('H h', 'letter', 'h', 'h as in hat at the start of a word; silent after a vowel, which it lengthens', { difficulty: 2, example: { form: 'Haus', gloss: 'house' } }),
  U('J j', 'letter', 'j', 'y as in yes', { example: { form: 'ja', gloss: 'yes' } }),
  U('Q q', 'digraph', 'qu', 'kv: always written qu'),
  U('R r', 'letter', 'r', 'an r made in the throat; after a vowel at the end of a syllable close to a', { difficulty: 2, example: { form: 'rein', gloss: 'pure' } }),
  U('S s', 'letter', 's', 'z before a vowel; s at the end of a word or before a consonant', { difficulty: 2, example: { form: 'sehen', gloss: 'to see' } }),
  U('V v', 'letter', 'v', 'f (v only in borrowed words)', { example: { form: 'Vater', gloss: 'father' } }),
  U('W w', 'letter', 'w', 'v as in very', { example: { form: 'wo', gloss: 'where' } }),
  U('Y y', 'letter', 'y', 'like ü; y as in yes in borrowed words', { difficulty: 2 }),
  U('Z z', 'letter', 'z', 'ts as in cats', { example: { form: 'Zeit', gloss: 'time' } }),
  U('ch', 'digraph', 'ch', 'after a, o, u a rough sound at the back of the throat (Bach); elsewhere a soft hiss like a cat (ich)', { difficulty: 3, example: { form: 'auch', gloss: 'also, too' } }),
  U('sch', 'digraph', 'sch', 'sh as in ship', { example: { form: 'schon', gloss: 'already' } }),
  U('ei', 'digraph', 'ei', 'eye, like English i in time', { example: { form: 'klein', gloss: 'small' } }),
  U('ie', 'digraph', 'ie', 'ee as in see', { example: { form: 'viel', gloss: 'much, many' } }),
  U('eu', 'digraph', 'eu äu', 'oy as in boy', { example: { form: 'neu', gloss: 'new' } }),
  U('rule-sp-st', 'rule', 'sp- st-', 'at the start of a word sp and st are said shp and sht', { difficulty: 2, example: { form: 'sprechen', gloss: 'to speak' } }),
  U('rule-final-devoicing', 'rule', 'b d g at the end', 'at the end of a word (or before a consonant) b d g sound p t k', { difficulty: 2, example: { form: 'Tag', gloss: 'day' } }),
  U('rule-long-vowel', 'rule', 'vh, aa ee oo', 'a vowel followed by h, or doubled, is long; the h is not said', { difficulty: 2, example: { form: 'Sohn', gloss: 'son' } }),
  // familiar to an English reader: shapes and sounds close enough to read with
  ...['B b', 'D d', 'F f', 'G g', 'K k', 'L l', 'M m', 'N n', 'P p', 'T t', 'X x'].map((k) => U(k, 'letter', k.split(' ')[1], `${k.split(' ')[1]} as in English`, { familiar: true })),
];

const V = 'aeiouäöü';
const SPELLINGS: Spelling[] = [
  { written: 'sch', key: 'sch' }, { written: 'ch', key: 'ch' }, { written: 'ck', key: 'K k' },
  { written: 'qu', key: 'Q q' },
  { written: 'ei', key: 'ei' }, { written: 'ey', key: 'ei' }, { written: 'ie', key: 'ie' }, { written: 'ieh', key: ['ie', 'rule-long-vowel'] },
  { written: 'eu', key: 'eu' }, { written: 'äu', key: 'eu' },
  ...[...V].map((v) => ({ written: `${v}h`, key: [`${v.toUpperCase()} ${v}`, 'rule-long-vowel'] as readonly string[] })),
  ...[...'aeo'].map((v) => ({ written: v + v, key: [`${v.toUpperCase()} ${v}`, 'rule-long-vowel'] as readonly string[] })),
  { written: 'ß', key: 'ß' },
  ...UNITS.filter((u) => u.kind === 'letter' && u.key !== 'ß').map((u) => ({ written: u.key.split(' ')[1], key: u.key })),
];

function dependencies(form: string): string[] | undefined {
  const text = form.normalize('NFC').toLowerCase();
  const keys = greedyDependencies(text, { spellings: SPELLINGS });
  if (!keys) return undefined;
  const word = text.replace(/[^\p{L}]/gu, '');
  if (/^(sp|st)/.test(word)) keys.push('rule-sp-st');
  if (/[bdg]$/.test(word)) keys.push('rule-final-devoicing');
  return keys;
}

export const DE_PROFILE: ScriptProfile = {
  languageId: 'de', scriptId: 'Latn', firstBatch: 5, laterBatch: 4,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'ei', b: 'ie', tell: 'ei is eye (klein); ie is ee (viel): say the second letter' },
    { a: 'V v', b: 'W w', tell: 'v is f (Vater); w is v (wo)' },
    { a: 'S s', b: 'Z z', tell: 's before a vowel is z (sehen); z is ts (Zeit)' },
    { a: 'Ä ä', b: 'Ö ö', tell: 'ä is e as in bet; ö is rounded, like the French peu' },
  ],
  dependencies,
  notes: 'Only what an English reader would read wrong is taught: vowels, ä ö ü ß, ch sch ei ie eu, c j qu r s v w y z, and the rules for sp-/st-, final devoicing and long vowels. Written for this deck; not reviewed by a native speaker.',
};
