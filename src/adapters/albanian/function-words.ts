/**
 * The closed classes of Standard Albanian: pronouns in all their case forms, the linking article, prepositions with
 * the case they govern, conjunctions, particles, numerals, question words. Package Q3.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */
import type { SqLexeme, SqReading } from './types';

/** Closed-class words as lexemes (lemma, part of speech, gloss or role, explicit forms). */
export const SQ_FUNCTION_WORDS: SqLexeme[] = [];

/**
 * Every reading of a closed-class written form, best first when read alone ("e" → object pronoun, linking article,
 * conjunction). Keys are normalized forms.
 */
export const SQ_FUNCTION_READINGS: ReadonlyMap<string, SqReading[]> = new Map();

/**
 * The linking article that agrees with a noun of this gender, number, case and definiteness: i / e / të / së.
 * `adjacent` = the article stands directly after a definite noun (djali i mirë) rather than after another word
 * (një djalë i mirë; djali im i mirë). Returns every form in use for those features, the usual one first.
 */
export function linkingArticle(_f: { gender: 'Masc' | 'Fem' | 'Neut'; number: 'Sing' | 'Plur'; case: 'Nom' | 'Acc' | 'Gen' | 'Dat' | 'Abl'; definite: 'Def' | 'Ind'; adjacent?: boolean }): string[] {
  return [];
}

/** The features of the head noun that a given linking-article form is compatible with (the inverse of linkingArticle). */
export function linkingArticleReadings(_form: string): Array<{ gender: string; number: string; case: string; definite: string }> {
  return [];
}
