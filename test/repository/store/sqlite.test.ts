// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import { applyMigrations, exportLearner, openSqliteStore, readMigrations } from '../../../packages/repository-store/src';
import { storeConformance } from './conformance';
import { storeProvenanceConformance } from './provenance';
import { L1, L2, analysis, doc, encounter, ev, knowledgeRow, relation, unit } from './fixtures';

const tmp = mkdtempSync(join(tmpdir(), 'repo-store-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const fresh = (): string => join(tmp, `db-${++n}`, 'repo.sqlite');
const MIGRATIONS = new URL('../../../packages/repository-store/migrations/', import.meta.url);

storeConformance('sqlite store (:memory:)', async () => openSqliteStore(':memory:'));
storeConformance('sqlite store (file)', async () => openSqliteStore(fresh()));
storeProvenanceConformance('sqlite store (:memory:)', async () => openSqliteStore(':memory:'));
storeProvenanceConformance('sqlite store (file)', async () => openSqliteStore(fresh()));

describe('sqlite store: schema and migrations', () => {
  it('pages a 10k encountered catalog by indexed stable unit id and reports exact level counts', async () => {
    const store = openSqliteStore(':memory:');
    const rows = Array.from({ length: 10_000 }, (_, i) => {
      const row = knowledgeRow(L1, `lemma:sq:word-${String(i).padStart(5, '0')}:NOUN`);
      return { ...row, level: i % 2 ? 'seen' as const : 'new' as const, encounters: 1 };
    });
    await store.putKnowledge(rows);
    const started = performance.now();
    const read: string[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await store.getKnowledgePage!(L1, { languageId: 'sq', after, limit: 500 });
      if (!page.length) break;
      read.push(...page.map((r) => r.unitId));
      after = page[page.length - 1]!.unitId;
    }
    const stats = await store.getEncounteredKnowledgeStats!(L1, 'sq');
    const elapsedMs = performance.now() - started;
    expect(read).toHaveLength(10_000);
    expect(new Set(read).size).toBe(10_000);
    expect(stats).toEqual({ total: 10_000, counts: { new: 5_000, seen: 5_000, recognized: 0, familiar: 0, known: 0, automatic: 0 } });
    expect(Number.isFinite(elapsedMs)).toBe(true); // recorded during local runs; intentionally no flaky wall-clock threshold
    await store.close();
  });
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
    expect(versions1).toEqual([{ version: 1, name: '001-initial.sql' }, { version: 2, name: '002-provenance.sql' }, { version: 3, name: '003-vocabulary-page-index.sql' }]);

    const b = openSqliteStore(path);
    expect((await b.list({ learnerId: L1 })).map((e) => [e.id, e.seq])).toEqual([['e1', 1], ['e2', 2]]);
    expect((await b.getDocument(L1, 'd1'))!.body).toBe('persisted text');
    expect((await b.getUnits(['lemma:sq:a:NOUN']))[0].status).toBe('verified');
    expect((await b.list({ learnerId: L1, unitId: 'u1' })).map((e) => e.id)).toEqual(['e1']);
    await b.append(L1, [ev('e3')]);
    expect((await b.get(L1, 'e3'))!.seq).toBe(3); // seq continues across reopen
    await b.close();

    const raw2 = new DatabaseSync(path);
    expect(raw2.prepare('SELECT COUNT(*) AS n FROM schema_version').get()).toEqual({ n: 3 });
    raw2.close();
  });

  it('the migration runner reports what it applied and is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    expect(applyMigrations(db)).toEqual(['001-initial.sql', '002-provenance.sql', '003-vocabulary-page-index.sql']);
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

  it('migration 002 back-fills origin and validation from the JSON of rows written under 001, and v2 rows read back unchanged', async () => {
    // a database as the v2 code left it: only 001 applied, rows whose JSON knows nothing of contract v3
    const dir = join(tmp, 'only-001');
    mkdirSync(dir, { recursive: true });
    copyFileSync(new URL('001-initial.sql', MIGRATIONS), join(dir, '001-initial.sql'));
    const path = fresh();
    mkdirSync(join(path, '..'), { recursive: true });
    const raw = new DatabaseSync(path);
    applyMigrations(raw, dir);
    const prov = (extra: object) => ({ source: 'rule', ref: 'x', confidence: 0.5, ...extra });
    const oldUnit = unit('lemma:sq:old:NOUN', 'provisional');
    raw.prepare("INSERT INTO units (unit_id, kind, language_id, label, status, json) VALUES (?, 'lexeme', 'sq', 'old', 'provisional', ?)").run(oldUnit.unitId, JSON.stringify(oldUnit));
    const oldRel = relation('form:sq:old', 'lemma:sq:old:NOUN');
    raw.prepare("INSERT INTO relations (from_id, relation, to_id, status, json) VALUES (?, ?, ?, 'provisional', ?)").run(oldRel.fromId, oldRel.relation, oldRel.toId, JSON.stringify(oldRel));
    const oldAnalysis = analysis('an-old');
    raw.prepare("INSERT INTO analyses (analysis_id, form_id, sentence_key, status, json) VALUES (?, ?, ?, 'provisional', ?)").run(oldAnalysis.analysisId, oldAnalysis.formId, oldAnalysis.sentenceKey ?? null, JSON.stringify(oldAnalysis));
    // rows a v3 writer would have stamped but a 001-only database could only have been given by hand (JSON is free-form): the back-fill reads them
    const putUnit = raw.prepare("INSERT INTO units (unit_id, kind, language_id, label, status, json) VALUES (?, 'lexeme', 'sq', ?, 'provisional', ?)");
    putUnit.run('lemma:sq:stamped:NOUN', 'stamped', JSON.stringify({ unitId: 'lemma:sq:stamped:NOUN', provenance: prov({ origin: 'learner-lookup', validation: 'experimental' }) }));
    putUnit.run('lemma:sq:half:NOUN', 'half', JSON.stringify({ unitId: 'lemma:sq:half:NOUN', provenance: prov({ origin: 'reviewer' }) }));
    raw.prepare("INSERT INTO relations (from_id, relation, to_id, status, json) VALUES ('form:sq:s', 'form-of', 'lemma:sq:s:NOUN', 'provisional', ?)")
      .run(JSON.stringify({ provenance: prov({ origin: 'dictionary', validation: 'seed-only' }) }));
    const putAnalysis = raw.prepare("INSERT INTO analyses (analysis_id, form_id, sentence_key, status, json) VALUES (?, 'form:sq:s', NULL, 'provisional', ?)");
    putAnalysis.run('an-own', JSON.stringify({ provenance: prov({ origin: 'learner-lookup', validation: 'experimental' }), candidates: [{ provenance: prov({ origin: 'dictionary' }) }], chosen: 0 }));
    putAnalysis.run('an-chosen', JSON.stringify({ candidates: [{ provenance: prov({ origin: 'dictionary' }) }, { provenance: prov({ origin: 'rule-derived', validation: 'seed-only' }) }], chosen: 1 }));
    putAnalysis.run('an-first', JSON.stringify({ candidates: [{ provenance: prov({ origin: 'dictionary' }) }, { provenance: prov({ origin: 'rule-derived' }) }] }));
    putAnalysis.run('an-ownbare', JSON.stringify({ provenance: prov({}), candidates: [{ provenance: prov({ origin: 'dictionary' }) }], chosen: 0 }));
    raw.close();

    const s = openSqliteStore(path); // applies 002 to the existing rows
    expect(await s.provenanceStats()).toEqual([
      { table: 'analyses', origin: 'dictionary', validation: 'unreviewed', count: 1 },
      { table: 'analyses', origin: 'import', validation: 'unreviewed', count: 2 }, // an-old and an-ownbare (own provenance without an origin)
      { table: 'analyses', origin: 'learner-lookup', validation: 'experimental', count: 1 },
      { table: 'analyses', origin: 'rule-derived', validation: 'seed-only', count: 1 },
      { table: 'relations', origin: 'dictionary', validation: 'seed-only', count: 1 },
      { table: 'relations', origin: 'import', validation: 'unreviewed', count: 1 },
      { table: 'units', origin: 'import', validation: 'unreviewed', count: 1 },
      { table: 'units', origin: 'learner-lookup', validation: 'experimental', count: 1 },
      { table: 'units', origin: 'reviewer', validation: 'unreviewed', count: 1 },
    ]);
    // the old rows still read as they were written: nothing was added to their JSON
    expect((await s.getUnits(['lemma:sq:old:NOUN']))[0].provenance).toEqual({ source: 'dictionary', ref: 'pack:sq:1', confidence: 0.9 });
    expect((await s.getAnalysis('an-old'))!.provenance).toBeUndefined();
    // and the migrated database accepts v3 writes into the same columns
    await s.putUnits([unit('lemma:sq:new:NOUN', 'provisional', { provenance: prov({ origin: 'learner-lookup', validation: 'unreviewed' }) as never })]);
    expect((await s.provenanceStats()).find((c) => c.table === 'units' && c.origin === 'learner-lookup' && c.validation === 'unreviewed')?.count).toBe(1);
    await s.close();
    const check = new DatabaseSync(path);
    expect(check.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('units_origin', 'relations_origin', 'analyses_origin') ORDER BY name").all())
      .toEqual([{ name: 'analyses_origin' }, { name: 'relations_origin' }, { name: 'units_origin' }]);
    check.close();
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
    copyFileSync(new URL('002-provenance.sql', MIGRATIONS), join(dir, '002-provenance.sql'));
    const path = fresh();
    openSqliteStore(path, { migrationsDir: dir }).close();
    writeFileSync(join(dir, '004-extra.sql'), 'CREATE TABLE extra (id TEXT PRIMARY KEY) STRICT;');
    openSqliteStore(path, { migrationsDir: dir }).close();
    openSqliteStore(path, { migrationsDir: dir }).close(); // third open: nothing to do
    const raw = new DatabaseSync(path);
    expect(raw.prepare('SELECT version FROM schema_version ORDER BY version').all()).toEqual([{ version: 1 }, { version: 2 }, { version: 4 }]);
    raw.close();
    // the shipped code (001 and 002) must not open a database that has 003
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
    expect(readMigrations().map((m) => m.name)).toEqual(['001-initial.sql', '002-provenance.sql', '003-vocabulary-page-index.sql']);
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
