/** Shared wiring for the integration suites: the real adapters, importer and engines over one memory store. */
import type { AppStore, ComprehensionReported, EnglishRescueRevealed, LanguageCode, ProviderAvailability, Sentence, SentenceViewed, SynthesisRequest, SynthesisResult, Text, TextCompleted, Token, TokenHelpOpened, TtsProvider } from '../../src/core';
import { StoreEventBus, createMemoryStore, seedBasics } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { loadBundledCorpus } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { createGoLearn } from '../../src/golearn';
import { FixtureTtsProvider, createGoListen } from '../../src/golisten';
import { createGoTell } from '../../src/gotell';

export function makeClock(start = '2026-10-01T08:00:00.000Z') {
  let t = Date.parse(start);
  return { now: () => new Date((t += 1000)).toISOString(), jumpDays: (d: number) => { t += d * 86_400_000; }, jumpMinutes: (m: number) => { t += m * 60_000; } };
}

/**
 * TEST-ONLY stand-in for a real speech provider: it claims `isSpeech: true` so the "reviewed real speech" path
 * can be exercised without credentials. It produces tones; nothing here is speech and it never leaves test/.
 */
export class SyntheticSpeechProvider implements TtsProvider {
  readonly id = 'synthetic-speech-test';
  readonly version = '1';
  readonly isSpeech = true;
  state: ProviderAvailability = { available: true };
  private readonly inner = new FixtureTtsProvider();
  async availability() { return this.state; }
  capabilities() { return this.inner.capabilities(); }
  listVoices(lang: LanguageCode) { return this.inner.listVoices(lang); }
  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    const r = await this.inner.synthesize(req);
    // Distinct bytes from the fixture's tones: assets are content-addressed, and a byte-identical asset IS the
    // (non-speech) fixture asset as far as GoListen is concerned — correctly so.
    const bytes = new Uint8Array(r.bytes);
    for (let i = 44; i + 1 < bytes.length; i += 2) { const v = (bytes[i] | (bytes[i + 1] << 8)) << 16 >> 16; const h = Math.trunc(v / 2); bytes[i] = h & 0xff; bytes[i + 1] = (h >> 8) & 0xff; }
    return { ...r, bytes, engine: 'synthetic-test-tone' };
  }
}

export interface AppOpts { store?: AppStore; clock?: ReturnType<typeof makeClock>; allowFixture?: boolean; providers?: TtsProvider[] }

/** Build (or re-build over an existing store = "reload") the whole engine stack. */
export function makeApp(opts: AppOpts = {}) {
  const store = opts.store ?? createMemoryStore();
  const clock = opts.clock ?? makeClock();
  const bus = new StoreEventBus(store, clock.now);
  const adapters = createAdapterRegistry();
  const golisten = createGoListen({ store, bus, adapters, clock: clock.now, allowFixture: opts.allowFixture ?? false, providers: opts.providers });
  const golearn = createGoLearn({ store, bus, adapters, clock: clock.now, audioEligible: async (textId) => (await golisten.audioStatus(textId)).evidenceEligible });
  golearn.attach();
  const gotellAll = createGoTell({ store, bus, adapters, golearn, golisten, clock: clock.now });
  return { store, clock, bus, adapters, golearn, golisten, gotellAll };
}
export type App = ReturnType<typeof makeApp>;

export async function seedUser(store: AppStore, userId: string, courseId: string) { await seedBasics(store, userId, courseId); }

export function bundled(lang: LanguageCode): CorpusDocument[] { return loadBundledCorpus().filter((d) => d.lang === lang); }
export function bundledDoc(lang: LanguageCode, id: string): CorpusDocument {
  const d = bundled(lang).find((x) => x.id === id);
  if (!d) throw new Error(`no bundled ${lang}/${id}`);
  return structuredClone(d);
}

/**
 * A copy of a bundled machine-drafted text marked as reviewed SO THE PUBLISHED PATH CAN BE TESTED. This is a
 * synthetic review for tests only; the bundled text itself stays unreviewed and unpublished.
 */
export function syntheticallyReviewed(doc: CorpusDocument): CorpusDocument {
  const d = structuredClone(doc);
  d.review = { status: 'reviewed', reviewedBy: 'integration test (synthetic review, not a native-speaker review)', reviewedAt: '2026-10-01' };
  d.editorialTags = d.editorialTags.filter((t) => t !== 'needs-native-review');
  return d;
}

export async function liveSentences(store: AppStore, textId: string): Promise<Sentence[]> {
  return (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
}
export async function tokensOf(store: AppStore, sentenceId: string): Promise<Token[]> {
  return (await store.tokens.where('sentenceId', sentenceId)).sort((a, b) => a.index - b.index);
}

/** A reader sitting: emits the same events the UI reader emits, with one session id. */
export function reader(app: App, userId: string, lang: LanguageCode, session: string) {
  const { bus, store } = app;
  const surfaceOf = (t: Text) => (t.kind === 'scripture' ? 'scripture' : t.kind === 'testimony' ? 'testimony' : 'corpus') as 'scripture' | 'testimony' | 'corpus';
  return {
    async view(text: Text, sentences: Sentence[]) {
      for (const s of sentences) {
        const toks = await tokensOf(store, s.id);
        await bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId, lang, surface: surfaceOf(text), session, dedupeKey: `view:${userId}:${session}:${s.id}`, textId: text.id, sentenceId: s.id, tokenIds: toks.map((t) => t.id), dwellMs: 2000, contentVersion: text.contentVersion });
      }
    },
    async tap(text: Text, sentence: Sentence, token: Token, level: 1 | 2 | 3 = 1) {
      await bus.emit<TokenHelpOpened>({ type: 'TokenHelpOpened', userId, lang, surface: surfaceOf(text), session, dedupeKey: `help:${userId}:${session}:${token.id}:${level}`, sentenceId: sentence.id, tokenId: token.id, itemId: token.formId, level });
    },
    async rescue(text: Text, sentence: Sentence) {
      await bus.emit<EnglishRescueRevealed>({ type: 'EnglishRescueRevealed', userId, lang, surface: surfaceOf(text), session, dedupeKey: `rescue:${userId}:${session}:${sentence.id}`, textId: text.id, sentenceIds: [sentence.id], scope: 'sentence' });
    },
    async complete(text: Text) {
      await bus.emit<TextCompleted>({ type: 'TextCompleted', userId, lang, surface: surfaceOf(text), session, dedupeKey: `done:${userId}:${session}:${text.id}`, textId: text.id, contentVersion: text.contentVersion });
    },
    async report(text: Text, sentences: Sentence[], degree: 'all' | 'most' | 'some' | 'little' = 'all', scope: 'sentence' | 'text' = 'text') {
      await bus.emit<ComprehensionReported>({ type: 'ComprehensionReported', userId, lang, surface: surfaceOf(text), session, dedupeKey: `report:${userId}:${session}:${text.id}:${scope}:${sentences.map((s) => s.key).join(',')}`, textId: text.id, sentenceIds: sentences.map((s) => s.id), modality: 'reading', scope, degree, contentVersion: text.contentVersion });
    },
  };
}
