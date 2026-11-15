/// <reference types="node" />
/**
 * Removes the readable title and path of web pages from events stored before the service stopped keeping them (2026-11-03). The events stay, and so does
 * everything else in them; those lookups simply no longer name a page. Bible references, book titles and shares are not touched. Safe while the service runs.
 *
 *   On Render (the Shell, beside the running service): node scripts/ops/run.mjs scrub-web-sources … (the same arguments, no --); vite-node there runs the
 *   instance out of memory. Elsewhere:
 *   npx vite-node --config scripts/vite.config.ts scripts/ops/scrub-web-sources.mts -- --data /var/lib/go-repository [--apply]
 *
 * Postgres when DATABASE_URL is set. Without --apply it only counts. Prints counts, never a title or an address. Backups taken earlier keep the old rows
 * until they age out.
 */
import { join, resolve } from 'node:path';
import { parseArgs, PG_WEB_READABLE, scrubSqlite } from './lib.mts';
import { createPgPool } from '../../packages/repository-store/src';

async function main(): Promise<void> {
  const { flags, values } = parseArgs(process.argv.slice(2), { flags: ['apply'], values: ['data'] });
  const apply = flags.has('apply');
  let n: number;
  if (process.env.DATABASE_URL) {
    const pool = await createPgPool(process.env.DATABASE_URL, { max: 1 });
    try {
      n = Number(((await pool.query(`SELECT COUNT(*) AS n FROM events WHERE ${PG_WEB_READABLE}`)).rows[0] as { n: unknown }).n);
      if (apply && n) await pool.query(`UPDATE events SET json = json #- '{subject,sourceRef,title}' #- '{subject,sourceRef,locator}' WHERE ${PG_WEB_READABLE}`);
    } finally { await pool.end(); }
  } else {
    n = scrubSqlite(join(resolve(values.data ?? process.env.REPOSITORY_DATA_DIR ?? 'data/repository'), 'repository.sqlite'), apply);
  }
  console.log(`scrub: ${n} event(s) ${apply ? 'cleaned' : 'name a web page in readable form (run with --apply to clean them)'}`);
}

// Always runs: under vite-node process.argv[1] is vite-node's own file, so a check on it skipped main() and the script did nothing (2026-11-12).
main().catch((e) => { console.error(`scrub: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
