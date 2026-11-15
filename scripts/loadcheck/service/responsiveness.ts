// GoLearn's responsiveness while a GoReview home is open, before and after the 2026-11-12 throttles (the owner: "my fear is that slowing this down
// would hinder GoLearn's responsiveness"). The Repository service IN PROCESS over a real SQLite file, through its real HTTP handler (as profile-memory.ts),
// with a learner of the owner's size. Three runs of the same GoLearn reading (GoLearn means to send one lookup every 100 ms):
//   alone   no GoReview open;
//   before  an open home rebuilding after every live update as it did before: the recovery scan (every vocabulary page unsorted, the whole knowledge,
//           the candidates) and the word count's walk (every page sorted by recency), back to back;
//   after   the same open home with the throttles: inside ten minutes of a walk a rebuild asks only for the candidates, and the count comes from the
//           list saved on the device; one "New deck" press in the middle walks afresh once (the light listing of 8966783c).
// It reports how long GoLearn waits for each lookup to be recorded, counted from the instant it meant to send it (p50, p95, max), how long the word card takes to build (on the device, no service),
// and how long one home rebuild takes. Memory is profile-memory.ts's job: one process across three runs keeps what it grew, so it is not compared here.
//   NODE_OPTIONS=--expose-gc npx vite-node scripts/loadcheck/service/responsiveness.ts <events> <words> <seconds per run>   (defaults 20000 3500 20; the 2026-11-12 figures used 30 s)
import fs from 'node:fs';
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
const N = nums[0] ?? 20000, WORDS = nums[1] ?? 3500, SECONDS = nums[2] ?? 20;
const gc = (globalThis as { gc?: () => void }).gc;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'responsiveness-'));
const now = (): string => new Date().toISOString();
const store = openSqliteStore(path.join(tmpDir, 'repository.sqlite'), { now });
const engine = createProjectionEngine({ store, now });
const linguistics = adaptLinguistics(createLinguisticService(store, { now }));
const deps: ServiceDeps = { store, engine, linguistics, crypto: nodeCrypto, now, log: () => {} };
const anon = createInProcessApi(deps);
const must = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>, what: string): T => { if (!r.ok) throw new Error(`${what}: ${r.status} ${String(r.message)}`); return (r as unknown as { data: T }).data; };
must(await anon.createAccount({ email: 'resp@example.test', password: 'correct horse battery staple', displayName: 'resp' }), 'createAccount');
const sess = must<{ token: string; learnerId: string }>(await anon.createSession({ email: 'resp@example.test', password: 'correct horse battery staple', deviceId: 'resp-device', platform: 'bench' }), 'createSession');
const api = (): ReturnType<typeof createInProcessApi> => createInProcessApi(deps, sess.token);
const pack = albanianPack();
const enrolmentId = must<{ enrolment: { enrolmentId: string } }>(await api().enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] }), 'enrol').enrolment.enrolmentId;

// the words: the Albanian frequency list first, then made-up Albanian-shaped words, until WORDS distinct (as profile-memory.ts)
const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
const words = [...new Set(freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)))];
const syl = ['ba', 'ke', 'li', 'mo', 'nu', 'për', 'shë', 'ta', 've', 'zi', 'do', 'gë', 'ri', 'su', 'çe', 'fa'];
for (let i = 0; words.length < WORDS; i++) { const w = syl[i % 16] + syl[Math.floor(i / 16) % 16] + syl[Math.floor(i / 256) % 16] + 'th'; if (!words.includes(w)) words.push(w); }
words.length = WORDS;

let lookupNo = 0;
/** GoLearn's word card for the next word, and the event it records: built on the device, no service involved. */
const lookup = (atMs: number) => {
  const word = words[lookupNo % words.length]!;
  const sentence = `Sot ne lexojmë ${word} bashkë në shtëpi.`;
  const at = sentence.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
  const e = buildSelectionEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY, learnerId: sess.learnerId, enrolmentId, deviceId: 'resp-device' } as never, version: '0.1.0', sessionId: `s${Math.floor(lookupNo / 40)}`, now: new Date(atMs) } as never);
  lookupNo++;
  return e;
};
console.log(`seeding ${N} lookups over ${WORDS} words …`);
const t0 = Date.now();
for (let i = 0; i < N; i += 200) {
  const batch = Array.from({ length: Math.min(200, N - i) }, (_, j) => lookup(Date.now() - (N - i - j) * 4 * 60_000));
  const r = await api().appendEvents(batch as never);
  if (!r.ok) throw new Error(`append ${r.status} ${r.message}`);
}
console.log(`seeded in ${Math.round((Date.now() - t0) / 1000)} s\n`);

type Walk = 'scan-full' | 'scan-light' | 'count';
/**
 * Every page of the vocabulary listing: the recovery scan as it was (full unsorted pages), the scan as workspace.ts asks since 8966783c (light, only
 * rows with no catalogue unit: one reply for this learner), or the home's word count (deckModel.ts's loadVocab: full pages sorted by recency).
 */
async function walk(how: Walk): Promise<number> {
  const client = api();
  let after: string | undefined, pages = 0;
  const shape = how === 'count' ? { sort: 'recent' as const } : how === 'scan-light' ? { detail: 'light' as const, catalogued: false } : {};
  while (true) {
    const page = await client.vocabulary({ languageId: 'sq', limit: 100, ...shape, ...(after ? { after } : {}) });
    if (!page.ok) throw new Error(`vocabulary ${page.status}`);
    pages++;
    after = page.data.nextCursor;
    if (!after) return pages;
  }
}
/**
 * One home rebuild. 'before': the full recovery scan and the count walk, every time. 'press': the "New deck" press's fresh scan (light since
 * 8966783c). 'reuse': inside ten minutes of a walk, with the count from the saved list: the candidates only.
 */
async function homeBuild(kind: 'before' | 'press' | 'reuse'): Promise<void> {
  const client = api();
  if (kind !== 'reuse') {
    await walk(kind === 'before' ? 'scan-full' : 'scan-light');
    const k = await client.knowledge();
    if (!k.ok) throw new Error(`knowledge ${k.status}`);
  }
  const c = await client.candidates(enrolmentId, 200);
  if (!c.ok) throw new Error(`candidates ${c.status}`);
  if (kind === 'before') await walk('count');
}

const pct = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : NaN; };
const ms = (x: number): string => `${x.toFixed(x < 10 ? 2 : 0)} ms`;
interface Run { name: string; record: number[]; card: number[]; builds: number[]; duringPress: number[]; pressMs?: number }

async function run(name: 'alone' | 'before' | 'after'): Promise<Run> {
  if (gc) { gc(); gc(); }
  const record: number[] = [], card: number[] = [], builds: number[] = [], duringPress: number[] = [];
  const until = Date.now() + SECONDS * 1000;
  let pressed = false, pressFrom = Infinity, pressTo = Infinity;
  let pressMs: number | undefined;
  const home = (async () => {
    if (name === 'alone') return;
    while (Date.now() < until) {
      // the "New deck" press, once, half-way through the run: a fresh walk
      const press = name === 'after' && !pressed && Date.now() > until - SECONDS * 500;
      if (press) { pressed = true; pressFrom = Date.now(); }
      const s = performance.now();
      await homeBuild(name === 'before' ? 'before' : press ? 'press' : 'reuse');
      if (press) { pressTo = Date.now(); pressMs = performance.now() - s; } else builds.push(performance.now() - s);
      // a rebuild follows the next live update; GoLearn sends one every 100 ms, so the old home rebuilt back to back
      await sleep(name === 'before' ? 0 : 100);
    }
  })();
  // GoLearn means to send one lookup every 100 ms; each is timed from the instant it was MEANT to go, so the time it waits for a busy service is counted
  const golearn = (async () => {
    const start = Date.now();
    for (let k = 0; start + k * 100 < until; k++) {
      const meant = start + k * 100;
      if (Date.now() < meant) await sleep(meant - Date.now());
      const a = performance.now();
      const e = lookup(Date.now());
      card.push(performance.now() - a);
      const r = await api().appendEvents([e] as never);
      if (!r.ok) throw new Error(`append ${r.status}`);
      // a lookup meant to go while the walk ran waited for the walk, whenever it was finally sent
      (meant >= pressFrom && meant < pressTo ? duringPress : record).push(Date.now() - meant);
    }
  })();
  await Promise.all([home, golearn]);
  return { name, record, card, builds, duringPress, pressMs };
}

const runs: Run[] = [];
for (const name of ['alone', 'before', 'after'] as const) {
  console.log(`run "${name}" (${SECONDS} s) …`);
  runs.push(await run(name));
}
const stats = (xs: number[]): string => xs.length ? `${String(xs.length).padStart(4)} recorded; wait from meant to recorded: p50 ${ms(pct(xs, 0.5))}, p95 ${ms(pct(xs, 0.95))}, max ${ms(Math.max(...xs))}` : '   0 recorded';
console.log(`\nlearner: ${WORDS} words, ${N} events; GoLearn means to send one lookup every 100 ms (about ${SECONDS * 10} in each run of ${SECONDS} s)\n`);
for (const r of runs) {
  console.log(r.name);
  console.log(`  GoLearn word card, built on the device:   p50 ${ms(pct(r.card, 0.5))}, max ${ms(Math.max(...r.card))}`);
  console.log(`  GoLearn lookups sent to the service:      ${stats(r.record)}${r.pressMs !== undefined ? ' (outside the walk)' : ''}`);
  if (r.name !== 'alone') console.log(`  GoReview home rebuilds ${r.name === 'after' ? '(candidates only)  ' : '(scan + count walk)'}: ${r.builds.length ? `${r.builds.length}, p50 ${ms(pct(r.builds, 0.5))}, max ${ms(Math.max(...r.builds))}` : 'none finished'}`);
  if (r.pressMs !== undefined) {
    console.log(`  the one "New deck" walk:                  ${ms(r.pressMs)} in the background (the press itself waits at most 1.5 s)`);
    console.log(`  GoLearn lookups meant during that walk:   ${stats(r.duringPress)}`);
  }
  console.log('');
}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows keeps the SQLite file open until exit */ }
