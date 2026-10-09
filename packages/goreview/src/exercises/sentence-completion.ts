/**
 * sentence-completion: a pack sentence with the target word removed; the learner types the missing word, given its meaning.
 *
 * Requires: a lexeme or form unit that is high-confidence or verified (a production question: provisional, conflicted and
 * invalidated analyses are refused), a concise gloss to cue the word, and a pack sentence in which the adapter reads the word
 * with a high-confidence or verified reading and (for a form unit) with the features the unit states. A sentence that still
 * holds the removed word elsewhere is skipped. When the word in the sentence is not the dictionary form the cue also names
 * its grammatical description.
 * Accepted: the exact form in the sentence, and any other form the pack shows with identical features. The lemma typed in
 * place of an inflected form is a `partial`. Loose normalisation (ë→e, ç→c is partial).
 */
import { unitIds } from '../../../repository-contract/src';
import { reviewFacts } from '../facts/review-facts';
import { normalizeAnswer } from '../grading/normalize';
import { defineBuilder } from './builders';
import { assemble, contextOf, eligibilityOf, exerciseIdOf, occurrences, precheck, quote, referenceGloss, refuse, trusted, withGap } from './shared';
import type { Planned } from './shared';
import type { BuildContext, ReviewTarget, UnitFacts } from '../types';
import { validateExercise } from './validate';

function plan(target: ReviewTarget, facts: UnitFacts, _ctx: BuildContext): Planned {
  const f = reviewFacts(facts);
  const why = precheck({ family: 'sentence-completion', dimension: 'productive-recall' }, target, facts, ['lexeme', 'form']);
  if (why) return refuse(why);
  const eligibility = eligibilityOf('sentence-completion', facts);
  if (!eligibility.eligible) return refuse(eligibility.reason);

  const gloss = referenceGloss(facts);
  if (!gloss) return refuse('no concise gloss to cue the missing word');
  const isForm = facts.unit.kind === 'form';
  const formNorm = facts.unit.unitId.replace(/^form:[^:]+:/u, '');
  const wantKey = unitIds.featureKey(facts.features ?? {});

  const candidates = occurrences(facts).filter((o) => {
    const r = o.reading;
    if (!trusted(r.status) || !r.lemma) return false;
    if (facts.lemma && r.lemma !== facts.lemma) return false;
    if (isForm && (r.surface.normalize('NFC').toLowerCase() !== formNorm || unitIds.featureKey(r.features) !== wantKey)) return false;
    return true;
  });
  if (!candidates.length) {
    return refuse(occurrences(facts).length
      ? 'no pack sentence reads this unit with a high-confidence reading (and, for a form, with the features the unit states)'
      : 'no pack sentence holds this unit');
  }

  let lastIssue = '';
  for (const occ of candidates) {
    const context = contextOf(occ);
    const answer = context.surface;
    const answerNorm = normalizeAnswer(answer, 'exact');
    const sameFeatures = facts.siblingForms.filter((s) => unitIds.featureKey(s.features) === unitIds.featureKey(occ.reading.features)).map((s) => s.surface);
    const accepted = [answer, ...sameFeatures.filter((s) => normalizeAnswer(s, 'exact') !== answerNorm)];
    const lemma = occ.reading.lemma as string;
    const partial = normalizeAnswer(lemma, 'loose') !== answerNorm ? [lemma] : undefined;
    const description = answerNorm !== normalizeAnswer(lemma, 'exact') ? f.morphDescription ?? undefined : undefined;
    const exercise = assemble({
      exerciseId: exerciseIdOf('sentence-completion', facts.unit.unitId, String(occ.index)),
      family: 'sentence-completion',
      target: { ...target },
      prompt: {
        instruction: `Fill the gap with the word that means ${quote(gloss)}${description ? `, in this form: ${description}` : ''}.`,
        meaning: gloss,
        sentenceWithGap: withGap(context),
      },
      answerKey: {
        accepted, normalization: 'loose', articles: ['i', 'e', 'të', 'së'],
        explanation: `The missing word is ${quote(answer)}${answerNorm !== normalizeAnswer(lemma, 'exact') ? `, a form of ${quote(lemma)} (${gloss})` : ` (${gloss})`}.`,
        ...(partial ? { partial, partialExplanation: `${quote(partial[0])} is the dictionary form; this gap needs the form that fits the sentence: ${quote(answer)}.` } : {}),
        ...(facts.constructionExplanation ? { deeper: facts.constructionExplanation } : {}),
      },
      hiddenBeforeAnswer: [],
      responseMode: 'typed',
      eligibility,
      builtFrom: { facts: [`unit:${facts.unit.unitId}`, `lemma:${lemma}`, 'gloss'], sentenceSource: occ.example.source },
      variant: 'typed',
      context,
    });
    const v = validateExercise(exercise);
    if (v.ok) return { ok: true, exercise };
    lastIssue = v.issues.join('; ');
  }
  return refuse(`every pack sentence for this unit failed its checks (${lastIssue})`);
}

export const sentenceCompletion = defineBuilder('sentence-completion', plan);
