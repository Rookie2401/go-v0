// @vitest-environment node
/**
 * The extension's FIRST SYNC after a sign-in on a device whose account already holds a history (docs/ecosystem/LOADING-ARCHITECTURE-2026-11-10.md).
 *
 * The path, as traced (2026-11-11): sign-in -> session.onConnect (core.ts) -> `local.afterSignIn()` -> `uploadAndPull()` (localRepo.ts) -> the device Repository's
 * `uploadTo` then `pullFrom` (repository-local transfer.ts: one append per page, markers and cursor per page, ONE projection after the last page). The sync client's own
 * pull (sync.ts) hands pulled events to a log that discards them: it only moves its cursor.
 *
 *  (a) the result on the device after a completed first sync is IDENTICAL to the one recorded from the code before this change (golden, from a full dump of the
 *      device's two IndexedDB databases and of the worker's storage, ids made comparable);
 *  (b) the cost per pulled event does not grow with the history, and the projection runs a small constant number of times;
 *  (c) a first sync interrupted after its second page RESUMES from its cursor on the worker's next sync, pulls only the rest, and ends equal to a completed one;
 *  (d) the worker is kept alive while a sync runs, and not after.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
// @ts-expect-error the test double ships no types for its internal classes
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
// @ts-expect-error the test double ships no types for its internal classes
import FDBIndex from 'fake-indexeddb/lib/FDBIndex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { createHarness, type Harness } from '../repository/service/fakes';
import { clock, lookup, review, type Who } from '../repository-local/support';
import { createRig, PASSWORD } from '../extension/rig';

type Rig = ReturnType<typeof createRig>;
const GOLDEN = path.join(__dirname, 'golearn.firstsync.golden.json');
const EMAIL = 'first@example.test';
const local = (rig: Rig, request: Record<string, unknown>) => rig.page({ type: MSG.localRepo, ...request });
const newIdb = () => ({ indexedDB: new IDBFactory(), keyRange: IDBKeyRange });
const NOW = '2026-11-11T09:00:00.000Z';

// the date is fixed (the dump is then the same on every run); the keep-alive's interval is the only timer faked besides it
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { vi.useRealTimers(); });

// ───────────── counting IndexedDB requests (what the probe does) ─────────────
const counts: Record<string, number> = {};
const restores: Array<() => void> = [];
function countIdb(): void {
  for (const k of Object.keys(counts)) delete counts[k];
  const spy = (proto: Record<string, unknown>, owner: string, name: string): void => {
    const original = proto[name] as (...a: unknown[]) => unknown;
    if (typeof original !== 'function') return;
    proto[name] = function (this: { name?: string }, ...args: unknown[]) {
      counts[`${owner}.${name}`] = (counts[`${owner}.${name}`] ?? 0) + 1;
      if (owner === 'store' && name === 'put' && this.name === 'cursors') counts.projections = (counts.projections ?? 0) + 1;
      return original.apply(this, args);
    };
    restores.push(() => { proto[name] = original; });
  };
  for (const n of ['get', 'getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count', 'put', 'add', 'delete']) {
    spy(FDBObjectStore.prototype as unknown as Record<string, unknown>, 'store', n);
    spy(FDBIndex.prototype as unknown as Record<string, unknown>, 'index', n);
  }
}
const requests = (): number => Object.entries(counts).filter(([k]) => k !== 'projections').reduce((a, [, b]) => a + b, 0);
afterEach(() => { while (restores.length) restores.pop()!(); });

// ───────────── an account that already holds a history ─────────────
interface Seeded { rig: Rig; h: Harness; ids: string[]; total: number }

/**
 * `total` events behind the account: Albanian lookups over a few hundred words, a learner's marks, a review chain on one card, and (when `twoLanguages`) Greek
 * lookups under a second enrolment. Ids and times are fixed, so two runs write the same account.
 */
async function seedAccount(total: number, o: { twoLanguages?: boolean; marks?: boolean; harness?: Harness; idb?: ReturnType<typeof newIdb>; localRepo?: object } = {}): Promise<Seeded> {
  const h = o.harness ?? createHarness();
  if (!o.harness) h.clock.set(new Date().toISOString()); // the service and the worker agree on the time
  const rig = createRig({ harness: h, localRepo: { idb: o.idb ?? newIdb(), ...(o.localRepo ?? {}) } });
  const acct = await rig.signUp(EMAIL);
  const api = h.api();
  const s = await api.createSession({ email: EMAIL, password: PASSWORD, deviceId: 'dev-A' });
  if (!s.ok) throw new Error('seed session');
  const sq: Who = { learnerId: acct.learnerId, enrolmentId: acct.enrolmentId, deviceId: 'dev-A' };
  let el: Who | undefined;
  if (o.twoLanguages) {
    const e = await api.enrol({ languageId: 'el', packId: 'pack:el', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!e.ok) throw new Error('seed enrol el');
    el = { learnerId: acct.learnerId, enrolmentId: e.data.enrolment.enrolmentId, deviceId: 'dev-A' };
  }
  const c = clock('2026-10-01T08:00:00.000Z');
  const events: GoEvent[] = [];
  const reviews: GoEvent[] = [];
  const nMarks = o.marks ? 6 : 0;
  const nReviews = o.marks ? 8 : 0;
  const nGreek = el ? Math.floor(total / 6) : 0;
  const nSq = total - nMarks - nReviews - nGreek;
  for (let i = 0; i < nSq; i++) { c.tick(1000); events.push(lookup(sq, `fjala${i % 300}`, c, { id: `seed:sq:${i}`, dedupeKey: `seed:sq:${i}` })); }
  for (let i = 0; i < nGreek; i++) { c.tick(1000); events.push({ ...lookup(el!, `lexi${i % 120}`, c, { id: `seed:el:${i}`, dedupeKey: `seed:el:${i}` }), languageId: 'el', subject: { itemIds: [`lemma:el:lexi${i % 120}:NOUN`, `form:el:lexi${i % 120}`] } } as GoEvent); }
  for (let i = 0; i < nMarks; i++) {
    c.tick(1000);
    events.push({ ...lookup(sq, `fjala${i}`, c, { id: `seed:mark:${i}`, dedupeKey: `seed:mark:${i}` }), kind: 'ItemMarked', payload: { mark: i % 2 ? 'familiar' : 'learning' }, subject: { itemIds: [`lemma:sq:fjala${i}:NOUN`] } } as GoEvent);
  }
  for (let i = 0; i < nReviews; i++) {
    c.tick(86_400_000); // a chain of reviews of one card, a day apart
    reviews.push(review(sq, 'lemma:sq:fjala1:NOUN', c, { id: `seed:rev:${i}`, dedupeKey: `seed:rev:${i}`, subject: { itemIds: ['lemma:sq:fjala1:NOUN'], cardId: 'card:chain' }, payload: { cardKind: 'recognition', grade: i % 3 ? 'good' : 'again', correct: i % 3 !== 0, hinted: false } }));
  }
  for (let i = 0; i < events.length; i += 200) {
    const r = await api.appendEvents(events.slice(i, i + 200));
    if (!r.ok) throw new Error(`seed ${r.status} ${JSON.stringify((r as { body?: unknown }).body ?? r).slice(0, 300)}`);
  }
  if (reviews.length) {
    const r = await api.submitReviews(reviews);
    if (!r.ok) throw new Error(`seed reviews ${r.status} ${JSON.stringify((r as { body?: unknown }).body ?? r).slice(0, 300)}`);
  }
  return { rig, h, ids: [acct.learnerId, acct.enrolmentId, ...(el ? [el.enrolmentId] : [])], total: events.length + reviews.length };
}

// ───────────── a dump of everything the device holds ─────────────
const reqP = <T,>(q: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
async function dumpDb(f: IDBFactory, name: string): Promise<Record<string, unknown[]>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const o = f.open(name); o.onsuccess = () => resolve(o.result); o.onerror = () => reject(o.error); });
  try {
    const out: Record<string, unknown[]> = {};
    for (const n of [...db.objectStoreNames]) {
      const st = db.transaction(n).objectStore(n);
      const keys = await reqP(st.getAllKeys());
      const vals = await reqP(st.getAll());
      out[n] = keys.map((k, i) => ({ k, v: vals[i] }));
    }
    return out;
  } finally { db.close(); }
}
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;

/** Everything the device holds after a first sync, with the ids that differ between runs (random uuids) replaced by names. */
async function deviceDump(rig: Rig, idb: { indexedDB: IDBFactory }, remoteIds: string[], withStorage = true): Promise<{ digest: string; shape: Record<string, number>; text: string }> {
  const id = await local(rig, { op: 'identity' });
  const enr = await local(rig, { op: 'enrolments' });
  const names = new Map<string, string>();
  names.set(id.learnerId, 'LOCAL-LEARNER'); names.set(id.deviceId, 'LOCAL-DEVICE');
  for (const e of enr.enrolments) names.set(e.enrolmentId, `LOCAL-ENROLMENT-${e.languageId}`);
  remoteIds.forEach((r, i) => names.set(r, `REMOTE-${i}`));
  const main = await dumpDb(idb.indexedDB, 'golearn-repository');
  const kv = await dumpDb(idb.indexedDB, 'golearn-repository-kv');
  const storage = withStorage ? Object.fromEntries(Object.entries(await rig.fake.local.get(null)).filter(([k]) => /^golearn:(sync|local|repo)/.test(k) && !/session|token|secret/i.test(k) && k !== 'golearn:local-pull-open')) : {}; // (the pull-open row is new: it is gone again after a finished pull)
  let text = JSON.stringify(canon({ main, kv, storage }));
  for (const [raw, name] of names) text = text.split(raw).join(name);
  text = text.replace(/"accountId":"[0-9a-f-]{36}"/g, '"accountId":"LOCAL-ACCOUNT"'); // the device's own random account id
  // rows are keyed by those ids: put them in an order that does not depend on the ids
  const reparsed = JSON.parse(text) as { main: Record<string, unknown[]>; kv: Record<string, unknown[]>; storage: Record<string, unknown> };
  // (every row carries its own seq, so sorting the arrays loses nothing the comparison needs)
  const sortArrays = (v: unknown): unknown => Array.isArray(v) ? v.map(sortArrays).map((x) => JSON.stringify(canon(x))).sort().map((s) => JSON.parse(s)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sortArrays(x)])) : v;
  const sorted = JSON.stringify(canon(sortArrays(reparsed)));
  const shape: Record<string, number> = {};
  for (const [db, rows] of [['main', reparsed.main], ['kv', reparsed.kv]] as const) for (const [k, v] of Object.entries(rows)) shape[`${db}.${k}`] = v.length;
  shape['storage.keys'] = Object.keys(reparsed.storage).length;
  return { digest: createHash('sha256').update(sorted).digest('hex'), shape, text: sorted };
}

/** Sign in and let everything the worker does after it finish: the device's upload and pull, then the extension's own debounced sync. */
async function firstSync(rig: Rig): Promise<void> {
  const out = await rig.connect(EMAIL);
  expect(out).toMatchObject({ ok: true });
  await rig.fireTimers();
  await rig.fireTimers();
}

describe('the first sync after a sign-in on a device whose account has a history', () => {
  it('(a) the device ends with exactly what it ended with before this change: events, knowledge rows, markers, cursor', async () => {
    const idb = newIdb();
    const { rig, ids, total } = await seedAccount(600, { twoLanguages: true, marks: true, idb });
    await firstSync(rig);
    const status = await local(rig, { op: 'status' });
    expect(status).toMatchObject({ available: true, fromAccount: total });
    expect(status.events).toBe(total);
    const k = await local(rig, { op: 'knowledge' });
    expect(k.knowledge.length).toBeGreaterThan(100);
    expect(new Set(k.knowledge.map((x: { languageId: string }) => x.languageId))).toEqual(new Set(['sq', 'el']));
    const dump = await deviceDump(rig, idb, ids);
    if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, dump.text); // to see what differs between two runs
    if (process.env.GOLDEN === 'write') { fs.writeFileSync(GOLDEN, JSON.stringify({ digest: dump.digest, shape: dump.shape }, null, 1)); return; }
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as { digest: string; shape: Record<string, number> };
    expect(dump.shape).toEqual(golden.shape);
    expect(dump.digest).toBe(golden.digest);
  }, 120_000);

  it('(b) the cost per pulled event does not grow with the history, and the projection runs once', async () => {
    const run = async (n: number) => {
      const { rig, total } = await seedAccount(n);
      await rig.page({ type: MSG.status }); // the worker is awake and the Repository is open
      countIdb();
      await firstSync(rig);
      const out = { total, requests: requests(), perEvent: requests() / total, projections: counts.projections ?? 0 };
      while (restores.length) restores.pop()!();
      expect((await local(rig, { op: 'status' })).fromAccount).toBe(total);
      return out;
    };
    const small = await run(500);
    const large = await run(1500);
    // eslint-disable-next-line no-console
    console.log('first sync cost', JSON.stringify({ small, large }));
    expect(large.perEvent).toBeLessThanOrEqual(small.perEvent * 1.25); // constant per event (the fixed part shrinks per event as the history grows)
    expect(small.projections).toBeLessThanOrEqual(2);
    expect(large.projections).toBeLessThanOrEqual(2); // not one per page: 2 pages at 1,500 events, 1 at 500
  }, 120_000);
});

/**
 * A service whose event lists (a page of 100 or more) stop answering from `afterSeq` on, while the gate is closed. `release()` lets the held requests through;
 * `abandon()` opens the gate for later requests but leaves the held ones hanging for ever (the worker that made them was stopped by the browser).
 */
function stallFrom(h: Harness, afterSeq: number) {
  let open!: () => void;
  const opened = new Promise<void>((r) => { open = r; });
  const gate = { closed: true, hit: 0, release: () => { gate.closed = false; open(); }, abandon: () => { gate.closed = false; } };
  const list = h.deps.store.list.bind(h.deps.store);
  h.deps.store.list = (async (f: Parameters<typeof list>[0]) => {
    if (gate.closed && (f.afterSeq ?? 0) >= afterSeq && f.limit !== undefined && f.limit >= 100) {
      gate.hit += 1;
      await opened; // resolved only by release(): after abandon() a request already held here hangs for ever
    }
    return list(f);
  }) as typeof list;
  return gate;
}
const settle = async (ms = 60): Promise<void> => { await new Promise((r) => setTimeout(r, ms)); };

describe('an interrupted first sync', () => {
  it('(c) resumes from its cursor on the next sync of a new worker, pulls only the rest, and ends equal to a completed sync', async () => {
    // the reference: a completed first sync of the same account
    const refIdb = newIdb();
    const ref = await seedAccount(2100, { idb: refIdb });
    await firstSync(ref.rig);
    const refDump = await deviceDump(ref.rig, refIdb, ref.ids, false); // the database rows (the worker's own status row says how many a round pulled: that differs by design)

    // the run that is interrupted: pages of 1,000 events, the service stops answering from the third page
    const idb = newIdb();
    const first = await seedAccount(2100, { idb });
    const gate = stallFrom(first.h, 2000);
    void first.rig.connect(EMAIL);
    for (let i = 0; i < 3000 && gate.hit === 0; i++) await settle(10); // up to 30 s: the whole suite runs many files at once
    expect(gate.hit).toBeGreaterThan(0);
    await settle();
    const half = await local(first.rig, { op: 'status' });
    expect(half.fromAccount).toBe(1999); // two pages (seq 1-2000) are on the device: 1,999 events of the learner's, the account's own enrolment event is the service's
    expect(half.lastUpload).toBeUndefined(); // the upload-and-pull never finished

    // the browser stops the worker; a new one starts over the same storage and the same IndexedDB, and the service answers again
    gate.abandon();
    const second = createRig({ harness: first.h, localRepo: { idb } });
    await second.fake.local.set(await first.rig.fake.local.get(null));
    second.log.length = 0;
    await second.page({ type: MSG.syncNow }); // the worker's next sync round (the alarm, an event, the popup): it finds the pull open and continues it
    // the status op counts the whole device log: asked for a few times a second, not fifty (the polling was most of this test's minute)
    for (let i = 0; i < 240; i++) { await settle(250); if (!(await second.fake.local.get('golearn:local-pull-open'))['golearn:local-pull-open']) break; }
    const done = await local(second, { op: 'status' });
    expect(done.fromAccount).toBe(2100);
    // only the rest was asked for: one page after the cursor (seq 2000), not a page from 0
    const pages = second.log.filter((l) => l.method === 'GET' && l.path === '/events').length;
    expect(pages).toBe(1);
    expect((await second.fake.local.get('golearn:local-pull-open'))['golearn:local-pull-open']).toBeUndefined(); // finished: nothing left to resume
    expect((await deviceDump(second, idb, first.ids, false)).digest).toBe(refDump.digest);
  }, 300_000); // about 30 s alone; the whole suite running beside it has made it several times that
});

describe('the worker is kept alive while a sync runs', () => {
  it('(d) the extension API is touched every 20 s of a long sync, and not after it', async () => {
    const keepAlive = vi.fn();
    const { rig, h } = await seedAccount(1200, { localRepo: { keepAlive } });
    await rig.page({ type: MSG.status });
    keepAlive.mockClear();
    const gate = stallFrom(h, 1000);
    void rig.connect(EMAIL);
    for (let i = 0; i < 3000 && gate.hit === 0; i++) await settle(10); // up to 30 s: the whole suite runs many files at once
    expect(gate.hit).toBeGreaterThan(0); // the service is slow on the second page: a sync of more than 40 s
    await vi.advanceTimersByTimeAsync(19_000);
    expect(keepAlive).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(keepAlive).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(keepAlive).toHaveBeenCalledTimes(3);
    gate.release();
    for (let i = 0; i < 240; i++) { await settle(250); if ((await local(rig, { op: 'status' })).fromAccount === 1200) break; }
    await vi.advanceTimersByTimeAsync(1_000);
    const calls = keepAlive.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(keepAlive).toHaveBeenCalledTimes(calls); // nothing keeps pinging once the sync is done
  }, 300_000);
});
