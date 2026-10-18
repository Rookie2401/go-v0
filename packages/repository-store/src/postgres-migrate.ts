/**
 * The PostgreSQL twin of ./migrate: `migrations-pg/NNN-name.sql`, applied in order, each in its own transaction, each recorded in `schema_version` with
 * a checksum. An advisory lock makes two instances starting together apply the files once, not twice. An applied file that was edited, or a
 * database that is ahead of this build, is refused rather than guessed at.
 */
import { checksumOf, readMigrations } from './migrate';
import type { MigrationFile } from './migrate';
import type { PgPool } from './postgres-types';

export const PG_MIGRATIONS_DIR = new URL('../migrations-pg/', import.meta.url);

/** A constant of our own for pg_advisory_lock (the first eight hex digits of sha256("go-repository-migrations")). */
const MIGRATION_LOCK = 0x4a1f6c3b;

export { checksumOf };

export function readPgMigrations(dir: URL | string = PG_MIGRATIONS_DIR): MigrationFile[] {
  return readMigrations(dir);
}

/** Applies every migration not yet recorded; returns the names applied by this call (empty when the database is up to date). */
export async function applyPgMigrations(pool: PgPool, dir: URL | string = PG_MIGRATIONS_DIR, now: () => string = () => new Date().toISOString()): Promise<string[]> {
  const files = readPgMigrations(dir);
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS schema_version (
        version    integer PRIMARY KEY,
        name       text NOT NULL,
        checksum   text NOT NULL,
        applied_at text NOT NULL
      )`);
      const byVersion = new Map(files.map((f) => [f.version, f]));
      const applied = (await client.query('SELECT version, name, checksum FROM schema_version ORDER BY version')).rows as Array<{ version: number; name: string; checksum: string }>;
      for (const row of applied) {
        const f = byVersion.get(Number(row.version));
        if (!f) throw new Error(`the database has migration ${row.name} applied, which this build does not know (the database is newer than the code)`);
        if (f.checksum !== row.checksum) throw new Error(`migration ${f.name} was edited after it was applied; add a new migration instead`);
      }
      const done = new Set(applied.map((r) => Number(r.version)));
      const ran: string[] = [];
      for (const f of files) {
        if (done.has(f.version)) continue;
        await client.query('BEGIN');
        try {
          await client.query(f.sql);
          await client.query('INSERT INTO schema_version (version, name, checksum, applied_at) VALUES ($1, $2, $3, $4)', [f.version, f.name, f.checksum, now()]);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw new Error(`migration ${f.name} failed: ${(e as Error).message}`, { cause: e });
        }
        ran.push(f.name);
      }
      return ran;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}
