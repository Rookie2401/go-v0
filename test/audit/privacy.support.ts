/**
 * Shared harness for the privacy / portability audit AND the offline / failure audit (offline.support.ts builds on it).
 *
 * Everything runs over the REAL Repository: the real service handler, the real memory or SQLite store, the real projection
 * engine and linguistics. The password hash is a fast deterministic stand-in (scrypt has its own tests in the security audit).
 * The only fakes are at the network boundary (`createNet`: a fetch that can be cut, answer 503, or lose a response after the
 * server has acted) and the clock.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONTRACT_VERSION, type EventLog, type GoEvent } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { albanianPack, createLinguisticService } from '../../packages/repository-linguistics/src';
import { createMemoryStore, openSqliteStore } from '../../packages/repository-store/src';
import type { ConcreteStore } from '../../packages/repository-store/src';
import { createRepositoryApi, createInProcessApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import { createContext, type AppContext } from '../../packages/goreview/app/context';
import type { Deps } from '../../packages/goreview/app/ports';
import { createLocalEventLog } from '../../packages/goreview/app/state';
import {
  createLocalDocuments, createLocalQueue, createMemoryArea, createSyncClient,
  type KeyValueArea, type LocalDocuments, type LocalQueue, type SyncClient, type Transport,
} from '../../packages/repository-sync/src';

export type StoreKind = 'memory' | 'sqlite';
export const STORE_KINDS: StoreKind[] = ['memory', 'sqlite'];

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
export const fastCrypto = {
  async hashPassword(pw: string) { return `fast$${sha(`salt:${pw}`)}`; },
  async verifyPassword(pw: string, hash: string) { return hash === `fast$${sha(`salt:${pw}`)}`; },
  randomToken: () => randomBytes(32).toString('base64url'),
  sha256: sha,
};

export interface Clock { now: () => string; ms: () => number; advance(ms: number): void; set(iso: string): void }
export function createClock(start = '2026-10-09T08:00:00.000Z'): Clock {
  let t = Date.parse(start);
  return { now: () => new Date(t).toISOString(), ms: () => t, advance: (ms) => { t += ms; }, set: (iso) => { t = Date.parse(iso); } };
}

export interface Stack {
  kind: StoreKind;
  store: ConcreteStore;
  deps: ServiceDeps;
  clock: Clock;
  logs: string[];
  /** The typed API wired straight to the handler (no network in between). */
  api(token?: string): RepositoryApi;
  close(): Promise<void>;
  file?: string;
}

export function createStack(kind: StoreKind): Stack {
  const clock = createClock();
  const dir = kind === 'sqlite' ? mkdtempSync(join(tmpdir(), 'go-priv-')) : undefined;
  const file = dir ? join(dir, 'repo.sqlite') : undefined;
  const store = kind === 'memory' ? createMemoryStore({ now: clock.now }) : openSqliteStore(file!, { now: clock.now });
  const engine = createProjectionEngine({ store, now: clock.now });
  const linguistics = adaptLinguistics(createLinguisticService(store, { now: clock.now }));
  const logs: string[] = [];
  const deps: ServiceDeps = { store, engine, linguistics, crypto: fastCrypto, now: clock.now, log: (l) => logs.push(l) };
  return {
    kind, store, deps, clock, logs, ...(file ? { file } : {}), api: (token) => createInProcessApi(deps, token),
    close: async () => { await store.close(); if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* a temp folder */ } },
  };
}

export const PASSWORD = 'correct horse battery staple';

export interface Learner {
  api: RepositoryApi;
  email: string;
  password: string;
  deviceId: string;
  learnerId: string;
  accountId: string;
  token: string;
  enrolmentId: string;
}

/** Creates an account, signs in on a device, enrols in Albanian. */
export async function signUp(s: Stack, email: string, deviceId = `dev-${email.split('@')[0]}`, opts: { enrol?: boolean } = {}): Promise<Learner> {
  const api = s.api();
  const made = await api.createAccount({ email, password: PASSWORD, displayName: email.split('@')[0] });
  if (!made.ok) throw new Error(`createAccount ${made.status} ${made.error}`);
  const session = await api.createSession({ email, password: PASSWORD, deviceId, platform: 'test' });
  if (!session.ok) throw new Error(`createSession ${session.status} ${session.error}`);
  let enrolmentId = '';
  if (opts.enrol !== false) {
    const pack = albanianPack();
    const enrolled = await api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] });
    if (!enrolled.ok) throw new Error(`enrol ${enrolled.status} ${enrolled.error}`);
    enrolmentId = enrolled.data.enrolment.enrolmentId;
  }
  return { api, email, password: PASSWORD, deviceId, learnerId: made.data.learnerId, accountId: made.data.accountId, token: session.data.token, enrolmentId };
}

/** A second device (a second session with its own device id) of the same learner. */
export async function addDevice(s: Stack, who: Learner, deviceId: string): Promise<Learner> {
  const api = s.api();
  const session = await api.createSession({ email: who.email, password: who.password, deviceId, platform: 'test' });
  if (!session.ok) throw new Error(`createSession ${session.status} ${session.error}`);
  return { ...who, api, deviceId, token: session.data.token };
}

type Ident = Pick<Learner, 'learnerId' | 'enrolmentId' | 'deviceId'>;
let counter = 0;
const uid = (): string => `${++counter}-${randomBytes(4).toString('hex')}`;

/** A valid reader event (SelectionLookedUp, producer golearn-ext). */
export function lookup(who: Ident, over: Partial<GoEvent> = {}): GoEvent {
  return {
    id: `pv-${uid()}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq',
    at: '2026-10-09T07:59:00.000Z', producer: { app: 'golearn-ext', version: '1', deviceId: who.deviceId }, kind: 'SelectionLookedUp',
    subject: { itemIds: ['form:sq:shtëpinë'], sentenceKey: 'ab12' },
    payload: { surface: 'shtëpinë', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] }, ...over,
  };
}

/** A card review (CardReviewed): `correct` moves the reading dimension. */
export function review(who: Ident, over: Partial<GoEvent> & { correct?: boolean } = {}): GoEvent {
  const { correct, ...rest } = over;
  const ok = correct ?? true;
  return {
    id: `pv-r-${uid()}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq',
    at: '2026-10-09T07:59:00.000Z', producer: { app: 'gopractice-review', version: '1', deviceId: who.deviceId }, kind: 'CardReviewed',
    subject: { itemIds: ['lemma:sq:libër:NOUN'], cardId: 'c1' },
    payload: { cardKind: 'recognition', grade: ok ? 'good' : 'again', correct: ok, hinted: false }, ...rest,
  };
}

/** A writing observation (ProductionRecorded, the /writing route's kind). */
export function production(who: Ident, over: Partial<GoEvent> = {}): GoEvent {
  return lookup(who, {
    kind: 'ProductionRecorded', producer: { app: 'gopractice-tell', version: '1', deviceId: who.deviceId }, subject: { itemIds: ['lemma:sq:libër:NOUN'], draftId: 'd1' },
    payload: { mode: 'free', assisted: false, assistance: [], usedCorrectly: 'unjudged', draftId: 'd1', wordCount: 4 }, ...over,
  });
}

export interface Raw { status: number; body: Record<string, any>; headers: Headers; text: string }
/** A raw request to the handler: no client in between. */
export async function raw(s: Stack, method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Raw> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await handle(new Request(`http://repository.local${path}`, init), s.deps);
  const text = res.status === 204 ? '' : await res.text();
  let body: Record<string, any> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: res.status, body, headers: res.headers, text };
}

/**
 * Everything the store holds, as text. SQLite: every row of every table, read through a second connection (password
 * hashes and token digests included). Memory: what the port can list for the given learners.
 */
export async function dumpStore(s: Stack, learnerIds: string[] = []): Promise<string> {
  if (s.file) {
    const db = new DatabaseSync(s.file, { readOnly: true });
    try {
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name);
      return tables.map((t) => JSON.stringify(db.prepare(`SELECT * FROM "${t}"`).all())).join(' ');
    } finally { db.close(); }
  }
  const out: unknown[] = [];
  for (const id of learnerIds) {
    out.push(await s.store.list({ learnerId: id, limit: 5000 }), await s.store.getKnowledge(id), await s.store.listDocuments(id), await s.store.listTombstones(id),
      await s.store.listEnrolments(id), await s.store.getLearner(id));
  }
  return JSON.stringify(out);
}

/** SQLite only: the row counts of the learner-owned tables (other learners' rows are not counted). */
export function rowCounts(s: Stack, learnerId: string): Record<string, number> | undefined {
  if (!s.file) return undefined;
  const db = new DatabaseSync(s.file, { readOnly: true });
  try {
    const out: Record<string, number> = {};
    for (const t of ['events', 'knowledge', 'documents', 'sessions', 'devices', 'enrolments', 'tombstones', 'preferences', 'team_members', 'accounts', 'learners']) {
      try { out[t] = (db.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE learner_id = ?`).get(learnerId) as { n: number }).n; } catch { /* a table without that column */ }
    }
    return out;
  } finally { db.close(); }
}

/** A team with members, directly in the store (there is no route that creates a team). */
export async function makeTeam(s: Stack, teamId: string, members: Array<{ who: Learner; role: 'member' | 'leader' }>): Promise<void> {
  await s.store.putTeam({ teamId, name: `Team ${teamId}`, createdAt: s.clock.now() });
  for (const m of members) await s.store.putTeamMember(teamId, m.who.learnerId, m.role, s.clock.now());
}

// ───────────────────────────── the network boundary ─────────────────────────────

export interface NetCall { method: string; path: string; outcome: 'ok' | 'network-error' | 'injected-status' | 'response-lost'; status?: number }

/**
 * A fetch to the service that can fail the way a network does. Order of rules on every request:
 *  1. `down`            → rejects with TypeError('Failed to fetch') (no connection); the server is not touched
 *  2. `status` (+ `statusTimes`) → answers that HTTP status without touching the server (a 503, a 401 from a proxy)
 *  3. `loseResponses`   → the server DOES process the request, then the response is lost (rejects): the lost-acknowledgement case
 *  4. otherwise         → the real handler
 */
export interface Net {
  fetch: typeof fetch;
  down: boolean;
  status?: number;
  statusTimes: number;
  loseResponses: number;
  calls: NetCall[];
  /** Calls whose path matched, e.g. `net.count('/sync/push')`. */
  count(path: string): number;
  reset(): void;
  api(token?: string): RepositoryApi;
}

export function createNet(s: Stack, baseUrl = 'http://repository.local'): Net {
  const net: Net = {
    down: false, status: undefined, statusTimes: 0, loseResponses: 0, calls: [],
    count: (path) => net.calls.filter((c) => c.path === path).length,
    reset() { net.down = false; net.status = undefined; net.statusTimes = 0; net.loseResponses = 0; net.calls.length = 0; },
    api: (token) => createRepositoryApi({ baseUrl, fetch: net.fetch, token }),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const path = new URL(req.url).pathname;
      if (net.down) { net.calls.push({ method: req.method, path, outcome: 'network-error' }); throw new TypeError('Failed to fetch'); }
      if (net.status !== undefined && net.statusTimes > 0) {
        net.statusTimes--;
        net.calls.push({ method: req.method, path, outcome: 'injected-status', status: net.status });
        return new Response(JSON.stringify({ error: 'unavailable', message: 'The service is unavailable.' }), { status: net.status, headers: { 'content-type': 'application/json' } });
      }
      const res = await handle(req, s.deps);
      if (net.loseResponses > 0) {
        net.loseResponses--;
        net.calls.push({ method: req.method, path, outcome: 'response-lost', status: res.status });
        throw new TypeError('Failed to fetch');
      }
      net.calls.push({ method: req.method, path, outcome: 'ok', status: res.status });
      return res;
    }) as typeof fetch,
  };
  return net;
}

// ───────────────────────────── a device with the real sync client ─────────────────────────────

/** The transport of the apps: the typed client's two sync calls, throwing on any failure (what GoReview and the extension do). */
export function transportOf(api: RepositoryApi): Transport {
  return {
    async push(req) { const r = await api.syncPush(req); if (!r.ok) throw new Error(`sync push refused: ${r.status} ${r.error}`); return r.data; },
    async pull(req) { const r = await api.syncPull(req); if (!r.ok) throw new Error(`sync pull refused: ${r.status} ${r.error}`); return r.data; },
  };
}

export interface Device {
  deviceId: string;
  who: Learner;
  area: KeyValueArea & { dump(): Record<string, unknown> };
  queue: LocalQueue;
  log: EventLog;
  docs: LocalDocuments;
  client: SyncClient;
  clock: { ms: number };
  /** The app's recording path: queue first (durable), then the local log. */
  record(events: GoEvent[]): Promise<void>;
}

/** One device of a learner: a memory key-value area (stands for chrome.storage / localStorage), the real queue, local log, documents and sync client. */
export function createDevice(who: Learner, net: Net, opts: { area?: KeyValueArea & { dump(): Record<string, unknown> }; clock?: { ms: number } } = {}): Device {
  const area = opts.area ?? createMemoryArea();
  const clock = opts.clock ?? { ms: Date.parse('2026-10-09T08:00:00.000Z') };
  const api = net.api(who.token);
  const queue = createLocalQueue(area, { now: () => clock.ms });
  const log = createLocalEventLog(area, { now: () => new Date(clock.ms).toISOString() });
  const docs = createLocalDocuments(area, { deviceId: who.deviceId, now: () => clock.ms });
  const client = createSyncClient({
    queue, local: log, transport: transportOf(api), deviceId: who.deviceId, now: () => clock.ms, documents: docs, random: () => 0.5,
    backoff: { baseMs: 1_000, maxMs: 60_000, factor: 2, jitter: 0 },
  });
  return {
    deviceId: who.deviceId, who, area, queue, log, docs, client, clock,
    async record(events) {
      for (const e of events) {
        const q = await queue.enqueue(e);
        if (!q.ok && q.reason !== 'duplicate') throw new Error(`enqueue refused: ${JSON.stringify(q)}`);
        await log.append(who.learnerId, [e]);
      }
    },
  };
}

/** Text of a value, for "this string appears nowhere" assertions. */
export const text = (v: unknown): string => JSON.stringify(v) ?? '';

/** Every event the service holds for the learner, in `seq` order. */
export async function serverEvents(s: Stack, learnerId: string): Promise<GoEvent[]> {
  const out: GoEvent[] = [];
  for (let afterSeq = 0; ;) {
    const page = await s.store.list({ learnerId, afterSeq, limit: 1000 });
    out.push(...page);
    if (page.length < 1000) return out;
    afterSeq = (page[page.length - 1] as { seq: number }).seq;
  }
}

/** The learner's knowledge rows reduced to what is comparable across learners (no ids, no timestamps of the engine itself). */
export async function comparableKnowledge(s: Stack, learnerId: string): Promise<unknown> {
  const rows = await s.store.getKnowledge(learnerId);
  return rows.map((k) => ({
    unitId: k.unitId, languageId: k.languageId,
    dimensions: k.dimensions, retention: k.retention, uncertainty: k.uncertainty, firstSeenAt: k.firstSeenAt, lastSeenAt: k.lastSeenAt,
    events: k.basis.events,
  })).sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
}

// ───────────────────────────── a GoReview device (the web app's context over the real service) ─────────────────────────────


export interface PracticeDevice {
  ctx: AppContext;
  area: KeyValueArea & { dump(): Record<string, unknown> };
  clock: { ms: number };
  /** The window events the app listens to (`online` / `offline`). */
  win: { online: boolean; fire(type: 'online' | 'offline'): void };
  changed: number;
}

/** GoReview's application context (session, per-learner prefixed storage, queue, local log, sync client) over the real service, with a device id of its own. */
export function createPracticeDevice(net: Net, opts: { area?: PracticeDevice['area']; clock?: { ms: number }; serviceUrl?: string; deviceName?: string } = {}): PracticeDevice {
  const area = opts.area ?? createMemoryArea();
  const clock = opts.clock ?? { ms: Date.parse('2026-10-09T08:00:00.000Z') };
  const listeners = new Map<string, Set<() => void>>();
  const win = {
    online: true,
    fire(type: 'online' | 'offline') { win.online = type === 'online'; for (const f of listeners.get(type) ?? []) f(); },
  };
  const fakeWindow = {
    get navigator() { return { onLine: win.online }; },
    addEventListener: (type: string, f: () => void) => { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(f); },
    removeEventListener: (type: string, f: () => void) => { listeners.get(type)?.delete(f); },
  } as unknown as Window;
  let ids = 0;
  const deps: Deps = {
    win: fakeWindow, doc: {} as Document, fetch: net.fetch, area, config: { serviceUrl: opts.serviceUrl ?? 'http://localhost:8790' },
    createApi: (baseUrl, token) => createRepositoryApi({ baseUrl, fetch: net.fetch, token }),
    engine: {} as Deps['engine'], audio: null, now: () => new Date(clock.ms), newId: () => `${opts.deviceName ?? 'dev'}${++ids}`, random: () => 0.5,
    appVersion: 'audit', autoSync: false, timers: { set: () => 0, clear: () => undefined },
  };
  const device: PracticeDevice = { ctx: undefined as unknown as AppContext, area, clock, win, changed: 0 };
  device.ctx = createContext(deps, { go: () => undefined, changed: () => { device.changed++; } });
  return device;
}

// ───────────────────────────── what is physically in the SQLite file ─────────────────────────────

/** SQLite only: the names of the tables that have a row containing `needle` (read through a second connection). */
export function tablesContaining(s: Stack, needle: string): string[] {
  if (!s.file) return [];
  const db = new DatabaseSync(s.file, { readOnly: true });
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name);
    return tables.filter((t) => JSON.stringify(db.prepare(`SELECT * FROM "${t}"`).all()).includes(needle));
  } finally { db.close(); }
}

/**
 * SQLite only: which of the needles are present as BYTES in the database file, its write-ahead log and its shared-memory file
 * (a logical DELETE does not overwrite them). `checkpoint` first folds the WAL into the main file, as a running service does
 * from time to time.
 */
export function bytesPresent(s: Stack, needles: string[], opts: { checkpoint?: boolean } = {}): Record<string, string[]> {
  if (!s.file) return {};
  if (opts.checkpoint) { const db = new DatabaseSync(s.file); try { db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get(); } finally { db.close(); } }
  const out: Record<string, string[]> = {};
  for (const suffix of ['', '-wal', '-shm']) {
    let buf: Buffer;
    try { buf = readFileSync(s.file + suffix); } catch { continue; }
    out[suffix || 'main'] = needles.filter((n) => buf.includes(n));
  }
  return out;
}

/** '' when the two values are deeply equal; otherwise a short description of the first difference found (path and both values). */
export function firstDifference(a: unknown, b: unknown, path = '$'): string {
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

// ───────────────────────────── a localStorage stand-in ─────────────────────────────

/** The `Storage` interface over a Map (the GoReview web app keeps everything in localStorage as JSON text); `raw` is the text as stored. */
export function fakeLocalStorage(): Storage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    get length() { return raw.size; },
    key: (i: number) => [...raw.keys()][i] ?? null,
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => { raw.set(k, String(v)); },
    removeItem: (k: string) => { raw.delete(k); },
    clear: () => { raw.clear(); },
  } as unknown as Storage & { raw: Map<string, string> };
}
