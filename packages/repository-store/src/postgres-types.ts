/**
 * The small structural slice of node-postgres (`pg`) the Postgres store uses. The store never imports `pg`: a `pg.Pool` satisfies these interfaces as
 * it is, and so does the in-process adapter the tests build over PGlite (real Postgres compiled to WebAssembly). `postgres-pool.ts` is the only file
 * that loads the driver.
 */
export interface PgResult { rows: Array<Record<string, unknown>>; rowCount: number | null }

export interface PgQueryable {
  /** With `params` the extended protocol (one statement, `$1` placeholders); without, the simple protocol (several statements allowed, used by migrations). */
  query(sql: string, params?: unknown[]): Promise<PgResult>;
}

export interface PgClient extends PgQueryable {
  release(err?: Error | boolean): void;
}

export interface PgPool extends PgQueryable {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}
