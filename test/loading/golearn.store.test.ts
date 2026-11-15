// @vitest-environment node
/**
 * Stage 2 as wired in the extension (docs/ecosystem/LOADING-ARCHITECTURE-2026-11-10.md, "Stage 2 as wired"): the worker opens the device Repository over
 * IndexedDB when it has one, moves the old `golearn:repo:` rows in once (verified), and afterwards opens without reading them.
 * A worker is "restarted" the way test/extension/background.wake.test.ts does it: a new rig over a copy of the first one's storage.
 * (g) A worker with no IndexedDB is the present path: every other test in test/extension runs that way (node has no `indexedDB`).
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import type { BackgroundOptions } from '../../packages/golearn-extension/src/background/core';
import { ENROLMENTS_KEY, KEEP_ALIVE_MS, LOCAL_IDB_NAME, LOCAL_MIGRATION_ATTEMPT, LOCAL_PREFIX } from '../../packages/golearn-extension/src/background/localRepo';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { PENDING_IDENTITY, buildMarkEvent } from '../../packages/golearn-extension/src/store';
import { createRig, pendingEvent } from '../extension/rig';

type Rig = ReturnType<typeof createRig>;
const STATE = `${LOCAL_PREFIX}migration`;
const local = (rig: Rig, request: Record<string, unknown>) => rig.page({ type: MSG.localRepo, ...request });
const LEMMAS = ['lemma:sq:shtëpi:NOUN', 'lemma:sq:libër:NOUN'];

/** The learner's own mark on "libër" (ItemMarked), built the way the card builds it. */
function markEvent() {
  const sentence = 'Unë po lexoj një libër të bukur në shtëpinë time.';
  const at = sentence.indexOf('libër');
  const card = parseSelection({ surface: 'libër', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + 5 } });
  return buildMarkEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY }, version: '0.1.0', sessionId: 's-mark', now: new Date('2026-10-08T10:00:01.000Z') }, 'familiar');
}

const newIdb = () => ({ indexedDB: new IDBFactory(), keyRange: IDBKeyRange });

/** A worker as the browser wakes it: a fresh rig over a copy of `from`'s storage. */
async function restart(from: Rig, localRepo?: BackgroundOptions['localRepo']): Promise<Rig> {
  const rig = createRig(localRepo ? { localRepo } : {});
  await rig.fake.local.set(await from.fake.local.get(null));
  return rig;
}

/** A device with a history in the present rows: a worker WITHOUT idb enrols, records two lookups and a mark. */
async function oldDevice(): Promise<Rig> {
  const first = createRig();
  expect(typeof (globalThis as { indexedDB?: unknown }).indexedDB).toBe('undefined');
  await local(first, { op: 'enrol', languageId: 'sq' });
  await first.content({ type: MSG.record, event: pendingEvent('shtëpinë') });
  await first.content({ type: MSG.record, event: pendingEvent('libër') });
  await first.content({ type: MSG.record, event: markEvent() });
  return first;
}

const prefixRows = (all: Record<string, unknown>, except = [STATE]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(LOCAL_PREFIX) && !except.includes(k)));

/** What the card and the setup page are told: the same JSON whichever store answers. */
async function answers(rig: Rig) {
  const profile = await rig.content({ type: MSG.profile, unitIds: LEMMAS, languageId: 'sq' });
  const knowledge = await local(rig, { op: 'knowledge', unitIds: LEMMAS });
  const enrolments = await local(rig, { op: 'enrolments' });
  const status = await rig.page({ type: MSG.status });
  const dump = (v: unknown) => JSON.parse(JSON.stringify(v));
  return dump({ profile, knowledge, enrolments, languageId: status.languageId });
}

const rawDb = <T,>(f: IDBFactory, name: string, fn: (db: IDBDatabase) => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
  const o = f.open(name);
  o.onerror = () => reject(o.error);
  o.onsuccess = () => { const db = o.result; fn(db).then((r) => { db.close(); resolve(r); }, (e) => { db.close(); reject(e); }); };
});
const reqP = <T,>(q: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
async function dumpAll(f: IDBFactory, name: string): Promise<Record<string, unknown[]>> {
  return rawDb(f, name, async (db) => {
    const out: Record<string, unknown[]> = {};
    for (const n of [...db.objectStoreNames]) out[n] = await reqP(db.transaction(n).objectStore(n).getAll());
    return out;
  });
}

afterEach(() => { vi.useRealTimers(); });

describe('the worker with IndexedDB: the first open after the update', () => {
  it('(a) migrates the present rows; the answers are the same, the status says indexeddb and switched, the old rows are unchanged but for the state row', async () => {
    const first = await oldDevice();
    const before = await first.fake.local.get(null);
    const was = await answers(first);
    expect(was.knowledge.knowledge.length).toBeGreaterThan(0);
    expect(Object.keys(prefixRows(before)).length).toBeGreaterThan(5);
    expect(before[STATE]).toBeUndefined();

    const idb = newIdb();
    const second = await restart(first, { idb });
    const status = await local(second, { op: 'status' });
    expect(status).toMatchObject({ ok: true, available: true, storage: { mode: 'indexeddb', migration: { state: 'switched', attempt: LOCAL_MIGRATION_ATTEMPT } } });
    expect(status.storage.migration.events).toBe(status.events);
    expect(await answers(second)).toEqual(was);
    expect(await local(second, { op: 'identity' })).toEqual(await local(first, { op: 'identity' }));

    const after = await second.fake.local.get(null);
    expect(prefixRows(after)).toEqual(prefixRows(before)); // untouched
    expect(after[STATE]).toMatchObject({ state: 'switched', attempt: LOCAL_MIGRATION_ATTEMPT });
    expect(after[ENROLMENTS_KEY]).toEqual(before[ENROLMENTS_KEY]);
  });

  it('(b) the next start reads only the state row from golearn:repo: and answers the same', async () => {
    const first = await oldDevice();
    const idb = newIdb();
    const second = await restart(first, { idb });
    const was = await answers(second);
    const third = createRig({ localRepo: { idb } });
    await third.fake.local.set(await second.fake.local.get(null));
    const area = third.fake.local as unknown as { get(k: string | string[] | null): Promise<Record<string, unknown>>; getKeys?: () => Promise<string[]> };
    const get = area.get.bind(area);
    const reads: string[] = [];
    area.get = async (keys) => {
      if (keys === null) reads.push('*');
      else for (const k of [keys].flat()) if (k.startsWith(LOCAL_PREFIX)) reads.push(k);
      return get(keys);
    };
    if (area.getKeys) { const gk = area.getKeys.bind(area); area.getKeys = async () => { reads.push('keys'); return gk(); }; }
    await local(third, { op: 'identity' }); // the open alone
    expect(reads.filter((r) => r !== STATE)).toEqual([]); // no full read, no row of the history
    expect(reads).toContain(STATE);
    expect(await answers(third)).toEqual(was);
    expect(await local(third, { op: 'status' })).toMatchObject({ storage: { mode: 'indexeddb', migration: { state: 'switched' } } });
  });

  it('(c) a lookup recorded after the switch is in IndexedDB and is not added to the old rows', async () => {
    const first = await oldDevice();
    const idb = newIdb();
    const second = await restart(first, { idb });
    await local(second, { op: 'status' });
    const oldRows = prefixRows(await second.fake.local.get(null));
    const event = pendingEvent('bukur');
    expect(await second.content({ type: MSG.record, event })).toMatchObject({ ok: true });
    expect((await local(second, { op: 'export' })).events.map((e: { id: string }) => e.id)).toContain(event.id);
    const rows = await second.fake.local.get(null);
    expect(prefixRows(rows)).toEqual(oldRows);
    expect(JSON.stringify(prefixRows(rows))).not.toContain(event.id);
    // it is in the database, and survives another start
    expect(JSON.stringify(await dumpAll(idb.indexedDB, LOCAL_IDB_NAME))).toContain(event.id);
    const third = await restart(second, { idb });
    expect((await local(third, { op: 'export' })).events.map((e: { id: string }) => e.id)).toContain(event.id);
  });

  it('(d) a failed migration leaves the worker on the present path, answering as before, with the reason in the status; both databases are deleted', async () => {
    const first = await oldDevice();
    const was = await answers(first);
    const before = await first.fake.local.get(null);
    const idb = newIdb();
    const second = await restart(first, { idb, migrationInject: { beforeVerify: async () => { throw new Error('injected fault'); } } });
    const status = await local(second, { op: 'status' });
    expect(status).toMatchObject({ ok: true, available: true, storage: { mode: 'rows', migration: { state: 'failed', attempt: LOCAL_MIGRATION_ATTEMPT } } });
    expect(status.storage.migration.reason).toMatch(/unexpected failure/); // the seam's error, named by the migration
    expect(await answers(second)).toEqual(was);
    expect(prefixRows(await second.fake.local.get(null))).toEqual(prefixRows(before, [STATE]));
    expect((await second.fake.local.get(STATE))[STATE]).toMatchObject({ state: 'failed' });
    expect((await idb.indexedDB.databases()).map((d) => d.name)).not.toContain(LOCAL_IDB_NAME);
    // the same attempt number does not try again
    const third = await restart(second, { idb });
    expect(await local(third, { op: 'status' })).toMatchObject({ storage: { mode: 'rows', migration: { state: 'failed' } } });
  });

  it('(e) delete-device-data after a switch leaves nothing in either database and no frozen rows; the next open is a fresh identity in IndexedDB', async () => {
    const first = await oldDevice();
    const idb = newIdb();
    const second = await restart(first, { idb });
    const oldId = await local(second, { op: 'identity' });
    expect((await answers(second)).knowledge.knowledge.length).toBeGreaterThan(0);

    expect(await second.page({ type: MSG.clearLocal })).toMatchObject({ ok: true });
    const stores = await dumpAll(idb.indexedDB, LOCAL_IDB_NAME);
    for (const [n, rows] of Object.entries(stores)) expect(rows, n).toEqual([]);
    const kv = await dumpAll(idb.indexedDB, `${LOCAL_IDB_NAME}-kv`);
    expect(kv.kv).toHaveLength(1); // only the fresh identity's own row
    expect(JSON.stringify({ stores, kv })).not.toContain(oldId.learnerId);
    expect(JSON.stringify({ stores, kv })).not.toContain('libër');
    const rows = await second.fake.local.get(null);
    expect(Object.keys(rows).filter((k) => k.startsWith(LOCAL_PREFIX))).toEqual([STATE]);
    expect(rows[STATE]).toMatchObject({ state: 'switched', events: 0 });
    expect(rows[ENROLMENTS_KEY]).toBeUndefined();
    expect(JSON.stringify(rows)).not.toContain(oldId.learnerId);

    const third = await restart(second, { idb });
    const status = await local(third, { op: 'status' });
    expect(status).toMatchObject({ available: true, events: 0, enrolments: [], storage: { mode: 'indexeddb', migration: { state: 'switched', events: 0 } } });
    expect((await local(third, { op: 'identity' })).learnerId).not.toBe(oldId.learnerId);
  });

  it('(e2) delete-device-data on a device that never switched (no IndexedDB) still clears the rows, as before', async () => {
    const first = await oldDevice();
    expect(Object.keys(prefixRows(await first.fake.local.get(null))).length).toBeGreaterThan(5);
    expect(await first.page({ type: MSG.clearLocal })).toMatchObject({ ok: true });
    expect(Object.keys(prefixRows(await first.fake.local.get(null), []))).toEqual([]);
  });

  it('(f) the extension API is touched every 20 s while the open runs, and no more once it has opened', async () => {
    expect(KEEP_ALIVE_MS).toBe(20_000);
    const first = await oldDevice();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); // the open itself runs on real timers
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const keepAlive = vi.fn();
    const second = await restart(first, { idb: newIdb(), keepAlive, migrationInject: { beforeVerify: () => gate } });
    const opening = local(second, { op: 'status' });
    await new Promise((r) => setTimeout(r, 100)); // the migration reaches the gate
    expect(keepAlive).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(19_000);
    expect(keepAlive).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(keepAlive).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(keepAlive).toHaveBeenCalledTimes(3);
    release();
    expect(await opening).toMatchObject({ ok: true, storage: { mode: 'indexeddb' } });
    const calls = keepAlive.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(keepAlive).toHaveBeenCalledTimes(calls);
  });

  it('(f2) the keep-alive stops after an open that fails, too', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const broken = { open: () => { throw new Error('no IndexedDB'); }, deleteDatabase: () => { throw new Error('no IndexedDB'); } } as unknown as IDBFactory;
    const keepAlive = vi.fn();
    const rig = createRig({ localRepo: { idb: { indexedDB: broken, keyRange: IDBKeyRange }, keepAlive } });
    await local(rig, { op: 'status' }).catch(() => undefined);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('(g) a worker with no IndexedDB is the present path: rows, no migration, no state row', async () => {
    const rig = await oldDevice();
    const status = await local(rig, { op: 'status' });
    expect(status).toMatchObject({ available: true, storage: { mode: 'rows' } });
    expect(status.storage.migration).toBeUndefined();
    expect((await rig.fake.local.get(STATE))[STATE]).toBeUndefined();
  });
});
