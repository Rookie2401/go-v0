// Throw-away: how the Repository service's read and write routes scale with a learner's history, over a real SQLite store in a temp file.
//   npx vite-node scripts/loadcheck/service/bench-service.ts <events>      (default 12000)
// The service is built IN PROCESS exactly as main.ts does for SQLite (openSqliteStore + projection engine + Albanian linguistics + node crypto), minus the
// rate limiter (deps.limiter absent = no limiting) and minus node:http: requests go to `handle()` through the typed client. Product code is not touched.
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

// ── statement counting: patch node:sqlite's StatementSync prototype (the store prepares through it) ──
let stmts = 0;
const proto = Object.getPrototypeOf(new DatabaseSync(':memory:').prepare('select 1')) as StatementSync;
for (const m of ['run', 'all', 'get', 'iterate'] as const) {
  const orig = (proto as unknown as Record<string, (...a: unknown[]) => unknown>)[m];
  (proto as unknown as Record<string, unknown>)[m] = function (this: unknown, ...a: unknown[]) { stmts++; return orig.apply(this, a); };
}

// ── the service ──
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-service-'));
const dbFile = path.join(tmpDir, 'repository.sqlite');
const now = (): string => new Date().toISOString();
const store = openSqliteStore(dbFile, { now });
const engine = createProjectionEngine({ store, now });
const linguistics = adaptLinguistics(createLinguisticService(store, { now }));
const deps: ServiceDeps = { store, engine, linguistics, crypto: nodeCrypto, now, log: () => {} };
const anon = createInProcessApi(deps);
const email = 'bench@example.test', password = 'correct horse battery staple', deviceId = 'bench-device';
const must = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>, what: string): T => { if (!r.ok) throw new Error(`${what}: ${r.status} ${String(r.error)} ${String(r.message)}`); return r.data as T; };
must(await anon.createAccount({ email, password, displayName: 'bench' }), 'createAccount');
const sess = must<{ token: string; learnerId: string }>(await anon.createSession({ email, password, deviceId, platform: 'bench' }), 'createSession');
const api = createInProcessApi(deps, sess.token);
const pack = albanianPack();
const enrolment = must<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] }), 'enrol').enrolment;
const learnerId = sess.learnerId;
const enrolmentId = enrolment.enrolmentId;

// ── seeding (as bench-open.ts builds its lookups) ──
const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
const words = freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)).slice(0, 750);
const t0 = Date.now(); void t0;
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
const T = (): number => performance.now();
const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const r1 = (x: number): number => Math.round(x * 10) / 10;

let seedStart = T(), lastBatchMs = 0, lastBatchStmts = 0;
for (let i = 0; i < lookups.length; i += 200) {
  const s0 = stmts, b0 = T();
  const r = await api.appendEvents(lookups.slice(i, i + 200) as never);
  lastBatchMs = T() - b0; lastBatchStmts = stmts - s0;
  if (!r.ok) throw new Error(`append lookups ${r.status} ${r.message}`);
}
const lookupSeedMs = T() - seedStart;

// 200 cards with 4 reviews each (adapted from goreview/seed-reviews.ts, units picked from the learner's own candidates)
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
    cardEvents.push({ id: `bench-rev-${u}-${r}`, v: CONTRACT_VERSION, learnerId, enrolmentId, languageId: 'sq', at: new Date(added + (r + 1) * (2 + r * 3) * day + u * 60_000).toISOString(),
      producer: { app: 'gopractice-review', version: '0.1.0', deviceId }, kind: 'CardReviewed', subject: { itemIds: [unitId], cardId: itemIdFor(unitId, FAMILY_DIMENSION[family]) },
      payload: { cardKind: 'recognition', grade: rating >= 3 ? 'good' : 'again', correct: rating >= 3, hinted: false, rating, outcome: rating >= 3 ? 'correct' : 'incorrect', family },
      evidence: { quality: 'moderate', assisted: false } });
  }
});
for (let i = 0; i < cardEvents.length; i += 200) { const r = await api.appendEvents(cardEvents.slice(i, i + 200) as never); if (!r.ok) throw new Error('cards ' + JSON.stringify(r.body).slice(0, 600)); }
const seedMs = T() - seedStart;

// five private documents (for the question whether later pull pages carry them)
for (let d = 0; d < 5; d++) must(await api.putDocument(`bench-doc-${d}`, { languageId: 'sq', kind: 'note', title: `note ${d}`, body: 'x'.repeat(2000) }, 0), 'putDocument');

// ── profile: per distinct SQL text, one unsorted page and one sorted page (the statements are wrapped at the prototype, so every store call is seen) ──
type Prof = { calls: number; ms: number; rows: number };
let current: Map<string, Prof> | null = null;
const rec = (sql: string, ms: number, rows: number): void => { if (!current) return; const k = sql.replace(/\s+/g, ' ').trim(); const p = current.get(k) ?? { calls: 0, ms: 0, rows: 0 }; p.calls++; p.ms += ms; p.rows += rows; current.set(k, p); };
const sqlOf = (s: StatementSync): string => (s as unknown as { sourceSQL: string }).sourceSQL;
const px = proto as unknown as Record<string, (...a: unknown[]) => unknown>;
for (const m of ['all', 'get', 'run'] as const) {
  const o = px[m];
  px[m] = function (this: StatementSync, ...a: unknown[]) { const t = performance.now(); const r = o.apply(this, a); rec(sqlOf(this), performance.now() - t, Array.isArray(r) ? r.length : r ? 1 : 0); return r; };
}
const plans = new Map<string, string[]>();
const dbx = new DatabaseSync(dbFile, { readOnly: true });
async function profile(label: string, q: Record<string, unknown>): Promise<void> {
  const c = createInProcessApi(deps, sess.token);
  current = new Map();
  const t = performance.now();
  const r = await c.vocabulary(q as never);
  const total = performance.now() - t;
  const snap = current; current = null;
  if (!r.ok) throw new Error('profile failed');
  console.log(`\n=== ${label}: ${r.data.items.length} items, ${total.toFixed(0)} ms total ===`);
  for (const [sql, p] of [...snap.entries()].sort((a, b) => b[1].ms - a[1].ms)) {
    if (!plans.has(sql)) {
      try { const nparams = (sql.match(/\?/g) ?? []).length; plans.set(sql, (dbx.prepare('EXPLAIN QUERY PLAN ' + sql).all(...Array.from({ length: nparams }, () => 'x')) as Array<{ detail: string }>).map((x) => x.detail)); }
      catch (e) { plans.set(sql, ['(plan failed: ' + (e as Error).message + ')']); }
    }
    console.log(`\n[${p.ms.toFixed(1)} ms, ${p.calls} calls, ${p.rows} rows] ${sql.slice(0, 260)}${sql.length > 260 ? '...' : ''}\n   PLAN: ${plans.get(sql)!.join(' | ')}`);
  }
}
await profile('unsorted page', { languageId: 'sq', limit: 100 });
await profile('sorted page (recent)', { languageId: 'sq', limit: 100, sort: 'recent' });
// the 200-event push (for the report only: which statements grow with the log)
{
  const batch = Array.from({ length: 200 }, (_, i) => lookupEvent(Date.now() - 1000 + i));
  current = new Map();
  const t = performance.now();
  const r = await api.appendEvents(batch as never);
  const total = performance.now() - t;
  const snap = current; current = null;
  if (!r.ok) throw new Error('push failed');
  console.log(`\n=== POST /events, 200 events: ${total.toFixed(0)} ms total ===`);
  for (const [sql, p] of [...snap.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)) {
    if (!plans.has(sql)) { try { const n = (sql.match(/\?/g) ?? []).length; plans.set(sql, (dbx.prepare('EXPLAIN QUERY PLAN ' + sql).all(...Array.from({ length: n }, () => 'x')) as Array<{ detail: string }>).map((x) => x.detail)); } catch (e) { plans.set(sql, ['(plan failed: ' + (e as Error).message + ')']); } }
    console.log(`\n[${p.ms.toFixed(1)} ms, ${p.calls} calls, ${p.rows} rows] ${sql.slice(0, 220)}\n   PLAN: ${plans.get(sql)!.join(' | ')}`);
  }
}
dbx.close(); await store.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

void [med, r1, lastBatchMs, lastBatchStmts, lookupSeedMs, seedMs];
