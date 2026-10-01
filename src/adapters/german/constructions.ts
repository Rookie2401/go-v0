/**
 * German constructions (verb-second, verb-final, the sentence bracket, modal + infinitive, zu-infinitive, relative
 * clause, passive, Konjunktiv …), phrase units, sentence segmentation. STUB — package GD replaces the bodies.
 */
import type { AnalyzedToken, PatternCandidate, RawToken, Span } from '../../core';
import type { PhraseRule } from '../shared';

export function detectGermanConstructions(_tokens: RawToken[], _analyses: AnalyzedToken[]): PatternCandidate[] { return []; }

/** Phrase units and verb + preposition frames, in the shared rule format. */
export const GERMAN_PHRASE_RULES: PhraseRule[] = [];

export function segmentGermanSentences(_text: string): Span[] { return []; }
