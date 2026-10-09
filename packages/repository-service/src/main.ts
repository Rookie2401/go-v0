/// <reference types="node" />
/**
 * The Repository service on Node.
 *
 *   npx vite-node --config server/goread/vite.config.ts packages/repository-service/src/main.ts --port 8790 --data data/repository
 *
 * A thin bridge: node:http to the web `Request`/`Response` handler (handler.ts), the SQLite store
 * (`<data>/repository.sqlite`), the projection engine, the linguistic service and the node:crypto password hashing.
 * The real packages are loaded by dynamic import so this file is the only place that names them.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nodeCrypto } from './crypto-node';
import type { ServiceDeps } from './deps';
import { handle } from './handler';
import { adaptLinguistics } from './linguistics-adapter';

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

/** node:http request to a web Request. The body is a pull stream, so an unread or over-long body is never buffered. */
function toRequest(req: IncomingMessage, host: string): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else if (v !== undefined) headers.set(k, v);
  }
  const url = `http://${req.headers.host ?? host}${req.url ?? '/'}`;
  const method = req.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method, headers });
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
  return new Request(url, { method, headers, body, duplex: 'half' } as RequestInit);
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  const payload = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, headers);
  res.end(response.status === 204 ? undefined : payload);
}

/** Wires the sibling packages. They are loaded here and nowhere else in the service. */
async function wire(dataDir: string): Promise<{ deps: ServiceDeps; close: () => Promise<void> }> {
  mkdirSync(dataDir, { recursive: true });
  const now = (): string => new Date().toISOString();
  const { openSqliteStore } = await import('../../repository-store/src');
  const { createProjectionEngine } = await import('../../repository-engine/src');
  const { createLinguisticService } = await import('../../repository-linguistics/src');
  const store = openSqliteStore(join(dataDir, 'repository.sqlite'), { now });
  const engine = createProjectionEngine({ store, now });
  const linguistics = adaptLinguistics(createLinguisticService(store, { now }));
  return { deps: { store, engine, linguistics, crypto: nodeCrypto, now, log: (line) => console.log(line) }, close: () => store.close() };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { deps, close } = await wire(resolve(args.data));

  const server = createServer((req, res) => {
    handle(toRequest(req, args.host), deps) // logs its own line: METHOD /path status ms
      .then(async (response) => {
        await send(res, response);
        req.removeAllListeners('data');
        req.resume(); // whatever of the body was not read is let go
      })
      .catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
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
