// @vitest-environment node
import { IDBDatabase, IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIndexedDbArea, createLocalQueue, createMemoryArea, getByPrefix, getOne } from '../../../packages/repository-sync/src';
import { makeClock, makeEvent } from './helpers';

afterEach(() => { vi.restoreAllMocks(); });
const fresh = () => createIndexedDbArea({ keyRange: IDBKeyRange, indexedDB: new IDBFactory(), name: 'area' });

describe('indexeddb area', () => {
  it('sets, gets one, many and all keys; a missing key is absent', async () => {
    const a = await fresh();
    await a.set({ a: 1, b: { x: [1, 2] }, c: 'three' });
    expect(await a.get('a')).toEqual({ a: 1 });
    expect(await a.get(['a', 'c', 'zzz'])).toEqual({ a: 1, c: 'three' });
    expect(await a.get(null)).toEqual({ a: 1, b: { x: [1, 2] }, c: 'three' });
    expect(await a.get([])).toEqual({});
  });

  it('removes one key or several, and ignores absent keys', async () => {
    const a = await fresh();
    await a.set({ a: 1, b: 2, c: 3 });
    await a.remove('a');
    await a.remove(['b', 'nope']);
    expect(await a.get(null)).toEqual({ c: 3 });
  });

  it('stores copies: neither the caller’s object nor a returned value aliases a stored row', async () => {
    const a = await fresh();
    const v = { n: [1] };
    await a.set({ k: v });
    v.n.push(2);
    const got = (await a.get('k')).k as { n: number[] };
    expect(got.n).toEqual([1]);
    got.n.push(9);
    expect((await a.get('k')).k).toEqual({ n: [1] });
  });

  it('list returns the keys with a prefix in ascending order, and only those', async () => {
    const a = await fresh();
    await a.set({ 'q:b': 1, 'q:a': 2, 'q:': 3, 'r:a': 4, q: 5, 'p:z': 6 });
    expect(await a.list('q:')).toEqual(['q:', 'q:a', 'q:b']);
    expect(await a.list('zz')).toEqual([]);
    expect(await a.list('')).toEqual(['p:z', 'q', 'q:', 'q:a', 'q:b', 'r:a']);
  });

  it('getPrefix returns the rows of one prefix; getByPrefix agrees with the memory area', async () => {
    const a = await fresh();
    const m = createMemoryArea();
    const rows = { 'queue:2': { n: 2 }, 'queue:1': { n: 1 }, 'doc:1': { d: 1 }, other: 0 };
    await a.set(rows);
    await m.set(rows);
    expect(await a.getPrefix!('queue:')).toEqual({ 'queue:1': { n: 1 }, 'queue:2': { n: 2 } });
    expect(await getByPrefix(a, 'queue:')).toEqual(await getByPrefix(m, 'queue:'));
    expect(await getOne(a, 'doc:1')).toEqual({ d: 1 });
  });

  it('prefix reads are one bounded key range, never a scan of the other prefixes', async () => {
    const a = await fresh();
    await a.set(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`${i % 2 ? 'x' : 'y'}:${i}`, i])));
    const keys = vi.spyOn(IDBObjectStore.prototype, 'getAllKeys');
    const all = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const cur = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    expect((await a.list('x:')).length).toBe(25);
    expect(Object.keys(await a.getPrefix!('y:')).length).toBe(25);
    for (const c of [...keys.mock.calls, ...all.mock.calls]) {
      const r = c[0] as IDBKeyRange;
      expect(r).toBeInstanceOf(IDBKeyRange);
      expect(r.lower).toMatch(/^[xy]:$/);
      expect(r.upper).toBe(`${r.lower as string}￿`);
    }
    expect(keys.mock.calls.length + all.mock.calls.length).toBe(3); // list: keys; getPrefix: keys + values
    expect(cur).not.toHaveBeenCalled();
  });

  it('get of many keys, set of many rows and remove of many keys are one transaction each', async () => {
    const a = await fresh();
    const tx = vi.spyOn(IDBDatabase.prototype, 'transaction');
    await a.set({ a: 1, b: 2, c: 3 });
    await a.get(['a', 'b', 'c']);
    await a.remove(['a', 'b']);
    expect(tx).toHaveBeenCalledTimes(3);
  });

  it('a failed set leaves nothing behind (atomic per call)', async () => {
    const a = await fresh();
    await a.set({ keep: 1 });
    await expect(a.set({ good: 1, bad: () => 1 })).rejects.toThrow();
    expect(await a.get(null)).toEqual({ keep: 1 });
  });

  it('persists across close and re-open, and another database name is a separate area', async () => {
    const idb = new IDBFactory();
    const a = await createIndexedDbArea({ keyRange: IDBKeyRange, indexedDB: idb, name: 'p' });
    await a.set({ 'queue:1': { n: 1 } });
    a.close();
    const b = await createIndexedDbArea({ keyRange: IDBKeyRange, indexedDB: idb, name: 'p' });
    expect(await b.get(null)).toEqual({ 'queue:1': { n: 1 } });
    const other = await createIndexedDbArea({ keyRange: IDBKeyRange, indexedDB: idb, name: 'other', store: 'rows' });
    expect(await other.get(null)).toEqual({});
  });

  it('carries the sync queue: a queue over it survives a restart', async () => {
    const idb = new IDBFactory();
    const clock = makeClock();
    const a = await createIndexedDbArea({ keyRange: IDBKeyRange, indexedDB: idb, name: 'q' });
    const e = makeEvent('dev-1', clock);
    await createLocalQueue(a, { now: clock.now }).enqueue(e);
    a.close();
    const q2 = createLocalQueue(await createIndexedDbArea({ keyRange: IDBKeyRange, indexedDB: idb, name: 'q' }), { now: clock.now });
    expect((await q2.pending()).map((x) => x.event.id)).toEqual([e.id]);
  });
});
