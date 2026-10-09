/**
 * meaning-to-form: the learner sees a meaning and types the Albanian (target-language) word.
 *
 * Requires: a lexeme or form unit whose analysis is high-confidence or verified (a production question is a productive
 * exercise: provisional, conflicted and invalidated analyses are refused), and a concise gloss. For a form unit the
 * question also names the form's grammatical description, so exactly one form fits; a form with no description is refused.
 * Accepted: the lemma for a lexeme; for a form, that form and any other form the pack shows with identical features. The
 * lemma typed for a form question is a `partial`, not a correct answer. Normalisation is loose: ë→e and ç→c is partial.
 */
import { reviewFacts } from '../facts/review-facts';
import { normalizeAnswer } from '../grading/normalize';
import { defineBuilder } from './builders';
import { assemble, attributionLine, eligibilityOf, exerciseIdOf, precheck, quote, referenceGloss, refuse } from './shared';
import type { Planned } from './shared';
import type { BuildContext, ReviewTarget, UnitFacts } from '../types';
import { unitIds } from '../../../repository-contract/src';

function plan(target: ReviewTarget, facts: UnitFacts, _ctx: BuildContext): Planned {
  const f = reviewFacts(facts);
  const why = precheck({ family: 'meaning-to-form', dimension: 'meaning-to-target-retrieval' }, target, facts, ['lexeme', 'form']);
  if (why) return refuse(why);
  const eligibility = eligibilityOf('meaning-to-form', facts);
  if (!eligibility.eligible) return refuse(eligibility.reason);

  const reference = referenceGloss(facts);
  if (!reference) return refuse('no concise gloss to show as the meaning');
  const isForm = facts.unit.kind === 'form';
  const lemma = facts.lemma ?? (isForm ? undefined : facts.unit.label);
  if (!isForm && !lemma) return refuse('the lemma is not known');

  let accepted: string[];
  let partial: string[] | undefined;
  let instruction: string;
  let explanation: string;
  if (isForm) {
    const description = f.morphDescription;
    if (!description) return refuse('the form has no description of its features, so the question could not name which form is wanted');
    const same = facts.siblingForms.filter((s) => unitIds.featureKey(s.features) === unitIds.featureKey(facts.features ?? {})).map((s) => s.surface);
    accepted = [...new Set([facts.unit.label, ...same])];
    partial = lemma && normalizeAnswer(lemma, 'loose') !== normalizeAnswer(facts.unit.label, 'loose') ? [lemma] : undefined;
    instruction = `Type the form of the word meaning ${quote(reference)} that is: ${description}.`;
    explanation = `The ${description} of ${lemma ? quote(lemma) : 'this word'} (${reference}) is ${quote(facts.unit.label)}.${attributionLine(facts, [reference])}`;
  } else {
    accepted = [lemma as string];
    instruction = `Type the word that means ${quote(reference)}.`;
    explanation = `${quote(reference)} is ${quote(lemma as string)}.${attributionLine(facts, [reference])}`;
  }
  return {
    ok: true,
    exercise: assemble({
      exerciseId: exerciseIdOf('meaning-to-form', facts.unit.unitId, reference),
      family: 'meaning-to-form',
      target: { ...target },
      prompt: { instruction, meaning: reference },
      answerKey: {
        accepted, normalization: 'loose', explanation, articles: ['i', 'e', 'të', 'së'],
        ...(partial ? { partial, partialExplanation: `${quote(partial[0])} is the dictionary form; the question asked for the specific form ${quote(accepted[0])}.` } : {}),
        ...(facts.constructionExplanation ? { deeper: facts.constructionExplanation } : {}),
      },
      hiddenBeforeAnswer: [],
      responseMode: 'typed',
      eligibility,
      builtFrom: { facts: [`unit:${facts.unit.unitId}`, 'gloss'] },
      variant: 'typed',
    }),
  };
}

export const meaningToForm = defineBuilder('meaning-to-form', plan);
