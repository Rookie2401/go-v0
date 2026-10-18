/**
 * Postgres for the tests.
 *
 *  - `pgliteTestPool()`: real PostgreSQL compiled to WebAssembly (@electric-sql/pglite), in this process, behind the same `PgPool` interface the
 *    store uses with `pg`. PGlite has one connection, so the adapter hands it out under a mutex: a transaction holds it from `connect()` to
 *    `release()`, and a plain `pool.query` waits for it. (A store call that forgot to use the transaction's connection would therefore deadlock
 *    instead of silently running outside the transaction.)
 *  - `realPgTestPool()`: a `pg.Pool` on TEST_DATABASE_URL, confined to a throw-away schema, for the suites that run when a server is provided.
 */
import { PGlite } from '@electric-sql/pglite';
import { createPgPool } from '../../../packages/repository-store/src';
import type { PgClient, PgPool, PgResult } from '../../../packages/repository-store/src';

export interface TestPool extends PgPool {
  /** Empties every table except schema_version (so migrations are not re-run for each case). */
  reset(): Promise<void>;
  /** Really close the database. */
  destroy(): Promise<void>;
}

const RESET_SQL = `DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'schema_version' LOOP
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(t) || ' CASCADE';
  END LOOP;
END $$`;

export function pgliteTestPool(): TestPool {
  const db = new PGlite();
  let tail: Promise<void> = Promise.resolve();
  const acquire = async (): Promise<() => void> => {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const prev = tail;
    tail = prev.then(() => next);
    await prev;
    return release;
  };
  const exec = async (sql: string, params?: unknown[]): Promise<PgResult> => {
    if (params === undefined) {
      const results = await db.exec(sql);
      const last = results[results.length - 1];
      return { rows: (last?.rows ?? []) as Array<Record<string, unknown>>, rowCount: last?.affectedRows ?? 0 };
    }
    const r = await db.query(sql, params);
    return { rows: r.rows as Array<Record<string, unknown>>, rowCount: r.affectedRows ?? r.rows.length };
  };
  const pool: TestPool = {
    async query(sql, params) {
      const release = await acquire();
      try { return await exec(sql, params); } finally { release(); }
    },
    async connect(): Promise<PgClient> {
      const release = await acquire();
      let released = false;
      return {
        query: (sql, params) => exec(sql, params),
        release: () => { if (!released) { released = true; release(); } },
      };
    },
    async end() { /* the database outlives the stores opened on it; destroy() closes it */ },
    async reset() { await pool.query(RESET_SQL.replace(/\s+/g, ' ')); },
    async destroy() { await db.close(); },
  };
  return pool;
}

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** A pool on TEST_DATABASE_URL confined to the schema `go_repository_test` (created if missing). `end()` is a no-op; `destroy()` drops the schema and ends the pool. */
export async function realPgTestPool(): Promise<TestPool> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  const admin = await createPgPool(TEST_DATABASE_URL, { max: 1 });
  await admin.query('DROP SCHEMA IF EXISTS go_repository_test CASCADE');
  await admin.query('CREATE SCHEMA go_repository_test');
  await admin.end();
  const real = await createPgPool(TEST_DATABASE_URL, { max: 6, searchPath: 'go_repository_test' });
  return {
    query: (sql, params) => real.query(sql, params),
    connect: () => real.connect(),
    async end() { /* see destroy() */ },
    async reset() { await real.query(RESET_SQL.replace(/\s+/g, ' ')); },
    async destroy() {
      await real.query('DROP SCHEMA IF EXISTS go_repository_test CASCADE').catch(() => undefined);
      await real.end();
    },
  };
}
