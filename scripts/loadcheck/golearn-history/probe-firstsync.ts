// What the extension's FIRST SYNC costs after a sign-in on a device whose account already holds N events, in IndexedDB mode.
// A fake remote account (the service handler over the test fakes) holds N events; a worker (createBackground over the rig's fake chrome, the device Repository over
// fake-indexeddb) signs in; the debounced sync is fired as the browser would after 2 s; everything is counted: IndexedDB requests, the device's projections
// (writes of the projection cursor), whole-log reads (inspectLocal), the requests the service answered, the worker's storage calls, wall time.
//   npx vite-node scripts/loadcheck/golearn-history/probe-firstsync.ts [events=1000,3000]
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
// @ts-expect-error the test double ships no types for its internal classes
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
// @ts-expect-error the test double ships no types for its internal classes
import FDBIndex from 'fake-indexeddb/lib/FDBIndex';
import * as repositoryLocal from '../../../packages/repository-local/src';
import { clock, lookup } from '../../../test/repository-local/support';
import { createRig, PASSWORD } from '../../../test/extension/rig';

const SIZES = (process.argv[2] ?? '1000,3000').split(',').map(Number);

const counts: Record<string, number> = {};
const spy = (proto: Record<string, unknown>, owner: string, name: string): void => {
  const original = proto[name] as (...a: unknown[]) => unknown;
  if (typeof original !== 'function') return;
  proto[name] = function (this: { name?: string }, ...args: unknown[]) {
    const k = `${owner}.${name}`;
    counts[k] = (counts[k] ?? 0) + 1;
    if (owner === 'store' && name === 'put' && this.name === 'cursors') counts.projections = (counts.projections ?? 0) + 1;
    return original.apply(this, args);
  };
};
for (const n of ['get', 'getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count', 'put', 'add', 'delete']) {
  spy(FDBObjectStore.prototype as unknown as Record<string, unknown>, 'store', n);
  spy(FDBIndex.prototype as unknown as Record<string, unknown>, 'index', n);
}
const idbTotal = (): number => Object.entries(counts).filter(([k]) => k !== 'projections' && k !== 'inspectLocal').reduce((a, [, b]) => a + b, 0);

// whole-log reads: inspectLocal, counted where the module object lets it be wrapped
try {
  const real = repositoryLocal.inspectLocal;
  Object.defineProperty(repositoryLocal, 'inspectLocal', { configurable: true, enumerable: true, value: (...a: Parameters<typeof real>) => { counts.inspectLocal = (counts.inspectLocal ?? 0) + 1; return real(...a); } });
} catch { /* the module object cannot be wrapped: the count stays 0 whatever runs */ }

async function one(total: number) {
  for (const k of Object.keys(counts)) delete counts[k];
  const rig = createRig({ localRepo: { idb: { indexedDB: new IDBFactory(), keyRange: IDBKeyRange } } });
  const acct = await rig.signUp('probe@example.test');
  // the account's history, written by "another device" in batches of 200
  const c = clock();
  const api = rig.h.api();
  const s = await api.createSession({ email: 'probe@example.test', password: PASSWORD, deviceId: 'dev-A' });
  if (!s.ok) throw new Error('seed session');
  const who = { learnerId: acct.learnerId, enrolmentId: acct.enrolmentId, deviceId: 'dev-A' };
  const words = Array.from({ length: 700 }, (_, i) => `fjala${i}`);
  for (let i = 0; i < total; i += 200) {
    const batch = Array.from({ length: Math.min(200, total - i) }, (_, j) => { c.tick(1000); return lookup(who, words[(i + j) % words.length], c); });
    const r = await api.appendEvents(batch);
    if (!r.ok) throw new Error('seed ' + r.status);
  }
  await rig.page({ type: 'golearn:status' }); // the worker has started, its Repository is open
  for (const k of Object.keys(counts)) delete counts[k];
  rig.log.length = 0;
  const storage = { get: 0, set: 0 };
  const local = rig.fake.local as unknown as { get: (...a: unknown[]) => unknown; set: (...a: unknown[]) => unknown };
  const g = local.get.bind(local); const st = local.set.bind(local);
  local.get = (...a: unknown[]) => { storage.get += 1; return g(...a); };
  local.set = (...a: unknown[]) => { storage.set += 1; return st(...a); };

  const t = performance.now();
  const out = await rig.connect('probe@example.test'); // sign-in: the device's history goes up, the account's comes down
  const afterSignIn = { ms: Math.round(performance.now() - t), idb: idbTotal() };
  await rig.fireTimers(); // the extension's own debounced sync round (push, then pull)
  await rig.fireTimers();
  const ms = Math.round(performance.now() - t);
  const device = await rig.page({ type: 'golearn:localRepo', op: 'status' });
  const served = rig.log.reduce<Record<string, number>>((m, l) => { const k = `${l.method} ${l.path}`; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const requests = idbTotal();
  console.log(JSON.stringify({
    accountEvents: total, connected: !!out?.ok, deviceEvents: device.events, fromAccount: device.fromAccount, ms, afterSignIn,
    idbRequests: requests, requestsPerEvent: +(requests / total).toFixed(2), projections: counts.projections ?? 0,
    wholeLogReads_inspectLocal: counts.inspectLocal ?? 0, storageCalls: storage, served,
    top: Object.entries(counts).filter(([k]) => k !== 'projections' && k !== 'inspectLocal').sort((a, b) => b[1] - a[1]).slice(0, 4),
  }));
}

for (const n of SIZES) await one(n);
process.exit(0);
