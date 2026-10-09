/**
 * A background worker wired to the REAL Repository service handler (with the service tests' in-memory fakes), a fake
 * chrome, and a fake language-pack provider. Everything an extension test needs to talk to a "server" without a socket.
 */
import { CONTRACT_VERSION, type GoEvent, type UnitKnowledge } from '../../packages/repository-contract/src';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { PENDING_IDENTITY, buildSelectionEvent } from '../../packages/golearn-extension/src/store';
import type { PackProvider } from '../../packages/golearn-extension/src/background/gloss';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { albanianManifest } from '../../packages/language-packs/src';
import { handle } from '../../packages/repository-service/src/handler';
import { createChromeFake, type ChromeFake } from './chromeFake';
import { createHarness, type Harness } from './../repository/service/fakes';

export const SERVICE = 'https://repo.example';
export const PASSWORD = 'correct horse battery';
export const ATTRIBUTION = 'Wiktionary, via kaikki.org — CC BY-SA 4.0';

export interface FetchLog { method: string; path: string; status: number }

/** A fetch that is the service's handler; records every call so a test can say what was (not) asked. */
export function serviceFetch(h: Harness, log: FetchLog[] = [], opts: { offline?: () => boolean } = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (opts.offline?.()) throw new TypeError('Failed to fetch');
    const req = new Request(input, init);
    const url = new URL(req.url);
    const res = await handle(req, h.deps);
    log.push({ method: req.method, path: url.pathname, status: res.status });
    return res;
  }) as typeof fetch;
}

/** Dictionary: "shtëpi" has two senses; everything else is unknown. Reads one shard through the (caching) fetch it is given. */
export function fakePacks(calls: string[] = []): PackProvider {
  const manifest = albanianManifest();
  return {
    manifest: (id) => (id === 'sq' ? manifest : undefined),
    runtime: (id, deps) => id === 'sq' ? {
      manifest,
      async gloss(lemma: string) {
        calls.push(lemma);
        const res = await deps.fetch(`${deps.baseUrl.replace(/\/+$/, '')}/dict/sq/s-00.json`);
        if (!res.ok) return undefined;
        await res.text();
        if (lemma !== 'shtëpi') return undefined;
        return { senses: [{ gloss: 'house', pos: 'NOUN' }, { gloss: 'home', pos: 'NOUN' }], attribution: ATTRIBUTION };
      },
    } : undefined,
  };
}

export interface Rig {
  fake: ChromeFake;
  h: Harness;
  bg: ReturnType<typeof createBackground>;
  log: FetchLog[];
  glossCalls: string[];
  offline: { value: boolean };
  /** Messages as the setup page / popup would send them. */
  page(message: Record<string, unknown>): Promise<any>;
  /** Messages as a content script in tab 7 would send them. */
  content(message: Record<string, unknown>): Promise<any>;
  signUp(email?: string): Promise<{ learnerId: string; enrolmentId: string }>;
  connect(email?: string): Promise<any>;
  clock: { now: number };
  /** The debounce timers the worker asked for (fire() runs one). */
  timers: Array<{ ms: number; cleared: boolean; fired: boolean; fire(): void }>;
  fireTimers(): Promise<void>;
}

/** The shard the fake dictionary serves (one file, no content that matters). */
const shard = (): Response => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

export function createRig(): Rig {
  const h = createHarness();
  h.clock.set(new Date().toISOString()); // the service and the worker agree on the time, whatever day the tests run
  const fake = createChromeFake();
  const log: FetchLog[] = [];
  const glossCalls: string[] = [];
  const offline = { value: false };
  const clock = { now: Date.now() };
  const timers: Rig['timers'] = [];
  const svcFetch = serviceFetch(h, log, { offline: () => offline.value });
  // the dictionary lives under the same base in the tests: dict/ paths get a trivial shard, everything else is the service
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (u.includes('/dict/')) { if (offline.value) throw new TypeError('Failed to fetch'); log.push({ method: 'GET', path: new URL(u).pathname, status: 200 }); return shard(); }
    return svcFetch(input, init);
  }) as typeof fetch;
  const bg = createBackground(fake, { fetch: fetchImpl, packs: fakePacks(glossCalls), now: () => clock.now, timers: { set: (fn, ms) => { const t = { ms, cleared: false, fired: false, fire() { if (!t.cleared && !t.fired) { t.fired = true; fn(); } } }; timers.push(t); return t; }, clear: (h) => { (h as { cleared: boolean }).cleared = true; } } });
  bg.register();
  const rig: Rig = {
    fake, h, bg, log, glossCalls, offline, clock, timers,
    async fireTimers() { for (const t of [...timers]) t.fire(); await new Promise((r) => setTimeout(r, 30)); },
    page: (m) => fake.dispatch(m, { id: 'test-ext-id', url: 'chrome-extension://test-ext-id/app/index.html' }),
    content: (m) => fake.dispatch(m, { id: 'test-ext-id', tab: { id: 7 }, url: 'https://example.test/page' }),
    async signUp(email = 'ana@example.com') {
      const created = await h.api().createAccount({ email, password: PASSWORD, displayName: 'Ana' });
      if (!created.ok) throw new Error(`createAccount failed: ${created.error}`);
      const api = h.api();
      const s = await api.createSession({ email, password: PASSWORD, deviceId: 'setup-dev' });
      if (!s.ok) throw new Error('createSession failed');
      const e = await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
      if (!e.ok) throw new Error('enrol failed');
      return { learnerId: created.data.learnerId, enrolmentId: e.data.enrolment.enrolmentId };
    },
    connect: (email = 'ana@example.com') => rig.page({ type: 'golearn:connect', baseUrl: SERVICE, email, password: PASSWORD }),
  };
  return rig;
}

/** A knowledge row for the fake engine's store (what GoPractice's activity would have produced). */
export function knowledgeRow(learnerId: string, unitId: string, dims: Partial<Record<string, { score?: number; confidence?: number; observations?: number; positive?: number; negative?: number }>>): UnitKnowledge {
  const dim = (d?: { score?: number; confidence?: number; observations?: number; positive?: number; negative?: number }) => ({
    score: d?.score ?? 0, confidence: d?.confidence ?? 0, observations: d?.observations ?? 0, positive: d?.positive ?? 0, negative: d?.negative ?? 0, weight: 0, contexts: 0,
  });
  const names = ['exposure', 'assistedRecognition', 'readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding'] as const;
  return {
    learnerId, unitId, languageId: 'sq',
    dimensions: Object.fromEntries(names.map((n) => [n, dim(dims[n])])) as UnitKnowledge['dimensions'],
    retention: { estimate: 0.5, halfLifeDays: 3, basedOn: 'none' }, uncertainty: 0.5, modelVersion: 'test', basis: { events: 1 },
    lastSeenAt: '2026-10-08T09:00:00.000Z',
  };
}

export { CONTRACT_VERSION };

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
/** The event a content script sends: a SelectionLookedUp with the placeholder identity. */
export function pendingEvent(word = 'shtëpinë', sentence = SENTENCE, sessionId = `s${Math.random().toString(36).slice(2, 8)}`): GoEvent {
  const at = sentence.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
  return buildSelectionEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY }, version: '0.1.0', sessionId, now: new Date('2026-10-08T10:00:00.000Z') });
}
