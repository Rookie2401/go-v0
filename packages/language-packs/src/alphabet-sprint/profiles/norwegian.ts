/**
 * Units, spellings and decoding rules shared by the Norwegian Bokmål (nb) and Nynorsk (nn) Alphabet Sprint profiles: one alphabet.
 * Only what an English reader would decode WRONG is taught (a, i, o, u, y, å, æ, ø, j; kj, skj, sj, hv, hj, gj, rs; the soft k, g and sk
 * before i, y, ei, øy; the silent d). Other letters are familiar. Unit keys are the Alphabet deck glyphs (alphabetLetters.ts NO).
 * Sounds are the deck hints, shortened; East Norwegian is the reference, there is no spoken standard. Written for this deck, NOT
 * reviewed by a native speaker. Vowel length (double consonants) and the tone (word accent) are not taught.
 */
import { greedyDependencies, type Spelling } from '../segment';
import type { ScriptUnit } from '../types';

const U = (key: string, kind: ScriptUnit['kind'], display: string, sound: string, extra: Partial<ScriptUnit> = {}): ScriptUnit => ({ key, kind, display, sound, ...extra });

export const NORWEGIAN_UNITS: ScriptUnit[] = [
  U('A a', 'letter', 'a', 'a as in father'),
  U('I i', 'letter', 'i', 'ee as in see'),
  U('O o', 'letter', 'o', 'usually oo as in food; sometimes o as in more', { difficulty: 2 }),
  U('U u', 'letter', 'u', 'a tight u, between oo and the French u', { difficulty: 2 }),
  U('Y y', 'letter', 'y', 'ee with rounded lips, close to the French u', { difficulty: 2 }),
  U('Å å', 'letter', 'å', 'aw, o as in more'),
  U('Æ æ', 'letter', 'æ', 'a as in cat'),
  U('Ø ø', 'letter', 'ø', 'like the vowel of French peu, close to the i of bird', { difficulty: 2 }),
  U('J j', 'letter', 'j', 'y as in yes (never as in jam)'),
  U('kj', 'digraph', 'kj', 'a soft sound like the h of huge, or German ich (tj is the same)', { difficulty: 2 }),
  U('skj', 'digraph', 'skj', 'sh as in ship (sj is the same)', { difficulty: 2 }),
  U('sj', 'digraph', 'sj', 'sh as in ship', { difficulty: 2 }),
  U('hv', 'digraph', 'hv', 'v (the h is silent)', { difficulty: 2 }),
  U('hj', 'digraph', 'hj', 'y as in yes (the h is silent)', { difficulty: 2 }),
  U('gj', 'digraph', 'gj', 'y as in yes (the g is silent)', { difficulty: 2 }),
  U('rs', 'digraph', 'rs', 'sh as in ship in the east (the r is not heard)', { difficulty: 2 }),
  U('rule-soft-k', 'rule', 'ki ky kei køy', 'k is soft before i, y, ei and øy: like kj', { difficulty: 3 }),
  U('rule-soft-g', 'rule', 'gi gy gei gøy', 'g is said y before i, y, ei and øy', { difficulty: 3 }),
  U('rule-sk-sh', 'rule', 'ski sky skei skøy', 'sk is said sh before i, y, ei and øy', { difficulty: 3 }),
  U('rule-silent-d', 'rule', 'nd ld rd', 'd is often silent after n, l, r at the end of a word (land, kald, ord)', { difficulty: 2 }),
  // familiar to an English reader
  ...['B b', 'D d', 'E e', 'F f', 'G g', 'H h', 'K k', 'L l', 'M m', 'N n', 'P p', 'R r', 'S s', 'T t', 'V v'].map((k) => U(k, 'letter', k.split(' ')[1], `${k.split(' ')[1]} as in English`, { familiar: true })),
];

export const NORWEGIAN_NEW_KEYS = ['kj', 'skj', 'sj', 'hv', 'hj', 'gj', 'rs', 'rule-soft-k', 'rule-soft-g', 'rule-sk-sh', 'rule-silent-d'];

const SPELLINGS: Spelling[] = [
  { written: 'skj', key: 'skj' }, { written: 'sj', key: 'sj' }, { written: 'kj', key: 'kj' }, { written: 'tj', key: 'kj' },
  { written: 'hv', key: 'hv' }, { written: 'hj', key: 'hj' }, { written: 'gj', key: 'gj' }, { written: 'rs', key: 'rs' },
  { written: 'é', key: 'E e' }, { written: 'è', key: 'E e' }, { written: 'ê', key: 'E e' }, { written: 'ó', key: 'O o' }, { written: 'ò', key: 'O o' }, { written: 'ô', key: 'O o' },
  ...NORWEGIAN_UNITS.filter((u) => u.kind === 'letter').map((u) => ({ written: u.key.split(' ')[1], key: u.key })),
];

/** The unit keys a written Norwegian form needs; undefined when it has a letter outside the alphabet modelled (c q w x z). */
export function norwegianDependencies(form: string): readonly string[] | undefined {
  const f = form.normalize('NFC').toLowerCase();
  const keys = greedyDependencies(f, { spellings: SPELLINGS });
  if (!keys) return undefined;
  const add = (k: string): void => { if (!keys.includes(k)) keys.push(k); };
  if (/k(?=i|y|ei|øy)/.test(f)) add('rule-soft-k');
  if (/(?<!n)g(?=i|y|ei|øy)/.test(f)) add('rule-soft-g');
  if (/sk(?=i|y|ei|øy)/.test(f)) add('rule-sk-sh');
  if (/[nlr]d(?=$|e|et|en|ene|er)/.test(f)) add('rule-silent-d');
  return keys;
}

export const NORWEGIAN_CONFUSIONS = [
  { a: 'U u', b: 'Y y', tell: 'u is a tight oo; y is ee with rounded lips (ut, out; by, town)' },
  { a: 'kj', b: 'sj', tell: 'kj is a soft h-like sound (ich); sj is sh' },
  { a: 'Å å', b: 'O o', tell: 'å is always aw; o is usually oo' },
  { a: 'Æ æ', b: 'A a', tell: 'æ is a as in cat; a is a as in father' },
  { a: 'Ø ø', b: 'Y y', tell: 'ø is the vowel of bird; y is rounded ee' },
] as const;
