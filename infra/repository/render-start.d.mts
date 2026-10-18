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
