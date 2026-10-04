/**
 * Speech readiness checks (`npm run speech:check`, scripts/speech-check.mts). Pure functions: no process, fs or console
 * access here, so the tests can drive them with mocks.
 *
 *  1. configurationReport      - is the server configured? NEVER returns or prints the key.
 *  2. runProviderIndependentChecks - the real GoListen + the real ProxySpeechProvider + the real `handleSpeechRequest`,
 *                                all in process, with a MOCKED upstream that answers with a valid PCM16 WAV. Nothing here
 *                                touches a network, so nothing here says anything about the live service or any voice.
 *  3. runLiveSynthesis         - ONE real synthesis through `handleSpeechRequest` against the live service, only when the
 *                                caller has both variables. Even a pass proves only that bytes arrived and are a valid WAV:
 *                                a human audition is still required before the voice counts.
 */
import { StoreEventBus, COURSES, createMemoryStore, hash, seedBasics } from '../src/core';
import type { AdapterRegistry, AppStore, DomainEvent } from '../src/core';
import type { AudioGenerationAuthorization, EnsureAudioOptions } from '../src/core/contracts/golisten';
import { createAdapterRegistry } from '../src/adapters';
import { importDocuments, type CorpusDocument } from '../src/ingest';
import {
  AZURE_VOICES, ProxySpeechProvider, SYNTHETIC_PRACTICE, buildPlayerManifest, canonicalTextSha256, computeCacheKey, createGoListen, editionIdOf, encodeWav, listeningEmitter, playableIndexes, releaseIdOf, validateWav,
  type CacheKeyParts, type GoListenService,
} from '../src/golisten';
import { createRateLimiter, handleSpeechRequest, type SpeechEnv } from '../server/speechHandler';

export const SETUP_INSTRUCTION = 'set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server';
export const NOT_CONFIGURED_LINE = `configured: no — ${SETUP_INSTRUCTION}`;
export const REAL_SPEECH_NOT_VERIFIED = 'REAL SPEECH: NOT VERIFIED — set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local';
export const AUDITION_STATEMENT = 'A human audition is still required before this voice counts: nothing here says it sounds right, only that valid audio arrived.';
/** The exact instruction the learner sees (Settings => Speech, audioStatus reason). */
const LEARNER_INSTRUCTION = 'Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.';

const ORIGIN = 'http://localhost:5196';
const HOST = 'localhost:5196';
/** A throw-away key used ONLY by the in-process chain, so the leak checks can search for a known string. Not a credential. */
export const CHECK_KEY = 'SPEECH-CHECK-TEST-KEY-9f3a7c1e5b2d';
export const CHECK_REGION = 'westeurope';

// ───────────────────────────── 1. configuration ─────────────────────────────

export interface ConfigReport { configured: boolean; region?: string; line: string; lines: string[] }

/**
 * Reads the answer the proxy itself would give for `GET /api/speech/status` with this environment, so "configured"
 * means exactly what it means to the running server (both variables present and a well-formed region).
 * Only `configured` and `region` are ever taken from it: the key is never read back, printed or logged.
 */
export async function configurationReport(env: SpeechEnv): Promise<ConfigReport> {
  const out = await handleSpeechRequest(
    { method: 'GET', path: '/api/speech/status', headers: { host: HOST } },
    env,
    { fetch: (() => { throw new Error('the status check never calls the network'); }) as unknown as typeof fetch, now: () => Date.now() },
  );
  const doc = JSON.parse(typeof out.body === 'string' ? out.body : new TextDecoder().decode(out.body)) as { configured?: boolean; region?: string };
  if (doc.configured === true && typeof doc.region === 'string') {
    const line = `configured: yes (region ${doc.region})`;
    return { configured: true, region: doc.region, line, lines: [line] };
  }
  const missing = [!env.key ? 'AZURE_SPEECH_KEY' : undefined, !env.region ? 'AZURE_SPEECH_REGION' : undefined].filter(Boolean);
  const lines = [NOT_CONFIGURED_LINE];
  if (missing.length) lines.push(`missing: ${missing.join(', ')}`);
  else lines.push('the region is not a valid Azure region name');
  return { configured: false, line: NOT_CONFIGURED_LINE, lines };
}

// ───────────────────────────── 2. the provider-independent chain ─────────────────────────────

export interface CheckResult { id: string; name: string; ok: boolean; detail: string }

type Outcome = { status: number; retryAfter?: string; body?: string };
/** `attempt` counts upstream synthesis requests for this exact speech text, from 1. Returning undefined means "answer with audio". */
type Behaviour = (c: { text: string; attempt: number }) => Outcome | undefined;

const bi = (b: Uint8Array) => b as unknown as BodyInit;

/** A valid PCM16 mono 24 kHz WAV (a smooth, non-silent tone whose length follows the text). It is not speech. */
function mockWav(text: string): Uint8Array {
  const sampleRate = 24_000;
  const seconds = 0.4 + Math.min(text.length, 80) * 0.02;
  const n = Math.round(sampleRate * seconds);
  const samples = new Float32Array(n);
  const fade = Math.round(sampleRate * 0.01);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / fade, (n - 1 - i) / fade);
    samples[i] = 0.4 * env * Math.sin((2 * Math.PI * (180 + (text.length % 7) * 20) * i) / sampleRate);
  }
  return encodeWav({ samples, sampleRate, channels: 1 });
}

const unescapeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const speechTextOf = (ssml: string) => unescapeXml(/<voice\b[^>]*>([\s\S]*?)<\/voice>/.exec(ssml)?.[1] ?? '');

const MOCK_VOICES = [
  { ShortName: 'es-MX-DaliaNeural', Locale: 'es-MX', Gender: 'Female' },
  { ShortName: 'es-MX-JorgeNeural', Locale: 'es-MX', Gender: 'Male' },
  { ShortName: 'es-ES-ElviraNeural', Locale: 'es-ES', Gender: 'Female' },
];

class Clock {
  #t = Date.parse('2026-02-01T00:00:00.000Z');
  clock = () => new Date(this.#t).toISOString();
  advance(ms: number) { this.#t += ms; }
}

interface Scenario {
  store: AppStore;
  gl: GoListenService;
  provider?: ProxySpeechProvider;
  registry: AdapterRegistry;
  clock: Clock;
  bus: StoreEventBus;
  env: SpeechEnv;
  /** Every string this scenario produced that a person or a log could see. Searched for the key at the end. */
  observed: string[];
  upstream: { synth: number; voices: number; keySent: number; keyWrong: number };
  record(label: string, v: unknown): void;
}

async function makeScenario(opts: { env?: SpeechEnv; behaviour?: Behaviour; maxAttempts?: number; proxy?: boolean; allowFixture?: boolean } = {}): Promise<Scenario> {
  const env: SpeechEnv = opts.env ?? { key: CHECK_KEY, region: CHECK_REGION };
  const store = createMemoryStore();
  await seedBasics(store);
  const clock = new Clock();
  const bus = new StoreEventBus(store, clock.clock);
  const registry = createAdapterRegistry();
  const observed: string[] = [];
  const upstream = { synth: 0, voices: 0, keySent: 0, keyWrong: 0 };
  const attempts = new Map<string, number>();
  const record = (label: string, v: unknown) => observed.push(`${label}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

  // The mocked Azure. It checks the key header (so the leak searches below are meaningful: the key really is sent here).
  const azure = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers['Ocp-Apim-Subscription-Key'] === env.key && env.key) upstream.keySent++; else upstream.keyWrong++;
    if (url.endsWith('/cognitiveservices/voices/list')) {
      upstream.voices++;
      return new Response(JSON.stringify(MOCK_VOICES), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/cognitiveservices/v1')) {
      upstream.synth++;
      const text = speechTextOf(String(init?.body ?? ''));
      const attempt = (attempts.get(text) ?? 0) + 1;
      attempts.set(text, attempt);
      const o = opts.behaviour?.({ text, attempt });
      if (o) return new Response(o.body ?? '', { status: o.status, headers: o.retryAfter ? { 'retry-after': o.retryAfter } : {} });
      return new Response(bi(mockWav(text)), { status: 200, headers: { 'content-type': 'audio/x-wav' } });
    }
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;

  // The "network" the browser-side provider sees: the REAL proxy handler in front of the mocked Azure.
  const limiter = createRateLimiter({ limit: 10_000, now: () => Date.now() });
  const net = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input), ORIGIN);
    const out = await handleSpeechRequest({
      method: init?.method ?? 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams),
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/json' },
      body: typeof init?.body === 'string' ? init.body : undefined,
    }, env, { fetch: azure, now: () => Date.now(), limiter, timeoutMs: 500, log: (line) => record('proxy log', line) });
    return new Response(out.body as unknown as BodyInit, { status: out.status, headers: out.headers });
  }) as unknown as typeof fetch;

  let provider: ProxySpeechProvider | undefined;
  if (opts.proxy !== false) {
    provider = new ProxySpeechProvider({ baseUrl: ORIGIN, fetch: net });
    record('availability', await provider.availability()); // as bootstrap does: learn the provider version before registering
  }
  const gl = createGoListen({
    store, bus, adapters: registry, clock: clock.clock, allowFixture: opts.allowFixture === true,
    providers: provider ? [provider] : [], maxAttempts: opts.maxAttempts,
  });
  return { store, gl, provider, registry, clock, bus, env, observed, upstream, record };
}

const SENTENCES = ['Yo creo en Dios.', 'Dios me perdonó.', 'Entiendo mi corazón.'];

function storyDoc(slug: string, sentences: string[]): CorpusDocument {
  return {
    schemaVersion: 2, id: slug, lang: 'es', title: `Speech check ${slug}`, contentType: 'story',
    corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'Comprehensible input (es)' },
    source: { id: 'src:speech-check', title: 'Speech check', attribution: 'Synthetic text for the speech readiness check', provenance: 'SYNTHETIC: written for the speech readiness check; not part of the corpus', rights: 'owner-authored', authorship: 'human' },
    review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
    english: { source: 'none' },
    sections: [{ paragraphs: [{ sentences: sentences.map((text) => ({ text })) }] }],
  };
}

async function importStory(s: Scenario, slug: string, sentences: string[]): Promise<{ textId: string; contentVersion: number }> {
  const report = await importDocuments(s.store, s.registry, [storyDoc(slug, sentences)], { clock: s.clock.clock });
  const d = report.documents[0];
  if (!report.ok || !d.textId) throw new Error(`the importer rejected the check text: ${d.issues.map((i) => i.code).join(', ')}`);
  return { textId: d.textId, contentVersion: d.contentVersion };
}

/** Explicit test-only authorization for the mocked proxy output; never used by live synthesis. */
async function ensureMockSpeech(s: Scenario, textId: string, options: EnsureAudioOptions = {}) {
  const text = await s.store.texts.get(textId);
  if (!text) throw new Error(`Missing speech-check text ${textId}`);
  const live = (await s.store.sentences.where('textId', textId)).filter((x) => x.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const voice = options.voiceConfigId ? await s.store.voices.get(options.voiceConfigId) : await s.gl.resolveVoice(text.lang);
  if (!voice) throw new Error('The mocked provider did not resolve a voice');
  const rights: AudioGenerationAuthorization['rights'] = {
    id: `speech-check:${voice.providerId}:${text.id}`, status: 'approved', recordingOwner: 'speech:check mocked provider', recordingBasis: 'explicit provider-independent test grant',
    performanceOwner: voice.providerId, performancePermission: 'Mock bytes only; no retention', playInApp: true, stream: true, offline: false,
    redistribute: false, segment: true, transform: false, textDerivative: 'allowed', providerRetention: 'none', providerId: voice.providerId,
    providerTerms: 'Test-only mocked upstream; no retention or redistribution',
  };
  const generationAuthorization: AudioGenerationAuthorization = { rights, textBinding: {
    textId, contentVersion: text.contentVersion, textSha256: await canonicalTextSha256(textId, text.contentVersion, live),
    releaseId: releaseIdOf(text), editionId: editionIdOf(text),
  } };
  const result = await s.gl.ensureAudio(textId, { ...options, generationAuthorization });
  await markMockWavQuality(s, result.manifest.segmentIds);
  return result;
}

/** Metadata describes successful WAV validation only; mock tones never claim human/acoustic review. */
async function markMockWavQuality(s: Scenario, segmentIds: string[]): Promise<void> {
  for (const id of segmentIds) {
    const segment = await s.gl.getSegment(id);
    const asset = segment?.assetId ? await s.gl.getAsset(segment.assetId) : undefined;
    if (asset) await s.store.audioAssets.put({ ...asset, qualityState: 'machine_checked' });
  }
}

/** Runs queued / retrying jobs until none are left (advancing the manual clock past every backoff). */
async function drain(s: Scenario, rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    const open = (await s.gl.jobs()).filter((j) => j.status === 'queued' || j.status === 'failed' || j.status === 'running');
    if (open.length === 0) return;
    s.clock.advance(400_000);
    await s.gl.runJobs();
  }
}

async function dumpStore(s: Scenario): Promise<void> {
  for (const [name, table] of Object.entries(s.store)) {
    const t = table as { all?: () => Promise<unknown[]> };
    if (name === 'assets' || typeof t.all !== 'function') continue; // `assets` holds audio bytes only
    s.record(`store.${name}`, await t.all());
  }
}

const view = { speed: 1, transcriptVisible: false };
const emitterFor = (s: Scenario, textId: string) => listeningEmitter(s.bus, { userId: 'u1', lang: 'es', session: 'speech-check', textId, store: s.store, clock: s.clock.clock });
const eventsOf = async (s: Scenario, type: DomainEvent['type']) => (await s.store.events.all()).filter((e) => e.type === type);

type Listen = DomainEvent & { speech?: boolean; voiceReviewed?: boolean };

/** The strings that contain the key (the check's one search; a planted key proves it can find one). */
export const findLeaks = (strings: string[], key: string): string[] => (key ? strings.filter((l) => l.includes(key)) : []);

function result(id: string, name: string, ok: boolean, detail: string): CheckResult { return { id, name, ok, detail }; }

/** Runs a body; a thrown error is a failed check (with the message), never a crash of the whole run. */
async function guarded(id: string, name: string, body: () => Promise<{ ok: boolean; detail: string }>, scenarios: Scenario[]): Promise<CheckResult> {
  try {
    const r = await body();
    return result(id, name, r.ok, r.detail);
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    for (const s of scenarios) s.record('thrown', message);
    return result(id, name, false, `threw ${message}`);
  }
}

export interface ChainOutcome { results: CheckResult[]; ok: boolean }

export async function runProviderIndependentChecks(): Promise<ChainOutcome> {
  const all: Scenario[] = [];
  const results: CheckResult[] = [];
  const track = <T extends Scenario>(s: T) => { all.push(s); return s; };

  // ── cache key composition (pure) ──
  results.push(await guarded('cache-key', 'cache key composition: changes with text, voice, locale, provider version, settings; stable otherwise', async () => {
    const base: CacheKeyParts = {
      displayTextHash: hash('Yo creo en Dios.'), speechText: 'Yo creo en Dios.', lang: 'es', actualLocale: 'es-MX', providerId: 'speech-proxy', engine: 'azure-neural-tts',
      voiceId: 'es-MX-DaliaNeural', settings: { rate: 1, style: 'plain' }, normalizerVersion: 'norm@1', lexiconVersion: 'none', providerVersion: 'azure-proxy@1',
    };
    const k0 = computeCacheKey(base);
    const changed: Array<[string, CacheKeyParts]> = [
      ['displayed text', { ...base, displayTextHash: hash('Yo creo en Dios!') }],
      ['speech text', { ...base, speechText: 'Yo creo en Dios' }],
      ['voice id', { ...base, voiceId: 'es-MX-JorgeNeural' }],
      ['delivered locale', { ...base, actualLocale: 'es-ES' }],
      ['provider version', { ...base, providerVersion: 'azure-proxy@2' }],
      ['provider id', { ...base, providerId: 'azure-speech' }],
      ['a setting value', { ...base, settings: { rate: 0.9, style: 'plain' } }],
      ['an added setting', { ...base, settings: { ...base.settings, volume: 1 } }],
      ['pronunciation lexicon', { ...base, lexiconVersion: 'lex:abc' }],
      ['normalizer version', { ...base, normalizerVersion: 'norm@2' }],
    ];
    const keys = changed.map(([, p]) => computeCacheKey(p));
    const stale = changed.filter((_, i) => keys[i] === k0).map(([n]) => n);
    const distinct = new Set([k0, ...keys]).size === keys.length + 1;
    const stable = computeCacheKey({ ...base, settings: { style: 'plain', rate: 1 } }) === k0 && computeCacheKey({ ...base }) === k0;
    const ok = stale.length === 0 && distinct && stable;
    return { ok, detail: ok ? `${changed.length} single-field changes each re-key; same fields (settings reordered) give the same key` : `unchanged key for: ${stale.join(', ') || 'none'}; distinct=${distinct}; stable=${stable}` };
  }, all));

  // ── the happy chain: one scenario feeds locale, voice metadata, review status and invalidation ──
  const happy = track(await makeScenario());
  let happyText: { textId: string; contentVersion: number } | undefined;
  let voiceId: string | undefined;
  const setup = await guarded('setup', 'real chain: import, resolve voice, generate three sentences through the proxy handler', async () => {
    happyText = await importStory(happy, 'speech-check-story', SENTENCES);
    const r = await ensureMockSpeech(happy, happyText.textId, { runNow: true });
    voiceId = r.manifest.voiceConfigId;
    const st = await happy.gl.audioStatus(happyText.textId);
    const ok = r.created === 3 && r.failed === 0 && happy.upstream.synth === 3 && st.readySegments === 3;
    return { ok, detail: `${r.created} segments created, ${happy.upstream.synth} upstream requests, ${st.readySegments}/${st.totalSegments} ready, key reached the upstream ${happy.upstream.keySent} times` };
  }, [happy]);
  results.push(setup);

  results.push(await guarded('locale', 'requested vs delivered locale recorded on voice and asset (course asks es-HN)', async () => {
    if (!happyText || !voiceId) throw new Error('the chain did not produce a text and a voice');
    const voice = (await happy.store.voices.get(voiceId))!;
    const assets = await happy.store.audioAssets.all();
    const status = await happy.gl.audioStatus(happyText.textId);
    const diag = await happy.gl.diagnostics(happyText.textId);
    const checks: Array<[string, boolean]> = [
      ['voice.requestedLocale is es-HN', voice.requestedLocale === 'es-HN'],
      ['voice.actualLocale is the delivered es-MX', voice.actualLocale === 'es-MX'],
      ['the fallback accent is written in the voice note', /Fallback accent/.test(voice.qaNote ?? '') && /es-HN/.test(voice.qaNote ?? '')],
      ['every asset records locale es-MX', assets.length > 0 && assets.every((a) => a.locale === 'es-MX')],
      ['audioStatus reports requested es-HN / delivered es-MX', status.requestedLocale === 'es-HN' && status.deliveredLocale === 'es-MX'],
      ['diagnostics report both locales per segment', diag.segments.length === 3 && diag.segments.every((x) => x.requestedLocale === 'es-HN' && x.actualLocale === 'es-MX')],
    ];
    const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
    return { ok: failed.length === 0, detail: failed.length === 0 ? `requested ${voice.requestedLocale}, delivered ${voice.actualLocale} (fallback noted), recorded on voice, ${assets.length} distinct assets, status and diagnostics` : `failed: ${failed.join('; ')}` };
  }, all));

  results.push(await guarded('voice-review', 'voice metadata + review status recorded: unreviewed => preview-only; reviewed => ready as synthetic practice, never evidence-eligible', async () => {
    if (!happyText || !voiceId) throw new Error('the chain did not produce a text and a voice');
    const v0 = (await happy.store.voices.get(voiceId))!;
    const s0 = await happy.gl.audioStatus(happyText.textId);
    const assets = await happy.store.audioAssets.all();
    const meta = v0.providerId === 'speech-proxy' && v0.providerVersion === 'azure-proxy@1' && v0.isSpeech === true && v0.reviewStatus === 'unreviewed' && v0.approved === false
      && assets.every((a) => a.isSpeech === true && /azure-proxy@1/.test(a.generation?.softwareVersion ?? '') && a.generation?.providerId === 'speech-proxy');
    const before = s0.state === 'preview-only' && s0.evidenceEligible === false && s0.voiceReview === 'unreviewed';
    await happy.gl.setVoiceReview(voiceId, 'reviewed', 'speech:check mock chain: NOT a human audition');
    const s1 = await happy.gl.audioStatus(happyText.textId);
    // Synthetic speech is practice only: a voice review makes it ready to play, never listening evidence.
    const after = s1.state === 'ready' && s1.evidenceEligible === false && s1.reason === SYNTHETIC_PRACTICE && s1.voiceReview === 'reviewed';
    const ok = meta && before && after;
    return { ok, detail: ok ? 'provider speech-proxy@azure-proxy@1, isSpeech true, starts unreviewed (preview-only, not eligible); after setVoiceReview(reviewed): ready as synthetic practice, evidenceEligible still false' : `metadata=${meta}; unreviewed=${s0.state}/${s0.evidenceEligible}; reviewed=${s1.state}/${s1.evidenceEligible}` };
  }, all));

  results.push(await guarded('invalidation', 'content-version invalidation: one edited sentence => stale; re-ensure regenerates exactly one segment', async () => {
    if (!happyText) throw new Error('the chain did not produce a text');
    const callsBefore = happy.upstream.synth;
    const again = await ensureMockSpeech(happy, happyText.textId, { runNow: true });
    const idempotent = again.created === 0 && again.reused === 3 && happy.upstream.synth === callsBefore;
    // Edit one sentence through the REAL importer.
    const edited = [SENTENCES[0], 'Dios me perdonó hoy.', SENTENCES[2]];
    const imp = await importStory(happy, 'speech-check-story', edited);
    const stale = await happy.gl.audioStatus(happyText.textId);
    const staleOk = imp.contentVersion === 2 && stale.state === 'stale' && stale.evidenceEligible === false && stale.audioContentVersion === 1 && stale.textContentVersion === 2;
    const r = await ensureMockSpeech(happy, happyText.textId, { runNow: true });
    const regenerated = happy.upstream.synth - callsBefore;
    const after = await happy.gl.audioStatus(happyText.textId);
    const ok = idempotent && staleOk && r.created === 1 && r.reused === 2 && regenerated === 1 && after.state === 'ready' && after.readySegments === 3 && after.audioContentVersion === 2;
    return { ok, detail: ok ? `unchanged re-ensure: 0 requests; after the edit (v1 -> v2): status stale ("${stale.reason?.slice(0, 40)}..."); re-ensure: 1 created, 2 reused, ${regenerated} upstream request; status ${after.state}` : `idempotent=${idempotent}; stale=${stale.state} (v${stale.audioContentVersion}/v${stale.textContentVersion}); created=${r.created} reused=${r.reused} requests=${regenerated}; after=${after.state}` };
  }, all));

  // ── retry with backoff, then success ──
  results.push(await guarded('retry', 'retry with backoff after 429 then 5xx, then success; no duplicate asset', async () => {
    const s = track(await makeScenario({ behaviour: ({ attempt }) => attempt === 1 ? { status: 429, retryAfter: '2' } : attempt === 2 ? { status: 503 } : undefined }));
    const { textId } = await importStory(s, 'speech-check-retry', ['Yo creo en Dios.']);
    await ensureMockSpeech(s, textId, { runNow: true });
    const j1 = (await s.gl.jobs())[0];
    const d1 = Date.parse(j1.nextAttemptAt ?? '') - Date.parse(j1.updatedAt);
    const early = await s.gl.runJobs(); // not due yet: must do nothing
    const statusWhileRetrying = await s.gl.audioStatus(textId);
    s.clock.advance(2000);
    await s.gl.runJobs();
    const j2 = (await s.gl.jobs())[0];
    const d2 = Date.parse(j2.nextAttemptAt ?? '') - Date.parse(j2.updatedAt);
    s.clock.advance(d2);
    await s.gl.runJobs();
    const j3 = (await s.gl.jobs())[0];
    const assets = await s.store.audioAssets.all();
    const seg = (await s.store.audioSegments.all())[0];
    const st = await s.gl.audioStatus(textId);
    const ok = d1 === 2000 && early === 0 && /being retried/.test(statusWhileRetrying.reason ?? '') && j2.status === 'failed' && d2 === 2000
      && j3.status === 'succeeded' && j3.attempts === 3 && assets.length === 1 && seg.status === 'ready' && st.readySegments === 1 && s.upstream.synth === 3;
    return { ok, detail: ok ? `429 (Retry-After 2 s honoured: wait ${d1} ms), 502 (backoff ${d2} ms), 3rd attempt succeeded; ${assets.length} asset, ${s.upstream.synth} upstream requests; nothing ran before the wait` : `waits ${d1}/${d2} ms; ran early=${early}; attempts=${j3.attempts} ${j3.status}; assets=${assets.length}; requests=${s.upstream.synth}; reason="${statusWhileRetrying.reason}"` };
  }, all));

  // ── dead after max attempts, reason visible; the upstream echoes the key in its error body ──
  results.push(await guarded('dead', 'dead after max attempts (4) with the reason visible in audioStatus and diagnostics', async () => {
    const s = track(await makeScenario({ behaviour: () => ({ status: 503, body: `upstream trouble, subscription key ${CHECK_KEY} rejected` }) }));
    const { textId } = await importStory(s, 'speech-check-dead', ['Yo creo en Dios.']);
    await ensureMockSpeech(s, textId, { runNow: true });
    await drain(s);
    const job = (await s.gl.jobs())[0];
    const st = await s.gl.audioStatus(textId);
    const diag = await s.gl.diagnostics(textId);
    s.record('audioStatus', st);
    s.record('diagnostics', diag);
    const reasonOk = st.state === 'failed' && /could not be voiced/.test(st.reason ?? '') && /HTTP 502/.test(st.reason ?? '');
    const diagOk = diag.deadJobs === 1 && diag.segments[0]?.jobStatus === 'dead' && diag.segments[0]?.attempts === 4 && /HTTP 502/.test(diag.segments[0]?.lastError ?? '') && diag.failedSentences?.length === 1 && /HTTP 502/.test(diag.failedSentences[0].error);
    const ok = job.status === 'dead' && job.attempts === 4 && reasonOk && diagOk && s.upstream.synth === 4;
    // A dead job is explicit: retryDead puts it back in the queue (it must not resurrect by itself).
    const requeued = await s.gl.retryDead();
    return { ok: ok && requeued === 1, detail: ok ? `job dead after ${job.attempts} attempts (${s.upstream.synth} requests); audioStatus ${st.state}: "${(st.reason ?? '').slice(0, 90)}"; diagnostics: deadJobs ${diag.deadJobs}, lastError and failedSentences present; retryDead requeued ${requeued}` : `job=${job.status}/${job.attempts}; state=${st.state}; reason="${st.reason}"; diag dead=${diag.deadJobs}; requests=${s.upstream.synth}` };
  }, all));

  // ── partial generation ──
  let partialScenario: Scenario | undefined;
  let partialText: string | undefined;
  results.push(await guarded('partial', 'partial generation visible ("x of y sentences ready; n failed") and the ready segments playable', async () => {
    const s = track(await makeScenario({ behaviour: ({ text }) => text.includes('perdon') ? { status: 503 } : undefined }));
    partialScenario = s;
    const { textId } = await importStory(s, 'speech-check-partial', SENTENCES);
    partialText = textId;
    const r = await ensureMockSpeech(s, textId, { runNow: true });
    await drain(s);
    await markMockWavQuality(s, r.manifest.segmentIds);
    const st = await s.gl.audioStatus(textId);
    const diag = await s.gl.diagnostics(textId);
    const manifest = (await s.gl.getManifest(textId))!;
    const playable = playableIndexes(await buildPlayerManifest(s.store, manifest));
    const ok = st.state === 'failed' && /^2 of 3 sentences ready; 1 failed: /.test(st.reason ?? '') && st.readySegments === 2 && st.failedSegments === 1
      && diag.failedSentences?.length === 1 && diag.failedSentences[0].index === 1 && JSON.stringify(playable) === '[0,2]' && r.manifest.segmentIds.length === 3;
    return { ok, detail: ok ? `"${(st.reason ?? '').slice(0, 70)}..."; failed sentence index ${diag.failedSentences?.[0]?.index} listed with its error; playable sentences ${JSON.stringify(playable)}` : `state=${st.state}; reason="${st.reason}"; playable=${JSON.stringify(playable)}; failedSentences=${diag.failedSentences?.length}` };
  }, all));

  // ── unconfigured proxy ──
  results.push(await guarded('unconfigured', 'unconfigured proxy => unavailable with the exact instruction; nothing written, nothing sent', async () => {
    const s = track(await makeScenario({ env: {} }));
    const { textId } = await importStory(s, 'speech-check-unconfigured', ['Yo creo en Dios.']);
    const avail = await s.gl.availability();
    const provAvail = await s.provider!.availability();
    const st = await s.gl.audioStatus(textId);
    let thrown: Error | undefined;
    try { await s.gl.ensureAudio(textId, { runNow: true }); } catch (e) { thrown = e instanceof Error ? e : new Error(String(e)); }
    if (thrown) s.record('thrown', thrown.message);
    const counts = [await s.store.voices.all(), await s.store.audioSegments.all(), await s.store.audioJobs.all(), await s.store.audioAssets.all(), await s.store.manifests.all()].map((r) => r.length);
    const ok = avail.available === false && avail.reason === 'missing-credentials' && provAvail.detail === LEARNER_INSTRUCTION
      && st.state === 'unavailable' && (st.reason ?? '').includes(LEARNER_INSTRUCTION)
      && thrown?.name === 'AudioUnavailable' && (thrown?.message ?? '').includes(LEARNER_INSTRUCTION)
      && counts.every((n) => n === 0) && s.upstream.synth === 0;
    return { ok, detail: ok ? `availability missing-credentials; audioStatus unavailable: "...${LEARNER_INSTRUCTION}"; ensureAudio threw AudioUnavailable; 0 rows written, 0 synthesis requests` : `avail=${avail.reason}; state=${st.state}; reason="${st.reason}"; thrown=${thrown?.name}; rows=${counts.join(',')}; requests=${s.upstream.synth}` };
  }, all));

  // ── fixture / failed playback never evidence-eligible ──
  results.push(await guarded('fixture-playback', 'fixture audio and failed / abandoned playback are never evidence-eligible', async () => {
    const fx = track(await makeScenario({ proxy: false, allowFixture: true }));
    const fxText = await importStory(fx, 'speech-check-fixture', SENTENCES);
    const fr = await fx.gl.ensureAudio(fxText.textId, { runNow: true });
    await fx.gl.setVoiceReview(fr.manifest.voiceConfigId, 'reviewed', 'speech:check: a review can never make tones speech');
    const fst = await fx.gl.audioStatus(fxText.textId, { preview: true });
    const fvoice = (await fx.store.voices.get(fr.manifest.voiceConfigId))!;
    const fseg = (await fx.store.audioSegments.get(fr.manifest.segmentIds[0]))!;
    const fe = emitterFor(fx, fxText.textId);
    const fixtureDone = await fe.completed({ segmentId: fseg.id, sentenceIds: fseg.sentenceIds }, view, { heardCoverageRatio: 1 }) as (DomainEvent & Listen) | null;
    const fixtureOk = fvoice.isSpeech === false && fvoice.approved === false && fst.state === 'preview-only' && fst.evidenceEligible === false && fixtureDone === null;

    // Failed segment (from the partial scenario): playback cannot complete; it abandons.
    if (!partialScenario || !partialText) throw new Error('the partial-generation scenario did not run');
    const ps = partialScenario;
    const pm = (await ps.gl.getManifest(partialText))!;
    const segs = (await ps.store.audioSegments.getMany(pm.segmentIds)).filter((x): x is NonNullable<typeof x> => !!x);
    const failedSeg = segs.find((x) => x.status === 'failed')!;
    const readySeg = segs.find((x) => x.status === 'ready')!;
    const pe = emitterFor(ps, partialText);
    const noCompletion = await pe.completed({ segmentId: failedSeg.id, sentenceIds: failedSeg.sentenceIds }, view);
    // A ready, real-speech segment whose playback fails: also an abandonment, never a completion.
    const failedPlay = await pe.failed({ segmentId: readySeg.id, sentenceIds: readySeg.sentenceIds }, view, 120);
    const abandoned = (await eventsOf(ps, 'AudioAbandoned')) as Listen[];
    const completions = await eventsOf(ps, 'AudioSegmentCompleted');
    const failedOk = noCompletion === null && failedPlay?.type === 'AudioAbandoned' && abandoned.length === 2 && completions.length === 0
      && abandoned.some((e) => (e as { speech?: boolean }).speech === false);
    const ok = fixtureOk && failedOk;
    return { ok, detail: ok ? 'fixture voice reviewed: still isSpeech false and preview-only; unknown/pending fixture rights emit no completion; failed and interrupted playback cannot complete either' : `fixture: speech=${fvoice.isSpeech} state=${fst.state} eligible=${fst.evidenceEligible} event=${fixtureDone?.type ?? 'blocked'}; failed: completion=${noCompletion === null ? 'null' : 'emitted'} abandoned=${abandoned.length} completions=${completions.length}` };
  }, all));

  // ── reviewed real speech: exposure only ──
  results.push(await guarded('real-playback', 'reviewed real-speech playback emits completion with speech:true (exposure only; synthetic, so never listening evidence)', async () => {
    if (!happyText || !voiceId) throw new Error('the chain did not produce a text and a voice');
    const manifest = (await happy.gl.getManifest(happyText.textId))!;
    const seg = (await happy.store.audioSegments.get(manifest.segmentIds[0]))!;
    const em = emitterFor(happy, happyText.textId);
    const played = await em.played({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, view) as (DomainEvent & Listen) | null;
    const done = await em.completed({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, view, { heardCoverageRatio: 1 }) as (DomainEvent & Listen & { assetId?: string }) | null;
    const st = await happy.gl.audioStatus(happyText.textId);
    // The same playback before anyone reviewed the voice carries voiceReviewed:false.
    await happy.gl.setVoiceReview(voiceId, 'unreviewed', 'speech:check: reset to show the unreviewed flag');
    const em2 = listeningEmitter(happy.bus, { userId: 'u1', lang: 'es', session: 'speech-check-2', textId: happyText.textId, store: happy.store, clock: happy.clock.clock });
    const unreviewed = await em2.completed({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, view, { heardCoverageRatio: 1 }) as (DomainEvent & Listen) | null;
    await happy.gl.setVoiceReview(voiceId, 'reviewed', 'speech:check mock chain: NOT a human audition');
    const ok = played?.type === 'AudioPlayed' && played.speech === true && done?.type === 'AudioSegmentCompleted' && done.speech === true && done.voiceReviewed === true
      && done.assetId === seg.assetId && st.evidenceEligible === false && unreviewed?.speech === true && unreviewed.voiceReviewed === false;
    return { ok, detail: ok ? 'AudioPlayed and AudioSegmentCompleted carry assetId, speech:true, voiceReviewed:true; the same playback with an unreviewed voice carries voiceReviewed:false (exposure only: this check asserts no learner state)' : `played=${played?.type}/${played?.speech}; completed=${done?.type}/${done?.speech}/${done?.voiceReviewed}; unreviewed=${unreviewed?.voiceReviewed}` };
  }, all));

  // ── the key never leaves the proxy ──
  results.push(await guarded('key-secrecy', 'the key never appears in any output, stored row, event, log line or thrown message', async () => {
    for (const s of all) {
      s.record('final audioStatus', await Promise.all((await s.store.texts.all()).map((t) => s.gl.audioStatus(t.id))));
      s.record('provider', s.provider ? JSON.stringify(s.provider) : '');
      await dumpStore(s);
    }
    const sent = all.reduce((n, s) => n + s.upstream.keySent, 0);
    const wrong = all.filter((s) => s.env.key).reduce((n, s) => n + s.upstream.keyWrong, 0);
    const lines = all.flatMap((s) => s.observed);
    const hits = findLeaks(lines, CHECK_KEY);
    const searchWorks = findLeaks(['planted: ' + CHECK_KEY], CHECK_KEY).length === 1; // negative control: the search can fail
    const preview = hits.slice(0, 2).map((l) => l.slice(0, 40)).join(' | ');
    const ok = hits.length === 0 && searchWorks && sent > 0 && wrong === 0;
    return { ok, detail: ok ? `${lines.length} captured strings (store tables, events, jobs, statuses, proxy log lines, errors; the dead scenario's upstream even echoed the key) searched: 0 matches; the key reached the upstream ${sent} times, in the right header only` : `leaks: ${hits.length} (${preview}); upstream saw the key ${sent} times, ${wrong} wrong` };
  }, all));

  return { results, ok: results.every((r) => r.ok) };
}

// ───────────────────────────── table formatting ─────────────────────────────

export function formatTable(results: CheckResult[], width = 100): string {
  const rows: string[] = [];
  const idw = Math.max(...results.map((r) => r.id.length), 4);
  rows.push(`${'status'.padEnd(6)}  ${'check'.padEnd(idw)}  detail`);
  rows.push(`${'-'.repeat(6)}  ${'-'.repeat(idw)}  ${'-'.repeat(Math.max(10, width - idw - 10))}`);
  for (const r of results) {
    rows.push(`${(r.ok ? 'PASS' : 'FAIL').padEnd(6)}  ${r.id.padEnd(idw)}  ${r.name}`);
    const pad = ' '.repeat(6 + 2 + idw + 2);
    const words = r.detail.split(' ');
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).length > width - pad.length && line) { rows.push(pad + line); line = w; } else line = line ? `${line} ${w}` : w;
    }
    if (line) rows.push(pad + line);
  }
  return rows.join('\n');
}

// ───────────────────────────── 3. one real synthesis ─────────────────────────────

export interface LiveResult {
  ok: boolean;
  voice?: string;
  requestedLocale?: string;
  deliveredLocale?: string;
  durationMs?: number;
  sampleRate?: number;
  bytes?: number;
  problems: string[];
  error?: string;
}

/**
 * ONE real synthesis of `sentence` through the proxy handler against the live service. The voice is the first one the
 * live voice list offers for the Honduras course's ordered preferred locales (falling back to the static table, as
 * GoListen does). A pass means "valid audio arrived": it says nothing about how it sounds.
 */
export async function runLiveSynthesis(a: { env: SpeechEnv; sentence: string; fetch?: typeof fetch }): Promise<LiveResult> {
  const doFetch = a.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const deps = { fetch: doFetch as typeof fetch, now: () => Date.now(), timeoutMs: 20_000 };
  const call = async (method: string, path: string, query?: Record<string, string>, body?: string) =>
    handleSpeechRequest({ method, path, query, headers: { host: HOST, ...(body ? { 'content-type': 'application/json' } : {}) }, body }, a.env, deps);
  const text = (r: { body: Uint8Array | string }) => (typeof r.body === 'string' ? r.body : new TextDecoder().decode(r.body));
  const course = COURSES.find((c) => c.id === 'honduras-es')!;
  const requestedLocale = course.preferredLocales[0];
  try {
    let voices: Array<{ id: string; locale: string }> = [];
    const list = await call('GET', '/api/speech/voices', { lang: 'es' });
    if (list.status === 200) voices = (JSON.parse(text(list)) as { voices?: Array<{ id: string; locale: string }> }).voices ?? [];
    if (voices.length === 0) voices = (AZURE_VOICES.es ?? []).map((v) => ({ id: v.id, locale: v.locale }));
    let chosen: { id: string; locale: string } | undefined;
    for (const loc of course.preferredLocales) { chosen = voices.find((v) => v.locale.toLowerCase() === loc.toLowerCase()); if (chosen) break; }
    chosen ??= voices[0];
    const norm = createAdapterRegistry().get('es').speechNormalize(a.sentence, { isScripture: true });
    const out = await call('POST', '/api/speech/synthesize', undefined, JSON.stringify({ text: norm.speechText, voice: chosen.id, locale: chosen.locale, format: 'riff-24khz-16bit-mono-pcm' }));
    if (out.status !== 200 || typeof out.body === 'string') {
      const err = (() => { try { const j = JSON.parse(text(out)) as { error?: string; message?: string }; return `${j.error ?? 'error'}: ${j.message ?? ''}`; } catch { return 'no detail'; } })();
      return { ok: false, voice: chosen.id, requestedLocale, problems: [], error: `HTTP ${out.status} ${err}` };
    }
    const v = validateWav(out.body, { expectedSampleRate: 24_000, expectedChannels: 1 });
    const header = new DataView(out.body.buffer, out.body.byteOffset, out.body.byteLength);
    const sampleRate = header.getUint32(24, true);
    const dataBytes = Math.max(0, out.body.byteLength - 44);
    const durationMs = Math.round((dataBytes / 2 / sampleRate) * 1000);
    return { ok: v.ok, voice: chosen.id, requestedLocale, deliveredLocale: out.headers['x-speech-delivered-locale'], durationMs, sampleRate, bytes: out.body.byteLength, problems: v.problems };
  } catch (e) {
    // The message is passed through the key redactor by the handler already; this is a thrown error of our own code.
    return { ok: false, requestedLocale, problems: [], error: e instanceof Error ? e.name : 'unknown error' };
  }
}

export function formatLive(r: LiveResult): string[] {
  if (!r.ok) return [`REAL SPEECH: FAILED — ${r.error ?? r.problems.join('; ') ?? 'invalid audio'}`, ...(r.voice ? [`  voice ${r.voice}, requested locale ${r.requestedLocale}`] : [])];
  return [
    'REAL SPEECH: one synthesis through the proxy handler succeeded',
    `  voice ${r.voice}; requested locale ${r.requestedLocale}; delivered locale ${r.deliveredLocale}`,
    `  duration ${r.durationMs} ms; sample rate ${r.sampleRate} Hz; ${r.bytes} bytes; validateWav ok`,
    `  ${AUDITION_STATEMENT}`,
  ];
}

/**
 * The sentence for the live synthesis: the first sentence of the verified SPANISH Scripture document. The id
 * id exists in every language, so the language is part of the selection.
 */
export function selectSpanishSample(docs: readonly CorpusDocument[]): string | undefined {
  const doc = docs.find((d) => d.id === 'bible-1john-1' && d.lang === 'es' && d.contentType === 'scripture');
  const para = doc?.sections[0]?.paragraphs[0];
  return para && 'sentences' in para ? para.sentences[0]?.text : undefined;
}
