// @vitest-environment node
/**
 * A device's pull from its account (IndexedDB mode): one append per page (not per event), one projection after the last page, and a pull that stops
 * part-way leaves knowledge correct, because every read folds the events newer than the projection cursor.
 */
import { IDBDatabase, IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLocalRepository } from '../../packages/repository-local/src';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import { clock, createRemote, lookup, newArea } from './support';

afterEach(() => { vi.restoreAllMocks(); });

const WORDS = Array.from({ length: 40 }, (_, i) => `fjala${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);

async function seeded(events: number) {
  const c = clock();
  const remote = createRemote(c);
  const acct = await remote.signUp('pull@example.test', 'dev-A', ['sq']);
  const who = { learnerId: acct.learnerId, enrolmentId: acct.enrolmentId, deviceId: 'dev-A' };
  for (let i = 0; i < events; i += 200) {
    const batch = Array.from({ length: Math.min(200, events - i) }, (_, j) => { c.tick(1000); return lookup(who, WORDS[(i + j) % WORDS.length], c); });
    const r = await acct.api.appendEvents(batch);
    if (!r.ok) throw new Error('seed ' + r.status);
  }
  return { c, acct };
}
const device = (c: ReturnType<typeof clock>, name: string) => openLocalRepository({ area: newArea(), now: c.now, deviceId: name, idb: { indexedDB: new IDBFactory(), name, keyRange: IDBKeyRange } });
/** The knowledge rows without the learner id (two devices have different ones). */
const rows = async (repo: Awaited<ReturnType<typeof device>>) => {
  const r = await repo.api.knowledge();
  if (!r.ok) throw new Error('knowledge ' + r.status);
  return JSON.stringify(r.data.knowledge.map((k) => { const { learnerId: _l, ...rest } = k as unknown as Record<string, unknown>; void _l; return rest; }));
};

describe('pullFrom', () => {
  it('appends a page in one transaction and projects knowledge for every pulled event', async () => {
    // 250 events in pages of 100: three pages, as 2,500 in pages of 1,000 would be, in a fraction of the time (the full suite runs many files at once)
    const { c, acct } = await seeded(250);
    const repo = await device(c, 'dev-B');
    let transactions = 0;
    const original = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...a: Parameters<typeof original>) { if (a[1] === 'readwrite') transactions++; return original.apply(this, a); });
    const r = await repo.pullFrom(acct.api, { pageSize: 100 });
    expect(r.added).toBe(250);
    // before the change: at least one read-write transaction per pulled event (250 and more). Now a few per page, plus the projection's.
    expect(transactions).toBeLessThan(200);
    const k = await repo.api.knowledge();
    expect(k.ok && k.data.knowledge.length).toBeGreaterThan(WORDS.length); // lemmas and forms
    const total = (await repo.exportEvents()).filter((e) => e.kind === 'SelectionLookedUp').length;
    expect(total).toBe(250);
  });

  it('a pull that stops after page 2 leaves knowledge equal to a completed pull of those two pages', async () => {
    const { c, acct } = await seeded(250);
    const stopped = await device(c, 'dev-B');
    const reference = await device(c, 'dev-C');
    // the reference device's account holds only the first two pages (200 events) and its pull completes
    const firstTwo: RepositoryApi = { ...acct.api, listEvents: async (q) => {
      const r = await acct.api.listEvents(q);
      return r.ok ? { ...r, data: { ...r.data, events: r.data.events.filter((e) => e.seq <= 200), head: Math.min(r.data.head, 200) } } : r;
    } } as RepositoryApi;
    // the interrupted device: the third request never answers (the tab was closed), so no projection ran after the pages it did append
    let calls = 0;
    const hanging: RepositoryApi = { ...acct.api, listEvents: (q: Parameters<RepositoryApi['listEvents']>[0]) => (++calls >= 3 ? new Promise(() => {}) : acct.api.listEvents(q)) } as RepositoryApi;
    void stopped.pullFrom(hanging, { pageSize: 100 });
    for (let i = 0; i < 200 && calls < 3; i++) await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(3);
    await reference.pullFrom(firstTwo, { pageSize: 100 });
    const after = await rows(stopped);
    const ref = await rows(reference);
    expect(after).toBe(ref);
    expect(JSON.parse(after).length).toBeGreaterThan(0);
    // and the pull cursor was kept per page: nothing was lost for the device to resume from
    expect((await stopped.exportEvents()).length).toBe((await reference.exportEvents()).length);
  });
});
