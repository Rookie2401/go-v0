/**
 * The grammar of Hindi as patterns a reader meets, not as lessons: agreement, direct and oblique forms before a
 * postposition, का / के / की, the habitual, the progressive, the perfective and its ने, को on objects and on the one who
 * feels or must, the future, commands, the subjunctive, the infinitive in its uses, obligation, ability, the passive,
 * causatives, करके, जो … वह, जब … तब, जहाँ … वहाँ, जितना … उतना, कि-clauses, compound verbs, auxiliary chains. Each is
 * a pattern item in the learner model: met, explained on request, never a gate.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H4). The exported signatures are final.
 */
import type { AnalyzedToken, PatternCandidate, RawToken } from '../../core';

/** The construction inventory: key → title and a plain explanation with one example. Keys are stable (they are item ids). */
export const HINDI_CONSTRUCTIONS: Readonly<Record<string, { title: string; explanation: string; family: string }>> = {};

/** Every construction found in one sentence, each on the tokens that carry it, found only where the words around are analysed. */
export function detectHindiConstructions(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  void tokens; void analyses;
  return [];
}

/**
 * The verb group that ends at or contains token i, as one statement: the main verb, any second verb of a compound,
 * and the auxiliaries, with what the whole says ("कह दी थी: कहना + देना, feminine perfective, past: had said").
 * Undefined when token i is not part of a verb group.
 */
export function hindiVerbGroup(tokens: RawToken[], analyses: AnalyzedToken[], i: number): { tokenIndexes: number[]; main: string; vector?: string; auxiliaries: string[]; summary: string } | undefined {
  void tokens; void analyses; void i;
  return undefined;
}
