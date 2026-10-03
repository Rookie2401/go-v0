/**
 * The keeper's commands for the GoRead whitelist (the program is admin.ts; this is the logic, so tests can drive it).
 *
 *   whitelist add    --team <course> --name "<name>"   makes a key, shows it ONCE, keeps only its sha256
 *   whitelist list   --team <course>                   names, dates, revoked or not; never a key
 *   whitelist revoke --team <course> --name "<name>"   the person's texts stay
 *
 * Where: `--data <dir>` (the local sqlite file; default data/goread) or `--sql` (print SQL for the Cloudflare database
 * on stdout, to feed to `wrangler d1 execute`; the key is still made here and goes to stderr).
 */
import { resolve } from 'node:path';
import { COURSES } from '../../src/core/config.ts';
import { sha256Hex } from './handler.ts';
import { openSqliteStore } from './store-sqlite.ts';

export interface AdminIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

export interface AdminOptions {
  now?: () => string;
  /** A fresh 32-byte key as base64url; default: 32 bytes from `crypto.getRandomValues`. */
  newKey?: () => string;
}

export function makeKey(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

const USAGE = `usage:
  whitelist add    --team <course> --name "<name>" [--data <dir> | --sql]
  whitelist list   --team <course> [--data <dir> | --sql]
  whitelist revoke --team <course> --name "<name>" [--data <dir> | --sql]
teams: ${COURSES.map((c) => c.id).join(', ')}`;

interface Parsed { command: string; team?: string; name?: string; data?: string; sql: boolean }

function parse(argv: readonly string[]): Parsed {
  const [group, command, ...rest] = argv;
  if (group !== 'whitelist' || !['add', 'list', 'revoke'].includes(command ?? '')) throw new Error('expected: whitelist add|list|revoke');
  const out: Parsed = { command, sql: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = (): string => {
      const v = inline ?? rest[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === '--team') out.team = value();
    else if (flag === '--name') out.name = value();
    else if (flag === '--data') out.data = value();
    else if (flag === '--sql') out.sql = true;
    else throw new Error(`unknown argument "${a}"`);
  }
  if (out.sql && out.data !== undefined) throw new Error('give --data or --sql, not both');
  return out;
}

const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** Run one command. Returns the exit code (0 ok, 1 refused, 2 usage). */
export async function runAdmin(argv: readonly string[], io: AdminIo, options: AdminOptions = {}): Promise<number> {
  const now = options.now ?? ((): string => new Date().toISOString());
  let p: Parsed;
  try { p = parse(argv); } catch (e) { io.stderr(`goread admin: ${e instanceof Error ? e.message : String(e)}\n${USAGE}\n`); return 2; }

  const team = COURSES.find((c) => c.id === p.team);
  if (!team) { io.stderr(`goread admin: --team must be one of ${COURSES.map((c) => c.id).join(', ')}\n`); return 2; }
  const name = p.name?.trim();
  if (p.command !== 'list' && (name === undefined || Array.from(name).length < 1 || Array.from(name).length > 60)) {
    io.stderr('goread admin: --name must be a name of 1 to 60 characters\n');
    return 2;
  }
  const stamp = now();

  if (p.sql) {
    if (p.command === 'list') {
      io.stdout(`SELECT name, created_at, revoked_at FROM contributors WHERE team = ${quote(team.id)} ORDER BY created_at, name;\n`);
      return 0;
    }
    if (p.command === 'revoke') {
      io.stdout(`UPDATE contributors SET revoked_at = ${quote(stamp)} WHERE team = ${quote(team.id)} AND name = ${quote(name!)} AND revoked_at IS NULL;\n`);
      return 0;
    }
    const key = (options.newKey ?? makeKey)();
    io.stdout(`INSERT INTO contributors (team, name, key_hash, created_at, revoked_at) VALUES (${quote(team.id)}, ${quote(name!)}, ${quote(await sha256Hex(key))}, ${quote(stamp)}, NULL);\n`);
    io.stderr(`Contributor key for ${name} on ${team.id}. Copy this key now; it is not stored, and only its hash is in the SQL:\n${key}\n`);
    return 0;
  }

  const store = openSqliteStore(resolve(p.data ?? 'data/goread'));
  try {
    if (p.command === 'list') {
      const rows = await store.listContributors(team.id);
      if (rows.length === 0) io.stdout(`${team.id}: nobody is on the list yet\n`);
      for (const r of rows) io.stdout(`${r.name}\tadded ${r.createdAt}\t${r.revokedAt === null ? 'active' : `revoked ${r.revokedAt}`}\n`);
      return 0;
    }
    if (p.command === 'revoke') {
      if (!(await store.revoke(team.id, name!, stamp))) { io.stderr(`goread admin: no active key for "${name}" on ${team.id}\n`); return 1; }
      io.stdout(`Revoked ${name} on ${team.id}. Their texts stay on the shelf.\n`);
      return 0;
    }
    const key = (options.newKey ?? makeKey)();
    try {
      await store.addContributor({ team: team.id, name: name!, keyHash: await sha256Hex(key), createdAt: stamp, revokedAt: null });
    } catch (e) {
      io.stderr(`goread admin: ${e instanceof Error ? e.message : String(e)}. To give them a new key, revoke them and add a new name.\n`);
      return 1;
    }
    io.stderr(`Added ${name} to ${team.id}. Copy this key now; it is not stored:\n`);
    io.stdout(`${key}\n`);
    return 0;
  } finally {
    await store.close();
  }
}
