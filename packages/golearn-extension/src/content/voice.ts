/**
 * Pronunciation in the page, through GoListen's DEVICE provider only.
 *
 * The content script has no network, so it uses the strict device-voice rules of GoListen (a voice is used only when its
 * language tag is one the registry accepts; an English voice is never "close enough"; a voice that is not local needs
 * the learner's remote-speech consent) and nothing else. Recorded and remote voices are not played inside web pages by
 * this version; GoListen's top-level `createGoListen` is not imported because it carries the remote provider's network
 * code, which must not be in the content bundle (test/extension/bundle.test.ts).
 *
 * Synthetic speech is practice and exposure: it is reported as `PronunciationPlayed`, never as listening evidence.
 */
import type { PlaybackHandle } from '../../../golisten/src/contracts';
import type { GoListenEnv } from '../../../golisten/src/environment';
import type { SpeechLike as GoSpeech, SpeechUtteranceLike } from '../../../golisten/src/ports';
import { createPlayback } from '../../../golisten/src/playback';
import { DEVICE_PRACTICE_NOTE, deviceDriver, findNativeVoice, prepareDevice } from '../../../golisten/src/providers/device';
import { albanianRegistry, deviceRegistry, type VoiceRegistry } from '../../../golisten/src/registry';
import { languageNameOf } from '../protocol';
import type { PlayResult, PronounceAvailability, Pronouncer } from '../popup/view';

export interface DevicePronouncerOptions {
  /** `window.speechSynthesis`, or null when there is none. */
  speech: GoSpeech | null;
  /** Whether the learner has consented to a voice that sends text to the browser vendor (read each time it is used). */
  remoteConsent?: () => boolean;
  utterance?: (text: string) => SpeechUtteranceLike;
  now?: () => number;
  voiceWaitMs?: number;
}

import { DEVICE_TAGS } from './voiceTags';
export { DEVICE_TAGS, hasDeviceVoice } from './voiceTags';

function registryFor(languageId: string): VoiceRegistry {
  return languageId === 'sq' ? albanianRegistry() : deviceRegistry(languageId, [...(DEVICE_TAGS[languageId] ?? [languageId])], languageNameOf(languageId));
}

export function createDevicePronouncer(opts: DevicePronouncerOptions): Pronouncer {
  const makeUtterance = opts.utterance ?? ((text: string): SpeechUtteranceLike => {
    const C = (globalThis as { SpeechSynthesisUtterance?: new (t: string) => SpeechUtteranceLike }).SpeechSynthesisUtterance;
    if (!C) throw new Error('speech synthesis utterances are not available');
    return new C(text);
  });
  const env: GoListenEnv = {
    consent: () => ({ remoteSpeech: opts.remoteConsent?.() === true }),
    speech: opts.speech ?? undefined,
    utterance: makeUtterance,
    proxyBase: '',
    now: opts.now ?? (() => Date.now()),
    voiceWaitMs: opts.voiceWaitMs ?? 300,
    cache: new Map(),
  };
  const registries = new Map<string, VoiceRegistry>();
  const registry = (lang: string): VoiceRegistry => { let r = registries.get(lang); if (!r) { r = registryFor(lang); registries.set(lang, r); } return r; };
  let current: PlaybackHandle | undefined;

  const stop = (): void => { try { current?.dispose(); } catch { /* already gone */ } current = undefined; };

  return {
    async availability(lang): Promise<PronounceAvailability> {
      if (!env.speech) return { available: false, note: 'Speech is not available in this browser.' };
      const out = await prepareDevice({ languageId: lang, text: 'x', kind: 'word' }, registry(lang), env);
      if (!out.ok) return { available: false, note: out.message };
      return { available: true, note: `${DEVICE_PRACTICE_NOTE} Nothing is sent anywhere${out.prepared.voice.execution === 'remote' ? ' by GoLearn (this browser voice is not local; you allowed it)' : ''}.` };
    },

    async play(text, lang): Promise<PlayResult> {
      if (!env.speech) return { ok: false, message: 'Speech is not available in this browser.' };
      const out = await prepareDevice({ languageId: lang, text, kind: 'word' }, registry(lang), env);
      if (!out.ok) return { ok: false, message: out.message };
      const p = out.prepared;
      const native = findNativeVoice(env, registry(lang), p.voice.voiceId);
      if (!native || p.audio.kind !== 'device') return { ok: false, message: 'The voice is no longer available.' };
      stop();
      const handle = createPlayback(deviceDriver(env, native, p.audio.text), { now: env.now });
      current = handle;
      handle.play();
      if (handle.state === 'error') { stop(); return { ok: false, message: 'The device could not play that.' }; }
      return { ok: true, voice: 'synthetic', voiceId: p.voice.voiceId };
    },

    stop,

    onChange(cb) {
      const s = opts.speech;
      if (!s?.addEventListener) return () => {};
      s.addEventListener('voiceschanged', cb);
      return () => s.removeEventListener?.('voiceschanged', cb);
    },
  };
}
