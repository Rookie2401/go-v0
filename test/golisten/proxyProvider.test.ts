/**
 * ProxySpeechProvider against a MOCKED fetch. Two kinds of mock are used:
 *   - hand-written responses, to pin each HTTP outcome the provider must classify;
 *   - the real server handler (server/speechHandler) wired in as the "network", with a mocked Azure behind it, so the
 *     provider and the proxy contract are tested together.
 * Nothing here touches a network or proves anything about the live service.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ids, type AppStore, type LanguageCode } from '../../src/core';
import {
  AZURE_VOICES, PROXY_PROVIDER_ID, PROXY_PROVIDER_VERSION_UNRESOLVED, ProxySpeechProvider, TtsProviderError, fixtureChunks, renderFixtureChunks, validateWav,
} from '../../src/golisten';
import { createRateLimiter, handleSpeechRequest, type SpeechEnv } from '../../server/speechHandler';
import { LANGS, addStory, makeEnv } from './support';

const KEY = 'SECRET-KEY-0123456789abcdef';
const REGION = 'westeurope';
const ORIGIN = 'http://localhost:5196';
const tid = (lang: LanguageCode) => ids.text(lang, 'story-01');
const SETUP = 'Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.';

const wav24k = (text = 'hola mundo') => renderFixtureChunks(fixtureChunks(text, 'es'), { sampleRate: 24000 }).bytes;
const bi = (b: Uint8Array) => b as unknown as BodyInit;
const azureOk = () => new Response(bi(wav24k()), { status: 200 });

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function mockFetch(handler: Handler) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json', ...headers } });
const STATUS_OK = { configured: true, provider: 'azure-speech', providerVersion: 'azure-proxy@1', region: REGION };

/** A fetch whose far end is the real proxy handler; `azure` is the mocked Azure behind it. */
function proxyNetwork(opts: { env?: SpeechEnv; azure?: Handler; limit?: number } = {}) {
  const azure = mockFetch(opts.azure ?? (() => azureOk()));
  const env = opts.env ?? { key: KEY, region: REGION };
  const limiter = createRateLimiter({ limit: opts.limit ?? 1000, now: () => Date.now() });
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const net = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input), ORIGIN);
    seen.push({ url: String(input), init: init ?? {} });
    const out = await handleSpeechRequest({
      method: init?.method ?? 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams),
      headers: { host: u.host, origin: ORIGIN, 'content-type': 'application/json' },
      body: typeof init?.body === 'string' ? init.body : undefined,
    }, env, { fetch: azure.fn, now: () => Date.now(), limiter, timeoutMs: 500 });
    return new Response(out.body as unknown as BodyInit, { status: out.status, headers: out.headers });
  }) as unknown as typeof fetch;
  return { net, azure, seen };
}

const req = { text: 'hola', lang: 'es' as const, locale: 'es-MX', voiceId: 'es-MX-DaliaNeural', format: 'audio/wav', settings: {} };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('ProxySpeechProvider: declaration', () => {
  it('real speech, id speech-proxy, WAV only, no word marks, no phoneme claim; version unresolved until a status answers', async () => {
    const f = mockFetch(() => json(STATUS_OK));
    const p = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: f.fn });
    expect(p).toMatchObject({ id: 'speech-proxy', isSpeech: true });
    expect(PROXY_PROVIDER_ID).toBe('speech-proxy');
    expect(p.version).toBe(PROXY_PROVIDER_VERSION_UNRESOLVED);
    expect(p.versionResolved).toBe(false);
    expect(p.capabilities()).toMatchObject({ wordBoundaries: false, phonemeOverrides: false, outputFormats: ['audio/wav'], streaming: false });
    await p.availability();
    expect(p.version).toBe('azure-proxy@1'); // taken from the status response
    expect(p.versionResolved).toBe(true);
    expect(p.region).toBe(REGION);
    expect(f.calls[0].url).toBe(`${ORIGIN}/api/speech/status`);
    expect(JSON.stringify(p)).toBe(JSON.stringify({ id: 'speech-proxy', version: 'azure-proxy@1', region: REGION }));
  });

  it('defaults to the same origin and tolerates a trailing slash in baseUrl', async () => {
    const a = mockFetch(() => json(STATUS_OK));
    await new ProxySpeechProvider({ fetch: a.fn }).availability();
    expect(a.calls[0].url).toBe('/api/speech/status');
    const b = mockFetch(() => json(STATUS_OK));
    await new ProxySpeechProvider({ baseUrl: `${ORIGIN}/`, fetch: b.fn }).availability();
    expect(b.calls[0].url).toBe(`${ORIGIN}/api/speech/status`);
  });
});

describe('ProxySpeechProvider: availability', () => {
  const avail = (h: Handler) => new ProxySpeechProvider({ fetch: mockFetch(h).fn }).availability();

  it('configured: available, region shown, no secret anywhere', async () => {
    const a = await avail(() => json(STATUS_OK));
    expect(a.available).toBe(true);
    expect(a.detail).toMatch(/region westeurope/);
    expect(JSON.stringify(a)).not.toContain(KEY);
  });

  it('unconfigured: missing-credentials with the exact setup instruction', async () => {
    expect(await avail(() => json({ configured: false, provider: 'azure-speech', providerVersion: 'azure-proxy@1' }))).toEqual({ available: false, reason: 'missing-credentials', detail: SETUP });
  });

  it('network failure: provider-error (or offline when the device says so)', async () => {
    const down: Handler = () => { throw new TypeError('Failed to fetch'); };
    const a = await avail(down);
    expect(a).toMatchObject({ available: false, reason: 'provider-error' });
    expect(a.detail).toMatch(/could not be reached/);
    vi.stubGlobal('navigator', { onLine: false });
    expect(await avail(down)).toMatchObject({ available: false, reason: 'offline' });
  });

  it('no proxy on this host (404, or a static host answering index.html): no-provider with advice, not an error', async () => {
    expect(await avail(() => new Response('nope', { status: 404 }))).toMatchObject({ available: false, reason: 'no-provider' });
    expect(await avail(() => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }))).toMatchObject({ available: false, reason: 'no-provider' });
    expect(await avail(() => json({ hello: 'world' }))).toMatchObject({ available: false, reason: 'no-provider' });
    expect((await avail(() => new Response('<html>', { status: 200 }))).detail).toMatch(/direct Azure key/);
  });

  it('a 5xx from the proxy is a provider-error', async () => {
    expect(await avail(() => new Response('', { status: 503 }))).toMatchObject({ available: false, reason: 'provider-error' });
  });

  it('concurrent probes share one request', async () => {
    const f = mockFetch(() => json(STATUS_OK));
    const p = new ProxySpeechProvider({ fetch: f.fn });
    await Promise.all([p.availability(), p.availability(), p.availability()]);
    expect(f.calls).toHaveLength(1);
    await p.availability();
    expect(f.calls).toHaveLength(2);
  });

  it('picks up a server that gets configured later (status is asked every time)', async () => {
    let configured = false;
    const p = new ProxySpeechProvider({ fetch: mockFetch(() => json({ ...STATUS_OK, configured, region: configured ? REGION : undefined })).fn });
    expect((await p.availability()).available).toBe(false);
    configured = true;
    expect((await p.availability()).available).toBe(true);
  });
});

describe('ProxySpeechProvider: voices', () => {
  it('lists the live voices the proxy returns (a real es-HN voice makes the Honduras course exact)', async () => {
    const f = mockFetch(() => json({ voices: [{ id: 'es-HN-KarlaNeural', name: 'Azure es-HN-KarlaNeural', lang: 'es', locale: 'es-HN', gender: 'female' }, { id: 'es-MX-JorgeNeural', locale: 'es-MX', gender: 'male' }] }));
    const v = await new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: f.fn }).listVoices('es');
    expect(f.calls[0].url).toBe(`${ORIGIN}/api/speech/voices?lang=es`);
    expect(v).toEqual([
      { id: 'es-HN-KarlaNeural', name: 'Azure es-HN-KarlaNeural', lang: 'es', locale: 'es-HN', gender: 'female' },
      { id: 'es-MX-JorgeNeural', name: 'Azure es-MX-JorgeNeural', lang: 'es', locale: 'es-MX', gender: 'male' },
    ]);
  });

  it('falls back to the static table (the same one the direct adapter uses) when the proxy cannot list', async () => {
    for (const h of [(() => { throw new TypeError('down'); }) as Handler, () => json({ error: 'missing-credentials' }, 401), () => json({ voices: [] }), () => new Response('<html>', { status: 200 })]) {
      const v = await new ProxySpeechProvider({ fetch: mockFetch(h).fn }).listVoices('de');
      expect(v.map((x) => x.id)).toEqual(AZURE_VOICES.de.map((x) => x.id));
    }
  });
});

describe('ProxySpeechProvider: synthesize', () => {
  const ready = async (h: Handler) => {
    const f = mockFetch((url, init) => (url.endsWith('/api/speech/status') ? json(STATUS_OK) : h(url, init)));
    const p = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: f.fn });
    await p.availability();
    return { p, f };
  };
  const err = (p: ProxySpeechProvider, r = req) => p.synthesize(r).catch((e: unknown) => e as TtsProviderError);

  it('posts JSON {text, voice, locale, format} with NO credential of any kind, and returns a validatable WAV with the delivered locale', async () => {
    const { p, f } = await ready(() => new Response(bi(wav24k()), { status: 200, headers: { 'x-speech-delivered-locale': 'es-MX' } }));
    const r = await p.synthesize({ ...req, locale: 'es-HN' });
    const call = f.calls.find((c) => c.url.endsWith('/synthesize'))!;
    expect(call.url).toBe(`${ORIGIN}/api/speech/synthesize`);
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(String(call.init.body))).toEqual({ text: 'hola', voice: 'es-MX-DaliaNeural', locale: 'es-HN', format: 'riff-24khz-16bit-mono-pcm' });
    expect(JSON.stringify(call.init.headers).toLowerCase()).not.toMatch(/subscription|key|authorization/);
    expect(r).toMatchObject({ mime: 'audio/wav', sampleRate: 24000, channels: 1, engine: 'azure-neural-tts', actualLocale: 'es-MX' }); // delivered, not the requested es-HN
    expect(r.wordMarks).toBeUndefined();
    expect(validateWav(r.bytes, { expectedSampleRate: 24000 }).ok).toBe(true);
  });

  it('caller SSML (pronunciation) is forwarded alongside the text', async () => {
    const { p, f } = await ready(() => azureOk());
    await p.synthesize({ ...req, ssml: '<speak version="1.0">Yo creo en <lang xml:lang="es-ES">Dios</lang>.</speak>' });
    const body = JSON.parse(String(f.calls.find((c) => c.url.endsWith('/synthesize'))!.init.body));
    expect(body.ssml).toContain('<lang xml:lang="es-ES">Dios</lang>');
  });

  it('with no delivered-locale header, the requested locale is what is recorded', async () => {
    const { p } = await ready(() => azureOk());
    expect((await p.synthesize(req)).actualLocale).toBe('es-MX');
  });

  it('refuses before any request: non-wav, over-long text, and a proxy whose version was never read', async () => {
    const { p, f } = await ready(() => azureOk());
    expect(await err(p, { ...req, format: 'audio/mpeg' })).toMatchObject({ kind: 'bad-request' });
    expect(await err(p, { ...req, text: 'a'.repeat(5001) })).toMatchObject({ kind: 'bad-request' });
    expect(f.calls.filter((c) => c.url.endsWith('/synthesize'))).toHaveLength(0);
    const cold = new ProxySpeechProvider({ fetch: mockFetch(() => azureOk()).fn });
    expect(await err(cold)).toMatchObject({ kind: 'bad-request' });
  });

  it('classifies HTTP outcomes: 401/403 missing-credentials (sticky), 429 rate-limited with Retry-After, 5xx server, 504 network, 4xx bad-request, 404 no proxy, empty/garbage bad-response', async () => {
    const run = async (res: () => Response) => (await err((await ready(res)).p)) as TtsProviderError;
    expect(await run(() => json({ error: 'missing-credentials' }, 401))).toMatchObject({ kind: 'missing-credentials', status: 401, retryable: false });
    expect(await run(() => json({ error: 'missing-credentials' }, 403))).toMatchObject({ kind: 'missing-credentials', status: 403, retryable: false });
    expect(await run(() => json({ error: 'rate-limited' }, 429, { 'retry-after': '7' }))).toMatchObject({ kind: 'rate-limited', status: 429, retryAfterMs: 7000, retryable: true });
    expect(await run(() => json({ error: 'rate-limited' }, 429))).toMatchObject({ kind: 'rate-limited', retryAfterMs: undefined });
    expect(await run(() => json({ error: 'upstream-error' }, 502))).toMatchObject({ kind: 'server', status: 502, retryable: true });
    expect((await run(() => json({ error: 'upstream-error' }, 502))).message).toMatch(/upstream-error/);
    expect(await run(() => json({ error: 'upstream-timeout' }, 504))).toMatchObject({ kind: 'network', status: 504, retryable: true });
    expect(await run(() => json({ error: 'bad-request' }, 400))).toMatchObject({ kind: 'bad-request', retryable: false });
    expect(await run(() => new Response('', { status: 404 }))).toMatchObject({ kind: 'bad-request' });
    expect((await run(() => new Response('', { status: 404 }))).message).toMatch(/no speech proxy/);
    expect(await run(() => new Response(new Uint8Array(0), { status: 200 }))).toMatchObject({ kind: 'bad-response' });
    expect(await run(() => new Response('<html>definitely not a wav</html>', { status: 200 }))).toMatchObject({ kind: 'bad-response' });
  });

  it('a 401 flips availability to missing-credentials until resetAuthFailure (or a new instance)', async () => {
    const { p } = await ready(() => json({ error: 'missing-credentials' }, 401));
    await err(p);
    expect(await p.availability()).toMatchObject({ available: false, reason: 'missing-credentials' });
    await expect(p.synthesize(req)).rejects.toMatchObject({ kind: 'missing-credentials' });
    p.resetAuthFailure();
    expect((await p.availability()).available).toBe(true);
  });

  it('a network error is a retryable network failure; a hung request is aborted after timeoutMs', async () => {
    const net = await ready(() => { throw new TypeError('Failed to fetch'); });
    expect(await err(net.p)).toMatchObject({ kind: 'network', retryable: true });
    const hang = ((url: string, init: RequestInit) => (String(url).endsWith('/status') ? Promise.resolve(json(STATUS_OK)) : new Promise((_r, rej) => { init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); }))) as unknown as typeof fetch;
    const p = new ProxySpeechProvider({ fetch: hang, timeoutMs: 15 });
    await p.availability();
    expect(await err(p)).toMatchObject({ kind: 'network', retryable: true });
  });

  it('through the real proxy handler: success, the proxy limiter (429 + Retry-After), unconfigured server (401), Azure 5xx (502 -> server)', async () => {
    const ok = proxyNetwork();
    const p = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: ok.net });
    expect((await p.availability()).available).toBe(true);
    const r = await p.synthesize(req);
    expect(r.actualLocale).toBe('es-MX');
    expect(JSON.stringify(ok.seen)).not.toContain(KEY); // the browser side never saw or sent the key

    const limited = proxyNetwork({ limit: 1 });
    const q = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: limited.net });
    await q.availability();
    await q.synthesize(req);
    const e = await err(q);
    expect(e).toMatchObject({ kind: 'rate-limited', status: 429 });
    expect((e as TtsProviderError).retryAfterMs).toBeGreaterThan(0);

    const none = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: proxyNetwork({ env: {} }).net });
    expect(await none.availability()).toEqual({ available: false, reason: 'missing-credentials', detail: SETUP });

    const down = proxyNetwork({ azure: () => new Response('oops', { status: 503 }) });
    const d = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: down.net });
    await d.availability();
    expect(await err(d)).toMatchObject({ kind: 'server', status: 502 });

    const badKey = proxyNetwork({ azure: () => new Response('', { status: 401 }) });
    const b = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: badKey.net });
    await b.availability();
    expect(await err(b)).toMatchObject({ kind: 'missing-credentials' });
  });
});

async function dump(store: AppStore): Promise<string> {
  const rows: unknown[] = [];
  for (const t of ['voices', 'audioAssets', 'audioSegments', 'alignments', 'manifests', 'audioJobs', 'events', 'meta'] as const) rows.push(await store[t].all());
  return JSON.stringify(rows);
}

describe('ProxySpeechProvider through GoListen (the real proxy handler, mocked Azure)', () => {
  it.each(LANGS)('%s: generates validated audio; records provider speech-proxy + version, voice, requested vs delivered locale, isSpeech; stays unreviewed', async (lang) => {
    const net = proxyNetwork();
    const proxy = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: net.net });
    await proxy.availability(); // learn the version before registering, as bootstrap does
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [proxy] });
    await addStory(store, lang);
    const r = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(r).toMatchObject({ created: 3, failed: 0 });
    expect(r.manifest.complete).toBe(true);

    const voice = (await store.voices.get(r.manifest.voiceConfigId))!;
    const first = AZURE_VOICES[lang][0]; // the proxy's voice list is the live Azure one; the mock Azure returns an unusable list, so the static table applies
    expect(voice).toMatchObject({ providerId: 'speech-proxy', providerVersion: 'azure-proxy@1', voiceId: first.id, isSpeech: true, reviewStatus: 'unreviewed', approved: false, actualLocale: first.locale });
    if (lang === 'es') {
      expect(voice.requestedLocale).toBe('es-HN');
      expect(voice.qaNote).toMatch(/Fallback accent: course asked for es-HN, provider delivers es-MX/);
    } else {
      expect(voice.requestedLocale).toBe(voice.actualLocale);
    }
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    const asset = (await gl.getAsset(seg.assetId!))!;
    expect(asset).toMatchObject({ isSpeech: true, locale: first.locale, sampleRate: 24000, mime: 'audio/wav' });
    expect(asset.generation).toMatchObject({ providerId: 'speech-proxy', engine: 'azure-neural-tts', voiceId: first.id });
    expect(asset.generation!.softwareVersion).toMatch(/speech-proxy@azure-proxy@1/);
    expect(await gl.alignments(seg.id)).toHaveLength(1); // sentence-level by construction only

    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'preview-only', isSpeech: true, evidenceEligible: false, providerId: 'speech-proxy', providerVersion: 'azure-proxy@1' });
    await gl.setVoiceReview(voice.id, 'reviewed', 'mocked test');
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'ready', evidenceEligible: true });
    const all = await dump(store);
    expect(all).not.toContain(KEY);
    expect(JSON.stringify(net.seen)).not.toContain(KEY);
  });

  it('a live es-HN voice from Azure is used for the Honduras course: requested = delivered, no fallback note', async () => {
    const list = [{ ShortName: 'es-HN-KarlaNeural', Gender: 'Female', Locale: 'es-HN' }, { ShortName: 'es-MX-DaliaNeural', Gender: 'Female', Locale: 'es-MX' }];
    const net = proxyNetwork({ azure: (url) => (url.endsWith('/voices/list') ? json(list) : azureOk()) });
    const proxy = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: net.net });
    await proxy.availability();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [proxy] });
    await addStory(store, 'es');
    const r = await gl.ensureAudio(tid('es'), { runNow: true });
    const voice = (await store.voices.get(r.manifest.voiceConfigId))!;
    expect(voice).toMatchObject({ voiceId: 'es-HN-KarlaNeural', requestedLocale: 'es-HN', actualLocale: 'es-HN' });
    expect(voice.qaNote ?? '').not.toMatch(/Fallback/);
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    expect((await gl.getAsset(seg.assetId!))!.locale).toBe('es-HN');
  });

  it('unconfigured server: availability is missing-credentials with the instruction, audioStatus is unavailable, ensureAudio throws AudioUnavailable and writes nothing', async () => {
    const proxy = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: proxyNetwork({ env: {} }).net });
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [proxy] });
    await addStory(store, 'es');
    expect(await gl.availability()).toMatchObject({ available: false, realSpeech: false, reason: 'missing-credentials', detail: SETUP, realSpeechReason: 'missing-credentials', realSpeechDetail: SETUP });
    const st = await gl.audioStatus(tid('es'));
    expect(st.state).toBe('unavailable');
    expect(st.reason).toContain('.env.local');
    const e = await gl.ensureAudio(tid('es')).catch((x: unknown) => x);
    expect(e).toMatchObject({ name: 'AudioUnavailable', reason: 'missing-credentials' });
    expect(await store.audioJobs.count()).toBe(0);
    expect(await store.voices.count()).toBe(0);
  });

  it('401 from the proxy: the job dies at once, the provider flips to unavailable, the others wait, and a corrected server recovers via retryDead', async () => {
    let azureStatus = 401;
    const net = proxyNetwork({ azure: () => (azureStatus === 200 ? azureOk() : new Response('', { status: azureStatus })) });
    const proxy = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: net.net });
    await proxy.availability();
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [proxy] });
    await addStory(store, 'es');
    const r = await gl.ensureAudio(tid('es'), { runNow: true });
    expect(r.failed).toBe(1);
    const dead = await gl.jobs('dead');
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ attempts: 1 });
    expect(dead[0].lastError).toMatch(/^missing-credentials: /);
    expect(dead[0].lastError).toContain('.env.local');
    expect(await gl.jobs('queued')).toHaveLength(2);
    expect(await gl.availability()).toMatchObject({ available: false, reason: 'missing-credentials' });
    expect((await gl.audioStatus(tid('es'))).state).toBe('failed');
    clock.advance(3_600_000);
    expect(await gl.runJobs()).toBe(0);

    azureStatus = 200;
    proxy.resetAuthFailure(); // after fixing .env.local and restarting the server
    expect(await gl.retryDead()).toBe(1);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.getManifest(tid('es')))!.complete).toBe(true);
    expect(await dump(store)).not.toContain(KEY);
  });

  it('429: retried by the job runner honouring Retry-After from the proxy, then succeeds', async () => {
    let n = 0;
    const net = proxyNetwork({ azure: (url) => (url.endsWith('/voices/list') ? new Response('[]', { status: 200 }) : ++n <= 3 ? new Response('', { status: 429, headers: { 'Retry-After': '7' } }) : azureOk()) });
    const proxy = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: net.net });
    await proxy.availability();
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [proxy] });
    await addStory(store, 'de');
    await gl.ensureAudio(tid('de'), { runNow: true });
    const failed = await gl.jobs('failed');
    expect(failed).toHaveLength(3);
    for (const j of failed) {
      expect(j.lastError).toMatch(/^rate-limited: /);
      expect(Date.parse(j.nextAttemptAt!) - Date.parse(clock.now())).toBe(7000);
    }
    clock.advance(7000);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.getManifest(tid('de')))!.complete).toBe(true);
  });

  it('5xx: failed, retried with backoff, dead after maxAttempts, segment failed with the reason; retryDead recovers', async () => {
    let healthy = false;
    const net = proxyNetwork({ azure: () => (healthy ? azureOk() : new Response('oops', { status: 503 })) });
    const proxy = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: net.net });
    await proxy.availability();
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [proxy], maxAttempts: 3, backoffBaseMs: 10 });
    await addStory(store, 'hi');
    await gl.ensureAudio(tid('hi'), { runNow: true });
    expect((await gl.jobs('failed')).every((j) => /^server: .*HTTP 502/.test(j.lastError ?? '') && j.attempts === 1)).toBe(true);
    for (let i = 0; i < 2; i++) { clock.advance(1000); await gl.runJobs(); }
    const dead = await gl.jobs('dead');
    expect(dead).toHaveLength(3);
    expect(dead.every((j) => j.attempts === 3 && j.log.some((l) => /dead after 3 attempts/.test(l.message)))).toBe(true);
    expect((await store.audioSegments.all()).every((s) => s.status === 'failed' && !s.assetId)).toBe(true);
    const st = await gl.audioStatus(tid('hi'));
    expect(st).toMatchObject({ state: 'failed', failedSegments: 3, evidenceEligible: false });
    expect(st.reason).toMatch(/3 of 3 sentences could not be voiced: server: /);
    healthy = true;
    expect(await gl.retryDead()).toBe(3);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.audioStatus(tid('hi'))).state).toBe('preview-only');
  });

  it('network error (proxy unreachable): retryable failure kept as the reason; succeeds when it returns', async () => {
    let up = false;
    const inner = proxyNetwork();
    const net = (async (i: RequestInfo | URL, init?: RequestInit) => {
      if (!up && String(i).includes('/synthesize')) throw new TypeError('Failed to fetch');
      return inner.net(i, init);
    }) as unknown as typeof fetch;
    const proxy = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: net });
    await proxy.availability();
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [proxy] });
    await addStory(store, 'th');
    await gl.ensureAudio(tid('th'), { runNow: true });
    const failed = await gl.jobs('failed');
    expect(failed).toHaveLength(3);
    expect(failed.every((j) => j.lastError === 'network: Failed to fetch')).toBe(true);
    expect((await gl.audioStatus(tid('th'))).state).toBe('generating');
    up = true;
    clock.advance(1000);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.getManifest(tid('th')))!.complete).toBe(true);
  });

  it('cache keys: the provider id differs from the direct adapter, so audio made through one is never mistaken for the other', async () => {
    const net = proxyNetwork();
    const proxy = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: net.net });
    await proxy.availability();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [proxy] });
    await addStory(store, 'es');
    const a = await gl.ensureAudio(tid('es'), { runNow: true });
    const again = await gl.ensureAudio(tid('es'), { runNow: true });
    expect(again).toMatchObject({ created: 0, reused: 3 });
    expect(a.manifest.voiceConfigId).toMatch(/:speech-proxy:/);
  });
});
