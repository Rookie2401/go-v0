/**
 * Checks on a learner's own Hindi (testimony writing). Rule-based and modest: each finding names the words, says in
 * one plain sentence what the rule is, offers a replacement only when the rule is sure of it, and carries a
 * confidence. An empty result means nothing was found, never "correct". Meaning, idiom and tone are not judged here.
 *
 * Covered when implemented: the adjective and का / के / की agree with their noun; a noun before a postposition is in
 * its oblique form; ने only with a perfective verb, and the verb then agrees with the object, not the doer; the verb
 * agrees with its subject otherwise; को with the one who must or feels (मुझे जाना है, not मैं जाना है); a missing or
 * misplaced nukta, anusvara or chandrabindu in a word the list knows; the infinitive before लगना / चाहना / सकना in its
 * right form; है / हैं / हूँ with the subject.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H4). The exported signature is final.
 */
import type { AnalyzedToken, ErrorCandidate, RawToken } from '../../core';

export function checkHindiProduction(tokens: RawToken[], analyses: AnalyzedToken[], sentence: string): ErrorCandidate[] {
  void tokens; void analyses; void sentence;
  return [];
}
