/**
 * The sentence layer: which reading of each word is meant here. Package Q5.
 * STUB written by the coordinator: the signature is final (docs/PLAN13.md), the body is the owning package's work.
 */
import type { AnalysisCandidate, RawToken } from '../../core';

/**
 * `base[i]` = the context-free candidates of token i, best first (empty for a token that is not a word). Returns, for
 * every token, its candidates ordered and narrowed by the sentence; the same array where the sentence does not decide.
 */
export function orderSqSentence(_tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[][] {
  return base;
}
