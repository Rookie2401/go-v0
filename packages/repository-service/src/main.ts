/// <reference types="node" />
/**
 * The Repository service on Node.
 *
 *   npx vite-node --config server/goread/vite.config.ts packages/repository-service/src/main.ts --port 8790 --data data/repository
 *
 * A thin bridge: node:http to the web `Request`/`Response` handler (handler.ts), the SQLite store (`<data>/repository.sqlite`) or, with DATABASE_URL, the
 * Postgres store, the projection engine, the linguistic service and the node:crypto password hashing. Operational settings (rate limits, proxy trust,
 * log format, metrics, mail, account policy) come from the environment: see ./config.ts and docs/ops/DEPLOY.md.
 * The real packages are loaded by dynamic import so this file is the only place that names them.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ConcreteStore } from '../../repository-store/src';
import { nodeCrypto } from './crypto-node';
import type { EmailSender, ServiceDeps } from './deps';
import type { Sample } from './metrics';
import { createMetricsRegistry } from './metrics';
import { handle } from './handler';
import { createChangeNotifier } from './notifier';
import type { ChangeNotifier } from './notifier';
import { adaptLinguistics } from './linguistics-adapter';
import { maybeGzip } from './compress';
import { serviceConfigFromEnv } from './config';
import type { ServiceConfig } from './config';
import { createRateLimiter, resolveClientIp } from './ratelimit';
import { mailerFromEnv } from './mailer';
import { runMaintenance } from './purge';

interface Args { port: number; data: string; host: string }

function parseArgs(argv: readonly string[]): Args {
  const out: Args = { port: 8790, data: 'data/repository', host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = (): string => {
      const v = inline ?? argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === '--port') {
      const v = value();
      const n = Number(v);
      if (!/^\d+$/.test(v) || n > 65535) throw new Error(`--port must be a whole number from 0 to 65535, not "${v}"`);
      out.port = n;
    } else if (flag === '--data') out.data = value();
    else if (flag === '--host') out.host = value();
    else if (flag === '--') continue;
    else throw new Error(`unknown argument "${a}" (use --port, --data, --host)`);
  }
  return out;
}

/** The socket address each request arrived on. A header never decides it; only `resolveClientIp` may read X-Forwarded-For, and only with TRUST_PROXY. */
const peers = new WeakMap<Request, string>();

/** node:http request to a web Request. The body is a pull stream, so an unread or over-long body is never buffered. */
function toRequest(req: IncomingMessage, host: string, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else if (v !== undefined) headers.set(k, v);
  }
  const url = `http://${req.headers.host ?? host}${req.url ?? '/'}`;
  const method = req.method ?? 'GET';
  const remember = (r: Request): Request => { if (req.socket.remoteAddress) peers.set(r, req.socket.remoteAddress); return r; };
  if (method === 'GET' || method === 'HEAD') return remember(new Request(url, { method, headers, signal }));
  let finished = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      req.on('data', (chunk: Buffer) => { if (!finished) { controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length)); req.pause(); } });
      req.on('end', () => { if (!finished) { finished = true; controller.close(); } });
      req.on('error', (e) => { if (!finished) { finished = true; controller.error(e); } });
      req.pause();
    },
    pull() { req.resume(); },
    cancel() { finished = true; req.removeAllListeners('data'); req.resume(); },
  });
  return remember(new Request(url, { method, headers, body, signal, duplex: 'half' } as RequestInit));
}

async function send(res: ServerResponse, response: Response, acceptEncoding: string | undefined): Promise<void> {
  let headers: Record<string, string> = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  let payload: Buffer = Buffer.from(await response.arrayBuffer());
  if (response.status !== 204 && response.status !== 304) ({ payload, headers } = await maybeGzip(payload, headers, acceptEncoding));
  res.writeHead(response.status, headers);
  res.end(response.status === 204 || response.status === 304 ? undefined : payload);
}

type Stats = Awaited<ReturnType<NonNullable<ConcreteStore['stats']>>>;

/** Gauges produced when Prometheus scrapes: the store's counters and the process. Cached briefly so a scrape every few seconds costs the database nothing. */
function collector(store: ConcreteStore, notifier: ChangeNotifier, startedAt: number, storeKind: string): () => Promise<Sample[]> {
  let cached: { at: number; stats: Stats | undefined } | undefined;
  const stats = async (): Promise<Stats | undefined> => {
    if (!cached || Date.now() - cached.at > 15_000) cached = { at: Date.now(), stats: await store.stats?.().catch(() => undefined) };
    return cached.stats;
  };
  return async () => {
    const st = await stats();
    const mem = process.memoryUsage();
    const out: Sample[] = [
      { name: 'go_repository_build_info', help: 'Constant 1, labelled with the store in use.', type: 'gauge', value: 1, labels: { store: storeKind } },
      { name: 'go_repository_uptime_seconds', help: 'Seconds since the service started.', type: 'gauge', value: Math.floor((Date.now() - startedAt) / 1000) },
      { name: 'go_repository_sync_waiters', help: 'Held POST /sync/wait requests.', type: 'gauge', value: notifier.size() },
      { name: 'process_resident_memory_bytes', help: 'Resident memory of the service process.', type: 'gauge', value: mem.rss },
      { name: 'nodejs_heap_used_bytes', help: 'V8 heap in use.', type: 'gauge', value: mem.heapUsed },
    ];
    if (st) {
      out.push(
        { name: 'go_repository_events_issued_total', help: "Events ever stored (the sum of the learners' head sequences; it does not fall when events are deleted).", type: 'counter', value: st.eventsIssued },
        { name: 'go_repository_learners', help: 'Learners held.', type: 'gauge', value: st.learners },
        { name: 'go_repository_accounts', help: 'Accounts held.', type: 'gauge', value: st.accounts },
      );
      if (st.sizeBytes !== undefined) out.push({ name: 'go_repository_store_size_bytes', help: 'Size of the database (the SQLite file with its log, or the Postgres database).', type: 'gauge', value: st.sizeBytes });
      if (st.schemaVersion !== undefined) out.push({ name: 'go_repository_schema_version', help: 'Newest applied migration.', type: 'gauge', value: st.schemaVersion });
    }
    return out;
  };
}

/** Opens the store the environment selects: Postgres with DATABASE_URL, otherwise the SQLite file in the data directory. */
async function openStore(dataDir: string, cfg: ServiceConfig, now: () => string): Promise<{ store: ConcreteStore; kind: 'postgres' | 'sqlite' }> {
  const stores = await import('../../repository-store/src');
  if (cfg.databaseUrl) {
    const pool = await stores.createPgPool(cfg.databaseUrl, { onError: (e) => console.error(`repository: postgres connection error: ${e.message}`) });
    return { store: await stores.openPostgresStore(pool, { now }), kind: 'postgres' };
  }
  return { store: stores.openSqliteStore(join(dataDir, 'repository.sqlite'), { now }), kind: 'sqlite' };
}

/** Wires the sibling packages. They are loaded here and nowhere else in the service. */
async function wire(dataDir: string, cfg: ServiceConfig): Promise<{ deps: ServiceDeps; close: () => Promise<void>; maintain: () => Promise<void>; mailer: EmailSender }> {
  mkdirSync(dataDir, { recursive: true });
  const now = (): string => new Date().toISOString();
  const startedAt = Date.now();
  const { createProjectionEngine } = await import('../../repository-engine/src');
  const { createLinguisticService } = await import('../../repository-linguistics/src');
  const { policyFor } = await import('./sourcePolicy');
  const { store, kind } = await openStore(dataDir, cfg, now);
  const engine = createProjectionEngine({ store, now });
  const linguistics = adaptLinguistics(createLinguisticService(store, { now }));
  const notifier = createChangeNotifier();
  const mailer = mailerFromEnv(process.env, join(dataDir, 'outbox'), (line) => console.log(line));
  const registry = createMetricsRegistry();
  const deps: ServiceDeps = {
    store, engine, linguistics, crypto: nodeCrypto, sourcePolicy: policyFor, now, notifier, log: (line) => console.log(line),
    logFormat: cfg.logFormat,
    ...(cfg.limits ? { limiter: createRateLimiter(cfg.limits) } : {}),
    clientIp: (request) => resolveClientIp(peers.get(request), request.headers, cfg.trustProxy),
    metrics: { registry, ...(cfg.metricsToken ? { token: cfg.metricsToken } : {}), collect: collector(store, notifier, startedAt, kind) },
    info: { storeKind: kind, startedAt, schemaVersion: async () => (await store.stats?.())?.schemaVersion },
    mailer,
    accountPolicy: {
      graceDays: cfg.graceDays,
      deleteGraceDays: cfg.deleteGraceDays,
      // mandatory only where a confirmation mail can actually reach a person; a file or console sink cannot
      requireVerification: cfg.requireVerification ?? mailer.delivers,
      ...(cfg.verifyUrl ? { verifyUrl: cfg.verifyUrl } : {}), ...(cfg.resetUrl ? { resetUrl: cfg.resetUrl } : {}), ...(cfg.serviceName ? { serviceName: cfg.serviceName } : {}),
    },
  };
  const maintain = async (): Promise<void> => {
    try {
      const r = await runMaintenance(store, { now, log: (line) => console.log(line) });
      if (r.purged + r.sessionsPruned + r.tokensPruned + r.securityEventsPruned > 0) console.log(`maintenance: purged=${r.purged} sessions=${r.sessionsPruned} tokens=${r.tokensPruned} securityEvents=${r.securityEventsPruned}`);
    } catch (e) {
      console.error(`maintenance failed: ${(e as { code?: string }).code ?? (e as Error).name}`);
    }
  };
  return { deps, close: () => { notifier.closeAll(); return store.close(); }, maintain, mailer };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = serviceConfigFromEnv(process.env);
  const { deps, close, maintain, mailer } = await wire(resolve(args.data), cfg);

  if (!mailer.delivers) console.log(`repository: email is not configured (SMTP_URL or RESEND_API_KEY); messages go to the ${mailer.kind} sink and email verification is not enforced`);
  if (!cfg.limits) console.log('repository: rate limiting is OFF (RATE_LIMIT=off)');
  if (cfg.trustProxy !== false && args.host !== '127.0.0.1' && args.host !== '::1') console.log('repository: warning: TRUST_PROXY is on but the service listens beyond the local machine; a client could forge the proxy header. Listen on 127.0.0.1 behind the proxy.');
  if (cfg.purgeOnBoot) await maintain();
  const timer = cfg.purgeIntervalMinutes > 0 ? setInterval(() => { void maintain(); }, cfg.purgeIntervalMinutes * 60_000) : undefined;
  timer?.unref();

  const server = createServer((req, res) => {
    // a client that goes away (a phone that lost its network) ends its held /sync/wait request instead of leaving it to the timeout
    const gone = new AbortController();
    res.on('close', () => { if (!res.writableFinished) gone.abort(); });
    handle(toRequest(req, args.host, gone.signal), deps) // logs its own line: METHOD /path status ms
      .then(async (response) => {
        await send(res, response, req.headers['accept-encoding']);
        req.removeAllListeners('data');
        req.resume(); // whatever of the body was not read is let go
      })
      .catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    if (timer) clearInterval(timer);
    deps.notifier?.closeAll(); // held /sync/wait requests answer changed:false now, so the server can close
    server.close(() => { void close(); process.exit(0); });
    server.closeAllConnections();
    setTimeout(() => { void close(); process.exit(0); }, 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('error', (e) => { console.error(`repository: ${e.message}`); void close(); process.exit(1); });
  server.listen(args.port, args.host, () => {
    const { port } = server.address() as AddressInfo;
    console.log(`repository listening on http://${args.host}:${port}`);
  });
}

main().catch((e) => { console.error(`repository: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
