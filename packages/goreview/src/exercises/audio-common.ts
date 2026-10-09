/**
 * What the two audio families share: asking GoListen's assessment source for a stimulus and attaching it.
 *
 * The evidence-direction rule (golisten/contracts.ts) decides what an audio exercise can count for: a synthetic voice makes a
 * perfectly good PRACTICE exercise and never listening evidence. So an exercise is built whenever any stimulus is available,
 * and the stimulus's own `validity` decides, later, whether the result can claim evidence (exercises/evidence.ts). The written
 * form is the answer; it is listed in `hiddenBeforeAnswer` and the UI must not render it (nor a device voice's `audio.text`,
 * nor the voice's label, which can name a source file) before the response.
 */
import type { AssessmentSource, AudioStimulus } from '../../../golisten/src/contracts';
import type { BuildContext, Exercise, ExerciseBuilder, ReviewTarget, UnitFacts } from '../types';
import { defineBuilder, seal } from './builders';
import type { PlanFn } from './builders';
import { unavailable } from './shared';
import type { ReviewExercise } from './shared';

export const NO_SOURCE = 'no listening assessment source is available (GoListen is not configured for this language or device)';

export async function attachStimulus(
  base: ReviewExercise, text: string, target: ReviewTarget, audio: AssessmentSource,
): Promise<ReviewExercise | { unavailable: true; reason: string }> {
  let stimulus: AudioStimulus | { unavailable: true; reason: string };
  try {
    stimulus = await audio.prepareStimulus({
      languageId: target.languageId, ...(target.varietyId ? { varietyId: target.varietyId } : {}), kind: 'word', text, itemIds: [target.unitId],
    });
  } catch (e) {
    return unavailable(`the listening stimulus could not be prepared (${e instanceof Error ? e.message : 'error'})`);
  }
  if ('unavailable' in stimulus) return unavailable(`no listening stimulus: ${stimulus.reason}`);
  if (stimulus.answerHidden !== true) return unavailable('the listening stimulus does not hide its answer');
  if (stimulus.languageId !== target.languageId) return unavailable('the listening stimulus is for another language');
  const eligibility = base.eligibility.eligible
    ? {
      ...base.eligibility,
      caveats: stimulus.validity.eligibleForEvidence
        ? base.eligibility.caveats
        : [...base.eligibility.caveats, `practice only: ${stimulus.validity.reason}`],
    }
    : base.eligibility;
  return { ...base, prompt: { ...base.prompt, audio: stimulus }, eligibility };
}

/** An audio builder: the shared plan, then the stimulus at build time. */
export function defineAudioBuilder(family: 'audio-to-meaning' | 'audio-transcription', plan: PlanFn): ExerciseBuilder {
  const base = defineBuilder(family, plan, { needsAudio: true });
  return {
    ...base,
    async build(target: ReviewTarget, facts: UnitFacts, ctx: BuildContext): Promise<Exercise | { unavailable: true; reason: string }> {
      if (!ctx.audio) return unavailable(NO_SOURCE);
      let planned;
      try { planned = plan(target, facts, ctx); } catch (e) { return unavailable(`the builder failed unexpectedly (${e instanceof Error ? e.message : String(e)})`); }
      if (!planned.ok) return unavailable(planned.reason);
      const text = planned.exercise.prompt.stimulusText as string;
      const withAudio = await attachStimulus(planned.exercise, text, target, ctx.audio);
      if ('unavailable' in withAudio) return withAudio;
      return seal(withAudio);
    },
  };
}
