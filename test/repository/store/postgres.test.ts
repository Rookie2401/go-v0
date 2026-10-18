// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyPgMigrations, openPostgresStore, readPgMigrations } from '../../../packages/repository-store/src';
import type { ConcreteStore } from '../../../packages/repository-store/src';
import { storeConformance } from './conformance';
import { storeProvenanceConformance } from './provenance';
import { securityConformance } from './security';
import { TEST_DATABASE_URL, pgliteTestPool, realPgTestPool } from './pg-pool';
import type { TestPool } from './pg-pool';
import { L1, ev } from './fixtures';

/**
 * The Postgres store against real PostgreSQL semantics. Always runs against PGlite (Postgres in WebAssembly, in process). The same suites run again
 * against a server when TEST_DATABASE_URL is set (they work in a throw-away schema, `go_repository_test`, and drop it afterwards).
 */
function postgresSuites(label: string, makePool: () => Promise<TestPool>): void {
  describe(label, () => {
    let pool: TestPool;
    beforeAll(async () => {
      pool = await makePool();
      await (await openPostgresStore(pool)).close(); // migrate once; each case then starts from empty tables
    }, 60_000);
    afterAll(async () => { await pool?.destroy(); });
    const open = async (): Promise<ConcreteStore> => { await pool.reset(); return openPostgresStore(pool); };

    storeConformance(`${label}: store`, open);
    storeProvenanceConformance(`${label}: store`, open);
    securityConformance(`${label}: store`, open);

    describe('postgres specifics', () => {
      it('records the migrations it applied and applies nothing on a reopen', async () => {
        const rows = (await pool.query('SELECT version, name FROM schema_version ORDER BY version')).rows;
        expect(rows.map((r) => [Number(r.version), r.name])).toEqual(readPgMigrations().map((m) => [m.version, m.name]));
        expect(await applyPgMigrations(pool)).toEqual([]);
      });

      it('refuses a migration file that was edited after it was applied', async () => {
        const dir = new URL('../../../packages/repository-store/migrations-pg/', import.meta.url);
        const real = readPgMigrations(dir);
        await pool.query('UPDATE schema_version SET checksum = $1 WHERE version = $2', ['0'.repeat(64), real[0]!.version]);
        try {
          await expect(applyPgMigrations(pool)).rejects.toThrow(/edited after it was applied/);
        } finally {
          await pool.query('UPDATE schema_version SET checksum = $1 WHERE version = $2', [real[0]!.checksum, real[0]!.version]);
        }
      });

      it('assigns consecutive sequence numbers to concurrent appends for one learner (advisory lock)', async () => {
        const s = await open();
        const batches = Array.from({ length: 8 }, (_, b) => s.append(L1, Array.from({ length: 5 }, (_, i) => ev(`c-${b}-${i}`))));
        const outcomes = (await Promise.all(batches)).flat();
        expect(outcomes.every((o) => o.stored)).toBe(true);
        const seqs = (await s.list({ learnerId: L1, limit: 100 })).map((e) => e.seq);
        expect(seqs).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
        expect(await s.head(L1)).toBe(40);
        await s.close();
      });

      it('a transaction that throws leaves nothing behind, one that commits keeps everything', async () => {
        const s = await open();
        await expect(s.transaction(async () => {
          await s.append(L1, [ev('t1')]);
          await s.putLearner({ learnerId: L1, createdAt: '2026-01-01T00:00:00.000Z' });
          throw new Error('boom');
        })).rejects.toThrow('boom');
        expect(await s.get(L1, 't1')).toBeUndefined();
        expect(await s.getLearner(L1)).toBeUndefined();
        expect(await s.head(L1)).toBe(0);
        await s.transaction(async () => { await s.append(L1, [ev('t2')]); });
        expect((await s.get(L1, 't2'))?.seq).toBe(1);
        await s.close();
      });

      it('reports its kind, schema version and counters for monitoring', async () => {
        const s = await open();
        await s.append(L1, [ev('m1'), ev('m2')]);
        const stats = await s.stats!();
        expect(stats).toMatchObject({ kind: 'postgres', eventsIssued: 2, schemaVersion: readPgMigrations().at(-1)!.version });
        expect(typeof stats.sizeBytes).toBe('number');
        await s.setServiceState!('migration-ready', 'verified');
        expect(await s.getServiceState!('migration-ready')).toBe('verified');
        expect(await s.getServiceState!('nothing')).toBeUndefined();
        await s.close();
      });
    });
  });
}

postgresSuites('postgres (PGlite)', async () => pgliteTestPool());

describe.skipIf(!TEST_DATABASE_URL)('postgres (TEST_DATABASE_URL)', () => {
  postgresSuites('postgres (server)', realPgTestPool);
});
