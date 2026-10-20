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

/** Maps pack-level variety ids to concrete speech locales. Gheg has no approved V1 voice. */
export function speechVarietyLocale(languageId: string, varietyId: string | undefined): string | undefined {
  if (!varietyId) return undefined;
  const v = normalizeTag(varietyId);
  if (v.includes('gheg')) return '__unsupported_gheg__';
  const map: Record<string, string> = { 'sq-standard': 'sq-al', 'hi-standard': 'hi-in', 'th-standard': 'th-th', nb: 'nb-no', nn: 'nn-no', 'he-mod': 'he-il', 'el-mod': 'el-gr', 'la-ecclesiastical': 'it-it', 'la-classical': 'it-it' };
  // Ancient and historical periods fall back to the Modern voice (the packs say so); they are not refused like Gheg.
  for (const id of ['he-bib', 'he-mish', 'he-med', 'arc-bib']) map[id] = 'he-il';
  for (const id of ['el-koi', 'el-att', 'el-hom', 'el-med']) map[id] = 'el-gr';
  // Latin: both varieties play through the registered Italian stand-in (deviceTags.ts LATIN_DEVICE_TAGS); a real Latin voice is taken when the device has one
  return map[v] ?? map[`${languageId}-${v}`] ?? v;
}

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
