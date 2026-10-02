/**
 * The GoRead team server (contract: docs/goread/BACKEND.md).
 *
 *   npx vite-node server/goread/main.ts --port 8787 --data data/goread
 *
 * Team codes come from the environment (`GOREAD_TEAM_CODES=honduras-es=…,thailand-th=…`) and from `<data>/team-codes.json`
 * (`{ "honduras-es": "…" }`); the environment wins where both name a course. The program never prints, logs or returns a code.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createAdapterRegistry } from '../../src/adapters/index.ts';
import { COURSES } from '../../src/core/config.ts';
import { createGoreadHandler } from './app.ts';
import { openStore } from './store.ts';

export const TEAM_CODES_FILE = 'team-codes.json';
const MIN_CODE_LENGTH = 12;

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

/** `course=code` pairs separated by commas; the code is everything after the first "=". */
function parseEnvCodes(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (raw ?? '').split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const course = pair.slice(0, eq).trim();
    const code = pair.slice(eq + 1).trim();
    if (course && code) out[course] = code;
  }
  return out;
}

function readCodesFile(dir: string): Record<string, string> {
  const file = join(dir, TEAM_CODES_FILE);
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error(`${file} is not valid JSON; expected { "honduras-es": "<code>" }`); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${file} must be a JSON object { "<course id>": "<code>" }`);
  const out: Record<string, string> = {};
  for (const [course, code] of Object.entries(parsed)) if (typeof code === 'string' && code.trim()) out[course] = code.trim();
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dir = resolve(args.data);
  const store = openStore(dir);
  const codes = { ...readCodesFile(dir), ...parseEnvCodes(process.env.GOREAD_TEAM_CODES) };

  const known = new Set(COURSES.map((c) => c.id));
  const open = Object.keys(codes).filter((c) => known.has(c));
  for (const c of Object.keys(codes)) if (!known.has(c)) console.error(`goread: ignoring a team code for "${c}": not a course of this app`);
  for (const c of open) if (codes[c].length < MIN_CODE_LENGTH) console.error(`goread: the code for "${c}" is short (under ${MIN_CODE_LENGTH} characters); anyone who guesses it can read and add texts`);
  if (open.length === 0) console.error(`goread: no team codes found (GOREAD_TEAM_CODES or ${join(dir, TEAM_CODES_FILE)}); every team is closed`);

  const handler = createGoreadHandler({ store, codes, registry: createAdapterRegistry(), courses: COURSES });
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
