/**
 * The resolved environment every provider runs in, plus the strict language matching rule for device voices.
 */
import type { AudioPort, ConsentState, FetchLike, ObjectUrlPort, SpeechLike, SpeechUtteranceLike, SpeechVoiceLike } from './ports';

export interface GoListenEnv {
  consent: () => ConsentState;
  speech?: SpeechLike;
  audio?: AudioPort;
  fetch?: FetchLike;
  objectUrl?: ObjectUrlPort;
  utterance: (text: string) => SpeechUtteranceLike;
  /** Base of the same-origin speech proxy, e.g. '/api/speech' (server/speechHandler.ts). */
  proxyBase: string;
  now: () => number;
  /** How long to wait for the browser to populate its voice list the first time (Chrome returns [] at first). */
  voiceWaitMs: number;
  /** Short-lived cache for proxy status lookups. */
  cache: Map<string, { at: number; value: unknown }>;
}

export const normalizeTag = (tag: string): string => tag.replace(/_/g, '-').toLowerCase();

/**
 * STRICT match: the voice's language tag must equal one of the accepted tags (case and `_`/`-` insensitive). "sq" and
 * "sq-AL" accept a Kosovo or Macedonian variety only if the registry lists it; an English voice never matches Albanian,
 * and a voice is never substituted because it is "close" or merely the device default.
 */
export function langMatches(voiceLang: string | undefined, accepted: readonly string[]): boolean {
  if (!voiceLang) return false;
  const v = normalizeTag(voiceLang);
  return accepted.some((t) => normalizeTag(t) === v);
}

/** Position of the voice's tag in the accepted list (earlier = more wanted). */
export function tagRank(voiceLang: string, accepted: readonly string[]): number {
  const v = normalizeTag(voiceLang);
  return accepted.findIndex((t) => normalizeTag(t) === v);
}

/** The device's voices; waits briefly for the first `voiceschanged` when the list starts empty. Never throws. */
export async function getDeviceVoices(env: Pick<GoListenEnv, 'speech' | 'voiceWaitMs'>): Promise<SpeechVoiceLike[]> {
  const speech = env.speech;
  if (!speech) return [];
  const read = (): SpeechVoiceLike[] => { try { return [...speech.getVoices()]; } catch { return []; } };
  const first = read();
  if (first.length > 0 || !speech.addEventListener || env.voiceWaitMs <= 0) return first;
  return new Promise<SpeechVoiceLike[]>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { speech.removeEventListener?.('voiceschanged', finish); } catch { /* gone */ }
      resolve(read());
    };
    const timer = setTimeout(finish, env.voiceWaitMs);
    speech.addEventListener?.('voiceschanged', finish);
  });
}

export const deviceVoiceId = (v: SpeechVoiceLike): string => `device:${v.voiceURI || v.name}`;

export const normalizeText = (s: string): string =>
  s.normalize('NFC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
