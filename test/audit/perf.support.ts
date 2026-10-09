/**
 * Shared support for the PERFORMANCE audit (docs/ecosystem/audit/PERFORMANCE.md). Nothing here is imported by production code.
 *
 * What it gives the lanes: a stopwatch with median / p95 statistics, a row collector that prints a table and (when
 * PERF_ROWS_DIR is set) writes the rows of each file to JSON so the report is generated from what was observed, the real
 * Repository service (in-process over the REAL stack, or over a real HTTP socket), sign-up, event builders, and a disk-backed
 * `fetch` for the dictionary shards under public/.
 *
 * The assertions in the lanes are LOOSE sanity bounds (an order of magnitude above what a slow machine shows) so a busy
 * PC never makes them flake. The numbers are the product; the bounds only catch a regression of a different kind.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll } from 'vitest';
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createRepositoryApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';

// ───────────────────────────── statistics ─────────────────────────────

export interface Stats { n: number; median: number; p95: number; min: number; max: number; mean: number }

/** Nearest-rank percentile of an ascending list. */
const rank = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];

export function stats(samples: number[]): Stats {
  if (!samples.length) throw new Error('no samples');
  const s = [...samples].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { n: s.length, median, p95: rank(s, 0.95), min: s[0], max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length };
}

export const now = (): number => performance.now();

/** Times `fn` `n` times after `warm` untimed runs. Returns the per-run milliseconds. */
export async function sample(n: number, fn: (i: number) => unknown | Promise<unknown>, warm = 0): Promise<number[]> {
  for (let i = 0; i < warm; i++) await fn(-1 - i);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = now();
    await fn(i);
    out.push(now() - t0);
  }
  return out;
}

/** Times ONE run of `fn` in milliseconds. */
export async function once(fn: () => unknown | Promise<unknown>): Promise<number> {
  const t0 = now();
  await fn();
  return now() - t0;
}

// ───────────────────────────── rows ─────────────────────────────

export interface PerfRow {
  /** Stable id of the measurement (PF-M01 …) used by the report. */
  id: string;
  what: string;
  /** What exactly was timed, in a phrase (the boundaries of the stopwatch). */
  scope: string;
  unit: 'ms' | 'KB' | 'B' | 'ops/s';
  n: number;
  median: number;
  p95: number;
  min: number;
  max: number;
  note?: string;
}

const rows: PerfRow[] = [];
const fmt = (x: number): string => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3));

export function record(id: string, what: string, scope: string, samples: number[], note?: string): PerfRow {
  const s = stats(samples);
  const row: PerfRow = { id, what, scope, unit: 'ms', n: s.n, median: s.median, p95: s.p95, min: s.min, max: s.max, ...(note ? { note } : {}) };
  rows.push(row);
  return row;
}

/** A measurement that is a single figure (a size, a count). */
export function recordValue(id: string, what: string, scope: string, value: number, unit: PerfRow['unit'], note?: string): PerfRow {
  const row: PerfRow = { id, what, scope, unit, n: 1, median: value, p95: value, min: value, max: value, ...(note ? { note } : {}) };
  rows.push(row);
  return row;
}

export function table(title: string, which: PerfRow[] = rows): string {
  const head = `| id | measurement | N | median | p95 | min | max |\n|---|---|---:|---:|---:|---:|---:|`;
  const body = which.map((r) => `| ${r.id} | ${r.what} | ${r.n} | ${fmt(r.median)} ${r.unit} | ${fmt(r.p95)} ${r.unit} | ${fmt(r.min)} | ${fmt(r.max)} |`).join('\n');
  return `\n${title}\n${head}\n${body}\n`;
}

/** Call once at the top level of a lane: prints the rows of the file after it ran and writes them when PERF_ROWS_DIR is set. */
export function flushRowsAfterAll(file: string, title: string): void {
  afterAll(() => {
    console.log(table(`${title} (${machine().summary})`));
    const dir = process.env.PERF_ROWS_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${file}.json`), JSON.stringify({ machine: machine(), rows }, null, 1));
  });
}

export function machine(): { summary: string; node: string; os: string; cpu: string; cores: number; memGB: number } {
  const cpus = os.cpus();
  const cpu = cpus[0]?.model?.trim() ?? 'unknown';
  const memGB = Math.round((os.totalmem() / 2 ** 30) * 10) / 10;
  return { summary: `node ${process.version}, ${os.type()} ${os.release()}, ${cpu}, ${cpus.length} logical cores, ${memGB} GB`, node: process.version, os: `${os.type()} ${os.release()}`, cpu, cores: cpus.length, memGB };
}

// ───────────────────────────── disk-backed dictionary fetch ─────────────────────────────

export const REPO = path.resolve(__dirname, '../..');
export const PUBLIC_DIR = path.join(REPO, 'public');
export const MIGRATIONS = path.join(REPO, 'packages/repository-store/migrations');

/** `fetch` for `dict/<lang>/…` files straight from public/ (what the extension's `web_accessible_resources` serve in the browser). */
export const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(PUBLIC_DIR, decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 });
}) as typeof fetch;

// ───────────────────────────── the Repository service ─────────────────────────────

export const PASSWORD = 'correct horse battery staple';

export interface Service {
  /** Base URL when the service is reached over HTTP; the in-process stack uses a placeholder host. */
  baseUrl: string;
  fetch: typeof fetch;
  close(): Promise<void>;
  /** How the service is reached: 'in-process' (handler called directly), 'http (in-test server)' or 'http (separate process)'. */
  mode: string;
  deps?: ServiceDeps;
}

/** The real service stack on the SQLite store (in memory), driven by calling the handler directly: no sockets. */
export function inProcessService(): Service {
  const store = openSqliteStore(':memory:', { migrationsDir: MIGRATIONS });
  const nowIso = (): string => new Date().toISOString();
  const engine = createProjectionEngine({ store, now: nowIso });
  const deps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now: nowIso })), crypto: nodeCrypto, now: nowIso, log: () => {} };
  return {
    baseUrl: 'http://repository.local', mode: 'in-process', deps,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init), deps)) as typeof fetch,
    close: async () => { await store.close(); },
  };
}

/** node:http request → web Request, the same bridge `packages/repository-service/src/main.ts` uses. */
function toRequest(req: IncomingMessage, host: string): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else if (v !== undefined) headers.set(k, v);
  }
  const url = `http://${req.headers.host ?? host}${req.url ?? '/'}`;
  const method = req.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method, headers });
  const chunks: Buffer[] = [];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => { controller.enqueue(new Uint8Array(Buffer.concat(chunks))); controller.close(); });
      req.on('error', (e) => controller.error(e));
    },
  });
  return new Request(url, { method, headers, body, duplex: 'half' } as RequestInit);
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  const payload = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, headers);
  res.end(response.status === 204 ? undefined : payload);
}

/** The service over a REAL loopback socket: the same handler served by a node:http server inside the test, on an ephemeral port. */
export async function httpInTest(): Promise<Service> {
  const inner = inProcessService();
  const server: Server = createServer((req, res) => {
    handle(toRequest(req, '127.0.0.1'), inner.deps!).then((r) => send(res, r)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`, fetch: globalThis.fetch, mode: 'http (server inside the test process, SQLite :memory:)',
    close: async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); await inner.close(); },
  };
}

/**
 * The separate `packages/repository-service/src/main.ts` process the auditor started (SQLite FILE, its own Node process),
 * reached when PERF_SERVICE_URL is set (e.g. http://127.0.0.1:8791); undefined otherwise.
 */
export function externalService(): Service | undefined {
  const url = process.env.PERF_SERVICE_URL;
  return url ? { baseUrl: url.replace(/[/]+$/u, ''), fetch: globalThis.fetch, close: async () => {}, mode: 'http (separate main.ts process, SQLite file)' } : undefined;
}

export interface Who { api: RepositoryApi; learnerId: string; enrolmentId: string; token: string; deviceId: string; email: string }
const must = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => { if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)}`); return r.data as T; };
let accountCounter = 0;

/** Creates an account (real scrypt), signs in on a device, enrols in Albanian. */
export async function signUp(svc: Service, label: string, deviceId = `dev-${label}`): Promise<Who> {
  const email = `${label}-${Date.now().toString(36)}-${++accountCounter}@perf.test`;
  const anon = createRepositoryApi({ baseUrl: svc.baseUrl, fetch: svc.fetch });
  must(await anon.createAccount({ email, password: PASSWORD }));
  const s = must<{ token: string; learnerId: string }>(await anon.createSession({ email, password: PASSWORD, deviceId, platform: 'perf' }));
  const api = createRepositoryApi({ baseUrl: svc.baseUrl, fetch: svc.fetch, token: s.token });
  const e = must<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }] }));
  return { api, learnerId: s.learnerId, enrolmentId: e.enrolment.enrolmentId, token: s.token, deviceId, email };
}

export { must };

// ───────────────────────────── events ─────────────────────────────

let n = 0;
/** A valid reader event (SelectionLookedUp, golearn-ext) for the learner; unique id. */
export function lookupEvent(who: Pick<Who, 'learnerId' | 'enrolmentId' | 'deviceId'>, unit = 'lemma:sq:libër:NOUN', over: Partial<GoEvent> = {}): GoEvent {
  n++;
  const surface = unit.split(':')[2] ?? 'libër';
  return {
    id: `pf-${Date.now().toString(36)}-${n}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq',
    at: new Date(Date.UTC(2026, 9, 9, 8, 0, 0) + n * 1000).toISOString(), producer: { app: 'golearn-ext', version: 'perf', deviceId: who.deviceId },
    kind: 'SelectionLookedUp', subject: { itemIds: [unit], sentenceKey: `k${n % 97}` },
    payload: { surface, tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'web-generic', helpShown: ['lemma'] }, ...over,
  };
}

/** A card-review event (the review family). */
export function reviewEvent(who: Pick<Who, 'learnerId' | 'enrolmentId' | 'deviceId'>, unit: string, correct: boolean, over: Partial<GoEvent> = {}): GoEvent {
  n++;
  return {
    id: `pf-r-${Date.now().toString(36)}-${n}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq',
    at: new Date(Date.UTC(2026, 9, 9, 8, 0, 0) + n * 1000).toISOString(), producer: { app: 'gopractice-review', version: 'perf', deviceId: who.deviceId },
    kind: 'CardReviewed', subject: { itemIds: [unit], cardId: `card:${unit}` },
    payload: { cardKind: 'recognition', grade: correct ? 'good' : 'again', correct, hinted: false }, ...over,
  };
}

// ───────────────────────────── Albanian fixtures ─────────────────────────────

export const SENTENCE = 'Fëmijët lexojnë librin e mirë në kuzhinë.';
export const WORD = 'librin';
export const PHRASE_4 = 'librin e mirë në kuzhinë';
/** A 40-word Albanian sentence (words from the reference passages, joined; not meant to be literary). */
export const SENTENCE_40 = ('Fëmijët lexojnë librin. Nëna është në kuzhinë dhe ai pi çajin e ngrohtë ndërsa unë shkoj te shkolla e madhe me shokët e mi '
  + 'dhe ne lexojmë një libër të vjetër për qytetin tonë të bukur që ka shumë rrugë të gjata').split(/\s+/u).slice(0, 40).join(' ');
export const ALBANIAN_2 = 'Unë shkoj te libri. Unë lexoj librin e ri në shtëpi.';
export const ALBANIAN_10 = [
  'Unë shkoj te libri.', 'Nëna është në kuzhinë.', 'Ai lexon një libër të mirë.', 'Ne pimë çaj në mëngjes.', 'Fëmijët shkojnë në shkollë çdo ditë.',
  'Unë e dua shtëpinë time.', 'Ata hanë bukë dhe djathë.', 'Motra ime ka një mik të ri.', 'Dje ne ishim në qytet.', 'Nesër unë do të lexoj përsëri.',
].join(' ');
export const PERF_LOCAL_NOTE = 'timings are wall-clock `performance.now()` on this machine; the lane asserts only loose bounds';
