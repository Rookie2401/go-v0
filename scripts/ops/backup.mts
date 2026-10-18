/// <reference types="node" />
/**
 * Back up the Go Repository: a consistent SQLite snapshot (VACUUM INTO, the service keeps running) or a pg_dump, gzipped, optionally encrypted,
 * with a .sha256 beside it, uploaded off the box, and old local backups pruned (daily and weekly retention).
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/ops/backup.mts -- --data /var/lib/go-repository --out /var/backups/go-repository
 *
 * Postgres is used when DATABASE_URL is set (needs pg_dump on the PATH). Environment:
 *   BACKUP_PASSPHRASE                 encrypt the backup (AES-256-GCM); restore needs the same passphrase
 *   BACKUP_S3_ENDPOINT / _BUCKET / _ACCESS_KEY / _SECRET_KEY   upload to an S3-compatible bucket (also _REGION, default "auto"; _PREFIX, default "go-repository/")
 *   BACKUP_UPLOAD_CMD                 run with the backup path as its last argument (rclone copyto, scp, restic …)
 *   BACKUP_KEEP_DAILY / BACKUP_KEEP_WEEKLY   local retention (defaults 7 and 4)
 * Exit status is non-zero if the backup or an upload failed, so a systemd timer / cron mail reports it.
 */
import { parseArgs, runBackup, s3FromEnv, wholeNumber } from './lib.mts';

async function main(): Promise<void> {
  const { values } = parseArgs(process.argv.slice(2), { flags: [], values: ['data', 'out', 'keep-daily', 'keep-weekly'] });
  const env = process.env;
  const data = values.data ?? env.REPOSITORY_DATA_DIR ?? 'data/repository';
  const result = await runBackup({
    dataDir: data,
    ...(env.DATABASE_URL ? { databaseUrl: env.DATABASE_URL } : {}),
    outDir: values.out ?? env.BACKUP_DIR ?? 'backups',
    keepDaily: wholeNumber(values['keep-daily'] ?? env.BACKUP_KEEP_DAILY, 'keep-daily', 7),
    keepWeekly: wholeNumber(values['keep-weekly'] ?? env.BACKUP_KEEP_WEEKLY, 'keep-weekly', 4),
    ...(env.BACKUP_PASSPHRASE ? { passphrase: env.BACKUP_PASSPHRASE } : {}),
    ...(s3FromEnv(env) ? { s3: s3FromEnv(env)! } : {}),
    ...(env.BACKUP_UPLOAD_CMD ? { uploadCmd: env.BACKUP_UPLOAD_CMD } : {}),
    log: (line) => console.log(`backup: ${line}`),
  });
  console.log(`backup: done ${result.file} ${result.bytes} bytes${result.encrypted ? ' (encrypted)' : ''}; uploaded to ${result.uploaded.length} place(s), pruned ${result.pruned.length}`);
  if (!result.uploaded.length) console.log('backup: warning: nothing was uploaded off this machine (set BACKUP_S3_* or BACKUP_UPLOAD_CMD)');
}

main().catch((e) => { console.error(`backup: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
