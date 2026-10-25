import type { Server } from 'node:http';

export interface MigrationGateOptions<T> {
  dataDir: string;
  port: number;
  host?: string;
  pollIntervalMs?: number;
  launchService: () => T | Promise<T>;
  /** Replaces the sentinel-file check (Postgres: a `service_state` row). */
  isReady?: () => boolean | Promise<boolean>;
}

export interface MigrationGate<T> {
  server: Server;
  launched: Promise<T>;
  close: () => Promise<void>;
}

export function startMigrationGate<T>(options: MigrationGateOptions<T>): Promise<MigrationGate<T>>;

export interface BackupRunResult {
  ok: boolean;
  code?: number;
  signal?: string;
  reason?: string;
}

export interface BackupRun {
  done: Promise<BackupRunResult>;
  stop?: () => void;
}

export interface BackupSchedulerOptions {
  intervalMs?: number;
  initialDelayMs?: number;
  runBackup: () => BackupRun;
  onResult?: (result: BackupRunResult) => void;
}

export interface BackupScheduler {
  close: () => Promise<void>;
}

export function startBackupScheduler(options: BackupSchedulerOptions): BackupScheduler;
