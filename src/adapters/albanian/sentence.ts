/**
 * The sentence layer: which reading of each word is meant here. Package Q5.
 *
 * Albanian leaves four things to the sentence (see types.ts): which of e / i / të / së is the linking article, an
 * object pronoun, the subjunctive particle or "and"; which article + adjective pairs are one lexical unit ("i mirë");
 * which case an ending that serves several cases has here (after a preposition, after a linking article); and whether a
 * word is a verb. The rules live in sentence-little.ts (the little words), sentence-perfect.ts (kam / jam + participle),
 * sentence-clause.ts (names, case, verbs, person) and sentence-look.ts (what the neighbours are); sentence-core.ts holds the one way a decision is made.
 *
 * What it is: an ordering of the readings the word-form engine already has. A reading the sentence chose goes first,
 * keeps its confidence, gets `notes.context` (what decided) and has its comma unions cut down to what the sentence allows
 * (`Case: 'Nom,Acc'` → 'Acc' after "në"); the readings it rules out stay behind it with a confidence of 0.4 at most. Nothing
 * is added, nothing is removed, no confidence is raised. The one rebuilt reading: the article of an article + adjective
 * unit takes the unit's lemma and part of speech ("i mirë", ADJ) in place of its own ("i", DET), because the learner
 * model credits the unit, not the article. Where the neighbours do not decide, the order and the unions stay as they
 * were — an undecided ambiguity is honest, a wrong decision teaches something false. Machine-drafted rules, not checked
 * by a native speaker.
 */
import type { AnalysisCandidate, RawToken } from '../../core';
import type { Ctx } from './sentence-core';
import { prepositions, verbs } from './sentence-clause';
import { names } from './sentence-names';
import { formUnits, littleWords } from './sentence-little';
import { perfect } from './sentence-perfect';

/**
 * `base[i]` = the context-free candidates of token i, best first (empty for a token that is not a word). Returns, for
 * every token, its candidates ordered and narrowed by the sentence; the same array where the sentence does not decide.
 * `base` itself is never written to.
 */
export function orderSqSentence(tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[][] {
  const cx: Ctx = { tokens, base: tokens.map((_, i) => base[i] ?? []), cur: tokens.map((_, i) => base[i] ?? []), inUnit: new Set() };
  names(cx);
  formUnits(cx);
  littleWords(cx);
  perfect(cx);
  prepositions(cx);
  verbs(cx);
  return base.map((original, i) => cx.cur[i] ?? original);
}
