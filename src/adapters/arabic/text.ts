/**
 * Arabic text: the marks, the views of one written word, the tokenizer and the sentence splitter. Shared by the adapter at run time
 * and by the build scripts (scripts/ar-*.mts), so a form is keyed the same way in the generated index and at lookup.
 *
 * Five views of one written word (docs/arabic/PLAN.md):
 *   printed     exactly as the page has it. Never changed, never written back.
 *   canonical   `arCanon`: NFC (so marks stand in one order), presentation forms and ligatures turned back into letters, a
 *               fatḥatān printed after its alif moved before it. Every letter and every mark is kept.
 *   key         `arKey`: canonical with every mark and the tatweel removed, alif waṣla read as alif and the Persian kāf / yeh that
 *               copied text carries read as the Arabic letters. The dictionary and the form index are keyed by it. The hamza seats
 *               (أ إ آ ؤ ئ ء), ة and ى are KEPT: they distinguish words.
 *   loose       `arLoose`: the key with what careless print confuses folded (أ إ آ → ا, ى → ي, ة → ه). Used only to FIND candidates
 *               when the key itself has none; a reading reached this way says so and is never an identity.
 *   vocalized   a dictionary form with its vowels, stored per reading as `packVocal` beside the key and shown with `applyVocal`.
 * A lexeme's identity is its vocalized headword (عِلْم is not عَلَم); see index-store.ts.
 *
 * Escapes are used for every combining mark below so that no invisible character hides in this file.
 */
import type { RawToken, Span } from '../../core';
import { makeWordTokenizer, splitSentences } from '../shared';

export const FATHATAN = 'ً', DAMMATAN = 'ٌ', KASRATAN = 'ٍ', FATHA = 'َ', DAMMA = 'ُ', KASRA = 'ِ';
export const SHADDA = 'ّ', SUKUN = 'ْ', DAGGER_ALIF = 'ٰ', TATWEEL = 'ـ';
export const ALIF = 'ا', ALIF_WASLA = 'ٱ', ALIF_MAQSURA = 'ى', TA_MARBUTA = 'ة', HAMZA = 'ء';

/** Every combining mark of Arabic print: tashkīl, Quranic annotation signs, the extended marks. (Hamza and madda marks compose in NFC.) */
const MARK = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ࣓-ࣿ]/;
const MARKS_G = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ࣓-ࣿ]/g;
/** Format characters that are not part of a word: tatweel, zero-width joiners, direction marks, soft hyphen. */
const FILLER_G = /[ـ‌‍‎‏؜­]/g;
/** Arabic presentation forms (ligatures and positional shapes copied from PDFs). */
const PRESENTATION_G = /[ﭐ-﷿ﹰ-﻿]/g;
/** An Arabic letter (the basic block's letters and the few extended ones the key folds). */
export const ARABIC_LETTER = /[ء-غف-يٱکی]/u;
const ARABIC_LETTERS_G = /[ء-غف-ي]/gu;
/** The 28 letters in alphabet order (hamza and the seats, ة and ى are spellings, not letters of the alphabet). */
export const ARABIC_ALPHABET = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
/** The six letters that do not join the letter after them. */
export const NON_JOINING = new Set([...'ادذرزو', 'أ', 'إ', 'آ', 'ؤ', 'ء', 'ة', 'ى']);
/** The sun letters: the article's lām is assimilated to them in speech (the spelling ال never changes). */
export const SUN_LETTERS = new Set([...'تثدذرزسشصضطظلن']);

/** The canonical form of printed text: see the file comment. Letters and marks are all kept. */
export function arCanon(text: string): string {
  let s = text.replace(PRESENTATION_G, (c) => c.normalize('NFKC')).normalize('NFC');
  // كتاباً (the tanwīn typed after the alif) is the same word as كتابًا: the mark belongs to the letter before the alif
  s = s.replace(/([اى])ً/g, `${FATHATAN}$1`);
  return s.normalize('NFC');
}

/** The lookup key of a written form: see the file comment. */
export function arKey(form: string): string {
  return arCanon(form).replace(MARKS_G, '').replace(FILLER_G, '').replace(/ٱ/g, ALIF).replace(/ک/g, 'ك').replace(/ی/g, 'ي');
}

/** The loose fold of a key (candidate retrieval only): hamza on or under alif and madda dropped, ى as ي, ة as ه. Same length as the key. */
export function arLoose(key: string): string {
  return key.replace(/[أإآٱ]/g, ALIF).replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

/** What a search box matches on. */
export const arSearchNormalize = (q: string): string => arLoose(arKey(q)).trim();

/** True when the form carries any vowel mark, shadda, sukūn or dagger alif. */
export const hasTashkil = (form: string): boolean => /[ً-ْٰ]/.test(form);

// ───────────────────────────── vocalization ─────────────────────────────

const VOWELS = ['', FATHA, KASRA, DAMMA, SUKUN, FATHATAN, KASRATAN, DAMMATAN] as const;
const B32 = '0123456789abcdefghijklmnopqrstuv';

/** The marks of one letter: its vowel sign (or sukūn or tanwīn), whether it is doubled, whether a dagger alif follows. */
export interface LetterMarks { vowel: string; shadda: boolean; dagger: boolean }
const NO_MARKS: LetterMarks = { vowel: '', shadda: false, dagger: false };

/** A written form as its key and the marks on each key letter (same length). Marks before the first letter are dropped. */
export function splitVocal(form: string): { key: string; marks: LetterMarks[] } {
  const s = arCanon(form).replace(FILLER_G, '').replace(/ٱ/g, ALIF).replace(/ک/g, 'ك').replace(/ی/g, 'ي');
  let key = '';
  const marks: LetterMarks[] = [];
  for (const ch of s) {
    if (!MARK.test(ch)) { key += ch; for (let i = 0; i < ch.length; i++) marks.push({ ...NO_MARKS }); continue; }
    const m = marks[marks.length - 1];
    if (!m) continue;
    if (ch === SHADDA) m.shadda = true;
    else if (ch === DAGGER_ALIF) m.dagger = true;
    else if ((VOWELS as readonly string[]).includes(ch)) m.vowel = ch;
  }
  return { key, marks };
}

/**
 * The vocalization of a form, packed: one character a key letter (vowel 0–7, +8 when doubled, +16 with a dagger alif, in base 32),
 * trailing unmarked letters trimmed. "" for an unvocalized form. `applyVocal(arKey(form), packVocal(form))` gives the form back.
 */
export function packVocal(form: string): string {
  const { marks } = splitVocal(form);
  let out = '';
  for (const m of marks) out += B32[(VOWELS as readonly string[]).indexOf(m.vowel) + (m.shadda ? 8 : 0) + (m.dagger ? 16 : 0)];
  return out.replace(/0+$/, '');
}

/** The marks a packed vocalization puts on each letter of a key. */
export function unpackVocal(key: string, packed: string | undefined): LetterMarks[] {
  const out: LetterMarks[] = [];
  for (let i = 0; i < key.length; i++) {
    const n = packed && i < packed.length ? B32.indexOf(packed[i]) : 0;
    out.push(n <= 0 ? { ...NO_MARKS } : { vowel: VOWELS[n & 7], shadda: (n & 8) !== 0, dagger: (n & 16) !== 0 });
  }
  return out;
}

/** The key with its vowels written on it (NFC). */
export function applyVocal(key: string, packed: string | undefined): string {
  if (!packed) return key;
  const marks = unpackVocal(key, packed);
  let out = '';
  for (let i = 0; i < key.length; i++) out += key[i] + marks[i].vowel + (marks[i].shadda ? SHADDA : '') + (marks[i].dagger ? DAGGER_ALIF : '');
  return out.normalize('NFC');
}

/** How much of a printed word is vocalized: none, part, or (nearly) every letter that can carry a vowel. */
export function tashkilLevel(surface: string): 'none' | 'partial' | 'full' {
  const { key, marks } = splitVocal(surface);
  let can = 0, has = 0, any = false;
  for (let i = 0; i < key.length; i++) {
    const marked = !!marks[i].vowel || marks[i].shadda;
    if (marked) any = true;
    // not counted: the last letter (a pausal form leaves it bare) and a bare long-vowel letter (it needs no mark)
    if (i === key.length - 1) continue;
    if (!marked && (key[i] === ALIF || key[i] === ALIF_MAQSURA || key[i] === 'و' || key[i] === 'ي')) continue;
    can++;
    if (marked) has++;
  }
  if (!any) return 'none';
  return can === 0 || has / can >= 0.7 ? 'full' : 'partial';
}

export interface VocalMatch {
  /** No printed mark contradicts the candidate. */
  compatible: boolean;
  /** How many printed marks the candidate agrees with (evidence FOR it). */
  agreed: number;
  /** The first contradiction: the letter's position in the key and what was printed against what the candidate has. */
  conflict?: { at: number; printed: string; candidate: string };
  /** True when the only disagreement is the vowel of the last letter (the case or mood ending). */
  endingOnly?: boolean;
}

/**
 * Does a printed (fully, partly or not at all vocalized) word agree with a vocalized candidate of the same length of key? Only what
 * is PRINTED is compared: a letter printed bare constrains nothing. A printed sukūn agrees with a bare letter of the candidate (many
 * sources leave it off) and a printed shadda needs the candidate's. The keys may differ by the loose fold (same length).
 */
export function vocalMatch(printed: string, candidateKey: string, candidatePacked: string | undefined): VocalMatch {
  const p = splitVocal(printed);
  if (p.key.length !== candidateKey.length) return { compatible: false, agreed: 0 };
  const c = unpackVocal(candidateKey, candidatePacked);
  let agreed = 0;
  let conflict: VocalMatch['conflict'];
  let conflicts = 0;
  let lastOnly = true;
  for (let i = 0; i < p.key.length; i++) {
    const a = p.marks[i], b = c[i];
    let bad: string | undefined;
    if (a.vowel) {
      if (a.vowel === b.vowel || (a.vowel === SUKUN && !b.vowel)) agreed++;
      else if (b.vowel || candidatePacked) bad = a.vowel;
    }
    if (a.shadda) { if (b.shadda) agreed++; else if (candidatePacked) bad = bad ?? SHADDA; }
    if (bad !== undefined) {
      conflicts++;
      if (i !== p.key.length - 1) lastOnly = false;
      conflict ??= { at: i, printed: bad, candidate: b.vowel + (b.shadda ? SHADDA : '') };
    }
  }
  return { compatible: conflicts === 0, agreed, ...(conflict ? { conflict, endingOnly: lastOnly && conflicts === 1 } : {}) };
}

/**
 * The key of a printed word with, for each key character, its offset in the printed string (UTF-16), so a part of the key (a
 * clitic, the stem) can be pointed at in the original text. `ends[i]` is the offset just after the letter AND its marks.
 */
export function arKeyMap(surface: string): { key: string; starts: number[]; ends: number[] } {
  let key = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  for (const ch of surface) {
    const at = i;
    i += ch.length;
    if (MARK.test(ch) || /[ـ‌‍‎‏؜­]/.test(ch)) { if (ends.length) ends[ends.length - 1] = i; continue; }
    // a presentation-form ligature expands to several key letters, all pointing at the one printed character
    const k = arKey(ch);
    for (let j = 0; j < k.length; j++) { key += k[j]; starts.push(at); ends.push(i); }
  }
  return { key, starts, ends };
}

/** The radicals of a root as the sources write it ("ك ت ب"), in order. */
export const rootRadicals = (root: string | undefined): string[] => (root ?? '').split(/\s+/).filter(Boolean);

/** The letters a shard prefix is matched against: the loose fold of the key, Arabic letters only (so أكل and اكل share a shard). */
export const arShardLetters = (key: string): string => (arLoose(arKey(key)).match(ARABIC_LETTERS_G) ?? []).join('');

// ───────────────────────────── digits ─────────────────────────────

/** Arabic-Indic (٠–٩) and extended Arabic-Indic (۰–۹) digits as ASCII digits; other characters unchanged. */
export const asciiDigits = (s: string): string => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

// ───────────────────────────── tokens and sentences ─────────────────────────────

const base = makeWordTokenizer({ locale: 'ar', normalize: arKey });

/**
 * Tokens: Intl.Segmenter('ar') keeps an orthographic word whole with its marks and tatweel. A word is NOT cut into clitics here:
 * وبالكتاب is one token, and the analyser gives its parts (arabic/clitics.ts). Offsets always slice the input exactly. A token that
 * is only digits (ASCII, Arabic-Indic or extended) is not a word.
 */
export function arTokenize(text: string): RawToken[] {
  return base(text).map((t) => (t.isWord && /^[\d٠-٩۰-۹.,٫٬]+$/.test(t.surface) ? { ...t, isWord: false } : t));
}

/** Sentences end at . ! ? ؟ … (and the Urdu-style ۔ some pages use); a line break always ends one. The Arabic comma ، and semicolon ؛ do not. */
export function arSegmentSentences(text: string): Span[] {
  return splitSentences(text, { terminators: '.!?؟…۔' });
}
