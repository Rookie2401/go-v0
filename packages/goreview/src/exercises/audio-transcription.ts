/**
 * audio-transcription: the learner hears a word (audio first) and types it as it is written.
 *
 * Requires: a lexeme or form unit that is not conflicted or invalidated (provisional is allowed, with a caveat) and an
 * AssessmentSource stimulus. The response is the typed form; the accepted answer is the word that was spoken. Loose
 * normalisation: the right letters without ë / ç are a `partial`, never `correct` (ë vs e and ç vs c are exactly the
 * distinctions a listening exercise is for). The linking article is NOT optional here: the learner heard it.
 * The written form is hidden before the response (`hiddenBeforeAnswer`).
 */
import { defineAudioBuilder } from './audio-common';
import { assemble, eligibilityOf, exerciseIdOf, precheck, quote, referenceGloss, refuse } from './shared';
import type { Planned } from './shared';
import type { BuildContext, ReviewTarget, UnitFacts } from '../types';

function plan(target: ReviewTarget, facts: UnitFacts, _ctx: BuildContext): Planned {
  const why = precheck({ family: 'audio-transcription', dimension: 'auditory-transcription' }, target, facts, ['lexeme', 'form']);
  if (why) return refuse(why);
  const eligibility = eligibilityOf('audio-transcription', facts);
  if (!eligibility.eligible) return refuse(eligibility.reason);
  const text = facts.unit.kind === 'form' ? facts.unit.label : facts.lemma ?? facts.unit.label;
  if (!text.trim()) return refuse('there is no written form to transcribe');
  const gloss = referenceGloss(facts);
  return {
    ok: true,
    exercise: assemble({
      exerciseId: exerciseIdOf('audio-transcription', facts.unit.unitId, text),
      family: 'audio-transcription',
      target: { ...target },
      prompt: { instruction: 'Listen to the word, then type it as it is written.', stimulusText: text },
      answerKey: {
        accepted: [text], normalization: 'loose', articles: [],
        explanation: `The word was ${quote(text)}${gloss ? ` (${gloss})` : ''}. Check ë and ç: they are letters of their own.`,
      },
      hiddenBeforeAnswer: ['stimulusText'],
      responseMode: 'typed',
      eligibility,
      builtFrom: { facts: [`unit:${facts.unit.unitId}`] },
      variant: 'typed',
    }),
  };
}

export const audioTranscription = defineAudioBuilder('audio-transcription', plan);
