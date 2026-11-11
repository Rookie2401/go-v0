// @vitest-environment node
import { IDBDatabase, IDBFactory, IDBIndex, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTombstone, createMemoryStore, openIndexedDbStore } from '../../../packages/repository-store/src';
import { storeConformance } from './conformance';
import { storeProvenanceConformance } from './provenance';
import { securityConformance } from './security';
import { L1, L2, doc, encounter, ev, knowledgeRow, pack, preferences, unit } from './fixtures';
import type { Tombstone } from '../../../packages/repository-contract/src';

const open = async () => openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: new IDBFactory(), name: 'conformance' });
storeConformance('indexeddb store', open);
storeProvenanceConformance('indexeddb store', open);
securityConformance('indexeddb store', open);

afterEach(() => { vi.restoreAllMocks(); });

const rowsOf = (idb: IDBFactory, name: string, storeName: string): Promise<unknown[]> => new Promise((resolve, reject) => {
  const o = idb.open(name);
  o.onsuccess = () => {
    const db = o.result;
    const q = db.transaction(storeName).objectStore(storeName).getAll();
    q.onsuccess = () => { db.close(); resolve(q.result); };
    q.onerror = () => reject(q.error);
  };
  o.onerror = () => reject(o.error);
});

const tomb = (id: string, learnerId: string, scope: Tombstone['scope']): Tombstone => ({ tombstoneId: id, learnerId, scope, createdAt: '2026-10-09T00:00:00.000Z', requestedBy: 'learner' } as Tombstone);

describe('indexeddb store specifics', () => {
  it('stamps recordedAt from the injected clock, once per event', async () => {
    let n = 0;
    const s = await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: new IDBFactory(), name: 'x', now: () => `2026-10-08T12:00:0${n++}.000Z` });
    await s.append(L1, [ev('e1'), ev('e2')]);
    expect((await s.list({ learnerId: L1 })).map((e) => e.recordedAt)).toEqual(['2026-10-08T12:00:00.000Z', '2026-10-08T12:00:01.000Z']);
  });

  it('stamps deletedAt of a deleted document from the injected clock', async () => {
    const s = await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: new IDBFactory(), name: 'x', now: () => '2026-10-08T12:00:00.000Z' });
    await s.putDocument(doc(L1, 'd1', 'x'), 0);
    await s.deleteDocument(L1, 'd1');
    expect((await s.getDocument(L1, 'd1'))!.deletedAt).toBe('2026-10-08T12:00:00.000Z');
  });

  it('copies what it is given: mutating the caller’s object afterwards changes nothing stored', async () => {
    const s = await open();
    const event = ev('e1');
    await s.append(L1, [event]);
    (event.payload as { surface: string }).surface = 'changed';
    expect(((await s.get(L1, 'e1'))!.payload as { surface: string }).surface).toBe('shtëpinë');
  });

  it('transaction just runs fn (no rollback)', async () => {
    const s = await open();
    await expect(s.transaction(async () => { await s.append(L1, [ev('e1')]); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await s.head(L1)).toBe(1);
  });

  it('does not offer stats (StoreStats.kind cannot name it)', async () => {
    expect((await open()).stats).toBeUndefined();
  });

  it('persists across close and re-open with the same factory and name', async () => {
    const idb = new IDBFactory();
    const a = await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: idb, name: 'p' });
    const u = 'lemma:sq:shtëpi:NOUN';
    await a.append(L1, [ev('e1'), ev('e2', { dedupeKey: 'k' })]);
    await a.deleteEvents(L1, ['e1']);
    await a.putKnowledge([knowledgeRow(L1, u)]);
    await a.putProjectionCursor(L1, { seq: 2, modelVersion: 'm1' });
    await a.putUnits([unit(u)]);
    await a.putPack(pack('p1', '1'));
    await a.putPreferences(preferences(L1, 'sq'));
    await a.putEnrolment({ enrolmentId: 'en-1', learnerId: L1, languageId: 'sq', startedAt: '2026-10-01T00:00:00.000Z' } as never);
    await a.putDocument(doc(L1, 'd1', 'body'), 0);
    await a.putTombstone(tomb('t1', L1, { kind: 'event', id: 'zzz' }));
    await a.setServiceState!('k', 'v');
    await a.close();
    const b = await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: idb, name: 'p' });
    expect((await b.list({ learnerId: L1 })).map((e) => e.id)).toEqual(['e2']);
    expect(await b.head(L1)).toBe(2); // the counter never goes down
    expect((await b.append(L1, [ev('e3')]))[0]).toEqual({ id: 'e3', stored: true });
    expect((await b.get(L1, 'e3'))!.seq).toBe(3);
    expect((await b.append(L1, [ev('e4', { dedupeKey: 'k' })]))[0]).toMatchObject({ stored: false, duplicateOf: 'e2' });
    expect((await b.getKnowledge(L1)).map((k) => k.unitId)).toEqual([u]);
    expect(await b.getProjectionCursor(L1)).toEqual({ seq: 2, modelVersion: 'm1' });
    expect((await b.getUnits([u])).length).toBe(1);
    expect((await b.listPacks()).length).toBe(1);
    expect(await b.getPreferences(L1, 'sq')).toBeTruthy();
    expect((await b.listEnrolments(L1)).length).toBe(1);
    expect((await b.getDocument(L1, 'd1'))!.body).toBe('body');
    expect((await b.listTombstones(L1)).map((t) => t.tombstoneId)).toEqual(['t1']);
    expect(await b.getServiceState!('k')).toBe('v');
    await b.close();
  });

  it('keeps one learner’s rows apart from another’s', async () => {
    const s = await open();
    await s.append(L1, [ev('a')]);
    await s.append(L2, [ev('b', { learnerId: L2 })]);
    expect((await s.list({ learnerId: L1 })).map((e) => e.id)).toEqual(['a']);
    expect(await s.head(L2)).toBe(1);
  });

  it('opening reads nothing: no transaction, getAll or cursor while a database holding 3,000 events is opened', async () => {
    const idb = new IDBFactory();
    const a = await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: idb, name: 'big' });
    for (let i = 0; i < 6; i++) await a.append(L1, Array.from({ length: 500 }, (_, j) => encounter(`e${i}-${j}`, { subject: { itemIds: [`u${j % 50}`] } })));
    await a.close();
    const real = IDBDatabase.prototype.transaction;
    const started: string[] = [];
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      started.push(String(args[0]));
      return real.apply(this, args);
    });
    const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const cursors = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    const b = await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: idb, name: 'big' });
    expect(started).toEqual([]);
    expect(reads).not.toHaveBeenCalled();
    expect(cursors).not.toHaveBeenCalled();
    expect(await b.head(L1)).toBe(3000);
    expect(started.length).toBe(1);
    await b.close();
  });

  it('bounded reads: get, getKnowledge of one unit and listEventsOfUnits use a key or a bounded range, never the whole store', async () => {
    const s = await open();
    for (let i = 0; i < 4; i++) await s.append(L1, Array.from({ length: 100 }, (_, j) => encounter(`e${i}-${j}`, { subject: { itemIds: [`u${j}`] } })));
    await s.putKnowledge(Array.from({ length: 100 }, (_, j) => knowledgeRow(L1, `u${j}`)));
    const calls: Array<{ store: string; fn: string; arg: unknown }> = [];
    for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      for (const fn of ['getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'get', 'count']) {
        const orig = (proto as unknown as Record<string, (...a: unknown[]) => unknown>)[fn]!;
        vi.spyOn(proto as never, fn as never).mockImplementation(function (this: { name: string }, ...a: unknown[]) {
          calls.push({ store: this.name, fn, arg: a[0] });
          return orig.apply(this, a);
        } as never);
      }
    }
    const unbounded = () => calls.filter((c) => ['getAll', 'getAllKeys', 'openCursor', 'openKeyCursor'].includes(c.fn) && (c.arg === undefined || c.arg === null));
    expect((await s.get(L1, 'e2-7'))!.id).toBe('e2-7');
    expect((await s.getKnowledge(L1, ['u7'])).length).toBe(1);
    const ofUnit = await s.listEventsOfUnits!(L1, ['u7']);
    expect(ofUnit.length).toBe(4);
    expect(ofUnit.map((e) => e.seq)).toEqual([...ofUnit.map((e) => e.seq)].sort((a, b) => a - b));
    expect(unbounded()).toEqual([]);
    // the unit read is one bounded range of the unit index plus one point read per event it names: 4 of 400
    expect(calls.filter((c) => c.store === 'eventUnits' && c.fn === 'getAll').length).toBe(1);
    expect(calls.filter((c) => c.store === 'events' && c.fn === 'get').length).toBe(4);
    expect(calls.filter((c) => c.store === 'events' && c.fn === 'get' && c.arg === undefined).length).toBe(0);
    expect(calls.filter((c) => c.store === 'knowledge').map((c) => c.fn)).toEqual(['get']);
  });

  it('list with afterSeq reads a bounded range and returns just the page', async () => {
    const s = await open();
    await s.append(L1, Array.from({ length: 300 }, (_, i) => encounter(`e${i}`)));
    const spy = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    const page = await s.list({ learnerId: L1, afterSeq: 295 });
    expect(page.map((e) => e.seq)).toEqual([296, 297, 298, 299, 300]);
    expect(spy.mock.calls.length).toBe(1);
    expect(spy.mock.calls.every((c) => c[0] instanceof IDBKeyRange)).toBe(true);
    expect((await s.list({ learnerId: L1, order: 'desc', limit: 2 })).map((e) => e.seq)).toEqual([300, 299]);
  });

  describe('no orphan rows in eventUnits', () => {
    const seed = async () => {
      const idb = new IDBFactory();
      const s = await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: idb, name: 'o' });
      await s.append(L1, [
        ev('a', { subject: { itemIds: ['u1', 'u2'], sourceRef: { kind: 'ebook', title: 'A' } } }),
        ev('b', { subject: { itemIds: ['u2'], sourceRef: { kind: 'ebook', title: 'B' } } }),
        ev('c', { subject: { itemIds: ['u3'], sourceRef: { kind: 'ebook', title: 'A' } } }),
      ]);
      await s.append(L2, [ev('x', { learnerId: L2, subject: { itemIds: ['u1'] } })]);
      return { idb, s };
    };
    it('removeEvents', async () => {
      const { idb, s } = await seed();
      await s.deleteEvents(L1, ['a']);
      expect(await rowsOf(idb, 'o', 'eventUnits')).toEqual([
        { learnerId: L1, unitId: 'u2', seq: 2 }, { learnerId: L1, unitId: 'u3', seq: 3 }, { learnerId: L2, unitId: 'u1', seq: 1 },
      ]);
    });
    it('applyTombstone', async () => {
      const { idb, s } = await seed();
      await applyTombstone(s, tomb('t', L1, { kind: 'source', sourceRef: { kind: 'ebook', title: 'A' } }));
      expect(await rowsOf(idb, 'o', 'eventUnits')).toEqual([{ learnerId: L1, unitId: 'u2', seq: 2 }, { learnerId: L2, unitId: 'u1', seq: 1 }]);
      expect(await rowsOf(idb, 'o', 'events')).toHaveLength(2);
    });
    it('eraseLearner', async () => {
      const { idb, s } = await seed();
      const c = await s.eraseLearner(L1);
      expect(c.events).toBe(3);
      expect(await rowsOf(idb, 'o', 'eventUnits')).toEqual([{ learnerId: L2, unitId: 'u1', seq: 1 }]);
      expect(await rowsOf(idb, 'o', 'events')).toHaveLength(1);
      expect(await s.head(L1)).toBe(0);
    });
  });
});

describe('parity with the memory store (same inputs, deep-equal outputs)', () => {
  const both = async () => {
    const now = () => '2026-10-08T12:00:00.000Z';
    const mem = createMemoryStore({ now });
    const idb = await openIndexedDbStore({ keyRange: IDBKeyRange, indexedDB: new IDBFactory(), name: 'parity', now });
    const events = [
      encounter('d1', { at: '2026-10-01T10:00:00.000Z', subject: { itemIds: ['u1', 'u1', 'u2'], sourceRef: { kind: 'ebook', title: 'A' } } }),
      encounter('d2', { at: '2026-10-02T10:00:00.000Z', subject: { itemIds: ['u2', 'u1'], sourceRef: { kind: 'ebook', title: 'B' } } }),
      encounter('d3', { at: '2026-10-03T10:00:00.000Z', subject: { itemIds: ['u1', 'u3', 'u1'], sourceRef: { kind: 'web', title: 'A' } } }),
      ev('d4', { kind: 'AssistanceRequested', at: '2026-10-04T10:00:00.000Z', subject: { itemIds: ['u3'], sourceRef: { kind: 'ebook', title: 'B' } } }),
      encounter('d5', { languageId: 'de', subject: { itemIds: ['u1'] } }),
    ];
    const k = (u: string, level: 'new' | 'seen' | 'known', encounters: number, languageId = 'sq') => ({ ...knowledgeRow(L1, u), level, encounters, languageId });
    const rows = [k('u1', 'seen', 3), k('u2', 'known', 1), k('u3', 'seen', 0), k('u4', 'new', 0), k('u5', 'known', 2, 'de')];
    for (const s of [mem, idb]) { await s.append(L1, events); await s.putKnowledge(rows); }
    return { mem, idb };
  };

  it('listEncounterSummaries, with a unit named twice in one event, for several limits', async () => {
    const { mem, idb } = await both();
    for (const limit of [0, 1, 2, 3, 4, 10]) {
      const args: [string, string, string[], number] = [L1, 'sq', ['u1', 'u2', 'u3', 'nope'], limit];
      expect(await idb.listEncounterSummaries!(...args)).toEqual(await mem.listEncounterSummaries!(...args));
    }
    expect((await mem.listEncounterSummaries!(L1, 'sq', ['u1'], 10)).length).toBe(5); // 2 + 1 + 2: memory counts every mention
  });

  it('getKnowledgePage with and without a sourceRef filter, across pages', async () => {
    const { mem, idb } = await both();
    for (const sourceRef of [undefined, 'A', 'B', 'ebook', 'web', 'none']) {
      for (const limit of [1, 2, 500]) {
        let afterM: string | undefined; let afterI: string | undefined;
        for (let page = 0; page < 6; page++) {
          const m = await mem.getKnowledgePage!(L1, { languageId: 'sq', limit, ...(afterM ? { after: afterM } : {}), ...(sourceRef ? { sourceRef } : {}) });
          const i = await idb.getKnowledgePage!(L1, { languageId: 'sq', limit, ...(afterI ? { after: afterI } : {}), ...(sourceRef ? { sourceRef } : {}) });
          expect(i).toEqual(m);
          if (!m.length) break;
          afterM = afterI = m[m.length - 1]!.unitId;
        }
      }
    }
  });

  it('getEncounteredKnowledgeStats', async () => {
    const { mem, idb } = await both();
    for (const lang of ['sq', 'de', 'xx']) expect(await idb.getEncounteredKnowledgeStats!(L1, lang)).toEqual(await mem.getEncounteredKnowledgeStats!(L1, lang));
  });
});
