/**
 * Deletion with a receipt. `applyTombstone` records the tombstone FIRST (so the deletion is visible in exports and to
 * sync), then physically removes what the scope names. A learner-scope tombstone is the one exception to "the receipt
 * stays": `eraseLearner` removes every row of the learner, tombstones included.
 */
import { MAX_LIST_LIMIT, inRange, sourceMatches } from './rules';
import type { EraseCounts, EventRemover } from './rules';
import type { RepositoryStore, StoredEvent, Tombstone } from '../../repository-contract/src';

export interface DeletionResult {
  tombstoneId: string;
  scope: Tombstone['scope']['kind'];
  /** Events physically removed. */
  events: number;
  /** Projection rows discarded because the events behind them are gone (the engine rebuilds them). */
  knowledge: number;
  /** Documents removed (learner scope only; documents never live in events). */
  documents: number;
  /** For learner scope: the store's full erasure counts. */
  erased?: Partial<EraseCounts>;
}

/** A store that can physically remove events: the two concrete stores, not the port. */
export type DeletableStore = RepositoryStore & EventRemover;

export const isDeletableStore = (s: RepositoryStore): s is DeletableStore => typeof (s as Partial<EventRemover>).deleteEvents === 'function';

async function matching(store: RepositoryStore, t: Tombstone): Promise<string[]> {
  const ids: string[] = [];
  const scope = t.scope;
  if (scope.kind === 'event') {
    return (await store.get(t.learnerId, scope.id)) ? [scope.id] : [];
  }
  let afterSeq = 0;
  for (;;) {
    const page: StoredEvent[] = await store.list({ learnerId: t.learnerId, afterSeq, limit: MAX_LIST_LIMIT, ...(scope.kind === 'range' ? { since: scope.from } : {}) });
    for (const e of page) {
      if (scope.kind === 'source' && sourceMatches(e.subject.sourceRef, scope.sourceRef)) ids.push(e.id);
      if (scope.kind === 'range' && inRange(e.at, scope.from, scope.to)) ids.push(e.id);
    }
    if (page.length < MAX_LIST_LIMIT) return ids;
    afterSeq = page[page.length - 1].seq;
  }
}

/** Records the tombstone, then removes what its scope names. One transaction where the store has them. Returns the counts. */
export async function applyTombstone(store: RepositoryStore, t: Tombstone): Promise<DeletionResult> {
  if (!t.tombstoneId || !t.learnerId) throw new Error('a tombstone needs a tombstoneId and a learnerId');
  const scope = t.scope;
  if (scope.kind === 'range' && !(Date.parse(scope.from) <= Date.parse(scope.to))) throw new Error('a range tombstone needs from <= to, both ISO timestamps');
  if (scope.kind === 'source' && !scope.sourceRef?.kind) throw new Error('a source tombstone needs a sourceRef with a kind');
  if (scope.kind !== 'learner' && !isDeletableStore(store)) throw new Error('this store cannot physically delete events (no deleteEvents)');

  return store.transaction(async () => {
    await store.putTombstone(t);
    const result: DeletionResult = { tombstoneId: t.tombstoneId, scope: scope.kind, events: 0, knowledge: 0, documents: 0 };
    if (scope.kind === 'learner') {
      const erased = (await store.eraseLearner(t.learnerId)) as Partial<EraseCounts>;
      return { ...result, events: erased.events ?? 0, knowledge: erased.knowledge ?? 0, documents: erased.documents ?? 0, erased };
    }
    const ids = await matching(store, t);
    if (!ids.length) return result;
    result.events = await (store as DeletableStore).deleteEvents(t.learnerId, ids);
    // What was folded from the deleted events must not outlive them: drop the rows, and rewind the cursor so the engine refolds the log.
    result.knowledge = (await store.getKnowledge(t.learnerId)).length;
    await store.clearKnowledge(t.learnerId);
    const cursor = await store.getProjectionCursor(t.learnerId);
    if (cursor) await store.putProjectionCursor(t.learnerId, { seq: 0, modelVersion: cursor.modelVersion });
    return result;
  });
}
