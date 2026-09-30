/** Shared test harness: memory store, bus with a deterministic clock, test adapters, attached GoLearn. */
import { StoreEventBus, createMemoryStore, seedBasics } from '../../src/core';
import type {
  AssistanceLevel, DomainEvent, EventInput, LanguageCode, ProductionKind, ItemKind,
} from '../../src/core';
import { createGoLearn } from '../../src/golearn';
import type { GoLearnDeps } from '../../src/golearn';
import { createTestRegistry } from './testAdapters';

export function makeClock(startMs = Date.UTC(2026, 0, 1)) {
  let n = 0;
  return () => new Date(startMs + 1000 * n++).toISOString();
}

export function createHarness(opts: { lemmaOf?: Parameters<typeof createTestRegistry>[0]; policy?: GoLearnDeps['policy']; attach?: boolean } = {}) {
  const store = createMemoryStore();
  const clock = makeClock();
  const bus = new StoreEventBus(store, clock);
  const adapters = createTestRegistry(opts.lemmaOf);
  const golearn = createGoLearn({ store, bus, adapters, policy: opts.policy, clock });
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
    listen: (userId: string, lang: LanguageCode, textId: string, indexes: number[], o: { session?: string; speed?: number; replays?: number; transcript?: boolean; translation?: boolean } = {}) =>
      bus.emit({
        type: 'AudioSegmentCompleted', ...base(userId, lang, o.session ?? 'l1', 'listen'), dedupeKey: `done:${uniq()}`,
        textId, segmentId: `seg:${uniq()}`, sentenceIds: indexes.map((i) => `${textId}/s${i}`), speed: o.speed ?? 1,
        transcriptVisible: false, replayCount: o.replays ?? 0, revealedTranscript: o.transcript ?? false, revealedTranslation: o.translation ?? false,
      } as EventInput<DomainEvent>),
    produce: (userId: string, lang: LanguageCode, itemId: string, kind: ProductionKind, o: { modality?: 'writing' | 'speaking'; session?: string; itemKind?: ItemKind; sentenceText?: string; revisionId?: string } = {}) =>
      bus.emit({
        type: 'ProductionRecorded', ...base(userId, lang, o.session ?? 'p1', 'testimony'), dedupeKey: `prod:${uniq()}`,
        itemId, itemKind: o.itemKind ?? 'form', kind, modality: o.modality ?? 'writing',
        revisionId: o.revisionId ?? 'rev1', sentenceText: o.sentenceText ?? 'una frase',
      } as EventInput<DomainEvent>),
    mark: (userId: string, lang: LanguageCode, itemId: string, mark: 'known' | 'unknown' | 'clear', itemKind: ItemKind = 'form') =>
      bus.emit({
        type: 'ItemMarked', ...base(userId, lang, 'm1', 'corpus'), dedupeKey: `mark:${uniq()}`, itemId, itemKind, mark,
      } as EventInput<DomainEvent>),
  };
  return api;
}

export type Harness = ReturnType<typeof createHarness>;
