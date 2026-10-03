/**
 * The GoRead team server on Node (contract: docs/goread/BACKEND.md).
 *
 *   npx vite-node server/goread/main.ts --port 8787 --data data/goread
 *
 * A thin bridge: node:http to the web `Request`/`Response` handler (handler.ts), the sqlite store, and the FULL document
 * check (the validator with every language adapter). Every course of the app is a team; reading is open, adding needs a
 * contributor key (`server/goread/admin.ts` keeps the list). Nothing to configure but the port and the data directory.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { COURSES } from '../../src/core/config.ts';
import { fullCheck } from './check-full.ts';
import { handle } from './handler.ts';
import { openSqliteStore } from './store-sqlite.ts';

interface Args { port: number; data: string; host: string }

function parseArgs(argv: readonly string[]): Args {
  const out: Args = { port: 8787, data: 'data/goread', host: '127.0.0.1' };
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const store = openSqliteStore(resolve(args.data));
  const deps = { store, courses: COURSES, check: fullCheck };

  const server = createServer((req, res) => {
    const started = Date.now();
    const method = req.method ?? '-';
    const path = (req.url ?? '/').split('?')[0];
    res.on('close', () => console.log(`${method} ${path} ${res.statusCode} ${Date.now() - started}ms`));
    handle(toRequest(req, args.host), deps)
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
    server.close(() => { void store.close(); process.exit(0); });
    server.closeAllConnections();
    setTimeout(() => { void store.close(); process.exit(0); }, 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('error', (e) => { console.error(`goread: ${e.message}`); void store.close(); process.exit(1); });
  server.listen(args.port, args.host, () => {
    const { port } = server.address() as AddressInfo;
    console.log(`goread listening on http://${args.host}:${port}`);
  });
}

try { main(); } catch (e) { console.error(`goread: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); }
