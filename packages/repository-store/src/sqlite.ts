/**
 * The SQLite Repository store on Node's built-in `node:sqlite` (no third-party dependency). Same port and the same
 * rules (./rules) as the memory store; the schema is `migrations/001-initial.sql` (documented in `schema.sql`).
 *
 * Transactions. `DatabaseSync` is synchronous, so every write batch runs between BEGIN IMMEDIATE and COMMIT in one
 * synchronous block. `transaction(fn)` keeps one transaction open across the awaits of `fn`; while it is open, calls made
 * from outside `fn` wait for it (AsyncLocalStorage tells the two apart), so unrelated work never lands inside it and a
 * throw inside `fn` rolls back everything `fn` did. A transaction inside a transaction becomes a savepoint.
 *
 * No SQL is built from values: every value is a bound parameter. The only text assembled is the `?` placeholder list.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import type {
  Account, AppendOutcome, AssistancePreferences, Device, Enrolment, EventFilter, FormAnalysis, LanguagePackInfo, Learner, LinguisticUnit,
  PrivateDocument, Session, StoredEvent, Team, Tombstone, UnitAlias, UnitKnowledge, UnitRelation,
} from '../../repository-contract/src';
import { applyMigrations } from './migrate';
import {
  appendIssues, assertSameOwner, atMs, byKey, clampLimit, decidePutDocument, defaultNow, deletedDocument, envelopeOf, invalidated, latestPack,
  mayReplaceAnalysis, mayReplaceByRank, normalizeEmail, outcomeId, sortPacks, zeroErase,
} from './rules';
import type { ConcreteStore, EraseCounts, StoreOptions } from './rules';
import { applyTombstone as applyDeletion } from './deletion';

export interface SqliteOptions extends StoreOptions {
  /** A different migrations directory (tests of the runner); defaults to the package's own. */
  migrationsDir?: URL | string;
}

type Row = Record<string, unknown>;
type Param = string | number | null;

const parse = <T>(row: Row, col = 'json'): T => JSON.parse(row[col] as string) as T;
const text = (v: unknown): string => JSON.stringify(v);
const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');
const chunks = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** Opens (creating, and migrating to the latest schema) the store at `path`; `':memory:'` for a throw-away one. */
export function openSqliteStore(path: string | ':memory:', opts: SqliteOptions = {}): ConcreteStore {
  const now = opts.now ?? defaultNow;
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    // Physical erasure (audit P-11): a deleted cell and a freed page are overwritten with zeros instead of left in the file.
    db.exec('PRAGMA secure_delete = ON');
    if (path !== ':memory:') { db.exec('PRAGMA journal_mode = WAL'); db.exec('PRAGMA synchronous = NORMAL'); }
    applyMigrations(db, opts.migrationsDir, now);
  } catch (e) {
    db.close();
    throw e;
  }

  const cache = new Map<string, StatementSync>();
  const st = (sql: string): StatementSync => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  const get = (sql: string, ...p: Param[]): Row | undefined => st(sql).get(...p) as Row | undefined;
  const all = (sql: string, ...p: Param[]): Row[] => st(sql).all(...p) as Row[];
  const run = (sql: string, ...p: Param[]): number => Number(st(sql).run(...p).changes);

  // ───────────── transactions ─────────────
  let depth = 0;
  let savepoints = 0;
  let open: Promise<void> | undefined;
  const inside = new AsyncLocalStorage<true>();
  let closed = false;

  /** A synchronous atomic block: its own transaction, or a savepoint inside one. */
  function atomic<T>(fn: () => T): T {
    if (depth === 0) {
      db.exec('BEGIN IMMEDIATE');
      depth = 1;
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth = 0;
      }
    }
    const name = `sp${++savepoints}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
      const r = fn();
      db.exec(`RELEASE ${name}`);
      return r;
    } catch (e) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
      throw e;
    }
  }
  const gate = async (): Promise<void> => { while (open && !inside.getStore()) await open; };

  /**
   * Erasure leaves the learner's plaintext in the write-ahead log (the frames that wrote it) until a checkpoint folds the log into the file.
   * `secure_delete` zeroes the main file's pages; this empties the log. It runs after the outermost write of a deletion has committed (a
   * checkpoint cannot run inside a transaction), and is best effort: a reader holding the log open makes it a no-op that the next call retries.
   */
  let scrubWanted = false;
  const checkpoint = (): void => {
    if (path === ':memory:' || closed) return;
    try { db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get(); } catch { /* busy: the next deletion or compact() retries */ }
  };
  const scrubIfNeeded = (): void => { if (scrubWanted && depth === 0) { scrubWanted = false; checkpoint(); } };

  const tombstonedEvent = (learnerId: string, id: string): boolean =>
    get("SELECT 1 AS x FROM tombstones WHERE learner_id = ? AND scope_kind = 'event' AND event_id = ?", learnerId, id) !== undefined;

  const eventOfRow = (r: Row): StoredEvent => ({ ...parse<StoredEvent>(r), seq: Number(r.seq), recordedAt: r.recorded_at as string });
  const EVENT_COLS = 'e.seq AS seq, e.recorded_at AS recorded_at, e.json AS json';

  const documentOfRow = (r: Row): PrivateDocument => {
    const d: PrivateDocument = { ...parse<PrivateDocument>(r), body: r.body as string, revision: Number(r.revision) };
    if (r.deleted_at !== null) d.deletedAt = r.deleted_at as string;
    return d;
  };
  const putDocumentRow = (d: PrivateDocument): void => {
    const { body, revision, deletedAt, ...rest } = d;
    run(
      `INSERT INTO documents (learner_id, doc_id, revision, body, deleted_at, json) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (learner_id, doc_id) DO UPDATE SET revision = excluded.revision, body = excluded.body, deleted_at = excluded.deleted_at, json = excluded.json`,
      d.learnerId, d.docId, revision, body, deletedAt ?? null, text(rest),
    );
  };

  const accountOfRow = (r: Row): Account & { passwordHash: string } => {
    const a: Account & { passwordHash: string } = {
      accountId: r.account_id as string, learnerId: r.learner_id as string, email: r.email as string, createdAt: r.created_at as string, passwordHash: r.password_hash as string,
    };
    if (r.disabled_at !== null) a.disabledAt = r.disabled_at as string;
    return a;
  };
  const sessionOfRow = (r: Row): Session => {
    const s = parse<Session>(r);
    if (r.revoked_at !== null) s.revokedAt = r.revoked_at as string;
    return s;
  };
  const enrolmentOfRow = (r: Row): Enrolment => ({ ...parse<Enrolment>(r), goals: parse<Enrolment['goals']>(r, 'goals') });

  const impl: Omit<ConcreteStore, 'transaction' | 'close'> = {
    // ───────────────────────────── events ─────────────────────────────
    async append(learnerId, events) {
      return atomic(() => {
        const out: AppendOutcome[] = [];
        for (const e of events) {
          const id = outcomeId(e);
          const issues = appendIssues(learnerId, e);
          if (issues.length) { out.push({ id, stored: false, issues }); continue; }
          const owner = get('SELECT learner_id FROM events WHERE id = ?', e.id);
          if (owner) {
            out.push(owner.learner_id === learnerId ? { id, stored: false, duplicateOf: id } : { id, stored: false, issues: [{ path: 'id', message: 'event id already in use' }] });
            continue;
          }
          if (e.dedupeKey !== undefined) {
            const first = get('SELECT id FROM events WHERE learner_id = ? AND dedupe_key = ?', learnerId, e.dedupeKey);
            if (first) { out.push({ id, stored: false, duplicateOf: first.id as string }); continue; }
          }
          if (tombstonedEvent(learnerId, e.id)) { out.push({ id, stored: false, issues: [{ path: 'id', message: 'this event was deleted by a tombstone' }] }); continue; }
          const recordedAt = now();
          const seq = Number((get(
            'INSERT INTO event_heads (learner_id, head) VALUES (?, 1) ON CONFLICT (learner_id) DO UPDATE SET head = head + 1 RETURNING head',
            learnerId,
          ) as Row).head);
          run(
            `INSERT INTO events (learner_id, seq, id, dedupe_key, kind, at, at_ms, recorded_at, language_id, enrolment_id, json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            learnerId, seq, e.id, e.dedupeKey ?? null, e.kind, e.at, atMs(e.at), recordedAt, e.languageId, e.enrolmentId, text(envelopeOf(e, recordedAt)),
          );
          for (const unit of new Set(e.subject.itemIds ?? [])) run('INSERT OR IGNORE INTO event_units (event_id, unit_id) VALUES (?, ?)', e.id, unit);
          out.push({ id, stored: true });
        }
        return out;
      });
    },
    async list(f: EventFilter) {
      const where = ['e.learner_id = ?'];
      const params: Param[] = [f.learnerId];
      if (f.languageId !== undefined) { where.push('e.language_id = ?'); params.push(f.languageId); }
      if (f.kinds !== undefined) {
        if (!f.kinds.length) return [];
        where.push(`e.kind IN (${placeholders(f.kinds.length)})`);
        params.push(...f.kinds);
      }
      if (f.unitId !== undefined) { where.push('EXISTS (SELECT 1 FROM event_units u WHERE u.event_id = e.id AND u.unit_id = ?)'); params.push(f.unitId); }
      if (f.since !== undefined) {
        const ms = atMs(f.since);
        if (Number.isNaN(ms)) return [];
        where.push('e.at_ms >= ?');
        params.push(ms);
      }
      if (f.afterSeq !== undefined) { where.push('e.seq > ?'); params.push(f.afterSeq); }
      params.push(clampLimit(f.limit));
      const rows = db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE ${where.join(' AND ')} ORDER BY e.seq LIMIT ?`).all(...params) as Row[];
      return rows.map(eventOfRow);
    },
    async get(learnerId, id) {
      const r = get(`SELECT ${EVENT_COLS} FROM events e WHERE e.learner_id = ? AND e.id = ?`, learnerId, id);
      return r ? eventOfRow(r) : undefined;
    },
    async head(learnerId) {
      const r = get('SELECT head FROM event_heads WHERE learner_id = ?', learnerId);
      return r ? Number(r.head) : 0;
    },
    async deleteEvents(learnerId, ids) {
      scrubWanted = true;
      const n = atomic(() => ids.reduce((count, id) => count + run('DELETE FROM events WHERE learner_id = ? AND id = ?', learnerId, id), 0));
      scrubIfNeeded();
      return n;
    },

    // ───────────────────────────── layer A ─────────────────────────────
    async getUnits(ids) {
      const wanted = [...new Set(ids)];
      const found = new Map<string, LinguisticUnit>();
      for (const part of chunks(wanted, 500)) {
        const rows = db.prepare(`SELECT unit_id, json FROM units WHERE unit_id IN (${placeholders(part.length)})`).all(...part) as Row[];
        for (const r of rows) found.set(r.unit_id as string, parse<LinguisticUnit>(r));
      }
      return wanted.flatMap((id) => (found.has(id) ? [found.get(id)!] : []));
    },
    async putUnits(rows) {
      atomic(() => {
        for (const u of rows) {
          const cur = get('SELECT status FROM units WHERE unit_id = ?', u.unitId);
          if (!mayReplaceByRank(cur?.status as LinguisticUnit['status'] | undefined, u.status)) continue;
          run(
            `INSERT INTO units (unit_id, kind, language_id, label, status, json) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (unit_id) DO UPDATE SET kind = excluded.kind, language_id = excluded.language_id, label = excluded.label, status = excluded.status, json = excluded.json`,
            u.unitId, u.kind, u.languageId, u.label, u.status, text(u),
          );
        }
      });
    },
    async findUnits(q) {
      const where = ['language_id = ?'];
      const params: Param[] = [q.languageId];
      if (q.kind !== undefined) { where.push('kind = ?'); params.push(q.kind); }
      if (q.label !== undefined) { where.push('label = ?'); params.push(q.label); }
      params.push(clampLimit(q.limit));
      return (db.prepare(`SELECT json FROM units WHERE ${where.join(' AND ')} ORDER BY unit_id LIMIT ?`).all(...params) as Row[]).map((r) => parse<LinguisticUnit>(r));
    },
    async relationsOf(unitId, direction = 'both') {
      const clause = direction === 'out' ? 'from_id = ?' : direction === 'in' ? 'to_id = ?' : '(from_id = ? OR to_id = ?)';
      const params: Param[] = direction === 'both' ? [unitId, unitId] : [unitId];
      return (db.prepare(`SELECT json FROM relations WHERE ${clause} ORDER BY from_id, relation, to_id`).all(...params) as Row[]).map((r) => parse<UnitRelation>(r));
    },
    async putRelations(rows) {
      atomic(() => {
        for (const r of rows) {
          const cur = get('SELECT status FROM relations WHERE from_id = ? AND relation = ? AND to_id = ?', r.fromId, r.relation, r.toId);
          if (!mayReplaceByRank(cur?.status as UnitRelation['status'] | undefined, r.status)) continue;
          run(
            `INSERT INTO relations (from_id, relation, to_id, status, json) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (from_id, relation, to_id) DO UPDATE SET status = excluded.status, json = excluded.json`,
            r.fromId, r.relation, r.toId, r.status, text(r),
          );
        }
      });
    },
    async getAnalysis(analysisId) {
      const r = get('SELECT json FROM analyses WHERE analysis_id = ?', analysisId);
      return r ? parse<FormAnalysis>(r) : undefined;
    },
    async analysesOfForm(formId, sentenceKey) {
      const rows = sentenceKey === undefined
        ? all('SELECT json FROM analyses WHERE form_id = ? ORDER BY analysis_id', formId)
        : all('SELECT json FROM analyses WHERE form_id = ? AND sentence_key = ? ORDER BY analysis_id', formId, sentenceKey);
      return rows.map((r) => parse<FormAnalysis>(r));
    },
    async putAnalyses(rows) {
      atomic(() => {
        for (const a of rows) {
          const cur = get('SELECT json FROM analyses WHERE analysis_id = ?', a.analysisId);
          if (!mayReplaceAnalysis(cur ? parse<FormAnalysis>(cur) : undefined, a)) continue;
          run(
            `INSERT INTO analyses (analysis_id, form_id, sentence_key, status, json) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (analysis_id) DO UPDATE SET form_id = excluded.form_id, sentence_key = excluded.sentence_key, status = excluded.status, json = excluded.json`,
            a.analysisId, a.formId, a.sentenceKey ?? null, a.status, text(a),
          );
        }
      });
    },
    async invalidateAnalysis(analysisId, reason, supersededBy) {
      atomic(() => {
        const cur = get('SELECT json FROM analyses WHERE analysis_id = ?', analysisId);
        if (!cur) return;
        const a = invalidated(parse<FormAnalysis>(cur), reason, supersededBy);
        run('UPDATE analyses SET status = ?, json = ? WHERE analysis_id = ?', a.status, text(a), analysisId);
      });
    },
    async aliasesFor(ids) {
      const out: UnitAlias[] = [];
      for (const part of chunks([...new Set(ids)], 500)) {
        const rows = db.prepare(`SELECT json FROM aliases WHERE old_id IN (${placeholders(part.length)})`).all(...part) as Row[];
        out.push(...rows.map((r) => parse<UnitAlias>(r)));
      }
      return out.sort(byKey((x) => [x.oldId, x.newId, x.packVersion]));
    },
    async putAliases(rows) {
      atomic(() => {
        for (const a of rows) {
          run(
            `INSERT INTO aliases (old_id, new_id, pack_version, json) VALUES (?, ?, ?, ?)
             ON CONFLICT (old_id, new_id, pack_version) DO UPDATE SET json = excluded.json`,
            a.oldId, a.newId, a.packVersion, text(a),
          );
        }
      });
    },
    async getPack(packId, version) {
      if (version !== undefined) {
        const r = get('SELECT json FROM packs WHERE pack_id = ? AND version = ?', packId, version);
        return r ? parse<LanguagePackInfo>(r) : undefined;
      }
      return latestPack(all('SELECT json FROM packs WHERE pack_id = ?', packId).map((r) => parse<LanguagePackInfo>(r)));
    },
    async putPack(p) {
      run(
        `INSERT INTO packs (pack_id, version, language_id, json) VALUES (?, ?, ?, ?)
         ON CONFLICT (pack_id, version) DO UPDATE SET language_id = excluded.language_id, json = excluded.json`,
        p.packId, p.version, p.languageId, text(p),
      );
    },
    async listPacks(languageId) {
      const rows = languageId === undefined ? all('SELECT json FROM packs') : all('SELECT json FROM packs WHERE language_id = ?', languageId);
      return sortPacks(rows.map((r) => parse<LanguagePackInfo>(r)));
    },

    // ───────────────────────────── layer C ─────────────────────────────
    async getKnowledge(learnerId, unitIds) {
      if (unitIds === undefined) return all('SELECT json FROM knowledge WHERE learner_id = ? ORDER BY unit_id', learnerId).map((r) => parse<UnitKnowledge>(r));
      const out: UnitKnowledge[] = [];
      for (const part of chunks([...new Set(unitIds)], 500)) {
        const rows = db.prepare(`SELECT json FROM knowledge WHERE learner_id = ? AND unit_id IN (${placeholders(part.length)})`).all(learnerId, ...part) as Row[];
        out.push(...rows.map((r) => parse<UnitKnowledge>(r)));
      }
      return out.sort(byKey((k) => [k.unitId]));
    },
    async putKnowledge(rows) {
      atomic(() => {
        for (const k of rows) {
          run(
            `INSERT INTO knowledge (learner_id, unit_id, language_id, model_version, json) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (learner_id, unit_id) DO UPDATE SET language_id = excluded.language_id, model_version = excluded.model_version, json = excluded.json`,
            k.learnerId, k.unitId, k.languageId, k.modelVersion, text(k),
          );
        }
      });
    },
    async clearKnowledge(learnerId) {
      run('DELETE FROM knowledge WHERE learner_id = ?', learnerId);
    },
    async getProjectionCursor(learnerId) {
      const r = get('SELECT seq, model_version FROM projection_cursor WHERE learner_id = ?', learnerId);
      return r ? { seq: Number(r.seq), modelVersion: r.model_version as string } : undefined;
    },
    async putProjectionCursor(learnerId, cursor) {
      run(
        `INSERT INTO projection_cursor (learner_id, seq, model_version) VALUES (?, ?, ?)
         ON CONFLICT (learner_id) DO UPDATE SET seq = excluded.seq, model_version = excluded.model_version`,
        learnerId, cursor.seq, cursor.modelVersion,
      );
    },
    async getPreferences(learnerId, languageId) {
      const r = get('SELECT json FROM preferences WHERE learner_id = ? AND language_id = ?', learnerId, languageId ?? '');
      return r ? parse<AssistancePreferences>(r) : undefined;
    },
    async putPreferences(p) {
      run(
        `INSERT INTO preferences (learner_id, language_id, json) VALUES (?, ?, ?)
         ON CONFLICT (learner_id, language_id) DO UPDATE SET json = excluded.json`,
        p.learnerId, p.languageId ?? '', text(p),
      );
    },

    // ───────────────────────────── documents ─────────────────────────────
    async getDocument(learnerId, docId) {
      const r = get('SELECT * FROM documents WHERE learner_id = ? AND doc_id = ?', learnerId, docId);
      return r ? documentOfRow(r) : undefined;
    },
    async listDocuments(learnerId) {
      return all('SELECT * FROM documents WHERE learner_id = ? ORDER BY doc_id', learnerId).map(documentOfRow);
    },
    async putDocument(doc, expectedRevision) {
      return atomic(() => {
        const cur = get('SELECT * FROM documents WHERE learner_id = ? AND doc_id = ?', doc.learnerId, doc.docId);
        const decision = decidePutDocument(cur ? documentOfRow(cur) : undefined, doc, expectedRevision);
        if ('conflict' in decision) return decision.conflict as { ok: false; current: PrivateDocument };
        putDocumentRow(decision.write);
        return { ok: true as const };
      });
    },
    async deleteDocument(learnerId, docId) {
      scrubWanted = true;
      atomic(() => {
        const cur = get('SELECT * FROM documents WHERE learner_id = ? AND doc_id = ?', learnerId, docId);
        if (cur) putDocumentRow(deletedDocument(documentOfRow(cur), now()));
      });
      scrubIfNeeded();
    },

    // ───────────────────────────── identity ─────────────────────────────
    async getLearner(learnerId) {
      const r = get('SELECT json FROM learners WHERE learner_id = ?', learnerId);
      return r ? parse<Learner>(r) : undefined;
    },
    async putLearner(l) {
      run('INSERT INTO learners (learner_id, json) VALUES (?, ?) ON CONFLICT (learner_id) DO UPDATE SET json = excluded.json', l.learnerId, text(l));
    },
    async getAccountByEmail(email) {
      const r = get('SELECT * FROM accounts WHERE email = ?', normalizeEmail(email));
      return r ? accountOfRow(r) : undefined;
    },
    async getAccount(accountId) {
      const r = get('SELECT * FROM accounts WHERE account_id = ?', accountId);
      if (!r) return undefined;
      const { passwordHash: _hash, ...account } = accountOfRow(r);
      return account;
    },
    async putAccount(a) {
      atomic(() => {
        const email = normalizeEmail(a.email);
        const clash = get('SELECT account_id FROM accounts WHERE email = ? AND account_id <> ?', email, a.accountId);
        if (clash) throw new Error('email already in use');
        assertSameOwner('account', get('SELECT learner_id FROM accounts WHERE account_id = ?', a.accountId)?.learner_id as string | undefined, a.learnerId);
        run(
          `INSERT INTO accounts (account_id, learner_id, email, password_hash, created_at, disabled_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (account_id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash, created_at = excluded.created_at, disabled_at = excluded.disabled_at`,
          a.accountId, a.learnerId, email, a.passwordHash, a.createdAt, a.disabledAt ?? null,
        );
      });
    },
    async getSessionByTokenHash(tokenHash) {
      const r = get('SELECT json, revoked_at FROM sessions WHERE token_hash = ?', tokenHash);
      return r ? sessionOfRow(r) : undefined;
    },
    async putSession(s) {
      atomic(() => {
        const { tokenHash, revokedAt, ...rest } = s;
        const clash = get('SELECT session_id FROM sessions WHERE token_hash = ? AND session_id <> ?', tokenHash, s.sessionId);
        if (clash) throw new Error('token hash already in use');
        assertSameOwner('session', get('SELECT learner_id FROM sessions WHERE session_id = ?', s.sessionId)?.learner_id as string | undefined, s.learnerId);
        run(
          `INSERT INTO sessions (session_id, learner_id, token_hash, revoked_at, json) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (session_id) DO UPDATE SET token_hash = excluded.token_hash, revoked_at = excluded.revoked_at, json = excluded.json`,
          s.sessionId, s.learnerId, tokenHash, revokedAt ?? null, text(rest),
        );
      });
    },
    async revokeSession(sessionId, at) {
      run('UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL', at, sessionId);
    },
    async getDevice(learnerId, deviceId) {
      const r = get('SELECT json FROM devices WHERE learner_id = ? AND device_id = ?', learnerId, deviceId);
      return r ? parse<Device>(r) : undefined;
    },
    async putDevice(d) {
      run(
        'INSERT INTO devices (learner_id, device_id, json) VALUES (?, ?, ?) ON CONFLICT (learner_id, device_id) DO UPDATE SET json = excluded.json',
        d.learnerId, d.deviceId, text(d),
      );
    },
    async listEnrolments(learnerId) {
      return all('SELECT json, goals FROM enrolments WHERE learner_id = ? ORDER BY started_at, enrolment_id', learnerId).map(enrolmentOfRow);
    },
    async putEnrolment(e) {
      atomic(() => {
        assertSameOwner('enrolment', get('SELECT learner_id FROM enrolments WHERE enrolment_id = ?', e.enrolmentId)?.learner_id as string | undefined, e.learnerId);
        const { goals, ...rest } = e;
        run(
          `INSERT INTO enrolments (enrolment_id, learner_id, language_id, started_at, goals, json) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (enrolment_id) DO UPDATE SET language_id = excluded.language_id, started_at = excluded.started_at, goals = excluded.goals, json = excluded.json`,
          e.enrolmentId, e.learnerId, e.languageId, e.startedAt, text(goals), text(rest),
        );
      });
    },
    async getTeam(teamId) {
      const r = get('SELECT json FROM teams WHERE team_id = ?', teamId);
      return r ? parse<Team>(r) : undefined;
    },
    async putTeam(t) {
      run('INSERT INTO teams (team_id, json) VALUES (?, ?) ON CONFLICT (team_id) DO UPDATE SET json = excluded.json', t.teamId, text(t));
    },
    async listTeamMembers(teamId) {
      return all('SELECT learner_id, role, since FROM team_members WHERE team_id = ? ORDER BY since, learner_id', teamId)
        .map((r) => ({ learnerId: r.learner_id as string, role: r.role as 'member' | 'leader', since: r.since as string }));
    },
    async putTeamMember(teamId, learnerId, role, since) {
      run(
        `INSERT INTO team_members (team_id, learner_id, role, since) VALUES (?, ?, ?, ?)
         ON CONFLICT (team_id, learner_id) DO UPDATE SET role = excluded.role, since = excluded.since`,
        teamId, learnerId, role, since,
      );
    },

    // ───────────────────────────── tombstones ─────────────────────────────
    async listTombstones(learnerId) {
      return all('SELECT json FROM tombstones WHERE learner_id = ? ORDER BY created_at, tombstone_id', learnerId).map((r) => parse<Tombstone>(r));
    },
    async putTombstone(t) {
      atomic(() => {
        assertSameOwner('tombstone', get('SELECT learner_id FROM tombstones WHERE tombstone_id = ?', t.tombstoneId)?.learner_id as string | undefined, t.learnerId);
        run(
          `INSERT INTO tombstones (tombstone_id, learner_id, scope_kind, event_id, created_at, json) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (tombstone_id) DO UPDATE SET scope_kind = excluded.scope_kind, event_id = excluded.event_id, created_at = excluded.created_at, json = excluded.json`,
          t.tombstoneId, t.learnerId, t.scope.kind, t.scope.kind === 'event' ? t.scope.id : null, t.createdAt, text(t),
        );
      });
    },

    // ───────────────────────────── whole-store ─────────────────────────────
    async eraseLearner(learnerId): Promise<EraseCounts> {
      scrubWanted = true;
      const counts = atomic(() => {
        const c = zeroErase();
        c.events = run('DELETE FROM events WHERE learner_id = ?', learnerId); // event_units follow by cascade
        run('DELETE FROM event_heads WHERE learner_id = ?', learnerId);
        c.knowledge = run('DELETE FROM knowledge WHERE learner_id = ?', learnerId);
        run('DELETE FROM projection_cursor WHERE learner_id = ?', learnerId);
        c.preferences = run('DELETE FROM preferences WHERE learner_id = ?', learnerId);
        c.documents = run('DELETE FROM documents WHERE learner_id = ?', learnerId);
        c.sessions = run('DELETE FROM sessions WHERE learner_id = ?', learnerId);
        c.devices = run('DELETE FROM devices WHERE learner_id = ?', learnerId);
        c.enrolments = run('DELETE FROM enrolments WHERE learner_id = ?', learnerId);
        c.tombstones = run('DELETE FROM tombstones WHERE learner_id = ?', learnerId);
        c.teamMemberships = run('DELETE FROM team_members WHERE learner_id = ?', learnerId);
        c.accounts = run('DELETE FROM accounts WHERE learner_id = ?', learnerId);
        c.learners = run('DELETE FROM learners WHERE learner_id = ?', learnerId);
        return c;
      });
      scrubIfNeeded();
      return counts;
    },
    async applyTombstone(t) {
      return applyDeletion(store, t);
    },
    /** Operator maintenance: empty the log and rebuild the file without its free pages (VACUUM can take a while on a large store). */
    async compact() {
      if (path === ':memory:') return;
      checkpoint();
      db.exec('VACUUM');
      checkpoint();
    },
  };

  // Every method waits for an open `transaction()` unless it is called from inside it.
  const gated = Object.fromEntries(
    Object.entries(impl).map(([name, fn]) => [name, async (...args: unknown[]) => { await gate(); return (fn as (...a: unknown[]) => unknown)(...args); }]),
  ) as unknown as Omit<ConcreteStore, 'transaction' | 'close'>;

  const store: ConcreteStore = {
    ...gated,
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (inside.getStore()) {
        const name = `sp${++savepoints}`;
        db.exec(`SAVEPOINT ${name}`);
        try {
          const r = await fn();
          db.exec(`RELEASE ${name}`);
          return r;
        } catch (e) {
          db.exec(`ROLLBACK TO ${name}`);
          db.exec(`RELEASE ${name}`);
          throw e;
        }
      }
      while (open) await open;
      let release!: () => void;
      open = new Promise<void>((resolve) => { release = resolve; });
      try {
        db.exec('BEGIN IMMEDIATE');
        depth = 1;
        try {
          const r = await inside.run(true, fn);
          db.exec('COMMIT');
          return r;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        } finally {
          depth = 0;
        }
      } finally {
        scrubIfNeeded();
        open = undefined;
        release();
      }
    },
    async close() {
      while (open) await open;
      if (closed) return;
      closed = true;
      db.close();
    },
  };
  return store;
}
