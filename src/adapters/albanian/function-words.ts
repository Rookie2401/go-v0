/**
 * The closed classes of Standard Albanian: pronouns in all their case forms, the linking article, prepositions with
 * the case they govern, conjunctions, particles, numerals, question words. Package Q3.
 *
 * The word lists are in function-pronouns.ts (pronouns, possessives, question words, indefinites), function-minor.ts
 * (numerals, ordinals, prepositions, conjunctions, particles), function-article.ts (the linking article and its table);
 * function-build.ts turns lexemes into readings. This file puts them together. Machine-drafted, not checked by a native
 * speaker.
 */
import type { PartOfSpeech } from '../../core';
import type { SqLexeme, SqReading } from './types';
import { buildReadings } from './function-build';
import { LINKING_ARTICLE } from './function-article';
import { DEMONSTRATIVES, INDEFINITES, PERSONAL, POSSESSIVES, QUESTION_WORDS } from './function-pronouns';
import { CONJUNCTIONS, DEICTIC_ADVERBS, GREETINGS, MODALS, NUMERALS, ORDINALS, PARTICLES, PREPOSITION_ADVERBS, PREPOSITIONS } from './function-minor';

export { linkingArticle, linkingArticleReadings } from './function-article';

/**
 * Closed-class words as lexemes (lemma, part of speech, gloss or role, explicit forms). The order of the list is the
 * order of competing readings of one form (possessive before personal for "tij", the object pronoun before the linking
 * article before the conjunction for "e"), except where `POS_FIRST` says otherwise.
 */
export const SQ_FUNCTION_WORDS: SqLexeme[] = [
  ...POSSESSIVES, ...PERSONAL, ...DEMONSTRATIVES, ...QUESTION_WORDS, ...INDEFINITES, LINKING_ARTICLE,
  ...NUMERALS, ...ORDINALS, ...PREPOSITIONS, ...PREPOSITION_ADVERBS, ...CONJUNCTIONS, ...PARTICLES,
  ...DEICTIC_ADVERBS, ...GREETINGS, ...MODALS,
];

/** Competing parts of speech of one form, best first when the form is read alone. */
const POS_FIRST: Record<string, PartOfSpeech[]> = {
  'të': ['PART', 'PRON', 'DET'], // subjunctive particle, object pronoun, linking article
  'u': ['PART', 'PRON'], // non-active particle, object pronoun (3pl dative)
  'më': ['PRON', 'ADV', 'ADP'], // object pronoun, "more", "on (a date)"
  'një': ['NUM', 'DET'],
};

/** Forms that ALSO have a reading in another word list (do = a form of dua, pa = aorist of shoh, dhe = soil, para = money). */
const COMPETES_ELSEWHERE = new Set(['do', 'pa', 'dhe', 'para']);

/**
 * Every reading of a closed-class written form, best first when read alone ("e" → object pronoun, linking article,
 * conjunction). Keys are normalized forms. A form with several readings keeps all of them at 0.6 or less.
 */
export const SQ_FUNCTION_READINGS: ReadonlyMap<string, SqReading[]> = buildReadings(SQ_FUNCTION_WORDS, POS_FIRST, COMPETES_ELSEWHERE);
