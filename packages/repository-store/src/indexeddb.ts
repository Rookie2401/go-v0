/**
 * The IndexedDB Repository store: the same port and the same rules (./rules) as the memory and SQLite stores, but it keeps
 * its own rows and reads on demand, so opening it reads nothing. The IDBFactory is injected (a browser's, a worker's, or a
 * test double), so this file depends on no IndexedDB package.
 *
 * Transactions: one per store method, over every object store the method touches. Inside one, only promises of IDB requests
 * of that same transaction are awaited (see `req`, `scan`); clocks are synchronous, nothing else is awaited, so the
 * transaction never goes idle before the method is done. Values written are structured-cloned by IndexedDB itself and values
 * read are fresh objects.
 *
 * `stats()` is left out: `StoreStats.kind` (./rules) cannot name this store and that file is not ours to widen.
 */
import { provenanceColumns } from '../../repository-contract/src';
import type {
  Account, AccountToken, AppendOutcome, AssistancePreferences, Device, Enrolment, EncounterEventSummary, FormAnalysis, LanguagePackInfo, Learner, LinguisticUnit,
  PrivateDocument, ReviewStatusSummary, SecurityEvent, Session, StoredEvent, Team, Tombstone, UnitAlias, UnitKnowledge, UnitRelation,
} from '../../repository-contract/src';
import {
  appendIssues, assertSameOwner, byKey, carried, carriedAnalysis, clampLimit, conflictingReviewIdentity, decidePutDocument, defaultNow, deletedDocument, envelopeOf,
  expectedReviewPredecessorIssue, invalidated, latestPack, matchesFilter, mayReplaceAnalysis, mayReplaceByRank, normalizeEmail, outcomeId, sortPacks, tombstonedEventIds,
  withCorrection, zeroErase,
} from './rules';
import type { ConcreteStore, EraseCounts, ProvenanceCount } from './rules';
import { applyTombstone as applyDeletion } from './deletion';

export interface IndexedDbStoreOptions {
  indexedDB: IDBFactory;
  /** The factory's IDBKeyRange (default: the global one). A browser or worker needs no value; a test double does. */
  keyRange?: typeof IDBKeyRange;
  /** The database name. */
  name: string;
  /** ISO clock stamped into `recordedAt` and a deleted document's `deletedAt`. */
  now?: () => string;
}

export const INDEXEDDB_SCHEMA_VERSION = 1;

/** Up to this many alias rows the lookups read the whole table once instead of one index read per id. */
const SMALL_ALIAS_TABLE = 500;
/** The serviceState key holding the alias write counter. */
const ALIAS_STAMP_KEY = '__aliasStamp';

type Idx = [name: string, keyPath: string | string[], unique?: boolean];
interface StoreDef { keyPath: string | string[] | null; indexes?: Idx[] }

/** Every object store, its key and its indexes (the access paths the store's methods use). */
export const INDEXEDDB_SCHEMA: Record<string, StoreDef> = {
  events: { keyPath: ['learnerId', 'seq'], indexes: [['id', 'id', true], ['dedupe', ['learnerId', 'dedupeKey'], true], ['kind', ['learnerId', 'kind', 'seq']], ['language', ['learnerId', 'languageId', 'seq']], ['at', ['learnerId', 'atMs']]] },
  eventUnits: { keyPath: ['learnerId', 'unitId', 'seq'] },
  heads: { keyPath: null },
  knowledge: { keyPath: ['learnerId', 'unitId'] },
  cursors: { keyPath: null },
  units: { keyPath: 'unitId', indexes: [['language', 'languageId']] },
  relations: { keyPath: ['fromId', 'relation', 'toId'], indexes: [['from', 'fromId'], ['to', 'toId']] },
  analyses: { keyPath: 'analysisId', indexes: [['form', 'formId']] },
  aliases: { keyPath: ['oldId', 'newId', 'packVersion'], indexes: [['old', 'oldId'], ['new', 'newId']] },
  packs: { keyPath: ['packId', 'version'] },
  preferences: { keyPath: null },
  documents: { keyPath: ['learnerId', 'docId'] },
  learners: { keyPath: 'learnerId' },
  accounts: { keyPath: 'accountId', indexes: [['email', 'email'], ['learner', 'learnerId'], ['due', 'deletionDueAt']] },
  sessions: { keyPath: 'sessionId', indexes: [['tokenHash', 'tokenHash'], ['learner', 'learnerId']] },
  devices: { keyPath: ['learnerId', 'deviceId'] },
  enrolments: { keyPath: 'enrolmentId', indexes: [['learner', 'learnerId']] },
  teams: { keyPath: 'teamId' },
  members: { keyPath: ['teamId', 'learnerId'], indexes: [['learner', 'learnerId']] },
  tombstones: { keyPath: 'tombstoneId', indexes: [['learner', 'learnerId']] },
  accountTokens: { keyPath: 'tokenHash', indexes: [['account', 'accountId']] },
  securityEvents: { keyPath: 'eventId', indexes: [['learnerAt', ['_l', 'at']]] },
  serviceState: { keyPath: null },
};

// ───────────────────────────── request plumbing ─────────────────────────────

/** A request as a promise. Resolves in `onsuccess`, so a continuation runs while the transaction is still active. */
const req = <T>(q: IDBRequest<T>): Promise<T> => {
  const p = new Promise<T>((resolve, reject) => {
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error ?? new Error('IndexedDB request failed'));
  });
  p.catch(() => undefined); // a sibling request of an aborted transaction is reported through the transaction, not as an unhandled rejection
  return p;
};

/** Walks a cursor; `visit` returns true to stop. Only requests of the cursor's own transaction are involved. */
function scan(src: IDBObjectStore | IDBIndex, range: IDBKeyRange | null, dir: IDBCursorDirection, visit: (value: any, primaryKey: IDBValidKey) => boolean | void): Promise<void> {
  return new Promise((resolve, reject) => {
    const q = src.openCursor(range, dir);
    q.onerror = () => reject(q.error ?? new Error('IndexedDB cursor failed'));
    q.onsuccess = () => {
      const c = q.result;
      if (!c) return resolve();
      if (visit(c.value, c.primaryKey) === true) return resolve();
      c.continue();
    };
  });
}


const copy = <T>(v: T): T => structuredClone(v);

const stripSecret = <T extends { passwordHash?: string; tokenHash?: string }>(row: T): Omit<T, 'passwordHash' | 'tokenHash'> => {
  const { passwordHash: _p, tokenHash: _t, ...rest } = row;
  return rest;
};

const ENCOUNTER_KINDS = ['EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested'];

/** A stored event row carries `atMs` for the time index; it never leaves the store. */
const toEvent = (row: any): StoredEvent => { delete row.atMs; return row as StoredEvent; };
const unique = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];

type EventRow = StoredEvent & { atMs: number };

export async function openIndexedDbStore(opts: IndexedDbStoreOptions): Promise<ConcreteStore> {
  const now = opts.now ?? defaultNow;
  const KR = opts.keyRange ?? globalThis.IDBKeyRange;
  /** Every key whose first component(s) equal `prefix` (all of one learner's rows, all rows of one unit, ...). */
  const under = (...prefix: IDBValidKey[]): IDBKeyRange => KR.bound(prefix, [...prefix, []]);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = opts.indexedDB.open(opts.name, INDEXEDDB_SCHEMA_VERSION);
    open.onupgradeneeded = () => {
      const d = open.result;
      for (const [name, def] of Object.entries(INDEXEDDB_SCHEMA)) {
        if (d.objectStoreNames.contains(name)) continue;
        const s = def.keyPath === null ? d.createObjectStore(name) : d.createObjectStore(name, { keyPath: def.keyPath });
        for (const [iname, path, uniq] of def.indexes ?? []) s.createIndex(iname, path, { unique: uniq === true });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('could not open the IndexedDB database'));
    open.onblocked = () => reject(new Error('the IndexedDB database is blocked by another connection'));
  });
  db.onversionchange = () => db.close();

  /** One transaction over `names`; resolves with `fn`'s result once the transaction has committed, rejects (and aborts) when `fn` throws. */
  const run = <T>(names: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result: T;
    let failure: unknown;
    let failed = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failed ? failure : tx.error ?? new Error('IndexedDB transaction aborted'));
    fn(tx).then((r) => { result = r; }, (e) => { failed = true; failure = e; try { tx.abort(); } catch { /* already finished */ } });
  });
  const ro = <T>(names: string[], fn: (tx: IDBTransaction) => Promise<T>) => run(names, 'readonly', fn);
  const rw = <T>(names: string[], fn: (tx: IDBTransaction) => Promise<T>) => run(names, 'readwrite', fn);

  // ───────────────────────────── event helpers (all inside a caller's transaction) ─────────────────────────────

  const eventAt = async (tx: IDBTransaction, learnerId: string, seq: number): Promise<StoredEvent | undefined> => {
    const row = await req(tx.objectStore('events').get([learnerId, seq]));
    return row ? toEvent(row) : undefined;
  };
  const seqsOfUnit = async (tx: IDBTransaction, learnerId: string, unitId: string): Promise<number[]> =>
    (await req(tx.objectStore('eventUnits').getAll(under(learnerId, unitId)))).map((r: { seq: number }) => r.seq);
  const fetchSeqs = async (tx: IDBTransaction, learnerId: string, seqs: number[]): Promise<StoredEvent[]> => {
    const rows = await Promise.all(seqs.map((s) => eventAt(tx, learnerId, s)));
    return rows.filter((e): e is StoredEvent => e !== undefined);
  };
  /** The learner's events naming any of these units, once each, in seq order: through the unit index only. */
  const eventsOfUnits = async (tx: IDBTransaction, learnerId: string, unitIds: Iterable<string>): Promise<StoredEvent[]> => {
    const lists = await Promise.all(unique(unitIds).map((u) => seqsOfUnit(tx, learnerId, u)));
    const seqs = unique(lists.flat()).sort((a, b) => a - b);
    return fetchSeqs(tx, learnerId, seqs);
  };
  /** The unit's newest events that pass the predicate, newest first, each with how many of the unit's slots it takes (a unit named twice in one event takes two, as in the memory store). */
  const recentOfUnit = async (tx: IDBTransaction, learnerId: string, unitId: string, pred: (e: StoredEvent) => boolean, n: number): Promise<Array<{ event: StoredEvent; take: number }>> => {
    const seqs = (await seqsOfUnit(tx, learnerId, unitId)).sort((a, b) => b - a);
    const out: Array<{ event: StoredEvent; take: number }> = [];
    let left = n;
    const chunk = Math.max(8, n * 2);
    for (let i = 0; i < seqs.length && left > 0; i += chunk) {
      for (const e of await fetchSeqs(tx, learnerId, seqs.slice(i, i + chunk))) {
        if (left <= 0 || !pred(e)) continue;
        const take = Math.min(left, (e.subject.itemIds ?? []).filter((x) => x === unitId).length);
        if (take > 0) { out.push({ event: e, take }); left -= take; }
      }
    }
    return out;
  };

  /** Removes the learner's events with these ids and their unit-index rows. */
  const removeEventsIn = async (tx: IDBTransaction, learnerId: string, ids: string[]): Promise<number> => {
    const events = tx.objectStore('events');
    const eventUnits = tx.objectStore('eventUnits');
    let n = 0;
    for (const id of unique(ids)) {
      const row = (await req(events.index('id').get(id))) as EventRow | undefined;
      if (!row || row.learnerId !== learnerId) continue;
      await req(events.delete([learnerId, row.seq]));
      for (const u of unique(row.subject.itemIds ?? [])) await req(eventUnits.delete([learnerId, u, row.seq]));
      n++;
    }
    return n;
  };

  const deleteByIndex = async (store: IDBObjectStore, index: string, key: IDBValidKey | IDBKeyRange): Promise<number> => {
    const keys = await req(store.index(index).getAllKeys(key));
    for (const k of keys) await req(store.delete(k));
    return keys.length;
  };
  const deleteRange = async (store: IDBObjectStore, range: IDBKeyRange): Promise<number> => {
    const n = await req(store.count(range));
    if (n) await req(store.delete(range));
    return n;
  };

  const store: ConcreteStore = {
    // ───────────────────────────── events ─────────────────────────────
    async append(learnerId, events) {
      return rw(['events', 'eventUnits', 'heads', 'tombstones'], async (tx) => {
        const evs = tx.objectStore('events');
        const eu = tx.objectStore('eventUnits');
        let head: number | undefined;
        let headChanged = false;
        let blocked: Set<string> | undefined;
        const out: AppendOutcome[] = [];
        for (const e of events) {
          const id = outcomeId(e);
          const issues = appendIssues(learnerId, e);
          if (issues.length) { out.push({ id, stored: false, issues }); continue; }
          const existing = (await req(evs.index('id').get(e.id))) as EventRow | undefined;
          if (existing && existing.learnerId === learnerId) {
            const conflict = conflictingReviewIdentity(toEvent({ ...existing }), e);
            out.push(conflict ? { id, stored: false, issues: [conflict] } : { id, stored: false, duplicateOf: id });
            continue;
          }
          if (existing) { out.push({ id, stored: false, issues: [{ path: 'id', message: 'event id already in use' }] }); continue; }
          if (e.dedupeKey !== undefined) {
            const first = (await req(evs.index('dedupe').get([learnerId, e.dedupeKey]))) as EventRow | undefined;
            if (first) { out.push({ id, stored: false, duplicateOf: first.id }); continue; }
          }
          if (blocked === undefined) blocked = tombstonedEventIds(await req(tx.objectStore('tombstones').index('learner').getAll(learnerId)));
          if (blocked.has(e.id)) { out.push({ id, stored: false, issues: [{ path: 'id', message: 'this event was deleted by a tombstone' }] }); continue; }
          const casIssue = expectedReviewPredecessorIssue(e);
          if (casIssue) { out.push({ id, stored: false, issues: [casIssue] }); continue; }
          if (head === undefined) head = ((await req(tx.objectStore('heads').get(learnerId))) as number | undefined) ?? 0;
          const seq = head + 1;
          head = seq;
          headChanged = true;
          const recordedAt = now();
          const stored: StoredEvent = { ...envelopeOf(e, recordedAt), seq, recordedAt };
          await req(evs.put({ ...stored, atMs: Date.parse(stored.at) }));
          for (const u of unique(stored.subject.itemIds ?? [])) await req(eu.put({ learnerId, unitId: u, seq }));
          out.push({ id, stored: true });
        }
        if (headChanged) await req(tx.objectStore('heads').put(head, learnerId));
        return out;
      });
    },
    async list(f) {
      const limit = clampLimit(f.limit);
      const desc = f.order === 'desc';
      const dir: IDBCursorDirection = desc ? 'prev' : 'next';
      const l = f.learnerId;
      const after = f.afterSeq ?? 0;
      return ro(['events', 'eventUnits'], async (tx) => {
        const evs = tx.objectStore('events');
        const out: StoredEvent[] = [];
        if (f.unitId !== undefined) {
          const range = KR.bound([l, f.unitId, after], [l, f.unitId, []], true, false);
          const seqs = (await req(tx.objectStore('eventUnits').getAll(range))).map((r: { seq: number }) => r.seq);
          if (desc) seqs.reverse();
          const chunk = Math.max(16, Math.min(limit, 256));
          for (let i = 0; i < seqs.length && out.length < limit; i += chunk) {
            for (const e of await fetchSeqs(tx, l, seqs.slice(i, i + chunk))) if (matchesFilter(e, f) && out.length < limit) out.push(e);
          }
          return out;
        }
        const take = (src: IDBObjectStore | IDBIndex, range: IDBKeyRange): Promise<StoredEvent[]> => {
          const got: StoredEvent[] = [];
          return scan(src, range, dir, (row) => {
            const e = toEvent(row);
            if (matchesFilter(e, f)) got.push(e);
            return got.length >= limit;
          }).then(() => got);
        };
        if (f.kinds !== undefined) {
          const per = await Promise.all(unique(f.kinds).map((k) => take(evs.index('kind'), KR.bound([l, k, after], [l, k, []], true, false))));
          return per.flat().sort((a, b) => (desc ? b.seq - a.seq : a.seq - b.seq)).slice(0, limit);
        }
        if (f.languageId !== undefined) return take(evs.index('language'), KR.bound([l, f.languageId, after], [l, f.languageId, []], true, false));
        return take(evs, KR.bound([l, after], [l, []], true, false));
      });
    },
    async listEventsOfUnits(learnerId, unitIds) {
      return ro(['events', 'eventUnits'], (tx) => eventsOfUnits(tx, learnerId, unitIds));
    },
    async listEncounterSummaries(learnerId, languageId, unitIds, perUnitLimit) {
      return ro(['events', 'eventUnits'], async (tx) => {
        const pred = (e: StoredEvent): boolean => e.languageId === languageId && ENCOUNTER_KINDS.includes(e.kind);
        const wanted = unique(unitIds);
        const per = await Promise.all(wanted.map((u) => recentOfUnit(tx, learnerId, u, pred, perUnitLimit)));
        const bySeq = new Map<number, { event: StoredEvent; allow: Map<string, number> }>();
        per.forEach((rows, i) => {
          for (const { event, take } of rows) {
            const slot = bySeq.get(event.seq) ?? { event, allow: new Map<string, number>() };
            slot.allow.set(wanted[i]!, take);
            bySeq.set(event.seq, slot);
          }
        });
        const out: EncounterEventSummary[] = [];
        for (const { event, allow } of [...bySeq.values()].sort((a, b) => b.event.seq - a.event.seq)) {
          for (const unitId of event.subject.itemIds ?? []) {
            const left = allow.get(unitId) ?? 0;
            if (left > 0) { allow.set(unitId, left - 1); out.push({ unitId, event: copy(event) }); }
          }
        }
        return out;
      });
    },
    async getEncounterDateRanges(learnerId, languageId, unitIds) {
      return ro(['events', 'eventUnits'], async (tx) => {
        const wanted = new Set(unitIds);
        const dates = new Map<string, { first: string; last: string }>();
        for (const e of await eventsOfUnits(tx, learnerId, wanted)) {
          if (e.languageId !== languageId || !ENCOUNTER_KINDS.includes(e.kind)) continue;
          for (const id of e.subject.itemIds ?? []) {
            if (!wanted.has(id)) continue;
            const d = dates.get(id);
            if (!d) dates.set(id, { first: e.at, last: e.at });
            else {
              if (Date.parse(e.at) < Date.parse(d.first)) d.first = e.at;
              if (Date.parse(e.at) > Date.parse(d.last)) d.last = e.at;
            }
          }
        }
        return [...wanted].map((unitId) => ({ unitId, ...(dates.has(unitId) ? { firstEncounter: dates.get(unitId)!.first, lastEncounter: dates.get(unitId)!.last } : {}) }));
      });
    },
    async listReviewStatusSummaries(learnerId, languageId, unitIds) {
      return ro(['events', 'eventUnits'], async (tx) => {
        const wanted = new Set(unitIds);
        const latest = new Map<string, ReviewStatusSummary>();
        for (const e of await eventsOfUnits(tx, learnerId, wanted)) {
          if (e.languageId !== languageId || !['CardAdded', 'CardRemoved', 'ReviewItemInvalidated'].includes(e.kind) || !e.subject.cardId) continue;
          for (const unitId of e.subject.itemIds ?? []) {
            if (!wanted.has(unitId)) continue;
            const key = `${unitId}\u0000${e.subject.cardId}`;
            const old = latest.get(key)?.event;
            if (!old || Date.parse(e.at) > Date.parse(old.at) || (Date.parse(e.at) === Date.parse(old.at) && e.id > old.id)) latest.set(key, { unitId, event: copy(e) });
          }
        }
        return [...latest.values()];
      });
    },
    async listAssistanceRequestedUnitIds(learnerId, languageId, unitIds) {
      return ro(['events', 'eventUnits'], async (tx) => {
        const wanted = new Set(unitIds);
        const found = new Set<string>();
        for (const e of await eventsOfUnits(tx, learnerId, wanted)) {
          if (e.languageId !== languageId || e.kind !== 'AssistanceRequested') continue;
          for (const id of e.subject.itemIds ?? []) if (wanted.has(id)) found.add(id);
        }
        return [...found];
      });
    },
    async get(learnerId, id) {
      return ro(['events'], async (tx) => {
        const row = (await req(tx.objectStore('events').index('id').get(id))) as EventRow | undefined;
        return row && row.learnerId === learnerId ? toEvent(row) : undefined;
      });
    },
    async head(learnerId) {
      return ro(['heads'], async (tx) => ((await req(tx.objectStore('heads').get(learnerId))) as number | undefined) ?? 0);
    },
    async deleteEvents(learnerId, ids) {
      return rw(['events', 'eventUnits'], (tx) => removeEventsIn(tx, learnerId, ids));
    },

    // ───────────────────────────── layer A ─────────────────────────────
    async getUnits(ids) {
      return ro(['units'], async (tx) => {
        const rows = await Promise.all(unique(ids).map((id) => req(tx.objectStore('units').get(id))));
        return rows.filter((u): u is LinguisticUnit => u !== undefined);
      });
    },
    async putUnits(rows) {
      return rw(['units'], async (tx) => {
        const s = tx.objectStore('units');
        for (const u of rows) {
          const cur = (await req(s.get(u.unitId))) as LinguisticUnit | undefined;
          if (mayReplaceByRank(cur?.status, u.status)) await req(s.put(carried(cur, u)));
        }
      });
    },
    async recordUnitCorrection(unitId, correction, flag) {
      return rw(['units'], async (tx) => {
        const s = tx.objectStore('units');
        const cur = (await req(s.get(unitId))) as LinguisticUnit | undefined;
        if (!cur) return undefined;
        const r = withCorrection(cur, correction, flag);
        await req(s.put(r.unit));
        return r;
      });
    },
    async findUnits(q) {
      const limit = clampLimit(q.limit);
      return ro(['units'], async (tx) => {
        const out: LinguisticUnit[] = [];
        // index entries with one languageId come in primary-key (unitId) order, the order the port sorts by
        await scan(tx.objectStore('units').index('language'), KR.only(q.languageId), 'next', (u: LinguisticUnit) => {
          if ((q.kind === undefined || u.kind === q.kind) && (q.label === undefined || u.label === q.label)) out.push(u);
          return out.length >= limit;
        });
        return out;
      });
    },
    async relationsOf(unitId, direction = 'both') {
      return ro(['relations'], async (tx) => {
        const s = tx.objectStore('relations');
        const out: UnitRelation[] = [];
        if (direction !== 'in') out.push(...(await req(s.index('from').getAll(unitId))));
        if (direction !== 'out') out.push(...(await req(s.index('to').getAll(unitId))));
        const seen = new Set<string>();
        return out.filter((r) => { const k = `${r.fromId}\u0000${r.relation}\u0000${r.toId}`; return seen.has(k) ? false : (seen.add(k), true); })
          .sort(byKey((r) => [r.fromId, r.relation, r.toId]));
      });
    },
    async putRelations(rows) {
      return rw(['relations'], async (tx) => {
        const s = tx.objectStore('relations');
        for (const r of rows) {
          const cur = (await req(s.get([r.fromId, r.relation, r.toId]))) as UnitRelation | undefined;
          if (mayReplaceByRank(cur?.status, r.status)) await req(s.put(carried(cur, r)));
        }
      });
    },
    async getAnalysis(analysisId) {
      return ro(['analyses'], async (tx) => (await req(tx.objectStore('analyses').get(analysisId))) as FormAnalysis | undefined);
    },
    async analysesOfForm(formId, sentenceKey) {
      return ro(['analyses'], async (tx) => {
        const rows = (await req(tx.objectStore('analyses').index('form').getAll(formId))) as FormAnalysis[];
        return rows.filter((a) => sentenceKey === undefined || a.sentenceKey === sentenceKey).sort(byKey((a) => [a.analysisId]));
      });
    },
    async putAnalyses(rows) {
      return rw(['analyses'], async (tx) => {
        const s = tx.objectStore('analyses');
        for (const a of rows) {
          const cur = (await req(s.get(a.analysisId))) as FormAnalysis | undefined;
          if (mayReplaceAnalysis(cur, a)) await req(s.put(carriedAnalysis(cur, a)));
        }
      });
    },
    async invalidateAnalysis(analysisId, reason, supersededBy) {
      return rw(['analyses'], async (tx) => {
        const s = tx.objectStore('analyses');
        const a = (await req(s.get(analysisId))) as FormAnalysis | undefined;
        if (a) await req(s.put(invalidated(a, reason, supersededBy)));
      });
    },
    async aliasesFor(ids) {
      return ro(['aliases'], async (tx) => {
        const st = tx.objectStore('aliases');
        const n = (await req(st.count())) as number;
        if (n === 0) return [] as UnitAlias[];
        if (n <= SMALL_ALIAS_TABLE) {
          const want = new Set(ids);
          const all = (await req(st.getAll())) as UnitAlias[];
          return all.filter((a) => want.has(a.oldId)).sort(byKey((a) => [a.oldId, a.newId, a.packVersion]));
        }
        const lists = await Promise.all(unique(ids).map((id) => req(st.index('old').getAll(id))));
        return (lists.flat() as UnitAlias[]).sort(byKey((a) => [a.oldId, a.newId, a.packVersion]));
      });
    },
    async aliasesTo(ids) {
      return ro(['aliases'], async (tx) => {
        const st = tx.objectStore('aliases');
        const n = (await req(st.count())) as number;
        if (n === 0) return [] as UnitAlias[];
        if (n <= SMALL_ALIAS_TABLE) {
          const want = new Set(ids);
          const all = (await req(st.getAll())) as UnitAlias[];
          return all.filter((a) => want.has(a.newId)).sort(byKey((a) => [a.newId, a.oldId, a.packVersion]));
        }
        const lists = await Promise.all(unique(ids).map((id) => req(st.index('new').getAll(id))));
        return (lists.flat() as UnitAlias[]).sort(byKey((a) => [a.newId, a.oldId, a.packVersion]));
      });
    },
    async aliasStamp() {
      return ro(['serviceState'], async (tx) => String((await req(tx.objectStore('serviceState').get(ALIAS_STAMP_KEY))) ?? '0'));
    },
    async putAliases(rows) {
      return rw(['aliases', 'serviceState'], async (tx) => {
        for (const a of rows) await req(tx.objectStore('aliases').put(a));
        const ss = tx.objectStore('serviceState');
        const cur = Number((await req(ss.get(ALIAS_STAMP_KEY))) ?? 0);
        await req(ss.put(String(cur + 1), ALIAS_STAMP_KEY));
      });
    },
    async getPack(packId, version) {
      return ro(['packs'], async (tx) => {
        const all = (await req(tx.objectStore('packs').getAll(under(packId)))) as LanguagePackInfo[];
        return version === undefined ? latestPack(all) : all.find((x) => x.version === version);
      });
    },
    async putPack(p) {
      return rw(['packs'], async (tx) => { await req(tx.objectStore('packs').put(p)); });
    },
    async listPacks(languageId) {
      return ro(['packs'], async (tx) => sortPacks(((await req(tx.objectStore('packs').getAll())) as LanguagePackInfo[]).filter((p) => languageId === undefined || p.languageId === languageId)));
    },

    // ───────────────────────────── layer C ─────────────────────────────
    async getKnowledge(learnerId, unitIds) {
      return ro(['knowledge'], async (tx) => {
        const s = tx.objectStore('knowledge');
        if (!unitIds) return (await req(s.getAll(under(learnerId)))) as UnitKnowledge[];
        const rows = await Promise.all(unique(unitIds).map((u) => req(s.get([learnerId, u]))));
        return (rows.filter((k): k is UnitKnowledge => k !== undefined)).sort(byKey((k) => [k.unitId]));
      });
    },
    async getKnowledgePage(learnerId, q) {
      const limit = Math.max(1, Math.min(500, q.limit));
      return ro(['knowledge', 'events', 'eventUnits'], async (tx) => {
        const s = tx.objectStore('knowledge');
        const out: UnitKnowledge[] = [];
        let after = q.after ?? '';
        const batch = q.sourceRef === undefined ? limit : 64;
        for (;;) {
          const candidates: UnitKnowledge[] = [];
          let more = false;
          await scan(s, KR.bound([learnerId, after], [learnerId, []], true, false), 'next', (k: UnitKnowledge) => {
            if (k.languageId === q.languageId) candidates.push(k);
            after = k.unitId;
            if (candidates.length >= batch) { more = true; return true; }
            return false;
          });
          if (q.sourceRef === undefined) { out.push(...candidates); }
          else {
            const keep = await Promise.all(candidates.map(async (k) => {
              for (const e of await eventsOfUnits(tx, learnerId, [k.unitId])) {
                if (e.languageId === q.languageId && ENCOUNTER_KINDS.includes(e.kind) && Object.values(e.subject.sourceRef ?? {}).includes(q.sourceRef)) return true;
              }
              return false;
            }));
            candidates.forEach((k, i) => { if (keep[i]) out.push(k); });
          }
          if (out.length >= limit || !more) return out.slice(0, limit);
        }
      });
    },
    async getEncounteredKnowledgeStats(learnerId, languageId) {
      return ro(['knowledge'], async (tx) => {
        const counts = { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 };
        await scan(tx.objectStore('knowledge'), under(learnerId), 'next', (k: UnitKnowledge) => { if (k.languageId === languageId && k.encounters > 0) counts[k.level]++; });
        return { total: Object.values(counts).reduce((a, b) => a + b, 0), counts };
      });
    },
    async putKnowledge(rows) {
      return rw(['knowledge'], async (tx) => { for (const k of rows) await req(tx.objectStore('knowledge').put(k)); });
    },
    async clearKnowledge(learnerId) {
      return rw(['knowledge'], async (tx) => { await req(tx.objectStore('knowledge').delete(under(learnerId))); });
    },
    async getProjectionCursor(learnerId) {
      return ro(['cursors'], async (tx) => (await req(tx.objectStore('cursors').get(learnerId))) as { seq: number; modelVersion: string } | undefined);
    },
    async putProjectionCursor(learnerId, cursor) {
      return rw(['cursors'], async (tx) => { await req(tx.objectStore('cursors').put({ seq: cursor.seq, modelVersion: cursor.modelVersion }, learnerId)); });
    },
    async getPreferences(learnerId, languageId) {
      return ro(['preferences'], async (tx) => (await req(tx.objectStore('preferences').get([learnerId, languageId ?? '']))) as AssistancePreferences | undefined);
    },
    async putPreferences(p) {
      return rw(['preferences'], async (tx) => { await req(tx.objectStore('preferences').put(p, [p.learnerId, p.languageId ?? ''])); });
    },

    // ───────────────────────────── documents ─────────────────────────────
    async getDocument(learnerId, docId) {
      return ro(['documents'], async (tx) => (await req(tx.objectStore('documents').get([learnerId, docId]))) as PrivateDocument | undefined);
    },
    async listDocuments(learnerId) {
      return ro(['documents'], async (tx) => (await req(tx.objectStore('documents').getAll(under(learnerId)))) as PrivateDocument[]);
    },
    async putDocument(doc, expectedRevision) {
      return rw(['documents'], async (tx) => {
        const s = tx.objectStore('documents');
        const stored = (await req(s.get([doc.learnerId, doc.docId]))) as PrivateDocument | undefined;
        const decision = decidePutDocument(stored, doc, expectedRevision);
        if ('conflict' in decision) return decision.conflict as { ok: false; current: PrivateDocument };
        await req(s.put(decision.write));
        return { ok: true as const };
      });
    },
    async deleteDocument(learnerId, docId) {
      return rw(['documents'], async (tx) => {
        const s = tx.objectStore('documents');
        const d = (await req(s.get([learnerId, docId]))) as PrivateDocument | undefined;
        if (d) await req(s.put(deletedDocument(d, now())));
      });
    },

    // ───────────────────────────── identity ─────────────────────────────
    async getLearner(learnerId) {
      return ro(['learners'], async (tx) => (await req(tx.objectStore('learners').get(learnerId))) as Learner | undefined);
    },
    async putLearner(l) {
      return rw(['learners'], async (tx) => { await req(tx.objectStore('learners').put(l)); });
    },
    async getAccountByEmail(email) {
      const want = normalizeEmail(email);
      return ro(['accounts'], async (tx) => (await req(tx.objectStore('accounts').index('email').get(want))) as (Account & { passwordHash: string }) | undefined);
    },
    async getAccount(accountId) {
      return ro(['accounts'], async (tx) => {
        const a = (await req(tx.objectStore('accounts').get(accountId))) as (Account & { passwordHash: string }) | undefined;
        return a ? (stripSecret(a) as Account) : undefined;
      });
    },
    async putAccount(a) {
      const email = normalizeEmail(a.email);
      return rw(['accounts'], async (tx) => {
        const s = tx.objectStore('accounts');
        for (const other of (await req(s.index('email').getAll(email))) as Account[]) if (other.accountId !== a.accountId) throw new Error('email already in use');
        assertSameOwner('account', ((await req(s.get(a.accountId))) as Account | undefined)?.learnerId, a.learnerId);
        await req(s.put({ ...a, email }));
      });
    },
    async getSessionByTokenHash(tokenHash) {
      return ro(['sessions'], async (tx) => {
        const s = (await req(tx.objectStore('sessions').index('tokenHash').get(tokenHash))) as (Session & { tokenHash: string }) | undefined;
        return s ? (stripSecret(s) as Session) : undefined;
      });
    },
    async putSession(s) {
      return rw(['sessions'], async (tx) => {
        const st = tx.objectStore('sessions');
        for (const other of (await req(st.index('tokenHash').getAll((s as { tokenHash: string }).tokenHash))) as Session[]) if (other.sessionId !== s.sessionId) throw new Error('token hash already in use');
        assertSameOwner('session', ((await req(st.get(s.sessionId))) as Session | undefined)?.learnerId, s.learnerId);
        await req(st.put(s));
      });
    },
    async revokeSession(sessionId, at) {
      return rw(['sessions'], async (tx) => {
        const st = tx.objectStore('sessions');
        const s = (await req(st.get(sessionId))) as Session | undefined;
        if (s && s.revokedAt === undefined) { s.revokedAt = at; await req(st.put(s)); }
      });
    },
    async getDevice(learnerId, deviceId) {
      return ro(['devices'], async (tx) => (await req(tx.objectStore('devices').get([learnerId, deviceId]))) as Device | undefined);
    },
    async putDevice(d) {
      return rw(['devices'], async (tx) => { await req(tx.objectStore('devices').put(d)); });
    },
    async listEnrolments(learnerId) {
      return ro(['enrolments'], async (tx) => ((await req(tx.objectStore('enrolments').index('learner').getAll(learnerId))) as Enrolment[]).sort(byKey((e) => [e.startedAt, e.enrolmentId])));
    },
    async putEnrolment(e) {
      return rw(['enrolments'], async (tx) => {
        const s = tx.objectStore('enrolments');
        assertSameOwner('enrolment', ((await req(s.get(e.enrolmentId))) as Enrolment | undefined)?.learnerId, e.learnerId);
        await req(s.put(e));
      });
    },
    async getTeam(teamId) {
      return ro(['teams'], async (tx) => (await req(tx.objectStore('teams').get(teamId))) as Team | undefined);
    },
    async putTeam(t) {
      return rw(['teams'], async (tx) => { await req(tx.objectStore('teams').put(t)); });
    },
    async listTeamMembers(teamId) {
      return ro(['members'], async (tx) => {
        const rows = (await req(tx.objectStore('members').getAll(under(teamId)))) as Array<{ teamId: string; learnerId: string; role: 'member' | 'leader'; since: string }>;
        return rows.sort(byKey((m) => [m.since, m.learnerId])).map((m) => ({ learnerId: m.learnerId, role: m.role, since: m.since }));
      });
    },
    async putTeamMember(teamId, learnerId, role, since) {
      return rw(['members'], async (tx) => { await req(tx.objectStore('members').put({ teamId, learnerId, role, since })); });
    },

    // ───────────────────────────── tombstones ─────────────────────────────
    async listTombstones(learnerId) {
      return ro(['tombstones'], async (tx) => ((await req(tx.objectStore('tombstones').index('learner').getAll(learnerId))) as Tombstone[]).sort(byKey((t) => [t.createdAt, t.tombstoneId])));
    },
    async putTombstone(t) {
      return rw(['tombstones'], async (tx) => {
        const s = tx.objectStore('tombstones');
        assertSameOwner('tombstone', ((await req(s.get(t.tombstoneId))) as Tombstone | undefined)?.learnerId, t.learnerId);
        await req(s.put(t));
      });
    },

    // ───────────────────────────── whole-store ─────────────────────────────
    async transaction(fn) {
      return fn();
    },
    async eraseLearner(learnerId): Promise<EraseCounts> {
      return rw(Object.keys(INDEXEDDB_SCHEMA), async (tx) => {
        const c = zeroErase();
        const st = (n: string): IDBObjectStore => tx.objectStore(n);
        c.events = await deleteRange(st('events'), under(learnerId));
        await req(st('eventUnits').delete(under(learnerId)));
        await req(st('heads').delete(learnerId));
        c.knowledge = await deleteRange(st('knowledge'), under(learnerId));
        await req(st('cursors').delete(learnerId));
        c.preferences = await deleteRange(st('preferences'), under(learnerId));
        c.documents = await deleteRange(st('documents'), under(learnerId));
        c.sessions = await deleteByIndex(st('sessions'), 'learner', learnerId);
        c.devices = await deleteRange(st('devices'), under(learnerId));
        c.enrolments = await deleteByIndex(st('enrolments'), 'learner', learnerId);
        c.tombstones = await deleteByIndex(st('tombstones'), 'learner', learnerId);
        c.teamMemberships = await deleteByIndex(st('members'), 'learner', learnerId);
        const accountIds = await req(st('accounts').index('learner').getAllKeys(learnerId));
        for (const id of accountIds) await deleteByIndex(st('accountTokens'), 'account', id);
        for (const k of await req(st('securityEvents').index('learnerAt').getAllKeys(under(learnerId)))) await req(st('securityEvents').delete(k));
        c.accounts = await deleteByIndex(st('accounts'), 'learner', learnerId);
        c.learners = await deleteRange(st('learners'), KR.only(learnerId));
        return c;
      });
    },
    async applyTombstone(t) {
      return applyDeletion(store, t);
    },
    async provenanceStats() {
      return ro(['units', 'relations', 'analyses'], async (tx) => {
        const tally = new Map<string, ProvenanceCount>();
        const add = (table: ProvenanceCount['table'], row: Parameters<typeof provenanceColumns>[0]): boolean => {
          const { origin, validation } = provenanceColumns(row);
          const key = `${table}\u0000${origin}\u0000${validation}`;
          const c = tally.get(key);
          if (c) c.count++; else tally.set(key, { table, origin, validation, count: 1 });
          return false;
        };
        await scan(tx.objectStore('units'), null, 'next', (u) => add('units', u));
        await scan(tx.objectStore('relations'), null, 'next', (r) => add('relations', r));
        await scan(tx.objectStore('analyses'), null, 'next', (a) => add('analyses', a));
        return [...tally.values()].sort(byKey((c) => [c.table, c.origin, c.validation]));
      });
    },
    async getServiceState(key) {
      return ro(['serviceState'], async (tx) => (await req(tx.objectStore('serviceState').get(key))) as string | undefined);
    },
    async setServiceState(key, value) {
      return rw(['serviceState'], async (tx) => { await req(tx.objectStore('serviceState').put(value, key)); });
    },
    async close() {
      db.close();
    },
  };

  store.security = {
    async putAccountToken(t) {
      return rw(['accountTokens'], async (tx) => { await req(tx.objectStore('accountTokens').put(t)); });
    },
    async consumeAccountToken(tokenHash, purpose, at) {
      return rw(['accountTokens'], async (tx) => {
        const s = tx.objectStore('accountTokens');
        const t = (await req(s.get(tokenHash))) as AccountToken | undefined;
        if (!t || t.purpose !== purpose || t.usedAt !== undefined || !(Date.parse(t.expiresAt) > Date.parse(at))) return undefined;
        t.usedAt = at;
        await req(s.put(t));
        return copy(t);
      });
    },
    async clearAccountTokens(accountId, purpose) {
      return rw(['accountTokens'], async (tx) => {
        const s = tx.objectStore('accountTokens');
        for (const t of (await req(s.index('account').getAll(accountId))) as AccountToken[]) if (t.purpose === purpose && t.usedAt === undefined) await req(s.delete(t.tokenHash));
      });
    },
    async deleteAccountTokensBefore(cutoff) {
      return rw(['accountTokens'], async (tx) => {
        const s = tx.objectStore('accountTokens');
        const doomed: string[] = [];
        await scan(s, null, 'next', (t: AccountToken) => {
          if (Date.parse(t.expiresAt) < Date.parse(cutoff) || (t.usedAt !== undefined && Date.parse(t.usedAt) < Date.parse(cutoff))) doomed.push(t.tokenHash);
        });
        for (const k of doomed) await req(s.delete(k));
        return doomed.length;
      });
    },
    async touchSession(sessionId, at) {
      return rw(['sessions'], async (tx) => {
        const s = tx.objectStore('sessions');
        const row = (await req(s.get(sessionId))) as Session | undefined;
        if (row && row.revokedAt === undefined) { row.lastSeenAt = at; await req(s.put(row)); }
      });
    },
    async listSessions(learnerId) {
      return ro(['sessions'], async (tx) => {
        const rows = (await req(tx.objectStore('sessions').index('learner').getAll(learnerId))) as Array<Session & { tokenHash: string }>;
        return rows.map((s) => stripSecret(s) as Session)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.sessionId < b.sessionId ? 1 : -1));
      });
    },
    async revokeSessions(learnerId, at, exceptSessionId) {
      return rw(['sessions'], async (tx) => {
        const s = tx.objectStore('sessions');
        let n = 0;
        for (const row of (await req(s.index('learner').getAll(learnerId))) as Session[]) {
          if (row.revokedAt !== undefined || row.sessionId === exceptSessionId) continue;
          row.revokedAt = at;
          await req(s.put(row));
          n++;
        }
        return n;
      });
    },
    async deleteSessionsEndedBefore(cutoff) {
      return rw(['sessions'], async (tx) => {
        const s = tx.objectStore('sessions');
        const doomed: string[] = [];
        await scan(s, null, 'next', (row: Session) => {
          const ended = row.revokedAt !== undefined ? row.revokedAt : row.expiresAt;
          if (Date.parse(ended) < Date.parse(cutoff)) doomed.push(row.sessionId);
        });
        for (const k of doomed) await req(s.delete(k));
        return doomed.length;
      });
    },
    async appendSecurityEvent(e) {
      return rw(['securityEvents'], async (tx) => {
        const s = tx.objectStore('securityEvents');
        if ((await req(s.count(e.eventId))) === 0) await req(s.put({ ...e, _l: e.learnerId ?? '\u0000' }));
      });
    },
    async listSecurityEvents(learnerId, limit = 100) {
      const n = Math.max(1, Math.min(1000, limit));
      return ro(['securityEvents'], async (tx) => {
        const out: SecurityEvent[] = [];
        // newest first: (at, eventId) descending, the index's own order read backwards
        await scan(tx.objectStore('securityEvents').index('learnerAt'), under(learnerId ?? '\u0000'), 'prev', (row: SecurityEvent & { _l?: string }) => {
          delete row._l;
          out.push(row);
          return out.length >= n;
        });
        return out;
      });
    },
    async deleteSecurityEventsBefore(cutoff) {
      return rw(['securityEvents'], async (tx) => {
        const s = tx.objectStore('securityEvents');
        const doomed: string[] = [];
        await scan(s, null, 'next', (row: SecurityEvent) => { if (Date.parse(row.at) < Date.parse(cutoff)) doomed.push(row.eventId); });
        for (const k of doomed) await req(s.delete(k));
        return doomed.length;
      });
    },
    async listAccountsDeletionDue(at, limit = 100) {
      return ro(['accounts'], async (tx) => {
        const out: Account[] = [];
        // only rows that carry deletionDueAt are in the index, in ascending deletionDueAt order
        await scan(tx.objectStore('accounts').index('due'), null, 'next', (a: Account & { passwordHash?: string }) => {
          if (a.deletionDueAt !== undefined && Date.parse(a.deletionDueAt) <= Date.parse(at)) out.push(stripSecret(a) as Account);
          return out.length >= limit;
        });
        return out;
      });
    },
  };
  return store;
}
