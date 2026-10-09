/**
 * Shared harness for the security audit: the Repository service over the REAL stack (the memory or the SQLite store, the
 * real projection engine, the real linguistic service), driven through `createInProcessApi` / raw `Request`s. The password
 * hash is the fast test hash by default (scrypt is exercised by its own test).
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { albanianPack, createLinguisticService } from '../../packages/repository-linguistics/src';
import { createMemoryStore, openSqliteStore } from '../../packages/repository-store/src';
import type { ConcreteStore } from '../../packages/repository-store/src';
import { createInProcessApi, type RepositoryApi, type ServiceDeps } from '../../packages/repository-service/src';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';

export type StoreKind = 'memory' | 'sqlite';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
/** A fast, deterministic stand-in for scrypt with the same interface (the tests that matter for scrypt use nodeCrypto). */
export const fastCrypto = {
  calls: { hash: 0, verify: 0 },
  async hashPassword(pw: string) { fastCrypto.calls.hash++; return `fast$${sha(`salt:${pw}`)}`; },
  async verifyPassword(pw: string, hash: string) { fastCrypto.calls.verify++; return hash === `fast$${sha(`salt:${pw}`)}`; },
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
  api(token?: string): RepositoryApi;
  close(): Promise<void>;
  /** SQLite only: the database file, so the raw rows can be read by a second connection. */
  file?: string;
}

export function createStack(kind: StoreKind, opts: { crypto?: ServiceDeps['crypto'] } = {}): Stack {
  const clock = createClock();
  const dir = kind === 'sqlite' ? mkdtempSync(join(tmpdir(), 'go-sec-')) : undefined;
  const file = dir ? join(dir, 'repo.sqlite') : undefined;
  const store = kind === 'memory' ? createMemoryStore({ now: clock.now }) : openSqliteStore(file!, { now: clock.now });
  const engine = createProjectionEngine({ store, now: clock.now });
  const linguistics = adaptLinguistics(createLinguisticService(store, { now: clock.now }));
  const logs: string[] = [];
  const deps: ServiceDeps = { store, engine, linguistics, crypto: opts.crypto ?? fastCrypto, now: clock.now, log: (l) => logs.push(l) };
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
export async function signUp(s: Stack, email: string, deviceId = `dev-${email.split('@')[0]}`): Promise<Learner> {
  const api = s.api();
  const made = await api.createAccount({ email, password: PASSWORD, displayName: email.split('@')[0] });
  if (!made.ok) throw new Error(`createAccount ${made.status} ${made.error}`);
  const session = await api.createSession({ email, password: PASSWORD, deviceId, platform: 'test' });
  if (!session.ok) throw new Error(`createSession ${session.status} ${session.error}`);
  const pack = albanianPack();
  const enrolled = await api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] });
  if (!enrolled.ok) throw new Error(`enrol ${enrolled.status} ${enrolled.error}`);
  return { api, email, password: PASSWORD, deviceId, learnerId: made.data.learnerId, accountId: made.data.accountId, token: session.data.token, enrolmentId: enrolled.data.enrolment.enrolmentId };
}

let counter = 0;
/** A valid reader event (SelectionLookedUp, producer golearn-ext) for the learner. */
export function lookup(who: Pick<Learner, 'learnerId' | 'enrolmentId' | 'deviceId'>, over: Partial<GoEvent> = {}): GoEvent {
  counter++;
  return {
    id: `sec-${counter}-${randomBytes(4).toString('hex')}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq',
    at: '2026-10-09T07:59:00.000Z', producer: { app: 'golearn-ext', version: '1', deviceId: who.deviceId }, kind: 'SelectionLookedUp',
    subject: { itemIds: ['form:sq:shtëpinë'], sentenceKey: 'ab12' },
    payload: { surface: 'shtëpinë', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] }, ...over,
  };
}

/** A writing observation (ProductionRecorded, the /writing route's kind). */
export function production(who: Pick<Learner, 'learnerId' | 'enrolmentId' | 'deviceId'>, over: Partial<GoEvent> = {}): GoEvent {
  return lookup(who, {
    kind: 'ProductionRecorded', producer: { app: 'gopractice-tell', version: '1', deviceId: who.deviceId }, subject: { itemIds: ['lemma:sq:libër:NOUN'], draftId: 'd1' },
    payload: { mode: 'free', assisted: false, assistance: [], usedCorrectly: 'unjudged', draftId: 'd1', wordCount: 4 }, ...over,
  });
}

/** A card-review event (the review route's family). */
export function review(who: Pick<Learner, 'learnerId' | 'enrolmentId' | 'deviceId'>, over: Partial<GoEvent> = {}): GoEvent {
  counter++;
  return {
    id: `sec-r-${counter}-${randomBytes(4).toString('hex')}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq',
    at: '2026-10-09T07:59:00.000Z', producer: { app: 'gopractice-review', version: '1', deviceId: who.deviceId }, kind: 'CardReviewed',
    subject: { itemIds: ['lemma:sq:libër:NOUN'], cardId: 'c1' }, payload: { cardKind: 'recall', grade: 'good', correct: true, hinted: false }, ...over,
  };
}

export interface Raw { status: number; body: Record<string, any>; headers: Headers; text: string }
/** A raw request to the handler: no client in between, so headers, content types and odd bodies reach the service as sent. */
export async function raw(s: Stack, method: string, path: string, opts: { token?: string; body?: unknown; rawBody?: string | Uint8Array; headers?: Record<string, string>; stream?: ReadableStream<Uint8Array> } = {}): Promise<Raw> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const payload = opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
  const init: RequestInit & { duplex?: string } = { method, headers };
  if (opts.stream) { init.body = opts.stream; init.duplex = 'half'; } else if (payload !== undefined) init.body = payload as BodyInit;
  const res = await handle(new Request(`http://repository.local${path}`, init), s.deps);
  const text = res.status === 204 ? '' : await res.text();
  let body: Record<string, any> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: res.status, body, headers: res.headers, text };
}

/**
 * Everything the store holds, as text. SQLite: every row of every table, read through a second connection to the file
 * (password hashes and token hashes included). Memory: what the port can list for the given learners.
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

export { nodeCrypto };
