/**
 * Audio for listening exercises, from GoListen. GoPractice asks two things of it: is the language audible at all (and
 * could that audio ever be listening evidence?), and the assessment source that prepares stimuli. Synthetic speech is
 * practice: it is available but never evidence (GoListen's evidence-direction rule), and the answer says so.
 */
import { createGoListen, defaultRegistries, type GoListenOptions } from '../golisten/src';
import type { AudioAvailability } from '../goreview/src/types';
import type { AudioDeps } from './ports';

export function createAudioDeps(opts: { consent: () => boolean } & Partial<Omit<GoListenOptions, 'registries' | 'consent'>> & { registries?: GoListenOptions['registries'] }): AudioDeps {
  const listen = createGoListen({
    ...opts,
    registries: opts.registries ?? defaultRegistries(),
    consent: () => ({ remoteSpeech: opts.consent() }),
  });
  const source = listen.assessment();
  return {
    source: () => source,
    playbackOf: (stimulus) => source.playbackOf(stimulus),
    async availability(languageId): Promise<AudioAvailability> {
      const a = await listen.availability(languageId);
      if (!a.canPronounce) {
        return { available: false, eligibleForEvidence: false, reason: a.gaps[0] ?? `no voice can speak ${languageId} on this device right now` };
      }
      const voices = await listen.voices(languageId);
      let evidence = false;
      for (const v of voices) {
        if (v.synthetic || !v.suitableForAssessment) continue;
        if ((await v.availability()) === 'available') { evidence = true; break; }
      }
      return evidence
        ? { available: true, eligibleForEvidence: true, reason: 'a reviewed human recording is available' }
        : { available: true, eligibleForEvidence: false, reason: 'only synthetic or unreviewed speech is available: listening practice, never listening evidence' };
    },
  };
}
