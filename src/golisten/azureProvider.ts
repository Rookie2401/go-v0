/**
 * AzureSpeechProvider - Azure AI Speech text-to-speech over the REST endpoint, behind `TtsProvider`.
 *
 * STATUS: implemented and tested against a MOCKED `fetch` only. It has never been called against the live
 * service, no voice produced by it has been heard, and whether a browser may call the endpoint cross-origin
 * (CORS) is unverified. See QA.md.
 *
 *   POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
 *   Ocp-Apim-Subscription-Key: <key>            Content-Type: application/ssml+xml
 *   X-Microsoft-OutputFormat: riff-24khz-16bit-mono-pcm      (a canonical PCM16 WAV, so `validateWav` applies)
 *
 * Secrets: the key and region are passed to the constructor by the caller at runtime. They live in a private
 * field only: never persisted by this package, never put in an error message, log line, `toJSON()` or asset row.
 * A 401/403 flips `availability()` to `missing-credentials` until the caller registers a provider with a new key.
 *
 * Voices come from a STATIC table (names as published in Azure's voice gallery, unverified against the live
 * `voices/list`). There is deliberately no es-HN entry: the Honduras course asks for es-HN, the resolver falls
 * back to es-MX and records that fallback on the VoiceConfig ("fallback accent") rather than hiding it.
 */
import type { LanguageCode } from '../core/model';
import type { ProviderAvailability, ProviderCapabilities, SynthesisRequest, SynthesisResult, TtsProvider, Voice } from '../core/contracts/golisten';
import { TtsProviderError } from './errors';
import { inspectWav } from './wav';

export const AZURE_PROVIDER_ID = 'azure-speech';
export const AZURE_PROVIDER_VERSION = 'azure-rest@1';
export const AZURE_ENGINE = 'azure-neural-tts';
export const AZURE_OUTPUT_FORMAT = 'riff-24khz-16bit-mono-pcm';

export interface AzureVoiceEntry { id: string; locale: string; gender: 'female' | 'male' }

/** Static voice table, preferred voice first within a locale. Extend at runtime via the `voices` option. */
export const AZURE_VOICES: Record<LanguageCode, AzureVoiceEntry[]> = {
  es: [
    { id: 'es-MX-DaliaNeural', locale: 'es-MX', gender: 'female' },
    { id: 'es-MX-JorgeNeural', locale: 'es-MX', gender: 'male' },
    { id: 'es-US-PalomaNeural', locale: 'es-US', gender: 'female' },
    { id: 'es-US-AlonsoNeural', locale: 'es-US', gender: 'male' },
    { id: 'es-ES-ElviraNeural', locale: 'es-ES', gender: 'female' },
    { id: 'es-ES-AlvaroNeural', locale: 'es-ES', gender: 'male' },
  ],
  sq: [
    { id: 'sq-AL-AnilaNeural', locale: 'sq-AL', gender: 'female' },
    { id: 'sq-AL-IlirNeural', locale: 'sq-AL', gender: 'male' },
  ],
  th: [
    { id: 'th-TH-PremwadeeNeural', locale: 'th-TH', gender: 'female' },
    { id: 'th-TH-NiwatNeural', locale: 'th-TH', gender: 'male' },
  ],
  hi: [
    { id: 'hi-IN-SwaraNeural', locale: 'hi-IN', gender: 'female' },
    { id: 'hi-IN-MadhurNeural', locale: 'hi-IN', gender: 'male' },
  ],
  de: [
    { id: 'de-DE-KatjaNeural', locale: 'de-DE', gender: 'female' },
    { id: 'de-DE-ConradNeural', locale: 'de-DE', gender: 'male' },
  ],
};

export interface AzureSpeechOptions {
  /** Subscription key. Supplied by the caller at runtime; held privately, never stored or logged. */
  key: string;
  /** Azure region, e.g. "westeurope". */
  region: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Override the endpoint (sovereign clouds / proxies). Default `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`. */
  endpoint?: string;
  /** Replace or extend the static voice table. */
  voices?: Partial<Record<LanguageCode, AzureVoiceEntry[]>>;
  /** Per-request timeout; a timeout is reported as a retryable network failure. Default 30000. */
  timeoutMs?: number;
}

const REGION_RE = /^[a-z0-9-]{2,40}$/i;
const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class AzureSpeechProvider implements TtsProvider {
  readonly id = AZURE_PROVIDER_ID;
  readonly version = AZURE_PROVIDER_VERSION;
  readonly isSpeech = true;
  /** Non-secret region (shown in the UI). */
  readonly region: string;

  readonly #key: string;
  readonly #fetch: typeof fetch | undefined;
  readonly #endpoint: string;
  readonly #voices: Record<LanguageCode, AzureVoiceEntry[]>;
  readonly #timeoutMs: number;
  #authFailure: string | undefined;

  constructor(opts: AzureSpeechOptions) {
    this.#key = (opts.key ?? '').trim();
    this.region = (opts.region ?? '').trim();
    this.#fetch = opts.fetch;
    this.#endpoint = opts.endpoint ?? `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    this.#timeoutMs = opts.timeoutMs ?? 30_000;
    this.#voices = { ...AZURE_VOICES, ...(opts.voices ?? {}) } as Record<LanguageCode, AzureVoiceEntry[]>;
  }

  /** The key is never serialised. */
  toJSON(): { id: string; version: string; region: string; hasKey: boolean } {
    return { id: this.id, version: this.version, region: this.region, hasKey: this.#key.length > 0 };
  }

  async availability(): Promise<ProviderAvailability> {
    if (!this.#key || !this.region) return { available: false, reason: 'missing-credentials', detail: 'Azure Speech needs both a key and a region' };
    if (!REGION_RE.test(this.region) && !this.#endpointOverridden()) return { available: false, reason: 'missing-credentials', detail: 'the Azure region is not a valid region name' };
    if (this.#authFailure) return { available: false, reason: 'missing-credentials', detail: this.#authFailure };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { available: false, reason: 'offline', detail: 'the device reports no network connection' };
    return { available: true, detail: `Azure Speech, region ${this.region} (configured; never verified against the live service by this package)` };
  }

  capabilities(): ProviderCapabilities {
    // Word marks are not requested (plain REST returns audio only), so none are ever claimed.
    // ssml: a caller-built <speak> body is honoured. phonemeOverrides is NOT claimed: unverified per voice.
    return { ssml: true, wordBoundaries: false, phonemeOverrides: false, streaming: false, maxChars: 5000, outputFormats: ['audio/wav'] };
  }

  async listVoices(lang: LanguageCode): Promise<Voice[]> {
    return (this.#voices[lang] ?? []).map((v) => ({ id: v.id, name: `Azure ${v.id}`, lang, locale: v.locale, gender: v.gender }));
  }

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    if (!this.#key || !this.region) throw new TtsProviderError('missing-credentials', 'Azure Speech key or region is not set');
    if (this.#authFailure) throw new TtsProviderError('missing-credentials', this.#authFailure);
    if (req.format !== 'audio/wav') throw new TtsProviderError('bad-request', `Azure adapter only produces audio/wav (${AZURE_OUTPUT_FORMAT}), not ${req.format}`);
    if (req.text.length > this.capabilities().maxChars) throw new TtsProviderError('bad-request', 'text is longer than the provider limit');
    const voice = (this.#voices[req.lang] ?? []).find((v) => v.id === req.voiceId);
    if (!voice) throw new TtsProviderError('bad-request', `unknown Azure voice ${req.voiceId} for ${req.lang}`);

    const doFetch = this.#fetch ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!doFetch) throw new TtsProviderError('network', 'no fetch implementation is available');

    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), this.#timeoutMs) : undefined;
    let res: Response;
    try {
      res = await doFetch(this.#endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.#key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
          'User-Agent': 'go-v0-golisten',
        },
        body: this.ssmlFor(req, voice),
        signal: controller?.signal,
      });
    } catch (e) {
      throw new TtsProviderError('network', this.redact(e instanceof Error ? e.message : String(e)));
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      this.#authFailure = `Azure rejected the key or region (HTTP ${res.status}); enter working credentials`;
      throw new TtsProviderError('missing-credentials', this.#authFailure, { status: res.status });
    }
    if (res.status === 429) throw new TtsProviderError('rate-limited', 'Azure is rate limiting requests (HTTP 429)', { status: 429, retryAfterMs: parseRetryAfter(res.headers?.get?.('retry-after') ?? null) });
    if (res.status >= 500) throw new TtsProviderError('server', `Azure server error (HTTP ${res.status})`, { status: res.status, retryAfterMs: parseRetryAfter(res.headers?.get?.('retry-after') ?? null) });
    if (!res.ok) throw new TtsProviderError('bad-request', `Azure rejected the request (HTTP ${res.status})${await this.bodyHint(res)}`, { status: res.status });

    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await res.arrayBuffer()); } catch (e) { throw new TtsProviderError('network', this.redact(e instanceof Error ? e.message : String(e))); }
    if (bytes.length === 0) throw new TtsProviderError('bad-response', 'Azure returned an empty body');
    const insp = inspectWav(bytes);
    if (insp.sampleRate === undefined || insp.channels === undefined || insp.durationMs === undefined) {
      throw new TtsProviderError('bad-response', `Azure returned something that is not a readable WAV (${insp.validation.problems.join('; ') || 'unparseable'})`);
    }
    // No wordMarks: this endpoint returns audio only and the adapter never invents timings.
    return { bytes, mime: 'audio/wav', sampleRate: insp.sampleRate, channels: insp.channels, durationMs: insp.durationMs, engine: AZURE_ENGINE, actualLocale: voice.locale };
  }

  /** `<speak>` body. A caller-built SSML (pronunciation overrides) has its inner markup wrapped in the voice element. */
  private ssmlFor(req: SynthesisRequest, voice: AzureVoiceEntry): string {
    let inner = escXml(req.text);
    if (req.ssml) {
      const m = /^\s*<speak\b[^>]*>([\s\S]*)<\/speak>\s*$/.exec(req.ssml);
      inner = m ? m[1] : escXml(req.text);
    }
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escXml(voice.locale)}"><voice name="${escXml(voice.id)}">${inner}</voice></speak>`;
  }

  #endpointOverridden(): boolean { return !this.#endpoint.includes(`//${this.region}.tts.speech.microsoft.com/`); }

  private redact(s: string): string { return this.#key ? s.split(this.#key).join('***') : s; }

  private async bodyHint(res: Response): Promise<string> {
    try {
      const t = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 160);
      return t ? `: ${this.redact(t)}` : '';
    } catch { return ''; }
  }
}

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const date = Date.parse(v);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
