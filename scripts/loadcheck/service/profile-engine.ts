// Throw-away: what one `candidates` call and one `preferences` call of the projection engine ask of the store, per store method, over a real SQLite file.
//   npx vite-node scripts/loadcheck/service/profile-engine.ts <events>      (default 12000)
// The store is built and seeded exactly as bench-service.ts does (one learner, 749 words, lookups, 200 cards with 4 reviews each); the engine under test gets the
// store through a metering wrapper (calls, rows returned, ms per method) and the time left over is the engine's own work. Product code is not touched.
import { DatabaseSync, StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { openSqliteStore } from '../../../packages/repository-store/src';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { albanianPack, createLinguisticService } from '../../../packages/repository-linguistics/src';
import { createInProcessApi } from '../../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../../packages/repository-service/src/deps';
import { adaptLinguistics } from '../../../packages/repository-service/src/linguistics-adapter';
import { nodeCrypto } from '../../../packages/repository-service/src/crypto-node';
import { parseSelection } from '../../../packages/golearn-extension/src/parser/index';
import { buildSelectionEvent, PENDING_IDENTITY } from '../../../packages/golearn-extension/src/store/index';
import { buildCardAdded, itemIdFor, FAMILY_DIMENSION } from '../../../packages/goreview/src';
import { CONTRACT_VERSION } from '../../../packages/repository-contract/src';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const N = Number(process.argv.find((a, i) => i > 1 && /^[0-9]+$/.test(a)) ?? 12000);

let stmts = 0;
const proto = Object.getPrototypeOf(new DatabaseSync(':memory:').prepare('select 1')) as StatementSync;
for (const m of ['run', 'all', 'get', 'iterate'] as const) {
  const orig = (proto as unknown as Record<string, (...a: unknown[]) => unknown>)[m];
  (proto as unknown as Record<string, unknown>)[m] = function (this: unknown, ...a: unknown[]) { stmts++; return orig.apply(this, a); };
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-engine-'));
const now = (): string => new Date().toISOString();
const store = openSqliteStore(path.join(tmpDir, 'repository.sqlite'), { now });
const seedEngine = createProjectionEngine({ store, now });
const linguistics = adaptLinguistics(createLinguisticService(store, { now }));
const deps: ServiceDeps = { store, engine: seedEngine, linguistics, crypto: nodeCrypto, now, log: () => {} };
const anon = createInProcessApi(deps);
const email = 'profile@example.test', password = 'correct horse battery staple', deviceId = 'profile-device';
const must = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>, what: string): T => { if (!r.ok) throw new Error(`${what}: ${r.status} ${String(r.error)} ${String(r.message)}`); return r.data as T; };
must(await anon.createAccount({ email, password, displayName: 'profile' }), 'createAccount');
const sess = must<{ token: string; learnerId: string }>(await anon.createSession({ email, password, deviceId, platform: 'profile' }), 'createSession');
const api = createInProcessApi(deps, sess.token);
const pack = albanianPack();
const enrolment = must<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] }), 'enrol').enrolment;
const learnerId = sess.learnerId;
const enrolmentId = enrolment.enrolmentId;

const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
const words = freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)).slice(0, 750);
const spacing = 4 * 60_000;
let lookupNo = 0;
const lookupEvent = (atMs: number) => {
  const word = words[lookupNo % words.length];
  const sentence = `Sot ne lexojmë ${word} bashkë në shtëpi.`;
  const at = sentence.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
  const e = buildSelectionEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY, learnerId, enrolmentId, deviceId } as never, version: '0.1.0', sessionId: `s${Math.floor(lookupNo / 40)}`, now: new Date(atMs) });
  lookupNo++;
  return e;
};
const lookups = Array.from({ length: N }, (_, i) => lookupEvent(Date.now() - (N - i) * spacing));
for (let i = 0; i < lookups.length; i += 200) { const r = await api.appendEvents(lookups.slice(i, i + 200) as never); if (!r.ok) throw new Error(`append lookups ${r.status} ${r.message}`); }

const cand = must<{ candidates: Array<{ unitId: string }> }>(await api.candidates(enrolmentId, 200), 'candidates (seed)');
const cardUnits = cand.candidates.map((c) => c.unitId).slice(0, 200);
const family = 'meaning-to-form' as const;
const day = 86_400_000, start = Date.now() - 120 * day;
const cardEvents: unknown[] = [];
cardUnits.forEach((unitId, u) => {
  const added = start + (u % 50) * day * 0.9;
  cardEvents.push(buildCardAdded({ learnerId, enrolmentId, languageId: 'sq', at: new Date(added).toISOString(), deviceId, unitId, unitKind: 'lemma', dimension: FAMILY_DIMENSION[family], family, addedBy: 'intake' } as never));
  for (let r = 0; r < 4; r++) {
    const rating = ((u + r) % 7 === 0 ? 1 : 3) as 1 | 3;
    cardEvents.push({ id: `profile-rev-${u}-${r}`, v: CONTRACT_VERSION, learnerId, enrolmentId, languageId: 'sq', at: new Date(added + (r + 1) * (2 + r * 3) * day + u * 60_000).toISOString(),
      producer: { app: 'gopractice-review', version: '0.1.0', deviceId }, kind: 'CardReviewed', subject: { itemIds: [unitId], cardId: itemIdFor(unitId, FAMILY_DIMENSION[family]) },
      payload: { cardKind: 'recognition', grade: rating >= 3 ? 'good' : 'again', correct: rating >= 3, hinted: false, rating, outcome: rating >= 3 ? 'correct' : 'incorrect', family },
      evidence: { quality: 'moderate', assisted: false } });
  }
});
for (let i = 0; i < cardEvents.length; i += 200) { const r = await api.appendEvents(cardEvents.slice(i, i + 200) as never); if (!r.ok) throw new Error('cards ' + JSON.stringify(r.body).slice(0, 600)); }

// ── the metered engine ──
interface Row { calls: number; rows: number; ms: number }
let table = new Map<string, Row>();
const sizeOf = (out: unknown): number => (Array.isArray(out) ? out.length : out === undefined || out === null ? 0 : 1);
const metered = new Proxy(store, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value !== 'function' || typeof prop !== 'string') return value;
    return async (...args: unknown[]) => {
      const t = performance.now();
      const out = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
      const row = table.get(prop) ?? table.set(prop, { calls: 0, rows: 0, ms: 0 }).get(prop)!;
      row.calls++; row.rows += sizeOf(out); row.ms += performance.now() - t;
      return out;
    };
  },
});
const engine = createProjectionEngine({ store: metered as typeof store, now });
const r1 = (x: number): number => Math.round(x * 10) / 10;
const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const oneEvent = (): Promise<unknown> => api.appendEvents([lookupEvent(Date.now() - 1000)] as never);

async function profile(name: string, run: () => Promise<unknown>, before?: () => Promise<void>) {
  await before?.(); await run(); // warm-up (statement cache, projection current)
  const totals: number[] = []; let last: { rows: Array<[string, Row]>; wall: number; stmts: number } | undefined;
  for (let i = 0; i < 5; i++) {
    await before?.();
    table = new Map(); const s0 = stmts, t = performance.now();
    await run();
    const wall = performance.now() - t; totals.push(wall);
    last = { rows: [...table.entries()].sort((a, b) => b[1].ms - a[1].ms), wall, stmts: stmts - s0 };
  }
  const l = last!;
  const storeMs = l.rows.reduce((s, [, r]) => s + r.ms, 0);
  const eventRows = l.rows.filter(([k]) => k === 'list' || k === 'listEventsOfUnits').reduce((s, [, r]) => s + r.rows, 0);
  const calls = l.rows.reduce((s, [, r]) => s + r.calls, 0);
  console.log(`\n${name}  (events=${N}; median wall ${r1(med(totals))} ms over 5; last run: ${r1(l.wall)} ms, ${l.stmts} SQL statements, ${calls} store calls, ${eventRows} event rows read)`);
  console.log('  method'.padEnd(26) + 'calls'.padStart(7) + 'rows'.padStart(9) + 'ms'.padStart(9));
  for (const [k, r] of l.rows) console.log(('  ' + k).padEnd(26) + String(r.calls).padStart(7) + String(r.rows).padStart(9) + String(r1(r.ms)).padStart(9));
  console.log(`  store ${r1(storeMs)} ms, engine outside the store ${r1(l.wall - storeMs)} ms`);
  return { name, events: N, medianMs: r1(med(totals)), lastMs: r1(l.wall), stmts: l.stmts, calls, eventRows, storeMs: r1(storeMs), engineMs: r1(l.wall - storeMs), methods: Object.fromEntries(l.rows.map(([k, r]) => [k, { calls: r.calls, rows: r.rows, ms: r1(r.ms) }])) };
}

const out = [
  await profile('candidates after one appended event', () => engine.candidates(learnerId, enrolmentId, { limit: Number.MAX_SAFE_INTEGER, now: now(), objectiveDimensions: [] }), async () => { await oneEvent(); }),
  await profile('preferences', () => engine.preferences(learnerId, 'sq')),
];
console.log('\n' + JSON.stringify(out));
await store.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
