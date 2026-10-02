/**
 * Noun inflection: every case, number and definiteness form of a noun from its three stated forms, and readings by
 * ending for a noun the word list does not hold. Package Q1.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */
import type { SqForm, SqLexeme, SqReading } from './types';

/** Every form of a noun (each written form once per distinct reading; undecided features as unions). */
export function nounForms(_lex: SqLexeme): SqForm[] {
  return [];
}

/** Readings by ending for a form outside the word list: `lemmaKnown: false`, confidence 0.5 at most. May be empty. */
export function guessNoun(_form: string): SqReading[] {
  return [];
}
