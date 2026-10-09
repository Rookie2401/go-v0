/**
 * Harness for the offline / failure audit: the REAL GoLearn background worker (session, recorder, durable queue, sync client,
 * profile cache, gloss service) over a fake chrome whose storage can be "restarted" (a new worker over the same storage, as
 * when the browser kills the service worker), talking to the REAL Repository service through `createNet` (the network boundary
 * is the only fake). The server clock and the worker clock move together.
 */
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import type { PackProvider } from '../../packages/golearn-extension/src/background/gloss';
import type { ChromeApi } from '../../packages/golearn-extension/src/platform';
import { createChromeFake, type ChromeFake } from '../extension/chromeFake';
import { fakePacks, pendingEvent, SERVICE } from '../extension/rig';
import { PASSWORD, signUp, type Learner, type Net, type Stack } from './privacy.support';

export { pendingEvent, SERVICE };

export interface WorkerRig {
  readonly fake: ChromeFake;
  readonly bg: ReturnType<typeof createBackground>;
  /** The worker's own clock (ms). `advance` moves it and the server's together. */
  clock: { now: number };
  timers: Array<{ ms: number; cleared: boolean; fired: boolean; fire(): void }>;
  /** Dictionary URLs the worker fetched (the fake dictionary serves a trivial shard while the network is up). */
  dictFetches: string[];
  page(message: Record<string, unknown>): Promise<any>;
  content(message: Record<string, unknown>, tabId?: number): Promise<any>;
  connect(email: string, password?: string): Promise<any>;
  /** Records a content-script event (a lookup) and returns the worker's reply and the event id. */
  recordLookup(word?: string, sentence?: string): Promise<{ reply: any; eventId: string }>;
  fireTimers(): Promise<void>;
  advance(ms: number): void;
  /** Both storage areas, as one string. */
  storageText(): Promise<string>;
  /** A new worker over the SAME storage (the service worker was killed and restarted): only the worker's memory is lost. */
  restart(): void;
}

const shard = (): Response => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

export function createWorkerRig(stack: Stack, net: Net, opts: { packs?: PackProvider; fetch?: typeof fetch } = {}): WorkerRig {
  const clock = { now: stack.clock.ms() };
  const timers: WorkerRig['timers'] = [];
  const dictFetches: string[] = [];
  // dictionary shards: a trivial file, served only while the network is up; everything else is the service
  const fetchImpl: typeof fetch = opts.fetch ?? ((async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (u.includes('/dict/')) { if (net.down) throw new TypeError('Failed to fetch'); dictFetches.push(u); return shard(); }
    return net.fetch(input, init);
  }) as typeof fetch);

  let fake = createChromeFake();
  const boot = (f: ChromeFake): ReturnType<typeof createBackground> => {
    const bg = createBackground(f as unknown as ChromeApi, {
      fetch: fetchImpl, packs: opts.packs ?? fakePacks([]), now: () => clock.now,
      timers: { set: (fn, ms) => { const t = { ms, cleared: false, fired: false, fire() { if (!t.cleared && !t.fired) { t.fired = true; fn(); } } }; timers.push(t); return t; }, clear: (h) => { (h as { cleared: boolean }).cleared = true; } },
    });
    bg.register();
    return bg;
  };
  let bg = boot(fake);

  const rig: WorkerRig = {
    get fake() { return fake; },
    get bg() { return bg; },
    clock, timers, dictFetches,
    page: (m) => fake.dispatch(m, { id: 'test-ext-id', url: 'chrome-extension://test-ext-id/app/index.html' }),
    content: (m, tabId = 7) => fake.dispatch(m, { id: 'test-ext-id', tab: { id: tabId }, url: 'https://example.test/page' }),
    connect: (email, password = PASSWORD) => rig.page({ type: 'golearn:connect', baseUrl: SERVICE, email, password }),
    async recordLookup(word = 'shtëpinë', sentence = 'Unë po lexoj një libër të bukur në shtëpinë time.') {
      const event = pendingEvent(word, sentence);
      const reply = await rig.content({ type: 'golearn:record', event });
      return { reply, eventId: event.id };
    },
    async fireTimers() { for (const t of [...timers]) t.fire(); await new Promise((r) => setTimeout(r, 30)); },
    advance(ms) { clock.now += ms; stack.clock.advance(ms); },
    async storageText() { return JSON.stringify([await fake.local.get(null), await fake.sessionArea.get(null)]); },
    restart() {
      const next = createChromeFake();
      next.storage = fake.storage;            // the same chrome.storage.local / session areas
      next.local = fake.local;
      next.sessionArea = fake.sessionArea;
      fake = next;
      timers.length = 0;
      bg = boot(next);
    },
  };
  return rig;
}

/** An account on the service with an Albanian enrolment (and one session for its setup device), ready for the worker to sign in to. */
export function accountFor(stack: Stack, email: string): Promise<Learner> {
  return signUp(stack, email, `setup-${email.split('@')[0]}`);
}

// ───────────────────────────── a GoReview session over the real service, pack and scheduler ─────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import type { GoEvent } from '../../packages/repository-contract/src';
import {
  buildCardAdded, createFsrsScheduler, createSessionRunner, foldDeckItems, planSession, registry, FAMILY_DIMENSION,
  type ExerciseFamily, type ReviewPreferences, type SessionPlan, type SessionRunner,
} from '../../packages/goreview/src';
import { packFactsFor } from '../../packages/gopractice/packFacts';
import type { AssessmentSource } from '../../packages/golisten/src/contracts';
import { createMemoryArea, type KeyValueArea } from '../../packages/repository-sync/src';
import { createDevice, serverEvents, type Device } from './privacy.support';

const ROOT = path.resolve(__dirname, '../..');
/** The dictionary and pack files, read from `public/` (the only thing the pack runtime fetches). */
export const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(ROOT, 'public', decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('not found', { status: 404 });
}) as typeof fetch;

/** Units the Albanian pack has facts for ("nënë" has none for a written exercise, so it is left out). */
export const SQ_UNITS = ['lemma:sq:libër:NOUN', 'lemma:sq:fëmijë:NOUN', 'lemma:sq:çaj:NOUN'];
const LOOKUPS: Array<[string, string]> = [['librin', 'Fëmijët lexojnë librin.'], ['Fëmijët', 'Fëmijët lexojnë librin.'], ['Nëna', 'Nëna është në kuzhinë.'], ['çajin', 'Beni e pi çajin dhe ha bukën.']];
export const REVIEW_PREFS: ReviewPreferences = { languageId: 'sq', sessionMinutes: 20, maxNew: 5, desiredRetention: 0.9, includeListening: false, grammarShare: 0.3, prioritizeSaved: true };
export const NO_AUDIO = { available: false, eligibleForEvidence: false, reason: 'no Albanian voice on this device' } as const;

export interface ReviewRig {
  learner: Learner;
  device: Device;
  scheduler: ReturnType<typeof createFsrsScheduler>;
  now(): string;
  /** Appends the cards (all due: added and last seen in September) to the SERVER log and returns them. */
  seedDeck(families?: ExerciseFamily[], units?: string[]): Promise<GoEvent[]>;
  plan(opts?: { includeListening?: boolean; audio?: Parameters<typeof planSession>[0]['audio'] }): Promise<SessionPlan>;
  runner(plan: SessionPlan, opts?: { persist?: KeyValueArea; sessionId?: string; record?: (evs: GoEvent[]) => Promise<void>; audio?: AssessmentSource; facts?: 'online' | 'offline' }): SessionRunner;
  /** Answers the current exercise correctly (typed answer from the key). */
  answerRight(r: SessionRunner): Promise<{ index: number; family: string; outcome: string } | null>;
}

export async function createReviewRig(stack: Stack, net: Net, learner: Learner): Promise<ReviewRig> {
  const device = createDevice(learner, net);
  const scheduler = createFsrsScheduler({ desiredRetention: 0.9 });
  const factsFor = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
  for (const [surface, sentence] of LOOKUPS) await learner.api.lookup({ languageId: 'sq', surface, sentence });   // registers the units in the Repository
  const now = (): string => stack.clock.now();
  const rig: ReviewRig = {
    learner, device, scheduler, now,
    async seedDeck(families = ['written-recognition'], units = SQ_UNITS) {
      const evs: GoEvent[] = [];
      for (const unitId of units) for (const family of families) {
        evs.push(buildCardAdded({ learnerId: learner.learnerId, enrolmentId: learner.enrolmentId, languageId: 'sq', at: '2026-09-01T09:00:00.000Z', deviceId: learner.deviceId, producerVersion: 'audit', unitId, unitKind: 'lexeme', dimension: FAMILY_DIMENSION[family], family, addedBy: 'learner' }));
      }
      const r = await learner.api.appendEvents(evs);
      if (!r.ok) throw new Error(`seedDeck ${r.status} ${r.error}`);
      return evs;
    },
    async plan(opts = {}) {
      const deck = foldDeckItems(await serverEvents(stack, learner.learnerId), scheduler, { languageId: 'sq', now: now() });
      return planSession({ deck, intake: [], preferences: { ...REVIEW_PREFS, includeListening: opts.includeListening ?? false }, audio: opts.audio ?? NO_AUDIO, scheduler, now: now(), random: () => 0.5 });
    },
    runner(plan, opts = {}) {
      const api = opts.facts === 'offline' ? net.api(learner.token) : learner.api;
      const facts = factsFor('sq', api)!;
      return createSessionRunner({
        plan, builders: registry, facts, scheduler, identity: { learnerId: learner.learnerId, enrolmentId: learner.enrolmentId, deviceId: learner.deviceId },
        ...(opts.audio ? { audio: opts.audio } : {}),
        record: opts.record ?? (async (evs) => { await device.record(evs); }),
        persist: opts.persist ?? createMemoryArea(), now, random: () => 0.5, ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
      });
    },
    async answerRight(r) {
      const cur = await r.current();
      if (!cur) return null;
      const res = await r.answer({ typed: cur.exercise.answerKey.accepted[0], hinted: false, assistance: [] });
      return { index: cur.index, family: cur.exercise.family, outcome: res.grading.outcome };
    },
  };
  return rig;
}
