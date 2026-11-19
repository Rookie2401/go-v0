/**
 * Russian (Cyrillic script) for an English reader. The letters, their sounds, examples and remarks are the Russian analyser's own
 * letter table (src/adapters/russian/alphabet.ts RU_ALPHABET), and a letter's key is the Alphabet deck's glyph pair (`Б б`), so a
 * letter already practised in the deck is the same card here.
 *
 * Five letters look and sound as an English reader expects (а к м о т): they are marked familiar and never taught as new, so real
 * words (как, там, кто, кот) can be read from the first card. The letters that look Latin and sound different (в н р с у х, and е ё)
 * are harder than a new shape and carry a higher difficulty.
 *
 * Five rules are units of their own, because the letters alone do not give the sound. Each is applied BY SPELLING, so it can be
 * read off any word on a page:
 *   rule-stress            a word with two or more vowels: one is stressed, the others are weaker (unstressed о is said like a)
 *   rule-final-devoicing   a word ending in б в г д ж з (or one of them and ь): said п ф к т ш с
 *   rule-g-as-v            the endings -ого and -его, and сегодня: г is said v
 *   rule-tsya              the verb endings -тся and -ться: said tsa
 *   rule-zhi-shi           жи ши ци: и is said like ы
 * What spelling cannot show is not modelled: WHICH vowel is stressed (ordinary text does not mark it; the word card's back does),
 * a printed е that stands for ё, devoicing inside a word, and the words that break a rule beyond the short lists below.
 *
 * MACHINE-DRAFTED, not reviewed by a native speaker or a teacher.
 */
import { RU_ALPHABET, RU_CONFUSIONS } from '../../../../../src/adapters/russian/alphabet';
import { greedyDependencies, type Spelling } from '../segment';
import { PHRASES, WORDS } from '../words/ru';
import type { ScriptProfile, ScriptUnit } from '../types';

const keyOf = (lower: string): string => { const l = RU_ALPHABET.find((x) => x.lower === lower)!; return `${l.upper} ${l.lower}`; };

/** Harder than a plain new shape: a letter with two readings (е ё), a Latin look-alike with another sound, a sound English lacks, a sign. */
const DIFFICULTY: Readonly<Record<string, 2 | 3>> = { е: 3, ё: 3, в: 2, н: 2, р: 2, с: 2, у: 2, х: 2, ю: 2, я: 2, ы: 2, щ: 2, й: 2, ь: 2, ъ: 2 };

const LETTERS: ScriptUnit[] = RU_ALPHABET.map((l) => ({
  key: `${l.upper} ${l.lower}`, kind: 'letter', display: `${l.upper} ${l.lower}`, sound: l.sound,
  example: { form: l.example.word, gloss: l.example.gloss },
  ...(l.note ? { note: l.note } : {}),
  ...(l.group === 1 ? { familiar: true } : {}),
  difficulty: DIFFICULTY[l.lower] ?? 1,
}));

const RULES: ScriptUnit[] = [
  {
    key: 'rule-stress', kind: 'rule', display: 'молоко́', difficulty: 2,
    sound: 'one vowel of a word is stressed and said in full; the others are weaker: unstressed о sounds like a, unstressed е and я like a short i',
    example: { form: 'молоко', gloss: 'milk' },
    note: 'Ordinary text does not mark the stress: learn it with each word.',
  },
  {
    key: 'rule-final-devoicing', kind: 'rule', display: 'б в г д ж з at the end', difficulty: 2,
    sound: 'at the end of a word б в г д ж з are said п ф к т ш с',
    example: { form: 'год', gloss: 'year' },
    note: 'год ends in a t sound, хлеб in a p sound.',
  },
  {
    key: 'rule-g-as-v', kind: 'rule', display: '-ого -его', difficulty: 2,
    sound: 'in the endings -ого and -его the г is said v',
    example: { form: 'его', gloss: 'his, him' },
    note: 'Also in сегодня. много, дорого and строго keep a real g.',
  },
  {
    key: 'rule-tsya', kind: 'rule', display: '-тся -ться', difficulty: 1,
    sound: 'both verb endings are said tsa; the ь is not a sound',
    example: { form: 'учиться', gloss: 'to study, to learn' },
  },
  {
    key: 'rule-zhi-shi', kind: 'rule', display: 'жи ши ци', difficulty: 1,
    sound: 'ж ш ц are always hard, so и after them is said like ы',
    example: { form: 'жить', gloss: 'to live' },
  },
];

const UNITS: ScriptUnit[] = [...LETTERS, ...RULES];

const SPELLINGS: Spelling[] = RU_ALPHABET.map((l) => ({ written: l.lower, key: `${l.upper} ${l.lower}` }));
/** NFC, lower case, without the stress marks a primer prints (acute, grave) or a soft hyphen. ё and й stay letters of their own. */
const fold = (s: string): string => s.normalize('NFD').replace(/[́̀­]/g, '').normalize('NFC').toLowerCase();

const VOWELS = /[аеёиоуыэюя]/g;
/** Short words said together with the next word: their last consonant is not at the end of what is said. */
const PROCLITICS = new Set(['в', 'из', 'под', 'над', 'без', 'об', 'перед', 'через', 'близ', 'сквозь']);
/** Words that end in -ого or -его and keep a real г. */
const REAL_G = new Set(['много', 'немного', 'намного', 'ненамного', 'дорого', 'недорого', 'строго', 'убого', 'полого', 'отлого', 'ого', 'лого', 'лего']);

function dependencies(form: string): string[] | undefined {
  const text = fold(form);
  const keys = greedyDependencies(text, { spellings: SPELLINGS });
  if (!keys || !keys.length) return undefined;
  const add = (k: string): void => { if (!keys.includes(k)) keys.push(k); };
  for (const word of text.match(/[а-яё]+/g) ?? []) {
    if ((word.match(VOWELS) ?? []).length >= 2) add('rule-stress');
    if (/[бвгджз]ь?$/.test(word) && word.length > 1 && !PROCLITICS.has(word)) add('rule-final-devoicing');
    if ((/[ое]го$/.test(word) && !REAL_G.has(word)) || /^сегодня/.test(word)) add('rule-g-as-v');
    if (/ть?ся$/.test(word)) add('rule-tsya');
    if (/[жшц]и/.test(word)) add('rule-zhi-shi');
  }
  return keys;
}

export const RU_PROFILE: ScriptProfile = {
  languageId: 'ru', scriptId: 'Cyrl', firstBatch: 5, laterBatch: 4,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: RU_CONFUSIONS.map((c) => ({ a: keyOf(c.a), b: keyOf(c.b), tell: c.tell })),
  dependencies,
  notes: 'Machine-drafted from the Russian analyser’s letter table; not reviewed by a native speaker or a teacher. а к м о т look and sound as an English reader expects and are not taught as new. Five rules are applied by spelling: stress and weaker vowels, the last consonant of a word, г said v in -ого and -его, -тся and -ться, and жи ши ци. Spelling does not show which vowel is stressed or where a printed е stands for ё: the back of a word card gives the stress, in the pack’s transliteration, which is the spelling in Latin letters and not the weakened sound.',
};
