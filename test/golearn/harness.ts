/** Shared test harness: memory store, bus with a deterministic clock, test adapters, attached GoLearn. */
import { StoreEventBus, createMemoryStore, seedBasics } from '../../src/core';
import type {
  AssistanceLevel, DomainEvent, EventInput, LanguageCode, ProductionKind, ItemKind, ReviewStatus,
} from '../../src/core';
import { createGoLearn } from '../../src/golearn';
import type { GoLearnDeps } from '../../src/golearn';
import { createTestRegistry } from './testAdapters';

export function makeClock(startMs = Date.UTC(2026, 0, 1)) {
  let n = 0;
  return () => new Date(startMs + 1000 * n++).toISOString();
}

export type Degree = 'all' | 'most' | 'some' | 'little';

export interface ListenOpts {
  session?: string; speed?: number; replays?: number; transcript?: boolean; translation?: boolean;
  /** Default: the event says it is reviewed real speech (new-style event). */
  speech?: boolean; voiceReviewed?: boolean;
  /** Emit a legacy event (no speech / voiceReviewed / assetId): GoLearn must resolve segment → asset → voice. */
  legacy?: boolean;
  segmentId?: string; assetId?: string;
}

export function createHarness(opts: {
  lemmaOf?: Parameters<typeof createTestRegistry>[0]; policy?: GoLearnDeps['policy']; attach?: boolean;
  audioEligible?: GoLearnDeps['audioEligible'];
} = {}) {
  const store = createMemoryStore();
  const clock = makeClock();
  const bus = new StoreEventBus(store, clock);
  const adapters = createTestRegistry(opts.lemmaOf);
  const golearn = createGoLearn({ store, bus, adapters, policy: opts.policy, clock, audioEligible: opts.audioEligible });
  if (opts.attach !== false) golearn.attach();
  let counter = 0;
  const uniq = () => `k${counter++}`;

  const base = (userId: string, lang: LanguageCode, session: string, surface: 'corpus' | 'scripture' | 'listen' | 'testimony' = 'corpus') =>
    ({ userId, lang, session, surface });

  const api = {
    store, bus, adapters, golearn, clock,
    seed: (userId = 'u1', courseId = 'honduras-es') => seedBasics(store, userId, courseId),
    /** SentenceViewed — dedupeKey is per (user, session, sentence) like the real reader. */
    view: (userId: string, lang: LanguageCode, textId: string, index: number, session = 's1', surface: 'corpus' | 'scripture' = 'corpus') => {
      const sentenceId = `${textId}/s${index}`;
      return bus.emit({
        type: 'SentenceViewed', ...base(userId, lang, session, surface), dedupeKey: `view:${userId}:${session}:${sentenceId}`,
        textId, sentenceId, tokenIds: [],
      } as EventInput<DomainEvent>);
    },
    /** View every sentence index of a text in one session. */
    viewAll: async (userId: string, lang: LanguageCode, textId: string, count: number, session = 's1', surface: 'corpus' | 'scripture' = 'corpus') => {
      for (let i = 0; i < count; i++) await api.view(userId, lang, textId, i, session, surface);
    },
    /** ComprehensionReported (default: "I understood all of it", sentence scope, reading). */
    report: (userId: string, lang: LanguageCode, textId: string, indexes: number[], o: { session?: string; degree?: Degree; modality?: 'reading' | 'listening'; scope?: 'sentence' | 'text' } = {}) =>
      bus.emit({
        type: 'ComprehensionReported', ...base(userId, lang, o.session ?? 's1', o.modality === 'listening' ? 'listen' : 'corpus'),
        dedupeKey: `report:${uniq()}`, textId, sentenceIds: indexes.map((i) => `${textId}/s${i}`),
        modality: o.modality ?? 'reading', scope: o.scope ?? 'sentence', degree: o.degree ?? 'all',
      } as EventInput<DomainEvent>),
    /** View then report "all" for the given sentence indexes in one session — a demonstrated reading. */
    understood: async (userId: string, lang: LanguageCode, textId: string, indexes: number[], session = 's1', surface: 'corpus' | 'scripture' = 'corpus') => {
      for (const i of indexes) await api.view(userId, lang, textId, i, session, surface);
      await api.report(userId, lang, textId, indexes, { session });
    },
    complete: (userId: string, lang: LanguageCode, textId: string, session = 's1') =>
      bus.emit({ type: 'TextCompleted', ...base(userId, lang, session), dedupeKey: `done:${userId}:${session}:${textId}:${uniq()}`, textId } as EventInput<DomainEvent>),
    help: (userId: string, lang: LanguageCode, textId: string, index: number, tokenIndex: number, itemId: string, level: AssistanceLevel, session = 's1') => {
      const sentenceId = `${textId}/s${index}`;
      return bus.emit({
        type: 'TokenHelpOpened', ...base(userId, lang, session), dedupeKey: `help:${uniq()}`,
        sentenceId, tokenId: `${sentenceId}/t${tokenIndex}`, itemId, level,
      } as EventInput<DomainEvent>);
    },
    rescue: (userId: string, lang: LanguageCode, textId: string, indexes: number[], session = 's1') =>
      bus.emit({
        type: 'EnglishRescueRevealed', ...base(userId, lang, session), dedupeKey: `rescue:${uniq()}`,
        textId, sentenceIds: indexes.map((i) => `${textId}/s${i}`), scope: 'sentence',
      } as EventInput<DomainEvent>),
    listen: (userId: string, lang: LanguageCode, textId: string, indexes: number[], o: ListenOpts = {}) =>
      bus.emit({
        type: 'AudioSegmentCompleted', ...base(userId, lang, o.session ?? 'l1', 'listen'), dedupeKey: `done:${uniq()}`,
        textId, segmentId: o.segmentId ?? `seg:${uniq()}`, sentenceIds: indexes.map((i) => `${textId}/s${i}`), speed: o.speed ?? 1,
        transcriptVisible: false, replayCount: o.replays ?? 0, revealedTranscript: o.transcript ?? false, revealedTranslation: o.translation ?? false,
        ...(o.legacy ? {} : { assetId: o.assetId ?? 'sha256:real', speech: o.speech ?? true, voiceReviewed: o.voiceReviewed ?? true }),
      } as EventInput<DomainEvent>),
    /** Rows a LEGACY listening event resolves through: voice → segment → asset. Returns the segment id. */
    seedAudio: async (segmentId: string, o: { speech: boolean; provider?: string; reviewStatus?: ReviewStatus; textId?: string; lang?: LanguageCode; flag?: boolean } = { speech: true }) => {
      const lang = o.lang ?? 'es';
      const voiceId = `voice:${segmentId}`;
      const assetId = `asset:${segmentId}`;
      await store.voices.put({
        id: voiceId, lang, providerId: o.provider ?? (o.speech ? 'azure' : 'fixture'), voiceId: 'v', requestedLocale: 'es-HN', actualLocale: 'es-MX',
        approved: true, reviewStatus: o.reviewStatus ?? 'approved', isSpeech: o.speech,
      });
      await store.audioAssets.put({
        id: assetId, sourceType: 'generated-tts', lang, locale: 'es-MX', mime: 'audio/wav', sampleRate: 24000, channels: 1, durationMs: 1000,
        bytes: 10, checksum: assetId, createdAt: '2026-01-01T00:00:00.000Z',
        ...(o.flag === false ? {} : { isSpeech: o.speech }),
        generation: { providerId: o.provider ?? (o.speech ? 'azure' : 'fixture'), voiceId: 'v', settings: {}, sourceTextHash: 'h', speechTextHash: 'h', normalizerVersion: 'n', pronunciationLexiconVersion: 'l', softwareVersion: 't' },
      } as never);
      await store.audioSegments.put({
        id: segmentId, cacheKey: segmentId, lang, sentenceIds: [], textId: o.textId ?? 't', displayText: 'x', speechText: 'x',
        speechNormalization: [], pronunciationOverridesUsed: [], voiceConfigId: voiceId, assetId, status: 'ready', sequence: 0, contentVersion: 1,
      });
      return segmentId;
    },
    /**
     * A production. The default sentence text is unique per call so each call is a distinct (item, sentenceHash) pair;
     * pass the same `sentenceText` to test the once-ever rule.
     */
    produce: (userId: string, lang: LanguageCode, itemId: string, kind: ProductionKind, o: { modality?: 'writing' | 'speaking'; session?: string; itemKind?: ItemKind; sentenceText?: string; revisionId?: string; sentenceHash?: string } = {}) =>
      bus.emit({
        type: 'ProductionRecorded', ...base(userId, lang, o.session ?? 'p1', 'testimony'), dedupeKey: `prod:${uniq()}`,
        itemId, itemKind: o.itemKind ?? 'form', kind, modality: o.modality ?? 'writing',
        revisionId: o.revisionId ?? 'rev1', sentenceText: o.sentenceText ?? `una frase ${uniq()}`,
        ...(o.sentenceHash ? { sentenceHash: o.sentenceHash } : {}),
      } as EventInput<DomainEvent>),
    mark: (userId: string, lang: LanguageCode, itemId: string, mark: 'known' | 'unknown' | 'clear', itemKind: ItemKind = 'form') =>
      bus.emit({
        type: 'ItemMarked', ...base(userId, lang, 'm1', 'corpus'), dedupeKey: `mark:${uniq()}`, itemId, itemKind, mark,
      } as EventInput<DomainEvent>),
  };
  return api;
}

export type Harness = ReturnType<typeof createHarness>;
