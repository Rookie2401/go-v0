/**
 * GoLearn — learner state, coverage and recommendations on top of the shared AppStore and EventBus.
 * Events are the only write path: `attach()` subscribes to the bus, `handle()` folds one event, `rebuild()`
 * replays the log. See policy.ts for every weight/threshold and fold.ts for what each event does.
 */
import type {
  AdapterRegistry, AppStore, AssistanceLevel, DomainEvent, EventBus, EvidencePolicy, GoLearn, LanguageCode,
} from '../core';
import { ids } from '../core';
import { analyzeText, scriptureReadiness } from './coverage';
import { FOLD_TYPES, FOLD_TYPE_SET, Folder } from './fold';
import { defaultPolicy } from './policy';
import * as q from './queries';
import { recommend } from './recommend';
import type { Ctx } from './state';

export { defaultPolicy } from './policy';
export {
  BAND_THRESHOLDS, LEVEL_THRESHOLDS, LISTEN_ASSISTANCE, PRODUCTION_ASSISTANCE, PRODUCTION_WEIGHTS, READING_WEIGHTS,
} from './policy';
export { morphologyLine, pickAnalysis } from './analysis';

export interface GoLearnDeps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  policy?: EvidencePolicy;
  clock?: () => string;
}

export function createGoLearn(deps: GoLearnDeps): GoLearn {
  const ctx: Ctx = {
    store: deps.store, bus: deps.bus, adapters: deps.adapters,
    policy: deps.policy ?? defaultPolicy, clock: deps.clock ?? (() => new Date().toISOString()),
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

  const golearn: GoLearn = {
    attach() {
      if (!detach) detach = deps.bus.subscribe((e) => golearn.handle(e), { types: [...FOLD_TYPES] });
      return () => { detach?.(); detach = undefined; };
    },

    async handle(event: DomainEvent) {
      if (!FOLD_TYPE_SET.has(event.type)) return;
      await enqueue(() => folder.fold(event, false));
    },

    async rebuild(userId: string) {
      await enqueue(async () => {
        for (const e of await ctx.store.encounters.where('userId', userId)) await ctx.store.encounters.delete(e.id);
        for (const r of await ctx.store.learnerItems.where('userId', userId)) await ctx.store.learnerItems.delete(r.id);
        folder.clearUser(userId);
        const history = await ctx.bus.history({ userId, types: [...FOLD_TYPES] });
        for (const e of history) await folder.fold(e, true);
      });
    },

    getItemState: (userId, itemId) => ctx.store.learnerItems.get(ids.learnerItem(userId, itemId)),
    async queryItem(userId, ref) { return (await q.queryItems(ctx, userId, [ref]))[0]; },
    queryItems: (userId, refs) => q.queryItems(ctx, userId, refs),
    listKnown: (userId: string, lang: LanguageCode, modality, minLevel) => q.listKnown(ctx, userId, lang, modality, minLevel),

    resolveAnalysis: (tokenId) => q.resolveAnalysis(ctx, tokenId),
    overrideAnalysis: (tokenId, patch, who) => q.overrideAnalysis(ctx, tokenId, patch, who),

    sentenceSupport: (userId, sentenceId, opts) => q.sentenceSupport(ctx, userId, sentenceId, opts),
    tokenSupport: (userId, tokenId, level: AssistanceLevel) => q.tokenSupport(ctx, userId, tokenId, level),

    async coverage(userId, textId, sentenceIds) { return (await analyzeText(ctx, userId, textId, sentenceIds)).coverage; },
    scriptureReadiness: (userId, textId, sentenceIds) => scriptureReadiness(ctx, userId, textId, sentenceIds),
    recommend: (userId, opts) => recommend(ctx, userId, opts),
  };
  return golearn;
}
