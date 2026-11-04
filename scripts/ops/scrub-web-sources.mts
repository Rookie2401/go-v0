/// <reference types="node" />
/**
 * Removes the readable title and path of web pages from events stored before the service stopped keeping them (2026-11-03). The events stay, and so does
 * everything else in them; those lookups simply no longer name a page. Bible references, book titles and shares are not touched. Safe while the service runs.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/ops/scrub-web-sources.mts -- --data /var/lib/go-repository [--apply]
 *
 * Postgres when DATABASE_URL is set. Without --apply it only counts. Prints counts, never a title or an address. Backups taken earlier keep the old rows
 * until they age out.
 */
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from './lib.mts';
import { createPgPool } from '../../packages/repository-store/src';

const SQLITE_READABLE = `json_extract(json, '$.subject.sourceRef.kind') = 'web' AND (json_extract(json, '$.subject.sourceRef.title') IS NOT NULL
  OR (json_extract(json, '$.subject.sourceRef.locator') IS NOT NULL AND json_extract(json, '$.subject.sourceRef.locator') NOT LIKE 'h:%'))`;
const PG_READABLE = `json #>> '{subject,sourceRef,kind}' = 'web' AND (json #>> '{subject,sourceRef,title}' IS NOT NULL
  OR (json #>> '{subject,sourceRef,locator}' IS NOT NULL AND json #>> '{subject,sourceRef,locator}' NOT LIKE 'h:%'))`;

/** One statement over the table, for SQLite. The test drives this directly. */
export function scrubSqlite(file: string, apply: boolean): number {
  const db = new DatabaseSync(file);
  try {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${SQLITE_READABLE}`).get() as { n: number };
    if (apply && n) db.exec(`UPDATE events SET json = json_remove(json, '$.subject.sourceRef.title', '$.subject.sourceRef.locator') WHERE ${SQLITE_READABLE}`);
    return n;
  } finally { db.close(); }
}

async function main(): Promise<void> {
  const { flags, values } = parseArgs(process.argv.slice(2), { flags: ['apply'], values: ['data'] });
  const apply = flags.has('apply');
  let n: number;
  if (process.env.DATABASE_URL) {
    const pool = await createPgPool(process.env.DATABASE_URL, { max: 1 });
    try {
      n = Number(((await pool.query(`SELECT COUNT(*) AS n FROM events WHERE ${PG_READABLE}`)).rows[0] as { n: unknown }).n);
      if (apply && n) await pool.query(`UPDATE events SET json = json #- '{subject,sourceRef,title}' #- '{subject,sourceRef,locator}' WHERE ${PG_READABLE}`);
    } finally { await pool.end(); }
  } else {
    n = scrubSqlite(join(resolve(values.data ?? process.env.REPOSITORY_DATA_DIR ?? 'data/repository'), 'repository.sqlite'), apply);
  }
  console.log(`scrub: ${n} event(s) ${apply ? 'cleaned' : 'name a web page in readable form (run with --apply to clean them)'}`);
}

if (process.argv[1] && /scrub-web-sources/.test(process.argv[1])) main().catch((e) => { console.error(`scrub: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
