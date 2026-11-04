/**
 * Lexical identity: the stable ids a token gets, so the same word met on any device, in any passage, in any reader is the same
 * unit. Ids follow the Repository's `unitIds` builders exactly (`lemma:<lang>:<lemma>:<POS>`, `form:<lang>:<surface>`,
 * `morph:<lang>:<POS>:<k=v|…>`), with the language id the profile files the language under. Normalisation is the only thing
 * decided here, per script:
 *   Hebrew / Aramaic  NFC; cantillation (U+0591–U+05AF), meteg (U+05BD), rafe (U+05BF), the Masoretic dots (U+05C4, U+05C5) and
 *                     sof pasuq / paseq removed; vowel points KEPT (a pointed lemma is the lexeme's name). `consonantal` strips
 *                     every mark for a secondary key.
 *   Greek             NFC; punctuation at the edges removed (the elision mark ’ stays: δι’ is the form printed); accents KEPT
 *                     (MorphGNT lemmas are accented; θεός and Θεός differ by capitalisation only, which `lexemeId` keeps as given).
 *   Latin             NFC; lower-cased; macrons and breves removed; edge punctuation removed. `v` and `j` are kept as the edition
 *                     prints them (an id names a printed word; cross-edition matching is the lexicon's business).
 * Passage keys: `JHN.1.1` / `JHN.1.1-18` (the Repository's `sourceLocator` convention) and `v:JHN.1.1` as the per-verse
 * `sentenceKey` (a context identifier; the contract wants a hash OF the text, never the text, and a coordinate is text-free).
 */
import { unitIds, type ScriptureSourceRef } from '../../repository-contract/src';
import { itemIdFor } from '../../goreview/src/scheduler/deck';
import type { AssessmentDimension } from '../../goreview/src/types';
import type { EcclesiaLanguageId, EcclesiaLanguageProfile, EcclesiaToken, PassageRef, TokenUnitIds } from './contract';

const HEBREW_STRIP = /[֑-ֽֿ֯׀׃-ׅ׳״]/gu;
const HEBREW_ALL_MARKS = /[֑-ׇ]/gu;
const EDGE_PUNCT = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
/** Keeps the Greek elision mark at the END of a word (δι’, ἀλλ’) while stripping other edge punctuation. */
const GREEK_EDGE_PUNCT = /^[\p{P}\p{S}\s]+|[,.;·:!?()\[\]"“”«»—–\s]+$/gu;
const LATIN_LENGTH_MARKS = /[̄̆]/gu;

export const USFM_BOOK = /^[A-Z0-9]{3}$/;

/** The surface or lemma as the id writes it, by script. */
export function normalizeWord(language: EcclesiaLanguageId, s: string): string {
  let out = s.normalize('NFC').trim();
  switch (language) {
    case 'he': case 'arc':
      out = out.replace(HEBREW_STRIP, '').replace(EDGE_PUNCT, '');
      break;
    case 'grc':
      out = out.replace(GREEK_EDGE_PUNCT, '');
      break;
    case 'la':
      out = out.normalize('NFD').replace(LATIN_LENGTH_MARKS, '').normalize('NFC').toLowerCase().replace(EDGE_PUNCT, '');
      break;
  }
  return out.normalize('NFC');
}

/** Hebrew / Aramaic letters only (no points, no cantillation): a secondary key for matching an unpointed text. */
export const consonantal = (s: string): string => s.normalize('NFC').replace(HEBREW_ALL_MARKS, '').replace(EDGE_PUNCT, '');

/** `lemma:<lang>:<lemma>:<POS>` — the lexeme. A lemma with a colon or whitespace cannot be an id and is refused. */
export function lexemeId(profile: EcclesiaLanguageProfile, lemma: string, pos: string): string {
  const l = normalizeWord(profile.id, lemma);
  if (!l || /[\s:]/u.test(l)) throw new RangeError(`not a lemma: ${JSON.stringify(lemma)}`);
  if (!pos || /[\s:]/u.test(pos)) throw new RangeError(`not a part of speech: ${JSON.stringify(pos)}`);
  return unitIds.lexeme(profile.repository.languageId, l, pos);
}

/** `form:<lang>:<surface>` — the printed word, normalised. */
export function formId(profile: EcclesiaLanguageProfile, surface: string): string {
  const s = normalizeWord(profile.id, surface);
  if (!s || /[\s:]/u.test(s)) throw new RangeError(`not a single word: ${JSON.stringify(surface)}`);
  return unitIds.form(profile.repository.languageId, s);
}

/** `morph:<lang>:<POS>:<k=v|…>` — the morphological construction the form realises; undefined without features. */
export function morphId(profile: EcclesiaLanguageProfile, pos: string, features: Record<string, string> | undefined): string | undefined {
  if (!features || !Object.keys(features).length) return undefined;
  return unitIds.morph(profile.repository.languageId, pos, unitIds.featureKey(features));
}

export function unitIdsOf(profile: EcclesiaLanguageProfile, token: EcclesiaToken): TokenUnitIds {
  const lexeme = lexemeId(profile, token.lemma, token.pos);
  const form = formId(profile, token.surface);
  const morph = morphId(profile, token.pos, token.features);
  return morph ? { lexeme, form, morph } : { lexeme, form };
}

/** The deck item id of a unit tested along one dimension: `card:<dimension>:<unitId>` (GoReview's own rule, re-exported so Ecclesia has one import). */
export const cardIdFor = (unitId: string, dimension: AssessmentDimension): string => itemIdFor(unitId, dimension);

// ───────────────────────────── passages ─────────────────────────────

export function assertPassageRef(ref: PassageRef): PassageRef {
  if (!USFM_BOOK.test(ref.book)) throw new RangeError(`not a USFM book code: ${ref.book}`);
  if (!Number.isInteger(ref.chapter) || ref.chapter < 1 || ref.chapter > 151) throw new RangeError(`not a chapter: ${ref.chapter}`);
  if (!Number.isInteger(ref.verse) || ref.verse < 1 || ref.verse > 176) throw new RangeError(`not a verse: ${ref.verse}`);
  if (ref.verseEnd !== undefined && (!Number.isInteger(ref.verseEnd) || ref.verseEnd < ref.verse || ref.verseEnd > 176)) throw new RangeError(`not a verse range end: ${ref.verseEnd}`);
  return ref;
}

/** `JHN.1.1` or `JHN.1.1-18`. */
export function passageKey(ref: PassageRef): string {
  assertPassageRef(ref);
  return `${ref.book}.${ref.chapter}.${ref.verse}${ref.verseEnd !== undefined && ref.verseEnd !== ref.verse ? `-${ref.verseEnd}` : ''}`;
}

/** The per-verse context key used as `subject.sentenceKey`: `v:JHN.1.1`. */
export const verseKey = (ref: PassageRef, verse: number): string => `v:${ref.book}.${ref.chapter}.${verse}`;

/** True when `verse` lies in the passage. */
export const inPassage = (ref: PassageRef, verse: number): boolean => verse >= ref.verse && verse <= (ref.verseEnd ?? ref.verse);

/** The Repository's typed Scripture reference for a verse (or the whole passage when `verse` is omitted). No text, ever. */
export function scriptureRef(profile: EcclesiaLanguageProfile, ref: PassageRef, verse?: number): ScriptureSourceRef {
  assertPassageRef(ref);
  const base = {
    kind: 'scripture' as const, provider: 'other' as const, translationId: profile.textId, languageId: profile.repository.languageId,
    book: ref.book, chapter: ref.chapter, confidence: 1, restrictions: profile.corpus.restrictions,
  };
  if (verse !== undefined) return { ...base, verse };
  return ref.verseEnd !== undefined && ref.verseEnd !== ref.verse ? { ...base, verse: ref.verse, verseEnd: ref.verseEnd } : { ...base, verse: ref.verse };
}
