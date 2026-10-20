// @vitest-environment node
/**
 * PERFORMANCE audit, lane 2 of 3 (docs/ecosystem/audit/PERFORMANCE.md): the Repository service and what talks to it.
 *   PF-M10..M15  event writes: one event and a batch of 100, in-process / over HTTP (in-test server) / over HTTP (separate main.ts process)
 *   PF-M70..M75  GoReview: candidates -> intake -> cards for 200 units, one answer through the session runner
 *   PF-M80..M82  sync: flush of 500 queued events over HTTP
 * The service is the REAL stack (SQLite, real projection engine, real linguistics, real scrypt for sign-up). The separate
 * process rows appear only when PERF_SERVICE_URL is set (e.g. `npx vite-node packages/repository-service/src/main.ts --port 8791 --data <dir>`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import { validateEvent } from '../../packages/repository-contract/src';
import { buildCardAdded, createFsrsScheduler, createSessionRunner, foldDeckItems, gatherCandidates, planSession, registry, type DeckItem, type IntakeOutcome, type ReviewPreferences } from '../../packages/goreview/src';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { packFactsFor } from '../../packages/gopractice/packFacts';
import { createMemoryStore } from '../../packages/repository-store/src';
import { createRepositoryApi } from '../../packages/repository-service/src/api';
import { createLocalQueue, createMemoryArea, createSyncClient, newEventId, type Transport } from '../../packages/repository-sync/src';
import {
  REPO, externalService, flushRowsAfterAll, fileFetch, httpInTest, inProcessService, lookupEvent, must, now, once, record, recordValue, reviewEvent, sample, signUp,
  type Service, type Who,
} from './perf.support';

flushRowsAfterAll('perf.service', 'PERFORMANCE lane 2 (service, review, sync)');

const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

function lemmas(count: number): string[] {
  const f = JSON.parse(fs.readFileSync(path.join(REPO, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
  return f.lemmas.map(([l]) => l).filter((l) => l.length > 3 && /^[\p{L}]+$/u.test(l)).slice(0, count);
}

const services: Array<{ key: string; idBase: number; make: () => Promise<Service> | Service }> = [
  { key: 'in-process', idBase: 10, make: inProcessService },
  { key: 'http-in-test', idBase: 12, make: httpInTest },
  ...(externalService() ? [{ key: 'http-process', idBase: 14, make: () => externalService()! }] : []),
];

describe.each(services)('event writes: $key', ({ key, idBase, make }) => {
  it('single event (N=100) and batch of 100 (N=20)', async () => {
    const svc = await make();
    try {
      const who = await signUp(svc, `w-${key}`);
      // warm: the first requests pay for prepared statements and lazy module work
      for (let i = 0; i < 5; i++) must(await who.api.appendEvents([lookupEvent(who)]));
      const singles = await sample(100, async () => { const r = await who.api.appendEvents([lookupEvent(who)]); if (!r.ok || r.data.stored !== 1) throw new Error(`write failed ${r.ok ? '' : r.status}`); });
      const batches: number[] = [];
      for (let i = 0; i < 20; i++) {
        const batch = Array.from({ length: 100 }, (_, j) => lookupEvent(who, `lemma:sq:${lemmas(60)[(i + j) % 60]}:NOUN`));
        batches.push(await once(async () => { const r = await who.api.appendEvents(batch); if (!r.ok || r.data.stored !== 100) throw new Error('batch failed'); }));
      }
      record(`PF-M${idBase}`, `write 1 event, ${svc.mode}`, 'POST /events with one SelectionLookedUp: auth + validate + store + incremental projection + response', singles);
      record(`PF-M${idBase + 1}`, `write a batch of 100 events, ${svc.mode}`, 'POST /events with 100 events, same path', batches);
      expect(med(singles)).toBeLessThan(500);
      expect(med(batches)).toBeLessThan(5000);
    } finally { await svc.close(); }
  }, 120_000);
});

describe('HTTP floor of this machine', () => {
  it('PF-M18: a bare node:http server that answers {"ok":true}, reached with fetch (no Repository code at all)', async () => {
    const { createServer } = await import('node:http');
    const server = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":true}'); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const t = await sample(100, async () => { const r = await fetch(`http://127.0.0.1:${port}/`); await r.text(); }, 5);
      record('PF-M18', 'HTTP floor: fetch to a bare node:http hello server on 127.0.0.1', 'what one loopback request costs on this PC before any Repository code runs', t, 'subtract this from every "over HTTP" row to see the service own share');
      expect(med(t)).toBeLessThan(1000);
    } finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); }
  });
});

// ───────────────────────────── GoReview ─────────────────────────────

const prefs: ReviewPreferences = { languageId: 'sq', sessionMinutes: 600, maxNew: 400, desiredRetention: 0.9, includeListening: false, grammarShare: 0.3, prioritizeSaved: true };

describe.each(services.slice(0, 2))('GoReview: cards for 200 units and one answer: $key', ({ key, idBase, make }) => {
  it('candidates -> intake -> CardAdded for 200 units; then one answer through the session runner', async () => {
    const svc = await make();
    const reviewBase = idBase === 10 ? 70 : 75;
    const sent = { calls: 0 };
    const inner = svc.fetch;
    svc.fetch = ((input: RequestInfo | URL, init?: RequestInit) => { sent.calls++; return inner(input, init); }) as typeof fetch;
    try {
      const who = await signUp(svc, `r-${key}`);
      // unit ids exactly as GoLearn's parser derives them for a word seen alone; 300 distinct lemma units (not every one becomes a candidate; cards are made for the first 200 testable)
      const units = [...new Set(lemmas(900).map((w) => parseSelection({ surface: w, context: { kind: 'none', confidence: 0 } }).itemIds.find((i) => i.startsWith('lemma:sq:'))).filter((u): u is string => !!u))].slice(0, 300);
      expect(units.length).toBe(300);
      // setup, not timed: the learner has looked up each of the 300 units twice (so each is a candidate)
      for (let rep = 0; rep < 2; rep++) {
        for (let i = 0; i < units.length; i += 100) must(await who.api.appendEvents(units.slice(i, i + 100).map((u) => lookupEvent(who, u))));
      }
      // the service learns the units through /lookup in the real flow (the card's lookup); register them so intake can fetch facts
      for (const u of units) await who.api.lookup({ languageId: 'sq', surface: u.split(':')[2] });

      const factsFor = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
      const facts = factsFor('sq', who.api)!;
      const nowIso = (): string => new Date().toISOString();
      const audio = async () => ({ available: false, eligibleForEvidence: false, reason: 'no audio in this measurement' });

      let candidates: ReviewCandidate[] = [];
      let outcomes: IntakeOutcome[] = [];
      const fetchCandidates = async (): Promise<void> => { candidates = must<{ candidates: ReviewCandidate[] }>(await who.api.candidates(who.enrolmentId, 300)).candidates; };
      const runIntake = async (): Promise<void> => {
        outcomes = await gatherCandidates({
          api: { candidates: async () => candidates, knowledge: async (ids) => must<{ knowledge: UnitKnowledge[] }>(await who.api.knowledge(ids)).knowledge },
          // The learner selected these units for practice; New-stage lookup exposure alone must not admit them.
          facts, audio, deck: [], saved: new Set(units), preferences: prefs, now: nowIso(), enrolmentId: who.enrolmentId, limit: 300,
        });
      };
      // first run is cold (projection fold, linguistic rows, pack runtime shards); then 5 warm repeats
      const candCold = await once(fetchCandidates);
      const intakeCold = await once(runIntake);
      const candWarm = await sample(5, fetchCandidates);
      const callsBefore = sent.calls;
      const intakeWarm = await sample(5, runIntake);
      const requestsPerIntake = (sent.calls - callsBefore) / 5;
      // PF-02 (fixed): the intake no longer makes one request per testable candidate: one /knowledge batch plus the unit reads in chunks of 50
      expect(requestsPerIntake).toBeLessThanOrEqual(1 + Math.ceil(candidates.length / 50));
      console.log(`[${key}] service requests per intake of ${candidates.length} candidates: ${requestsPerIntake}`);
      // and the batch route answers exactly what the single-unit route answers, with the unknown ids listed apart
      const one = must<{ unit: unknown; relations: unknown; analyses: unknown }>(await who.api.unit(units[0]));
      const batch = must<{ units: Record<string, unknown>; missing: string[] }>(await who.api.units([units[0], 'lemma:sq:nosuchword:NOUN']));
      expect(batch.units[units[0]]).toEqual(one);
      expect(batch.missing).toEqual(['lemma:sq:nosuchword:NOUN']);
      expect((await who.api.units([])).ok).toBe(false);
      expect((await who.api.units(Array.from({ length: 51 }, (_, i) => `lemma:sq:w${i}:NOUN`))).ok).toBe(false);
      const testable = outcomes.filter((o) => o.proposed && (o.decision === 'test-now' || o.decision === 'test-later'));
      console.log(`[${key}] candidates returned ${candidates.length}; intake outcomes ${outcomes.length}; testable ${testable.length}; decisions ${JSON.stringify(countBy(outcomes.map((o) => o.decision)))}`);
      expect(testable.length).toBeGreaterThanOrEqual(200);

      const buildCards = (): GoEvent[] => {
        const out: GoEvent[] = [];
        for (const o of testable.slice(0, 200)) {
          out.push(buildCardAdded({
            learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq', at: nowIso(), deviceId: who.deviceId, producerVersion: 'perf',
            unitId: o.unitId, unitKind: o.candidate.kind, dimension: o.proposed!.dimension, family: o.proposed!.family, addedBy: 'learner', reason: o.reasons[0] ?? o.decision,
          }));
        }
        for (const c of out) if (validateEvent(c).length) throw new Error('invalid card event');
        return out;
      };
      const buildRuns = await sample(5, buildCards);
      const cards = buildCards();
      expect(cards).toHaveLength(200);
      const tWrite = await once(async () => { for (let i = 0; i < cards.length; i += 100) must(await who.api.appendEvents(cards.slice(i, i + 100))); });
      const created = cards.length;
      recordValue(`PF-M${reviewBase}`, `GoReview: GET /candidates, first (cold) run, ${svc.mode}`, '300 units looked up twice each; limit 300', candCold, 'ms', `1 run; ${candidates.length} candidates returned`);
      record(`PF-M${reviewBase + 1}`, `GoReview: intake of ${candidates.length} candidates with pack facts (warm), ${svc.mode}`, 'GET /candidates + gatherCandidates: knowledge batch + facts per testable unit (a /units call + pack runtime each) + decideIntake; N=5 warm runs', intakeWarm.map((x, i) => x + candWarm[i]), `first (cold) run of the intake alone: ${intakeCold.toFixed(0)} ms; ${testable.length} testable; ${requestsPerIntake} service requests per intake (sequential)`);
      record(`PF-M${reviewBase + 2}`, `GoReview: build + validate 200 CardAdded events, ${svc.mode}`, 'buildCardAdded x 200 + validateEvent x 200 (no I/O)', buildRuns);
      recordValue(`PF-M${reviewBase + 2}b`, `GoReview: write 200 cards (2 x POST /events of 100), ${svc.mode}`, 'the two writes; the learner then has 200 deck items', tWrite, 'ms', '1 run');
      expect(tWrite).toBeLessThan(60_000);

      // submission: one answer per item through the real session runner, recorded over the service
      const all = must<{ events: GoEvent[] }>(await who.api.listEvents({ limit: 5000 })).events;
      const scheduler = createFsrsScheduler({ desiredRetention: 0.9 });
      const deck: DeckItem[] = foldDeckItems(all, scheduler, { languageId: 'sq', now: nowIso() });
      expect(deck.length).toBeGreaterThanOrEqual(created - 5);
      const plan = planSession({ deck, intake: [], preferences: prefs, audio: { available: false, eligibleForEvidence: false, reason: 'none' }, scheduler, now: nowIso(), random: () => 0.5 });
      expect(plan.items.length).toBeGreaterThan(30);
      const runner = createSessionRunner({
        plan, builders: registry, facts, scheduler, identity: { learnerId: who.learnerId, enrolmentId: who.enrolmentId, deviceId: who.deviceId },
        record: async (evs) => { must(await who.api.appendEvents(evs)); }, persist: createMemoryArea(), now: nowIso, random: () => 0.5, sessionId: `perf-${key}`,
      });
      const build: number[] = [];
      const answer: number[] = [];
      for (let i = 0; i < 30; i++) {
        const t0 = now();
        const cur = await runner.current();
        build.push(now() - t0);
        if (!cur) break;
        const t1 = now();
        const res = await runner.answer({ typed: cur.exercise.answerKey.accepted[0] ?? 'x', hinted: false, assistance: [] });
        answer.push(now() - t1);
        expect(res.grading.outcome).toBeTruthy();
      }
      expect(answer.length).toBeGreaterThanOrEqual(20);
      record(`PF-M${reviewBase + 3}`, `GoReview: build the next exercise (runner.current), ${svc.mode}`, 'facts (service /units + pack runtime) + builder + validation; the first item has no pre-build, later ones do', build);
      record(`PF-M${reviewBase + 4}`, `GoReview: submit one answer (runner.answer incl. event emit + POST), ${svc.mode}`, 'grade + schedule + build evidence event + validate + record() = POST /events', answer);
      expect(med(answer)).toBeLessThan(2000);
    } finally { await svc.close(); }
  }, 300_000);
});

function countBy(xs: string[]): Record<string, number> { const o: Record<string, number> = {}; for (const x of xs) o[x] = (o[x] ?? 0) + 1; return o; }

// ───────────────────────────── sync ─────────────────────────────

const httpServices = services.filter((s) => s.key !== 'in-process');
describe.each(httpServices)('sync: flush of 500 queued events over HTTP: $key', ({ key, idBase, make }) => {
  it('queue 500 events, then client.push() (batches of 200)', async () => {
    const svc = await make();
    const base = idBase === 12 ? 80 : 82;
    try {
      const who = await signUp(svc, `s-${key}`, 'dev-S1');
      const second = createRepositoryApiFor(svc, who);
      const transport: Transport = {
        async push(req) { const r = await second.syncPush(req); if (!r.ok) throw new Error(`push ${r.status} ${r.error}`); return r.data; },
        async pull(req) { const r = await second.syncPull(req); if (!r.ok) throw new Error(`pull ${r.status}`); return r.data; },
      };
      const flushes: number[] = [];
      const enqueues: number[] = [];
      let acked = 0;
      for (let run = 0; run < 5; run++) {
        const queue = createLocalQueue(createMemoryArea());
        const client = createSyncClient({ queue, local: createMemoryStore(), transport, deviceId: 'dev-S1', now: () => Date.now(), random: () => 0.5 });
        const evs: GoEvent[] = Array.from({ length: 500 }, (_, i) => ({
          ...reviewEvent(who, `lemma:sq:${lemmas(60)[i % 60]}:NOUN`, i % 3 !== 0), id: newEventId('dev-S1', Date.now() + i, () => Math.random()),
        }));
        enqueues.push(await once(async () => { for (const e of evs) { const q = await queue.enqueue(e); if (!q.ok) throw new Error(`enqueue refused ${JSON.stringify(q)}`); } }));
        expect(await queue.size()).toBe(500);
        flushes.push(await once(async () => { const r = await client.push(); acked += r.acked; if (!r.ok) throw new Error(`push failed ${r.error}`); }));
        expect(await queue.size()).toBe(0);
      }
      expect(acked).toBe(2500);
      record(`PF-M${base}`, `sync: flush 500 queued events, ${svc.mode}`, 'SyncClient.push(): read queue, 3 POST /sync/push (200+200+100), ack, clear queue', flushes, `N=5 flushes of 500 (each over a fresh queue); ${(500 / (med(flushes) / 1000)).toFixed(0)} events/s at the median`);
      record(`PF-M${base + 1}`, `sync: enqueue 500 events locally (validate + persist each), memory area`, 'LocalQueue.enqueue x 500 against an in-memory key-value area (the extension\'s chrome.storage cost is not included)', enqueues);
      expect(med(flushes)).toBeLessThan(30_000);
    } finally { await svc.close(); }
  }, 300_000);
});

function createRepositoryApiFor(svc: Service, who: Who) { return createRepositoryApi({ baseUrl: svc.baseUrl, fetch: svc.fetch, token: who.token }); }

