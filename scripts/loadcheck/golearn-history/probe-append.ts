// How the cost of recording grows with history, in IndexedDB mode: per batch, the wall time AND the number of IndexedDB requests.
// A request count that grows with history is real work that grows (it would grow in a browser too); a constant count with growing
// time is the in-memory test double being slow.
//   npx vite-node scripts/loadcheck/golearn-history/probe-append.ts <total> <batch>
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
// @ts-expect-error the test double ships no types for its internal classes
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
// @ts-expect-error the test double ships no types for its internal classes
import FDBIndex from 'fake-indexeddb/lib/FDBIndex';
import { openLocalRepository } from '../../../packages/repository-local/src';
import { createMemoryArea } from '../../../packages/repository-sync/src';
import { parseSelection } from '../../../packages/golearn-extension/src/parser/index';
import { buildSelectionEvent, PENDING_IDENTITY } from '../../../packages/golearn-extension/src/store/index';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const TOTAL = Number(process.argv[2] ?? 3000);
const BATCH = Number(process.argv[3] ?? 1);

const counts: Record<string, number> = {};
let rowsRead = 0;
const spy = (proto: Record<string, unknown>, owner: string, name: string): void => {
  const original = proto[name] as (...a: unknown[]) => unknown;
  if (typeof original !== 'function') return;
  proto[name] = function (this: unknown, ...args: unknown[]) {
    counts[`${owner}.${name}`] = (counts[`${owner}.${name}`] ?? 0) + 1;
    const request = original.apply(this, args) as { addEventListener?: (t: string, f: () => void) => void; result?: unknown };
    if (name === 'getAll' || name === 'getAllKeys') request.addEventListener?.('success', () => { rowsRead += Array.isArray(request.result) ? request.result.length : 0; });
    return request;
  };
};
for (const n of ['get', 'getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count', 'put', 'add', 'delete']) {
  spy(FDBObjectStore.prototype as unknown as Record<string, unknown>, 'store', n);
  spy(FDBIndex.prototype as unknown as Record<string, unknown>, 'index', n);
}

const repo = await openLocalRepository({ area: createMemoryArea(), keyPrefix: 'golearn:local:', deviceId: 'probe', idb: { indexedDB: new IDBFactory(), name: 'probe', keyRange: IDBKeyRange } });
const id = await repo.identity();
const en = await repo.api.enrol({ learnerId: id.learnerId, languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] } as never);
if (!en.ok) throw new Error('enrol');
const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
const words = freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)).slice(0, 750);
const day0 = Date.parse('2026-09-01T08:00:00Z');
const make = (i: number) => {
  const word = words[i % words.length];
  const sentence = `Sot ne lexojmë ${word} bashkë në shtëpi.`;
  const at = sentence.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
  return buildSelectionEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY, learnerId: id.learnerId, enrolmentId: en.data.enrolment.enrolmentId, deviceId: 'probe' } as never, version: '0.1.0', sessionId: `s${Math.floor(i / 40)}`, now: new Date(day0 + i * 240_000) } as never);
};

const report = (label: string, ms: number, events: number): void => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(JSON.stringify({ at: label, events, ms: Math.round(ms), requests: total, perEvent: +(total / events).toFixed(1), rowsRead, top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4) }));
  for (const k of Object.keys(counts)) delete counts[k];
  rowsRead = 0;
};

// a window of WINDOW events is measured at each checkpoint; everything between checkpoints is appended in the same batch size
const WINDOW = Math.max(BATCH, 100);
const checkpoints = [0, Math.floor(TOTAL / 4), Math.floor(TOTAL / 2), Math.floor((3 * TOTAL) / 4), TOTAL - WINDOW].filter((v, i, a) => a.indexOf(v) === i);
let i = 0;
for (const start of checkpoints) {
  while (i < start) { const batch = []; for (let j = 0; j < BATCH && i < start; j++, i++) batch.push(make(i)); const r = await repo.api.appendEvents(batch as never); if (!r.ok) throw new Error('append ' + r.status); }
  for (const k of Object.keys(counts)) delete counts[k];
  rowsRead = 0;
  const t = performance.now();
  let done = 0;
  while (done < WINDOW && i < TOTAL) { const batch = []; for (let j = 0; j < BATCH && done < WINDOW && i < TOTAL; j++, i++, done++) batch.push(make(i)); const r = await repo.api.appendEvents(batch as never); if (!r.ok) throw new Error('append ' + r.status); }
  report(`history ${start}`, performance.now() - t, done);
}
// a read, as a page asks it
const t = performance.now();
const k = await repo.api.knowledge(words.slice(0, 60).map((w) => `lemma:sq:${w}`));
report('knowledge(60)', performance.now() - t, 1);
if (!k.ok) throw new Error('knowledge');
