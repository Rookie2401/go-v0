/**
 * Latin (Latin script) for an English reader. Church (ecclesiastical) pronunciation first, the classical value where it differs.
 * Only what an English reader would decode wrong is taught: the vowels, c, g, h, j, v, z, qu, ae, oe, au, ch, ph, th, gn, ti, sc.
 * Macrons are folded away: vowel length is NOT taught. Unit keys are the Alphabet deck glyphs (alphabetLetters.ts LA). Written for
 * this deck, not reviewed by a Latinist.
 */
import { greedyDependencies, type Spelling } from '../segment';
import { PHRASES, WORDS } from '../words/la';
import type { ScriptProfile, ScriptUnit } from '../types';

const U = (key: string, kind: ScriptUnit['kind'], display: string, sound: string, extra: Partial<ScriptUnit> = {}): ScriptUnit => ({ key, kind, display, sound, ...extra });

const UNITS: ScriptUnit[] = [
  U('A a', 'letter', 'a', 'a as in father'),
  U('C c', 'letter', 'c', 'k; in Church Latin ch as in church before e, i, y, ae, oe (classical: always k)', { difficulty: 3 }),
  U('E e', 'letter', 'e', 'e as in bet'),
  U('G g', 'letter', 'g', 'g as in go; in Church Latin like the g of gem before e, i, y, ae, oe (classical: always hard)', { difficulty: 3 }),
  U('H h', 'letter', 'h', 'a light h (in Church Latin often silent; mihi, nihil: k)', { difficulty: 2 }),
  U('I i', 'letter', 'i', 'ee as in see'),
  U('J j', 'letter', 'j', 'consonant i: y as in yes (the Romans wrote it i: iustus, maior)'),
  U('O o', 'letter', 'o', 'o as in more'),
  U('Q q', 'digraph', 'qu', 'kw as in queen'),
  U('U u', 'letter', 'u', 'oo as in food'),
  U('V v', 'letter', 'v', 'v in Church Latin (classical: w)', { difficulty: 2 }),
  U('Y y', 'letter', 'y', 'ee in Church Latin (classical: like the French u); in Greek words'),
  U('Z z', 'letter', 'z', 'dz in Church Latin (classical: z); in Greek words'),
  U('ae', 'digraph', 'ae', 'e as in bet in Church Latin (classical: eye); also written æ', { difficulty: 2 }),
  U('oe', 'digraph', 'oe', 'e as in bet in Church Latin (classical: oy); also written œ', { difficulty: 2 }),
  U('au', 'digraph', 'au', 'ow as in cow'),
  U('ch', 'digraph', 'ch', 'k, in Greek loans (not as in church)', { difficulty: 2 }),
  U('ph', 'digraph', 'ph', 'f, in Greek loans'),
  U('th', 'digraph', 'th', 't (not the English th), in Greek loans', { difficulty: 2 }),
  U('gn', 'digraph', 'gn', 'ny as in canyon in Church Latin (classical: g then n)', { difficulty: 2 }),
  U('rule-ti', 'rule', 'ti + vowel', 'in Church Latin ti before a vowel is tsi (gratia), except after s, t, x', { difficulty: 3 }),
  U('rule-sc', 'rule', 'sce sci', 'in Church Latin sc before e, i, y, ae, oe is sh (scientia)', { difficulty: 3 }),
  ...['B b', 'D d', 'F f', 'K k', 'L l', 'M m', 'N n', 'P p', 'R r', 'S s', 'T t', 'X x'].map((k) => U(k, 'letter', k.split(' ')[1], `${k.split(' ')[1]} as in English`, { familiar: true })),
];

const SPELLINGS: Spelling[] = [
  { written: 'ae', key: 'ae' }, { written: 'oe', key: 'oe' }, { written: 'au', key: 'au' }, { written: 'qu', key: 'Q q' },
  { written: 'ch', key: 'ch' }, { written: 'ph', key: 'ph' }, { written: 'th', key: 'th' }, { written: 'gn', key: 'gn' },
  ...UNITS.filter((u) => u.kind === 'letter').map((u) => ({ written: u.key.split(' ')[1], key: u.key })),
];

const fold = (s: string): string => s.normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC').toLowerCase().replace(/æ|ǽ/g, 'ae').replace(/œ/g, 'oe');

export function latinDependencies(form: string): readonly string[] | undefined {
  const f = fold(form);
  // i before a vowel at the start of a word or between vowels is the consonant (the u of qu is not a vowel here)
  const g = f.replace(/qu/g, 'Q').replace(/^i(?=[aeiou])|(?<=[aeiouy])i(?=[aeiou])/g, 'j').replace(/Q/g, 'qu');
  const keys = greedyDependencies(g, { spellings: SPELLINGS });
  if (!keys) return undefined;
  const add = (k: string): void => { if (!keys.includes(k)) keys.push(k); };
  if (/(?<![sxt])ti(?=[aeiou])/.test(f)) add('rule-ti');
  if (/sc(?=[eiy]|ae|oe)/.test(f)) add('rule-sc');
  return keys;
}

export const LA_PROFILE: ScriptProfile = {
  languageId: 'la', scriptId: 'Latn', firstBatch: 5, laterBatch: 4,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'V v', b: 'U u', tell: 'v is the consonant (v church, w classical); u is the vowel oo' },
    { a: 'I i', b: 'J j', tell: 'i is ee; j (or i before a vowel) is the consonant y' },
    { a: 'C c', b: 'ch', tell: 'c is k or soft ch before e, i; the digraph ch is always k' },
    { a: 'ae', b: 'oe', tell: 'both are e in Church Latin' },
  ],
  dependencies: latinDependencies,
  notes: 'Church Latin first, classical where it differs. Only what an English reader would read wrong is taught; macrons are folded away and vowel length is not taught. Consonant i is detected by position (initial or between vowels). Written for this deck; not reviewed by a Latinist.',
};
