// @vitest-environment node
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, applyMigrations, copySqliteToPostgres, openPostgresStore, openSqliteStore } from '../../../packages/repository-store/src';
import { pgliteTestPool } from './pg-pool';
import type { TestPool } from './pg-pool';
import { L1, L2, account, alias, analysis, device, doc, encounter, enrolment, ev, knowledgeRow, pack, preferences, relation, session, tombstone, unit } from './fixtures';

const tmp = mkdtempSync(join(tmpdir(), 'copy-pg-'));
let pool: TestPool;
beforeAll(async () => { pool = pgliteTestPool(); await (await openPostgresStore(pool)).close(); }, 60_000);
afterAll(async () => { await pool.destroy(); try { rmSync(tmp, { recursive: true, force: true }); } catch { /* locked on Windows */ } });

async function populated(path: string): Promise<void> {
  const s = openSqliteStore(path);
  await s.putLearner({ learnerId: L1, createdAt: '2026-10-01T00:00:00.000Z', displayName: 'Ana' });
  await s.putLearner({ learnerId: L2, createdAt: '2026-10-01T00:00:00.000Z' });
  await s.putAccount({ ...account('a1', L1, 'ana@example.com'), verifiedAt: '2026-10-01T00:00:00.000Z' });
  await s.putAccount(account('a2', L2, 'bob@example.com'));
  await s.putSession(session('s1', L1, 'th1'));
  await s.putDevice(device(L1, 'dev-1'));
  await s.putEnrolment(enrolment('en1', L1));
  await s.append(L1, [ev('e1', { subject: { itemIds: ['u1', 'u2'] } }), encounter('e2'), ev('e3', { dedupeKey: 'k' })]);
  await s.append(L2, [ev('x1', { learnerId: L2 })]);
  await s.putUnits([unit('lemma:sq:a:NOUN', 'verified')]);
  await s.putRelations([relation('lemma:sq:a:NOUN', 'lemma:sq:b:NOUN')]);
  await s.putAnalyses([analysis('an1')]);
  await s.putAliases([alias('old', 'new')]);
  await s.putPack(pack('pack-sq', '1'));
  await s.putKnowledge([knowledgeRow(L1, 'u1')]);
  await s.putProjectionCursor(L1, { seq: 3, modelVersion: 'm1' });
  await s.putPreferences(preferences(L1));
  await s.putDocument(doc(L1, 'd1', 'private words ëë'), 0);
  await s.putTombstone(tombstone('t1', L1, { kind: 'event', id: 'gone' }));
  await s.security!.putAccountToken({ tokenHash: 'h', accountId: 'a1', purpose: 'verify-email', createdAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-10-02T00:00:00.000Z' });
  await s.security!.appendSecurityEvent({ eventId: 'se1', learnerId: L1, kind: 'sign-in', at: '2026-10-01T00:00:00.000Z' });
  await s.close();
}

describe('copying a SQLite database into Postgres', () => {
  it('copies every table, verifies, commits, and what Postgres then serves equals what SQLite served', async () => {
    const path = join(tmp, 'a.sqlite');
    await populated(path);
    await pool.reset();
    const logs: string[] = [];
    const report = await copySqliteToPostgres(path, pool, { log: (l) => logs.push(l), markReady: true });
    expect(report.refusal).toBeUndefined();
    expect(report.committed).toBe(true);
    expect(report.learners).toBe(2);
    expect(report.events).toBe(4);
    for (const t of report.tables) expect(t.postgres, t.table).toBe(t.sqlite);
    expect(report.tables.find((t) => t.table === 'events')).toEqual({ table: 'events', sqlite: 4, postgres: 4 });

    const sqlite = openSqliteStore(path);
    const pg = await openPostgresStore(pool);
    expect(await pg.list({ learnerId: L1 })).toEqual(await sqlite.list({ learnerId: L1 }));
    expect(await pg.head(L1)).toBe(await sqlite.head(L1));
    expect(await pg.getDocument(L1, 'd1')).toEqual(await sqlite.getDocument(L1, 'd1'));
    expect(await pg.getAccountByEmail('ana@example.com')).toEqual(await sqlite.getAccountByEmail('ana@example.com'));
    expect(await pg.getSessionByTokenHash('th1')).toEqual(await sqlite.getSessionByTokenHash('th1'));
    expect(await pg.listEnrolments(L1)).toEqual(await sqlite.listEnrolments(L1));
    expect(await pg.getKnowledge(L1)).toEqual(await sqlite.getKnowledge(L1));
    expect(await pg.getUnits(['lemma:sq:a:NOUN'])).toEqual(await sqlite.getUnits(['lemma:sq:a:NOUN']));
    expect(await pg.listTombstones(L1)).toEqual(await sqlite.listTombstones(L1));
    expect(await pg.security!.listSecurityEvents(L1)).toEqual(await sqlite.security!.listSecurityEvents(L1));
    expect(await pg.getServiceState!('migration-ready')).toBe('verified');
    expect(await pg.getServiceState!('migrated-from-sqlite')).toMatch(/learners=2 events=4$/);
    // the sequence continues where it stopped
    await pg.append(L1, [ev('after')]);
    expect((await pg.get(L1, 'after'))?.seq).toBe(4);
    await sqlite.close();
    expect(logs.some((l) => l.startsWith('copied events: 4'))).toBe(true);
  });

  it('refuses to run twice onto a non-empty target and changes nothing', async () => {
    const path = join(tmp, 'b.sqlite');
    await populated(path);
    await pool.reset();
    expect((await copySqliteToPostgres(path, pool)).committed).toBe(true);
    const again = await copySqliteToPostgres(path, pool);
    expect(again.committed).toBe(false);
    expect(again.refusal).toMatch(/already holds rows/);
    const pg = await openPostgresStore(pool);
    expect((await pg.list({ learnerId: L1 })).length).toBe(3);
  });

  it('refuses a target that already has any data, even one row', async () => {
    const path = join(tmp, 'c.sqlite');
    await populated(path);
    await pool.reset();
    const pg = await openPostgresStore(pool);
    await pg.putTeam({ teamId: 'team-x', name: 'X', createdAt: '2026-10-01T00:00:00.000Z' } as never);
    const r = await copySqliteToPostgres(path, pool);
    expect(r.committed).toBe(false);
    expect(r.refusal).toMatch(/"teams"/);
  });

  it('a dry run verifies and leaves the target empty', async () => {
    const path = join(tmp, 'd.sqlite');
    await populated(path);
    await pool.reset();
    const r = await copySqliteToPostgres(path, pool, { dryRun: true, markReady: true });
    expect(r.committed).toBe(false);
    expect(r.refusal).toBeUndefined();
    expect(r.events).toBe(4);
    const pg = await openPostgresStore(pool);
    expect(await pg.list({ learnerId: L1 })).toEqual([]);
    expect(await pg.getServiceState!('migration-ready')).toBeUndefined();
    expect((await copySqliteToPostgres(path, pool)).committed).toBe(true); // and the real run works afterwards
  });

  it('brings an older SQLite database (migrations 001 to 003 only) up to date in the snapshot, and leaves the source untouched', async () => {
    const path = join(tmp, 'old.sqlite');
    const dir = join(tmp, 'old-migrations');
    mkdirSync(dir, { recursive: true });
    for (const f of ['001-initial.sql', '002-provenance.sql', '003-vocabulary-page-index.sql']) copyFileSync(new URL(f, MIGRATIONS_DIR), join(dir, f));
    const db = new DatabaseSync(path);
    applyMigrations(db, dir);
    db.prepare("INSERT INTO accounts (account_id, learner_id, email, password_hash, created_at) VALUES ('a1', 'l1', 'ana@example.com', 'h', '2026-10-01T00:00:00.000Z')").run();
    db.prepare('INSERT INTO learners (learner_id, json) VALUES (?, ?)').run('l1', JSON.stringify({ learnerId: 'l1', createdAt: '2026-10-01T00:00:00.000Z' }));
    db.close();
    await pool.reset();
    expect((await copySqliteToPostgres(path, pool)).committed).toBe(true);
    const pg = await openPostgresStore(pool);
    // the accounts that predate verification are marked verified, at their creation time
    expect((await pg.getAccountByEmail('ana@example.com'))?.verifiedAt).toBe('2026-10-01T00:00:00.000Z');
    const after = new DatabaseSync(path, { readOnly: true });
    expect((after.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number }).v).toBe(3);
    after.close();
  });
});
