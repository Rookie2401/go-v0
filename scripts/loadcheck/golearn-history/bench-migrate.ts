// Throw-away: the one-time migration of a device's rows into IndexedDB, timed.
//   npx vite-node scripts/loadcheck/golearn-history/bench-migrate.ts <N>
// Builds N events of old rows with the present path (as bench-open.ts does), runs the migration into fake-indexeddb (in-memory JavaScript: the numbers show
// shape, not browser speed), prints { events, rows, migrateMs, verifyMs, importMs }.
import { inspectLocal, openLocalRepository } from '../../../packages/repository-local/src';
import { createMemoryArea } from '../../../packages/repository-sync/src';
import { parseSelection } from '../../../packages/golearn-extension/src/parser/index';
import { buildSelectionEvent, PENDING_IDENTITY } from '../../../packages/golearn-extension/src/store/index';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const N = Number(process.env.BENCH_N ?? process.argv.find((a, i) => i > 1 && /^[0-9]+$/.test(a)) ?? 3000);
const PREFIX = 'golearn:local:';
const area = createMemoryArea();
const repo = await openLocalRepository({ area, keyPrefix: PREFIX, deviceId: 'bench' });
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
for (let i = 0; i < events.length; i += 500) { const r = await repo.api.appendEvents(events.slice(i, i + 500)); if (!r.ok) throw new Error('append ' + r.status); }
await repo.close();
// a real device has opened the present path since: the rows are at rest
await (await openLocalRepository({ area, keyPrefix: PREFIX, deviceId: 'bench' })).close();
const rows = Object.keys(area.dump()).length;

const t = Date.now();
const migrated = await openLocalRepository({ area, keyPrefix: PREFIX, deviceId: 'bench', idb: { indexedDB: new IDBFactory(), name: 'bench', keyRange: IDBKeyRange }, migrate: { attempt: 1 } });
const migrateMs = Date.now() - t;
const { storage } = await inspectLocal(migrated);
console.log(JSON.stringify({ events: N, rows, migrateMs, verifyMs: storage.migration?.verifyMs, importMs: storage.migration?.importMs, state: storage.migration?.state, ...(storage.migration?.reason ? { reason: storage.migration.reason } : {}) }));
await migrated.close();
