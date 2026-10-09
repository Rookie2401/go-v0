/**
 * A tiny migration runner: `migrations/NNN-name.sql`, applied in order, each in its own transaction, each recorded in
 * `schema_version` with a checksum. Reopening a database applies nothing new (idempotent); an applied file that was
 * edited, or a database that is ahead of this build, is refused rather than guessed at.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);

export interface MigrationFile { version: number; name: string; sql: string; checksum: string }

const FILE = /^(\d{3,})-[\w.-]+\.sql$/;

/** Line endings are normalised before hashing so a Windows checkout does not look like an edit. */
export const checksumOf = (sql: string): string => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

export function readMigrations(dir: URL | string = MIGRATIONS_DIR): MigrationFile[] {
  const base = typeof dir === 'string' ? pathToFileURL(resolve(dir) + sep) : dir;
  const files: MigrationFile[] = [];
  for (const name of readdirSync(base).sort()) {
    const m = FILE.exec(name);
    if (!m) continue;
    const sql = readFileSync(new URL(name, base), 'utf8');
    files.push({ version: Number(m[1]), name, sql, checksum: checksumOf(sql) });
  }
  files.sort((a, b) => a.version - b.version);
  for (let i = 1; i < files.length; i++) if (files[i].version === files[i - 1].version) throw new Error(`two migrations share version ${files[i].version}`);
  return files;
}

/** Applies every migration not yet recorded; returns the names applied by this call (empty on a reopen). */
export function applyMigrations(db: DatabaseSync, dir: URL | string = MIGRATIONS_DIR, now: () => string = () => new Date().toISOString()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`);
  const files = readMigrations(dir);
  const byVersion = new Map(files.map((f) => [f.version, f]));
  const applied = db.prepare('SELECT version, name, checksum FROM schema_version ORDER BY version').all() as Array<{ version: number; name: string; checksum: string }>;
  for (const row of applied) {
    const f = byVersion.get(row.version);
    if (!f) throw new Error(`the database has migration ${row.name} applied, which this build does not know (the database is newer than the code)`);
    if (f.checksum !== row.checksum) throw new Error(`migration ${f.name} was edited after it was applied; add a new migration instead`);
  }
  const done = new Set(applied.map((r) => r.version));
  const ran: string[] = [];
  for (const f of files) {
    if (done.has(f.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(f.sql);
      db.prepare('INSERT INTO schema_version (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(f.version, f.name, f.checksum, now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${f.name} failed: ${(e as Error).message}`, { cause: e });
    }
    ran.push(f.name);
  }
  return ran;
}
