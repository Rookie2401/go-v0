/**
 * audio-to-meaning: the learner hears a word (audio first, no written form on screen) and gives its meaning.
 *
 * Requires: a lexeme or form unit that is not conflicted or invalidated (provisional is allowed, with a caveat), a gloss,
 * and an AssessmentSource that can prepare a stimulus for the word. No source, or a source that says `unavailable`, makes the
 * exercise `unavailable` with that reason. A synthetic or unreviewed voice still yields an exercise (listening practice) but
 * carries the caveat "practice only" and its result claims no evidence.
 * The written form is in `prompt.stimulusText` and in `hiddenBeforeAnswer`; it is shown only after the response.
 */
import { reviewFacts } from '../facts/review-facts';
import { normalizeAnswer } from '../grading/normalize';
import { defineAudioBuilder } from './audio-common';
import { assemble, acceptedMeanings, attributionLine, eligibilityOf, exerciseIdOf, glossSplit, precheck, quote, referenceGloss, refuse } from './shared';
import type { Planned } from './shared';
import type { BuildContext, ReviewTarget, UnitFacts } from '../types';

function plan(target: ReviewTarget, facts: UnitFacts, _ctx: BuildContext): Planned {
  const f = reviewFacts(facts);
  const why = precheck({ family: 'audio-to-meaning', dimension: 'auditory-recognition' }, target, facts, ['lexeme', 'form']);
  if (why) return refuse(why);
  const eligibility = eligibilityOf('audio-to-meaning', facts);
  if (!eligibility.eligible) return refuse(eligibility.reason);
  const reference = referenceGloss(facts);
  const accepted = acceptedMeanings(facts);
  if (!reference || accepted.length === 0) return refuse('no gloss in the word list or the dictionary, so there is nothing to check a meaning against');
  const text = facts.unit.kind === 'form' ? facts.unit.label : facts.lemma ?? facts.unit.label;
  const alternatives = (f.alternativeReadings ?? []).flatMap((r) => r.glosses.map((g) => ({ answer: g, sense: `${r.lemma}${r.pos ? ` (${r.pos})` : ''}` })))
    .filter((a) => !accepted.some((x) => normalizeAnswer(x, 'loose') === normalizeAnswer(a.answer, 'loose')));
  return {
    ok: true,
    exercise: assemble({
      exerciseId: exerciseIdOf('audio-to-meaning', facts.unit.unitId, reference),
      family: 'audio-to-meaning',
      target: { ...target },
      prompt: { instruction: 'Listen to the word, then type what it means in English.', stimulusText: text },
      answerKey: {
        accepted, normalization: 'loose', openEnded: true, articles: ['to', 'a', 'an', 'the'],
        explanation: `The word was ${quote(text)}: it means ${quote(reference)}.${attributionLine(facts, [reference])}`,
        ...(alternatives.length ? { alternatives } : {}),
      },
      hiddenBeforeAnswer: ['stimulusText'],
      responseMode: 'typed-or-self',
      eligibility,
      builtFrom: { facts: [`unit:${facts.unit.unitId}`, glossSplit(facts).lexicon.length ? 'gloss:word-list' : 'gloss:dictionary'] },
      variant: 'typed',
    }),
  };
}

export const audioToMeaning = defineAudioBuilder('audio-to-meaning', plan);
