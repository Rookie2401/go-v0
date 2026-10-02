/**
 * Verb inflection: present, imperfect, aorist, subjunctive, imperative, optative, admirative, participle, active and
 * non-active, from a verb's principal parts; and readings by ending for a verb the word list does not hold. Package Q2.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */
import type { SqForm, SqLexeme, SqReading } from './types';

/** Every simple (one-word) form of a verb. Compound tenses (kam punuar, do të punoj) are constructions, not forms. */
export function verbForms(_lex: SqLexeme): SqForm[] {
  return [];
}

/** Readings by ending for a form outside the word list: `lemmaKnown: false`, confidence 0.5 at most. May be empty. */
export function guessVerb(_form: string): SqReading[] {
  return [];
}
