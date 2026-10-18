/// <reference types="node" />
/**
 * Copies a SQLite Repository database into an (empty) Postgres one, table by table, in ONE Postgres transaction, then verifies it before committing.
 * Used by `scripts/ops/migrate-sqlite-to-postgres.mts`; here so the same code is tested against PGlite.
 *
 * Safety:
 *  - It reads a SNAPSHOT (VACUUM INTO a temporary file), never the live file, so a running writer cannot hand it a half-written state.
 *  - It refuses a target that already holds anything (any row in any data table, or the `migrated-from-sqlite` mark), so running it twice, or onto a
 *    database in use, changes nothing.
 *  - Nothing is committed unless every table's row count matches, the per-learner event counts, head sequences and sums of sequence numbers match, and
 *    the sets of account, session and event ids hash the same on both sides. A mismatch rolls the whole copy back.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from './migrate';
import { openPostgresStore } from './postgres';
import type { PgPool, PgQueryable } from './postgres-types';

/** Parents before children; every data table of the schema (schema_version is each side's own). */
export const COPY_ORDER = [
  'learners', 'accounts', 'account_tokens', 'security_events', 'sessions', 'devices', 'teams', 'team_members', 'enrolments', 'event_heads', 'events', 'event_units',
  'units', 'relations', 'analyses', 'aliases', 'packs', 'knowledge', 'projection_cursor', 'preferences', 'documents', 'tombstones', 'service_state',
] as const;

export interface TableCount { table: string; sqlite: number; postgres: number }
export interface CopyReport {
  tables: TableCount[];
  learners: number;
  events: number;
  committed: boolean;
  /** Why nothing was committed, when it was not. */
  refusal?: string;
}
export interface CopyOptions {
  /** Do everything and verify, then roll back. */
  dryRun?: boolean;
  /** Also record `migration-ready = verified` in the target's service_state (what the hosting gate waits for). */
  markReady?: boolean;
  now?: () => string;
  log?: (line: string) => void;
}

type Row = Record<string, unknown>;

async function targetIsEmpty(q: PgQueryable): Promise<string | undefined> {
  for (const t of COPY_ORDER) {
    const r = await q.query(`SELECT 1 AS x FROM ${t} LIMIT 1`);
    if (r.rows.length) return `the target database already holds rows in "${t}"`;
  }
  return undefined;
}

const hashOf = (ids: string[]): string => createHash('sha256').update(ids.sort().join('\n')).digest('hex');

/** `pool` must be a pool on a database the Postgres store can migrate (the schema is applied here). Returns the report; throws only for bad input. */
export async function copySqliteToPostgres(sqlitePath: string, pool: PgPool, opts: CopyOptions = {}): Promise<CopyReport> {
  const log = opts.log ?? ((): void => undefined);
  const now = opts.now ?? ((): string => new Date().toISOString());
  const work = mkdtempSync(join(tmpdir(), 'go-sqlite-copy-'));
  const snapshot = join(work, 'snapshot.sqlite');
  let source: DatabaseSync | undefined;
  try {
    // 1. a consistent snapshot of the source (and the source brought to the current schema, in the snapshot only)
    const live = new DatabaseSync(sqlitePath, { readOnly: true });
    try { live.prepare('VACUUM INTO ?').run(snapshot); } finally { live.close(); }
    source = new DatabaseSync(snapshot);
    applyMigrations(source);

    // 2. the target: schema applied, then it must be empty
    await (await openPostgresStore(noEnd(pool))).close();
    const report: CopyReport = { tables: [], learners: 0, events: 0, committed: false };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        const refusal = await targetIsEmpty(client);
        if (refusal) { await client.query('ROLLBACK'); return { ...report, refusal }; }

        // 3. copy
        for (const table of COPY_ORDER) {
          const cols = (source.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as Array<{ name: string }>).map((c) => c.name);
          const rows = source.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all() as Row[];
          const perChunk = Math.max(1, Math.floor(50_000 / cols.length));
          for (let i = 0; i < rows.length; i += perChunk) {
            const part = rows.slice(i, i + perChunk);
            const params: unknown[] = [];
            const tuples = part.map((r) => `(${cols.map((c) => { params.push(r[c] === undefined ? null : typeof r[c] === 'bigint' ? Number(r[c]) : r[c]); return `$${params.length}`; }).join(', ')})`);
            await client.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${tuples.join(', ')}`, params);
          }
          log(`copied ${table}: ${rows.length}`);
        }

        // 4. verify, still inside the transaction
        const problems: string[] = [];
        for (const table of COPY_ORDER) {
          const s = Number((source.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
          const p = Number((await client.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]!.n);
          report.tables.push({ table, sqlite: s, postgres: p });
          if (s !== p) problems.push(`${table}: ${s} rows in SQLite, ${p} in Postgres`);
        }
        report.learners = report.tables.find((t) => t.table === 'learners')!.postgres;
        report.events = report.tables.find((t) => t.table === 'events')!.postgres;
        const perLearnerSqlite = source.prepare('SELECT learner_id, COUNT(*) AS n, MAX(seq) AS head, SUM(seq) AS total FROM events GROUP BY learner_id ORDER BY learner_id').all() as Row[];
        const perLearnerPg = (await client.query('SELECT learner_id, COUNT(*) AS n, MAX(seq) AS head, SUM(seq) AS total FROM events GROUP BY learner_id ORDER BY learner_id')).rows;
        if (JSON.stringify(perLearnerSqlite.map((r) => [r.learner_id, Number(r.n), Number(r.head), Number(r.total)])) !== JSON.stringify(perLearnerPg.map((r) => [r.learner_id, Number(r.n), Number(r.head), Number(r.total)]))) {
          problems.push('per-learner event counts, head sequences or sequence sums differ');
        }
        const headsSqlite = (source.prepare('SELECT learner_id, head FROM event_heads ORDER BY learner_id').all() as Row[]).map((r) => [r.learner_id, Number(r.head)]);
        const headsPg = (await client.query('SELECT learner_id, head FROM event_heads ORDER BY learner_id')).rows.map((r) => [r.learner_id, Number(r.head)]);
        if (JSON.stringify(headsSqlite) !== JSON.stringify(headsPg)) problems.push('the per-learner head sequences differ');
        for (const [table, column] of [['accounts', 'account_id'], ['sessions', 'session_id'], ['events', 'id']] as const) {
          const a = hashOf((source.prepare(`SELECT ${column} AS v FROM ${table}`).all() as Row[]).map((r) => String(r.v)));
          const b = hashOf((await client.query(`SELECT ${column} AS v FROM ${table}`)).rows.map((r) => String(r.v)));
          if (a !== b) problems.push(`the ${table} ids differ`);
        }
        if (problems.length) { await client.query('ROLLBACK'); return { ...report, refusal: `verification failed, nothing was committed: ${problems.join('; ')}` }; }

        // 5. mark and commit
        await client.query(
          `INSERT INTO service_state (key, value) VALUES ('migrated-from-sqlite', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          [`${now()} learners=${report.learners} events=${report.events}`],
        );
        if (opts.markReady && !opts.dryRun) {
          await client.query(`INSERT INTO service_state (key, value) VALUES ('migration-ready', 'verified') ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
        }
        if (opts.dryRun) { await client.query('ROLLBACK'); return report; }
        await client.query('COMMIT');
        return { ...report, committed: true };
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      }
    } finally {
      client.release();
    }
  } finally {
    source?.close();
    rmSync(work, { recursive: true, force: true });
  }
}

/** `openPostgresStore(...).close()` ends the pool it was given; the copy still needs it, so migrate through a pool whose `end` does nothing. */
function noEnd(pool: PgPool): PgPool {
  return { query: (s, p) => pool.query(s, p), connect: () => pool.connect(), end: async () => undefined };
}
