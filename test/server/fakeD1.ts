/** A tiny fake of a Cloudflare D1 binding on node:sqlite (in memory): prepare(sql).bind(...).first()/all()/run(). Not a test file. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Like, D1LikeStatement } from '../../server/goread/store-d1';

type Param = string | number | null;

export function makeFakeD1(): { d1: D1Like; db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('server/goread/schema.sql', 'utf8'));
  const statement = (sql: string, params: Param[]): D1LikeStatement => ({
    bind: (...values: unknown[]) => statement(sql, values as Param[]),
    first: async <T>() => ((db.prepare(sql).get(...params) as T | undefined) ?? null),
    all: async <T>() => ({ results: db.prepare(sql).all(...params) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
  });
  return { d1: { prepare: (sql: string) => statement(sql, []) }, db };
}
