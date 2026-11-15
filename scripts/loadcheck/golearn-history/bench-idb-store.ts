// Throw-away: the IndexedDB store with N events: append in batches of 500, close, re-open, then the three reads the extension makes on a cold open.
//   npx vite-node scripts/loadcheck/golearn-history/bench-idb-store.ts <N>
// fake-indexeddb is an in-memory JavaScript model: the numbers show the SHAPE (open reads nothing, reads are bounded), not browser speed.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { openIndexedDbStore } from '../../../packages/repository-store/src';
import type { GoEvent } from '../../../packages/repository-contract/src';

const N = Number(process.argv[2] ?? 12000);
const L = 'learner-bench';
const idb = new IDBFactory();
const opts = { indexedDB: idb, keyRange: IDBKeyRange, name: 'bench' };
const ms = (t: number): number => Math.round((performance.now() - t) * 10) / 10;

const event = (i: number): GoEvent => ({
  id: `e${i}`, v: 2, learnerId: L, enrolmentId: 'en-1', languageId: 'sq', at: new Date(Date.parse('2026-09-01T08:00:00Z') + i * 240_000).toISOString(),
  producer: { app: 'golearn-ext', version: '0.1.0', deviceId: 'bench' }, kind: 'SelectionLookedUp',
  subject: { itemIds: [`lemma:sq:w${i % 750}:NOUN`], sentenceKey: `s${i}`, sourceRef: { kind: 'demo' } },
  payload: { surface: `w${i % 750}`, tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] },
});

let t = performance.now();
const a = await openIndexedDbStore(opts);
for (let i = 0; i < N; i += 500) await a.append(L, Array.from({ length: Math.min(500, N - i) }, (_, j) => event(i + j)));
const appendMs = ms(t);
await a.putKnowledge(Array.from({ length: 750 }, (_, i) => ({ learnerId: L, unitId: `lemma:sq:w${i}:NOUN`, languageId: 'sq', level: 'seen', encounters: 1 }) as never));
const head = await a.head(L);
await a.close();

t = performance.now();
const b = await openIndexedDbStore(opts);
const reopenMs = ms(t);
const units = Array.from({ length: 60 }, (_, i) => `lemma:sq:w${i}:NOUN`);
t = performance.now();
const k = await b.getKnowledge(L, units);
const knowledgeMs = ms(t);
t = performance.now();
const tail = await b.list({ learnerId: L, afterSeq: head - 100 });
const listMs = ms(t);
t = performance.now();
const ofUnits = await b.listEventsOfUnits!(L, units.slice(0, 5));
const ofUnitsMs = ms(t);
await b.close();
console.log(JSON.stringify({ events: N, head, appendMs, reopenMs, getKnowledge60: { rows: k.length, ms: knowledgeMs }, listLast100: { rows: tail.length, ms: listMs }, listEventsOf5Units: { rows: ofUnits.length, ms: ofUnitsMs } }));
