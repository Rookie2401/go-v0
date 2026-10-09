/**
 * phrase-comprehension: a multiword expression in its pack sentence; the learner gives what it means.
 *
 * Requires: a multiword unit that is not conflicted or invalidated (provisional is allowed, with a caveat), facts that carry
 * the expression's gloss (from the pack's phrase list), and a pack sentence that holds the expression. Without the gloss or
 * the sentence it refuses: an idiom shown with no context, or graded against nothing, tests nothing.
 * The gloss may list alternatives separated by `;` ("to be called …; my name is …"); each is an accepted answer. A "…" slot
 * in the gloss is a placeholder for the variable part and is ignored in matching. Response: typed or self-graded.
 */
import { glossParts } from '../grading/normalize';
import { defineBuilder } from './builders';
import { assemble, contextOf, eligibilityOf, exerciseIdOf, occurrences, precheck, quote, refuse } from './shared';
import type { Planned } from './shared';
import type { BuildContext, ReviewTarget, UnitFacts } from '../types';

function plan(target: ReviewTarget, facts: UnitFacts, _ctx: BuildContext): Planned {
  const why = precheck({ family: 'phrase-comprehension', dimension: 'phrase-comprehension' }, target, facts, ['multiword']);
  if (why) return refuse(why);
  const eligibility = eligibilityOf('phrase-comprehension', facts);
  if (!eligibility.eligible) return refuse(eligibility.reason);
  const gloss = facts.phrase?.gloss;
  if (!facts.phrase || !gloss) return refuse('no phrase facts: the pack gives no meaning for this expression');
  const occ = occurrences(facts)[0];
  if (!occ) return refuse('no pack sentence holds this expression');
  const accepted = glossParts(gloss);
  const surface = occ.example.surface as string;
  const kind = facts.phrase.kind ? ` It is a ${facts.phrase.kind === 'frame' ? 'sentence frame (the dots stand for the part that changes)' : facts.phrase.kind}.` : '';
  return {
    ok: true,
    exercise: assemble({
      exerciseId: exerciseIdOf('phrase-comprehension', facts.unit.unitId, String(occ.index)),
      family: 'phrase-comprehension',
      target: { ...target },
      prompt: { instruction: `What does ${quote(surface)} mean in this sentence?`, stimulusText: occ.example.text },
      answerKey: {
        accepted, normalization: 'loose', openEnded: true, articles: ['to', 'a', 'an', 'the'],
        explanation: `${quote(facts.phrase.display)} means ${quote(gloss)}.${kind}`,
      },
      hiddenBeforeAnswer: [],
      responseMode: 'typed-or-self',
      eligibility,
      builtFrom: { facts: [`unit:${facts.unit.unitId}`, 'phrase-gloss'], sentenceSource: occ.example.source },
      variant: 'typed',
      context: contextOf(occ),
    }),
  };
}

export const phraseComprehension = defineBuilder('phrase-comprehension', plan);
