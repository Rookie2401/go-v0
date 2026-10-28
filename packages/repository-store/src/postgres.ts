/**
 * The PostgreSQL Repository store: the third implementation of the `RepositoryStore` port, for when one SQLite file on one box is no longer enough
 * (many instances, a managed database, point-in-time recovery). Same port, same rules (./rules) and same observable behaviour as the memory and
 * SQLite stores: the shared conformance tests (test/repository/store) run against all of them.
 *
 * It talks to a `PgPool` (./postgres-types), which a `pg.Pool` satisfies; this file never imports the driver (./postgres-pool does).
 *
 * Transactions. `transaction(fn)` borrows one connection, runs BEGIN, and pins that connection to `fn` and everything `fn` awaits (AsyncLocalStorage),
 * so every store call made inside goes through it and a throw rolls all of it back. Calls from outside run on other pooled connections and see only
 * committed rows (READ COMMITTED). A transaction inside a transaction is a savepoint. An `append` takes an advisory lock on the learner first, so two
 * concurrent appends for one learner get consecutive sequence numbers and the check-then-insert of de-duplication cannot interleave.
 *
 * No SQL is built from values: every value is a bound parameter. The only text assembled is the WHERE clause of `list` and `?` placeholders, which
 * are rewritten to `$n` once per statement.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { provenanceColumns } from '../../repository-contract/src';
import type {
  Account, AccountToken, AppendOutcome, AssistancePreferences, Device, Enrolment, EventFilter, EncounterDateRange, EncounterEventSummary, FormAnalysis, LanguagePackInfo, Learner, LinguisticUnit,
  PrivateDocument, ReviewStatusSummary, SecurityEvent, SecurityStore, Session, StoredEvent, Team, Tombstone, UnitAlias, UnitKnowledge, UnitRelation,
} from '../../repository-contract/src';
import { applyPgMigrations } from './postgres-migrate';
import type { PgClient, PgPool, PgQueryable } from './postgres-types';
import {
  appendIssues, conflictingReviewIdentity, expectedReviewPredecessorIssue, assertSameOwner, atMs, byKey, carried, carriedAnalysis, clampLimit, decidePutDocument, defaultNow, deletedDocument, envelopeOf, invalidated, latestPack,
  mayReplaceAnalysis, mayReplaceByRank, normalizeEmail, outcomeId, sortPacks, withCorrection, zeroErase,
} from './rules';
import type { ConcreteStore, EraseCounts, ProvenanceCount, StoreOptions } from './rules';
import { applyTombstone as applyDeletion } from './deletion';

export interface PostgresOptions extends StoreOptions {
  /** A different migrations directory (tests of the runner); defaults to the package's `migrations-pg`. */
  migrationsDir?: URL | string;
}

type Row = Record<string, unknown>;

const text = (v: unknown): string => JSON.stringify(v);
/** A jsonb column comes back parsed by the driver; a text-typed one (a test double) as a string. */
const obj = <T>(row: Row, col = 'json'): T => {
  const v = row[col];
  return (typeof v === 'string' ? JSON.parse(v) : v) as T;
};
const numbered = (sql: string): string => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
const chunks = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};
const isUniqueViolation = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === '23505';

/** Opens (creating, and migrating to the latest schema) the Postgres store behind `pool`. The store owns the pool: `close()` ends it. */
export async function openPostgresStore(pool: PgPool, opts: PostgresOptions = {}): Promise<ConcreteStore> {
  const now = opts.now ?? defaultNow;
  await applyPgMigrations(pool, opts.migrationsDir, now);

  const pinned = new AsyncLocalStorage<PgClient>();
  const conn = (): PgQueryable => pinned.getStore() ?? pool;
  const sqlCache = new Map<string, string>();
  const prep = (sql: string): string => {
    let s = sqlCache.get(sql);
    if (s === undefined) sqlCache.set(sql, (s = numbered(sql)));
    return s;
  };
  const all = async (sql: string, ...p: unknown[]): Promise<Row[]> => (await conn().query(prep(sql), p)).rows;
  const get = async (sql: string, ...p: unknown[]): Promise<Row | undefined> => (await all(sql, ...p))[0];
  const run = async (sql: string, ...p: unknown[]): Promise<number> => (await conn().query(prep(sql), p)).rowCount ?? 0;

  // ───────────── transactions ─────────────
  let savepoints = 0;
  let closed = false;
  async function atomic<T>(fn: () => Promise<T>): Promise<T> {
    const current = pinned.getStore();
    if (current) {
      const name = `sp${++savepoints}`;
      await current.query(`SAVEPOINT ${name}`);
      try {
        const r = await fn();
        await current.query(`RELEASE SAVEPOINT ${name}`);
        return r;
      } catch (e) {
        await current.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await current.query(`RELEASE SAVEPOINT ${name}`);
        throw e;
      }
    }
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      try {
        const r = await pinned.run(client, fn);
        await client.query('COMMIT');
        return r;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
        throw e;
      }
    } finally {
      client.release(broken ? true : undefined);
    }
  }

  const eventOfRow = (r: Row): StoredEvent => ({ ...obj<StoredEvent>(r), seq: Number(r.seq), recordedAt: r.recorded_at as string });
  const EVENT_COLS = 'e.seq AS seq, e.recorded_at AS recorded_at, e.json AS json';

  const documentOfRow = (r: Row): PrivateDocument => {
    const d: PrivateDocument = { ...obj<PrivateDocument>(r), body: r.body as string, revision: Number(r.revision) };
    if (r.deleted_at !== null && r.deleted_at !== undefined) d.deletedAt = r.deleted_at as string;
    return d;
  };
  const putDocumentRow = async (d: PrivateDocument): Promise<void> => {
    const { body, revision, deletedAt, ...rest } = d;
    await run(
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
    if (r.verified_at !== null) a.verifiedAt = r.verified_at as string;
    if (r.deletion_requested_at !== null) a.deletionRequestedAt = r.deletion_requested_at as string;
    if (r.deletion_due_at !== null) a.deletionDueAt = r.deletion_due_at as string;
    return a;
  };
  const sessionOfRow = (r: Row): Session => {
    const s = obj<Session>(r);
    if (r.revoked_at !== null && r.revoked_at !== undefined) s.revokedAt = r.revoked_at as string;
    return s;
  };
  const enrolmentOfRow = (r: Row): Enrolment => ({ ...obj<Enrolment>(r), goals: obj<Enrolment['goals']>(r, 'goals') });

  const tombstonedEvent = async (learnerId: string, id: string): Promise<boolean> =>
    (await get("SELECT 1 AS x FROM tombstones WHERE learner_id = ? AND scope_kind = 'event' AND event_id = ?", learnerId, id)) !== undefined;

  const impl: Omit<ConcreteStore, 'transaction' | 'close'> = {
    // ───────────────────────────── events ─────────────────────────────
    async append(learnerId, events) {
      return atomic(async () => {
        await all('SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))', learnerId);
        const out: AppendOutcome[] = [];
        for (const e of events) {
          const id = outcomeId(e);
          const issues = appendIssues(learnerId, e);
          if (issues.length) { out.push({ id, stored: false, issues }); continue; }
          const owner = await get('SELECT learner_id, json FROM events WHERE id = ?', e.id);
          if (owner) {
            const conflict=owner.learner_id===learnerId?conflictingReviewIdentity(obj<StoredEvent>(owner),e):undefined;
            out.push(owner.learner_id === learnerId ? conflict?{id,stored:false,issues:[conflict]}:{ id, stored: false, duplicateOf: id } : { id, stored: false, issues: [{ path: 'id', message: 'event id already in use' }] });
            continue;
          }
          if (e.dedupeKey !== undefined) {
            const first = await get('SELECT id FROM events WHERE learner_id = ? AND dedupe_key = ?', learnerId, e.dedupeKey);
            if (first) { out.push({ id, stored: false, duplicateOf: first.id as string }); continue; }
          }
          if (await tombstonedEvent(learnerId, e.id)) { out.push({ id, stored: false, issues: [{ path: 'id', message: 'this event was deleted by a tombstone' }] }); continue; }
          const predecessorIssue = expectedReviewPredecessorIssue(e);
          if (predecessorIssue) { out.push({id,stored:false,issues:[predecessorIssue]}); continue; }
          const recordedAt = now();
          const seq = Number((await get(
            'INSERT INTO event_heads (learner_id, head) VALUES (?, 1) ON CONFLICT (learner_id) DO UPDATE SET head = event_heads.head + 1 RETURNING head',
            learnerId,
          ) as Row).head);
          await run(
            `INSERT INTO events (learner_id, seq, id, dedupe_key, kind, at, at_ms, recorded_at, language_id, enrolment_id, json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            learnerId, seq, e.id, e.dedupeKey ?? null, e.kind, e.at, atMs(e.at), recordedAt, e.languageId, e.enrolmentId, text(envelopeOf(e, recordedAt)),
          );
          const unitIds = [...new Set(e.subject.itemIds ?? [])];
          if (unitIds.length) await run('INSERT INTO event_units (event_id, unit_id) SELECT ?::text, u FROM unnest(?::text[]) AS t(u) ON CONFLICT DO NOTHING', e.id, unitIds);
          out.push({ id, stored: true });
        }
        return out;
      });
    },
    async list(f: EventFilter) {
      const where = ['e.learner_id = ?'];
      const params: unknown[] = [f.learnerId];
      if (f.languageId !== undefined) { where.push('e.language_id = ?'); params.push(f.languageId); }
      if (f.kinds !== undefined) {
        if (!f.kinds.length) return [];
        where.push('e.kind = ANY(?::text[])');
        params.push(f.kinds);
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
      const rows = await all(`SELECT ${EVENT_COLS} FROM events e WHERE ${where.join(' AND ')} ORDER BY e.seq ${f.order === 'desc' ? 'DESC' : 'ASC'} LIMIT ?`, ...params);
      return rows.map(eventOfRow);
    },
    async listEncounterSummaries(learnerId, languageId, unitIds, perUnitLimit) {
      const out: EncounterEventSummary[] = [];
      for (const part of chunks([...new Set(unitIds)], 1000)) {
        const rows = await all(`WITH recent AS (
          SELECT eu.unit_id AS unit_id, e.seq AS seq, e.recorded_at AS recorded_at, e.json AS json,
            ROW_NUMBER() OVER (PARTITION BY eu.unit_id ORDER BY e.seq DESC) AS rn
          FROM events e JOIN event_units eu ON eu.event_id = e.id
          WHERE e.learner_id = ? AND e.language_id = ? AND e.kind IN ('EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested')
            AND eu.unit_id = ANY(?::text[])
        ) SELECT unit_id, seq, recorded_at, json FROM recent WHERE rn <= ? ORDER BY unit_id, seq DESC`, learnerId, languageId, part, Math.max(1, Math.min(100, perUnitLimit)));
        for (const row of rows) out.push({ unitId: row.unit_id as string, event: eventOfRow(row) });
      }
      return out;
    },
    async getEncounterDateRanges(learnerId, languageId, unitIds) {
      const found = new Map<string, EncounterDateRange>();
      for (const part of chunks([...new Set(unitIds)], 1000)) {
        const rows = await all(`SELECT eu.unit_id AS unit_id, MIN(e.at_ms) AS first_ms, MAX(e.at_ms) AS last_ms
          FROM event_units eu JOIN events e ON e.id = eu.event_id
          WHERE e.learner_id = ? AND e.language_id = ? AND e.kind IN ('EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested')
            AND eu.unit_id = ANY(?::text[]) GROUP BY eu.unit_id`, learnerId, languageId, part);
        for (const row of rows) found.set(row.unit_id as string, {
          unitId: row.unit_id as string,
          firstEncounter: new Date(Number(row.first_ms)).toISOString(), lastEncounter: new Date(Number(row.last_ms)).toISOString(),
        });
      }
      return [...new Set(unitIds)].map((id) => found.get(id) ?? { unitId: id });
    },
    async listReviewStatusSummaries(learnerId, languageId, unitIds) {
      const out: ReviewStatusSummary[] = [];
      for (const part of chunks([...new Set(unitIds)], 1000)) {
        const rows = await all(`WITH latest AS (
          SELECT eu.unit_id AS unit_id, e.seq AS seq, e.recorded_at AS recorded_at, e.json AS json,
            ROW_NUMBER() OVER (PARTITION BY eu.unit_id, (e.json -> 'subject') ->> 'cardId' ORDER BY e.at_ms DESC, e.id DESC) AS rn
          FROM events e JOIN event_units eu ON eu.event_id = e.id
          WHERE e.learner_id = ? AND e.language_id = ? AND e.kind IN ('CardAdded', 'CardRemoved', 'ReviewItemInvalidated')
            AND (e.json -> 'subject') ->> 'cardId' IS NOT NULL AND eu.unit_id = ANY(?::text[])
        ) SELECT unit_id, seq, recorded_at, json FROM latest WHERE rn = 1 ORDER BY unit_id`, learnerId, languageId, part);
        for (const row of rows) out.push({ unitId: row.unit_id as string, event: eventOfRow(row) });
      }
      return out;
    },
    async listAssistanceRequestedUnitIds(learnerId, languageId, unitIds) {
      const found = new Set<string>();
      for (const part of chunks([...new Set(unitIds)], 1000)) {
        const rows = await all(`SELECT DISTINCT eu.unit_id AS unit_id
          FROM events e JOIN event_units eu ON eu.event_id = e.id
          WHERE e.learner_id = ? AND e.language_id = ? AND e.kind = 'AssistanceRequested'
            AND eu.unit_id = ANY(?::text[])`, learnerId, languageId, part);
        for (const row of rows) found.add(row.unit_id as string);
      }
      return [...found];
    },
    async get(learnerId, id) {
      const r = await get(`SELECT ${EVENT_COLS} FROM events e WHERE e.learner_id = ? AND e.id = ?`, learnerId, id);
      return r ? eventOfRow(r) : undefined;
    },
    async head(learnerId) {
      const r = await get('SELECT head FROM event_heads WHERE learner_id = ?', learnerId);
      return r ? Number(r.head) : 0;
    },
    async deleteEvents(learnerId, ids) {
      if (!ids.length) return 0;
      return run('DELETE FROM events WHERE learner_id = ? AND id = ANY(?::text[])', learnerId, ids);
    },

    // ───────────────────────────── layer A ─────────────────────────────
    async getUnits(ids) {
      const wanted = [...new Set(ids)];
      const found = new Map<string, LinguisticUnit>();
      for (const part of chunks(wanted, 1000)) {
        for (const r of await all('SELECT unit_id, json FROM units WHERE unit_id = ANY(?::text[])', part)) found.set(r.unit_id as string, obj<LinguisticUnit>(r));
      }
      return wanted.flatMap((id) => (found.has(id) ? [found.get(id)!] : []));
    },
    async putUnits(rows) {
      await atomic(async () => {
        for (const u of rows) {
          const cur = await get('SELECT status, json FROM units WHERE unit_id = ? FOR UPDATE', u.unitId);
          if (!mayReplaceByRank(cur?.status as LinguisticUnit['status'] | undefined, u.status)) continue;
          const row = carried(cur ? obj<LinguisticUnit>(cur) : undefined, u);
          const { origin, validation } = provenanceColumns(row);
          await run(
            `INSERT INTO units (unit_id, kind, language_id, label, status, json, origin, validation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (unit_id) DO UPDATE SET kind = excluded.kind, language_id = excluded.language_id, label = excluded.label, status = excluded.status, json = excluded.json,
               origin = excluded.origin, validation = excluded.validation`,
            row.unitId, row.kind, row.languageId, row.label, row.status, text(row), origin, validation,
          );
        }
      });
    },
    async recordUnitCorrection(unitId, correction, flag) {
      return atomic(async () => {
        const cur = await get('SELECT json FROM units WHERE unit_id = ? FOR UPDATE', unitId);
        if (!cur) return undefined;
        const r = withCorrection(obj<LinguisticUnit>(cur), correction, flag);
        await run('UPDATE units SET status = ?, json = ? WHERE unit_id = ?', r.unit.status, text(r.unit), unitId);
        return r;
      });
    },
    async findUnits(q) {
      const where = ['language_id = ?'];
      const params: unknown[] = [q.languageId];
      if (q.kind !== undefined) { where.push('kind = ?'); params.push(q.kind); }
      if (q.label !== undefined) { where.push('label = ?'); params.push(q.label); }
      params.push(clampLimit(q.limit));
      return (await all(`SELECT json FROM units WHERE ${where.join(' AND ')} ORDER BY unit_id LIMIT ?`, ...params)).map((r) => obj<LinguisticUnit>(r));
    },
    async relationsOf(unitId, direction = 'both') {
      const clause = direction === 'out' ? 'from_id = ?' : direction === 'in' ? 'to_id = ?' : '(from_id = ? OR to_id = ?)';
      const params: unknown[] = direction === 'both' ? [unitId, unitId] : [unitId];
      return (await all(`SELECT json FROM relations WHERE ${clause} ORDER BY from_id, relation, to_id`, ...params)).map((r) => obj<UnitRelation>(r));
    },
    async putRelations(rows) {
      await atomic(async () => {
        for (const r of rows) {
          const cur = await get('SELECT status, json FROM relations WHERE from_id = ? AND relation = ? AND to_id = ? FOR UPDATE', r.fromId, r.relation, r.toId);
          if (!mayReplaceByRank(cur?.status as UnitRelation['status'] | undefined, r.status)) continue;
          const row = carried(cur ? obj<UnitRelation>(cur) : undefined, r);
          const { origin, validation } = provenanceColumns(row);
          await run(
            `INSERT INTO relations (from_id, relation, to_id, status, json, origin, validation) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (from_id, relation, to_id) DO UPDATE SET status = excluded.status, json = excluded.json, origin = excluded.origin, validation = excluded.validation`,
            row.fromId, row.relation, row.toId, row.status, text(row), origin, validation,
          );
        }
      });
    },
    async getAnalysis(analysisId) {
      const r = await get('SELECT json FROM analyses WHERE analysis_id = ?', analysisId);
      return r ? obj<FormAnalysis>(r) : undefined;
    },
    async analysesOfForm(formId, sentenceKey) {
      const rows = sentenceKey === undefined
        ? await all('SELECT json FROM analyses WHERE form_id = ? ORDER BY analysis_id', formId)
        : await all('SELECT json FROM analyses WHERE form_id = ? AND sentence_key = ? ORDER BY analysis_id', formId, sentenceKey);
      return rows.map((r) => obj<FormAnalysis>(r));
    },
    async putAnalyses(rows) {
      await atomic(async () => {
        for (const a of rows) {
          const cur = await get('SELECT json FROM analyses WHERE analysis_id = ? FOR UPDATE', a.analysisId);
          const existing = cur ? obj<FormAnalysis>(cur) : undefined;
          if (!mayReplaceAnalysis(existing, a)) continue;
          const row = carriedAnalysis(existing, a);
          const { origin, validation } = provenanceColumns(row);
          await run(
            `INSERT INTO analyses (analysis_id, form_id, sentence_key, status, json, origin, validation) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (analysis_id) DO UPDATE SET form_id = excluded.form_id, sentence_key = excluded.sentence_key, status = excluded.status, json = excluded.json,
               origin = excluded.origin, validation = excluded.validation`,
            row.analysisId, row.formId, row.sentenceKey ?? null, row.status, text(row), origin, validation,
          );
        }
      });
    },
    async invalidateAnalysis(analysisId, reason, supersededBy) {
      await atomic(async () => {
        const cur = await get('SELECT json FROM analyses WHERE analysis_id = ? FOR UPDATE', analysisId);
        if (!cur) return;
        const a = invalidated(obj<FormAnalysis>(cur), reason, supersededBy);
        await run('UPDATE analyses SET status = ?, json = ? WHERE analysis_id = ?', a.status, text(a), analysisId);
      });
    },
    async aliasesFor(ids) {
      const out: UnitAlias[] = [];
      for (const part of chunks([...new Set(ids)], 1000)) out.push(...(await all('SELECT json FROM aliases WHERE old_id = ANY(?::text[])', part)).map((r) => obj<UnitAlias>(r)));
      return out.sort(byKey((x) => [x.oldId, x.newId, x.packVersion]));
    },
    async aliasesTo(ids) {
      const out: UnitAlias[] = [];
      for (const part of chunks([...new Set(ids)], 1000)) out.push(...(await all('SELECT json FROM aliases WHERE new_id = ANY(?::text[])', part)).map((r) => obj<UnitAlias>(r)));
      return out.sort(byKey((x) => [x.newId, x.oldId, x.packVersion]));
    },
    async putAliases(rows) {
      await atomic(async () => {
        for (const a of rows) {
          await run(
            `INSERT INTO aliases (old_id, new_id, pack_version, json) VALUES (?, ?, ?, ?)
             ON CONFLICT (old_id, new_id, pack_version) DO UPDATE SET json = excluded.json`,
            a.oldId, a.newId, a.packVersion, text(a),
          );
        }
      });
    },
    async getPack(packId, version) {
      if (version !== undefined) {
        const r = await get('SELECT json FROM packs WHERE pack_id = ? AND version = ?', packId, version);
        return r ? obj<LanguagePackInfo>(r) : undefined;
      }
      return latestPack((await all('SELECT json FROM packs WHERE pack_id = ?', packId)).map((r) => obj<LanguagePackInfo>(r)));
    },
    async putPack(p) {
      await run(
        `INSERT INTO packs (pack_id, version, language_id, json) VALUES (?, ?, ?, ?)
         ON CONFLICT (pack_id, version) DO UPDATE SET language_id = excluded.language_id, json = excluded.json`,
        p.packId, p.version, p.languageId, text(p),
      );
    },
    async listPacks(languageId) {
      const rows = languageId === undefined ? await all('SELECT json FROM packs') : await all('SELECT json FROM packs WHERE language_id = ?', languageId);
      return sortPacks(rows.map((r) => obj<LanguagePackInfo>(r)));
    },

    // ───────────────────────────── layer C ─────────────────────────────
    async getKnowledge(learnerId, unitIds) {
      if (unitIds === undefined) return (await all('SELECT json FROM knowledge WHERE learner_id = ? ORDER BY unit_id', learnerId)).map((r) => obj<UnitKnowledge>(r));
      const out: UnitKnowledge[] = [];
      for (const part of chunks([...new Set(unitIds)], 1000)) {
        out.push(...(await all('SELECT json FROM knowledge WHERE learner_id = ? AND unit_id = ANY(?::text[])', learnerId, part)).map((r) => obj<UnitKnowledge>(r)));
      }
      return out.sort(byKey((k) => [k.unitId]));
    },
    async getKnowledgePage(learnerId, q) {
      const limit = Math.max(1, Math.min(500, Math.trunc(q.limit)));
      const params: unknown[] = [learnerId, q.languageId, q.after ?? ''];
      let source = '';
      if (q.sourceRef !== undefined) {
        const fields = ['kind', 'title', 'locator', 'book', 'provider', 'translationId', 'mediaId', 'shareId'];
        source = ` AND EXISTS (SELECT 1 FROM event_units eu JOIN events e ON e.id = eu.event_id
          WHERE eu.unit_id = k.unit_id AND e.learner_id = k.learner_id AND e.language_id = k.language_id
            AND e.kind IN ('EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested')
            AND (${fields.map((f) => `((e.json -> 'subject') -> 'sourceRef') ->> '${f}' = ?`).join(' OR ')}))`;
        for (let i = 0; i < fields.length; i++) params.push(q.sourceRef);
      }
      params.push(limit);
      const rows = await all(`SELECT k.json AS json FROM knowledge k WHERE k.learner_id = ? AND k.language_id = ? AND k.unit_id > ?${source} ORDER BY k.unit_id LIMIT ?`, ...params);
      return rows.map((r) => obj<UnitKnowledge>(r));
    },
    async getEncounteredKnowledgeStats(learnerId, languageId) {
      const rows = await all(`SELECT json ->> 'level' AS level, count(*) AS n FROM knowledge
        WHERE learner_id = ? AND language_id = ? AND (json ->> 'encounters')::numeric > 0 GROUP BY json ->> 'level'`, learnerId, languageId);
      const counts = { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 };
      for (const row of rows) if (typeof row.level === 'string' && row.level in counts) counts[row.level as keyof typeof counts] = Number(row.n);
      return { total: Object.values(counts).reduce((a, b) => a + b, 0), counts };
    },
    async putKnowledge(rows) {
      // one statement per 500 rows (a rebuild writes thousands); later rows of the same key win, as they do one at a time
      const byKeyed = new Map<string, UnitKnowledge>();
      for (const k of rows) byKeyed.set(`${k.learnerId}\u0000${k.unitId}`, k);
      await atomic(async () => {
        for (const part of chunks([...byKeyed.values()], 500)) {
          await run(
            `INSERT INTO knowledge (learner_id, unit_id, language_id, model_version, json)
             SELECT l, u, g, m, j::jsonb FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS t(l, u, g, m, j)
             ON CONFLICT (learner_id, unit_id) DO UPDATE SET language_id = excluded.language_id, model_version = excluded.model_version, json = excluded.json`,
            part.map((k) => k.learnerId), part.map((k) => k.unitId), part.map((k) => k.languageId), part.map((k) => k.modelVersion), part.map((k) => text(k)),
          );
        }
      });
    },
    async clearKnowledge(learnerId) {
      await run('DELETE FROM knowledge WHERE learner_id = ?', learnerId);
    },
    async getProjectionCursor(learnerId) {
      const r = await get('SELECT seq, model_version FROM projection_cursor WHERE learner_id = ?', learnerId);
      return r ? { seq: Number(r.seq), modelVersion: r.model_version as string } : undefined;
    },
    async putProjectionCursor(learnerId, cursor) {
      await run(
        `INSERT INTO projection_cursor (learner_id, seq, model_version) VALUES (?, ?, ?)
         ON CONFLICT (learner_id) DO UPDATE SET seq = excluded.seq, model_version = excluded.model_version`,
        learnerId, cursor.seq, cursor.modelVersion,
      );
    },
    async getPreferences(learnerId, languageId) {
      const r = await get('SELECT json FROM preferences WHERE learner_id = ? AND language_id = ?', learnerId, languageId ?? '');
      return r ? obj<AssistancePreferences>(r) : undefined;
    },
    async putPreferences(p) {
      await run(
        `INSERT INTO preferences (learner_id, language_id, json) VALUES (?, ?, ?)
         ON CONFLICT (learner_id, language_id) DO UPDATE SET json = excluded.json`,
        p.learnerId, p.languageId ?? '', text(p),
      );
    },

    // ───────────────────────────── documents ─────────────────────────────
    async getDocument(learnerId, docId) {
      const r = await get('SELECT * FROM documents WHERE learner_id = ? AND doc_id = ?', learnerId, docId);
      return r ? documentOfRow(r) : undefined;
    },
    async listDocuments(learnerId) {
      return (await all('SELECT * FROM documents WHERE learner_id = ? ORDER BY doc_id', learnerId)).map(documentOfRow);
    },
    async putDocument(doc, expectedRevision) {
      return atomic(async () => {
        const cur = await get('SELECT * FROM documents WHERE learner_id = ? AND doc_id = ? FOR UPDATE', doc.learnerId, doc.docId);
        const decision = decidePutDocument(cur ? documentOfRow(cur) : undefined, doc, expectedRevision);
        if ('conflict' in decision) return decision.conflict as { ok: false; current: PrivateDocument };
        await putDocumentRow(decision.write);
        return { ok: true as const };
      });
    },
    async deleteDocument(learnerId, docId) {
      await atomic(async () => {
        const cur = await get('SELECT * FROM documents WHERE learner_id = ? AND doc_id = ? FOR UPDATE', learnerId, docId);
        if (cur) await putDocumentRow(deletedDocument(documentOfRow(cur), now()));
      });
    },

    // ───────────────────────────── identity ─────────────────────────────
    async getLearner(learnerId) {
      const r = await get('SELECT json FROM learners WHERE learner_id = ?', learnerId);
      return r ? obj<Learner>(r) : undefined;
    },
    async putLearner(l) {
      await run('INSERT INTO learners (learner_id, json) VALUES (?, ?) ON CONFLICT (learner_id) DO UPDATE SET json = excluded.json', l.learnerId, text(l));
    },
    async getAccountByEmail(email) {
      const r = await get('SELECT * FROM accounts WHERE email = ?', normalizeEmail(email));
      return r ? accountOfRow(r) : undefined;
    },
    async getAccount(accountId) {
      const r = await get('SELECT * FROM accounts WHERE account_id = ?', accountId);
      if (!r) return undefined;
      const { passwordHash: _hash, ...account } = accountOfRow(r);
      return account;
    },
    async putAccount(a) {
      await atomic(async () => {
        const email = normalizeEmail(a.email);
        const clash = await get('SELECT account_id FROM accounts WHERE email = ? AND account_id <> ?', email, a.accountId);
        if (clash) throw new Error('email already in use');
        assertSameOwner('account', (await get('SELECT learner_id FROM accounts WHERE account_id = ?', a.accountId))?.learner_id as string | undefined, a.learnerId);
        try {
          await run(
            `INSERT INTO accounts (account_id, learner_id, email, password_hash, created_at, disabled_at, verified_at, deletion_requested_at, deletion_due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (account_id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash, created_at = excluded.created_at, disabled_at = excluded.disabled_at,
               verified_at = excluded.verified_at, deletion_requested_at = excluded.deletion_requested_at, deletion_due_at = excluded.deletion_due_at`,
            a.accountId, a.learnerId, email, a.passwordHash, a.createdAt, a.disabledAt ?? null, a.verifiedAt ?? null, a.deletionRequestedAt ?? null, a.deletionDueAt ?? null,
          );
        } catch (e) {
          if (isUniqueViolation(e)) throw new Error('email already in use', { cause: e });
          throw e;
        }
      });
    },
    async getSessionByTokenHash(tokenHash) {
      const r = await get('SELECT json, revoked_at FROM sessions WHERE token_hash = ?', tokenHash);
      return r ? sessionOfRow(r) : undefined;
    },
    async putSession(s) {
      await atomic(async () => {
        const { tokenHash, revokedAt, ...rest } = s;
        const clash = await get('SELECT session_id FROM sessions WHERE token_hash = ? AND session_id <> ?', tokenHash, s.sessionId);
        if (clash) throw new Error('token hash already in use');
        assertSameOwner('session', (await get('SELECT learner_id FROM sessions WHERE session_id = ?', s.sessionId))?.learner_id as string | undefined, s.learnerId);
        await run(
          `INSERT INTO sessions (session_id, learner_id, token_hash, revoked_at, json) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (session_id) DO UPDATE SET token_hash = excluded.token_hash, revoked_at = excluded.revoked_at, json = excluded.json`,
          s.sessionId, s.learnerId, tokenHash, revokedAt ?? null, text(rest),
        );
      });
    },
    async revokeSession(sessionId, at) {
      await run('UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL', at, sessionId);
    },
    async getDevice(learnerId, deviceId) {
      const r = await get('SELECT json FROM devices WHERE learner_id = ? AND device_id = ?', learnerId, deviceId);
      return r ? obj<Device>(r) : undefined;
    },
    async putDevice(d) {
      await run(
        'INSERT INTO devices (learner_id, device_id, json) VALUES (?, ?, ?) ON CONFLICT (learner_id, device_id) DO UPDATE SET json = excluded.json',
        d.learnerId, d.deviceId, text(d),
      );
    },
    async listEnrolments(learnerId) {
      return (await all('SELECT json, goals FROM enrolments WHERE learner_id = ? ORDER BY started_at, enrolment_id', learnerId)).map(enrolmentOfRow);
    },
    async putEnrolment(e) {
      await atomic(async () => {
        assertSameOwner('enrolment', (await get('SELECT learner_id FROM enrolments WHERE enrolment_id = ?', e.enrolmentId))?.learner_id as string | undefined, e.learnerId);
        const { goals, ...rest } = e;
        await run(
          `INSERT INTO enrolments (enrolment_id, learner_id, language_id, started_at, goals, json) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (enrolment_id) DO UPDATE SET language_id = excluded.language_id, started_at = excluded.started_at, goals = excluded.goals, json = excluded.json`,
          e.enrolmentId, e.learnerId, e.languageId, e.startedAt, text(goals), text(rest),
        );
      });
    },
    async getTeam(teamId) {
      const r = await get('SELECT json FROM teams WHERE team_id = ?', teamId);
      return r ? obj<Team>(r) : undefined;
    },
    async putTeam(t) {
      await run('INSERT INTO teams (team_id, json) VALUES (?, ?) ON CONFLICT (team_id) DO UPDATE SET json = excluded.json', t.teamId, text(t));
    },
    async listTeamMembers(teamId) {
      return (await all('SELECT learner_id, role, since FROM team_members WHERE team_id = ? ORDER BY since, learner_id', teamId))
        .map((r) => ({ learnerId: r.learner_id as string, role: r.role as 'member' | 'leader', since: r.since as string }));
    },
    async putTeamMember(teamId, learnerId, role, since) {
      await run(
        `INSERT INTO team_members (team_id, learner_id, role, since) VALUES (?, ?, ?, ?)
         ON CONFLICT (team_id, learner_id) DO UPDATE SET role = excluded.role, since = excluded.since`,
        teamId, learnerId, role, since,
      );
    },

    // ───────────────────────────── tombstones ─────────────────────────────
    async listTombstones(learnerId) {
      return (await all('SELECT json FROM tombstones WHERE learner_id = ? ORDER BY created_at, tombstone_id', learnerId)).map((r) => obj<Tombstone>(r));
    },
    async putTombstone(t) {
      await atomic(async () => {
        assertSameOwner('tombstone', (await get('SELECT learner_id FROM tombstones WHERE tombstone_id = ?', t.tombstoneId))?.learner_id as string | undefined, t.learnerId);
        await run(
          `INSERT INTO tombstones (tombstone_id, learner_id, scope_kind, event_id, created_at, json) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (tombstone_id) DO UPDATE SET scope_kind = excluded.scope_kind, event_id = excluded.event_id, created_at = excluded.created_at, json = excluded.json`,
          t.tombstoneId, t.learnerId, t.scope.kind, t.scope.kind === 'event' ? t.scope.id : null, t.createdAt, text(t),
        );
      });
    },

    // ───────────────────────────── whole-store ─────────────────────────────
    async eraseLearner(learnerId): Promise<EraseCounts> {
      return atomic(async () => {
        await all('SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))', learnerId);
        const c = zeroErase();
        c.events = await run('DELETE FROM events WHERE learner_id = ?', learnerId); // event_units follow by cascade
        await run('DELETE FROM event_heads WHERE learner_id = ?', learnerId);
        c.knowledge = await run('DELETE FROM knowledge WHERE learner_id = ?', learnerId);
        await run('DELETE FROM projection_cursor WHERE learner_id = ?', learnerId);
        c.preferences = await run('DELETE FROM preferences WHERE learner_id = ?', learnerId);
        c.documents = await run('DELETE FROM documents WHERE learner_id = ?', learnerId);
        await run('DELETE FROM account_tokens WHERE account_id IN (SELECT account_id FROM accounts WHERE learner_id = ?)', learnerId);
        await run('DELETE FROM security_events WHERE learner_id = ?', learnerId);
        c.sessions = await run('DELETE FROM sessions WHERE learner_id = ?', learnerId);
        c.devices = await run('DELETE FROM devices WHERE learner_id = ?', learnerId);
        c.enrolments = await run('DELETE FROM enrolments WHERE learner_id = ?', learnerId);
        c.tombstones = await run('DELETE FROM tombstones WHERE learner_id = ?', learnerId);
        c.teamMemberships = await run('DELETE FROM team_members WHERE learner_id = ?', learnerId);
        c.accounts = await run('DELETE FROM accounts WHERE learner_id = ?', learnerId);
        c.learners = await run('DELETE FROM learners WHERE learner_id = ?', learnerId);
        return c;
      });
    },
    async applyTombstone(t) {
      return applyDeletion(store, t);
    },
    async provenanceStats() {
      const out: ProvenanceCount[] = [];
      for (const table of ['analyses', 'relations', 'units'] as const) {
        for (const r of await all(`SELECT origin, validation, COUNT(*) AS n FROM ${table} GROUP BY origin, validation`)) {
          out.push({ table, origin: r.origin as ProvenanceCount['origin'], validation: r.validation as ProvenanceCount['validation'], count: Number(r.n) });
        }
      }
      return out.sort(byKey((c) => [c.table, c.origin, c.validation]));
    },
    async stats() {
      const heads = await get('SELECT COALESCE(SUM(head), 0) AS n FROM event_heads') as Row;
      const learners = await get('SELECT COUNT(*) AS n FROM learners') as Row;
      const accounts = await get('SELECT COUNT(*) AS n FROM accounts') as Row;
      const version = await get('SELECT MAX(version) AS v FROM schema_version') as Row;
      const size = await get('SELECT pg_database_size(current_database()) AS n') as Row;
      return { kind: 'postgres' as const, schemaVersion: Number(version.v), eventsIssued: Number(heads.n), learners: Number(learners.n), accounts: Number(accounts.n), sizeBytes: Number(size.n) };
    },
    async getServiceState(key) {
      const r = await get('SELECT value FROM service_state WHERE key = ?', key);
      return r ? (r.value as string) : undefined;
    },
    async setServiceState(key, value) {
      await run('INSERT INTO service_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
    },
    /** Operator maintenance: reclaim dead rows and refresh the planner's statistics (VACUUM cannot run inside a transaction). */
    async compact() {
      await pool.query('VACUUM (ANALYZE)');
    },
  };

  const tokenOfRow = (r: Row): AccountToken => {
    const t: AccountToken = { tokenHash: r.token_hash as string, accountId: r.account_id as string, purpose: r.purpose as AccountToken['purpose'], createdAt: r.created_at as string, expiresAt: r.expires_at as string };
    if (r.used_at !== null) t.usedAt = r.used_at as string;
    return t;
  };
  const securityEventOfRow = (r: Row): SecurityEvent => {
    const e: SecurityEvent = { eventId: r.event_id as string, kind: r.kind as SecurityEvent['kind'], at: r.at as string };
    if (r.learner_id !== null) e.learnerId = r.learner_id as string;
    if (r.device_id !== null) e.deviceId = r.device_id as string;
    if (r.detail !== null) e.detail = r.detail as string;
    if (r.subject_ref !== null) e.subjectRef = r.subject_ref as string;
    return e;
  };
  const security: SecurityStore = {
    async putAccountToken(t) {
      await run(
        `INSERT INTO account_tokens (token_hash, account_id, purpose, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (token_hash) DO UPDATE SET account_id = excluded.account_id, purpose = excluded.purpose, created_at = excluded.created_at, expires_at = excluded.expires_at, used_at = excluded.used_at`,
        t.tokenHash, t.accountId, t.purpose, t.createdAt, t.expiresAt, t.usedAt ?? null,
      );
    },
    async consumeAccountToken(tokenHash, purpose, at) {
      // one statement: two requests presenting the same token cannot both succeed
      const r = await get('UPDATE account_tokens SET used_at = ? WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? RETURNING *', at, tokenHash, purpose, at);
      return r ? tokenOfRow(r) : undefined;
    },
    async clearAccountTokens(accountId, purpose) {
      await run('DELETE FROM account_tokens WHERE account_id = ? AND purpose = ? AND used_at IS NULL', accountId, purpose);
    },
    async deleteAccountTokensBefore(cutoff) {
      return run('DELETE FROM account_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)', cutoff, cutoff);
    },
    async touchSession(sessionId, at) {
      await run(`UPDATE sessions SET json = jsonb_set(json, '{lastSeenAt}', to_jsonb(?::text)) WHERE session_id = ? AND revoked_at IS NULL`, at, sessionId);
    },
    async listSessions(learnerId) {
      return (await all('SELECT json, revoked_at FROM sessions WHERE learner_id = ?', learnerId)).map(sessionOfRow)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.sessionId < b.sessionId ? 1 : -1));
    },
    async revokeSessions(learnerId, at, exceptSessionId) {
      return exceptSessionId === undefined
        ? run('UPDATE sessions SET revoked_at = ? WHERE learner_id = ? AND revoked_at IS NULL', at, learnerId)
        : run('UPDATE sessions SET revoked_at = ? WHERE learner_id = ? AND revoked_at IS NULL AND session_id <> ?', at, learnerId, exceptSessionId);
    },
    async deleteSessionsEndedBefore(cutoff) {
      return run(`DELETE FROM sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR (revoked_at IS NULL AND (json ->> 'expiresAt') < ?)`, cutoff, cutoff);
    },
    async appendSecurityEvent(e) {
      await run(
        'INSERT INTO security_events (event_id, learner_id, kind, at, device_id, detail, subject_ref) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (event_id) DO NOTHING',
        e.eventId, e.learnerId ?? null, e.kind, e.at, e.deviceId ?? null, e.detail ?? null, e.subjectRef ?? null,
      );
    },
    async listSecurityEvents(learnerId, limit = 100) {
      const max = Math.max(1, Math.min(1000, Math.trunc(limit)));
      return (learnerId === null
        ? await all('SELECT * FROM security_events WHERE learner_id IS NULL ORDER BY at DESC, event_id DESC LIMIT ?', max)
        : await all('SELECT * FROM security_events WHERE learner_id = ? ORDER BY at DESC, event_id DESC LIMIT ?', learnerId, max)).map(securityEventOfRow);
    },
    async deleteSecurityEventsBefore(cutoff) {
      return run('DELETE FROM security_events WHERE at < ?', cutoff);
    },
    async listAccountsDeletionDue(at, limit = 100) {
      return (await all('SELECT * FROM accounts WHERE deletion_due_at IS NOT NULL AND deletion_due_at <= ? ORDER BY deletion_due_at, account_id LIMIT ?', at, Math.max(1, Math.trunc(limit))))
        .map((r) => { const { passwordHash: _h, ...account } = accountOfRow(r); return account; });
    },
  };

  const store: ConcreteStore = {
    ...impl,
    security,
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return atomic(fn);
    },
    async close() {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };
  return store;
}
