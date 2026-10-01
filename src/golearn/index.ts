/**
 * GoLearn — learner state, coverage and recommendations on top of the shared AppStore and EventBus.
 * Events are the only write path: `attach()` subscribes to the bus, `handle()` folds one event, `rebuild()`
 * replays the log. See policy.ts for every weight/threshold (`evidence@6`) and fold.ts for what each event does.
 *
 * CONSISTENT READS. Folds are serialized in one queue. Every public READ is a queue entry too: it runs after every
 * fold queued before it and before any fold queued after it, so it can never observe a half-applied fold, whatever
 * the store's latency. Before it is queued, a read also waits (bounded) for events that are still on their way into
 * the log: `attach()` makes the bus's `emit` visible to GoLearn, so a read issued right after an UN-awaited
 * `bus.emit(...)` waits for that event to be appended and queued first. `settled()` is exactly that wait.
 *
 * NO DEADLOCK. Nothing that runs inside a queue entry may wait on the queue. The folder, `recompute*` and every
 * internal reader (`analyzeText`, `classifyTokens`, `readingProgressMany`, `queryItems`, …) are plain functions over
 * the store: they never call the waiting wrappers below. `rebuild` is itself one queue entry; `ensureCurrent` and
 * `auditEvidence` wait for `settled()` BEFORE they start (outside the queue) and then call `rebuild`, so none of them
 * waits on itself. GoLearn's own `PhraseEncountered` events are emitted after the fold's queue entry has finished
 * (a subscriber of that event may read GoLearn), and are untracked.
 */
import type {
  AdapterRegistry, AppStore, AssistanceLevel, DomainEvent, EventBus, EventInput, EvidencePolicy, GoLearn, LanguageCode,
} from '../core';
import { ids } from '../core';
import { publicRow } from './agg';
import { auditEvidence, ensureCurrent, policyMetaId, stampIfFresh } from './audit';
import { analyzeText, scriptureReadiness } from './coverage';
import { explainItem } from './explain';
import { FOLD_TYPES, FOLD_TYPE_SET, Folder } from './fold';
import { predictDifficulty } from './forecast';
import { itemHistory } from './history';
import { readingPace } from './pace';
import { POLICY_VERSION, defaultPolicy } from './policy';
import { readingProgress, readingProgressMany } from './progress';
import * as q from './queries';
import { stageReadiness } from './readiness';
import { recommend } from './recommend';
import type { Ctx } from './state';

export { defaultPolicy, POLICY_VERSION } from './policy';
export {
  BAND_THRESHOLDS, ESTIMATE, FORECAST, HEAVY_HELP_FRACTION, LEVEL_THRESHOLDS, LISTEN_ASSISTANCE, PRODUCTION_ASSISTANCE, PRODUCTION_WEIGHTS,
  READING_WEIGHTS, READINESS,
} from './policy';
export { morphologyLine, pickAnalysis } from './analysis';

export interface GoLearnDeps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  policy?: EvidencePolicy;
  clock?: () => string;
  /**
   * True when reviewed, real-speech audio exists for the text (GoListen's `audioStatus(textId).evidenceEligible`).
   * Absent ⇒ GoLearn never recommends listening.
   */
  audioEligible?: (textId: string) => Promise<boolean>;
  /**
   * Whether listening is part of this version (default true: the engine's capability is unchanged). When false there is no listening
   * recommendation, no `listening` readiness signal, no listening line in an item's history and no audio wording in explanations.
   * Listening events already in a log still fold exactly as before: stored state is identical either way.
   */
  listening?: boolean;
  /**
   * Safety valve of the wait for an in-flight emit (ms). It only matters when a subscriber registered BEFORE GoLearn awaits a
   * GoLearn read inside its handler (that read then waits for an emit that waits for the handler). Default 3000.
   */
  inflightWaitMs?: number;
}

/** An emit of a fold-type event that has been started but whose event GoLearn has not been handed yet. */
interface Inflight { dedupeKey: string; done: Promise<void>; release: () => void }

export function createGoLearn(deps: GoLearnDeps): GoLearn {
  const ctx: Ctx = {
    store: deps.store, bus: deps.bus, adapters: deps.adapters,
    policy: deps.policy ?? defaultPolicy, clock: deps.clock ?? (() => new Date().toISOString()),
    audioEligible: deps.audioEligible,
    listening: deps.listening ?? true,
    evidenceAsOf: (userId, lang) => folder.lastEvidenceAt(userId, lang), // called only after `folder` exists
    userLog: (userId) => folder.userLog(userId),
  };
  const folder = new Folder(ctx);
  const inflightWaitMs = deps.inflightWaitMs ?? 3000;

  // Folds (and reads) are serialized: read-modify-write of an item's state must not interleave. Only state-changing
  // events enter the queue (GoLearn's own PhraseEncountered is ignored).
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };

  // ── in-flight emits (see the header) ──
  const inflight = new Set<Inflight>();
  const released = (dedupeKey: string) => { for (const f of inflight) if (f.dedupeKey === dedupeKey) f.release(); };
  const waitInflight = async (): Promise<void> => {
    if (inflight.size === 0) return;
    const pending = [...inflight].map((f) => f.done);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const valve = new Promise<void>((r) => { timer = setTimeout(r, inflightWaitMs); });
    try { await Promise.race([Promise.all(pending).then(() => undefined), valve]); } finally { if (timer !== undefined) clearTimeout(timer); }
  };
  let restoreEmit: (() => void) | undefined;
  const trackEmits = () => {
    const bus = deps.bus as { emit: EventBus['emit'] };
    const original = bus.emit;
    const hadOwn = Object.prototype.hasOwnProperty.call(bus, 'emit');
    const tracked = function trackedEmit<E extends DomainEvent>(input: EventInput<E>): Promise<E | null> {
      const result = original.call(deps.bus, input) as Promise<E | null>;
      if (!FOLD_TYPE_SET.has(input.type)) return result;
      let release!: () => void;
      const done = new Promise<void>((r) => { release = r; });
      const entry: Inflight = { dedupeKey: input.dedupeKey, done, release };
      inflight.add(entry);
      const finish = () => { entry.release(); inflight.delete(entry); };
      result.then(finish, finish); // appended + handled (or deduped, or failed): nothing left to wait for
      return result;
    } as EventBus['emit'];
    try {
      bus.emit = tracked;
    } catch {
      return; // a frozen bus: reads then rely on the queue alone
    }
    restoreEmit = () => {
      if (bus.emit !== tracked) return; // someone wrapped it after us: leave the chain intact (ours stays a pass-through)
      if (hadOwn) bus.emit = original; else delete (bus as { emit?: unknown }).emit;
    };
  };

  /** Resolves when every event emitted so far has been appended and folded. Never call from inside a queue entry. */
  const settled = async (): Promise<void> => {
    await waitInflight();
    await enqueue(async () => undefined);
  };
  /** A read: waits for in-flight emits, then runs as one queue entry (no fold can interleave with it). */
  const read = async <T>(fn: () => Promise<T>): Promise<T> => {
    await waitInflight();
    return enqueue(fn);
  };

  let detach: (() => void) | undefined;
  const stampChecked = new Set<string>();

  const rebuild = (userId: string) => enqueue(async () => {
    for (const e of await ctx.store.encounters.where('userId', userId)) await ctx.store.encounters.delete(e.id);
    for (const r of await ctx.store.learnerItems.where('userId', userId)) await ctx.store.learnerItems.delete(r.id);
    folder.clearUser(userId);
    stampChecked.add(userId);
    const history = await ctx.bus.history({ userId, types: [...FOLD_TYPES] });
    for (const e of history) await folder.fold(e, true);
    folder.takeOutbox(); // replays never emit; nothing to send
    await ctx.store.meta.put({ id: policyMetaId(userId), value: POLICY_VERSION, updatedAt: ctx.clock() });
  });

  const golearn: GoLearn = {
    policyVersion: POLICY_VERSION,

    attach() {
      if (!detach) {
        trackEmits();
        const off = deps.bus.subscribe((e) => golearn.handle(e), { types: [...FOLD_TYPES] });
        detach = () => { off(); restoreEmit?.(); restoreEmit = undefined; };
      }
      return () => { detach?.(); detach = undefined; };
    },

    async handle(event: DomainEvent) {
      if (!FOLD_TYPE_SET.has(event.type)) return;
      const run = enqueue(async () => {
        await stampIfFresh(ctx, event.userId, stampChecked);
        await folder.fold(event, false);
        return folder.takeOutbox();
      });
      released(event.dedupeKey); // the event is in the queue now: a read queued after this one runs after its fold
      const out = await run;
      for (const e of out) await ctx.bus.emit(e); // outside the queue: a subscriber may read GoLearn
    },

    rebuild,
    settled,
    async ensureCurrent(userId) {
      await settled();
      return ensureCurrent(ctx, userId, rebuild);
    },
    async auditEvidence(userId, opts) {
      await settled();
      return auditEvidence(ctx, userId, rebuild, opts);
    },
    explainItem: (userId, itemId) => read(() => explainItem(ctx, userId, itemId)),
    readingProgress: (userId, textId) => read(() => readingProgress(ctx, userId, textId)),
    readingProgressMany: (userId, textIds) => read(() => readingProgressMany(ctx, userId, textIds)),

    getItemState: (userId, itemId) => read(async () => { const r = await ctx.store.learnerItems.get(ids.learnerItem(userId, itemId)); return r ? publicRow(r) : undefined; }),
    queryItem: (userId, ref) => read(async () => (await q.queryItems(ctx, userId, [ref]))[0]),
    queryItems: (userId, refs) => read(() => q.queryItems(ctx, userId, refs)),
    listKnown: (userId: string, lang: LanguageCode, modality, minLevel) => read(() => q.listKnown(ctx, userId, lang, modality, minLevel)),

    resolveAnalysis: (tokenId) => q.resolveAnalysis(ctx, tokenId),
    overrideAnalysis: (tokenId, patch, who) => q.overrideAnalysis(ctx, tokenId, patch, who),

    sentenceSupport: (userId, sentenceId, opts) => read(() => q.sentenceSupport(ctx, userId, sentenceId, opts)),
    tokenSupport: (userId, tokenId, level: AssistanceLevel) => read(() => q.tokenSupport(ctx, userId, tokenId, level)),

    coverage: (userId, textId, sentenceIds) => read(async () => (await analyzeText(ctx, userId, textId, sentenceIds)).coverage),
    scriptureReadiness: (userId, textId, sentenceIds, opts) => read(() => scriptureReadiness(ctx, userId, textId, sentenceIds, opts)),
    recommend: (userId, opts) => read(() => recommend(ctx, userId, opts)),

    // ── course-level reading model: plain functions over the store, each one a queue entry like every other read ──
    predictDifficulty: (userId, textId, opts) => read(() => predictDifficulty(ctx, userId, textId, opts)),
    stageReadiness: (userId, courseId, stageId) => read(() => stageReadiness(ctx, userId, courseId, stageId)),
    readingPace: (userId, opts) => read(() => readingPace(ctx, userId, opts)),
    itemHistory: (userId, itemId) => read(() => itemHistory(ctx, userId, itemId)),
  };
  return golearn;
}
