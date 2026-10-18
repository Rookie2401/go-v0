/// <reference types="node" />
/**
 * Restore (or just verify) a backup made by backup.mts.
 *
 *   # verify only: checksum, decrypt, integrity check, open with this build's store, print the counts. Touches nothing.
 *   npx vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file backups/repository-sqlite-….sqlite.gz --verify-only
 *   # restore SQLite into a data directory (refuses to overwrite; --force keeps the old file aside)
 *   npx vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file backups/… --data /var/lib/go-repository [--force] [--mark-ready]
 *   # restore a pg_dump into an EMPTY database (needs psql on the PATH)
 *   DATABASE_URL=postgres://… npx vite-node … scripts/ops/restore.mts -- --file backups/repository-postgres-….sql.gz
 *
 * An encrypted backup (.enc) needs BACKUP_PASSPHRASE. Stop the service before restoring over its data. --mark-ready writes the `.migration-ready`
 * sentinel (SQLite) or the `migration-ready` service_state row (Postgres) that the hosting start-up gate waits for.
 */
import { parseArgs, runRestore } from './lib.mts';

async function main(): Promise<void> {
  const { flags, values } = parseArgs(process.argv.slice(2), { flags: ['verify-only', 'force', 'mark-ready'], values: ['file', 'data', 'database-url'] });
  if (!values.file) throw new Error('--file <backup> is required');
  const env = process.env;
  const result = await runRestore({
    file: values.file,
    ...(values.data ? { dataDir: values.data } : {}),
    ...((values['database-url'] ?? env.DATABASE_URL) ? { databaseUrl: values['database-url'] ?? env.DATABASE_URL! } : {}),
    ...(env.BACKUP_PASSPHRASE ? { passphrase: env.BACKUP_PASSPHRASE } : {}),
    force: flags.has('force'),
    verifyOnly: flags.has('verify-only'),
    markReady: flags.has('mark-ready'),
    log: (line) => console.log(`restore: ${line}`),
  });
  console.log(`restore: ${result.restored ? 'restored' : 'verified (nothing restored)'}: ${JSON.stringify(result)}`);
}

main().catch((e) => { console.error(`restore: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
