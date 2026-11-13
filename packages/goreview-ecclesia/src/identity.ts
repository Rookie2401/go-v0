/**
 * Lexical identity: the stable ids a token gets, so the same word met on any device, in any passage, in any reader is the same
 * unit. Ids follow the Repository's `unitIds` builders exactly (`lemma:<lang>:<lemma>:<POS>`, `form:<lang>:<surface>`,
 * `morph:<lang>:<POS>:<k=v|…>`), with the language id the profile files the language under. Ids are PERIOD-FREE: the same
 * lexeme in Homer and in John is one unit (./periods). Normalisation is the only thing decided here, per script:
 *   Hebrew / Aramaic  NFC; cantillation (U+0591–U+05AF), meteg (U+05BD), rafe (U+05BF), the Masoretic dots (U+05C4, U+05C5) and
 *                     sof pasuq / paseq removed; vowel points KEPT (a pointed lemma is the lexeme's name). `consonantal` strips
 *                     every mark for a secondary key.
 *   Greek             NFC; punctuation at the edges removed (the elision mark ’ stays: δι’ is the form printed); accents KEPT
 *                     (MorphGNT lemmas are accented; θεός and Θεός differ by capitalisation only, which `lexemeId` keeps as given).
 *   Latin             NFC; lower-cased; macrons and breves removed; edge punctuation removed. `v` and `j` are kept as the edition
 *                     prints them (an id names a printed word; cross-edition matching is the lexicon's business).
 * Because periods spell differently (monotonic Modern Greek, unpointed Modern Hebrew), `crossPeriodKey` gives a spelling-blind
 * key that LINKS a word across periods without merging its units.
 *
 * Passage keys: Scripture `JHN.1.1` / `JHN.1.1-18` (the Repository's `sourceLocator` convention); another work
 * `w:plato-republic.514.1`. The per-verse `sentenceKey` is `v:` + the single-verse key (a context identifier; the contract wants
 * a hash OF the text, never the text, and a coordinate is text-free).
 */
import { unitIds, type PlainSourceRef, type ScriptureSourceRef, type SourceRef } from '../../repository-contract/src';
import { itemIdFor } from '../../goreview/src/scheduler/deck';
import type { AssessmentDimension } from '../../goreview/src/types';
import type { EcclesiaLanguageId, EcclesiaLanguageProfile, EcclesiaToken, PassageRef, ScripturePassageRef, TokenUnitIds, WorkPassageRef } from './contract';

const HEBREW_STRIP = /[֑-ֽֿ֯׀׃-ׅ׳״]/gu;
const HEBREW_ALL_MARKS = /[֑-ׇ]/gu;
const EDGE_PUNCT = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
/** Keeps the Greek elision mark at the END of a word (δι’, ἀλλ’) while stripping other edge punctuation. */
const GREEK_EDGE_PUNCT = /^[\p{P}\p{S}\s]+|[,.;·:!?()\[\]"“”«»—–\s]+$/gu;
const LATIN_LENGTH_MARKS = /[̄̆]/gu;
const COMBINING = /\p{M}/gu;

export const USFM_BOOK = /^[A-Z0-9]{3}$/;
/** A reader's id for a work that is not a book of Scripture: lower-case letters, digits, `.`, `_`, `-`; at most 60. */
export const WORK_ID = /^[a-z0-9][a-z0-9._-]{0,59}$/;
export const MAX_WORK_NUMBER = 100_000;

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

/**
 * A spelling-blind key for the same word across the periods of one language: Greek without accents, breathings, iota subscript
 * or case, final sigma as sigma (polytonic ἄνθρωπος = monotonic άνθρωπος); Hebrew and Aramaic consonants only (pointed = unpointed;
 * note that Modern "full" spelling adds letters a pointed lemma lacks, which no key can undo); Latin lower-cased with j as i and
 * v as u. It LINKS units; it is never an id, and two different words may share a key (Hebrew homographs above all).
 */
export function crossPeriodKey(language: EcclesiaLanguageId, word: string): string {
  switch (language) {
    case 'he': case 'arc': return consonantal(word);
    case 'grc': return word.normalize('NFD').replace(COMBINING, '').replace(/[’'᾽ʼ]/gu, '').toLowerCase().replace(/ς/gu, 'σ').replace(EDGE_PUNCT, '').normalize('NFC');
    case 'la': return normalizeWord('la', word).replace(/j/gu, 'i').replace(/v/gu, 'u');
  }
}

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

/** The lemma and part of speech a lexeme id names (`lemma:el:λόγος:NOUN` → λόγος, NOUN); undefined for any other id. */
export function parseLexemeId(unitId: string, languageId: string): { lemma: string; pos: string } | undefined {
  const prefix = `lemma:${languageId}:`;
  if (!unitId.startsWith(prefix)) return undefined;
  const rest = unitId.slice(prefix.length);
  const i = rest.lastIndexOf(':');
  return i > 0 ? { lemma: rest.slice(0, i), pos: rest.slice(i + 1) } : undefined;
}

/** The deck item id of a unit tested along one dimension: `card:<dimension>:<unitId>` (GoReview's own rule, re-exported so Ecclesia has one import). */
export const cardIdFor = (unitId: string, dimension: AssessmentDimension): string => itemIdFor(unitId, dimension);

// ───────────────────────────── passages ─────────────────────────────

export const isWorkRef = (ref: PassageRef): ref is WorkPassageRef => typeof (ref as WorkPassageRef).work === 'string';
export const isScriptureRef = (ref: PassageRef): ref is ScripturePassageRef => !isWorkRef(ref);

export function assertPassageRef(ref: PassageRef): PassageRef {
  const work = isWorkRef(ref);
  if (work) {
    if (!WORK_ID.test(ref.work)) throw new RangeError(`not a work id (lower-case letters, digits, . _ -; at most 60): ${ref.work}`);
    if (ref.title !== undefined && (!ref.title.trim() || ref.title.length > 300)) throw new RangeError('a work title is 1 to 300 characters');
  } else if (!USFM_BOOK.test(ref.book)) throw new RangeError(`not a USFM book code: ${ref.book}`);
  const maxChapter = work ? MAX_WORK_NUMBER : 151, maxVerse = work ? MAX_WORK_NUMBER : 176;
  if (!Number.isInteger(ref.chapter) || ref.chapter < 1 || ref.chapter > maxChapter) throw new RangeError(`not a chapter: ${ref.chapter}`);
  if (!Number.isInteger(ref.verse) || ref.verse < 1 || ref.verse > maxVerse) throw new RangeError(`not a verse: ${ref.verse}`);
  if (ref.verseEnd !== undefined && (!Number.isInteger(ref.verseEnd) || ref.verseEnd < ref.verse || ref.verseEnd > maxVerse)) throw new RangeError(`not a verse range end: ${ref.verseEnd}`);
  return ref;
}

const stem = (ref: PassageRef): string => (isWorkRef(ref) ? `w:${ref.work}` : ref.book);

/** A short human label for error messages and reasons: `JHN 1`, `plato-republic 514`. */
export const passageLabel = (ref: PassageRef): string => `${isWorkRef(ref) ? ref.work : ref.book} ${ref.chapter}`;

/** `JHN.1.1` or `JHN.1.1-18`; for another work `w:plato-republic.514.1-5`. */
export function passageKey(ref: PassageRef): string {
  assertPassageRef(ref);
  return `${stem(ref)}.${ref.chapter}.${ref.verse}${ref.verseEnd !== undefined && ref.verseEnd !== ref.verse ? `-${ref.verseEnd}` : ''}`;
}

/** The per-verse context key used as `subject.sentenceKey`: `v:JHN.1.1`, `v:w:plato-republic.514.1`. */
export const verseKey = (ref: PassageRef, verse: number): string => `v:${stem(ref)}.${ref.chapter}.${verse}`;

/** True when `verse` lies in the passage. */
export const inPassage = (ref: PassageRef, verse: number): boolean => verse >= ref.verse && verse <= (ref.verseEnd ?? ref.verse);

/** The Repository's typed Scripture reference for a verse (or the whole passage when `verse` is omitted). No text, ever. */
export function scriptureRef(profile: EcclesiaLanguageProfile, ref: PassageRef, verse?: number): ScriptureSourceRef {
  assertPassageRef(ref);
  if (isWorkRef(ref)) throw new RangeError(`${ref.work} is not a book of Scripture; use sourceRefOf`);
  const base = {
    kind: 'scripture' as const, provider: 'other' as const, translationId: profile.textId, languageId: profile.repository.languageId,
    book: ref.book, chapter: ref.chapter, confidence: 1, restrictions: profile.corpus.restrictions,
  };
  if (verse !== undefined) return { ...base, verse };
  return ref.verseEnd !== undefined && ref.verseEnd !== ref.verse ? { ...base, verse: ref.verse, verseEnd: ref.verseEnd } : { ...base, verse: ref.verse };
}

/**
 * The source reference of a verse (or of the whole passage): the typed Scripture reference for a book of Scripture; for any
 * other work a plain reference whose locator is the passage key (`w:plato-republic.514.1`) and whose title is the work's.
 */
export function sourceRefOf(profile: EcclesiaLanguageProfile, ref: PassageRef, verse?: number): SourceRef {
  if (!isWorkRef(ref)) return scriptureRef(profile, ref, verse);
  assertPassageRef(ref);
  const locator = verse !== undefined ? `${stem(ref)}.${ref.chapter}.${verse}` : passageKey(ref);
  const plain: PlainSourceRef = { kind: 'ebook', locator, restrictions: profile.corpus.restrictions, ...(ref.title ? { title: ref.title } : {}) };
  return plain;
}

/** The place a plain work locator names (`w:plato-republic.514.1`), or undefined when it is not one of ours. */
export function parseWorkLocator(locator: string | undefined): { work: string; chapter: number; verse: number } | undefined {
  const m = /^w:([a-z0-9][a-z0-9._-]{0,59})\.(\d+)\.(\d+)(?:-\d+)?$/u.exec(locator ?? '');
  return m ? { work: m[1]!, chapter: Number(m[2]), verse: Number(m[3]) } : undefined;
}
