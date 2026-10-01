/**
 * GoLearn — learner state, coverage and recommendations on top of the shared AppStore and EventBus.
 * Events are the only write path: `attach()` subscribes to the bus, `handle()` folds one event, `rebuild()`
 * replays the log. See policy.ts for every weight/threshold (`evidence@3`) and fold.ts for what each event does.
 */
import type {
  AdapterRegistry, AppStore, AssistanceLevel, DomainEvent, EventBus, EvidencePolicy, GoLearn, LanguageCode,
} from '../core';
import { ids } from '../core';
import { auditEvidence, ensureCurrent, policyMetaId, stampIfFresh } from './audit';
import { analyzeText, scriptureReadiness } from './coverage';
import { explainItem } from './explain';
import { FOLD_TYPES, FOLD_TYPE_SET, Folder } from './fold';
import { POLICY_VERSION, defaultPolicy } from './policy';
import { readingProgress } from './progress';
import * as q from './queries';
import { recommend } from './recommend';
import type { Ctx } from './state';

export { defaultPolicy, POLICY_VERSION } from './policy';
export {
  BAND_THRESHOLDS, ESTIMATE, HEAVY_HELP_FRACTION, LEVEL_THRESHOLDS, LISTEN_ASSISTANCE, PRODUCTION_ASSISTANCE, PRODUCTION_WEIGHTS,
  READING_WEIGHTS,
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
}

export function createGoLearn(deps: GoLearnDeps): GoLearn {
  const ctx: Ctx = {
    store: deps.store, bus: deps.bus, adapters: deps.adapters,
    policy: deps.policy ?? defaultPolicy, clock: deps.clock ?? (() => new Date().toISOString()),
    audioEligible: deps.audioEligible,
  };
  const folder = new Folder(ctx);

  // Folds are serialized: read-modify-write of an item's state must not interleave. Only state-changing
  // events enter the queue (GoLearn's own PhraseEncountered is ignored), so a fold that emits on the bus
  // can never wait on itself.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.then(() => undefined, () => undefined);
    return run;
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
    await ctx.store.meta.put({ id: policyMetaId(userId), value: POLICY_VERSION, updatedAt: ctx.clock() });
  });

  const golearn: GoLearn = {
    policyVersion: POLICY_VERSION,

    attach() {
      if (!detach) detach = deps.bus.subscribe((e) => golearn.handle(e), { types: [...FOLD_TYPES] });
      return () => { detach?.(); detach = undefined; };
    },

    async handle(event: DomainEvent) {
      if (!FOLD_TYPE_SET.has(event.type)) return;
      await enqueue(async () => { await stampIfFresh(ctx, event.userId, stampChecked); await folder.fold(event, false); });
    },

    rebuild,
    ensureCurrent: (userId) => ensureCurrent(ctx, userId, rebuild),
    auditEvidence: (userId, opts) => auditEvidence(ctx, userId, rebuild, opts),
    explainItem: (userId, itemId) => explainItem(ctx, userId, itemId),
    readingProgress: (userId, textId) => readingProgress(ctx, userId, textId),

    getItemState: (userId, itemId) => ctx.store.learnerItems.get(ids.learnerItem(userId, itemId)),
    async queryItem(userId, ref) { return (await q.queryItems(ctx, userId, [ref]))[0]; },
    queryItems: (userId, refs) => q.queryItems(ctx, userId, refs),
    listKnown: (userId: string, lang: LanguageCode, modality, minLevel) => q.listKnown(ctx, userId, lang, modality, minLevel),

    resolveAnalysis: (tokenId) => q.resolveAnalysis(ctx, tokenId),
    overrideAnalysis: (tokenId, patch, who) => q.overrideAnalysis(ctx, tokenId, patch, who),

    sentenceSupport: (userId, sentenceId, opts) => q.sentenceSupport(ctx, userId, sentenceId, opts),
    tokenSupport: (userId, tokenId, level: AssistanceLevel) => q.tokenSupport(ctx, userId, tokenId, level),

    async coverage(userId, textId, sentenceIds) { return (await analyzeText(ctx, userId, textId, sentenceIds)).coverage; },
    scriptureReadiness: (userId, textId, sentenceIds, opts) => scriptureReadiness(ctx, userId, textId, sentenceIds, opts),
    recommend: (userId, opts) => recommend(ctx, userId, opts),
  };
  return golearn;
}
