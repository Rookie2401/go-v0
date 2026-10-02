/**
 * Hindi words that work together as one: compound verbs (a main verb's stem + a second verb that colours it —
 * कह देना, कर लेना, चला जाना, हो जाना, पढ़ डालना), complex predicates (a noun or adjective + करना / होना / आना / देना / लेना /
 * लगना — याद करना, याद आना, कोशिश करना, शुरू करना, पसंद होना), compound postpositions (के लिए, के साथ, की तरफ़) and fixed
 * expressions. Each is a phrase item of its own in the learner model, beside the words it is made of.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H4). The exported signatures are final.
 */
import type { AnalyzedToken, PhraseCandidate, RawToken } from '../../core';

/** The second verbs of compound verbs, by lemma, with what each adds in plain words (देना: "done for someone else, or done and finished"). */
export const HINDI_VECTOR_VERBS: Readonly<Record<string, string>> = {};

/**
 * Every multiword unit in one sentence. `pattern` is written in lemmas (['कहना', 'देना'], ['याद', 'करना'],
 * ['का', 'लिए']), so that कह दिया, कह देगी and कह दो are one item; `display` is the dictionary shape (कह देना);
 * `gloss` says what the whole means, and for a compound verb what the second verb adds here; `kind` is 'construction'
 * for a compound verb, 'collocation' for a complex predicate, 'frame' for a compound postposition, 'formula' or
 * 'idiom' for a fixed expression. A compound verb is recognised for ANY main verb the analyses identify, not from a list.
 */
export function detectHindiPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  void tokens; void analyses;
  return [];
}
