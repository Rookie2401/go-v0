// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import { applyMigrations, exportLearner, openSqliteStore, readMigrations } from '../../../packages/repository-store/src';
import { storeConformance } from './conformance';
import { L1, L2, doc, encounter, ev, unit } from './fixtures';

const tmp = mkdtempSync(join(tmpdir(), 'repo-store-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const fresh = (): string => join(tmp, `db-${++n}`, 'repo.sqlite');
const MIGRATIONS = new URL('../../../packages/repository-store/migrations/', import.meta.url);

storeConformance('sqlite store (:memory:)', async () => openSqliteStore(':memory:'));
storeConformance('sqlite store (file)', async () => openSqliteStore(fresh()));

describe('sqlite store: schema and migrations', () => {
  it('applies 001-initial on first open and nothing on a reopen; data persists', async () => {
    const path = fresh();
    const a = openSqliteStore(path);
    await a.append(L1, [ev('e1', { subject: { itemIds: ['u1'] } }), encounter('e2')]);
    await a.putDocument(doc(L1, 'd1', 'persisted text'), 0);
    await a.putUnits([unit('lemma:sq:a:NOUN', 'verified')]);
    await a.close();

    const raw1 = new DatabaseSync(path);
    const versions1 = raw1.prepare('SELECT version, name FROM schema_version').all();
    raw1.close();
    expect(versions1).toEqual([{ version: 1, name: '001-initial.sql' }]);

    const b = openSqliteStore(path);
    expect((await b.list({ learnerId: L1 })).map((e) => [e.id, e.seq])).toEqual([['e1', 1], ['e2', 2]]);
    expect((await b.getDocument(L1, 'd1'))!.body).toBe('persisted text');
    expect((await b.getUnits(['lemma:sq:a:NOUN']))[0].status).toBe('verified');
    expect((await b.list({ learnerId: L1, unitId: 'u1' })).map((e) => e.id)).toEqual(['e1']);
    await b.append(L1, [ev('e3')]);
    expect((await b.get(L1, 'e3'))!.seq).toBe(3); // seq continues across reopen
    await b.close();

    const raw2 = new DatabaseSync(path);
    expect(raw2.prepare('SELECT COUNT(*) AS n FROM schema_version').get()).toEqual({ n: 1 });
    raw2.close();
  });

  it('the migration runner reports what it applied and is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    expect(applyMigrations(db)).toEqual(['001-initial.sql']);
    expect(applyMigrations(db)).toEqual([]);
    db.close();
  });

  it('schema.sql describes exactly the migrated database', () => {
    const migrated = new DatabaseSync(':memory:');
    applyMigrations(migrated);
    const documented = new DatabaseSync(':memory:');
    documented.exec(readFileSync(new URL('../../../packages/repository-store/schema.sql', import.meta.url), 'utf8'));
    const shape = (db: DatabaseSync) => db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    expect(shape(documented)).toEqual(shape(migrated));
    const cols = (db: DatabaseSync, t: string) => db.prepare(`SELECT name, type, "notnull", pk FROM pragma_table_info('${t}')`).all();
    for (const t of (shape(migrated) as Array<{ type: string; name: string }>).filter((r) => r.type === 'table').map((r) => r.name)) {
      expect(cols(documented, t), t).toEqual(cols(migrated, t));
    }
    migrated.close();
    documented.close();
  });

  it('has the tables the design names, a composite event key and the partial unique index on dedupe_key', () => {
    const db = new DatabaseSync(':memory:');
    applyMigrations(db);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name);
    for (const t of ['schema_version', 'learners', 'accounts', 'sessions', 'devices', 'teams', 'team_members', 'enrolments', 'events', 'event_units', 'units', 'relations', 'analyses', 'aliases', 'packs', 'knowledge', 'projection_cursor', 'preferences', 'documents', 'tombstones']) {
      expect(tables, t).toContain(t);
    }
    const pk = (db.prepare("SELECT name FROM pragma_table_info('events') WHERE pk > 0 ORDER BY pk").all() as Array<{ name: string }>).map((r) => r.name);
    expect(pk).toEqual(['learner_id', 'seq']);
    const idx = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'events_dedupe'").get() as { sql: string };
    expect(idx.sql).toMatch(/UNIQUE/i);
    expect(idx.sql).toMatch(/WHERE dedupe_key IS NOT NULL/i);
    db.close();
  });

  it('refuses an applied migration that was edited afterwards', () => {
    const dir = join(tmp, 'edited-migrations');
    mkdirSync(dir, { recursive: true });
    copyFileSync(new URL('001-initial.sql', MIGRATIONS), join(dir, '001-initial.sql'));
    const path = fresh();
    openSqliteStore(path, { migrationsDir: dir }).close();
    writeFileSync(join(dir, '001-initial.sql'), readFileSync(join(dir, '001-initial.sql'), 'utf8') + '\n-- a late edit\n');
    expect(() => openSqliteStore(path, { migrationsDir: dir })).toThrow(/edited after it was applied/);
  });

  it('applies a later migration once, in order, and refuses a database newer than the code', () => {
    const dir = join(tmp, 'two-migrations');
    mkdirSync(dir, { recursive: true });
    copyFileSync(new URL('001-initial.sql', MIGRATIONS), join(dir, '001-initial.sql'));
    const path = fresh();
    openSqliteStore(path, { migrationsDir: dir }).close();
    writeFileSync(join(dir, '002-extra.sql'), 'CREATE TABLE extra (id TEXT PRIMARY KEY) STRICT;');
    openSqliteStore(path, { migrationsDir: dir }).close();
    openSqliteStore(path, { migrationsDir: dir }).close(); // third open: nothing to do
    const raw = new DatabaseSync(path);
    expect(raw.prepare('SELECT version FROM schema_version ORDER BY version').all()).toEqual([{ version: 1 }, { version: 2 }]);
    raw.close();
    // the original code (only 001) must not open a database that has 002
    expect(() => openSqliteStore(path)).toThrow(/newer than the code/);
  });

  it('a failing migration leaves nothing half-applied', () => {
    const dir = join(tmp, 'broken-migration');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '001-bad.sql'), 'CREATE TABLE ok (id TEXT) STRICT; CREATE TABLE ok (id TEXT) STRICT;');
    const path = fresh();
    expect(() => openSqliteStore(path, { migrationsDir: dir })).toThrow(/001-bad\.sql failed/);
    const raw = new DatabaseSync(path);
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'ok'").all()).toEqual([]);
    raw.close();
  });

  it('reads migrations in order and ignores other files', () => {
    expect(readMigrations().map((m) => m.name)).toEqual(['001-initial.sql']);
  });

  it('opens file databases in WAL mode with foreign keys on', async () => {
    const path = fresh();
    const s = openSqliteStore(path);
    await s.append(L1, [ev('e1')]);
    const raw = new DatabaseSync(path);
    expect(raw.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    raw.close();
    await s.close();
  });

  it('close is idempotent', async () => {
    const s = openSqliteStore(':memory:');
    await s.close();
    await s.close();
  });
});

describe('sqlite store: transactions', () => {
  it('rolls back everything fn did when fn throws', async () => {
    const s = openSqliteStore(':memory:');
    await s.append(L1, [ev('before')]);
    await expect(s.transaction(async () => {
      await s.append(L1, [ev('inside-1'), ev('inside-2', { dedupeKey: 'k' })]);
      await s.putDocument(doc(L1, 'd1', 'inside'), 0);
      await s.putUnits([unit('lemma:sq:t:NOUN', 'verified')]);
      await s.putTombstone({ tombstoneId: 'tt', learnerId: L1, scope: { kind: 'event', id: 'zz' }, createdAt: '2026-10-09T00:00:00.000Z' });
      expect(await s.head(L1)).toBe(3); // visible inside
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect((await s.list({ learnerId: L1 })).map((e) => e.id)).toEqual(['before']);
    expect(await s.head(L1)).toBe(1);
    expect(await s.getDocument(L1, 'd1')).toBeUndefined();
    expect(await s.getUnits(['lemma:sq:t:NOUN'])).toEqual([]);
    expect(await s.listTombstones(L1)).toEqual([]);
    // the dedupe key was rolled back too, and seq reused (it never committed)
    expect(await s.append(L1, [ev('again', { dedupeKey: 'k' })])).toEqual([{ id: 'again', stored: true }]);
    expect((await s.get(L1, 'again'))!.seq).toBe(2);
    await s.close();
  });

  it('commits when fn returns, and the store is usable afterwards', async () => {
    const s = openSqliteStore(':memory:');
    const r = await s.transaction(async () => { await s.append(L1, [ev('e1'), ev('e2')]); return 'done'; });
    expect(r).toBe('done');
    expect(await s.head(L1)).toBe(2);
    await s.append(L1, [ev('e3')]);
    expect(await s.head(L1)).toBe(3);
    await s.close();
  });

  it('a failing batch inside append is atomic: a throwing write rolls the whole call back', async () => {
    const s = openSqliteStore(':memory:');
    await s.putAccount({ accountId: 'a1', learnerId: L1, email: 'x@example.com', createdAt: '2026-10-01T00:00:00.000Z', passwordHash: 'h' });
    await expect(s.putAccount({ accountId: 'a2', learnerId: L2, email: 'X@example.com', createdAt: '2026-10-01T00:00:00.000Z', passwordHash: 'h' })).rejects.toThrow();
    expect((await s.getAccountByEmail('x@example.com'))!.accountId).toBe('a1');
    await s.close();
  });

  it('a nested transaction is a savepoint: its rollback leaves the outer work intact', async () => {
    const s = openSqliteStore(':memory:');
    await s.transaction(async () => {
      await s.append(L1, [ev('outer')]);
      await expect(s.transaction(async () => { await s.append(L1, [ev('inner')]); throw new Error('inner failed'); })).rejects.toThrow('inner failed');
      await s.append(L1, [ev('after')]);
    });
    expect((await s.list({ learnerId: L1 })).map((e) => e.id)).toEqual(['outer', 'after']);
    await s.close();
  });

  it('work started outside an open transaction waits for it, so a rollback cannot take it along', async () => {
    const s = openSqliteStore(':memory:');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const tx = s.transaction(async () => {
      await s.append(L1, [ev('inside')]);
      await gate;
      throw new Error('abort');
    });
    const outsider = s.append(L2, [ev('outside', { learnerId: L2 })]); // issued while the transaction is open
    const second = s.transaction(async () => { await s.append(L2, [ev('second', { learnerId: L2 })]); });
    await new Promise((r) => setTimeout(r, 20));
    release();
    await expect(tx).rejects.toThrow('abort');
    expect(await outsider).toEqual([{ id: 'outside', stored: true }]);
    await second;
    expect(await s.list({ learnerId: L1 })).toEqual([]);
    expect((await s.list({ learnerId: L2 })).map((e) => e.id)).toEqual(['outside', 'second']);
    await s.close();
  });

  it('deleting events removes their unit index rows (foreign keys are on)', async () => {
    const path = fresh();
    const s = openSqliteStore(path);
    await s.append(L1, [ev('e1', { subject: { itemIds: ['u1', 'u2'] } })]);
    expect(await s.deleteEvents(L1, ['e1', 'missing'])).toBe(1);
    const raw = new DatabaseSync(path);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM event_units').get()).toEqual({ n: 0 });
    raw.close();
    await s.close();
  });

  it('stamps recordedAt from the injected clock', async () => {
    const s = openSqliteStore(':memory:', { now: () => '2026-10-08T12:00:00.000Z' });
    await s.append(L1, [ev('e1')]);
    expect((await s.get(L1, 'e1'))!.recordedAt).toBe('2026-10-08T12:00:00.000Z');
    await s.close();
  });

  it('enforces the id and the (learner, dedupe_key) uniqueness in the schema itself', async () => {
    const path = fresh();
    const s = openSqliteStore(path);
    await s.append(L1, [ev('e1', { dedupeKey: 'k' })]);
    const raw = new DatabaseSync(path);
    const ins = (id: string, learner: string, seq: number, key: string | null) =>
      raw.prepare("INSERT INTO events (learner_id, seq, id, dedupe_key, kind, at, at_ms, recorded_at, language_id, enrolment_id, json) VALUES (?, ?, ?, ?, 'EncounterRecorded', 'a', 0, 'r', 'sq', 'en', '{}')").run(learner, seq, id, key);
    expect(() => ins('e1', L1, 9, null)).toThrow(); // duplicate id
    expect(() => ins('e9', L1, 9, 'k')).toThrow(); // duplicate (learner, key)
    expect(() => ins('e8', L1, 1, null)).toThrow(); // duplicate (learner, seq)
    expect(() => ins('e7', L2, 1, 'k')).not.toThrow(); // another learner may use both
    expect(() => ins('e6', L1, 7, null)).not.toThrow();
    expect(() => ins('e5', L1, 8, null)).not.toThrow(); // null keys never collide
    raw.close();
    await s.close();
  });

  it('exports the same data from a reopened file', async () => {
    const path = fresh();
    const a = openSqliteStore(path);
    await a.append(L1, [ev('e1'), ev('e2')]);
    await a.putDocument(doc(L1, 'd1', 'text'), 0);
    await a.close();
    const b = openSqliteStore(path);
    const x = await exportLearner(b, L1);
    expect(x.events.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(x.documents.map((d) => d.body)).toEqual(['text']);
    await b.close();
  });
});
