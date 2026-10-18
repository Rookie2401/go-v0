/**
 * The only file that loads the `pg` driver. `main.ts` and the operator scripts call it when `DATABASE_URL` is set; everything else in this package
 * sees a `PgPool` (./postgres-types).
 */
import type { PgPool } from './postgres-types';

export interface PgPoolOptions {
  /** Most connections held (default 10, or PGPOOL_MAX). The service holds one while a transaction runs and borrows one for each other statement. */
  max?: number;
  /** Called with an idle connection's error (the pool survives it); default: ignore. */
  onError?: (e: Error) => void;
  /** Put every connection's search_path on this schema (tests use a throw-away schema so they can never touch the real tables). A plain identifier only. */
  searchPath?: string;
}

function assertIdentifier(v: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(v)) throw new Error(`not a plain schema name: ${v}`);
  return v;
}

export async function createPgPool(connectionString: string, opts: PgPoolOptions = {}): Promise<PgPool> {
  const mod = (await import('pg')) as unknown as { default?: { Pool: new (c: object) => unknown }; Pool?: new (c: object) => unknown };
  const Pool = (mod.default?.Pool ?? mod.Pool) as new (c: object) => PgPool & { on(event: 'error', fn: (e: Error) => void): void };
  const envMax = Number(process.env.PGPOOL_MAX);
  const pool = new Pool({
    connectionString,
    max: opts.max ?? (Number.isInteger(envMax) && envMax > 0 ? envMax : 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(opts.searchPath !== undefined ? { options: `-c search_path=${assertIdentifier(opts.searchPath)}` } : {}),
  });
  pool.on('error', (e) => opts.onError?.(e));
  return pool;
}

/** Whether a connection string names Postgres (what selects this store over SQLite). */
export const isPostgresUrl = (v: string | undefined): v is string => typeof v === 'string' && /^postgres(ql)?:\/\//i.test(v.trim());
