/**
 * Test support for GoListen: a minimal adapter registry (only speechNormalize, tokenize, normalize
 * matter here), five-language fixtures, and test-only providers.
 * Everything labelled "test-only" here must never be imported by production code.
 */
import {
  StoreEventBus, buildFixtureText, createMemoryStore, seedBasics,
  type AdapterRegistry, type AppStore, type EventBus, type FixtureSentence, type LanguageAdapter, type LanguageCode, type RawToken,
  type ProviderAvailability, type SynthesisRequest, type SynthesisResult, type TtsProvider, type WordMark,
} from '../../src/core';
import { canonicalTextSha256, createGoListen, editionIdOf, FixtureTtsProvider, encodeWav, fixtureChunks, releaseIdOf, renderFixtureChunks, type AudioGenerationAuthorization, type GoListenDeps, type GoListenService } from '../../src/golisten';

export const LANGS: LanguageCode[] = ['es', 'sq', 'th', 'hi', 'de'];

// ───────────────────────── test adapter registry ─────────────────────────

const VERSE_BRACKET = /\[\s*\d+(?:\s*[-–,]\s*\d+)*\s*\]/gu;
const SUPERSCRIPT = /[⁰¹²³⁴-⁹]+/gu;

function makeTestAdapter(lang: LanguageCode, thaiWords: string[], identitySpeech: boolean): LanguageAdapter {
  const keepCase = lang === 'th' || lang === 'hi';
  const words = [...thaiWords].sort((a, b) => b.length - a.length);
  const normalize = (s: string) => (keepCase ? s.normalize('NFC') : s.normalize('NFC').toLowerCase());
  const tokenize = (sentence: string): RawToken[] => {
    const out: RawToken[] = [];
    const push = (start: number, end: number, isWord: boolean) => {
      const surface = sentence.slice(start, end);
      out.push({ surface, start, end, isWord, normalized: isWord ? normalize(surface) : surface });
    };
    let i = 0;
    while (i < sentence.length) {
      const ch = sentence[i];
      if (/\s/u.test(ch)) { i++; continue; }
      if (lang === 'th' && /[฀-๿]/u.test(ch)) {
        const hit = words.find((w) => sentence.startsWith(w, i));
        if (hit) { push(i, i + hit.length, true); i += hit.length; continue; }
        let j = i + 1; // unknown run: consume Thai chars until a known word starts
        while (j < sentence.length && /[฀-๿]/u.test(sentence[j]) && !words.some((w) => sentence.startsWith(w, j))) j++;
        push(i, j, true); i = j; continue;
      }
      const m = /^[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/u.exec(sentence.slice(i));
      if (m) { push(i, i + m[0].length, true); i += m[0].length; continue; }
      push(i, i + 1, false); i++;
    }
    return out;
  };
  return {
    lang, name: `test-${lang}`, script: lang === 'th' ? 'Thai' : lang === 'hi' ? 'Deva' : 'Latn', version: 'test@1',
    segmentSentences: (t) => [{ start: 0, end: t.length, text: t }],
    tokenize, normalize, searchNormalize: normalize,
    analyze: (tokens) => tokens.map((token) => ({ token, candidates: [], analyzer: 'test@1' })),
    detectPhrases: () => [], detectPatterns: () => [], pronunciation: () => ({}),
    speechNormalize: (display) => {
      if (identitySpeech) return { speechText: display, transformations: [], normalizerVersion: 'test-identity@1' };
      const t = display.normalize('NFC');
      const stripped = t.replace(VERSE_BRACKET, ' ').replace(SUPERSCRIPT, ' ').replace(/[ \t]{2,}/g, ' ').trim();
      return {
        speechText: stripped,
        transformations: stripped === t ? [] : [{ at: '2026-01-01T00:00:00.000Z', tool: 'test-norm@1', description: 'verse markers stripped' }],
        normalizerVersion: 'test-norm@1',
      };
    },
    display: { wordSeparator: lang === 'th' ? '' : ' ', showBoundariesOnHighlight: lang === 'th' },
    checkProduction: () => [], relate: (a, b) => (a === b ? 'same' : 'none'),
    support: { tokenization: 'limited', sentenceSegmentation: 'limited', lemmatization: 'none', morphology: 'none', phraseDetection: 'none', productionChecks: 'none', limitations: ['test adapter'] },
  };
}

export const THAI_WORDS = ['ฉัน', 'เชื่อ', 'ใน', 'พระเจ้า', 'ให้อภัย', 'เข้าใจ', 'หัวใจ', 'ของ', 'ทรง', 'รัก', 'โลก', 'สวัสดี'];

/** identitySpeech = true gives an adapter whose speechNormalize does nothing (to prove the pipeline's own safety net). */
export function createTestRegistry(opts: { identitySpeech?: boolean } = {}): AdapterRegistry {
  const adapters = LANGS.map((l) => makeTestAdapter(l, THAI_WORDS, opts.identitySpeech ?? false));
  return { get: (lang) => adapters.find((a) => a.lang === lang)!, all: () => adapters };
}

// ───────────────────────── fixtures ─────────────────────────

const w = (surface: string) => ({ surface });
const dot = (surface = '.') => ({ surface, isWord: false });

/** Three short story sentences per language (explicit tokens; Thai has no spaces). */
export const STORY: Record<LanguageCode, FixtureSentence[]> = {
  es: [
    { tokens: ['Yo', 'creo', 'en', 'Dios'].map(w).concat(dot()) },
    { tokens: ['Dios', 'me', 'perdonó'].map(w).concat(dot()) },
    { tokens: ['Entiendo', 'mi', 'corazón'].map(w).concat(dot()) },
  ],
  sq: [
    { tokens: ['Unë', 'besoj', 'te', 'Zoti'].map(w).concat(dot()) },
    { tokens: ['Zoti', 'më', 'fali'].map(w).concat(dot()) },
    { tokens: ['E', 'kuptoj', 'zemrën', 'time'].map(w).concat(dot()) },
  ],
  th: [
    { tokens: ['ฉัน', 'เชื่อ', 'ใน', 'พระเจ้า'].map(w) },
    { tokens: ['พระเจ้า', 'ให้อภัย', 'ฉัน'].map(w) },
    { tokens: ['ฉัน', 'เข้าใจ', 'หัวใจ', 'ของ', 'ฉัน'].map(w) },
  ],
  hi: [
    { tokens: ['मैं', 'परमेश्वर', 'पर', 'विश्वास', 'करता', 'हूँ'].map(w).concat(dot('।')) },
    { tokens: ['परमेश्वर', 'ने', 'मुझे', 'क्षमा', 'किया'].map(w).concat(dot('।')) },
    { tokens: ['मैं', 'अपना', 'हृदय', 'समझता', 'हूँ'].map(w).concat(dot('।')) },
  ],
  de: [
    { tokens: ['Ich', 'glaube', 'an', 'Gott'].map(w).concat(dot()) },
    { tokens: ['Gott', 'hat', 'mir', 'vergeben'].map(w).concat(dot()) },
    { tokens: ['Ich', 'verstehe', 'mein', 'Herz'].map(w).concat(dot()) },
  ],
};

/** Scripture: verse numbers are metadata (verseRefs), never in the sentence text. */
export const SCRIPTURE: Record<LanguageCode, FixtureSentence[]> = {
  es: [
    { tokens: ['Porque', 'de', 'tal', 'manera', 'amó', 'Dios', 'al', 'mundo'].map(w).concat(dot()), verseRefs: ['JHN.3.16'] },
    { tokens: ['Si', 'confesamos', 'nuestros', 'pecados'].map(w).concat(dot()), verseRefs: ['1JN.1.9'] },
  ],
  sq: [
    { tokens: ['Zoti', 'e', 'deshi', 'botën'].map(w).concat(dot()), verseRefs: ['JHN.3.16'] },
    { tokens: ['Nëse', 'rrëfejmë', 'mëkatet', 'tona'].map(w).concat(dot()), verseRefs: ['1JN.1.9'] },
  ],
  th: [
    { tokens: ['พระเจ้า', 'ทรง', 'รัก', 'โลก'].map(w), verseRefs: ['JHN.3.16'] },
    { tokens: ['ฉัน', 'เชื่อ', 'ใน', 'พระเจ้า'].map(w), verseRefs: ['1JN.1.9'] },
  ],
  hi: [
    { tokens: ['परमेश्वर', 'ने', 'जगत', 'से', 'प्रेम', 'रखा'].map(w).concat(dot('।')), verseRefs: ['JHN.3.16'] },
    { tokens: ['यदि', 'हम', 'अपने', 'पाप', 'मान', 'लें'].map(w).concat(dot('।')), verseRefs: ['1JN.1.9'] },
  ],
  de: [
    { tokens: ['Denn', 'also', 'hat', 'Gott', 'die', 'Welt', 'geliebt'].map(w).concat(dot()), verseRefs: ['JHN.3.16'] },
    { tokens: ['So', 'wir', 'unsere', 'Sünden', 'bekennen'].map(w).concat(dot()), verseRefs: ['1JN.1.9'] },
  ],
};

/** Rewrites one sentence like the v2 importer: the old sentence is retired, a new one (new key) takes its place; bumps contentVersion. */
export async function replaceSentence(store: AppStore, textId: string, index: number, newText: string) {
  const { hash, ids } = await import('../../src/core');
  const t = (await store.texts.get(textId))!;
  const version = t.contentVersion + 1;
  const old = (await store.sentences.where('textId', textId)).find((x) => x.index === index && x.retiredInVersion === undefined)!;
  await store.sentences.put({ ...old, retiredInVersion: version });
  const key = ids.sentenceKey(newText);
  await store.sentences.put({ ...old, id: ids.sentence(textId, key), key, text: newText, normalizedText: newText.toLowerCase(), textHash: hash(newText), versionAdded: version, retiredInVersion: undefined });
  await store.texts.put({ ...t, contentVersion: version });
}

export async function addStory(store: AppStore, lang: LanguageCode, slug = 'story-01', sentences: FixtureSentence[] = STORY[lang]) {
  return buildFixtureText(store, { lang, slug, kind: 'story', sentences });
}
export async function addScripture(store: AppStore, lang: LanguageCode, slug = 'john-3', sentences: FixtureSentence[] = SCRIPTURE[lang]) {
  return buildFixtureText(store, { lang, slug, kind: 'scripture', version: 'fixture', sentences, scripture: { book: 'JHN', chapter: 3 } });
}

/** Rewrites one sentence like an editor would: new text, new hash, tokens unaffected for these tests; bumps contentVersion. */
export async function editSentence(store: AppStore, textId: string, index: number, newText: string) {
  const { hash } = await import('../../src/core');
  const id = `${textId}/s${index}`;
  const s = (await store.sentences.get(id))!;
  await store.sentences.put({ ...s, text: newText, normalizedText: newText.toLowerCase(), textHash: hash(newText) });
  const t = (await store.texts.get(textId))!;
  await store.texts.put({ ...t, contentVersion: t.contentVersion + 1 });
}

// ───────────────────────── environment ─────────────────────────

export function makeClock(startIso = '2026-02-01T00:00:00.000Z') {
  let t = Date.parse(startIso);
  return { clock: () => new Date(t).toISOString(), advance: (ms: number) => { t += ms; }, now: () => new Date(t).toISOString() };
}

export interface Env {
  store: AppStore;
  bus: EventBus;
  gl: GoListenService;
  clock: ReturnType<typeof makeClock>;
  registry: AdapterRegistry;
}

/** allowFixture defaults to TRUE here (most tests need audio); pass `allowFixture: false` to test the default, fixture-free behaviour. */
export async function makeEnv(opts: Partial<GoListenDeps> & { identitySpeech?: boolean; providerFactory?: (registry: AdapterRegistry) => TtsProvider[] } = {}): Promise<Env> {
  const store = createMemoryStore();
  await seedBasics(store);
  const clock = makeClock();
  const bus = new StoreEventBus(store, clock.clock);
  const registry = createTestRegistry({ identitySpeech: opts.identitySpeech });
  const providers = opts.providerFactory ? opts.providerFactory(registry) : opts.providers;
  const { identitySpeech: _i, providerFactory: _p, ...deps } = opts;
  void _i; void _p;
  const gl = createGoListen({ store, bus, adapters: registry, clock: clock.clock, allowFixture: true, ...deps, providers });
  // Unit tests make an explicit, test-only grant for synthetic providers. Production GoListen never receives
  // this wrapper; the grant binds the current release and records terms so unknown rights stay blocked.
  const ensureAudio = gl.ensureAudio.bind(gl);
  gl.ensureAudio = async (textId, request = {}) => {
    if (request.generationAuthorization) return ensureAudio(textId, request);
    const text = await store.texts.get(textId);
    const providerId = request.voiceConfigId ? (await store.voices.get(request.voiceConfigId))?.providerId
      : (await gl.resolveVoice(text?.lang ?? 'de')).providerId;
    const provider = gl.providers().find((p) => p.id === providerId);
    if (!text || !provider?.isSpeech) return ensureAudio(textId, request);
    const sentences = (await store.sentences.where('textId', text.id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
    const rights = { id: `test-rights:${provider.id}:${text.id}`, status: 'approved' as const,
      recordingOwner: 'test fixture', recordingBasis: 'explicit unit-test authorization', performanceOwner: provider.id,
      performancePermission: 'test provider authorization', playInApp: true, stream: true, offline: true, redistribute: false,
      segment: true, transform: false, textDerivative: 'allowed' as const, providerRetention: 'none' as const, providerId: provider.id, providerTerms: 'unit-test only; no retention' };
    const generationAuthorization: AudioGenerationAuthorization = { rights,
      textBinding: { textId: text.id, contentVersion: text.contentVersion, textSha256: await canonicalTextSha256(text.id, text.contentVersion, sentences), releaseId: releaseIdOf(text), editionId: editionIdOf(text) } };
    return ensureAudio(textId, { ...request, generationAuthorization });
  };
  const ensureSentenceAudio = gl.ensureSentenceAudio.bind(gl);
  gl.ensureSentenceAudio = async (request) => {
    if (request.generationAuthorization) return ensureSentenceAudio(request);
    const context = await store.texts.get(request.contextId);
    const providerId = request.voiceConfigId ? (await store.voices.get(request.voiceConfigId))?.providerId
      : (await gl.resolveVoice(context?.lang ?? request.lang)).providerId;
    const provider = gl.providers().find((p) => p.id === providerId);
    if (!provider?.isSpeech) return ensureSentenceAudio(request);
    let textBinding: AudioGenerationAuthorization['textBinding'];
    if (context) {
      const sentences = (await store.sentences.where('textId', context.id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
      textBinding = { textId: context.id, contentVersion: context.contentVersion, textSha256: await canonicalTextSha256(context.id, context.contentVersion, sentences), releaseId: releaseIdOf(context), editionId: editionIdOf(context) };
    } else {
      const { sha256Hex } = await import('../../src/golisten');
      textBinding = { textId: `personal:${request.ownerId}`, contentVersion: 1, textSha256: await sha256Hex(new TextEncoder().encode(request.text)), releaseId: `personal:${request.ownerId}`, scope: 'personal', ownerId: request.ownerId };
    }
    const rights = { id: `test-rights:${provider.id}:${request.ownerId}:${textBinding.textSha256}`, status: 'approved' as const,
      recordingOwner: 'test fixture', recordingBasis: 'explicit unit-test authorization', performanceOwner: provider.id,
      performancePermission: 'test provider authorization', playInApp: true, stream: true, offline: true, redistribute: false,
      segment: true, transform: false, textDerivative: 'allowed' as const, providerRetention: 'none' as const, providerId: provider.id, providerTerms: 'unit-test only; no retention' };
    return ensureSentenceAudio({ ...request, generationAuthorization: { rights, textBinding } });
  };
  return { store, bus, gl, clock, registry };
}

// ───────────────────────── test-only providers ─────────────────────────

const fixtureVoices = new FixtureTtsProvider();
async function localeOfVoice(lang: LanguageCode, voiceId: string): Promise<string> {
  const v = (await fixtureVoices.listVoices(lang)).find((x) => x.id === voiceId);
  if (!v) throw new Error(`unknown voice ${voiceId}`);
  return v.locale;
}

/**
 * TEST-ONLY. Returns word marks that are TRUE for the audio it renders: each mark is the exact burst
 * boundary of one adapter token. It exists to prove the mark -> token mapping; the production fixture
 * provider never returns marks.
 */
export class MarksTestProvider implements TtsProvider {
  readonly id = 'marks-test';
  readonly version = 'test-1';
  readonly testOnly = true;
  readonly isSpeech = false; // tones, not speech: usable only with allowFixture
  availability(): Promise<ProviderAvailability> { return Promise.resolve({ available: true, reason: 'development-fixture' }); }
  readonly calls: SynthesisRequest[] = [];
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly opts: { wordBoundaries?: boolean; ssml?: boolean; mutateMarks?: (marks: WordMark[]) => WordMark[] } = {},
  ) {}
  capabilities() {
    return { ssml: this.opts.ssml ?? true, wordBoundaries: this.opts.wordBoundaries ?? true, phonemeOverrides: this.opts.ssml ?? true, streaming: false, maxChars: 5000, outputFormats: ['audio/wav'] };
  }
  listVoices(lang: LanguageCode) { return fixtureVoices.listVoices(lang); }
  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    this.calls.push(req);
    const tokens = this.registry.get(req.lang).tokenize(req.text).filter((t) => t.isWord);
    const chunks = tokens.map((t) => ({ text: t.surface, charStart: t.start, charEnd: t.end }));
    const r = renderFixtureChunks(chunks, { seed: req.voiceId });
    const marks = this.opts.mutateMarks ? this.opts.mutateMarks(r.marks) : r.marks;
    return { bytes: r.bytes, mime: 'audio/wav', sampleRate: r.sampleRate, channels: 1, durationMs: r.durationMs, wordMarks: marks, engine: 'marks-test-tone', actualLocale: await localeOfVoice(req.lang, req.voiceId) };
  }
}

/** TEST-ONLY. Wraps the fixture provider and throws for the first `failTimes` attempts per distinct text. */
export class FlakyProvider implements TtsProvider {
  readonly id = 'flaky';
  readonly version = 'test-1';
  readonly testOnly = true;
  readonly isSpeech = false; // tones, not speech: usable only with allowFixture
  availability(): Promise<ProviderAvailability> { return Promise.resolve({ available: true, reason: 'development-fixture' }); }
  readonly calls: SynthesisRequest[] = [];
  private readonly attempts = new Map<string, number>();
  private readonly inner = new FixtureTtsProvider();
  constructor(private readonly failTimes: number) {}
  capabilities() { return this.inner.capabilities(); }
  listVoices(lang: LanguageCode) { return this.inner.listVoices(lang); }
  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    this.calls.push(req);
    const n = (this.attempts.get(req.text) ?? 0) + 1;
    this.attempts.set(req.text, n);
    if (n <= this.failTimes) throw new Error(`flaky failure #${n}`);
    return this.inner.synthesize(req);
  }
}

/** TEST-ONLY. Returns audio that must be rejected by validation. */
export class BadAudioProvider implements TtsProvider {
  readonly id = 'bad-audio';
  readonly version = 'test-1';
  readonly testOnly = true;
  readonly isSpeech = false; // tones, not speech: usable only with allowFixture
  availability(): Promise<ProviderAvailability> { return Promise.resolve({ available: true, reason: 'development-fixture' }); }
  constructor(private readonly mode: 'silent' | 'empty' | 'garbage' | 'mp3' | 'lying-duration') {}
  capabilities() { return { ...new FixtureTtsProvider().capabilities(), outputFormats: this.mode === 'mp3' ? ['audio/mpeg'] : ['audio/wav'] }; }
  listVoices(lang: LanguageCode) { return fixtureVoices.listVoices(lang); }
  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    const actualLocale = await localeOfVoice(req.lang, req.voiceId);
    const base = { sampleRate: 22050, channels: 1, durationMs: 1000, actualLocale };
    switch (this.mode) {
      case 'silent': return { ...base, bytes: encodeWav({ samples: new Int16Array(22050) }), mime: 'audio/wav' };
      case 'empty': return { ...base, bytes: new Uint8Array(0), mime: 'audio/wav' };
      case 'garbage': return { ...base, bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), mime: 'audio/wav' };
      case 'mp3': return { ...base, bytes: new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]), mime: 'audio/mpeg' };
      case 'lying-duration': {
        const r = renderFixtureChunks(fixtureChunks(req.text, req.lang));
        return { bytes: r.bytes, mime: 'audio/wav', sampleRate: r.sampleRate, channels: 1, durationMs: r.durationMs + 5000, actualLocale };
      }
    }
  }
}

/** TEST-ONLY. Delivers a different locale than the voice config expects. */
export class FallbackLocaleProvider implements TtsProvider {
  readonly id = 'fallback-locale';
  readonly version = 'test-1';
  readonly testOnly = true;
  readonly isSpeech = false; // tones, not speech: usable only with allowFixture
  availability(): Promise<ProviderAvailability> { return Promise.resolve({ available: true, reason: 'development-fixture' }); }
  private readonly inner = new FixtureTtsProvider();
  constructor(private readonly delivered: string) {}
  capabilities() { return this.inner.capabilities(); }
  listVoices(lang: LanguageCode) { return this.inner.listVoices(lang); }
  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> { return { ...(await this.inner.synthesize(req)), actualLocale: this.delivered }; }
}

/**
 * TEST-ONLY. Stands in for a real speech provider: it CLAIMS `isSpeech: true` while rendering the fixture's tone
 * bursts, purely so evidence-eligibility, review gating and status transitions can be tested without a network.
 * Nothing it makes is speech; it must never leave the test tree.
 */
export class FakeSpeechProvider implements TtsProvider {
  readonly id: string;
  readonly version: string;
  readonly testOnly = true;
  readonly isSpeech = true;
  readonly calls: SynthesisRequest[] = [];
  state: ProviderAvailability = { available: true };
  private readonly inner = new FixtureTtsProvider();
  constructor(opts: { id?: string; version?: string } = {}) { this.id = opts.id ?? 'fake-speech'; this.version = opts.version ?? '1'; }
  async availability(): Promise<ProviderAvailability> { return this.state; }
  capabilities() { return this.inner.capabilities(); }
  listVoices(lang: LanguageCode) { return this.inner.listVoices(lang); }
  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    this.calls.push(req);
    return { ...(await this.inner.synthesize(req)), engine: 'fake-speech-tone' };
  }
}
