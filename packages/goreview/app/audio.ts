/**
 * Audio for listening exercises, from GoListen. GoReview asks two things of it: is the language audible at all (and
 * could that audio ever be listening evidence?), and the assessment source that prepares stimuli. Synthetic speech is
 * practice: it is available but never evidence (GoListen's evidence-direction rule), and the answer says so.
 */
import { createGoListen, defaultRegistries, isAssessmentQualified, type GoListenOptions } from '../../golisten/src';
import type { AudioAvailability } from '../src/types';
import type { AudioDeps } from './ports';
import { createPracticeSpeechFetch, type PracticeExtensionRuntime } from './speechBridge';
import { createAccountSpeechFetch } from './speechBridge';

export function createAudioDeps(opts: { consent: () => boolean; accountToken?: () => Promise<string | undefined>; extensionRuntime?: PracticeExtensionRuntime; extensionUrl?: string } & Partial<Omit<GoListenOptions, 'registries' | 'consent'>> & { registries?: GoListenOptions['registries'] }): AudioDeps {
  const fetcher = opts.extensionRuntime
    ? createPracticeSpeechFetch(opts.extensionRuntime, opts.extensionUrl)
    : opts.speechProxyBase
      ? createAccountSpeechFetch(opts.fetch ?? globalThis.fetch.bind(globalThis), opts.speechProxyBase, opts.accountToken ?? (async () => undefined), opts.consent)
      : opts.fetch;
  const listen = createGoListen({
    ...opts,
    ...(fetcher ? { fetch: fetcher } : {}),
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
      const voiceStates = await Promise.all(voices.map((v) => v.availability()));
      // only a voice that can say any word counts: a recording of one fixed phrase (GoListen's German demonstration asset)
      // made German "available" on a device with no German voice, and every German card then failed to speak (2026-10-28)
      const speaking: typeof voices = [];
      for (const [i, v] of voices.entries()) if (v.supports.includes('word') && voiceStates[i] === 'available') speaking.push(v);
      if (!speaking.length) {
        const reason = voiceStates.includes('needs-sign-in') ? 'Sign in on this device to use the remote speech voice.'
          : voiceStates.includes('needs-key') ? 'The speech service has no Azure voice key configured.'
            : voiceStates.includes('needs-consent') ? 'No local voice is available; allow remote speech in Privacy settings to use the remote voice.'
              : a.gaps.find((gap) => /no .* voice|no .* recordings/i.test(gap)) ?? `no voice can speak ${languageId} on this device right now`;
        return { available: false, eligibleForEvidence: false, reason };
      }
      const evidence = speaking.some(isAssessmentQualified);
      return evidence
        ? { available: true, eligibleForEvidence: true, reason: 'a reviewed human recording is available' }
        : { available: true, eligibleForEvidence: false, reason: 'only synthetic or unreviewed speech is available: listening practice, never listening evidence' };
    },
  };
}
