// Browser timing of the device Repository over a REAL IndexedDB (the in-memory test double is not a measure of this).
// Served by: node scripts/local/static-server.cjs scripts/loadcheck/idb-browser/dist <port>, then open index.html?n=3000&batch=500.
import { openLocalRepository } from '../../../packages/repository-local/src';
import { createMemoryArea } from '../../../packages/repository-sync/src';
import { parseSelection } from '../../../packages/golearn-extension/src/parser/index';
import { buildSelectionEvent, PENDING_IDENTITY } from '../../../packages/golearn-extension/src/store/index';

const out = document.getElementById('out')!;
const params = new URLSearchParams(location.search);
const parseCount = (raw: string | null, fallback: number): number => {
  const v = Number(raw ?? fallback);
  return Number.isInteger(v) && v > 0 ? v : fallback;
};
const N = parseCount(params.get('n'), 3000);
const BATCH = parseCount(params.get('batch'), 500);
const DB = 'loadcheck';
const DEVICE = 'browser-bench';
const PREFIX = 'golearn:local:';
const DAY0 = Date.parse('2026-09-01T08:00:00Z');
const ONE_EXTRA = 20;
const KNOWLEDGE_RUNS = 5;
const REOPEN_RUNS = 5;

const round = (v: number): number => Math.round(v * 10) / 10;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};
const progress = (line: string): void => { out.textContent = line; };

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onblocked = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

const openOpts = () => ({
  area: createMemoryArea(),
  keyPrefix: PREFIX,
  deviceId: DEVICE,
  idb: { indexedDB: window.indexedDB, name: DB },
});

async function main(): Promise<void> {
  progress('loading words…');
  const res = await fetch('./words.json');
  if (!res.ok) throw new Error(`words.json HTTP ${res.status}`);
  const words = (await res.json()) as string[];
  const ids60 = words.slice(0, 60).map((w) => `lemma:sq:${w}`);

  progress('deleting old databases…');
  await deleteDb(DB);
  await deleteDb(`${DB}-kv`);

  progress('opening repository…');
  const repo = await openLocalRepository(openOpts());
  const id = await repo.identity();
  const en = await repo.api.enrol({ learnerId: id.learnerId, languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] } as never);
  if (!en.ok) throw new Error('enrol');
  const enrolmentId = en.data.enrolment.enrolmentId;
  const identity = { ...PENDING_IDENTITY, learnerId: id.learnerId, enrolmentId, deviceId: DEVICE } as never;

  const makeEvent = (i: number) => {
    const word = words[i % words.length];
    const sentence = `Sot ne lexojmë ${word} bashkë në shtëpi.`;
    const at = sentence.indexOf(word);
    const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
    return buildSelectionEvent({ card, readerId: 'web-generic', identity, version: '0.1.0', sessionId: `s${Math.floor(i / 40)}`, now: new Date(DAY0 + i * 4 * 60_000) });
  };

  // seeding, in batches (events are built inside the timed span: the whole seeding)
  const seedStart = performance.now();
  for (let i = 0; i < N; i += BATCH) {
    const end = Math.min(i + BATCH, N);
    const batch = [];
    for (let j = i; j < end; j++) batch.push(makeEvent(j));
    const r = await repo.api.appendEvents(batch as never);
    if (!r.ok) throw new Error('append ' + r.status);
    progress(`seeding ${end}/${N}`);
  }
  const seedMs = round(performance.now() - seedStart);

  // one event at a time: the cost of a single recording on top of the full history
  const oneTimes: number[] = [];
  for (let k = 0; k < ONE_EXTRA; k++) {
    progress(`recording one event ${k + 1}/${ONE_EXTRA}`);
    const event = makeEvent(N + k);
    const t = performance.now();
    const r = await repo.api.appendEvents([event] as never);
    oneTimes.push(performance.now() - t);
    if (!r.ok) throw new Error('append one ' + r.status);
  }
  const recordOneMedianMs = median(oneTimes);
  const recordOneMaxMs = round(Math.max(...oneTimes));

  // reads on the open repository
  const kTimes: number[] = [];
  for (let k = 0; k < KNOWLEDGE_RUNS; k++) {
    progress(`knowledge ${k + 1}/${KNOWLEDGE_RUNS}`);
    const t = performance.now();
    const r = await repo.api.knowledge(ids60);
    kTimes.push(performance.now() - t);
    if (!r.ok) throw new Error('knowledge ' + r.status);
  }
  const knowledge60Ms = median(kTimes);

  await repo.close();

  // cold reopen of the same database, five times
  const reopenTimes: number[] = [];
  const firstTimes: number[] = [];
  for (let k = 0; k < REOPEN_RUNS; k++) {
    progress(`reopen ${k + 1}/${REOPEN_RUNS}`);
    const t0 = performance.now();
    const again = await openLocalRepository(openOpts());
    reopenTimes.push(performance.now() - t0);
    const t1 = performance.now();
    const r = await again.api.knowledge(ids60);
    firstTimes.push(performance.now() - t1);
    if (!r.ok) throw new Error('knowledge after open ' + r.status);
    await again.close();
  }

  const result = {
    events: N,
    batch: BATCH,
    userAgent: navigator.userAgent,
    seedMs,
    recordOneMedianMs,
    recordOneMaxMs,
    knowledge60Ms,
    reopenMs: median(reopenTimes),
    firstKnowledgeAfterOpenMs: median(firstTimes),
  };
  out.textContent = JSON.stringify(result, null, 1);
  document.title = 'done';
}

main().catch((error: unknown) => {
  const e = error as Error;
  out.textContent = 'ERROR: ' + String(error) + '\n' + (e?.stack ?? '');
  document.title = 'error';
});
