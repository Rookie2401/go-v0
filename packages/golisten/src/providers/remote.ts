/**
 * Remote voices through the same-origin speech proxy (server/speechHandler.ts):
 *   GET  {base}/status                 -> { configured, provider, providerVersion, region?, format, maxChars }
 *   GET  {base}/voices?lang=sq         -> { voices: [{ id, name, lang, locale, gender? }] }   (401 missing-credentials when no key)
 *   POST {base}/synthesize { text, voice, locale } -> audio/wav   (error bodies are { error, message })
 *
 * Rules: nothing is sent unless `consent().remoteSpeech` is true (checked here, immediately before the request, so a
 * consent withdrawn between calls is honoured, and no network call is made without it); the text is only ever in the
 * POST body, never in a URL, a log line or an error message; there is no key in the browser (the proxy holds it).
 * STATUS: exercised against a mocked fetch only; this repository has never called the live service.
 */
import type { Availability, PronunciationProvenance } from '../contracts';
import type { GoListenEnv } from '../environment';
import { descriptorOf } from '../registry';
import type { VoiceEntry, VoiceRegistry } from '../registry';
import { fail } from './types';
import type { Failure, PrepareOutcome, Req } from './types';

export const REMOTE_MAX_CHARS = 5000; // MAX_TEXT_CHARS in server/speechHandler.ts
const STATUS_TTL_MS = 60_000;

const NEEDS_CONSENT = 'Remote speech is off. Playing this voice would send the text to a speech service.';

function mapStatus(status: number, code: string | undefined): Failure {
  if (status === 401 || code === 'missing-credentials') return fail('provider-error', 'The speech service has no working key on the server (missing-credentials).');
  if (status === 429) return fail('provider-error', 'The speech service is rate limiting requests; try again in a moment.');
  if (status === 403) return fail('provider-error', 'The speech proxy refused the request (it accepts same-origin requests only).');
  if (status === 413) return fail('provider-error', 'The text is too long for the speech service.');
  return fail('provider-error', `The speech service answered HTTP ${status}${code ? ` (${code})` : ''}.`);
}

async function errorCode(res: { json(): Promise<unknown> }): Promise<string | undefined> {
  try {
    const j = await res.json();
    const e = (j as { error?: unknown } | null)?.error;
    return typeof e === 'string' && /^[a-z-]{1,40}$/.test(e) ? e : undefined;
  } catch { return undefined; }
}

export async function prepareRemote(req: Req, registry: VoiceRegistry, env: GoListenEnv): Promise<PrepareOutcome> {
  let entries = registry.entries.filter((e): e is VoiceEntry & { source: { kind: 'remote'; providerId: string; providerVoice: string; locale: string } } => e.source.kind === 'remote');
  if (entries.length === 0) return fail('no-voice', `No remote voice is registered for ${req.languageId}.`);
  if (!env.consent().remoteSpeech) return fail('no-consent', NEEDS_CONSENT); // before anything else; no network
  if (req.voiceId?.includes(':') && !req.voiceId.startsWith('device:') && !req.voiceId.startsWith('recording:')) {
    entries = entries.filter((e) => e.voiceId === req.voiceId);
    if (entries.length === 0) return fail('no-voice', 'The requested remote voice is not registered for this language.');
  }
  const entry = entries[0];
  if (!entry.supports.includes(req.kind)) return fail('unsupported-kind', `This voice does not speak a ${req.kind}.`);
  if (req.text.length > REMOTE_MAX_CHARS) return fail('unsupported-kind', `The text is longer than the ${REMOTE_MAX_CHARS} characters the speech service accepts.`);
  if (!env.fetch) return fail('provider-error', 'No network access is available to reach the speech service.');
  if (!env.audio || !env.objectUrl) return fail('provider-error', 'This environment cannot play audio returned by the speech service.');

  const { providerVoice, locale, providerId } = entry.source;
  let res;
  try {
    res = await env.fetch(`${env.proxyBase}/synthesize`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', cache: 'no-store',
      body: JSON.stringify({ text: req.text, voice: providerVoice, locale }),
    });
  } catch {
    return fail('offline', 'The speech service could not be reached. Check the connection.');
  }
  if (!res.ok) return mapStatus(res.status, await errorCode(res));
  const type = res.headers?.get('content-type') ?? '';
  if (type && !type.toLowerCase().startsWith('audio/')) return fail('provider-error', 'The speech service did not return audio.');
  let blob: Blob;
  try { blob = await res.blob(); } catch { return fail('offline', 'The audio download was interrupted.'); }
  if (blob.size === 0) return fail('provider-error', 'The speech service returned empty audio.');
  let url: string;
  try { url = env.objectUrl.create(blob); } catch { return fail('provider-error', 'This environment cannot play audio returned by the speech service.'); }

  const provenance: PronunciationProvenance = {
    source: 'remote-tts', voiceId: entry.voiceId, providerId, generatedFromText: true,
    note: 'Synthetic neural voice from a speech service, unverified by a native speaker: practice only, not counted as listening.',
  };
  return { ok: true, prepared: { voice: descriptorOf(entry), provenance, audio: { kind: 'remote', url }, ownsUrl: true } };
}

type StatusAnswer = { ok: true; configured: boolean } | { ok: false };
type VoicesAnswer = { ok: true; ids: string[] } | { ok: false; needsKey?: true };

/** One lookup per key, shared by concurrent callers and kept briefly (a failed lookup is kept too, so a dead proxy is not hammered). */
function cached<T>(env: GoListenEnv, key: string, load: () => Promise<T>): Promise<T> {
  const hit = env.cache.get(key);
  if (hit && env.now() - hit.at < STATUS_TTL_MS) return hit.value as Promise<T>;
  const p = load();
  env.cache.set(key, { at: env.now(), value: p });
  return p;
}

/**
 * Whether a remote entry could speak right now. No consent means no network call at all. With consent: the proxy's
 * status says whether a key exists ('needs-key' when not); the voices list confirms the registered voice is offered.
 * Neither request carries any text.
 */
export async function remoteAvailability(entry: VoiceEntry, env: GoListenEnv): Promise<Availability> {
  if (entry.source.kind !== 'remote') return 'unavailable';
  if (!env.consent().remoteSpeech) return 'needs-consent';
  const get = env.fetch;
  if (!get) return 'unavailable';
  const base = env.proxyBase;
  const init = { credentials: 'same-origin', cache: 'no-store' } as const;
  const status = await cached<StatusAnswer>(env, `status:${base}`, async () => {
    try {
      const st = await get(`${base}/status`, init);
      if (!st.ok) return { ok: false };
      const j = await st.json() as { configured?: unknown };
      return typeof j?.configured === 'boolean' ? { ok: true, configured: j.configured } : { ok: false };
    } catch { return { ok: false }; }
  });
  if (!status.ok) return 'unavailable';
  if (!status.configured) return 'needs-key';
  const lang = entry.source.locale.split('-')[0];
  const voices = await cached<VoicesAnswer>(env, `voices:${base}:${lang}`, async () => {
    try {
      const vs = await get(`${base}/voices?lang=${encodeURIComponent(lang)}`, init);
      if (vs.status === 401) return { ok: false, needsKey: true };
      if (!vs.ok) return { ok: false };
      const list = (await vs.json() as { voices?: Array<{ id?: unknown }> }).voices;
      return Array.isArray(list) ? { ok: true, ids: list.map((v) => v.id).filter((i): i is string => typeof i === 'string') } : { ok: false };
    } catch { return { ok: false }; }
  });
  if (!voices.ok) return voices.needsKey ? 'needs-key' : 'unavailable';
  return voices.ids.includes(entry.source.providerVoice) ? 'available' : 'unavailable';
}
