/**
 * Fakes for the shared GoListen subsystem (packages/golisten): a speechSynthesis with voices of various languages,
 * an AudioPort, a fetch that stands in for server/speechHandler.ts, and an object-URL port. Test-only.
 */
import type { AudioClip, AudioPort, FetchLike, FetchResponseLike, ObjectUrlPort, SpeechLike, SpeechUtteranceLike, SpeechVoiceLike } from '../../packages/golisten/src';

export const voice = (name: string, lang: string, extra: Partial<SpeechVoiceLike> = {}): SpeechVoiceLike => ({ name, lang, voiceURI: name, localService: true, ...extra });

export const EN = voice('Fake English', 'en-US', { default: true });
export const ES = voice('Fake Spanish', 'es-ES');
export const SQ_AL = voice('Fake Albanian AL', 'sq-AL');
export const SQ = voice('Fake Albanian', 'sq');
export const SQ_NET = voice('Cloud Albanian', 'sq-AL', { localService: false });

export interface FakeSpeech extends SpeechLike {
  spoken: SpeechUtteranceLike[];
  cancels: number;
  pauses: number;
  resumes: number;
  /** The utterance most recently spoken ends naturally. */
  finish(): void;
  /** The utterance most recently spoken fails. */
  breakIt(error?: string): void;
}

export function fakeSpeech(voices: SpeechVoiceLike[]): FakeSpeech {
  const s: FakeSpeech = {
    spoken: [], cancels: 0, pauses: 0, resumes: 0,
    getVoices: () => voices,
    speak(u) { s.spoken.push(u); },
    cancel() {
      s.cancels += 1;
      const last = s.spoken[s.spoken.length - 1];
      last?.onerror?.({ error: 'canceled' }); // browsers report a cancelled utterance as an error event
    },
    pause() { s.pauses += 1; },
    resume() { s.resumes += 1; },
    finish() { s.spoken[s.spoken.length - 1]?.onend?.(); },
    breakIt(error = 'synthesis-failed') { s.spoken[s.spoken.length - 1]?.onerror?.({ error }); },
  };
  return s;
}

export const fakeUtterance = (text: string): SpeechUtteranceLike => ({ text, lang: '', rate: 1, voice: null, onend: null, onerror: null });

export interface FakeClip extends AudioClip {
  url: string;
  plays: number;
  stops: number;
  rate: number;
  released: boolean;
  finish(): void;
  breakIt(): void;
}

export interface FakeAudio extends AudioPort { opened: string[]; clips: FakeClip[]; rejectPlay: boolean }

export function fakeAudio(durationMs?: number): FakeAudio {
  const port: FakeAudio = {
    opened: [], clips: [], rejectPlay: false,
    open(url) {
      port.opened.push(url);
      let ended: () => void = () => undefined;
      let errored: (m?: string) => void = () => undefined;
      const clip: FakeClip = {
        url, plays: 0, stops: 0, rate: 1, released: false,
        play: () => { clip.plays += 1; return port.rejectPlay ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); },
        pause: () => undefined,
        stop: () => { clip.stops += 1; },
        setRate: (r) => { clip.rate = r; },
        onEnded: (cb) => { ended = cb; },
        onError: (cb) => { errored = cb; },
        durationMs: () => durationMs,
        release: () => { clip.released = true; },
        finish: () => ended(),
        breakIt: () => errored('decode'),
      };
      port.clips.push(clip);
      return clip;
    },
  };
  return port;
}

export interface FakeObjectUrls extends ObjectUrlPort { created: number; revoked: string[] }
export function fakeObjectUrls(): FakeObjectUrls {
  const o: FakeObjectUrls = { created: 0, revoked: [], create: () => `blob:fake/${++o.created}`, revoke: (u) => { o.revoked.push(u); } };
  return o;
}

export interface Call { url: string; init?: Parameters<FetchLike>[1] }
export interface FakeFetch { fetch: FetchLike; calls: Call[] }

export const jsonResponse = (status: number, body: unknown): FetchResponseLike => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body, blob: async () => new Blob([JSON.stringify(body)], { type: 'application/json' }),
});
export const wavResponse = (bytes = 64): FetchResponseLike => ({
  ok: true, status: 200, headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'audio/wav' : null) },
  json: async () => { throw new Error('not json'); }, blob: async () => new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }),
});

/** A stand-in for the speech proxy. `route` returns the response for a request, or throws to simulate a network failure. */
export function fakeFetch(route: (url: string, init?: Call['init']) => FetchResponseLike | Promise<FetchResponseLike>): FakeFetch {
  const calls: Call[] = [];
  return { calls, fetch: async (url, init) => { calls.push({ url, init }); return route(url, init); } };
}

/** The proxy with a key configured and the Albanian voices on offer. */
export const configuredProxy = (): FakeFetch => fakeFetch((url) => {
  if (url.endsWith('/status')) return jsonResponse(200, { configured: true, provider: 'azure-speech', providerVersion: 'azure-proxy@1', region: 'westeurope', format: 'riff-24khz-16bit-mono-pcm', maxChars: 5000 });
  if (url.includes('/voices')) return jsonResponse(200, { voices: [{ id: 'sq-AL-AnilaNeural', name: 'Azure sq-AL-AnilaNeural', lang: 'sq', locale: 'sq-AL', gender: 'female' }, { id: 'sq-AL-IlirNeural', name: 'Azure sq-AL-IlirNeural', lang: 'sq', locale: 'sq-AL', gender: 'male' }] });
  if (url.endsWith('/synthesize')) return wavResponse();
  return jsonResponse(404, { error: 'not-found', message: 'Unknown path.' });
});

/** The proxy with no key on the server. */
export const unconfiguredProxy = (): FakeFetch => fakeFetch((url) => {
  if (url.endsWith('/status')) return jsonResponse(200, { configured: false, provider: 'azure-speech', providerVersion: 'azure-proxy@1', format: 'riff-24khz-16bit-mono-pcm', maxChars: 5000 });
  return jsonResponse(401, { error: 'missing-credentials', message: 'Speech is not configured on the server.' });
});

export const FIXED_NOW = () => 1_000;
