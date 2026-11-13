// Throw-away: the Repository service's MEMORY through the GoReview home's recovery scan (a full unsorted GET /vocabulary walk, then GET /knowledge
// ALL, then GET /candidates), for a learner the size of the owner's (2026-11-12: Render's 512 MB instance ran out of memory after each such walk).
//   NODE_OPTIONS=--expose-gc npx vite-node scripts/loadcheck/service/profile-memory.ts <events> <words>     (defaults 20000 events, 3500 words)
// Built from bench-service.ts: the service IN PROCESS over a real SQLite file, as main.ts builds it. Product code is not touched.
import fs from 'node:fs';
import v8 from 'node:v8';
(globalThis as { __v8?: unknown }).__v8 = v8;
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqliteStore } from '../../../packages/repository-store/src';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { albanianPack, createLinguisticService } from '../../../packages/repository-linguistics/src';
import { createInProcessApi } from '../../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../../packages/repository-service/src/deps';
import { adaptLinguistics } from '../../../packages/repository-service/src/linguistics-adapter';
import { nodeCrypto } from '../../../packages/repository-service/src/crypto-node';
import { parseSelection } from '../../../packages/golearn-extension/src/parser/index';
import { buildSelectionEvent, PENDING_IDENTITY } from '../../../packages/golearn-extension/src/store/index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const nums = process.argv.slice(2).filter((a) => /^[0-9]+$/.test(a)).map(Number);
// `light` (2026-11-13): the scan as GoReview asks it now, the light listing of the rows with no catalogue unit; without it, the full unsorted walk it used to be
const LIGHT = process.argv.includes('light');
const N = nums[0] ?? 20000, WORDS = nums[1] ?? 3500;
const gc = (globalThis as { gc?: () => void }).gc;
const MB = (b: number): number => Math.round(b / 1048576);
const mem = (label: string, collect = false): { rss: number; heap: number } => {
  if (collect && gc) { gc(); gc(); }
  const m = process.memoryUsage();
  const out = { rss: MB(m.rss), heap: MB(m.heapUsed) };
  const sz = (globalThis as { __v8?: { getHeapStatistics(): { total_heap_size: number; heap_size_limit: number } } }).__v8?.getHeapStatistics();
  console.log(`${label.padEnd(46)} rss ${String(out.rss).padStart(4)} MB   heap used ${String(out.heap).padStart(4)} MB   external ${MB(m.external)} MB   heap reserved ${MB(m.heapTotal)} MB${sz ? `   heap limit ${MB(sz.heap_size_limit)} MB` : ""}`);
  return out;
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-memory-'));
const now = (): string => new Date().toISOString();
const store = openSqliteStore(path.join(tmpDir, 'repository.sqlite'), { now });
const engine = createProjectionEngine({ store, now });
const linguistics = adaptLinguistics(createLinguisticService(store, { now }));
const deps: ServiceDeps = { store, engine, linguistics, crypto: nodeCrypto, now, log: () => {} };
const anon = createInProcessApi(deps);
const must = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>, what: string): T => { if (!r.ok) throw new Error(`${what}: ${r.status} ${String(r.message)}`); return (r as unknown as { data: T }).data; };
must(await anon.createAccount({ email: 'mem@example.test', password: 'correct horse battery staple', displayName: 'mem' }), 'createAccount');
const sess = must<{ token: string; learnerId: string }>(await anon.createSession({ email: 'mem@example.test', password: 'correct horse battery staple', deviceId: 'mem-device', platform: 'bench' }), 'createSession');
const api = createInProcessApi(deps, sess.token);
const pack = albanianPack();
const enrolmentId = must<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] }), 'enrol').enrolment.enrolmentId;

// the words: the Albanian frequency list first, then made-up Albanian-shaped words (the analyser treats them as unknown forms), until WORDS distinct
const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
const words = [...new Set(freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)))];
const syl = ['ba', 'ke', 'li', 'mo', 'nu', 'për', 'shë', 'ta', 've', 'zi', 'do', 'gë', 'ri', 'su', 'çe', 'fa'];
for (let i = 0; words.length < WORDS; i++) { const w = syl[i % 16] + syl[Math.floor(i / 16) % 16] + syl[Math.floor(i / 256) % 16] + 'th'; if (!words.includes(w)) words.push(w); }
words.length = WORDS;

let lookupNo = 0;
const lookupEvent = (atMs: number) => {
  const word = words[lookupNo % words.length]!;
  const sentence = `Sot ne lexojmë ${word} bashkë në shtëpi.`;
  const at = sentence.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
  const e = buildSelectionEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY, learnerId: sess.learnerId, enrolmentId, deviceId: 'mem-device' } as never, version: '0.1.0', sessionId: `s${Math.floor(lookupNo / 40)}`, now: new Date(atMs) } as never);
  lookupNo++;
  return e;
};
console.log(`seeding ${N} lookups over ${WORDS} words …`);
const t0 = Date.now();
for (let i = 0; i < N; i += 200) {
  const batch = Array.from({ length: Math.min(200, N - i) }, (_, j) => lookupEvent(Date.now() - (N - i - j) * 4 * 60_000));
  const r = await api.appendEvents(batch as never);
  if (!r.ok) throw new Error(`append ${r.status} ${r.message}`);
}
console.log(`seeded in ${Math.round((Date.now() - t0) / 1000)} s`);

const fresh = () => createInProcessApi(deps, sess.token);
mem('after seeding (collected)', true);

/** The GoReview home's recovery scan (packages/goreview/app/workspace.ts): unsorted pages of 100, then the whole knowledge, then candidates. */
async function homeScan(run: number): Promise<{ pages: number; peakRss: number; peakHeap: number; rows: number }> {
  const client = fresh();
  let after: string | undefined, pages = 0, rows = 0, peakRss = 0, peakHeap = 0;
  const sample = (): void => { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed); };
  while (true) {
    const page = await client.vocabulary({ languageId: 'sq', limit: 100, ...(LIGHT ? { detail: 'light' as const, catalogued: false } : {}), ...(after ? { after } : {}) });
    if (!page.ok) throw new Error(`vocabulary ${page.status}`);
    pages++; rows += page.data.items.length; sample();
    after = page.data.nextCursor;
    if (!after) break;
  }
  const k = await client.knowledge(); sample();
  if (!k.ok) throw new Error(`knowledge ${k.status}`);
  const c = await client.candidates(enrolmentId, 200); sample();
  if (!c.ok) throw new Error(`candidates ${c.status}`);
  mem(`after home scan ${run} (${pages} pages, ${rows} rows, ${k.data.knowledge.length} knowledge)`);
  return { pages, rows, peakRss: MB(peakRss), peakHeap: MB(peakHeap) };
}
const scans = [];
for (let run = 1; run <= 3; run++) scans.push(await homeScan(run));
mem('after three scans (collected)', true);
for (const [i, s] of scans.entries()) console.log(`scan ${i + 1}: peak rss ${s.peakRss} MB, peak heap ${s.peakHeap} MB`);
// two scans at once: two open GoReview homes (a phone and a browser) answering the same live update
const both = await Promise.all([homeScan(4), homeScan(5)]);
console.log(`two concurrent scans: peak rss ${Math.max(both[0].peakRss, both[1].peakRss)} MB, peak heap ${Math.max(both[0].peakHeap, both[1].peakHeap)} MB`);
mem('end (collected)', true);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows keeps the SQLite file open until exit */ }
