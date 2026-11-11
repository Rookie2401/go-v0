// What a device's first pull costs, in IndexedDB mode: IndexedDB requests and wall time for `pullFrom(remote)` of N events in pages of 1,000.
// The remote is a real in-process service over a memory store (test/repository-local/support.ts); the device is the device Repository over fake-indexeddb.
//   npx vite-node scripts/loadcheck/golearn-history/probe-pull.ts [events=3000]
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
// @ts-expect-error the test double ships no types for its internal classes
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
// @ts-expect-error the test double ships no types for its internal classes
import FDBIndex from 'fake-indexeddb/lib/FDBIndex';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLocalRepository } from '../../../packages/repository-local/src';
import { createMemoryArea } from '../../../packages/repository-sync/src';
import { clock, createRemote, lookup } from '../../../test/repository-local/support';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TOTAL = Number(process.argv[2] ?? 3000);

const counts: Record<string, number> = {};
const spy = (proto: Record<string, unknown>, owner: string, name: string): void => {
  const original = proto[name] as (...a: unknown[]) => unknown;
  if (typeof original !== 'function') return;
  proto[name] = function (this: unknown, ...args: unknown[]) { counts[`${owner}.${name}`] = (counts[`${owner}.${name}`] ?? 0) + 1; return original.apply(this, args); };
};
for (const n of ['get', 'getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count', 'put', 'add', 'delete']) {
  spy(FDBObjectStore.prototype as unknown as Record<string, unknown>, 'store', n);
  spy(FDBIndex.prototype as unknown as Record<string, unknown>, 'index', n);
}

const c = clock();
const remote = createRemote(c);
const acct = await remote.signUp('probe@example.test', 'dev-A', ['sq']);
const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
const words = freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)).slice(0, 750);
const who = { learnerId: acct.learnerId, enrolmentId: acct.enrolmentId, deviceId: 'dev-A' };
for (let i = 0; i < TOTAL; i += 200) {
  const batch = Array.from({ length: Math.min(200, TOTAL - i) }, (_, j) => { c.tick(1000); return lookup(who, words[(i + j) % words.length], c); });
  const r = await acct.api.appendEvents(batch);
  if (!r.ok) throw new Error('seed ' + r.status);
}

const repo = await openLocalRepository({ area: createMemoryArea(), keyPrefix: 'golearn:local:', deviceId: 'dev-B', now: c.now, idb: { indexedDB: new IDBFactory(), name: 'probe-pull', keyRange: IDBKeyRange } });
for (const k of Object.keys(counts)) delete counts[k];
const total = (): number => Object.values(counts).reduce((a, b) => a + b, 0);
const atPage: number[] = [];
const listEvents = acct.api.listEvents.bind(acct.api);
acct.api.listEvents = ((...a: Parameters<typeof listEvents>) => { atPage.push(total()); return listEvents(...a); }) as typeof listEvents;
const t = performance.now();
const r = await repo.pullFrom(acct.api);
const afterLastPage = total() - atPage[atPage.length - 1]; // the last page's appends plus the one projection and registration
const ms = performance.now() - t;
const requests = total();
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
const k = await repo.api.knowledge();
console.log(JSON.stringify({ pulledEvents: TOTAL, added: r.added, ms: Math.round(ms), idbRequests: requests, requestsBeforeEachPage: atPage, requestsFromLastPageStart: afterLastPage, top, knowledgeRows: k.ok ? k.data.knowledge.length : -1, knowledgeDigest: k.ok ? JSON.stringify(k.data.knowledge).length : -1 }));
