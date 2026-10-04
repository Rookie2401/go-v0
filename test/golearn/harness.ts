/** Shared test harness: memory store, bus with a deterministic clock, test adapters, attached GoLearn. */
import { SITTING_GAP_MS, StoreEventBus, createMemoryStore, seedBasics } from '../../src/core';
import type {
  AssistanceLevel, DomainEvent, EventInput, LanguageCode, ProductionKind, ItemKind, ReviewStatus,
} from '../../src/core';
import { createGoLearn } from '../../src/golearn';
import type { GoLearnDeps } from '../../src/golearn';
import { createTestRegistry } from './testAdapters';
import { canonicalTextSha256, editionIdOf, releaseIdOf } from '../../src/golisten/rights';

/** Deterministic clock: every call is one second after the previous one; `advance(ms)` jumps forward. */
export function makeClock(startMs = Date.UTC(2026, 0, 1)) {
  let n = 0;
  let offset = 0;
  const clock = () => new Date(startMs + offset + 1000 * n++).toISOString();
  clock.advance = (ms: number) => { offset += ms; };
  return clock;
}

export type Degree = 'all' | 'most' | 'some' | 'little';

export interface ListenOpts {
  session?: string; speed?: number; replays?: number; transcript?: boolean; translation?: boolean;
  /** Default: the event says it is reviewed real speech (new-style event). */
  speech?: boolean; voiceReviewed?: boolean;
  /** Emit a legacy event (no speech / voiceReviewed / assetId): GoLearn must resolve segment → asset → voice. */
  legacy?: boolean;
  segmentId?: string; assetId?: string;
  /** Default 'human' (a reviewed human recording, the only listening evidence); 'synthetic' seeds generated speech (practice only). */
  kind?: 'human' | 'synthetic';
  /** Observed share of the passage heard (default 1). */
  ratio?: number;
  /** Omit the observed-playback version (a legacy end-callback completion). */
  unobserved?: boolean;
  /** The sentence indexes actually heard (event `heardSentenceIds`). */
  heard?: number[];
  /** Override the asset's quality state when seeding. */
  quality?: 'machine_checked' | 'human_reviewed' | 'approved';
}

export function createHarness(opts: {
  lemmaOf?: Parameters<typeof createTestRegistry>[0]; decode?: LanguageCode[]; listening?: boolean; policy?: GoLearnDeps['policy']; attach?: boolean;
  audioEligible?: GoLearnDeps['audioEligible'];
  /**
   * Default true: a reading / listening helper called with a DIFFERENT session string than the previous helper call starts
   * a new sitting (the clock jumps past SITTING_GAP_MS first), so tests written as "session s2" read as "a later sitting".
   * Pass false to control time yourself with `advance()` (a new session id inside one sitting, reloads, route revisits).
   */
  sittingPerSession?: boolean;
} = {}) {
  const store = createMemoryStore();
  const clock = makeClock();
  const bus = new StoreEventBus(store, clock);
  const adapters = createTestRegistry(opts.lemmaOf, { decode: opts.decode });
  const golearn = createGoLearn({ store, bus, adapters, policy: opts.policy, clock, audioEligible: opts.audioEligible, listening: opts.listening });
  if (opts.attach !== false) golearn.attach();
  let counter = 0;
  const uniq = () => `k${counter++}`;
  let lastSession: string | undefined;
  /** Called by every reading / listening helper before it emits. */
  const touch = (session: string) => {
    if (opts.sittingPerSession !== false && lastSession !== undefined && session !== lastSession) clock.advance(SITTING_GAP_MS + 1000);
    lastSession = session;
  };

  const base = (userId: string, lang: LanguageCode, session: string, surface: 'corpus' | 'scripture' | 'listen' | 'testimony' = 'corpus') =>
    ({ userId, lang, session, surface });

  const api = {
    store, bus, adapters, golearn, clock,
    /** Jump the clock forward (default: just past one sitting gap). */
    advance: (ms: number = SITTING_GAP_MS + 1000) => clock.advance(ms),
    seed: (userId = 'u1', courseId = 'honduras-es') => seedBasics(store, userId, courseId),
    /** SentenceViewed — dedupeKey is per (user, session, sentence) like the real reader. */
    view: (userId: string, lang: LanguageCode, textId: string, index: number, session = 's1', surface: 'corpus' | 'scripture' = 'corpus') => {
      const sentenceId = `${textId}/s${index}`;
      touch(session);
      return bus.emit({
        type: 'SentenceViewed', ...base(userId, lang, session, surface), dedupeKey: `view:${userId}:${session}:${sentenceId}`,
        textId, sentenceId, tokenIds: [],
      } as EventInput<DomainEvent>);
    },
    /** SentenceViewed carrying a dwell time (what the real reader records). */
    viewTimed: (userId: string, lang: LanguageCode, textId: string, index: number, dwellMs: number, session = 's1') => {
      const sentenceId = `${textId}/s${index}`;
      touch(session);
      return bus.emit({
        type: 'SentenceViewed', ...base(userId, lang, session), dedupeKey: `view:${userId}:${session}:${sentenceId}`,
        textId, sentenceId, tokenIds: [], dwellMs,
      } as EventInput<DomainEvent>);
    },
    /** DecodingRevealed — the learner opened the decoding of one word (or its romanization rescue). */
    decoding: (userId: string, lang: LanguageCode, textId: string, index: number, tokenIndex: number, itemId: string, features: string[], o: { romanization?: boolean; session?: string } = {}) => {
      const sentenceId = `${textId}/s${index}`;
      const session = o.session ?? 's1';
      touch(session);
      return bus.emit({
        type: 'DecodingRevealed', ...base(userId, lang, session), dedupeKey: `decode:${uniq()}`,
        sentenceId, tokenId: `${sentenceId}/t${tokenIndex}`, itemId, features, romanization: o.romanization ?? false,
      } as EventInput<DomainEvent>);
    },
    /** NoteOpened — context only, never evidence. */
    noteOpened: (userId: string, lang: LanguageCode, textId: string, index: number, session = 's1') => {
      touch(session);
      return bus.emit({
        type: 'NoteOpened', ...base(userId, lang, session), dedupeKey: `note:${uniq()}`, textId, noteId: `note:${textId}:n1`, sentenceId: `${textId}/s${index}`, kind: 'cultural',
      } as EventInput<DomainEvent>);
    },
    /** View every sentence index of a text in one session. */
    viewAll: async (userId: string, lang: LanguageCode, textId: string, count: number, session = 's1', surface: 'corpus' | 'scripture' = 'corpus') => {
      for (let i = 0; i < count; i++) await api.view(userId, lang, textId, i, session, surface);
    },
    /** ComprehensionReported (default: "I understood all of it", sentence scope, reading). */
    report: (userId: string, lang: LanguageCode, textId: string, indexes: number[], o: { session?: string; degree?: Degree; modality?: 'reading' | 'listening'; scope?: 'sentence' | 'text' } = {}) => {
      touch(o.session ?? 's1');
      return bus.emit({
        type: 'ComprehensionReported', ...base(userId, lang, o.session ?? 's1', o.modality === 'listening' ? 'listen' : 'corpus'),
        dedupeKey: `report:${uniq()}`, textId, sentenceIds: indexes.map((i) => `${textId}/s${i}`),
        modality: o.modality ?? 'reading', scope: o.scope ?? 'sentence', degree: o.degree ?? 'all',
      } as EventInput<DomainEvent>);
    },
    /** View then report "all" for the given sentence indexes in one session — a demonstrated reading. */
    understood: async (userId: string, lang: LanguageCode, textId: string, indexes: number[], session = 's1', surface: 'corpus' | 'scripture' = 'corpus') => {
      for (const i of indexes) await api.view(userId, lang, textId, i, session, surface);
      await api.report(userId, lang, textId, indexes, { session });
    },
    complete: (userId: string, lang: LanguageCode, textId: string, session = 's1') => {
      touch(session);
      return bus.emit({ type: 'TextCompleted', ...base(userId, lang, session), dedupeKey: `done:${userId}:${session}:${textId}:${uniq()}`, textId } as EventInput<DomainEvent>);
    },
    help: (userId: string, lang: LanguageCode, textId: string, index: number, tokenIndex: number, itemId: string, level: AssistanceLevel, session = 's1') => {
      const sentenceId = `${textId}/s${index}`;
      touch(session);
      return bus.emit({
        type: 'TokenHelpOpened', ...base(userId, lang, session), dedupeKey: `help:${uniq()}`,
        sentenceId, tokenId: `${sentenceId}/t${tokenIndex}`, itemId, level,
      } as EventInput<DomainEvent>);
    },
    rescue: (userId: string, lang: LanguageCode, textId: string, indexes: number[], session = 's1') => {
      touch(session);
      return bus.emit({
        type: 'EnglishRescueRevealed', ...base(userId, lang, session), dedupeKey: `rescue:${uniq()}`,
        textId, sentenceIds: indexes.map((i) => `${textId}/s${i}`), scope: 'sentence',
      } as EventInput<DomainEvent>);
    },
    listen: async (userId: string, lang: LanguageCode, textId: string, indexes: number[], o: ListenOpts = {}) => {
      touch(o.session ?? 'l1');
      const sentenceIds = indexes.map((i) => `${textId}/s${i}`);
      const segmentId = o.segmentId ?? `seg:${uniq()}`;
      let assetId = o.assetId;
      if (!o.legacy && !o.assetId) {
        await api.seedAudio(segmentId, { speech: o.speech ?? true, reviewStatus: o.voiceReviewed === false ? 'unreviewed' : 'approved', textId, sentenceIds, lang, ...(o.kind ? { kind: o.kind } : {}), ...(o.quality ? { quality: o.quality } : {}) });
        assetId = (await store.audioSegments.get(segmentId))?.assetId;
      }
      const asset = assetId ? await store.audioAssets.get(assetId) : undefined;
      const segment = await store.audioSegments.get(segmentId);
      return bus.emit({
        type: 'AudioSegmentCompleted', ...base(userId, lang, o.session ?? 'l1', 'listen'), dedupeKey: `done:${uniq()}`,
        textId, segmentId, sentenceIds, speed: o.speed ?? 1,
        transcriptVisible: false, replayCount: o.replays ?? 0, revealedTranscript: o.transcript ?? false, revealedTranslation: o.translation ?? false,
        ...(o.legacy ? {} : { assetId, speech: o.speech ?? true, voiceReviewed: o.voiceReviewed ?? true,
          sourceType: asset?.sourceType, audioKind: asset?.audioKind, qualityState: asset?.qualityState, rightsId: asset?.rights?.id,
          rightsApproved: asset?.rights?.status === 'approved' && asset.rights.playInApp === true,
          exactTextBound: !!asset?.textBinding && asset.textBinding.textId === textId,
          textSha256: asset?.textBinding?.textSha256, contentVersion: segment?.contentVersion,
          releaseId: asset?.textBinding?.releaseId, editionId: asset?.textBinding?.editionId,
          narratorOrVoiceId: asset?.narratorOrVoiceId, locale: asset?.locale, variety: asset?.variety,
          ...(o.unobserved ? (o.ratio !== undefined ? { heardCoverageRatio: o.ratio } : {}) : { heardCoverageRatio: o.ratio ?? 1, audibleCoverageVersion: 'observed-playback@1' as const }),
          ...(o.heard ? { heardSentenceIds: o.heard.map((i) => `${textId}/s${i}`) } : {}) }),
      } as unknown as EventInput<DomainEvent>);
    },
    /** Rows a LEGACY listening event resolves through: voice → segment → asset. Returns the segment id. */
    seedAudio: async (segmentId: string, o: { speech: boolean; provider?: string; reviewStatus?: ReviewStatus; textId?: string; lang?: LanguageCode; flag?: boolean; sentenceIds?: string[]; assetId?: string; kind?: 'human' | 'synthetic'; quality?: 'machine_checked' | 'human_reviewed' | 'approved' } = { speech: true }) => {
      // Default: a HUMAN, human_reviewed recording with approved rights and an exact binding — the only audio that is listening
      // evidence. Pass kind: 'synthetic' for generated speech (practice only, never evidence).
      const human = (o.kind ?? 'human') === 'human';
      const lang = o.lang ?? 'es';
      const voiceId = `voice:${segmentId}`;
      const assetId = o.assetId;
      const textId = o.textId ?? 't';
      const text = await store.texts.get(textId);
      const textSentences = text ? (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index) : [];
      const binding = text && textSentences.length ? { textId, contentVersion: text.contentVersion, textSha256: await canonicalTextSha256(textId, text.contentVersion, textSentences), releaseId: releaseIdOf(text), editionId: editionIdOf(text) } : undefined;
      const bytes = new TextEncoder().encode(`test-audio:${segmentId}`);
      const assetBytesId = await store.assets.put(bytes, 'audio/wav');
      const resolvedAssetId = assetId ?? assetBytesId;
      await store.voices.put({
        id: voiceId, lang, providerId: o.provider ?? (o.speech ? 'azure' : 'fixture'), voiceId: 'v', requestedLocale: 'es-HN', actualLocale: 'es-MX',
        approved: true, reviewStatus: o.reviewStatus ?? 'approved', isSpeech: o.speech,
      });
      const synthRights = { id: `rights:${segmentId}`, status: 'approved', recordingOwner: 'test', recordingBasis: 'test-only', performanceOwner: 'test', performancePermission: 'test-only', playInApp: true, stream: true, offline: false, redistribute: false, segment: false, transform: false, textDerivative: 'allowed', providerRetention: 'none', providerId: o.provider ?? 'azure', providerTerms: 'test only' };
      const humanRights = { id: `rights:${segmentId}`, status: 'approved', recordingOwner: 'test', recordingBasis: 'test-only', performanceOwner: 'test', performancePermission: 'test-only', playInApp: true, stream: true, offline: false, redistribute: false, segment: false, transform: false };
      await store.audioAssets.put({
        id: resolvedAssetId, lang, locale: 'es-MX', mime: 'audio/wav', sampleRate: 24000, channels: 1, durationMs: 1000,
        bytes: bytes.length, checksum: assetBytesId, createdAt: '2026-01-01T00:00:00.000Z',
        ...(human && o.speech ? { sourceType: 'human-recording', audioKind: 'human' } : { sourceType: 'generated-tts', audioKind: 'synthetic' }),
        ...(o.flag === false ? {} : { isSpeech: o.speech }),
        ...(human && o.speech ? {} : { generation: { providerId: o.provider ?? (o.speech ? 'azure' : 'fixture'), voiceId: 'v', settings: {}, sourceTextHash: 'h', speechTextHash: 'h', normalizerVersion: 'n', pronunciationLexiconVersion: 'l', softwareVersion: 't' } }),
        qualityState: o.quality ?? (human && o.speech ? 'human_reviewed' : 'machine_checked'), narratorOrVoiceId: 'v', rights: human && o.speech ? humanRights : synthRights,
        textBinding: binding,
      } as never);
      await store.audioSegments.put({
        id: segmentId, cacheKey: segmentId, lang, sentenceIds: o.sentenceIds ?? [], textId, displayText: 'x', speechText: 'x',
        speechNormalization: [], pronunciationOverridesUsed: [], voiceConfigId: voiceId, assetId: resolvedAssetId, status: 'ready', sequence: 0, contentVersion: text?.contentVersion ?? 1,
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
