/// <reference types="node" />
/**
 * Copy an existing SQLite Repository database into an empty Postgres database, verify it, and commit (or change nothing).
 *
 *   DATABASE_URL=postgres://user:pass@host/go npx vite-node --config scripts/vite.config.ts scripts/ops/migrate-sqlite-to-postgres.mts -- \
 *     --sqlite /var/lib/go-repository/repository.sqlite [--dry-run] [--mark-ready]
 *
 * It reads a snapshot (VACUUM INTO), so the live service may keep running, but writes made after the snapshot are not copied: stop the service (or
 * pause writes) before the real run, and take a backup first (scripts/ops/backup.mts). It refuses a target that already holds any row, so it cannot be
 * run twice. The whole copy is one transaction and is committed only when every table's row count, every learner's event count, head sequence and
 * sequence sum, and the sets of account, session and event ids match. `--dry-run` does everything and rolls back. `--mark-ready` sets the
 * `migration-ready` row the hosting gate waits for. Exit status 0 only when the copy was committed (or the dry run verified).
 */
import { parseArgs } from './lib.mts';
import { copySqliteToPostgres, createPgPool } from '../../packages/repository-store/src';

async function main(): Promise<void> {
  const { flags, values } = parseArgs(process.argv.slice(2), { flags: ['dry-run', 'mark-ready'], values: ['sqlite', 'database-url'] });
  const url = values['database-url'] ?? process.env.DATABASE_URL;
  if (!values.sqlite) throw new Error('--sqlite <path to repository.sqlite> is required');
  if (!url) throw new Error('DATABASE_URL (or --database-url) is required');
  const pool = await createPgPool(url, { max: 2 });
  try {
    const report = await copySqliteToPostgres(values.sqlite, pool, { dryRun: flags.has('dry-run'), markReady: flags.has('mark-ready'), log: (l) => console.log(`migrate: ${l}`) });
    console.log('migrate: table        sqlite   postgres');
    for (const t of report.tables) console.log(`migrate: ${t.table.padEnd(18)} ${String(t.sqlite).padStart(8)} ${String(t.postgres).padStart(9)}${t.sqlite === t.postgres ? '' : '  <-- MISMATCH'}`);
    if (report.refusal) { console.error(`migrate: refused: ${report.refusal}`); process.exitCode = 1; return; }
    console.log(`migrate: ${report.committed ? 'COMMITTED' : 'verified, rolled back (dry run)'}: ${report.learners} learners, ${report.events} events`);
  } finally { await pool.end(); }
}

main().catch((e) => { console.error(`migrate: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
