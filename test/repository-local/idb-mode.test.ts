// @vitest-environment node
/**
 * The device-local Repository over IndexedDB (`idb` option): parity with the present path, persistence without a rebuild, an open that reads nothing,
 * identity rows that never reach the database, and `clear()`.
 */
import { IDBDatabase, IDBFactory, IDBIndex, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { inspectLocal, openLocalRepository, markEventsOwned } from '../../packages/repository-local/src';
import type { LocalRepository } from '../../packages/repository-local/src';
import { clock, createRemote, lookup, newArea, review, type Who } from './support';

const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => {
  if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)}`);
  return r.data as T;
};

afterEach(() => { vi.restoreAllMocks(); });

const NAME = 'repo-test';
const openIdb = (idb: IDBFactory, c = clock(), more: Partial<Parameters<typeof openLocalRepository>[0]> = {}) =>
  openLocalRepository({ area: newArea(), idb: { indexedDB: idb, name: NAME, keyRange: IDBKeyRange }, now: c.now, ...more });

/** Every object store of a database, read raw. */
const dump = (idb: IDBFactory, name: string): Promise<Record<string, unknown[]>> => new Promise((resolve, reject) => {
  const o = idb.open(name);
  o.onerror = () => reject(o.error);
  o.onsuccess = () => {
    const db = o.result;
    const names = [...db.objectStoreNames];
    if (!names.length) { db.close(); return resolve({}); }
    const tx = db.transaction(names);
    const out: Record<string, unknown[]> = {};
    for (const n of names) { const q = tx.objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; }; }
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = () => reject(tx.error);
  };
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b(?:t|r|card):\d+/g; // random ids, and the support builders' module-wide counters
/** Random ids differ between two runs: each is replaced by the order in which it first appears. */
function normalise(value: unknown): unknown {
  const seen = new Map<string, string>();
  return JSON.parse(JSON.stringify(value).replace(UUID, (m) => { if (!seen.has(m)) seen.set(m, `#${seen.size}`); return seen.get(m)!; }));
}

/** One scripted history, run against whichever repository is given; returns everything observable. */
async function script(open: (c: ReturnType<typeof clock>) => Promise<LocalRepository>) {
  const remote = createRemote();
  const acct = await remote.signUp('ana@example.test', 'dev-A', ['sq']);
  const c = remote.clock;
  const repo = await open(c);
  const id = await repo.identity();
  const e = ok<{ enrolment: { enrolmentId: string } }>(await repo.api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] }));
  const who: Who = { learnerId: id.learnerId, deviceId: id.deviceId, enrolmentId: e.enrolment.enrolmentId };
  const words = ['shtëpi', 'libër', 'bukur', 'zog', 'mace'];
  const log: unknown[] = [];
  const lookups: GoEvent[] = [];
  for (const w of [...words, 'shtëpi', 'libër']) { c.tick(); lookups.push(lookup(who, w, c)); }
  log.push(ok<unknown>(await repo.api.appendEvents(lookups)));
  // a review chain on one card
  let previous: string | null = null;
  for (const grade of ['again', 'good', 'good']) {
    c.tick();
    const r = review(who, 'lemma:sq:shtëpi:NOUN', c, { subject: { itemIds: ['lemma:sq:shtëpi:NOUN'], cardId: 'card:chain' }, payload: { cardKind: 'recognition', grade, correct: grade !== 'again', hinted: false, expectedPreviousReviewId: previous } });
    log.push((await repo.api.submitReviews([r])).ok);
    previous = r.id;
  }
  // a correction of a form's reading
  c.tick();
  const corr = await repo.api.correct({ formId: 'form:sq:shtëpi', reason: 'test' });
  log.push({ correct: corr.ok, status: corr.status });
  // a document, then a tombstone of one event
  log.push((await repo.api.putDocument('d1', { languageId: 'sq', kind: 'note', body: 'shënim' }, 0)).ok);
  const tomb = await repo.api.putTombstone({ kind: 'event', id: lookups[3].id });
  log.push({ tomb: tomb.ok });
  // upload to, then pull from, the fake remote
  log.push(await repo.uploadTo(acct.api));
  const other = await remote.signIn('ana@example.test', 'dev-B');
  const b: Who = { learnerId: acct.learnerId, enrolmentId: acct.enrolmentId, deviceId: 'dev-B' };
  c.tick();
  ok(await other.appendEvents([lookup(b, 'zog', c), lookup(b, 'hapur', c)]));
  log.push(await repo.pullFrom(acct.api));
  c.tick();
  log.push(ok<unknown>(await repo.api.appendEvents([lookup(who, 'tavolinë', c)])));
  await markEventsOwned(repo, [lookups[0].id], acct.learnerId);

  const inspected = await inspectLocal(repo);
  const result = {
    log,
    knowledge: ok<{ knowledge: unknown[] }>(await repo.api.knowledge()).knowledge,
    candidates: ok<unknown>(await repo.api.candidates(who.enrolmentId, 50)),
    vocabulary: ok<unknown>(await repo.api.vocabulary({ languageId: 'sq', limit: 100 })),
    enrolments: ok<unknown>(await repo.api.listEnrolments()),
    documents: ok<unknown>(await repo.api.listDocuments()),
    events: await repo.exportEvents(),
    inspect: (({ learnerId, deviceId, events, pendingUpload, uploaded, fromRemote, waiting }) => ({ learnerId, deviceId, events, pendingUpload, uploaded, fromRemote, waiting }))(inspected),
  };
  return { repo, who, result: normalise(result) as typeof result, raw: result };
}

describe('IndexedDB mode: parity with the present path', () => {
  it('one scripted history gives deep-equal knowledge, candidates, vocabulary, enrolments, documents, exported events and inspection', async () => {
    const present = await script((c) => openLocalRepository({ area: newArea(), now: c.now, deviceId: 'dev-A' }));
    const idb = new IDBFactory();
    const viaIdb = await script((c) => openIdb(idb, c, { deviceId: 'dev-A' }));
    expect(present.result.events.length).toBeGreaterThan(8);
    expect(present.result.knowledge.length).toBeGreaterThan(3);
    expect(viaIdb.result.knowledge).toEqual(present.result.knowledge);
    expect(viaIdb.result.candidates).toEqual(present.result.candidates);
    expect(viaIdb.result.vocabulary).toEqual(present.result.vocabulary);
    expect(viaIdb.result.enrolments).toEqual(present.result.enrolments);
    expect(viaIdb.result.documents).toEqual(present.result.documents);
    expect(viaIdb.result.log).toEqual(present.result.log);
    expect(viaIdb.result.inspect).toEqual(present.result.inspect);
    // nothing ignored: seq and recordedAt are compared too (neither mode renumbers before a reload)
    expect(viaIdb.result.events).toEqual(present.result.events);
  });
});

describe('IndexedDB mode: persistence', () => {
  it('a reopened repository holds everything, keeps its learner and device, and answers knowledge without a rebuild', async () => {
    const idb = new IDBFactory();
    const first = await script((c) => openIdb(idb, c, { deviceId: 'dev-A' }));
    const before = await first.repo.identity();
    await first.repo.close();
    const again = await openIdb(idb, clock('2026-10-09T09:00:00.000Z'), { deviceId: 'dev-A' });
    expect(await again.identity()).toEqual(before);

    const touched: Array<{ store: string; fn: string }> = [];
    for (const fn of ['put', 'delete', 'clear', 'getAll', 'openCursor']) {
      const orig = (IDBObjectStore.prototype as unknown as Record<string, (...a: unknown[]) => unknown>)[fn]!;
      vi.spyOn(IDBObjectStore.prototype as never, fn as never).mockImplementation(function (this: { name: string }, ...a: unknown[]) {
        touched.push({ store: this.name, fn });
        return orig.apply(this, a);
      } as never);
    }
    const k = ok<{ knowledge: unknown[] }>(await again.api.knowledge()).knowledge;
    expect(k).toEqual(first.raw.knowledge);
    // no rebuild: the knowledge rows are not cleared or rewritten, and no event is scanned
    expect(touched.filter((t) => t.store === 'knowledge' && ['put', 'delete', 'clear'].includes(t.fn))).toEqual([]);
    expect(touched.filter((t) => t.store === 'events' || t.store === 'eventUnits')).toEqual([]);
    expect(await again.exportEvents()).toEqual(first.raw.events);
    expect((await inspectLocal(again)).uploaded + (await inspectLocal(again)).fromRemote).toBeGreaterThan(0);
  });

  it('a rebuild is available and agrees with what was stored', async () => {
    const idb = new IDBFactory();
    const s = await script((c) => openIdb(idb, c, { deviceId: 'dev-A' }));
    await s.repo.rebuild();
    expect(ok<{ knowledge: unknown[] }>(await s.repo.api.knowledge()).knowledge).toEqual(s.raw.knowledge);
  });
});

describe('IndexedDB mode: opening reads nothing', () => {
  it('with 3,000 events stored, opening issues no read of the events, eventUnits or knowledge stores', async () => {
    const idb = new IDBFactory();
    const c = clock();
    const a = await openIdb(idb, c, { deviceId: 'dev-A' });
    const id = await a.identity();
    const e = ok<{ enrolment: { enrolmentId: string } }>(await a.api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] }));
    const who: Who = { learnerId: id.learnerId, deviceId: id.deviceId, enrolmentId: e.enrolment.enrolmentId };
    for (let i = 0; i < 6; i++) {
      const batch: GoEvent[] = [];
      for (let j = 0; j < 500; j++) { c.tick(1000); batch.push(lookup(who, `w${(i * 500 + j) % 60}`, c)); }
      ok(await a.api.appendEvents(batch));
    }
    await a.close();

    const calls: Array<{ store: string; fn: string }> = [];
    for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      for (const fn of ['getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'get', 'count']) {
        const orig = (proto as unknown as Record<string, (...a: unknown[]) => unknown>)[fn]!;
        vi.spyOn(proto as never, fn as never).mockImplementation(function (this: { name: string }, ...args: unknown[]) {
          calls.push({ store: this.name, fn });
          return orig.apply(this, args);
        } as never);
      }
    }
    const started: string[] = [];
    const real = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      started.push(String(args[0]));
      return real.apply(this, args);
    });
    const b = await openIdb(idb, c, { deviceId: 'dev-A' });
    // the meta row by key, in the key-value database, and nothing else
    expect(calls).toEqual([{ store: 'kv', fn: 'get' }]);
    expect(started.filter((s) => /events|eventUnits|knowledge/.test(s))).toEqual([]);
    expect((await b.identity()).learnerId).toBe(id.learnerId);
    await b.close();
  });
});

describe('IndexedDB mode: identity rows stay in memory', () => {
  it('no token hash, session, account or learner row is in either database after use', async () => {
    const idb = new IDBFactory();
    const s = await script((c) => openIdb(idb, c, { deviceId: 'dev-A' }));
    const token = s.repo.api.token!;
    const stores = await dump(idb, NAME);
    const kv = await dump(idb, `${NAME}-kv`);
    const text = JSON.stringify({ stores, kv });
    expect(text).not.toContain('tokenHash');
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain(token);
    for (const n of ['sessions', 'accounts', 'learners', 'devices', 'accountTokens', 'securityEvents', 'teams', 'members']) expect(stores[n]).toEqual([]);
    expect(stores.events!.length).toBeGreaterThan(0);
    expect(Object.keys(await dump(idb, `${NAME}-kv`))).toEqual(['kv']);
  });
});

describe('IndexedDB mode: clear', () => {
  it('leaves no learner rows, makes a new learner, keeps the device, and the api the host holds keeps working', async () => {
    const idb = new IDBFactory();
    const s = await script((c) => openIdb(idb, c, { deviceId: 'dev-A' }));
    const before = await s.repo.identity();
    const api = s.repo.api;
    await s.repo.clear();
    const stores = await dump(idb, NAME); // before anything reads the new learner (a read writes its cursor)
    const kvRows = await dump(idb, `${NAME}-kv`);
    const after = await s.repo.identity();
    expect(after.learnerId).not.toBe(before.learnerId);
    expect(after.deviceId).toBe(before.deviceId);
    expect(s.repo.api).toBe(api);
    expect(await s.repo.exportEvents()).toEqual([]);
    expect(ok<{ knowledge: unknown[] }>(await api.knowledge()).knowledge).toEqual([]);
    expect(ok<{ enrolments: unknown[] }>(await api.listEnrolments()).enrolments).toEqual([]);
    for (const [n, rows] of Object.entries(stores)) expect(rows, n).toEqual([]);
    expect(JSON.stringify(stores)).not.toContain(before.learnerId);
    // the only small row is the new identity (written at once in this mode), never the old learner's
    expect(JSON.stringify(kvRows)).not.toContain(before.learnerId);
    expect(kvRows.kv).toHaveLength(1);
    // usable again
    const again = ok<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] }));
    const c = clock('2026-10-09T08:00:00.000Z');
    ok(await api.appendEvents([lookup({ learnerId: after.learnerId, deviceId: after.deviceId, enrolmentId: again.enrolment.enrolmentId }, 'libër', c)]));
    expect((await s.repo.exportEvents()).length).toBe(2);
    void CONTRACT_VERSION;
  });
});

describe('IndexedDB mode: request budget does not grow with the learner\'s knowledge', () => {
  it('after 300 words are recorded one at a time, one more event costs at most 60 requests and 60 rows; knowledge of 60 ids at most 140 requests', async () => {
    const idb = new IDBFactory();
    const c = clock();
    const repo = await openIdb(idb, c, { deviceId: 'dev-A' });
    const id = await repo.identity();
    const e = ok<{ enrolment: { enrolmentId: string } }>(await repo.api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] }));
    const who: Who = { learnerId: id.learnerId, deviceId: id.deviceId, enrolmentId: e.enrolment.enrolmentId };
    for (let i = 0; i < 300; i++) { c.tick(1000); ok(await repo.api.appendEvents([lookup(who, `w${i}`, c)])); }

    const counts: Record<string, number> = {};
    let rows = 0;
    for (const [owner, proto] of [['store', IDBObjectStore.prototype], ['index', IDBIndex.prototype]] as const) {
      for (const fn of ['get', 'getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count', 'put', 'add', 'delete']) {
        const orig = (proto as unknown as Record<string, (...a: unknown[]) => unknown>)[fn];
        if (typeof orig !== 'function') continue;
        vi.spyOn(proto as never, fn as never).mockImplementation(function (this: unknown, ...args: unknown[]) {
          counts[`${owner}.${fn}`] = (counts[`${owner}.${fn}`] ?? 0) + 1;
          const request = orig.apply(this, args) as { addEventListener?: (t: string, f: () => void) => void; result?: unknown };
          if (fn === 'getAll' || fn === 'getAllKeys') request.addEventListener?.('success', () => { rows += Array.isArray(request.result) ? request.result.length : 0; });
          return request;
        } as never);
      }
    }
    const total = () => Object.values(counts).reduce((a, b) => a + b, 0);
    const top = () => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);

    c.tick(1000);
    ok(await repo.api.appendEvents([lookup(who, 'w17', c)]));
    const append = { requests: total(), rows, top: top() };
    for (const k of Object.keys(counts)) delete counts[k];
    rows = 0;
    ok(await repo.api.knowledge(Array.from({ length: 60 }, (_, i) => `lemma:sq:w${i}:NOUN`)));
    const read = { requests: total(), top: top() };
    await repo.close();

    expect(append.requests, JSON.stringify(append)).toBeLessThanOrEqual(60);
    expect(append.rows, JSON.stringify(append)).toBeLessThanOrEqual(60);
    expect(read.requests, JSON.stringify(read)).toBeLessThanOrEqual(140);
  }, 120000);
});
