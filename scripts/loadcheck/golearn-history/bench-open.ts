// Throw-away: how long the device Repository takes to open with N events (the cold-worker cost), split into its parts.
//   npx vite-node scripts/loadcheck/golearn-history/bench-open.ts <N> [--idb]
// --idb: the repository over IndexedDB (fake-indexeddb: in-memory JavaScript, so the numbers show shape, not browser speed).
import { openLocalRepository } from '../../../packages/repository-local/src';
import { createMemoryArea } from '../../../packages/repository-sync/src';
import { parseSelection } from '../../../packages/golearn-extension/src/parser/index';
import { buildSelectionEvent, PENDING_IDENTITY } from '../../../packages/golearn-extension/src/store/index';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const IDB = process.argv.includes('--idb') || process.env.BENCH_IDB === '1';
const N = Number(process.env.BENCH_N ?? process.argv.find((a, i) => i > 1 && /^[0-9]+$/.test(a)) ?? 12000);
const area = createMemoryArea();
const factory = new IDBFactory();
const openOpts = { area, keyPrefix: 'golearn:local:', deviceId: 'bench', ...(IDB ? { idb: { indexedDB: factory, name: 'bench', keyRange: IDBKeyRange } } : {}) };
const repo = await openLocalRepository(openOpts);
const id = await repo.identity();
const en = await repo.api.enrol({ learnerId: id.learnerId, languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] } as never);
if (!en.ok) throw new Error('enrol');
const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
const words = freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)).slice(0, 750);
const day0 = Date.parse('2026-09-01T08:00:00Z');
const events = [];
for (let i = 0; i < N; i++) {
  const word = words[i % words.length];
  const sentence = `Sot ne lexojmë ${word} bashkë në shtëpi.`;
  const at = sentence.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
  events.push(buildSelectionEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY, learnerId: id.learnerId, enrolmentId: en.data.enrolment.enrolmentId, deviceId: 'bench' } as never, version: '0.1.0', sessionId: `s${Math.floor(i / 40)}`, now: new Date(day0 + i * 4 * 60_000) }));
}
let t = Date.now();
for (let i = 0; i < events.length; i += 500) { const r = await repo.api.appendEvents(events.slice(i, i + 500)); if (!r.ok) throw new Error('append ' + r.status); }
console.log(`appended ${N} in ${Date.now() - t} ms`);
// a cold open, as after the worker slept: everything is read back and folded
t = Date.now();
if (IDB) await repo.close();
const again = await openLocalRepository(openOpts);
const openMs = Date.now() - t;
t = Date.now();
const k = await again.api.knowledge([`lemma:sq:${words[0]}`]);
const firstKnowledgeMs = Date.now() - t;
// the fold alone (what a stored projection would save): the open's cost is the read plus this
t = Date.now();
await again.rebuild();
const unit60 = words.slice(0, 60).map((w) => `lemma:sq:${w}`);
t = Date.now();
const k60 = await again.api.knowledge(unit60);
const knowledge60Ms = Date.now() - t;
t = Date.now();
await again.api.knowledge(unit60);
const knowledge60WarmMs = Date.now() - t;
const rebuildMs = Date.now() - t;
t = Date.now();
const kvArea = IDB ? { get: async () => ({}), list: async () => [] as string[] } : area;
const rows = await kvArea.get(await kvArea.list('golearn:local:')) as Record<string, unknown>;
const readMs = Date.now() - t;
console.log(JSON.stringify({ events: N, coldOpenMs: openMs, rebuildMs, loadMs: openMs - rebuildMs, areaReadMs: readMs, rows: Object.keys(rows).length, firstKnowledgeMs, knowledge60Ms, knowledge60WarmMs, mode: IDB ? 'idb' : 'memory', ok: k.ok && k60.ok }));
