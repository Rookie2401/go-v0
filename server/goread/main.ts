/**
 * The GoRead team server (contract: docs/goread/BACKEND.md).
 *
 *   npx vite-node server/goread/main.ts --port 8787 --data data/goread
 *
 * Open teams: every course of the app is a team; there are no codes and nothing to configure.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { createAdapterRegistry } from '../../src/adapters/index.ts';
import { COURSES } from '../../src/core/config.ts';
import { createGoreadHandler } from './app.ts';
import { openStore } from './store.ts';

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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dir = resolve(args.data);
  const store = openStore(dir);

  const handler = createGoreadHandler({ store, registry: createAdapterRegistry(), courses: COURSES });
  const server = createServer((req, res) => {
    const started = Date.now();
    const method = req.method ?? '-';
    const path = (req.url ?? '/').split('?')[0];
    res.on('close', () => console.log(`${method} ${path} ${res.statusCode} ${Date.now() - started}ms`));
    handler(req, res);
  });

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    server.close(() => { store.close(); process.exit(0); });
    server.closeAllConnections();
    setTimeout(() => { store.close(); process.exit(0); }, 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('error', (e) => { console.error(`goread: ${e.message}`); store.close(); process.exit(1); });
  server.listen(args.port, args.host, () => {
    const { port } = server.address() as AddressInfo;
    console.log(`goread listening on http://${args.host}:${port}`);
  });
}

try { main(); } catch (e) { console.error(`goread: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); }
