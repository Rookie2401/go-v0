/**
 * Speech proxy, request handler. PURE: no Node, Vite or DOM imports; the network and the clock come in through `deps`.
 *
 *   GET  /api/speech/status                 -> { configured, provider: 'azure-speech', providerVersion, region?, format, maxChars }
 *   GET  /api/speech/voices?lang=es         -> { voices: [{ id, name, lang, locale, gender? }] }   (Azure voices/list, filtered)
 *   POST /api/speech/synthesize             -> audio/wav bytes (riff-24khz-16bit-mono-pcm)
 *        body  { text | ssml, voice, locale, format? }
 *
 * The Azure subscription key lives only in `env.key`, which the caller reads from the server's environment. It is sent
 * to Azure in one request header and is never placed in a response body, a response header, an error message or a log
 * line; every string that could carry foreign text goes through `redact`. Upstream error bodies are never echoed.
 *
 * Error contract (JSON `{ error, message }`):
 *   401 missing-credentials  key/region not configured on the server, or Azure answered 401/403
 *   429 rate-limited         our per-minute limit or Azure's 429, with Retry-After (seconds)
 *   502 upstream-error       Azure 5xx, or a 200 whose body is not a WAV
 *   504 upstream-timeout     Azure did not answer in time;  504 upstream-unreachable: network failure
 *   400 bad-request          malformed request, or Azure answered another 4xx
 *   403 forbidden-origin     cross-origin request;  413 payload-too-large;  405 / 404 as usual
 *
 * STATUS: verified against a MOCKED upstream only. This repository has never called the live Azure service.
 */

export const SPEECH_PROVIDER_ID = 'azure-speech';
export const SPEECH_PROVIDER_VERSION = 'azure-proxy@1';
export const SPEECH_OUTPUT_FORMAT = 'riff-24khz-16bit-mono-pcm';
export const SPEECH_PATH_PREFIX = '/api/speech';
export const MAX_BODY_BYTES = 20 * 1024;
export const MAX_TEXT_CHARS = 5000;
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 20_000;

export interface SpeechRequest {
  method: string;
  /** URL pathname, e.g. "/api/speech/status". */
  path: string;
  query?: Record<string, string | undefined>;
  /** Header names lower-cased (Node does this already). */
  headers: Record<string, string | undefined>;
  body?: string | Uint8Array;
  /** Caller identity for the rate limit (remote address); optional. */
  remote?: string;
}
export interface SpeechEnv { key?: string; region?: string }
export interface RateLimiter { take(key: string): { ok: boolean; retryAfterSec: number } }
export interface SpeechDeps {
  fetch: typeof fetch;
  now: () => number;
  /** Omit for no rate limiting (unit tests of other behaviour); the Node adapter always supplies one. */
  limiter?: RateLimiter;
  /** Upstream timeout. Default 20 s. */
  timeoutMs?: number;
  /** Receives key-free diagnostic lines. Never called with a body, header or key. */
  log?: (line: string) => void;
}
export interface SpeechResponse { status: number; headers: Record<string, string>; body: Uint8Array | string }

/** Sliding one-minute window per key. */
export function createRateLimiter(opts: { limit?: number; windowMs?: number; now: () => number }): RateLimiter {
  const limit = opts.limit ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
  const windowMs = opts.windowMs ?? 60_000;
  const hits = new Map<string, number[]>();
  return {
    take(key: string) {
      const t = opts.now();
      const recent = (hits.get(key) ?? []).filter((x) => x > t - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true, retryAfterSec: 0 };
    },
  };
}

export const isSpeechPath = (pathname: string): boolean => pathname === SPEECH_PATH_PREFIX || pathname.startsWith(`${SPEECH_PATH_PREFIX}/`);

const REGION_RE = /^[a-z0-9-]{2,40}$/i;
const VOICE_RE = /^[A-Za-z0-9-]{3,100}$/;
const LOCALE_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const LANG_RE = /^[A-Za-z]{2,3}$/;

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } as const;

const json = (status: number, body: unknown, extra: Record<string, string> = {}): SpeechResponse => ({
  status, headers: { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', ...extra }, body: JSON.stringify(body),
});
const failure = (status: number, error: string, message: string, extra: Record<string, string> = {}) => json(status, { error, message }, extra);

/** Removes every occurrence of the key from a string. Applied to anything that is logged or could echo foreign text. */
export function redactKey(s: string, key?: string): string {
  return key ? s.split(key).join('***') : s;
}

function configured(env: SpeechEnv): env is { key: string; region: string } {
  return !!env.key && !!env.region && REGION_RE.test(env.region);
}

function sameOriginProblem(h: SpeechRequest['headers']): string | undefined {
  const site = h['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return `Sec-Fetch-Site is ${site}`;
  const origin = h['origin'];
  if (origin !== undefined) {
    let originHost: string;
    try { originHost = new URL(origin).host; } catch { return 'the Origin header is not a valid origin'; }
    if (!h['host'] || originHost.toLowerCase() !== h['host'].toLowerCase()) return 'the Origin does not match the Host';
  }
  return undefined;
}

function byteLength(b: string | Uint8Array | undefined): number {
  if (b === undefined) return 0;
  return typeof b === 'string' ? new TextEncoder().encode(b).length : b.length;
}
function bodyText(b: string | Uint8Array | undefined): string {
  if (b === undefined) return '';
  return typeof b === 'string' ? b : new TextDecoder().decode(b);
}

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The `<speak>` body: the proxy builds the wrapper (voice + locale validated), so a client cannot swap the voice element. */
function buildSsml(p: { text?: string; ssml?: string; voice: string; locale: string }): string {
  let inner = escXml(p.text ?? '');
  if (p.ssml !== undefined) {
    const m = /^\s*<speak\b[^>]*>([\s\S]*)<\/speak>\s*$/.exec(p.ssml);
    inner = m ? m[1] : escXml(p.text ?? p.ssml);
  }
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escXml(p.locale)}"><voice name="${escXml(p.voice)}">${inner}</voice></speak>`;
}

/** "es-MX-DaliaNeural" -> "es-MX": the locale the voice actually speaks (what is delivered, whatever was requested). */
export function localeOfVoice(voice: string): string | undefined {
  const m = /^([A-Za-z]{2,3}-[A-Za-z0-9]{2,8})-/.exec(voice);
  return m?.[1];
}

const isTimeout = (e: unknown) => !!e && typeof e === 'object' && ((e as { name?: unknown }).name === 'AbortError' || (e as { name?: unknown }).name === 'TimeoutError');

type Upstream = { ok: true; res: Response } | { ok: false; out: SpeechResponse };

async function callUpstream(url: string, init: RequestInit, env: SpeechEnv, deps: SpeechDeps): Promise<Upstream> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS);
  try {
    const res = await deps.fetch(url, { ...init, signal: controller.signal });
    return { ok: true, res };
  } catch (e) {
    const timedOut = isTimeout(e) || controller.signal.aborted;
    deps.log?.(redactKey(`upstream ${timedOut ? 'timeout' : 'network failure'}`, env.key));
    return { ok: false, out: timedOut
      ? failure(504, 'upstream-timeout', 'The speech service did not answer in time.')
      : failure(504, 'upstream-unreachable', 'The speech service could not be reached from the server.') };
  } finally {
    clearTimeout(timer);
  }
}

/** Maps a non-2xx upstream status; never echoes the upstream body. */
function mapUpstreamStatus(status: number, res: Response, env: SpeechEnv, deps: SpeechDeps): SpeechResponse {
  deps.log?.(redactKey(`upstream answered HTTP ${status}`, env.key));
  if (status === 401 || status === 403) return failure(401, 'missing-credentials', 'The speech service rejected the configured key or region. Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.');
  if (status === 429) {
    const ra = res.headers?.get?.('retry-after');
    const secs = ra && /^\d+$/.test(ra.trim()) ? ra.trim() : undefined;
    return failure(429, 'rate-limited', 'The speech service is rate limiting requests.', secs ? { 'retry-after': secs } : {});
  }
  if (status >= 500) return failure(502, 'upstream-error', `The speech service reported a server error (HTTP ${status}).`);
  return failure(400, 'bad-request', `The speech service rejected the request (HTTP ${status}).`);
}

const notConfigured = () => failure(401, 'missing-credentials', 'Speech is not configured on the server: set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.');

export async function handleSpeechRequest(req: SpeechRequest, env: SpeechEnv, deps: SpeechDeps): Promise<SpeechResponse> {
  try {
    return await route(req, env, deps);
  } catch (e) {
    deps.log?.(redactKey(`internal error (${e instanceof Error ? e.name : 'unknown'})`, env.key));
    return failure(500, 'internal-error', 'The speech proxy failed unexpectedly.');
  }
}

async function route(req: SpeechRequest, env: SpeechEnv, deps: SpeechDeps): Promise<SpeechResponse> {
  const method = req.method.toUpperCase();
  const path = req.path.replace(/\/+$/, '') || '/';
  if (!isSpeechPath(path)) return failure(404, 'not-found', 'Unknown path.');

  const problem = sameOriginProblem(req.headers);
  if (problem) return failure(403, 'forbidden-origin', `Same-origin requests only (${problem}).`);

  if (path === `${SPEECH_PATH_PREFIX}/status`) {
    if (method !== 'GET') return failure(405, 'method-not-allowed', 'Use GET.', { allow: 'GET' });
    const ok = configured(env);
    return json(200, { configured: ok, provider: SPEECH_PROVIDER_ID, providerVersion: SPEECH_PROVIDER_VERSION, ...(ok ? { region: env.region } : {}), format: SPEECH_OUTPUT_FORMAT, maxChars: MAX_TEXT_CHARS });
  }

  const isVoices = path === `${SPEECH_PATH_PREFIX}/voices`;
  const isSynth = path === `${SPEECH_PATH_PREFIX}/synthesize`;
  if (!isVoices && !isSynth) return failure(404, 'not-found', 'Unknown speech endpoint.');
  if (isVoices && method !== 'GET') return failure(405, 'method-not-allowed', 'Use GET.', { allow: 'GET' });
  if (isSynth && method !== 'POST') return failure(405, 'method-not-allowed', 'Use POST.', { allow: 'POST' });

  // Cheap checks first, so a rejected request never touches the limiter's budget or the upstream.
  if (isSynth && byteLength(req.body) > MAX_BODY_BYTES) return failure(413, 'payload-too-large', `The request body is limited to ${MAX_BODY_BYTES} bytes.`);
  if (!configured(env)) return notConfigured();
  if (deps.limiter) {
    const t = deps.limiter.take(req.remote ?? 'local');
    if (!t.ok) return failure(429, 'rate-limited', 'Too many speech requests; wait a moment.', { 'retry-after': String(t.retryAfterSec) });
  }
  return isVoices ? voices(req, env, deps) : synthesize(req, env, deps);
}

async function voices(req: SpeechRequest, env: { key: string; region: string }, deps: SpeechDeps): Promise<SpeechResponse> {
  const lang = req.query?.lang;
  if (lang !== undefined && !LANG_RE.test(lang)) return failure(400, 'bad-request', 'lang must be a language code such as "es".');
  const up = await callUpstream(`https://${env.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
    method: 'GET', headers: { 'Ocp-Apim-Subscription-Key': env.key, 'User-Agent': 'go-v0-speech-proxy' },
  }, env, deps);
  if (!up.ok) return up.out;
  if (!up.res.ok) return mapUpstreamStatus(up.res.status, up.res, env, deps);
  let list: unknown;
  try { list = await up.res.json(); } catch { return failure(502, 'upstream-error', 'The voice list was not valid JSON.'); }
  if (!Array.isArray(list)) return failure(502, 'upstream-error', 'The voice list had an unexpected shape.');
  const want = lang?.toLowerCase();
  const out = (list as Array<Record<string, unknown>>)
    .filter((v) => typeof v?.ShortName === 'string' && typeof v?.Locale === 'string')
    .filter((v) => !want || (v.Locale as string).toLowerCase().startsWith(`${want}-`))
    .map((v) => {
      const g = typeof v.Gender === 'string' ? v.Gender.toLowerCase() : undefined;
      return { id: v.ShortName as string, name: `Azure ${v.ShortName as string}`, lang: (v.Locale as string).split('-')[0].toLowerCase(), locale: v.Locale as string, ...(g === 'female' || g === 'male' || g === 'neutral' ? { gender: g } : {}) };
    });
  return json(200, { voices: out });
}

async function synthesize(req: SpeechRequest, env: { key: string; region: string }, deps: SpeechDeps): Promise<SpeechResponse> {
  const bad = (m: string) => failure(400, 'bad-request', m);
  let p: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(bodyText(req.body));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad('The body must be a JSON object.');
    p = parsed as Record<string, unknown>;
  } catch { return bad('The body must be JSON.'); }

  const text = p.text, ssml = p.ssml, voice = p.voice, locale = p.locale, format = p.format ?? SPEECH_OUTPUT_FORMAT;
  if (format !== SPEECH_OUTPUT_FORMAT) return bad(`Only ${SPEECH_OUTPUT_FORMAT} is supported.`);
  if (typeof voice !== 'string' || !VOICE_RE.test(voice)) return bad('voice is required (an Azure voice short name).');
  const loc = typeof locale === 'string' && locale ? locale : localeOfVoice(voice);
  if (!loc || !LOCALE_RE.test(loc)) return bad('locale is required (e.g. "es-MX").');
  if (text !== undefined && typeof text !== 'string') return bad('text must be a string.');
  if (ssml !== undefined && typeof ssml !== 'string') return bad('ssml must be a string.');
  if (text === undefined && ssml === undefined) return bad('Provide text or ssml.');
  if (Math.max(text?.length ?? 0, ssml?.length ?? 0) > MAX_TEXT_CHARS) return bad(`The text is limited to ${MAX_TEXT_CHARS} characters.`);
  if (!(text ?? '').trim() && !(ssml ?? '').trim()) return bad('The text is empty.');

  const up = await callUpstream(`https://${env.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.key, 'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': SPEECH_OUTPUT_FORMAT, 'User-Agent': 'go-v0-speech-proxy',
    },
    body: buildSsml({ text, ssml, voice, locale: loc }),
  }, env, deps);
  if (!up.ok) return up.out;
  if (!up.res.ok) return mapUpstreamStatus(up.res.status, up.res, env, deps);

  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await up.res.arrayBuffer()); } catch { return failure(504, 'upstream-unreachable', 'The audio download was interrupted.'); }
  const riff = bytes.length > 44 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  if (!riff) return failure(502, 'upstream-error', 'The speech service returned something that is not a WAV file.');
  return {
    status: 200,
    headers: {
      ...BASE_HEADERS, 'content-type': 'audio/wav', 'content-length': String(bytes.length),
      'x-speech-provider-version': SPEECH_PROVIDER_VERSION, 'x-speech-voice': voice,
      'x-speech-requested-locale': loc, 'x-speech-delivered-locale': localeOfVoice(voice) ?? loc,
    },
    body: bytes,
  };
}
