/**
 * Russian text: the identity of a written form, stress marks, the letter ё, the tokenizer and the sentence splitter, shared by the
 * adapter and the build scripts (scripts/ru-*.mts).
 *
 * Three views of one written word:
 *   printed   exactly as the text has it: "Кни́гу" in a primer or a dictionary, "книгу" on a web page, "все" for всё in most print.
 *   key       the identity of a form (`ruKey`): NFC, lower case, the stress marks removed (acute U+0301, grave U+0300) and the soft
 *             hyphen removed. NOTHING else is folded: й and ё are letters of their own (и + breve and е + diaeresis recompose under
 *             NFC), все and всё are two keys. On text without stress marks the key equals NFC + lower case, which is what the pack
 *             runtime uses for a language whose analyser it does not hold (packages/language-packs/src/runtime.ts `formsFor`), so
 *             a dictionary shard built with this key is found by both.
 *   е-spelling (`yoFold`): the key with ё written as е, as most Russian print writes it. It is never an identity: it is the bridge
 *             from a text without ё to the keys that have it (the index's `yo` map), and a reading reached that way says so.
 *
 * Stress is information about a form, not part of its identity: an index row carries the positions of the stressed vowels in the
 * key (`stressPositions` reads them off a dictionary's spelling, `withStress` writes them back for display).
 */
import type { RawToken, Span } from '../../core';
import { makeWordTokenizer, splitSentences } from '../shared';

const ACUTE = '́';
const GRAVE = '̀';
const SOFT_HYPHEN = '­';
const DROP = /[́̀­]/g;

export const RU_VOWELS = 'аеёиоуыэюя';
const VOWEL = new Set(RU_VOWELS);
/** A letter of the modern Russian alphabet (а–я and ё), either case. */
export const RUSSIAN_LETTER = /[а-яё]/iu;
/** Any Cyrillic letter (Russian or not): the script test. */
export const CYRILLIC_LETTER = /\p{Script=Cyrillic}/u;

/** The identity of a written form: NFC, lower case, stress marks and soft hyphens removed; ё and й kept. */
export function ruKey(surface: string): string {
  return surface.normalize('NFD').replace(DROP, '').normalize('NFC').toLowerCase();
}
export const ruNormalize = ruKey;

/** The е-spelling of a key: ё written as е. Never an identity (see the header). */
export const yoFold = (key: string): string => key.replace(/ё/g, 'е');
export const hasYo = (s: string): boolean => /ё/i.test(s);

/** Forgiving search: the key, with ё as е. */
export const ruSearchNormalize = (q: string): string => yoFold(ruKey(q)).trim();

/** True when the word is written in Cyrillic letters (hyphens, apostrophes and stress marks allowed inside). */
export const isCyrillicWord = (s: string): boolean => /^[\p{Script=Cyrillic}́̀­'’-]+$/u.test(s) && CYRILLIC_LETTER.test(s);

/** How many vowel letters the key has (its syllable count). */
export function vowelCount(key: string): number {
  let n = 0;
  for (const ch of key) if (VOWEL.has(ch)) n++;
  return n;
}

/**
 * The positions (indexes into `ruKey(form)`) of the vowels a written form marks as stressed with an acute accent. A grave
 * (secondary stress in a compound, or a disambiguating mark in older print) is not a primary stress and is ignored.
 */
export function stressPositions(form: string): number[] {
  const out: number[] = [];
  let i = 0;
  for (const ch of form.normalize('NFC')) {
    if (ch === ACUTE) { if (i > 0 && !out.includes(i - 1)) out.push(i - 1); continue; }
    if (ch === GRAVE || ch === SOFT_HYPHEN) continue;
    i += ch.length;
  }
  return out;
}

/**
 * The stress a spelling implies without any mark: ё is always stressed, and a word with one vowel is stressed on it. Empty when the
 * spelling decides nothing (two or more vowels and no ё) or the word has no vowel.
 */
export function impliedStress(key: string): number[] {
  const yo = key.indexOf('ё');
  if (yo >= 0 && key.indexOf('ё', yo + 1) < 0) return [yo];
  if (vowelCount(key) === 1) { for (let i = 0; i < key.length; i++) if (VOWEL.has(key[i])) return [i]; }
  return [];
}

/** The key with an acute after each stressed vowel (not after ё, which needs none), for display: ("книгу", [3]) → "кни́гу". */
export function withStress(key: string, positions: readonly number[]): string {
  if (!positions.length) return key;
  const at = new Set(positions);
  let out = '';
  for (let i = 0; i < key.length; i++) { out += key[i]; if (at.has(i) && key[i] !== 'ё' && VOWEL.has(key[i])) out += ACUTE; }
  return out;
}

/** An index row stores stress compactly: one position as a number, several as "3,9", none as undefined. */
export type PackedStress = number | string | undefined;
export const packStress = (positions: readonly number[]): PackedStress => (positions.length === 0 ? undefined : positions.length === 1 ? positions[0] : positions.join(','));
export const unpackStress = (s: PackedStress): number[] => (s === undefined ? [] : typeof s === 'number' ? [s] : s.split(',').map(Number));

/** The letters a shard prefix is matched against: the е-spelling of the key, Russian letters only (so все and всё share a shard). */
export const ruShardLetters = (key: string): string => yoFold(ruKey(key)).replace(/[^а-я]/g, '');

// ───────────────────────────── tokens ─────────────────────────────

const base = makeWordTokenizer({ locale: 'ru', normalize: ruKey });
const HYPHENS = new Set(['-', '‐', '‑']);

/**
 * Tokens: Intl.Segmenter('ru') keeps a word with its stress marks whole. A hyphen written between two Cyrillic words with no space
 * joins them into ONE word token (кто-то, из-за, по-русски, какого-нибудь, северо-западный): Russian writes these as single words,
 * and the dictionary files most of them as headwords. The analyser reads the whole first and its parts second. A dash with spaces
 * around it (—, " - ") is punctuation. Offsets always slice the input exactly.
 */
export function ruTokenize(text: string): RawToken[] {
  const toks = base(text);
  const out: RawToken[] = [];
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i];
    while (
      t.isWord && CYRILLIC_LETTER.test(t.surface) && i + 2 < toks.length
      && HYPHENS.has(toks[i + 1].surface) && toks[i + 1].start === t.end
      && toks[i + 2].isWord && toks[i + 2].start === toks[i + 1].end && CYRILLIC_LETTER.test(toks[i + 2].surface)
    ) {
      const end = toks[i + 2].end;
      const surface = text.slice(t.start, end);
      t = { surface, start: t.start, end, isWord: true, normalized: ruKey(surface) };
      i += 2;
    }
    out.push(t);
  }
  return out;
}

/** The parts of a hyphenated key ("кто-то" → ["кто", "то"]); one part when there is no hyphen. */
export const hyphenParts = (key: string): string[] => key.split(/[-‐‑]/).filter(Boolean);

// ───────────────────────────── sentences ─────────────────────────────

/** Abbreviations whose full stop does not end a sentence (written without the dot, lower case). */
export const RU_ABBREVIATIONS = [
  'т', 'е', 'д', 'п', 'к', 'н', 'э', 'г', 'гг', 'в', 'вв', 'ул', 'пр', 'просп', 'пл', 'пер', 'стр', 'с', 'рис', 'табл', 'гл', 'им', 'проф', 'акад', 'доц',
  'др', 'см', 'ср', 'напр', 'тыс', 'млн', 'млрд', 'руб', 'коп', 'св', 'ст', 'кв', 'обл', 'р', 'оз', 'о', 'ок', 'ум', 'род', 'тов', 'гр', 'изд', 'ч', 'мин', 'сек',
];

/** Sentences end at . ! ? … (with closing quotes and brackets); a line break always ends one; a listed abbreviation's stop does not. */
export function ruSegmentSentences(text: string): Span[] {
  return splitSentences(text, { terminators: '.!?…', abbreviations: RU_ABBREVIATIONS });
}
