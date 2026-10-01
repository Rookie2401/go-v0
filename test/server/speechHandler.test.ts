/**
 * The speech proxy handler against a MOCKED upstream fetch. Nothing here touches the network or proves anything about
 * the live Azure service: it verifies the request the proxy would send, how each outcome is mapped, the guards
 * (same origin, size, rate), and that the key never appears in any output.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BODY_BYTES, createRateLimiter, handleSpeechRequest, redactKey,
  type SpeechDeps, type SpeechEnv, type SpeechRequest, type SpeechResponse,
} from '../../server/speechHandler';
import { fixtureChunks, renderFixtureChunks } from '../../src/golisten';

const KEY = 'SECRET-KEY-0123456789abcdef';
const REGION = 'westeurope';
const ENV: SpeechEnv = { key: KEY, region: REGION };
const HOST = 'localhost:5196';

const wav24k = (text = 'hola mundo') => renderFixtureChunks(fixtureChunks(text, 'es'), { sampleRate: 24000 }).bytes;
const bodyInit = (b: Uint8Array) => b as unknown as BodyInit;
const okWav = () => new Response(bodyInit(wav24k()), { status: 200, headers: { 'Content-Type': 'audio/x-wav' } });

type Call = { url: string; init: RequestInit };
function mockUpstream(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const synthBody = (over: Record<string, unknown> = {}) => JSON.stringify({ text: 'Yo creo en Dios.', voice: 'es-MX-DaliaNeural', locale: 'es-MX', format: 'riff-24khz-16bit-mono-pcm', ...over });
const post = (body: string | Uint8Array | undefined, headers: Record<string, string> = {}): SpeechRequest => ({
  method: 'POST', path: '/api/speech/synthesize', headers: { host: HOST, origin: `http://${HOST}`, 'content-type': 'application/json', ...headers }, body,
});
const get = (path: string, query: Record<string, string> = {}, headers: Record<string, string> = {}): SpeechRequest => ({ method: 'GET', path, query, headers: { host: HOST, ...headers } });

function deps(fetchFn: typeof fetch, extra: Partial<SpeechDeps> = {}): SpeechDeps {
  return { fetch: fetchFn, now: () => 1_000_000, ...extra };
}
const text = (r: SpeechResponse) => (typeof r.body === 'string' ? r.body : new TextDecoder().decode(r.body));
const parse = (r: SpeechResponse) => JSON.parse(text(r)) as Record<string, unknown>;
/** Everything a caller could observe of a response. */
const surface = (r: SpeechResponse) => `${r.status}\n${JSON.stringify(r.headers)}\n${typeof r.body === 'string' ? r.body : new TextDecoder('latin1').decode(r.body)}`;

afterEach(() => { vi.restoreAllMocks(); });

describe('status', () => {
  const noFetch = mockUpstream(() => { throw new Error('status must not call upstream'); });

  it('configured: provider, version and region, never the key; no upstream call', async () => {
    const r = await handleSpeechRequest(get('/api/speech/status'), ENV, deps(noFetch.fn));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(parse(r)).toMatchObject({ configured: true, provider: 'azure-speech', providerVersion: 'azure-proxy@1', region: REGION, format: 'riff-24khz-16bit-mono-pcm' });
    expect(surface(r)).not.toContain(KEY);
    expect(noFetch.calls).toHaveLength(0);
  });

  it.each([
    ['no key', { region: REGION }],
    ['no region', { key: KEY }],
    ['empty', {}],
    ['invalid region', { key: KEY, region: 'not a region!' }],
  ] as Array<[string, SpeechEnv]>)('unconfigured (%s): configured:false and no region', async (_n, env) => {
    const r = await handleSpeechRequest(get('/api/speech/status'), env, deps(noFetch.fn));
    expect(r.status).toBe(200);
    const doc = parse(r);
    expect(doc).toMatchObject({ configured: false, provider: 'azure-speech', providerVersion: 'azure-proxy@1' });
    expect(doc).not.toHaveProperty('region');
    expect(surface(r)).not.toContain(KEY);
  });

  it('is GET only; unknown paths are 404; the trailing slash is tolerated', async () => {
    expect((await handleSpeechRequest({ ...get('/api/speech/status'), method: 'POST' }, ENV, deps(noFetch.fn))).status).toBe(405);
    expect((await handleSpeechRequest(get('/api/speech/nope'), ENV, deps(noFetch.fn))).status).toBe(404);
    expect((await handleSpeechRequest(get('/api/speech/status/'), ENV, deps(noFetch.fn))).status).toBe(200);
    expect((await handleSpeechRequest({ ...get('/api/speech/synthesize'), method: 'GET' }, ENV, deps(noFetch.fn))).status).toBe(405);
  });
});

describe('synthesize', () => {
  it('success: posts SSML for the voice with the key header, asks for riff-24khz-16bit-mono-pcm, returns the WAV with provenance headers', async () => {
    const up = mockUpstream(() => okWav());
    const r = await handleSpeechRequest(post(synthBody({ text: 'Tom & <Jerry> "say"' })), ENV, deps(up.fn));
    expect(up.calls).toHaveLength(1);
    const { url, init } = up.calls[0];
    expect(url).toBe(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`);
    expect(init.method).toBe('POST');
    const h = init.headers as Record<string, string>;
    expect(h['Ocp-Apim-Subscription-Key']).toBe(KEY);
    expect(h['Content-Type']).toBe('application/ssml+xml');
    expect(h['X-Microsoft-OutputFormat']).toBe('riff-24khz-16bit-mono-pcm');
    expect(init.body).toBe('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-MX"><voice name="es-MX-DaliaNeural">Tom &amp; &lt;Jerry&gt; &quot;say&quot;</voice></speak>');

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('audio/wav');
    expect(r.headers['x-speech-delivered-locale']).toBe('es-MX');
    expect(r.headers['x-speech-provider-version']).toBe('azure-proxy@1');
    expect(r.body).toBeInstanceOf(Uint8Array);
    expect(Array.from((r.body as Uint8Array).slice(0, 4))).toEqual([0x52, 0x49, 0x46, 0x46]);
    expect(surface(r)).not.toContain(KEY);
  });

  it('delivered locale is the VOICE\'s locale even when another was requested', async () => {
    const up = mockUpstream(() => okWav());
    const r = await handleSpeechRequest(post(synthBody({ locale: 'es-HN', voice: 'es-MX-DaliaNeural' })), ENV, deps(up.fn));
    expect(r.headers['x-speech-requested-locale']).toBe('es-HN');
    expect(r.headers['x-speech-delivered-locale']).toBe('es-MX');
  });

  it('caller SSML keeps its inner markup but is re-wrapped in the validated voice element', async () => {
    const up = mockUpstream(() => okWav());
    await handleSpeechRequest(post(synthBody({ text: undefined, ssml: '<speak version="1.0"><voice name="evil">Yo creo en <lang xml:lang="es-ES">Dios</lang>.</voice></speak>' })), ENV, deps(up.fn));
    const sent = String(up.calls[0].init.body);
    expect(sent.startsWith('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-MX"><voice name="es-MX-DaliaNeural">')).toBe(true);
    expect(sent).toContain('<lang xml:lang="es-ES">Dios</lang>');
  });

  it('401 and 403 from Azure -> 401 missing-credentials (no retry hint, no upstream body)', async () => {
    for (const status of [401, 403]) {
      const up = mockUpstream(() => new Response(`denied for ${KEY}`, { status }));
      const r = await handleSpeechRequest(post(synthBody()), ENV, deps(up.fn));
      expect(r.status).toBe(401);
      expect(parse(r)).toMatchObject({ error: 'missing-credentials' });
      expect(r.headers['retry-after']).toBeUndefined();
      expect(surface(r)).not.toContain(KEY);
      expect(surface(r)).not.toContain('denied');
    }
  });

  it('429 from Azure -> 429 rate-limited with Retry-After passed through; without it, none is invented', async () => {
    const r = await handleSpeechRequest(post(synthBody()), ENV, deps(mockUpstream(() => new Response('', { status: 429, headers: { 'Retry-After': '7' } })).fn));
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('7');
    expect(parse(r)).toMatchObject({ error: 'rate-limited' });
    const r2 = await handleSpeechRequest(post(synthBody()), ENV, deps(mockUpstream(() => new Response('', { status: 429 })).fn));
    expect(r2.status).toBe(429);
    expect(r2.headers['retry-after']).toBeUndefined();
  });

  it('5xx from Azure -> 502 upstream-error; other 4xx -> 400 bad-request', async () => {
    for (const status of [500, 502, 503]) {
      const r = await handleSpeechRequest(post(synthBody()), ENV, deps(mockUpstream(() => new Response(`oops ${KEY}`, { status })).fn));
      expect(r.status).toBe(502);
      expect(parse(r)).toMatchObject({ error: 'upstream-error' });
      expect(surface(r)).not.toContain(KEY);
      expect(surface(r)).not.toContain('oops');
    }
    const r400 = await handleSpeechRequest(post(synthBody()), ENV, deps(mockUpstream(() => new Response('bad ssml', { status: 400 })).fn));
    expect(r400.status).toBe(400);
    expect(parse(r400)).toMatchObject({ error: 'bad-request' });
  });

  it('a request that never answers is aborted after timeoutMs -> 504 upstream-timeout', async () => {
    const hang = ((_u: unknown, init: RequestInit) => new Promise((_res, rej) => { init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); })) as unknown as typeof fetch;
    const r = await handleSpeechRequest(post(synthBody()), ENV, deps(hang, { timeoutMs: 15 }));
    expect(r.status).toBe(504);
    expect(parse(r)).toMatchObject({ error: 'upstream-timeout' });
  });

  it('a network failure -> 504 upstream-unreachable, and an error message carrying the key does not leak', async () => {
    const lines: string[] = [];
    const boom = (async () => { throw new TypeError(`connect failed for ${KEY}`); }) as unknown as typeof fetch;
    const r = await handleSpeechRequest(post(synthBody()), ENV, deps(boom, { log: (l) => lines.push(l) }));
    expect(r.status).toBe(504);
    expect(parse(r)).toMatchObject({ error: 'upstream-unreachable' });
    expect(surface(r)).not.toContain(KEY);
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('a 200 that is not a WAV (or is empty) -> 502 upstream-error', async () => {
    for (const payload of [new Uint8Array(0), new TextEncoder().encode('definitely not a wav file, just words'.repeat(3))]) {
      const r = await handleSpeechRequest(post(synthBody()), ENV, deps(mockUpstream(() => new Response(bodyInit(payload), { status: 200 })).fn));
      expect(r.status).toBe(502);
      expect(parse(r)).toMatchObject({ error: 'upstream-error' });
    }
  });

  it('unconfigured server: 401 missing-credentials with the instruction, and nothing is sent upstream', async () => {
    const up = mockUpstream(() => okWav());
    const r = await handleSpeechRequest(post(synthBody()), {}, deps(up.fn));
    expect(r.status).toBe(401);
    expect(parse(r)).toMatchObject({ error: 'missing-credentials' });
    expect(text(r)).toMatch(/AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in \.env\.local/);
    expect(up.calls).toHaveLength(0);
  });

  it.each([
    ['invalid JSON', '{nope', /JSON/],
    ['an array', '[]', /object/],
    ['no text or ssml', JSON.stringify({ voice: 'es-MX-DaliaNeural', locale: 'es-MX' }), /text or ssml/],
    ['empty text', synthBody({ text: '   ' }), /empty/],
    ['no voice', synthBody({ voice: undefined }), /voice/],
    ['a voice with markup', synthBody({ voice: 'es-MX"><x/>' }), /voice/],
    ['an unsupported format', synthBody({ format: 'audio-16khz-32kbitrate-mono-mp3' }), /riff-24khz/],
    ['a bad locale', synthBody({ locale: 'not a locale' }), /locale/],
    ['text over the limit', synthBody({ text: 'a'.repeat(5001) }), /limited to 5000/],
  ] as Array<[string, string, RegExp]>)('400 for %s, without touching upstream', async (_n, body, msg) => {
    const up = mockUpstream(() => okWav());
    const r = await handleSpeechRequest(post(body), ENV, deps(up.fn));
    expect(r.status).toBe(400);
    expect(parse(r).message).toMatch(msg);
    expect(up.calls).toHaveLength(0);
  });

  it('the locale defaults to the voice\'s own locale', async () => {
    const up = mockUpstream(() => okWav());
    const r = await handleSpeechRequest(post(synthBody({ locale: undefined })), ENV, deps(up.fn));
    expect(r.status).toBe(200);
    expect(String(up.calls[0].init.body)).toContain('xml:lang="es-MX"');
  });
});

describe('guards', () => {
  it('rejects an oversized body with 413 before anything else (string and bytes)', async () => {
    const up = mockUpstream(() => okWav());
    const big = synthBody({ text: 'a'.repeat(MAX_BODY_BYTES) });
    const r = await handleSpeechRequest(post(big), ENV, deps(up.fn));
    expect(r.status).toBe(413);
    expect(parse(r)).toMatchObject({ error: 'payload-too-large' });
    const r2 = await handleSpeechRequest(post(new TextEncoder().encode(big)), ENV, deps(up.fn));
    expect(r2.status).toBe(413);
    expect(up.calls).toHaveLength(0);
    // a body exactly at the limit is not "too large" (it fails later, on content)
    const atLimit = await handleSpeechRequest(post(' '.repeat(MAX_BODY_BYTES)), ENV, deps(up.fn));
    expect(atLimit.status).toBe(400);
  });

  it('same origin only: a different Origin, an unparseable Origin and Sec-Fetch-Site cross-site / same-site are 403', async () => {
    const up = mockUpstream(() => okWav());
    for (const headers of [{ origin: 'https://evil.example' }, { origin: 'http://localhost:9999' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }] as Array<Record<string, string>>) {
      const r = await handleSpeechRequest(post(synthBody(), headers), ENV, deps(up.fn));
      expect(r.status).toBe(403);
      expect(parse(r)).toMatchObject({ error: 'forbidden-origin' });
    }
    const status = await handleSpeechRequest(get('/api/speech/status', {}, { origin: 'https://evil.example' }), ENV, deps(up.fn));
    expect(status.status).toBe(403);
    expect(up.calls).toHaveLength(0);
    // same origin (Origin = Host, or Sec-Fetch-Site same-origin / none, or no Origin at all) is accepted
    for (const headers of [{ origin: `http://${HOST}` }, { origin: `http://${HOST}`, 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'none', origin: undefined as unknown as string }]) {
      const h = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined)) as Record<string, string>;
      expect((await handleSpeechRequest({ ...post(synthBody()), headers: { host: HOST, ...h } }, ENV, deps(up.fn))).status).toBe(200);
    }
  });

  it('per-minute rate limit: the limit is enforced with Retry-After and the window slides', async () => {
    let now = 1_000_000;
    const up = mockUpstream(() => okWav());
    const d = deps(up.fn, { now: () => now, limiter: createRateLimiter({ limit: 3, now: () => now }) });
    for (let i = 0; i < 3; i++) expect((await handleSpeechRequest(post(synthBody()), ENV, d)).status).toBe(200);
    const limited = await handleSpeechRequest(post(synthBody()), ENV, d);
    expect(limited.status).toBe(429);
    expect(parse(limited)).toMatchObject({ error: 'rate-limited' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(up.calls).toHaveLength(3); // the limited request never went upstream
    // status is free and not counted
    expect((await handleSpeechRequest(get('/api/speech/status'), ENV, d)).status).toBe(200);
    now += 61_000;
    expect((await handleSpeechRequest(post(synthBody()), ENV, d)).status).toBe(200);
  });

  it('the limiter keys callers apart', () => {
    let now = 0;
    const l = createRateLimiter({ limit: 1, now: () => now });
    expect(l.take('a').ok).toBe(true);
    expect(l.take('a').ok).toBe(false);
    expect(l.take('b').ok).toBe(true);
    now += 60_001;
    expect(l.take('a').ok).toBe(true);
  });
});

describe('voices', () => {
  const azureList = [
    { Name: 'x', ShortName: 'es-MX-DaliaNeural', Gender: 'Female', Locale: 'es-MX' },
    { Name: 'x', ShortName: 'es-HN-KarlaNeural', Gender: 'Female', Locale: 'es-HN' },
    { Name: 'x', ShortName: 'de-DE-KatjaNeural', Gender: 'Female', Locale: 'de-DE' },
    { Name: 'x', ShortName: 'hi-IN-MadhurNeural', Gender: 'Male', Locale: 'hi-IN' },
    { Name: 'broken' },
  ];
  it('filters the live list by language and shapes it for the browser', async () => {
    const up = mockUpstream(() => new Response(JSON.stringify(azureList), { status: 200, headers: { 'content-type': 'application/json' } }));
    const r = await handleSpeechRequest(get('/api/speech/voices', { lang: 'es' }), ENV, deps(up.fn));
    expect(up.calls[0].url).toBe(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list`);
    expect((up.calls[0].init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe(KEY);
    expect(r.status).toBe(200);
    expect(parse(r).voices).toEqual([
      { id: 'es-MX-DaliaNeural', name: 'Azure es-MX-DaliaNeural', lang: 'es', locale: 'es-MX', gender: 'female' },
      { id: 'es-HN-KarlaNeural', name: 'Azure es-HN-KarlaNeural', lang: 'es', locale: 'es-HN', gender: 'female' },
    ]);
    expect(surface(r)).not.toContain(KEY);
  });
  it('without lang returns every voice; a bad lang is 400; unconfigured is 401; upstream failures are mapped', async () => {
    const list = () => new Response(JSON.stringify(azureList), { status: 200 });
    expect((parse(await handleSpeechRequest(get('/api/speech/voices'), ENV, deps(mockUpstream(list).fn))).voices as unknown[]).length).toBe(4);
    expect((await handleSpeechRequest(get('/api/speech/voices', { lang: 'e/s' }), ENV, deps(mockUpstream(list).fn))).status).toBe(400);
    expect((await handleSpeechRequest(get('/api/speech/voices', { lang: 'es' }), {}, deps(mockUpstream(list).fn))).status).toBe(401);
    expect((await handleSpeechRequest(get('/api/speech/voices', { lang: 'es' }), ENV, deps(mockUpstream(() => new Response('', { status: 403 })).fn))).status).toBe(401);
    expect((await handleSpeechRequest(get('/api/speech/voices', { lang: 'es' }), ENV, deps(mockUpstream(() => new Response('', { status: 500 })).fn))).status).toBe(502);
    expect((await handleSpeechRequest(get('/api/speech/voices', { lang: 'es' }), ENV, deps(mockUpstream(() => new Response('<html>', { status: 200 })).fn))).status).toBe(502);
    expect((await handleSpeechRequest({ ...get('/api/speech/voices'), method: 'POST' }, ENV, deps(mockUpstream(list).fn))).status).toBe(405);
  });
});

describe('the key never leaks', () => {
  it('not through any response, header, thrown message or log line, whatever upstream echoes', async () => {
    const log = vi.spyOn(console, 'log'), warn = vi.spyOn(console, 'warn'), error = vi.spyOn(console, 'error'), info = vi.spyOn(console, 'info');
    const lines: string[] = [];
    const seen: string[] = [];
    const echo = (status: number, headers: Record<string, string> = {}) => mockUpstream(() => new Response(`echo ${KEY} ${KEY}`, { status, headers: { ...headers, 'x-echo': KEY } })).fn;
    const throwing = [
      (async () => { throw new Error(`boom ${KEY}`); }) as unknown as typeof fetch,
      (async () => { throw Object.assign(new Error(KEY), { name: 'AbortError' }); }) as unknown as typeof fetch,
      (async () => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => { throw new Error(KEY); }, json: async () => { throw new Error(KEY); } })) as unknown as typeof fetch,
    ];
    const fetches = [echo(200), echo(401), echo(403), echo(429, { 'retry-after': '3' }), echo(500), echo(503), echo(400), echo(404), mockUpstream(() => okWav()).fn, ...throwing];
    const reqs: SpeechRequest[] = [
      post(synthBody()), post(synthBody({ text: KEY })), post('{broken'), post(synthBody({ voice: KEY })), get('/api/speech/status'),
      get('/api/speech/voices', { lang: 'es' }), get('/api/speech/voices', { lang: KEY }), get('/api/speech/' + KEY),
      post(synthBody(), { origin: 'https://evil.example' }), post('x'.repeat(MAX_BODY_BYTES + 1)),
    ];
    for (const f of fetches) {
      for (const r of reqs) {
        const out = await handleSpeechRequest(r, ENV, deps(f, { log: (l) => lines.push(l) }));
        seen.push(surface(out));
      }
    }
    // the incoming text/voice is the caller's own and may be echoed back to that caller (it is not the key)
    // — but nothing may contain the *configured* key unless the caller supplied it; so use a caller-free request set too
    const clean = [post(synthBody()), get('/api/speech/status'), get('/api/speech/voices', { lang: 'es' })];
    for (const f of fetches) for (const r of clean) {
      const out = await handleSpeechRequest(r, ENV, deps(f, { log: (l) => lines.push(l) }));
      expect(surface(out)).not.toContain(KEY);
    }
    expect(lines.join('\n')).not.toContain(KEY);
    for (const spy of [log, warn, error, info]) expect(spy).not.toHaveBeenCalled();
    expect(seen.length).toBeGreaterThan(50);
  });

  it('upstream bodies and headers are never forwarded, only mapped', async () => {
    const r = await handleSpeechRequest(post(synthBody()), ENV, deps(mockUpstream(() => new Response('INTERNAL-DETAIL', { status: 500, headers: { 'x-secret-trace': 'T' } })).fn));
    expect(surface(r)).not.toMatch(/INTERNAL-DETAIL|x-secret-trace/i);
  });

  it('redactKey removes every occurrence and is a no-op without a key', () => {
    expect(redactKey(`a ${KEY} b ${KEY}`, KEY)).toBe('a *** b ***');
    expect(redactKey('plain', undefined)).toBe('plain');
  });
});
