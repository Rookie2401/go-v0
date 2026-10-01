/**
 * ProxySpeechProvider - Azure AI Speech through the SAME-ORIGIN server proxy (server/speechProxy.ts), behind `TtsProvider`.
 *
 * STATUS: implemented and tested against a MOCKED fetch only. Nothing here has ever talked to the live proxy backed by
 * the live Azure service, and no voice produced by it has been heard. See QA.md and docs/SPEECH.md.
 *
 * There is NO key in the browser on this path. The key lives in the server's environment (AZURE_SPEECH_KEY /
 * AZURE_SPEECH_REGION, `.env.local`); this class only ever sees `/api/speech/status` (configured yes/no + region) and
 * audio bytes. The proxy exists on the dev server (`npm run dev`) and the preview server (`npm run preview`), not on a
 * plain static host: there `availability()` is "no-provider".
 *
 *   GET  {base}/api/speech/status                -> { configured, provider, providerVersion, region?, ... }
 *   GET  {base}/api/speech/voices?lang=es        -> { voices: [...] }
 *   POST {base}/api/speech/synthesize            -> audio/wav (riff-24khz-16bit-mono-pcm)
 *
 * The provider version is TAKEN FROM THE STATUS RESPONSE (it changes cache keys and resets voice reviews). Call
 * `availability()` once before registering so the real version is known; until a status answer has been seen the
 * version is the placeholder PROXY_PROVIDER_VERSION_UNRESOLVED and `synthesize` refuses to run on it.
 */
import type { LanguageCode } from '../core/model';
import type { ProviderAvailability, ProviderCapabilities, SynthesisRequest, SynthesisResult, TtsProvider, Voice } from '../core/contracts/golisten';
import { AZURE_OUTPUT_FORMAT, AZURE_VOICES } from './azureProvider';
import { TtsProviderError } from './errors';
import { inspectWav } from './wav';

export const PROXY_PROVIDER_ID = 'speech-proxy';
export const PROXY_PROVIDER_VERSION_UNRESOLVED = 'azure-proxy@unresolved';
export const PROXY_STATUS_PATH = '/api/speech/status';
export const PROXY_ENGINE = 'azure-neural-tts';
/** The instruction shown when the server has no credentials. */
export const PROXY_SETUP_INSTRUCTION = 'Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.';

export interface ProxyStatus { configured: boolean; provider: string; providerVersion: string; region?: string; format?: string; maxChars?: number }

export interface ProxySpeechOptions {
  /** Origin + path prefix of the proxy. Default: '' (same origin). */
  baseUrl?: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout for synthesis (the server has its own, shorter, upstream timeout). Default 40000. */
  timeoutMs?: number;
}

function isStatus(v: unknown): v is ProxyStatus {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.configured === 'boolean' && typeof o.provider === 'string' && typeof o.providerVersion === 'string' && o.providerVersion.length > 0;
}

function parseRetryAfter(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  return Number.isFinite(secs) && secs >= 0 ? Math.round(secs * 1000) : undefined;
}

export class ProxySpeechProvider implements TtsProvider {
  readonly id = PROXY_PROVIDER_ID;
  readonly isSpeech = true;

  #version = PROXY_PROVIDER_VERSION_UNRESOLVED;
  #region: string | undefined;
  #authFailure: string | undefined;
  #inFlight: Promise<ProviderAvailability> | undefined;
  readonly #base: string;
  readonly #fetch: typeof fetch | undefined;
  readonly #timeoutMs: number;

  constructor(opts: ProxySpeechOptions = {}) {
    this.#base = (opts.baseUrl ?? '').replace(/\/+$/, '');
    this.#fetch = opts.fetch;
    this.#timeoutMs = opts.timeoutMs ?? 40_000;
  }

  /** Provider version as reported by the proxy's status endpoint (a placeholder until the first answer). */
  get version(): string { return this.#version; }
  /** Non-secret region the server is configured with (undefined until a configured status was seen). */
  get region(): string | undefined { return this.#region; }
  /** False until a status response has supplied the real provider version. */
  get versionResolved(): boolean { return this.#version !== PROXY_PROVIDER_VERSION_UNRESOLVED; }

  toJSON(): { id: string; version: string; region?: string } { return { id: this.id, version: this.version, region: this.#region }; }

  /** Forget a remembered 401 (e.g. the server was restarted with a corrected key); the next availability() asks again. */
  resetAuthFailure(): void { this.#authFailure = undefined; }

  #doFetch(): typeof fetch {
    const f = this.#fetch ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!f) throw new TtsProviderError('network', 'no fetch implementation is available');
    return f;
  }

  /** The status document, or a human reason it could not be had. Updates version and region as a side effect. */
  async status(): Promise<{ ok: true; status: ProxyStatus } | { ok: false; availability: ProviderAvailability }> {
    let res: Response;
    try {
      res = await this.#doFetch()(`${this.#base}${PROXY_STATUS_PATH}`, { method: 'GET', headers: { accept: 'application/json' } });
    } catch (e) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, availability: { available: false, reason: 'offline', detail: 'the device reports no network connection' } };
      return { ok: false, availability: { available: false, reason: 'provider-error', detail: `the speech proxy could not be reached (${e instanceof Error ? e.message : String(e)}); is the dev or preview server running?` } };
    }
    if (res.status >= 500) return { ok: false, availability: { available: false, reason: 'provider-error', detail: `the speech proxy answered HTTP ${res.status}` } };
    let doc: unknown;
    try { doc = res.ok ? await res.json() : undefined; } catch { doc = undefined; }
    if (!res.ok || !isStatus(doc)) {
      // 404, or a static host that serves index.html for every path: there is no proxy here.
      return { ok: false, availability: { available: false, reason: 'no-provider', detail: 'no speech proxy at this address (it exists only on the dev / preview server); use a direct Azure key under Advanced, or read without audio' } };
    }
    this.#version = doc.providerVersion;
    this.#region = doc.configured ? doc.region : undefined;
    return { ok: true, status: doc };
  }

  availability(): Promise<ProviderAvailability> {
    // Concurrent probes (status for several texts, job runner) share one request.
    this.#inFlight ??= this.#probe().finally(() => { this.#inFlight = undefined; });
    return this.#inFlight;
  }

  async #probe(): Promise<ProviderAvailability> {
    const s = await this.status();
    if (!s.ok) return s.availability;
    if (!s.status.configured) return { available: false, reason: 'missing-credentials', detail: PROXY_SETUP_INSTRUCTION };
    if (this.#authFailure) return { available: false, reason: 'missing-credentials', detail: this.#authFailure };
    return { available: true, detail: `Azure Speech through the same-origin proxy${s.status.region ? `, region ${s.status.region}` : ''} (configured; never verified against the live service by this repository)` };
  }

  capabilities(): ProviderCapabilities {
    // Same honesty as the direct adapter: audio only, no word marks, no phoneme claim.
    return { ssml: true, wordBoundaries: false, phonemeOverrides: false, streaming: false, maxChars: 5000, outputFormats: ['audio/wav'] };
  }

  /** Live voices from the proxy (Azure voices/list); the static table when the proxy cannot supply any. */
  async listVoices(lang: LanguageCode): Promise<Voice[]> {
    try {
      const res = await this.#doFetch()(`${this.#base}/api/speech/voices?lang=${encodeURIComponent(lang)}`, { method: 'GET', headers: { accept: 'application/json' } });
      if (res.ok) {
        const doc = (await res.json()) as { voices?: Array<Record<string, unknown>> };
        const voices = (doc.voices ?? [])
          .filter((v) => typeof v.id === 'string' && typeof v.locale === 'string')
          .map((v): Voice => ({ id: v.id as string, name: typeof v.name === 'string' ? v.name : `Azure ${v.id as string}`, lang, locale: v.locale as string, gender: v.gender === 'female' || v.gender === 'male' || v.gender === 'neutral' ? v.gender : undefined }));
        if (voices.length > 0) return voices;
      }
    } catch { /* fall through to the static table */ }
    return (AZURE_VOICES[lang] ?? []).map((v) => ({ id: v.id, name: `Azure ${v.id}`, lang, locale: v.locale, gender: v.gender }));
  }

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    if (this.#authFailure) throw new TtsProviderError('missing-credentials', this.#authFailure);
    if (req.format !== 'audio/wav') throw new TtsProviderError('bad-request', `the speech proxy only produces audio/wav (${AZURE_OUTPUT_FORMAT}), not ${req.format}`);
    if (req.text.length > this.capabilities().maxChars) throw new TtsProviderError('bad-request', 'text is longer than the provider limit');
    if (!this.versionResolved) throw new TtsProviderError('bad-request', 'the speech proxy has not reported its version yet; check availability() before synthesizing');

    const doFetch = this.#doFetch();
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), this.#timeoutMs) : undefined;
    let res: Response;
    try {
      res = await doFetch(`${this.#base}/api/speech/synthesize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'audio/wav' },
        body: JSON.stringify({ ...(req.ssml ? { ssml: req.ssml, text: req.text } : { text: req.text }), voice: req.voiceId, locale: req.locale, format: AZURE_OUTPUT_FORMAT }),
        signal: controller?.signal,
      });
    } catch (e) {
      throw new TtsProviderError('network', e instanceof Error ? e.message : String(e));
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      this.#authFailure = `the speech proxy has no working credentials (HTTP ${res.status}). ${PROXY_SETUP_INSTRUCTION}`;
      throw new TtsProviderError('missing-credentials', this.#authFailure, { status: res.status });
    }
    if (res.status === 429) throw new TtsProviderError('rate-limited', 'the speech service is rate limiting requests (HTTP 429)', { status: 429, retryAfterMs: parseRetryAfter(res.headers?.get?.('retry-after')) });
    if (res.status === 504) throw new TtsProviderError('network', `the speech proxy could not reach the speech service in time (${await this.#errorCode(res)})`, { status: 504 });
    if (res.status >= 500) throw new TtsProviderError('server', `the speech proxy or service reported a server error (HTTP ${res.status}: ${await this.#errorCode(res)})`, { status: res.status, retryAfterMs: parseRetryAfter(res.headers?.get?.('retry-after')) });
    if (res.status === 404 || res.status === 405) throw new TtsProviderError('bad-request', `no speech proxy at this address (HTTP ${res.status})`, { status: res.status });
    if (!res.ok) throw new TtsProviderError('bad-request', `the speech proxy rejected the request (HTTP ${res.status}: ${await this.#errorCode(res)})`, { status: res.status });

    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await res.arrayBuffer()); } catch (e) { throw new TtsProviderError('network', e instanceof Error ? e.message : String(e)); }
    if (bytes.length === 0) throw new TtsProviderError('bad-response', 'the speech proxy returned an empty body');
    const insp = inspectWav(bytes);
    if (insp.sampleRate === undefined || insp.channels === undefined || insp.durationMs === undefined) {
      throw new TtsProviderError('bad-response', `the speech proxy returned something that is not a readable WAV (${insp.validation.problems.join('; ') || 'unparseable'})`);
    }
    // Delivered locale as the proxy states it (the voice's own locale); never silently the requested one.
    const delivered = res.headers?.get?.('x-speech-delivered-locale') || req.locale;
    return { bytes, mime: 'audio/wav', sampleRate: insp.sampleRate, channels: insp.channels, durationMs: insp.durationMs, engine: PROXY_ENGINE, actualLocale: delivered };
  }

  /** The proxy's own short error code (`{error}`), never a free-text body. */
  async #errorCode(res: Response): Promise<string> {
    try {
      const o = (await res.json()) as { error?: unknown };
      return typeof o.error === 'string' && /^[a-z-]{1,40}$/.test(o.error) ? o.error : 'no detail';
    } catch { return 'no detail'; }
  }
}
