// @vitest-environment node
/**
 * The one-time move of a device's rows into IndexedDB (packages/repository-local/src/migrate.ts). The old rows are the learner's only device copy:
 * these tests hold the four rules (R1 rows untouched but for one state row; R2 switch only after a verified copy; R3 any failure leaves the present path
 * with both databases deleted; R4 an interrupted run is safe to run again).
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { inspectLocal, openLocalRepository, markEventsOwned } from '../../packages/repository-local/src';
import type { LocalRepository } from '../../packages/repository-local/src';
import { keysFor } from '../../packages/repository-local/src/persist';
import type { KeyValueArea } from '../../packages/repository-sync/src/area';
import { clock, createRemote, lookup, newArea, review, type TestArea, type Who } from './support';

const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => {
  if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)}`);
  return r.data as T;
};

const PREFIX = 'local-repo:';
const K = keysFor(PREFIX);
const STATE = `${PREFIX}migration`;
const NAME = 'mig-test';

interface Old { rows: Record<string, unknown>; who: Who; learnerId: string; events: number }

/** Old rows built by the present path itself: enrol, lookups, encounters, a review chain, a correction, documents (several revisions, one deleted), a tombstone, an upload and a pull. */
async function buildOld(extra = 0): Promise<Old> {
  const area = newArea();
  const remote = createRemote();
  const acct = await remote.signUp('ana@example.test', 'dev-A', ['sq']);
  const c = remote.clock;
  const repo = await openLocalRepository({ area, now: c.now, deviceId: 'dev-A' });
  const id = await repo.identity();
  const e = ok<{ enrolment: { enrolmentId: string } }>(await repo.api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] }));
  const who: Who = { learnerId: id.learnerId, deviceId: id.deviceId, enrolmentId: e.enrolment.enrolmentId };
  const lookups: GoEvent[] = [];
  for (const w of ['shtëpi', 'libër', 'bukur', 'zog', 'mace', 'shtëpi', 'libër']) { c.tick(); lookups.push(lookup(who, w, c)); }
  ok(await repo.api.appendEvents(lookups));
  let previous: string | null = null;
  for (const grade of ['again', 'good', 'good']) {
    c.tick();
    const r = review(who, 'lemma:sq:shtëpi:NOUN', c, { subject: { itemIds: ['lemma:sq:shtëpi:NOUN'], cardId: 'card:chain' }, payload: { cardKind: 'recognition', grade, correct: grade !== 'again', hinted: false, expectedPreviousReviewId: previous } });
    ok(await repo.api.submitReviews([r]));
    previous = r.id;
  }
  c.tick();
  await repo.api.correct({ formId: 'form:sq:shtëpi', reason: 'test' });
  // documents: d1 with three revisions, d2 with two and then deleted
  ok(await repo.api.putDocument('d1', { languageId: 'sq', kind: 'note', body: 'një' }, 0));
  ok(await repo.api.putDocument('d1', { languageId: 'sq', kind: 'note', body: 'dy' }, 1));
  ok(await repo.api.putDocument('d1', { languageId: 'sq', kind: 'note', body: 'tre', title: 'T' }, 2));
  ok(await repo.api.putDocument('d2', { languageId: 'sq', kind: 'draft', body: 'a' }, 0));
  ok(await repo.api.putDocument('d2', { languageId: 'sq', kind: 'draft', body: 'b' }, 1));
  c.tick();
  ok(await repo.api.deleteDocument('d2'));
  ok(await repo.api.putTombstone({ kind: 'event', id: lookups[3].id }));
  // upload to, then pull from, the fake remote: markers and a cursor exist
  await repo.uploadTo(acct.api);
  const other = await remote.signIn('ana@example.test', 'dev-B');
  const b: Who = { learnerId: acct.learnerId, enrolmentId: acct.enrolmentId, deviceId: 'dev-B' };
  c.tick();
  ok(await other.appendEvents([lookup(b, 'zog', c), lookup(b, 'hapur', c)]));
  await repo.pullFrom(acct.api);
  c.tick();
  ok(await repo.api.appendEvents([lookup(who, 'tavolinë', c)]));
  await markEventsOwned(repo, [lookups[0].id], acct.learnerId);
  for (let i = 0; i < extra; i += 500) {
    const batch: GoEvent[] = [];
    for (let j = i; j < Math.min(extra, i + 500); j++) { c.tick(1000); batch.push(lookup(who, `w${j % 60}`, c)); }
    ok(await repo.api.appendEvents(batch));
  }
  await repo.close();
  // a real device has opened the present path again since its last deletion: the load has renumbered the rows and the rows are at rest
  const again = await openLocalRepository({ area, now: c.now, deviceId: 'dev-A' });
  const events = (await again.exportEvents()).length;
  await again.close();
  const settled = (area as TestArea).dump();
  const rows = (area as TestArea).dump();
  const third = await openLocalRepository({ area, now: c.now, deviceId: 'dev-A' });
  await third.close();
  expect(canonical((area as TestArea).dump())).toBe(canonical(settled)); // at rest: opening writes nothing
  expect(Object.keys(rows).some((k) => k.startsWith(K.uploaded))).toBe(true);
  expect(rows[K.pull]).toBeDefined();
  expect(Object.keys(rows).some((k) => k.startsWith(K.doc))).toBe(true);
  expect(Object.keys(rows).some((k) => k.startsWith(K.tomb))).toBe(true);
  return { rows, who, learnerId: id.learnerId, events };
}

const areaOf = (rows: Record<string, unknown>): TestArea => { const a = newArea(); void a.set(rows); return a; };
const canonical = (rows: Record<string, unknown>): string => JSON.stringify(Object.keys(rows).sort().map((k) => [k, rows[k]]));

/** An area that records what is asked of it. */
function spyArea(inner: TestArea): TestArea & { reads: string[]; writes: string[]; removes: string[] } {
  const reads: string[] = [];
  const writes: string[] = [];
  const removes: string[] = [];
  const a = {
    ...inner, reads, writes, removes,
    get: (k: string | string[] | null) => { reads.push(k === null ? '*' : [k].flat().join(',')); return inner.get(k); },
    list: (p: string) => { reads.push(`list:${p}`); return inner.list(p); },
    getPrefix: (p: string) => { reads.push(`prefix:${p}`); return inner.getPrefix!(p); },
    set: (i: Record<string, unknown>) => { writes.push(...Object.keys(i)); return inner.set(i); },
    remove: (k: string | string[]) => { removes.push(...[k].flat()); return inner.remove(k); },
  };
  return a as never;
}

const migrating = (area: KeyValueArea, idb: IDBFactory, attempt = 1, more: Partial<Parameters<typeof openLocalRepository>[0]> = {}, c = clock('2026-10-20T08:00:00.000Z'), inject?: NonNullable<Parameters<typeof openLocalRepository>[0]['migrate']>['inject']) =>
  openLocalRepository({ area, idb: { indexedDB: idb, name: NAME, keyRange: IDBKeyRange }, migrate: { attempt, ...(inject ? { inject } : {}) }, now: c.now, deviceId: 'dev-A', ...more });
const present = (rows: Record<string, unknown>) => openLocalRepository({ area: areaOf(rows), now: clock('2026-10-20T08:00:00.000Z').now, deviceId: 'dev-A' });

/** Everything comparable that a repository answers. */
async function answers(repo: LocalRepository, who: Who) {
  const i = await inspectLocal(repo);
  return {
    events: await repo.exportEvents(),
    knowledge: ok<{ knowledge: unknown[] }>(await repo.api.knowledge()).knowledge,
    candidates: ok<unknown>(await repo.api.candidates(who.enrolmentId, 50)),
    vocabulary: ok<unknown>(await repo.api.vocabulary({ languageId: 'sq', limit: 100 })),
    enrolments: ok<unknown>(await repo.api.listEnrolments()),
    documents: ok<unknown>(await repo.api.listDocuments()),
    doc1: ok<unknown>(await repo.api.getDocument('d1')),
    inspect: { events: i.events, pendingUpload: i.pendingUpload, uploaded: i.uploaded, fromRemote: i.fromRemote, learnerId: i.learnerId, deviceId: i.deviceId },
  };
}

const rawDb = <T,>(idb: IDBFactory, name: string, fn: (db: IDBDatabase) => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
  const o = idb.open(name);
  o.onerror = () => reject(o.error);
  o.onsuccess = () => { const db = o.result; fn(db).then((r) => { db.close(); resolve(r); }, (e) => { db.close(); reject(e); }); };
});
const reqP = <T,>(q: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
const databases = async (idb: IDBFactory): Promise<string[]> => (await idb.databases()).map((d) => d.name!).sort();
async function dumpAll(idb: IDBFactory, name: string): Promise<Record<string, unknown[]>> {
  return rawDb(idb, name, async (db) => {
    const out: Record<string, unknown[]> = {};
    for (const n of [...db.objectStoreNames]) out[n] = await reqP(db.transaction(n).objectStore(n).getAll());
    return out;
  });
}
/** Changes one row of one object store: `change` returns the new value, or undefined to delete it. */
async function tamper(idb: IDBFactory, db: string, store: string, pick: (row: any) => boolean, change: (row: any) => unknown): Promise<void> {
  await rawDb(idb, db, async (d) => {
    const tx = d.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    const keys = await reqP(s.getAllKeys());
    const vals = await reqP(s.getAll());
    const i = vals.findIndex(pick);
    if (i < 0) throw new Error('nothing to tamper with');
    const next = change(vals[i]);
    if (next === undefined) await reqP(s.delete(keys[i]));
    else if (s.keyPath !== null) await reqP(s.put(next));
    else await reqP(s.put(next, keys[i]));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  });
}

const LEAK = /lemma|form:|shtëpi|libër|bukur|zog|mace|tavolinë|[0-9a-f]{8}-[0-9a-f]{4}|\bt:\d|\br:\d|d1|d2|dev-A/;

let old: Old;
let big: Old;
beforeAll(async () => { old = await buildOld(); big = await buildOld(3000); }, 300000);

describe('migration: the rows become IndexedDB, verified', () => {
  it('(a) every comparable answer equals the present path\'s; the state row says switched; the old rows are byte-for-byte unchanged apart from that one row (R1)', async () => {
    const reference = await answers(await present(old.rows), old.who);
    expect(reference.events.length).toBeGreaterThan(10);
    expect(reference.knowledge.length).toBeGreaterThan(3);
    const area = spyArea(areaOf(old.rows));
    const before = canonical(area.dump());
    const idb = new IDBFactory();
    const repo = await migrating(area, idb);
    const info = (await inspectLocal(repo)).storage;
    expect(info.mode).toBe('indexeddb');
    expect(info.migration).toMatchObject({ state: 'switched', attempt: 1, events: reference.events.length });
    expect(typeof info.migration!.ms).toBe('number');
    expect(await answers(repo, old.who)).toEqual(reference);

    // R1: nothing removed, nothing rewritten, one new row
    const after = area.dump();
    const { [STATE]: stateRow, ...rest } = after;
    expect(canonical(rest)).toBe(before);
    expect(stateRow).toMatchObject({ state: 'switched', attempt: 1, events: reference.events.length });
    expect(area.writes).toEqual([STATE]);
    expect(area.removes).toEqual([]);
    expect((stateRow as { verified: Record<string, number> }).verified).toMatchObject({ events: reference.events.length });
    expect(JSON.stringify(stateRow)).not.toMatch(LEAK);
    // the migrated device holds the identity, the markers and the cursor in the key-value database
    const kv = (await dumpAll(idb, `${NAME}-kv`)).kv;
    expect(kv.length).toBeGreaterThan(5);
    await repo.close();
  });

  it('(b) the next open goes straight to IndexedDB and reads none of the old rows but the state row', async () => {
    const area = spyArea(areaOf(old.rows));
    const idb = new IDBFactory();
    await (await migrating(area, idb)).close();
    const rows = area.dump();
    const again = spyArea(areaOf(rows));
    const repo = await migrating(again, idb);
    expect(again.reads).toEqual([STATE]);
    expect(again.writes).toEqual([]);
    expect((await inspectLocal(repo)).storage).toMatchObject({ mode: 'indexeddb', migration: { state: 'switched', attempt: 1 } });
    expect(await repo.exportEvents()).toEqual(await (await present(old.rows)).exportEvents());
    expect(again.reads.filter((r) => r !== STATE)).toEqual([]);
    await repo.close();
  });

  it('(f) a fresh device goes straight to IndexedDB mode and records a switched state', async () => {
    const area = spyArea(newArea());
    const idb = new IDBFactory();
    const repo = await migrating(area, idb, 3);
    expect((await inspectLocal(repo)).storage).toMatchObject({ mode: 'indexeddb', migration: { state: 'switched', attempt: 3, events: 0 } });
    expect(area.dump()[STATE]).toMatchObject({ state: 'switched', attempt: 3, events: 0 });
    expect(Object.keys(area.dump())).toEqual([STATE]);
    expect(area.removes).toEqual([]);
    const id = await repo.identity();
    await repo.close();
    expect((await (await migrating(area, idb, 3)).identity()).learnerId).toBe(id.learnerId);
  });

  it('(i) the present loader ignores the state row (and any unknown key under the prefix)', async () => {
    const plain = await answers(await present(old.rows), old.who);
    const withState = await answers(await present({ ...old.rows, [STATE]: { state: 'switched', at: 'x', attempt: 1, events: 1 }, [`${PREFIX}zzz-unknown`]: { a: 1 } }), old.who);
    expect(withState).toEqual(plain);
    const a = areaOf({ ...old.rows, [STATE]: { state: 'failed', at: 'x', attempt: 1, reason: 'r' } });
    const repo = await openLocalRepository({ area: a, now: clock('2026-10-20T08:00:00.000Z').now, deviceId: 'dev-A' });
    await repo.close();
    expect(Object.keys(a.dump()).filter((k) => !(k in old.rows))).toEqual([STATE]);
  });

  it('(j) rows with skipped events (some already set aside by an earlier load, one not yet loaded) migrate and verify', async () => {
    const eventRows = Object.entries(old.rows).filter(([k]) => k.startsWith(K.event)).sort(([a], [b]) => Number(a.slice(K.event.length)) - Number(b.slice(K.event.length)));
    const base = (eventRows[1][1] as { event: GoEvent }).event;
    const bad = (n: number): [string, unknown] => [`${K.event}${900 + n}`, { v: 1, event: { ...base, id: `bad:${n}`, dedupeKey: `bad:${n}`, kind: 'NoSuchKindOfEvent' } }];
    const first = Object.fromEntries([...Object.entries(old.rows), bad(1)]);
    const loadArea = areaOf(first);
    const loaded = await openLocalRepository({ area: loadArea, now: clock('2026-10-20T08:00:00.000Z').now, deviceId: 'dev-A' });
    expect((await inspectLocal(loaded)).loaded.skippedEvents).toBe(1);
    await loaded.close();
    const rows = { ...loadArea.dump(), ...Object.fromEntries([bad(2)]) };
    expect(Object.keys(rows).filter((k) => k.startsWith(`${PREFIX}skipped:`))).toHaveLength(1);

    const area = spyArea(areaOf(rows));
    const before = canonical(area.dump());
    const idb = new IDBFactory();
    const repo = await migrating(area, idb);
    expect((await inspectLocal(repo)).storage.migration).toMatchObject({ state: 'switched' });
    const { [STATE]: _s, ...rest } = area.dump();
    void _s;
    expect(canonical(rest)).toBe(before);
    expect(await repo.exportEvents()).toEqual(await (await present(rows)).exportEvents());
    // the set-aside markers are kept in the new key-value rows (the bad rows were not offered to the durable store)
    const kv = (await dumpAll(idb, `${NAME}-kv`)).kv as unknown[];
    expect(JSON.stringify(kv)).toContain('bad:1');
    expect(JSON.stringify(kv)).toContain('bad:2');
    expect(JSON.stringify(await dumpAll(idb, NAME))).not.toContain('NoSuchKindOfEvent');
    await repo.close();
  });
});

describe('migration: failure leaves the present path, both databases deleted, the rows untouched (R2, R3)', () => {
  type Fault = { name: string; run: (idb: IDBFactory) => Promise<void>; field: RegExp };
  const faults: Fault[] = [
    { name: 'a dropped event', field: /events: \d+ vs \d+/, run: (idb) => tamper(idb, NAME, 'events', (r) => r.kind === 'SelectionLookedUp' && r.seq === 3, () => undefined) },
    { name: 'an altered knowledge row', field: /knowledge: \d+ vs \d+, 1 differ \(fields [a-zA-Z,]+\)/, run: (idb) => tamper(idb, NAME, 'knowledge', () => true, (r) => ({ ...r, encounters: (r.encounters ?? 0) + 7 })) },
    { name: 'an altered upload marker', field: /markers: \d+ vs \d+, 1 differ/, run: (idb) => tamper(idb, `${NAME}-kv`, 'kv', (r) => r && typeof r === 'object' && 'to' in r, (r) => ({ ...r, to: 'someone-else' })) },
  ];
  for (const f of faults) {
    it(`(c) ${f.name}: verification fails with a reason of counts and field names, the device keeps working on the rows`, async () => {
      const reference = await answers(await present(old.rows), old.who);
      const area = spyArea(areaOf(old.rows));
      const before = canonical(area.dump());
      const idb = new IDBFactory();
      const repo = await migrating(area, idb, 1, {}, undefined, { beforeVerify: () => f.run(idb) });
      const info = (await inspectLocal(repo)).storage;
      expect(info.mode).toBe('rows');
      expect(info.migration!.state).toBe('failed');
      const reason = info.migration!.reason!;
      expect(reason).toMatch(/^verification failed, /);
      expect(reason).toMatch(f.field);
      expect(reason).not.toMatch(LEAK);
      expect(await databases(idb)).toEqual([]); // both deleted
      const { [STATE]: stateRow, ...rest } = area.dump();
      expect(stateRow).toMatchObject({ state: 'failed', attempt: 1, reason });
      expect(canonical(rest)).toBe(before);
      expect(area.removes).toEqual([]);
      expect(await answers(repo, old.who)).toEqual(reference);
      await repo.close();
    });
  }

  it('(d) the same attempt number does not retry; a higher one does and succeeds', async () => {
    const area = spyArea(areaOf(old.rows));
    const idb = new IDBFactory();
    await (await migrating(area, idb, 1, {}, undefined, { beforeVerify: () => tamper(idb, NAME, 'knowledge', () => true, () => undefined) })).close();
    expect((area.dump()[STATE] as { state: string }).state).toBe('failed');
    expect(await databases(idb)).toEqual([]);

    const again = spyArea(areaOf(area.dump()));
    const same = await migrating(again, idb, 1);
    expect((await inspectLocal(same)).storage).toMatchObject({ mode: 'rows', migration: { state: 'failed', attempt: 1 } });
    expect(await databases(idb)).toEqual([]); // nothing was created
    expect(again.writes).toEqual([]);
    await same.close();

    const next = await migrating(again, idb, 2);
    expect((await inspectLocal(next)).storage).toMatchObject({ mode: 'indexeddb', migration: { state: 'switched', attempt: 2 } });
    expect(await next.exportEvents()).toEqual(await (await present(old.rows)).exportEvents());
    await next.close();
  });

  it('(e) interrupted: the 7th batch of the import rejects; the device stays on the rows; the next attempt starts clean and succeeds', async () => {
    const area = spyArea(areaOf(big.rows));
    const before = canonical(area.dump());
    const idb = new IDBFactory();
    let batches = 0;
    const repo = await migrating(area, idb, 1, {}, undefined, {
      store: (s) => ({ ...s, append: async (l, events) => { batches += 1; if (batches === 7) throw new Error(`boom ${events.length}`); return s.append(l, events); } }),
    });
    expect(batches).toBe(7);
    const info = (await inspectLocal(repo)).storage;
    expect(info.migration).toMatchObject({ state: 'failed' });
    expect(info.migration!.reason).toMatch(/^import failed, Error$/);
    expect(await databases(idb)).toEqual([]);
    await repo.close();
    const { [STATE]: _s, ...rest } = area.dump();
    void _s;
    expect(canonical(rest)).toBe(before);

    // a process that died mid-import leaves databases and no state row: the next run deletes them first (R4)
    const dead = spyArea(areaOf(big.rows));
    const junk = await openLocalRepository({ area: newArea(), idb: { indexedDB: idb, name: NAME, keyRange: IDBKeyRange }, now: clock().now });
    const e = ok<{ enrolment: { enrolmentId: string } }>(await junk.api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] }));
    const jid = await junk.identity();
    ok(await junk.api.appendEvents([lookup({ learnerId: jid.learnerId, deviceId: jid.deviceId, enrolmentId: e.enrolment.enrolmentId }, 'junk', clock())]));
    await junk.close();
    expect((await databases(idb)).length).toBe(2);
    const done = await migrating(dead, idb, 1);
    expect((await inspectLocal(done)).storage.migration).toMatchObject({ state: 'switched' });
    expect(await done.exportEvents()).toEqual(await (await present(big.rows)).exportEvents());
    expect(JSON.stringify(await dumpAll(idb, NAME))).not.toContain('junk');
    await done.close();
  }, 240000);

  it('a change of the old rows during the migration (another context writing) fails it rather than losing the write', async () => {
    const area = spyArea(areaOf(old.rows));
    const idb = new IDBFactory();
    const repo = await migrating(area, idb, 1, {}, undefined, { beforeVerify: async () => { await area.set({ [`${K.event}99999`]: { v: 1, event: {} } }); } });
    expect((await inspectLocal(repo)).storage.migration).toMatchObject({ state: 'failed' });
    expect((await inspectLocal(repo)).storage.migration!.reason).toMatch(/the old rows changed during the migration \(1 added, 0 removed\)/);
    expect(await databases(idb)).toEqual([]);
    await repo.close();
  });

  it('a meta row that is not valid fails the migration at once (its own only write is the state row; the present path then opens as it always did)', async () => {
    const rows = { ...old.rows, [K.meta]: { format: 99 } };
    const area = spyArea(areaOf(rows));
    const idb = new IDBFactory();
    const repo = await migrating(area, idb);
    expect((await inspectLocal(repo)).storage.migration).toMatchObject({ state: 'failed', reason: 'meta failed, the identity row is not valid' });
    expect(await databases(idb)).toEqual([]);
    expect(area.writes[0]).toBe(STATE); // the migration's one write; what follows is the present path's own open, as before
    await repo.close();
  });
});

describe('migration: after the switch', () => {
  const broken = { open: () => { throw new Error('IndexedDB unavailable'); }, deleteDatabase: () => { throw new Error('IndexedDB unavailable'); } } as unknown as IDBFactory;

  it('(g) IndexedDB failing to open gives a rows-frozen repository that answers from the frozen rows and writes nothing to them', async () => {
    const area = spyArea(areaOf(old.rows));
    const idb = new IDBFactory();
    await (await migrating(area, idb)).close();
    const frozen = spyArea(areaOf(area.dump()));
    const before = canonical(frozen.dump());
    const repo = await migrating(frozen, broken);
    expect((await inspectLocal(repo)).storage).toMatchObject({ mode: 'rows-frozen', migration: { state: 'switched' } });
    expect(await answers(repo, old.who)).toEqual(await answers(await present(old.rows), old.who));
    // a write stays in memory
    const c = clock('2026-10-19T08:00:00.000Z');
    ok(await repo.api.appendEvents([lookup(old.who, 'sot', c)]));
    expect((await repo.exportEvents()).length).toBe(old.events + 1);
    await repo.close();
    expect(canonical(frozen.dump())).toBe(before);
    expect(frozen.writes).toEqual([]);
    expect(frozen.removes).toEqual([]);
  });

  it('(g2) clear() of a rows-frozen device removes the old rows (and tolerates the IndexedDB that will not open)', async () => {
    const area = spyArea(areaOf(old.rows));
    await (await migrating(area, new IDBFactory())).close();
    const frozen = spyArea(areaOf(area.dump()));
    const repo = await migrating(frozen, broken);
    await repo.clear();
    expect(Object.keys(frozen.dump())).toEqual([STATE]);
    expect(frozen.dump()[STATE]).toMatchObject({ state: 'switched', events: 0 });
    expect(await repo.exportEvents()).toEqual([]);
    await repo.close();
  });

  it('(h) clear() after a switch leaves no IndexedDB data and no old rows, starts a fresh identity in IndexedDB mode, and never resurrects the frozen rows', async () => {
    const area = spyArea(areaOf(old.rows));
    const idb = new IDBFactory();
    const repo = await migrating(area, idb);
    const before = await repo.identity();
    const api = repo.api;
    await repo.clear();
    // before anything reads the new learner (a read writes its cursor)
    const stores = await dumpAll(idb, NAME);
    const kv = await dumpAll(idb, `${NAME}-kv`);
    for (const [n, rows] of Object.entries(stores)) expect(rows, n).toEqual([]);
    expect(JSON.stringify(kv)).not.toContain(before.learnerId);
    expect(kv.kv).toHaveLength(1);
    // the old rows under the prefix are gone; the state row is the only one, saying switched with no events
    expect(Object.keys(area.dump())).toEqual([STATE]);
    expect(area.dump()[STATE]).toMatchObject({ state: 'switched', events: 0 });
    expect(JSON.stringify(area.dump())).not.toContain(before.learnerId);
    const after = await repo.identity();
    expect(after.learnerId).not.toBe(before.learnerId);
    expect(after.deviceId).toBe(before.deviceId);
    expect(repo.api).toBe(api);
    expect(await repo.exportEvents()).toEqual([]);
    expect(ok<{ knowledge: unknown[] }>(await api.knowledge()).knowledge).toEqual([]);
    expect((await inspectLocal(repo)).storage).toMatchObject({ mode: 'indexeddb', migration: { state: 'switched', events: 0 } });
    await repo.close();
    // the next open does not bring anything back
    const again = await migrating(area, idb);
    expect((await again.identity()).learnerId).toBe(after.learnerId);
    expect(await again.exportEvents()).toEqual([]);
    await again.close();
  });

  it('a clear() that died half way (state says clearing) is finished by the next open', async () => {
    const area = spyArea(areaOf(old.rows));
    const idb = new IDBFactory();
    await (await migrating(area, idb)).close();
    await area.set({ [STATE]: { ...(area.dump()[STATE] as object), clearing: true } });
    // the rows are all still there; the databases too
    expect(Object.keys(area.dump()).length).toBeGreaterThan(10);
    const repo = await migrating(area, idb);
    expect(Object.keys(area.dump())).toEqual([STATE]);
    expect(area.dump()[STATE]).toMatchObject({ state: 'switched', events: 0 });
    expect(await repo.exportEvents()).toEqual([]);
    await repo.close();
  });
});

describe('migration: size', () => {
  it('(k) 3,000 events migrate and verify, and the time is reported', async () => {
    const reference = await (await present(big.rows)).exportEvents();
    expect(reference.length).toBeGreaterThanOrEqual(3000);
    const area = spyArea(areaOf(big.rows));
    const repo = await migrating(area, new IDBFactory());
    const m = (await inspectLocal(repo)).storage.migration!;
    expect(m).toMatchObject({ state: 'switched', events: reference.length });
    expect(m.ms).toBeGreaterThan(0);
    expect(m.importMs).toBeGreaterThan(0);
    expect(m.verifyMs).toBeGreaterThan(0);
    expect(await repo.exportEvents()).toEqual(reference);
    expect(area.writes).toEqual([STATE]);
    await repo.close();
  }, 240000);
});
