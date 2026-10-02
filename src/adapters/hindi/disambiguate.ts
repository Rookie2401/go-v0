/**
 * Which reading of a written form is meant here? Hindi spells many different things alike: की (of, feminine / did,
 * feminine), पर (on / but), से, खाना (food / to eat), सोना (gold / to sleep), आम (mango / common), का-के-की before their
 * noun, a perfective participle that is also an adjective. A small set of neighbour rules orders the readings; it
 * removes none of them and says which neighbour decided (`notes.context`). Not a parser.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H4). The exported signatures are final.
 */
import type { AnalysisCandidate, RawToken } from '../../core';

/**
 * The candidates of token i, reordered where the neighbours decide; the same array when they do not. `base` is the
 * context-free analysis of every token of the sentence (best first). The chosen reading keeps its confidence; the
 * others are kept, marked down to 0.4 at most.
 */
export function disambiguateHindi(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[] {
  void tokens;
  return base[i];
}
