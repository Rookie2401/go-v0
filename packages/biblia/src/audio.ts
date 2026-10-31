import { createGoListen, defaultRegistries } from '../../golisten/src';
import type { FetchLike, FetchResponseLike, SpeechLike, SpeechUtteranceLike } from '../../golisten/src/ports';
import type { Pronouncer, PlayResult, PronounceAvailability } from '../../golearn-extension/src/popup/view';

export interface BibliaSpeechAccount { serviceUrl: string; token: string; learnerId: string }

/** GoListen for Biblia's single-word cards. The account token is fetched for every call and only sent to this exact service route. */
export function createBibliaPronouncer(opts: {
  speech: SpeechLike | null;
  account: () => Promise<BibliaSpeechAccount | undefined>;
  consent: () => boolean;
  consentOwner: () => string | undefined;
  fetch?: typeof fetch;
}): Pronouncer {
  const asResponse = (status: number, error: string, message: string): FetchResponseLike => {
    const body = { error, message };
    return { ok: false, status, headers: { get: () => 'application/json' }, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
  };
  const fetcher: FetchLike = async (url, init) => {
    if (!opts.consent()) return asResponse(403, 'consent-required', 'Remote speech consent is off.');
    let account: BibliaSpeechAccount | undefined;
    try { account = await opts.account(); } catch { account = undefined; }
    if (!account?.token || !account.serviceUrl) return asResponse(401, 'unauthorized', 'Sign in to use remote speech.');
    if (!opts.consentOwner() || opts.consentOwner() !== account.learnerId) return asResponse(403, 'remote-speech-consent-required', 'Remote speech consent does not belong to the currently signed-in account.');
    let base: URL, target: URL;
    try {
      base = new URL(`${account.serviceUrl.replace(/\/+$/, '')}/api/speech`);
      target = new URL(url, base);
    } catch { return asResponse(503, 'speech-unavailable', 'The speech service address is unavailable.'); }
    const rel = target.pathname.slice(base.pathname.length + 1);
    const queryOk = rel === 'voices'
      ? [...target.searchParams.keys()].every((key) => key === 'lang') && target.searchParams.getAll('lang').length === 1 && /^[a-z]{2,3}$/.test(target.searchParams.get('lang') ?? '')
      : target.search === '';
    if (target.origin !== base.origin || !['status', 'voices', 'synthesize'].includes(rel) || target.pathname !== `${base.pathname}/${rel}` || !queryOk || target.hash) {
      return asResponse(400, 'invalid-endpoint', 'Invalid speech endpoint.');
    }
    const method = init?.method ?? (rel === 'synthesize' ? 'POST' : 'GET');
    if (rel === 'synthesize' ? method !== 'POST' : method !== 'GET') return asResponse(405, 'invalid-method', 'Invalid speech method.');
    const headers = { ...(init?.headers ?? {}), Authorization: `Bearer ${account.token}` };
    try {
      return await (opts.fetch ?? globalThis.fetch.bind(globalThis))(target.href, { ...init, method, headers, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    } catch { return asResponse(503, 'speech-unavailable', 'The speech service could not be reached.'); }
  };
  const speech = opts.speech ?? undefined;
  const utterance = (text: string): SpeechUtteranceLike => {
    const C = (globalThis as { SpeechSynthesisUtterance?: new (value: string) => SpeechUtteranceLike }).SpeechSynthesisUtterance;
    if (!C) throw new Error('Speech synthesis is unavailable.');
    return new C(text);
  };
  const listen = createGoListen({ registries: defaultRegistries(), speech, fetch: fetcher,
    consent: () => ({ remoteSpeech: opts.consent() }), utterance });
  let playback: { play(): void; stop(): void; dispose(): void; setRate(rate: number): void; onState?(cb: (s: 'idle' | 'playing' | 'paused' | 'ended' | 'error') => void): () => void } | undefined;
  const listeners = new Set<(s: 'idle' | 'playing' | 'paused' | 'ended' | 'error') => void>();
  let off: (() => void) | undefined;
  let rate = 1;
  return {
    async availability(languageId): Promise<PronounceAvailability> {
      const a = await listen.availability(languageId);
      return { available: a.canPronounce, note: a.canPronounce ? 'A matching device or remote speech voice is available.' : a.gaps.join(' ') || `No voice is available for ${languageId}.` };
    },
    async play(text, languageId, context): Promise<PlayResult> {
      playback?.dispose(); playback = undefined; off?.(); off = undefined;
      const result = await listen.pronounce({ languageId, varietyId: context?.varietyId, text, kind: context?.kind ?? 'word', processingPermission: 'allowed' });
      if (!result.ok) return { ok: false, message: result.message };
      playback = result.playback;
      playback.setRate(rate);
      off = playback.onState?.((state) => { for (const listener of [...listeners]) listener(state); });
      playback.play();
      return { ok: true, voice: 'synthetic', voiceId: result.voice.voiceId };
    },
    stop() { off?.(); off = undefined; playback?.stop(); playback?.dispose(); playback = undefined; for (const listener of [...listeners]) listener('idle'); },
    setRate(value) { rate = Math.min(1.5, Math.max(0.5, value)); playback?.setRate(rate); },
    onPlaybackState(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    onChange(cb) { speech?.addEventListener?.('voiceschanged', cb); return () => speech?.removeEventListener?.('voiceschanged', cb); },
  };
}
