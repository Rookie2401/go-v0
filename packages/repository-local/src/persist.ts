/**
 * Write-through persistence for the in-memory Repository store.
 *
 * The store itself is `createMemoryStore` (same rules as the server's). Every write that changes what the learner or the
 * linguistic layer holds is also written to a `KeyValueArea`, one row per record:
 *
 *   <p>meta                        { format, learnerId, deviceId, accountId, createdAt }
 *   <p>event:<seq>                 { v: 1, event: StoredEvent }
 *   <p>unit:<unitId>               a LinguisticUnit            (Layer A: derived from lookups, never from a performance)
 *   <p>relation:<from|rel|to>      a UnitRelation
 *   <p>analysis:<analysisId>       a FormAnalysis
 *   <p>alias:<old|new|packVersion> a UnitAlias
 *   <p>pack:<packId|version>       a LanguagePackInfo
 *   <p>enrolment:<id>              an Enrolment
 *   <p>pref:<languageId>           AssistancePreferences        (a cache the engine can recompute)
 *   <p>doc:<docId>                 a PrivateDocument
 *   <p>tomb:<id>                   a Tombstone
 *
 * The knowledge projection (Layer C) is NEVER persisted: it is rebuilt from the events when the repository opens, so a stored
 * projection can never disagree with the log. Identity rows (learner, account, device, session) are recreated from `meta`.
 * A failed write (the browser's storage is full) is reported to the caller, retained in memory for retry, and counted so the host
 * can say so (`PersistStats`).
 */
import type {
  AssistancePreferences, Enrolment, FormAnalysis, LanguagePackInfo, LinguisticUnit, PrivateDocument, StoredEvent, Tombstone, UnitAlias, UnitRelation,
} from '../../repository-contract/src';
import type { ConcreteStore } from '../../repository-store/src/rules';
import { relationKey } from '../../repository-store/src/rules';
import type { KeyValueArea } from '../../repository-sync/src/area';

export const FORMAT = 1;

export interface LocalMeta { format: number; learnerId: string; deviceId: string; accountId: string; createdAt: string }

/** The key layout, from a prefix. */
export function keysFor(p: string) {
  return {
    meta: `${p}meta`,
    event: `${p}event:`,
    unit: `${p}unit:`,
    relation: `${p}relation:`,
    analysis: `${p}analysis:`,
    alias: `${p}alias:`,
    pack: `${p}pack:`,
    enrolment: `${p}enrolment:`,
    pref: `${p}pref:`,
    doc: `${p}doc:`,
    tomb: `${p}tomb:`,
    uploaded: `${p}uploaded:`,
    pull: `${p}pull`,
  } as const;
}
export type Keys = ReturnType<typeof keysFor>;

/** What persistence has done, for the status reply. */
export interface PersistStats { writes: number; failures: number; pendingWrites: number; lastError?: string }

export interface PersistIO {
  area: KeyValueArea;
  prefix: string;
  keys: Keys;
  stats: PersistStats;
  /** Rows whose last write failed; retried with the next write while the repository remains open. */
  pendingWrites: Record<string, unknown>;
  /**
   * The identity row of a repository that has recorded nothing yet. It is written together with the first row that follows, never alone: a device that
   * opened the repository and never used it (or just cleared it) holds no row at all, not even a fresh anonymous learner id.
   */
  pendingMeta?: LocalMeta;
}

/** Writes rows; a rejection is counted, retained for retry, and reported to the caller. */
export async function writeRows(io: PersistIO, items: Record<string, unknown>): Promise<boolean> {
  const pending = io.pendingWrites;
  if (!Object.keys(items).length && !Object.keys(pending).length) return true;
  if (io.pendingMeta) { items = { [io.keys.meta]: io.pendingMeta, ...items }; io.pendingMeta = undefined; }
  const all = { ...pending, ...items };
  try {
    await io.area.set(all);
    for (const key of Object.keys(all)) delete pending[key];
    io.stats.writes += Object.keys(all).length;
    io.stats.pendingWrites = 0;
    return true;
  } catch (e) {
    Object.assign(pending, all);
    io.stats.pendingWrites = Object.keys(pending).length;
    io.stats.failures += 1;
    io.stats.lastError = e instanceof Error ? e.message : String(e);
    return false;
  }
}

export async function removeRows(io: PersistIO, keys: string[]): Promise<void> {
  if (!keys.length) return;
  for (const key of keys) delete io.pendingWrites[key];
  io.stats.pendingWrites = Object.keys(io.pendingWrites).length;
  if (keys.includes(io.keys.meta)) io.pendingMeta = undefined;
  try { await io.area.remove(keys); } catch (e) {
    io.stats.failures += 1;
    io.stats.lastError = e instanceof Error ? e.message : String(e);
  }
}

const MAX_PAGE = 5000;

async function allEvents(store: ConcreteStore, learnerId: string): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for (let afterSeq = 0; ;) {
    const page = await store.list({ learnerId, afterSeq, limit: MAX_PAGE });
    out.push(...page);
    if (page.length < MAX_PAGE) return out;
    afterSeq = page[page.length - 1].seq;
  }
}

/** Removes the persisted event rows that no longer exist in the store (after a deletion), and writes the tombstones. */
async function reconcile(io: PersistIO, store: ConcreteStore, learnerId: string): Promise<void> {
  const live = new Set((await allEvents(store, learnerId)).map((e) => io.keys.event + e.seq));
  const stored = await io.area.list(io.keys.event);
  const pending = Object.keys(io.pendingWrites).filter((k) => k.startsWith(io.keys.event));
  await removeRows(io, [...new Set([...stored, ...pending])].filter((k) => !live.has(k)));
  const tombs: Record<string, unknown> = {};
  for (const t of await store.listTombstones(learnerId)) tombs[io.keys.tomb + t.tombstoneId] = t;
  await writeRows(io, tombs);
}

/**
 * An event row holds the stored event under `event`, not as the row itself: a scan of the area for "event-shaped values" (an audit, a diagnostic) finds the
 * events the host keeps in its own log and queue, and not a third copy under another learner's name.
 */
export interface EventRow { v: 1; event: StoredEvent }
const eventRow = (event: StoredEvent): EventRow => ({ v: 1, event });
const eventOf = (row: unknown): StoredEvent | undefined => {
  const e = (row as Partial<EventRow> | undefined)?.event;
  return e && typeof e === 'object' && typeof (e as StoredEvent).id === 'string' ? e : undefined;
};

/** The same store, with every relevant write mirrored into the area. Methods not named here are the memory store's own. */
export function persistingStore(inner: ConcreteStore, io: PersistIO): ConcreteStore {
  const k = io.keys;
  const unitRows = async (ids: string[]): Promise<void> => {
    const rows: Record<string, unknown> = {};
    for (const u of await inner.getUnits(ids)) rows[k.unit + u.unitId] = u;
    await writeRows(io, rows);
  };

  const store: ConcreteStore = {
    ...inner,

    async append(learnerId, events) {
      const out = await inner.append(learnerId, events);
      const rows: Record<string, unknown> = {};
      for (const o of out) {
        if (!o.stored) continue;
        const e = await inner.get(learnerId, o.id);
        if (e) rows[k.event + e.seq] = eventRow(e);
      }
      const durable = await writeRows(io, rows);
      return durable ? out : out.map((o) => o.stored ? {
        id: o.id, stored: false,
        issues: [{ path: 'persistence', message: 'event was accepted in memory but could not be durably saved; it will be retried' }],
      } : o);
    },
    async deleteEvents(learnerId, ids) {
      const n = await inner.deleteEvents(learnerId, ids);
      await reconcile(io, inner, learnerId);
      return n;
    },
    async applyTombstone(t: Tombstone) {
      const r = await inner.applyTombstone(t);
      await reconcile(io, inner, t.learnerId);
      return r;
    },
    async eraseLearner(learnerId) {
      const r = await inner.eraseLearner(learnerId);
      const mine = [k.event, k.enrolment, k.pref, k.doc, k.tomb];
      const keys: string[] = [];
      for (const p of mine) keys.push(...(await io.area.list(p)));
      keys.push(...Object.keys(io.pendingWrites).filter((key) => mine.some((p) => key.startsWith(p))));
      await removeRows(io, keys);
      return r;
    },

    async putUnits(rows: LinguisticUnit[]) {
      await inner.putUnits(rows);
      await unitRows(rows.map((u) => u.unitId));
    },
    async recordUnitCorrection(unitId, correction, flag) {
      const r = await inner.recordUnitCorrection!(unitId, correction, flag);
      if (r) await unitRows([unitId]);
      return r;
    },
    async putRelations(rows: UnitRelation[]) {
      await inner.putRelations(rows);
      const out: Record<string, unknown> = {};
      for (const r of rows) {
        const stored = (await inner.relationsOf(r.fromId, 'out')).find((x) => relationKey(x) === relationKey(r));
        if (stored) out[k.relation + relationKey(r)] = stored;
      }
      await writeRows(io, out);
    },
    async putAnalyses(rows: FormAnalysis[]) {
      await inner.putAnalyses(rows);
      const out: Record<string, unknown> = {};
      for (const a of rows) { const s = await inner.getAnalysis(a.analysisId); if (s) out[k.analysis + a.analysisId] = s; }
      await writeRows(io, out);
    },
    async invalidateAnalysis(analysisId, reason, supersededBy) {
      await inner.invalidateAnalysis(analysisId, reason, supersededBy);
      const s = await inner.getAnalysis(analysisId);
      if (s) await writeRows(io, { [k.analysis + analysisId]: s });
    },
    async putAliases(rows: UnitAlias[]) {
      await inner.putAliases(rows);
      const out: Record<string, unknown> = {};
      for (const a of rows) out[`${k.alias}${a.oldId}|${a.newId}|${a.packVersion}`] = a;
      await writeRows(io, out);
    },
    async putPack(p: LanguagePackInfo) {
      await inner.putPack(p);
      await writeRows(io, { [`${k.pack}${p.packId}|${p.version}`]: p });
    },

    async putPreferences(p) {
      await inner.putPreferences(p);
      // a preference the engine only defaulted carries nothing and is derived again on the next read: not stored
      const informative = [p.explanationDepth, p.terminology, p.transliteration, p.pronunciationFirst, p.translationAvailable, p.visualAssistance, p.accessibility].some((x) => x.origin !== 'default');
      if (informative) await writeRows(io, { [k.pref + (p.languageId ?? '')]: p });
    },
    async putEnrolment(e: Enrolment) {
      await inner.putEnrolment(e);
      await writeRows(io, { [k.enrolment + e.enrolmentId]: e });
    },
    async putTombstone(t: Tombstone) {
      await inner.putTombstone(t);
      await writeRows(io, { [k.tomb + t.tombstoneId]: t });
    },
    async putDocument(doc: PrivateDocument, expectedRevision) {
      const r = await inner.putDocument(doc, expectedRevision);
      if (r.ok) { const s = await inner.getDocument(doc.learnerId, doc.docId); if (s) await writeRows(io, { [k.doc + doc.docId]: s }); }
      return r;
    },
    async deleteDocument(learnerId, docId) {
      await inner.deleteDocument(learnerId, docId);
      const s = await inner.getDocument(learnerId, docId);
      if (s) await writeRows(io, { [k.doc + docId]: s });
    },
  };
  return store;
}

// ───────────────────────────── loading ─────────────────────────────

const by = <T>(rows: Array<[string, unknown]>, prefix: string): T[] => rows.filter(([key]) => key.startsWith(prefix)).map(([, v]) => v as T);

export interface LoadReport { events: number; skippedEvents: number; renumbered: boolean }

/** Stored events the current contract no longer accepts are kept here, unloaded, rather than dropped. */
export const SKIPPED = 'skipped:';

/**
 * Reads every row under the prefix with ONE `get(null)` and puts the records into `inner` (not through the persisting
 * wrapper: they are already on disk). Events are re-appended one at a time in `seq` order with the store's clock set to each
 * event's own `recordedAt`, so a reopened store holds the same envelope. Returns what it did.
 */
export async function loadInto(inner: ConcreteStore, io: PersistIO, learnerId: string, stamp: { current: string | undefined }): Promise<LoadReport> {
  const k = io.keys;
  const all = await io.area.get(null);
  const rows = Object.entries(all).filter(([key]) => key.startsWith(io.prefix));
  const report: LoadReport = { events: 0, skippedEvents: 0, renumbered: false };

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

  // documents: the store assigns revision = expected + 1, so a document at revision n is rebuilt with n writes (the last one a deletion, for a deleted document)
  for (const d of by<PrivateDocument>(rows, k.doc)) {
    if (d.learnerId !== learnerId) continue;
    const steps = d.deletedAt ? d.revision - 1 : d.revision;
    for (let r = 0; r < steps; r++) await inner.putDocument({ ...d, deletedAt: undefined }, r);
    if (d.deletedAt) {
      stamp.current = d.deletedAt;
      await inner.deleteDocument(learnerId, d.docId);
      stamp.current = undefined;
    }
  }

  const events = rows
    .filter(([key]) => key.startsWith(k.event))
    .map(([key, v]) => ({ key, seq: Number(key.slice(k.event.length)), event: eventOf(v) as StoredEvent }))
    .filter((r) => Number.isFinite(r.seq) && r.event)
    .sort((a, b) => a.seq - b.seq);
  const expected = new Map<string, number>();
  const skipped: Record<string, unknown> = {};
  for (const r of events) {
    const { seq: _s, recordedAt, ...rest } = r.event as StoredEvent;
    void _s;
    stamp.current = recordedAt;
    const [o] = await inner.append(learnerId, [rest as StoredEvent]);
    stamp.current = undefined;
    if (o?.stored) { report.events += 1; expected.set(r.event.id, r.seq); }
    else if (o?.duplicateOf === undefined) { report.skippedEvents += 1; skipped[`${io.prefix}${SKIPPED}${r.event.id}`] = eventRow(r.event); }
  }

  // a deletion leaves gaps in `seq`; the reopened store numbers its log without them. Rewrite the rows so key and seq agree again.
  const renumber: Array<{ id: string; was: number; now: number }> = [];
  for (const e of await allEvents(inner, learnerId)) { const was = expected.get(e.id); if (was !== undefined && was !== e.seq) renumber.push({ id: e.id, was, now: e.seq }); }
  if (renumber.length || report.skippedEvents) {
    report.renumbered = renumber.length > 0;
    const live = await allEvents(inner, learnerId);
    await writeRows(io, skipped); // written before the event rows are touched: an event is never in neither place
    await removeRows(io, events.map((r) => r.key));
    const out: Record<string, unknown> = {};
    for (const e of live) out[k.event + e.seq] = eventRow(e);
    await writeRows(io, out);
  }
  return report;
}
