// @vitest-environment node
// The alias-stamp memo of `rekeyIfAliased`: a read after the first does not scan the learner's knowledge rows, but an alias written later is never hidden.
// The "store without aliasStamp behaves as before" case (c) is covered by every test in engine.test.ts / incremental-reads.test.ts, which run on FakeStore (it has no aliasStamp).
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { UnitAlias } from '../../../packages/repository-contract/src';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { createMemoryStore, openIndexedDbStore, openSqliteStore } from '../../../packages/repository-store/src';
import type { ConcreteStore } from '../../../packages/repository-store/src/rules';
import { L, NOW, card, resetIds } from './helpers';

const alias = (): UnitAlias => ({ oldId: 'form:sq:old', newId: 'form:sq:new', packVersion: '2', reason: 'test', confidence: 0.9, createdAt: NOW, mapping: 'certain' });

type Counts = { wholeKnowledge: number; widestAliasLookup: number };
function spied(store: ConcreteStore): { store: ConcreteStore; counts: Counts } {
  const counts: Counts = { wholeKnowledge: 0, widestAliasLookup: 0 };
  const wrapped = Object.create(store) as ConcreteStore;
  wrapped.getKnowledge = (learnerId: string, ids?: string[]) => { if (!ids) counts.wholeKnowledge++; return store.getKnowledge(learnerId, ids); };
  wrapped.aliasesFor = (ids: string[]) => { counts.widestAliasLookup = Math.max(counts.widestAliasLookup, ids.length); return store.aliasesFor(ids); };
  return { store: wrapped, counts };
}

const stores: Array<[string, () => Promise<ConcreteStore>]> = [
  ['memory', async () => createMemoryStore() as ConcreteStore],
  ['sqlite', async () => openSqliteStore(':memory:', { now: () => NOW }) as unknown as ConcreteStore],
  ['indexeddb', async () => (await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: new IDBFactory(), name: 'stamp' })) as ConcreteStore],
];

describe.each(stores)('alias stamp memo (%s store)', (_name, open) => {
  it('a second read does not scan knowledge rows or the alias table', async () => {
    resetIds();
    const { store, counts } = spied(await open());
    await store.append(L, [card(['form:sq:a'], 'recognition', true), card(['form:sq:b'], 'recognition', true)]);
    const engine = createProjectionEngine({ store, now: () => NOW });
    await engine.project(L);
    await engine.knowledge(L); // first read: the scan runs once and remembers the stamp
    counts.wholeKnowledge = 0; counts.widestAliasLookup = 0;
    await engine.knowledge(L, ['form:sq:a']); // by ids, so the read itself loads no whole table
    await engine.knowledge(L, ['form:sq:b']);
    expect(counts.wholeKnowledge).toBe(0);
    expect(counts.widestAliasLookup).toBeLessThanOrEqual(1); // only the reads own id, never the whole table
  });

  it('an alias that becomes certain after evidence was projected is still found (D2): the next read re-keys the row', async () => {
    resetIds();
    const { store } = spied(await open());
    await store.append(L, [card(['form:sq:old'], 'recognition', true, {}, { id: 'o1' }), card(['form:sq:new'], 'recognition', true, {}, { id: 'n1' })]);
    const engine = createProjectionEngine({ store, now: () => NOW });
    await engine.project(L);
    expect((await engine.knowledge(L)).map((r) => r.unitId)).toEqual(['form:sq:new', 'form:sq:old']); // no alias yet; the memo is now set
    await engine.knowledge(L);
    await store.putAliases([alias()]);
    const after = await engine.knowledge(L);
    expect(after.map((r) => r.unitId)).toEqual(['form:sq:new']);
    expect(after[0].basis.events).toBe(2);
  });
});

describe('SQLite alias stamp', () => {
  it('changes with every putAliases and survives a re-open', async () => {
    const dir = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'alias-stamp-'));
    const file = (await import('node:path')).join(dir, 'a.sqlite');
    const a = openSqliteStore(file, { now: () => NOW });
    const s0 = await a.aliasStamp!();
    await a.putAliases([alias()]);
    const s1 = await a.aliasStamp!();
    await a.putAliases([{ ...alias(), reason: 'again' }]);
    const s2 = await a.aliasStamp!();
    expect(new Set([s0, s1, s2]).size).toBe(3);
    await a.close();
    const b = openSqliteStore(file, { now: () => NOW });
    expect(await b.aliasStamp!()).toBe(s2);
    await b.close();
    (await import('node:fs')).rmSync(dir, { recursive: true, force: true });
  });
});
