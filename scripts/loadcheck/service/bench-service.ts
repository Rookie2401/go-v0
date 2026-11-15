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
import { handle } from '../../../packages/repository-service/src/handler';
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

// ── timing ──
type Stat = { medianMs: number; maxMs: number; stmts?: number; extra?: unknown };
const results: Record<string, Stat> = {};
async function timed(name: string, runs: number, fn: (run: number) => Promise<unknown>, before?: (run: number) => Promise<void>): Promise<Stat> {
  const ms: number[] = [], st: number[] = [];
  for (let i = 0; i < runs; i++) {
    if (before) await before(i);
    const s0 = stmts, t = T();
    const out = await fn(i);
    ms.push(T() - t); st.push(stmts - s0);
    if (out && typeof out === 'object' && 'ok' in out && !(out as { ok: boolean }).ok) throw new Error(`${name}: ${JSON.stringify(out).slice(0, 200)}`);
  }
  const s: Stat = { medianMs: r1(med(ms)), maxMs: r1(Math.max(...ms)), stmts: med(st) };
  results[name] = s;
  return s;
}
const oneEvent = (): Promise<unknown> => api.appendEvents([lookupEvent(Date.now() - 1000)] as never);

await timed('a. GET /me', 5, () => api.me());
await timed('a. GET /enrolments', 5, () => api.listEnrolments());
const vocab0 = must<{ items: Array<{ knowledge: { unitId: string } }>; catalog: { total: number } }>(await api.vocabulary({ languageId: 'sq', limit: 100, sort: 'recent' }), 'vocab seed');
const units60 = vocab0.items.slice(0, 60).map((i) => i.knowledge.unitId);
const vocabTotal = vocab0.catalog.total;
await timed('b. GET /knowledge 60 ids', 5, () => api.knowledge(units60));
const allK = await api.knowledge();
const knowledgeRows = allK.ok ? allK.data.knowledge.length : -1;
await timed('b. GET /knowledge ALL', 5, () => api.knowledge());
// candidates: a fresh client each time so the client's ETag memory never turns a call into a 304 (the server's own cost is what is measured)
const fresh = () => createInProcessApi(deps, sess.token);
await oneEvent();
await timed('c. GET /candidates cold (first after an append)', 1, () => fresh().candidates(enrolmentId, 200));
await timed('c. GET /candidates warm (in cache window)', 5, () => fresh().candidates(enrolmentId, 200));
await timed('c. GET /candidates after 1 event (voided)', 5, () => fresh().candidates(enrolmentId, 200), async () => { await oneEvent(); });
await timed('d. GET /vocabulary 100, no sort', 5, () => fresh().vocabulary({ languageId: 'sq', limit: 100 }));
await timed('d. GET /vocabulary 100, sort=recent', 5, () => fresh().vocabulary({ languageId: 'sq', limit: 100, sort: 'recent' }));
let pages = 0, walked = 0;
await timed('d. FULL walk sort=recent, pages of 100', 3, async () => {
  const c = fresh(); let after: string | undefined; pages = 0; walked = 0;
  for (;;) {
    const r = await c.vocabulary({ languageId: 'sq', limit: 100, sort: 'recent', ...(after ? { after } : {}) });
    if (!r.ok) return r; pages++; walked += r.data.items.length;
    if (!r.data.nextCursor) return r; after = r.data.nextCursor;
  }
});
results['d. FULL walk sort=recent, pages of 100'].extra = { pages, items: walked, runs: 3 };
await timed('e. GET /preferences', 5, () => api.preferences('sq'));
await timed('f. POST 1 event at full history', 5, () => oneEvent());

// g. full pull the way the sync client does it (documentsSince only on page 0, and only once a cursor exists: a first pull sends none)
async function fullPull(opts: { documents?: boolean }): Promise<{ ms: number; pages: number; bytes: number; docsPerPage: number[]; events: number; stmts: number }> {
  const docsPerPage: number[] = []; let bytes = 0, events = 0, p = 0, after = 0;
  const s0 = stmts, t = T();
  for (;;) {
    const res = await handle(new Request('http://repository.local/sync/pull', { method: 'POST', headers: { Authorization: `Bearer ${sess.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ learnerId, deviceId, afterSeq: after, limit: 1000, ...(opts.documents === false ? { documents: false } : {}) }) }), deps);
    const text = await res.text(); bytes += Buffer.byteLength(text);
    const j = JSON.parse(text) as { events: Array<{ seq: number }>; documents: unknown[]; hasMore?: boolean };
    docsPerPage.push(j.documents.length); events += j.events.length; p++;
    if (!j.hasMore || j.events.length === 0) break;
    after = j.events[j.events.length - 1].seq;
  }
  return { ms: T() - t, pages: p, bytes, docsPerPage, events, stmts: stmts - s0 };
}
const pullA = await fullPull({}), pullB = await fullPull({ documents: false });
const pullA2 = await fullPull({}), pullB2 = await fullPull({ documents: false });
const pullAruns = [pullA, pullA2], pullBruns = [pullB, pullB2];
results['g. full /sync/pull (documents on, first pull)'] = { medianMs: r1(med(pullAruns.map((x) => x.ms))), maxMs: r1(Math.max(...pullAruns.map((x) => x.ms))), stmts: pullA.stmts, extra: { pages: pullA.pages, bytes: pullA.bytes, events: pullA.events, docsPerPage: pullA.docsPerPage.slice(0, 4), runs: 2 } };
results['g. full /sync/pull (documents:false)'] = { medianMs: r1(med(pullBruns.map((x) => x.ms))), maxMs: r1(Math.max(...pullBruns.map((x) => x.ms))), stmts: pullB.stmts, extra: { pages: pullB.pages, bytes: pullB.bytes, events: pullB.events, runs: 2 } };

async function fetchStatus() { return handle(new Request('http://repository.local/sync/status', { headers: { Authorization: `Bearer ${sess.token}` } }), deps).then(async (r) => ({ ok: r.ok, body: await r.text() })); }
await timed('h. GET /sync/status', 5, () => fetchStatus());

const head = await store.head(learnerId);
const out = { events: N, headSeq: head, vocabularyWords: vocabTotal, knowledgeRows, cardEvents: cardEvents.length, seed: { lookupsMs: Math.round(lookupSeedMs), totalWithCardsMs: Math.round(seedMs), lastBatchOf200Ms: r1(lastBatchMs), lastBatchStmts }, results };
console.log(JSON.stringify(out));
console.log(`\nevents=${N} head=${head} vocab=${vocabTotal} knowledgeRows=${knowledgeRows} | seed ${Math.round(seedMs)} ms, last 200-batch ${r1(lastBatchMs)} ms (${lastBatchStmts} stmts)`);
console.log('request'.padEnd(52) + 'median ms'.padStart(11) + 'max ms'.padStart(10) + 'stmts'.padStart(8));
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(52) + String(v.medianMs).padStart(11) + String(v.maxMs).padStart(10) + String(v.stmts ?? '').padStart(8) + (v.extra ? '  ' + JSON.stringify(v.extra) : ''));

await store.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
