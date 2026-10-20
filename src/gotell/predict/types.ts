/**
 * Guided help in the testimony editor (docs/GOTELL-GUIDED.md): the shared types of the prediction engine, the editor and
 * the evidence path. Everyone imports from here; nothing here depends on the engine or the UI. The shapes that the draft
 * and revision models carry (`Range`, `TextAssist`, `SuppliedWord`) live in core (src/core/assist.ts) and are re-exported.
 */
import type { LanguageCode, LearnerLevel } from '../../core';

export type { Range, SuppliedWord, TextAssist } from '../../core';
export { EMPTY_ASSIST } from '../../core';

export interface KnownWord {
  /** form item id: form:<lang>:<normalized> */
  itemId: string;
  normalized: string;
  /** The most frequent spelling the learner has read (German nouns keep their capital). */
  surface: string;
  count: number;
  level: LearnerLevel;
}

export interface WordIndex {
  lang: LanguageCode;
  userId: string;
  /** by normalized form */
  words: Map<string, KnownWord>;
  /** previous word's normalized form → next known word's normalized form → count */
  bigrams: Map<string, Map<string, number>>;
  /** ISO time */
  builtAt: string;
  /** texts scanned */
  textCount: number;
}

export interface Prediction {
  /** The characters already typed (surface, as typed). */
  typed: string;
  /** The full suggested word (its known spelling). */
  surface: string;
  /** What the ghost shows after the caret: surface minus the typed prefix. Never empty. */
  completion: string;
  itemId: string;
  score: number;
}

/** One English-in-parentheses request found right before the caret. */
export interface Parenthetical {
  /** trimmed, as typed */
  english: string;
  /** offset of '(' */
  start: number;
  /** offset after ')' */
  end: number;
}

export interface ReverseHit {
  /** dictionary headword (written form) */
  lemma: string;
  pos?: string;
  frequencyRank?: number;
  /** True when the learner knows this lemma's form (reading ≥ recognized). */
  known: boolean;
}
