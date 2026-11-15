/**
 * The one-time move of a device's history from the present path's key-value rows into IndexedDB (docs/ecosystem/LOADING-ARCHITECTURE-2026-11-10.md, Stage 2).
 *
 * The rows are the learner's only device copy, so the rules are strict:
 *   R1  the old rows are never modified or removed; the one write is the state row `<prefix>migration` (the present loader selects rows by known
 *       sub-prefixes and ignores it).
 *   R2  the device switches to IndexedDB only after the copy has been verified equal to what the present path yields from the same rows.
 *   R3  any failure leaves the device on the present path, with both IndexedDB databases deleted and the reason recorded.
 *   R4  an interrupted migration is safe to run again: both databases are deleted first.
 *
 * How: the old area is read ONCE into a snapshot. A copy-on-write view of the snapshot is opened by the present path (the reference: its own load-time
 * writes stay in memory). The durable store is filled from the same snapshot, mirroring `loadInto` (./persist) step by step, with events in batches; then
 * the durable repository is opened, rebuilt once, and compared with the reference on everything the repository answers.
 * Failure reasons are built from counts and field names only (they may be shown in diagnostics); never an id, a surface or any learner content.
 */
import type {
  AssistancePreferences, Enrolment, FormAnalysis, LanguagePackInfo, LinguisticUnit, PrivateDocument, StoredEvent, Tombstone, UnitAlias, UnitRelation,
} from '../../repository-contract/src';
import { openIndexedDbStore } from '../../repository-store/src/indexeddb';
import { relationKey } from '../../repository-store/src/rules';
import type { ConcreteStore } from '../../repository-store/src/rules';
import { createIndexedDbArea } from '../../repository-sync/src/idb-area';
import type { KeyValueArea } from '../../repository-sync/src/area';
import { by, eventOf, keysFor } from './persist';
import type { LocalMeta } from './persist';

export const IMPORT_BATCH = 500;

export interface MigrationState {
  state: 'switched' | 'failed';
  at: string;
  attempt: number;
  events?: number;
  reason?: string;
  /** The counts the verification compared (a switch only). */
  verified?: Record<string, number>;
  /** Set while a `clear()` of a switched device is half done: the next open finishes it. */
  clearing?: boolean;
}

export const migrationKey = (prefix: string): string => `${prefix}migration`;

export async function readState(area: KeyValueArea, prefix: string): Promise<MigrationState | undefined> {
  const k = migrationKey(prefix);
  const v = (await area.get(k))[k] as Partial<MigrationState> | undefined;
  if (!v || typeof v !== 'object') return undefined;
  if ((v.state !== 'switched' && v.state !== 'failed') || typeof v.at !== 'string' || !Number.isInteger(v.attempt)) return undefined;
  return v as MigrationState;
}

export async function writeState(area: KeyValueArea, prefix: string, s: MigrationState): Promise<void> {
  await area.set({ [migrationKey(prefix)]: s });
}

/** What the migration needs to see of an open repository (supplied by ./local, which owns the internals). */
export interface Probe {
  store: ConcreteStore;
  learnerId: string;
  /** The key-value rows of that repository (its own area). */
  area: KeyValueArea;
  inspect(): Promise<{ events: number; pendingUpload: number; uploaded: number; fromRemote: number }>;
  rebuild(): Promise<void>;
  close(): Promise<void>;
}

/** Test seams (never used by a host): a wrapper for the store the rows are imported through, and a hook that runs just before verification. */
export interface MigrationInject {
  store?: (s: ConcreteStore) => ConcreteStore;
  beforeVerify?: () => Promise<void>;
}

export interface MigrationArgs {
  oldArea: KeyValueArea;
  prefix: string;
  idb: { indexedDB: IDBFactory; name: string; keyRange?: typeof IDBKeyRange };
  now: () => string;
  attempt: number;
  /** Opens the present path over the given area (a copy-on-write view, for the reference). */
  openPresent(area: KeyValueArea): Promise<Probe>;
  /** Opens the durable repository over the databases as they stand (straight IndexedDB mode). */
  openIdb(): Promise<Probe>;
  inject?: MigrationInject;
}

export type MigrationResult =
  | { ok: true; probe: Probe; events: number; ms: number; importMs: number; verifyMs: number; verified: Record<string, number>; rows: number }
  | { ok: false; reason: string; ms: number };

// ───────────────────────────── copy-on-write view ─────────────────────────────

const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v));

/** Reads fall through to `base`; every write stays in memory. The base is never written. */
export function cowArea(base: KeyValueArea): KeyValueArea {
  const written = new Map<string, unknown>();
  const removed = new Set<string>();
  const listing = async (prefix: string): Promise<string[]> => {
    const keys = new Set((await base.list(prefix)).filter((k) => !removed.has(k)));
    for (const k of written.keys()) if (k.startsWith(prefix)) keys.add(k);
    return [...keys].sort();
  };
  const area: KeyValueArea = {
    async get(keys) {
      if (keys == null) {
        const all = await base.get(null);
        for (const k of removed) delete all[k];
        for (const [k, v] of written) all[k] = clone(v);
        return all;
      }
      const wanted = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      const rest: string[] = [];
      for (const k of wanted) {
        if (written.has(k)) out[k] = clone(written.get(k));
        else if (!removed.has(k)) rest.push(k);
      }
      if (rest.length) Object.assign(out, await base.get(rest));
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) { written.set(k, clone(v)); removed.delete(k); } },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) { written.delete(k); removed.add(k); } },
    list: listing,
    async getPrefix(prefix) {
      const rows = base.getPrefix ? await base.getPrefix(prefix) : await base.get(await base.list(prefix));
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rows)) if (k.startsWith(prefix) && !removed.has(k)) out[k] = v;
      for (const [k, v] of written) if (k.startsWith(prefix)) out[k] = clone(v);
      return out;
    },
  };
  return area;
}

/** A read-only area over an in-memory snapshot (the base of the reference's copy-on-write view); every read hands out a fresh copy. */
function snapshotArea(rows: Record<string, unknown>): KeyValueArea {
  return {
    async get(keys) {
      if (keys == null) return clone(rows);
      const out: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) if (k in rows) out[k] = clone(rows[k]);
      return out;
    },
    async set() { throw new Error('read-only snapshot'); },
    async remove() { throw new Error('read-only snapshot'); },
    async list(prefix) { return Object.keys(rows).filter((k) => k.startsWith(prefix)).sort(); },
    async getPrefix(prefix) { return clone(Object.fromEntries(Object.entries(rows).filter(([k]) => k.startsWith(prefix)))); },
  };
}

// ───────────────────────────── helpers ─────────────────────────────

const sortKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** A stable text of a value: object keys sorted, undefined-valued keys left out (what a stored row cannot tell apart). */
export function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => sortKeys(a, b))) : val));
}

const deleteDb = (f: IDBFactory, name: string): Promise<void> => new Promise((resolve, reject) => {
  const q = f.deleteDatabase(name);
  q.onsuccess = () => resolve();
  q.onerror = () => reject(q.error ?? new Error('delete failed'));
  q.onblocked = () => reject(new Error('delete blocked'));
});

export async function deleteBothDatabases(f: IDBFactory, name: string): Promise<void> {
  await deleteDb(f, name);
  await deleteDb(f, `${name}-kv`);
}

const errName = (e: unknown): string => (e instanceof Error && e.name ? e.name : 'Error');
class Step extends Error {
  constructor(public step: string, public detail: string) { super(`${step}: ${detail}`); this.name = 'MigrationStep'; }
}

const TABLES = ['event', 'unit', 'relation', 'analysis', 'alias', 'pack', 'enrolment', 'pref', 'doc', 'tomb'] as const;
const isOtherRow = (prefix: string, key: string): boolean => {
  if (!key.startsWith(prefix) || key === `${prefix}meta` || key === migrationKey(prefix)) return false;
  const k = keysFor(prefix);
  return !TABLES.some((t) => key.startsWith(k[t]));
};

const chunks = <T,>(xs: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

async function allEvents(store: ConcreteStore, learnerId: string): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for (let afterSeq = 0; ;) {
    const page = await store.list({ learnerId, afterSeq, limit: 5000 });
    out.push(...page);
    if (page.length < 5000) return out;
    afterSeq = page[page.length - 1].seq;
  }
}

// ───────────────────────────── the import (mirrors loadInto) ─────────────────────────────

interface ImportInput {
  rows: Array<[string, unknown]>;
  prefix: string;
  learnerId: string;
  /** The ids the reference stored: events it skipped or found duplicated are not offered to the durable store (and its skipped markers are copied as rows). */
  keepIds: Set<string>;
  others: Record<string, unknown>;
  meta: LocalMeta;
}

async function importRows(f: MigrationArgs['idb'], now: () => string, inject: MigrationInject | undefined, input: ImportInput): Promise<void> {
  const kr = f.keyRange ? { keyRange: f.keyRange } : {};
  const kv = await createIndexedDbArea({ indexedDB: f.indexedDB, name: `${f.name}-kv`, ...kr });
  let override: string | undefined;
  let queue: string[] = [];
  let qi = 0;
  const clockNow = (): string => override ?? queue[qi++] ?? now();
  let durable: ConcreteStore | undefined;
  try {
    durable = await openIndexedDbStore({ indexedDB: f.indexedDB, name: f.name, ...kr, now: clockNow });
    const inner = inject?.store ? inject.store(durable) : durable;
    const { rows, prefix, learnerId } = input;
    const k = keysFor(prefix);

    // the identity row first: the same learner, account, device and creation time
    await kv.set({ [k.meta]: input.meta });

    // 1. everything else in loadInto's order
    for (const p of by<LanguagePackInfo>(rows, k.pack)) await inner.putPack(p);
    const units = by<LinguisticUnit>(rows, k.unit);
    if (units.length) await inner.putUnits(units);
    const relations = by<UnitRelation>(rows, k.relation);
    if (relations.length) await inner.putRelations(relations);
    const analyses = by<FormAnalysis>(rows, k.analysis);
    if (analyses.length) await inner.putAnalyses(analyses);
    const aliases = by<UnitAlias>(rows, k.alias);
    if (aliases.length) await inner.putAliases(aliases);
    for (const e of by<Enrolment>(rows, k.enrolment)) if (e.learnerId === learnerId) await inner.putEnrolment(e);
    for (const p of by<AssistancePreferences>(rows, k.pref)) if (p.learnerId === learnerId) await inner.putPreferences(p);
    for (const t of by<Tombstone>(rows, k.tomb)) if (t.learnerId === learnerId) await inner.putTombstone(t);

    // documents: a document at revision n is rebuilt with n writes (the last one a deletion, for a deleted document)
    for (const d of by<PrivateDocument>(rows, k.doc)) {
      if (d.learnerId !== learnerId) continue;
      const steps = d.deletedAt ? d.revision - 1 : d.revision;
      for (let r = 0; r < steps; r++) await inner.putDocument({ ...d, deletedAt: undefined }, r);
      if (d.deletedAt) {
        override = d.deletedAt;
        await inner.deleteDocument(learnerId, d.docId);
        override = undefined;
      }
    }

    // events in the old `seq` order, in batches, each stamped with its own recordedAt (the store calls `now` once per stored event, in order)
    const events = rows
      .filter(([key]) => key.startsWith(k.event))
      .map(([key, v]) => ({ seq: Number(key.slice(k.event.length)), event: eventOf(v) as StoredEvent }))
      .filter((r) => Number.isFinite(r.seq) && r.event && input.keepIds.has(r.event.id))
      .sort((a, b) => a.seq - b.seq);
    for (const part of chunks(events, IMPORT_BATCH)) {
      queue = part.map((r) => r.event.recordedAt);
      qi = 0;
      const batch = part.map((r) => { const { seq: _s, recordedAt: _r, ...rest } = r.event; void _s; void _r; return rest as StoredEvent; });
      const out = await inner.append(learnerId, batch);
      const bad = out.filter((o) => !o.stored).length;
      if (bad || out.length !== batch.length) throw new Step('import', `${bad} of ${batch.length} events of a batch were not stored`);
      queue = [];
    }

    // every other row under the prefix (upload markers, the pull cursor, skipped-event rows, anything else), unchanged
    for (const part of chunks(Object.entries(input.others), 500)) await kv.set(Object.fromEntries(part));
  } finally {
    try { await durable?.close(); } finally { kv.close(); }
  }
}

// ───────────────────────────── verification ─────────────────────────────

interface Report { verified: Record<string, number>; problems: string[] }

function compareLists(report: Report, name: string, a: unknown[], b: unknown[], sortKey?: (x: unknown) => string): void {
  const x = sortKey ? [...a].sort((p, q) => sortKeys(sortKey(p), sortKey(q))) : a;
  const y = sortKey ? [...b].sort((p, q) => sortKeys(sortKey(p), sortKey(q))) : b;
  let differ = 0;
  const fields = new Set<string>();
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (canon(x[i]) === canon(y[i])) continue;
    differ += 1;
    const p = x[i] as Record<string, unknown> | undefined;
    const q = y[i] as Record<string, unknown> | undefined;
    if (p && q && typeof p === 'object' && typeof q === 'object') for (const f of new Set([...Object.keys(p), ...Object.keys(q)])) if (canon(p[f]) !== canon(q[f])) fields.add(f);
  }
  report.verified[name] = x.length;
  if (x.length !== y.length || differ) report.problems.push(`${name}: ${x.length} vs ${y.length}, ${differ} differ${fields.size ? ` (fields ${[...fields].sort().join(',')})` : ''}`);
}

async function verify(ref: Probe, got: Probe, prefix: string, rows: Array<[string, unknown]>, metaExpected: LocalMeta): Promise<Report> {
  const report: Report = { verified: {}, problems: [] };
  const k = keysFor(prefix);
  const id = ref.learnerId;
  if (got.learnerId !== id) { report.problems.push('learner: identity differs'); return report; }

  compareLists(report, 'events', await allEvents(ref.store, id), await allEvents(got.store, id));
  const unitId = (x: unknown): string => (x as { unitId: string }).unitId;
  compareLists(report, 'knowledge', await ref.store.getKnowledge(id), await got.store.getKnowledge(id), unitId);
  const byField = (f: string) => (x: unknown): string => String((x as Record<string, unknown>)[f]);
  compareLists(report, 'enrolments', await ref.store.listEnrolments(id), await got.store.listEnrolments(id), byField('enrolmentId'));
  compareLists(report, 'documents', await ref.store.listDocuments(id), await got.store.listDocuments(id), byField('docId'));
  compareLists(report, 'tombstones', await ref.store.listTombstones(id), await got.store.listTombstones(id), byField('tombstoneId'));
  compareLists(report, 'packs', await ref.store.listPacks(), await got.store.listPacks(), (x) => `${(x as LanguagePackInfo).packId}|${(x as LanguagePackInfo).version}`);

  // the preferences the present path persists (one row per language)
  const prefLangs = by<AssistancePreferences>(rows, k.pref).filter((p) => p.learnerId === id).map((p) => p.languageId);
  const prefsOf = async (s: ConcreteStore): Promise<unknown[]> => { const out: unknown[] = []; for (const l of prefLangs) out.push(await s.getPreferences(id, l)); return out; };
  compareLists(report, 'preferences', await prefsOf(ref.store), await prefsOf(got.store));

  // the shared linguistic rows, for every id present in the old rows
  const unitIds = [...new Set(by<LinguisticUnit>(rows, k.unit).map((u) => u.unitId))];
  const fetch = async <T,>(s: ConcreteStore, ids: string[], get: (s: ConcreteStore, part: string[]) => Promise<T[]>): Promise<T[]> => {
    const out: T[] = [];
    for (const part of chunks(ids, 200)) out.push(...(await get(s, part)));
    return out;
  };
  const getUnits = (s: ConcreteStore, part: string[]) => s.getUnits(part);
  compareLists(report, 'units', await fetch(ref.store, unitIds, getUnits), await fetch(got.store, unitIds, getUnits), unitId);
  const fromIds = [...new Set(by<UnitRelation>(rows, k.relation).map((r) => r.fromId))];
  const each = async <T,>(ids: string[], get: (id: string) => Promise<T>): Promise<T[]> => { const out: T[] = []; for (const part of chunks(ids, 64)) out.push(...(await Promise.all(part.map(get)))); return out; };
  const relOf = async (s: ConcreteStore): Promise<unknown[]> => (await each(fromIds, (f) => s.relationsOf(f, 'out'))).flat();
  compareLists(report, 'relations', await relOf(ref.store), await relOf(got.store), (x) => relationKey(x as UnitRelation));
  const analysisIds = [...new Set(by<FormAnalysis>(rows, k.analysis).map((a) => a.analysisId))];
  const anaOf = async (s: ConcreteStore): Promise<unknown[]> => each(analysisIds, async (a) => (await s.getAnalysis(a)) ?? null);
  compareLists(report, 'analyses', await anaOf(ref.store), await anaOf(got.store));
  const oldIds = [...new Set(by<UnitAlias>(rows, k.alias).map((a) => a.oldId))];
  const aliasOf = (s: ConcreteStore, part: string[]) => s.aliasesFor(part);
  const aliasKey = (x: unknown): string => `${(x as UnitAlias).oldId}|${(x as UnitAlias).newId}|${(x as UnitAlias).packVersion}`;
  compareLists(report, 'aliases', await fetch(ref.store, oldIds, aliasOf), await fetch(got.store, oldIds, aliasOf), aliasKey);

  // the small rows: the identity row, the upload markers, the pull cursor and anything else kept under the prefix
  const refRows = await ref.area.getPrefix!(prefix);
  const gotRows = await got.area.getPrefix!(prefix);
  const pick = (all: Record<string, unknown>): Array<[string, unknown]> => Object.entries(all).filter(([key]) => isOtherRow(prefix, key)).sort(([a], [b]) => sortKeys(a, b));
  const wantOthers = pick(refRows);
  const gotOthers = pick(gotRows);
  compareLists(report, 'markers', wantOthers.filter(([key]) => key.startsWith(k.uploaded)), gotOthers.filter(([key]) => key.startsWith(k.uploaded)));
  compareLists(report, 'otherRows', wantOthers.filter(([key]) => !key.startsWith(k.uploaded)), gotOthers.filter(([key]) => !key.startsWith(k.uploaded)));
  compareLists(report, 'meta', [metaExpected], [gotRows[k.meta]]);
  report.verified.pullCursor = wantOthers.some(([key]) => key === k.pull) ? 1 : 0;

  // what the status screens show
  const a = await ref.inspect();
  const b = await got.inspect();
  const fields = (['events', 'pendingUpload', 'uploaded', 'fromRemote'] as const).filter((f) => a[f] !== b[f]);
  report.verified.inspect = 4;
  if (fields.length) report.problems.push(`inspect: fields ${fields.join(',')} differ`);
  return report;
}

// ───────────────────────────── the migration ─────────────────────────────

export async function runMigration(args: MigrationArgs): Promise<MigrationResult> {
  const t0 = performance.now();
  const { oldArea, prefix, idb } = args;
  const k = keysFor(prefix);
  let ref: Probe | undefined;
  let got: Probe | undefined;
  let importMs = 0;
  let verifyMs = 0;
  try {
    // R4: leftovers of an interrupted run are deleted first
    try { await deleteBothDatabases(idb.indexedDB, idb.name); } catch (e) { throw new Step('cleanup', errName(e)); }

    // the old rows, read once
    let all: Record<string, unknown>;
    try { all = oldArea.getPrefix ? await oldArea.getPrefix(prefix) : await oldArea.get(null); } catch (e) { throw new Step('read', errName(e)); }
    const snapshot: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(all)) if (key.startsWith(prefix)) snapshot[key] = v;
    const rows = Object.entries(snapshot);
    const keysBefore = Object.keys(snapshot).sort(sortKeys);

    const stored = snapshot[k.meta] as Partial<LocalMeta> | undefined;
    if (!stored || typeof stored.learnerId !== 'string' || typeof stored.deviceId !== 'string' || typeof stored.accountId !== 'string' || typeof stored.createdAt !== 'string' || typeof stored.format !== 'number') {
      throw new Step('meta', 'the identity row is not valid');
    }

    // the reference: the present path over a copy-on-write view of the snapshot (its load-time writes stay in memory)
    const view = cowArea(snapshotArea(snapshot));
    ref = await args.openPresent(view);
    const refEvents = await allEvents(ref.store, ref.learnerId);
    const meta = (await view.get(k.meta))[k.meta] as LocalMeta;
    const refOthers = Object.fromEntries(Object.entries(await view.getPrefix!(prefix)).filter(([key]) => isOtherRow(prefix, key)));

    // the import
    const t1 = performance.now();
    try {
      await importRows(idb, args.now, args.inject, { rows, prefix, learnerId: ref.learnerId, keepIds: new Set(refEvents.map((e) => e.id)), others: refOthers, meta });
    } catch (e) { throw e instanceof Step ? e : new Step('import', errName(e)); }
    try {
      got = await args.openIdb();
      await got.rebuild();
    } catch (e) { throw new Step('open', errName(e)); }
    importMs = performance.now() - t1;

    // verification
    const t2 = performance.now();
    if (args.inject?.beforeVerify) await args.inject.beforeVerify();
    let report: Report;
    try { report = await verify(ref, got, prefix, rows, meta); } catch (e) { throw new Step('verify', errName(e)); }
    verifyMs = performance.now() - t2;
    if (report.problems.length) throw new Step('mismatch', report.problems.join('; '));

    // the old rows must not have changed under us (another context writing the present path would be lost by the switch)
    let keysAfter: string[];
    try { keysAfter = (await oldArea.list(prefix)).sort(sortKeys); } catch (e) { throw new Step('recheck', errName(e)); }
    const was = new Set(keysBefore);
    const now = new Set(keysAfter);
    const added = keysAfter.filter((x) => !was.has(x) && x !== migrationKey(prefix)).length;
    const gone = keysBefore.filter((x) => !now.has(x)).length;
    if (added || gone) throw new Step('recheck', `the old rows changed during the migration (${added} added, ${gone} removed)`);

    await ref.close();
    ref = undefined;
    const ms = Math.round(performance.now() - t0);
    const verified = report.verified;
    try { await writeState(oldArea, prefix, { state: 'switched', at: args.now(), attempt: args.attempt, events: refEvents.length, verified }); } catch (e) { throw new Step('state', errName(e)); }
    return { ok: true, probe: got, events: refEvents.length, ms, importMs: Math.round(importMs), verifyMs: Math.round(verifyMs), verified, rows: rows.length };
  } catch (e) {
    const reason = e instanceof Step ? (e.step === 'mismatch' ? `verification failed, ${e.detail}` : `${e.step} failed, ${e.detail}`) : `unexpected failure, ${errName(e)}`;
    let final = reason;
    try { await ref?.close(); } catch { /* the reference is in memory */ }
    try { await got?.close(); } catch { /* released below with the databases */ }
    try { await deleteBothDatabases(idb.indexedDB, idb.name); } catch (d) { final += `; cleanup incomplete (${errName(d)})`; }
    const ms = Math.round(performance.now() - t0);
    try { await writeState(oldArea, prefix, { state: 'failed', at: args.now(), attempt: args.attempt, reason: final }); } catch { /* the next open migrates again: safe */ }
    return { ok: false, reason: final, ms };
  }
}
