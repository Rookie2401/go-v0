/**
 * How the backups and the disk stand, for `GET /health`. The backup job writes one small status file beside the backups (`scripts/ops/backup.mts`); a failed,
 * missing or overdue backup, or a filling disk, then shows without anyone opening the logs, and an uptime monitor can watch for it. The route is public, so this
 * says how things stand and nothing else: no path, file name, size or address.
 */
import { readFileSync, statfsSync } from 'node:fs';
import { join } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Below this share of free disk a backup may not fit, and writes are next. */
const LOW_DISK_PCT = 25;

export interface Durability {
  /** `ok` a backup within two days; `failed` the newest attempt failed; `overdue` none for two days; `none` never yet. */
  backup: 'ok' | 'failed' | 'overdue' | 'none';
  lastBackupAt?: string;
  /** Why the newest attempt failed. */
  backupError?: string;
  /** The newest backup also left this disk, and is encrypted. While `offsite` is false, losing this disk loses every learner's history. */
  offsite: boolean;
  encrypted: boolean;
  disk: 'ok' | 'low' | 'unknown';
  diskFreePct?: number;
}

interface StatusFile { at?: unknown; ok?: unknown; lastOkAt?: unknown; offsite?: unknown; encrypted?: unknown; error?: unknown }

export function durabilityOf(status: StatusFile | undefined, freePct: number | undefined, nowMs: number): Durability {
  const lastOk = typeof status?.lastOkAt === 'string' ? status.lastOkAt : undefined;
  const age = lastOk ? nowMs - Date.parse(lastOk) : Infinity;
  const backup: Durability['backup'] = !status ? 'none' : status.ok !== true ? 'failed' : age > 2 * DAY_MS ? 'overdue' : 'ok';
  return {
    backup,
    ...(lastOk ? { lastBackupAt: lastOk } : {}),
    ...(backup === 'failed' && typeof status?.error === 'string' ? { backupError: status.error } : {}),
    offsite: status?.offsite === true,
    encrypted: status?.encrypted === true,
    disk: freePct === undefined ? 'unknown' : freePct < LOW_DISK_PCT ? 'low' : 'ok',
    ...(freePct === undefined ? {} : { diskFreePct: Math.round(freePct) }),
  };
}

export function backupHealth(dataDir: string, nowMs: number = Date.now()): Durability {
  let status: StatusFile | undefined;
  try { status = JSON.parse(readFileSync(join(dataDir, 'backups', '.last-backup.json'), 'utf8')) as StatusFile; } catch { status = undefined; }
  let freePct: number | undefined;
  try { const s = statfsSync(dataDir); freePct = s.blocks > 0 ? (Number(s.bavail) / Number(s.blocks)) * 100 : undefined; } catch { freePct = undefined; }
  return durabilityOf(status, freePct, nowMs);
}
