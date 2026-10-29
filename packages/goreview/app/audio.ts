/**
 * Audio for listening exercises, from GoListen. GoReview asks two things of it: is the language audible at all (and
 * could that audio ever be listening evidence?), and the assessment source that prepares stimuli. Synthetic speech is
 * practice: it is available but never evidence (GoListen's evidence-direction rule), and the answer says so.
 */
import { createGoListen, defaultRegistries, isAssessmentQualified, type GoListenOptions } from '../../golisten/src';
import type { AudioAvailability } from '../src/types';
import type { AudioDeps } from './ports';
import { createPracticeSpeechFetch, type PracticeExtensionRuntime } from './speechBridge';

export function createAudioDeps(opts: { consent: () => boolean; extensionRuntime?: PracticeExtensionRuntime; extensionUrl?: string } & Partial<Omit<GoListenOptions, 'registries' | 'consent'>> & { registries?: GoListenOptions['registries'] }): AudioDeps {
  const listen = createGoListen({
    ...opts,
    ...(opts.extensionRuntime ? { fetch: createPracticeSpeechFetch(opts.extensionRuntime, opts.extensionUrl) } : {}),
    registries: opts.registries ?? defaultRegistries(),
    consent: () => ({ remoteSpeech: opts.consent() }),
  });
  const source = listen.assessment();
  return {
    source: () => source,
    playbackOf: (stimulus) => source.playbackOf(stimulus),
    pronounce: (request) => listen.pronounce(request),
    async availability(languageId): Promise<AudioAvailability> {
      const a = await listen.availability(languageId);
      const voices = await listen.voices(languageId);
      // only a voice that can say any word counts: a recording of one fixed phrase (GoListen's German demonstration asset)
      // made German "available" on a device with no German voice, and every German card then failed to speak (2026-10-28)
      const speaking: typeof voices = [];
      for (const v of voices) if (v.supports.includes('word') && (await v.availability()) === 'available') speaking.push(v);
      if (!speaking.length) {
        return { available: false, eligibleForEvidence: false, reason: (a.canPronounce ? undefined : a.gaps[0]) ?? `no voice can speak ${languageId} on this device right now` };
      }
      const evidence = speaking.some(isAssessmentQualified);
      return evidence
        ? { available: true, eligibleForEvidence: true, reason: 'a reviewed human recording is available' }
        : { available: true, eligibleForEvidence: false, reason: 'only synthetic or unreviewed speech is available: listening practice, never listening evidence' };
    },
  };
}
