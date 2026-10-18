/// <reference types="node" />
/**
 * The scheduled maintenance, run against the data directly (the service also runs it at start and hourly): purge accounts whose deletion grace has run
 * out, prune ended sessions, spent tokens and old security-log lines. Safe to run while the service is up.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/ops/purge.mts -- --data /var/lib/go-repository [--dry-run]
 *
 * Postgres when DATABASE_URL is set. `--dry-run` only lists how many accounts are due. Prints counts, never names or addresses.
 */
import { resolve, join } from 'node:path';
import { parseArgs } from './lib.mts';
import { runMaintenance } from '../../packages/repository-service/src/purge';
import { createPgPool, openPostgresStore, openSqliteStore } from '../../packages/repository-store/src';

async function main(): Promise<void> {
  const { flags, values } = parseArgs(process.argv.slice(2), { flags: ['dry-run'], values: ['data'] });
  const env = process.env;
  const store = env.DATABASE_URL
    ? await openPostgresStore(await createPgPool(env.DATABASE_URL, { max: 2 }))
    : openSqliteStore(join(resolve(values.data ?? env.REPOSITORY_DATA_DIR ?? 'data/repository'), 'repository.sqlite'));
  try {
    if (!store.security) throw new Error('this store has no security port; nothing to purge');
    if (flags.has('dry-run')) {
      const due = await store.security.listAccountsDeletionDue(new Date().toISOString(), 1000);
      console.log(`purge: dry run: ${due.length} account(s) are past their deletion grace`);
      return;
    }
    const r = await runMaintenance(store, { log: (l) => console.log(`purge: ${l}`) });
    console.log(`purge: purged=${r.purged} sessionsPruned=${r.sessionsPruned} tokensPruned=${r.tokensPruned} securityEventsPruned=${r.securityEventsPruned}`);
  } finally { await store.close(); }
}

main().catch((e) => { console.error(`purge: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
