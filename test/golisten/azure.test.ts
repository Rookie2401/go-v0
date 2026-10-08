/**
 * AzureSpeechProvider against a MOCKED fetch. Nothing here touches the network or proves anything about the live
 * service: it verifies the request we would send, how each HTTP outcome is classified, and that the pipeline
 * records, retries and reports those outcomes honestly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ids, type AppStore, type LanguageCode } from '../../src/core';
import { AZURE_OUTPUT_FORMAT, AZURE_VOICES, AzureSpeechProvider, TtsProviderError, fixtureChunks, renderFixtureChunks, validateWav } from '../../src/golisten';
import { AZURE_LANGS, LANGS, addStory, makeEnv } from './support';

const KEY = 'SECRET-KEY-0123456789abcdef';
const REGION = 'westeurope';
const tid = (lang: LanguageCode) => ids.text(lang, 'story-01');

/** A real, valid 24 kHz mono PCM16 WAV (tone bursts standing in for what Azure would return). */
const wav24k = (text = 'hola mundo') => renderFixtureChunks(fixtureChunks(text, 'es'), { sampleRate: 24000 }).bytes;

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function mockFetch(handler: Handler) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const body = (b: Uint8Array) => b as unknown as BodyInit;
const ok = () => new Response(body(wav24k()), { status: 200, headers: { 'Content-Type': 'audio/x-wav' } });
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('AzureSpeechProvider request and response', () => {
  it('declares itself: real speech, REST wav only, no word marks, no phoneme claim', () => {
    const p = new AzureSpeechProvider({ key: KEY, region: REGION });
    expect(p).toMatchObject({ id: 'azure-speech', isSpeech: true, region: REGION });
    expect(p.version).toMatch(/^azure-rest@/);
    expect(p.capabilities()).toMatchObject({ wordBoundaries: false, phonemeOverrides: false, outputFormats: ['audio/wav'], streaming: false });
  });

  it.each(AZURE_LANGS)('%s: posts SSML for the static voice, asks for riff-24khz-16bit-mono-pcm, and returns a validatable WAV with no marks', async (lang) => {
    const { fn, calls } = mockFetch(() => ok());
    const p = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const voices = await p.listVoices(lang);
    expect(voices.length).toBeGreaterThan(0);
    const v = voices[0];
    const r = await p.synthesize({ text: 'Tom & <Jerry> "say"', lang, locale: v.locale, voiceId: v.id, format: 'audio/wav', settings: {} });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`);
    expect(init.method).toBe('POST');
    expect(header(init, 'Ocp-Apim-Subscription-Key')).toBe(KEY);
    expect(header(init, 'Content-Type')).toBe('application/ssml+xml');
    expect(header(init, 'X-Microsoft-OutputFormat')).toBe(AZURE_OUTPUT_FORMAT);
    expect(AZURE_OUTPUT_FORMAT).toBe('riff-24khz-16bit-mono-pcm');
    expect(init.body).toBe(`<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${v.locale}"><voice name="${v.id}">Tom &amp; &lt;Jerry&gt; &quot;say&quot;</voice></speak>`);

    expect(r).toMatchObject({ mime: 'audio/wav', sampleRate: 24000, channels: 1, engine: 'azure-neural-tts', actualLocale: v.locale });
    expect(r.wordMarks).toBeUndefined();
    expect(validateWav(r.bytes, { expectedSampleRate: 24000 }).ok).toBe(true);
  });

  it('keeps the voice table honest: no es-HN voice, es-MX/es-US/es-ES fallbacks; one locale-prefixed voice per language', async () => {
    const p = new AzureSpeechProvider({ key: KEY, region: REGION });
    const es = (await p.listVoices('es')).map((v) => v.locale);
    expect(es).not.toContain('es-HN');
    expect(new Set(es)).toEqual(new Set(['es-MX', 'es-US', 'es-ES']));
    for (const lang of LANGS) {
      for (const v of AZURE_VOICES[lang]) expect(v.id.startsWith(v.locale + '-')).toBe(true);
    }
    expect((await p.listVoices('th'))[0].locale).toBe('th-TH');
  });

  it('honours caller-built SSML (pronunciation override) by wrapping its inner markup in the voice element', async () => {
    const { fn, calls } = mockFetch(() => ok());
    const p = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    await p.synthesize({
      text: 'Yo creo en Dios.', lang: 'es', locale: 'es-MX', voiceId: 'es-MX-DaliaNeural', format: 'audio/wav', settings: {},
      ssml: '<speak version="1.0" xml:lang="es-MX">Yo creo en <lang xml:lang="es-ES">Dios</lang>.</speak>',
    });
    expect(calls[0].init.body).toBe('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-MX"><voice name="es-MX-DaliaNeural">Yo creo en <lang xml:lang="es-ES">Dios</lang>.</voice></speak>');
  });

  it('refuses unknown voices, non-wav formats and missing credentials before any request', async () => {
    const { fn, calls } = mockFetch(() => ok());
    const p = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const base = { text: 'hola', lang: 'es' as const, locale: 'es-MX', voiceId: 'es-MX-DaliaNeural', format: 'audio/wav', settings: {} };
    await expect(p.synthesize({ ...base, voiceId: 'nope' })).rejects.toMatchObject({ name: 'TtsProviderError', kind: 'bad-request' });
    await expect(p.synthesize({ ...base, format: 'audio/mpeg' })).rejects.toMatchObject({ kind: 'bad-request' });
    const noKey = new AzureSpeechProvider({ key: '', region: REGION, fetch: fn });
    await expect(noKey.synthesize(base)).rejects.toMatchObject({ kind: 'missing-credentials' });
    expect(calls).toHaveLength(0);
  });

  it('availability: missing key / region / bad region are missing-credentials; offline device is offline; otherwise available', async () => {
    expect(await new AzureSpeechProvider({ key: '', region: REGION }).availability()).toMatchObject({ available: false, reason: 'missing-credentials' });
    expect(await new AzureSpeechProvider({ key: KEY, region: '' }).availability()).toMatchObject({ available: false, reason: 'missing-credentials' });
    expect(await new AzureSpeechProvider({ key: KEY, region: 'not a region!' }).availability()).toMatchObject({ available: false, reason: 'missing-credentials' });
    const good = new AzureSpeechProvider({ key: KEY, region: REGION });
    const a = await good.availability();
    expect(a.available).toBe(true);
    expect(JSON.stringify(a)).not.toContain(KEY);
    vi.stubGlobal('navigator', { onLine: false });
    expect(await good.availability()).toMatchObject({ available: false, reason: 'offline' });
  });

  it('never exposes the key: toJSON, enumerable fields and error messages are free of it', async () => {
    const p = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: mockFetch(() => new Response(`bad key ${KEY}`, { status: 400 })).fn });
    expect(JSON.stringify(p)).not.toContain(KEY);
    expect(JSON.stringify(p)).toContain('hasKey');
    expect(Object.values(p).join('|')).not.toContain(KEY);
    const err = await p.synthesize({ text: 'hola', lang: 'es', locale: 'es-MX', voiceId: 'es-MX-DaliaNeural', format: 'audio/wav', settings: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TtsProviderError);
    expect((err as Error).message).not.toContain(KEY);
    expect((err as Error).message).toMatch(/bad-request: Azure rejected the request \(HTTP 400\): bad key \*\*\*/);
    const net = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: (async () => { throw new TypeError(`connect failed for ${KEY}`); }) as unknown as typeof fetch });
    const nerr = await net.synthesize({ text: 'hola', lang: 'es', locale: 'es-MX', voiceId: 'es-MX-DaliaNeural', format: 'audio/wav', settings: {} }).catch((e: unknown) => e);
    expect(nerr).toMatchObject({ kind: 'network' });
    expect((nerr as Error).message).not.toContain(KEY);
  });

  it('classifies HTTP outcomes: 401/403 missing-credentials (sticky), 429 rate-limited with Retry-After, 5xx server, 4xx bad-request, empty/garbage bad-response', async () => {
    const req = { text: 'hola', lang: 'es' as const, locale: 'es-MX', voiceId: 'es-MX-DaliaNeural', format: 'audio/wav', settings: {} };
    const run = (res: () => Response) => new AzureSpeechProvider({ key: KEY, region: REGION, fetch: mockFetch(res).fn }).synthesize(req).catch((e: unknown) => e as TtsProviderError);

    const e401 = await run(() => new Response('', { status: 401 }));
    expect(e401).toMatchObject({ kind: 'missing-credentials', status: 401, retryable: false });
    const e429 = await run(() => new Response('', { status: 429, headers: { 'Retry-After': '7' } }));
    expect(e429).toMatchObject({ kind: 'rate-limited', status: 429, retryAfterMs: 7000, retryable: true });
    expect(await run(() => new Response('', { status: 429 }))).toMatchObject({ kind: 'rate-limited', retryAfterMs: undefined });
    expect(await run(() => new Response('', { status: 503 }))).toMatchObject({ kind: 'server', retryable: true });
    expect(await run(() => new Response('', { status: 400 }))).toMatchObject({ kind: 'bad-request', retryable: false });
    expect(await run(() => new Response('', { status: 404 }))).toMatchObject({ kind: 'bad-request' });
    expect(await run(() => new Response(new Uint8Array(0), { status: 200 }))).toMatchObject({ kind: 'bad-response' });
    expect(await run(() => new Response('definitely not a wav file', { status: 200 }))).toMatchObject({ kind: 'bad-response' });

    const p = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: mockFetch(() => new Response('', { status: 403 })).fn });
    await p.synthesize(req).catch(() => undefined);
    expect(await p.availability()).toMatchObject({ available: false, reason: 'missing-credentials' }); // flips until a new key is registered
    await expect(p.synthesize(req)).rejects.toMatchObject({ kind: 'missing-credentials' });
  });

  it('a request that never answers is aborted after timeoutMs and reported as a retryable network failure', async () => {
    const hang = ((_u: unknown, init: RequestInit) => new Promise((_res, rej) => { init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); })) as unknown as typeof fetch;
    const p = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: hang, timeoutMs: 15 });
    const err = await p.synthesize({ text: 'hola', lang: 'es', locale: 'es-MX', voiceId: 'es-MX-DaliaNeural', format: 'audio/wav', settings: {} }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'network', retryable: true });
  });
});

async function dump(store: AppStore): Promise<string> {
  const rows: unknown[] = [];
  for (const t of ['voices', 'audioAssets', 'audioSegments', 'alignments', 'manifests', 'audioJobs', 'events', 'meta'] as const) rows.push(await store[t].all());
  return JSON.stringify(rows);
}

describe('AzureSpeechProvider through GoListen (mocked fetch)', () => {
  it.each(AZURE_LANGS)('%s: generates validated audio, records requested vs delivered locale, voice, provider + version, isSpeech, and stays unreviewed until a person says otherwise', async (lang) => {
    const { fn, calls } = mockFetch(() => ok());
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, lang);
    const r = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(r).toMatchObject({ created: 3, failed: 0 });
    expect(r.manifest.complete).toBe(true);
    expect(calls).toHaveLength(3);

    const voice = (await store.voices.get(r.manifest.voiceConfigId))!;
    const first = AZURE_VOICES[lang][0];
    expect(voice).toMatchObject({ providerId: 'azure-speech', providerVersion: 'azure-rest@1', voiceId: first.id, isSpeech: true, reviewStatus: 'unreviewed', approved: false, actualLocale: first.locale });
    if (lang === 'es') {
      expect(voice.requestedLocale).toBe('es-HN');
      expect(voice.actualLocale).toBe('es-MX'); // honest fallback
      expect(voice.qaNote).toMatch(/Fallback accent: course asked for es-HN, provider delivers es-MX/);
    } else {
      expect(voice.requestedLocale).toBe(voice.actualLocale);
    }
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    const asset = (await gl.getAsset(seg.assetId!))!;
    expect(asset).toMatchObject({ isSpeech: true, locale: first.locale, sampleRate: 24000, mime: 'audio/wav' });
    expect(asset.generation).toMatchObject({ providerId: 'azure-speech', engine: 'azure-neural-tts', voiceId: first.id });
    expect(asset.generation!.softwareVersion).toMatch(/azure-speech@azure-rest@1/);
    expect(await gl.alignments(seg.id)).toHaveLength(1); // sentence-level by construction only; Azure returned no marks

    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'preview-only', isSpeech: true, evidenceEligible: false, providerId: 'azure-speech', providerVersion: 'azure-rest@1', requestedLocale: voice.requestedLocale, deliveredLocale: first.locale });
    await gl.setVoiceReview(voice.id, 'reviewed', 'mocked test');
    // Azure speech is synthetic: an audition makes it playable practice, never listening evidence.
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'ready', evidenceEligible: false, playAllowed: true });
    expect(await dump(store)).not.toContain(KEY);
  });

  it('401: the job dies at once as missing-credentials, the provider flips to unavailable, the other jobs wait, nothing leaks the key', async () => {
    const log = vi.spyOn(console, 'log'), warn = vi.spyOn(console, 'warn'), error = vi.spyOn(console, 'error');
    const { fn, calls } = mockFetch(() => new Response('unauthorized', { status: 401 }));
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, 'es');
    const r = await gl.ensureAudio(tid('es'), { runNow: true });
    expect(r.failed).toBe(1);
    expect(calls).toHaveLength(1); // the remaining jobs were not sent with a rejected key
    const dead = await gl.jobs('dead');
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ attempts: 1 });
    expect(dead[0].lastError).toMatch(/^missing-credentials: Azure rejected the key or region \(HTTP 401\)/);
    expect(dead[0].log.some((l) => /not retryable/.test(l.message))).toBe(true);
    expect(await gl.jobs('queued')).toHaveLength(2);
    expect(await gl.availability()).toMatchObject({ available: false, reason: 'missing-credentials' });

    const st = await gl.audioStatus(tid('es'));
    expect(st.state).toBe('failed');
    expect(st.reason).toMatch(/missing-credentials/);
    expect(st).toMatchObject({ failedSegments: 1, evidenceEligible: false });
    const err = await gl.ensureAudio(tid('es')).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'AudioUnavailable', reason: 'missing-credentials' });
    clock.advance(3_600_000);
    expect(await gl.runJobs()).toBe(0);
    expect(calls).toHaveLength(1);

    // the learner enters working credentials: a new provider replaces the old one and the dead job is requeued
    const good = mockFetch(() => ok());
    gl.registerProvider(new AzureSpeechProvider({ key: 'NEW-KEY-xyz', region: REGION, fetch: good.fn }));
    expect(await gl.availability()).toMatchObject({ available: true });
    expect(await gl.retryDead()).toBe(1);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.getManifest(tid('es')))!.complete).toBe(true);
    expect(good.calls).toHaveLength(3);
    const all = await dump(store);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('NEW-KEY-xyz');
    for (const spy of [log, warn, error]) expect(spy).not.toHaveBeenCalled();
  });

  it('429: retried with backoff, honouring Retry-After, then succeeds without a duplicate asset', async () => {
    let n = 0;
    const { fn, calls } = mockFetch(() => (++n <= 3 ? new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } }) : ok()));
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, 'de');
    await gl.ensureAudio(tid('de'), { runNow: true });
    expect(calls).toHaveLength(3);
    const failed = await gl.jobs('failed');
    expect(failed).toHaveLength(3);
    for (const j of failed) {
      expect(j.lastError).toMatch(/^rate-limited: /);
      expect(Date.parse(j.nextAttemptAt!) - Date.parse(clock.now())).toBe(7000); // Retry-After (7 s) beats the 1 s base backoff
    }
    expect((await gl.audioStatus(tid('de'))).state).toBe('generating');
    expect(await gl.runJobs()).toBe(0);
    clock.advance(6999);
    expect(await gl.runJobs()).toBe(0);
    clock.advance(1);
    expect(await gl.runJobs()).toBe(3);
    expect(calls).toHaveLength(6);
    expect(await store.audioAssets.count()).toBe(1); // the mock returns identical bytes for every sentence: content-addressed, and the retries added none
    expect((await gl.jobs('succeeded')).every((j) => j.attempts === 2)).toBe(true);
  });

  it('429 without Retry-After uses exponential backoff (1 s, then 2 s)', async () => {
    let n = 0;
    const { fn } = mockFetch(() => (++n <= 6 ? new Response('', { status: 429 }) : ok()));
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, 'sq');
    await gl.ensureAudio(tid('sq'), { runNow: true });
    expect((await gl.jobs('failed')).every((j) => Date.parse(j.nextAttemptAt!) - Date.parse(clock.now()) === 1000)).toBe(true);
    clock.advance(1000);
    await gl.runJobs();
    expect((await gl.jobs('failed')).every((j) => j.attempts === 2 && Date.parse(j.nextAttemptAt!) - Date.parse(clock.now()) === 2000)).toBe(true);
  });

  it('5xx: failed job, retried, then dead after maxAttempts; segment failed; status names the server error; retryDead recovers', async () => {
    let healthy = false;
    const { fn, calls } = mockFetch(() => (healthy ? ok() : new Response('oops', { status: 503 })));
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [azure], maxAttempts: 3, backoffBaseMs: 10 });
    await addStory(store, 'hi');
    await gl.ensureAudio(tid('hi'), { runNow: true });
    expect((await gl.jobs('failed')).every((j) => /^server: Azure server error \(HTTP 503\)/.test(j.lastError ?? '') && j.attempts === 1)).toBe(true);
    for (let i = 0; i < 2; i++) { clock.advance(1000); await gl.runJobs(); }
    expect(calls).toHaveLength(9);
    const dead = await gl.jobs('dead');
    expect(dead).toHaveLength(3);
    expect(dead.every((j) => j.attempts === 3 && j.log.some((l) => /dead after 3 attempts/.test(l.message)))).toBe(true);
    expect((await store.audioSegments.all()).every((s) => s.status === 'failed' && !s.assetId)).toBe(true);
    const st = await gl.audioStatus(tid('hi'));
    expect(st).toMatchObject({ state: 'failed', failedSegments: 3, evidenceEligible: false });
    expect(st.reason).toMatch(/HTTP 503/);
    expect((await gl.diagnostics(tid('hi'))).deadJobs).toBe(3);

    healthy = true;
    expect(await gl.retryDead()).toBe(3);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.audioStatus(tid('hi'))).state).toBe('preview-only');
  });

  it('network error: retryable failure with the reason kept; succeeds when the network returns', async () => {
    let up = false;
    const { fn } = mockFetch(() => { if (!up) throw new TypeError('Failed to fetch'); return ok(); });
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, 'th');
    await gl.ensureAudio(tid('th'), { runNow: true });
    const failed = await gl.jobs('failed');
    expect(failed).toHaveLength(3);
    expect(failed.every((j) => j.lastError === 'network: Failed to fetch')).toBe(true);
    const st = await gl.audioStatus(tid('th'));
    expect(st.state).toBe('generating');
    expect(st.reason).toMatch(/being retried after an error \(network: Failed to fetch\)/);
    up = true;
    clock.advance(1000);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.getManifest(tid('th')))!.complete).toBe(true);
  });

  it('400: a malformed request is dead immediately (a retry cannot fix it) and is reported', async () => {
    const { fn, calls } = mockFetch(() => new Response('bad ssml', { status: 400 }));
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, 'es');
    await gl.ensureAudio(tid('es'), { runNow: true });
    expect(calls).toHaveLength(3);
    const dead = await gl.jobs('dead');
    expect(dead).toHaveLength(3);
    expect(dead.every((j) => j.attempts === 1 && /bad-request/.test(j.lastError ?? ''))).toBe(true);
    expect((await gl.audioStatus(tid('es'))).state).toBe('failed');
  });

  it('a lang-tag pronunciation entry is sent to Azure as SSML and recorded as used', async () => {
    const { fn, calls } = mockFetch(() => ok());
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: fn });
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, 'es');
    await store.pronunciations.put({ id: 'lt1', lang: 'es', match: 'Dios', mechanism: 'lang-tag', value: 'es-ES', provenance: 'human', reviewed: true, lexiconVersion: '1' });
    const r = await gl.ensureAudio(tid('es'), { runNow: true });
    const body = calls.map((c) => String(c.init.body)).find((b) => b.includes('Yo creo en'))!;
    expect(body).toContain('<voice name="es-MX-DaliaNeural">Yo creo en <lang xml:lang="es-ES">Dios</lang>.</voice>');
    expect((await gl.getSegment(r.manifest.segmentIds[0]))!.pronunciationOverridesUsed).toEqual(['lt1']);
  });

  it('a silent WAV from the service is still rejected by the validation gate (never ready)', async () => {
    const { encodeWav } = await import('../../src/golisten');
    const silent = encodeWav({ samples: new Int16Array(24000), sampleRate: 24000 });
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: mockFetch(() => new Response(body(silent), { status: 200 })).fn });
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, 'de');
    const r = await gl.ensureAudio(tid('de'), { runNow: true });
    expect(r.manifest.complete).toBe(false);
    expect(await store.audioAssets.count()).toBe(0);
    expect((await gl.jobs('failed')).every((j) => /silent/.test(j.lastError ?? ''))).toBe(true);
  });
});
