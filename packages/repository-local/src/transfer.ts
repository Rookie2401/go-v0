/**
 * Moving a device's history to an account and back: `uploadTo` (after sign-in) and `pullFrom`.
 *
 * Upload keeps a marker per event, `<prefix>uploaded:<eventId>` = { to: <remote learnerId>, at }, so an event is sent once, to one account:
 * what was one account's history is never sent to another (the service refuses a repeated event id from a second learner anyway). The local copy is never removed. An event is sent
 * under the account's identity (the local learner and enrolment ids are replaced by the account's; an enrolment for a language the
 * account lacks is created from the local one), with its own id and `dedupeKey`, so a repeat is stored once by the service whatever
 * the markers say, and a duplicate answer counts as success. Events the local service wrote itself (`producer.app` = "repository":
 * enrolment changes, corrections) are not sent: a client may not name that producer, and the account's enrolments are its own.
 *
 * Pull reads the account's log page by page (`GET /events`) and appends the events this device does not have, under the local learner,
 * with a marker `{ from: <remote learnerId> }` so they are never uploaded again (and never to another account).
 */
import { familyOf } from '../../repository-contract/src';
import type { AppendOutcome, Enrolment, GoEvent, StoredEvent } from '../../repository-contract/src';
import type { ConcreteStore } from '../../repository-store/src/rules';
import type { RepositoryApi } from '../../repository-service/src/api';
import type { KeyValueArea } from '../../repository-sync/src/area';
import { writeRows, type PersistIO } from './persist';

export const UPLOAD_BATCH = 100;
const PAGE = 1000;

export interface UploadMarker { to?: string; from?: string; at: string }
export interface UploadResult {
  sent: number; duplicates: number; failed: number;
  /** Events held back because the account has no open enrolment in their language. */
  waiting: number;
}

export interface TransferContext {
  io: PersistIO;
  store: ConcreteStore;
  learnerId: string;
  now: () => string;
  /** Folds new events into the knowledge projection. */
  project(): Promise<void>;
  /** Registers the surfaces of lookup events in the linguistic layer (best effort). */
  register(events: GoEvent[]): Promise<void>;
}

const area = (c: TransferContext): KeyValueArea => c.io.area;

export async function allEvents(store: ConcreteStore, learnerId: string): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for (let afterSeq = 0; ;) {
    const page = await store.list({ learnerId, afterSeq, limit: 5000 });
    out.push(...page);
    if (page.length < 5000) return out;
    afterSeq = page[page.length - 1].seq;
  }
}

/**
 * Every account this device's history has been sent to or taken from: the learner ids on the markers of all its events. Reads the whole log and its
 * markers (seconds on a large history): for a one-time question, not for a status line.
 */
export async function accountsOf(c: TransferContext): Promise<string[]> {
  const events = await allEvents(c.store, c.learnerId);
  const out = new Set<string>();
  for (const m of (await markersOf(c, events.map((e) => e.id))).values()) { if (typeof m.to === 'string' && m.to) out.add(m.to); if (typeof m.from === 'string' && m.from) out.add(m.from); }
  return [...out];
}

/** The marker rows of these event ids. */
export async function markersOf(c: TransferContext, ids: string[]): Promise<Map<string, UploadMarker>> {
  const out = new Map<string, UploadMarker>();
  for (let i = 0; i < ids.length; i += 500) {
    const keys = ids.slice(i, i + 500).map((id) => c.io.keys.uploaded + id);
    const rows = await area(c).get(keys);
    for (const id of ids.slice(i, i + 500)) {
      const m = rows[c.io.keys.uploaded + id] as UploadMarker | undefined;
      if (m && typeof m === 'object') out.set(id, m);
    }
  }
  return out;
}

/** Events the local service wrote itself are the account's to write; everything else the device recorded is the learner's history. */
export const isUploadable = (e: GoEvent): boolean => e.producer.app !== 'repository';

/** The events not yet sent to, or received from, any account, in log order. */
export async function pendingFor(c: TransferContext): Promise<StoredEvent[]> {
  const events = (await allEvents(c.store, c.learnerId)).filter(isUploadable);
  const markers = await markersOf(c, events.map((e) => e.id));
  return events.filter((e) => !markers.has(e.id));
}

/** Records that these events belong to an account already (the host sent them by another road): they are not sent again. */
export async function markOwned(c: TransferContext, ids: string[], remoteLearnerId: string): Promise<void> {
  const at = c.now();
  const rows: Record<string, unknown> = {};
  for (const id of ids) rows[c.io.keys.uploaded + id] = { to: remoteLearnerId, at } satisfies UploadMarker;
  await writeRows(c.io, rows);
}

type Route = 'events' | 'reviews' | 'writing';
const routeOf = (e: GoEvent): Route => {
  const f = familyOf(e.kind);
  if (f === 'review' || f === 'listening') return 'reviews';
  if (e.kind === 'ProductionRecorded') return 'writing';
  return 'events';
};

const chunk = <T>(xs: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

/** The enrolment each language's events go under on the account: its open one (the latest), if it has one. */
function remoteEnrolments(languages: string[], existing: Enrolment[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const lang of languages) {
    const open = existing.filter((e) => e.languageId === lang && !e.endedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
    if (open) out.set(lang, open.enrolmentId);
  }
  return out;
}

export async function upload(c: TransferContext, remote: RepositoryApi, opts: { onProgress?: (sent: number, total: number) => void } = {}): Promise<UploadResult> {
  const result: UploadResult = { sent: 0, duplicates: 0, failed: 0, waiting: 0 };
  // nothing waiting: nothing is sent and nothing is asked
  if (!(await pendingFor(c)).length) return result;

  const me = await remote.me().catch(() => undefined);
  const remoteLearner = me?.ok ? me.data.learner?.learnerId : undefined;
  if (!me || !me.ok || !remoteLearner) {
    result.failed = (await pendingFor(c)).length;
    return result;
  }
  const pending = await pendingFor(c);
  const total = pending.length;
  const remoteDevice = me.data.devices?.[0]?.deviceId;

  const enrolments = remoteEnrolments([...new Set(pending.map((e) => e.languageId))], me.data.enrolments ?? []);

  const ready: GoEvent[] = [];
  for (const e of pending) {
    const enrolmentId = enrolments.get(e.languageId);
    if (!enrolmentId) { result.waiting += 1; continue; } // the account has no enrolment in this language: the event waits
    const { seq: _seq, recordedAt: _rec, ...rest } = e as StoredEvent;
    void _seq; void _rec;
    ready.push({
      ...rest, learnerId: remoteLearner, enrolmentId,
      producer: { ...rest.producer, deviceId: remoteDevice && rest.producer.deviceId !== remoteDevice ? remoteDevice : rest.producer.deviceId },
    });
  }

  const progress = (): void => { try { opts.onProgress?.(result.sent + result.duplicates, total); } catch { /* a listener must not break an upload */ } };
  const mark = async (ids: string[]): Promise<void> => {
    const at = c.now();
    const rows: Record<string, unknown> = {};
    for (const id of ids) rows[c.io.keys.uploaded + id] = { to: remoteLearner, at } satisfies UploadMarker;
    await writeRows(c.io, rows);
  };
  const settle = async (batch: GoEvent[], outcomes: AppendOutcome[]): Promise<void> => {
    const by = new Map(outcomes.map((o) => [o.id, o] as const));
    const done: string[] = [];
    for (const e of batch) {
      const o = by.get(e.id);
      if (o?.stored) { result.sent += 1; done.push(e.id); } else if (o?.duplicateOf !== undefined) { result.duplicates += 1; done.push(e.id); } else result.failed += 1;
    }
    await mark(done);
    progress();
  };

  const groups: Record<Route, GoEvent[]> = { events: [], reviews: [], writing: [] };
  for (const e of ready) groups[routeOf(e)].push(e);

  for (const route of ['events', 'reviews'] as const) {
    for (const part of chunk(groups[route], UPLOAD_BATCH)) {
      let batch = part;
      for (let round = 0; round < 5 && batch.length; round++) {
        let r;
        try { r = await (route === 'events' ? remote.appendEvents(batch) : remote.submitReviews(batch)); } catch { r = undefined; }
        if (!r) { result.failed += batch.length; return result; } // the network is down: stop, the rest stays pending
        if (r.ok) { await settle(batch, r.data.outcomes); break; }
        // the service refuses a whole batch for one bad event and names it: set those aside and send the rest again
        const issues = r.status === 422 && r.error === 'invalid-events' && Array.isArray(r.body.issues) ? (r.body.issues as Array<{ index?: unknown }>) : [];
        const bad = new Set(issues.map((i) => i.index).filter((i): i is number => typeof i === 'number'));
        if (!bad.size) { result.failed += batch.length; return result; } // unauthorised, throttled, too large...: stop here
        result.failed += bad.size;
        batch = batch.filter((_, i) => !bad.has(i));
      }
    }
  }
  for (const e of groups.writing) {
    let r;
    try { r = await remote.submitWriting({ observation: e }); } catch { r = undefined; }
    if (!r) { result.failed += 1; return result; }
    if (r.ok) await settle([e], [r.data.outcome]); else result.failed += 1;
  }
  return result;
}

// ───────────────────────────── pull ─────────────────────────────

/**
 * `refused`: the account sequence numbers of events this device's store would not take (a kind of a newer contract, say). The cursor moves
 * past them, so without this list they would be forgotten after the pull that met them; they are asked for again at the start of every pull,
 * and stay on the list until the store takes them (a newer build) or the account no longer holds them.
 */
interface PullCursor { learnerId: string; afterSeq: number; refused?: number[] }

/** The local enrolment events of `languageId` go under; made from the account's when the device has none. */
async function localEnrolment(c: TransferContext, languageId: string, remoteEnrolments: Enrolment[], newId: () => string): Promise<string> {
  const mine = await c.store.listEnrolments(c.learnerId);
  const open = mine.filter((e) => e.languageId === languageId && !e.endedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1)
    ?? mine.filter((e) => e.languageId === languageId).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
  if (open) return open.enrolmentId;
  const theirs = remoteEnrolments.filter((e) => e.languageId === languageId).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
  const made: Enrolment = {
    enrolmentId: newId(), learnerId: c.learnerId, languageId, packId: theirs?.packId ?? `pack:${languageId}`, packVersion: theirs?.packVersion ?? '0',
    goals: theirs?.goals ?? [], startedAt: c.now(), ...(theirs?.varietyId ? { varietyId: theirs.varietyId } : {}), ...(theirs?.scriptId ? { scriptId: theirs.scriptId } : {}),
  };
  await c.store.putEnrolment(made);
  return made.enrolmentId;
}

/**
 * What a pull reached (2026-11-17, for a reader that must know whether the device holds the whole account history: Reading Analysis).
 *   complete      true only when the service has answered that nothing lies after the device's cursor. A page shorter than asked is not the end while
 *                 the account's head lies beyond it (the pull asks on); a refused or failed request leaves it false.
 *   afterSeq      the account sequence number the device has read up to
 *   head          the account's head, as the last answered page reported it
 *   refused       account events this device's store will not take, counted over EVERY pull so far (they are remembered with the cursor and
 *                 tried again each time): while it is not 0 the device is not a whole copy of the account
 *   unauthorized  the account refused the sign-in (401): not a network failure
 *   deletions     `applied`: the account's deletion instructions were read and every one this device had not yet carried out was carried out (events
 *                 the learner deleted on another device are gone here too). `unknown`: the account could not be asked (a service from before
 *                 2026-11-17 has no list of them): the device may still hold what the learner deleted
 *   removed       events removed here by those instructions in this pull
 */
export interface PullOutcome { added: number; complete: boolean; remoteLearnerId?: string; afterSeq?: number; head?: number; refused?: number; unauthorized?: boolean; deletions?: 'applied' | 'unknown'; removed?: number }

export interface PullOptions {
  /** The number of events asked for per request (the default is PAGE; a test asks for small pages). */
  pageSize?: number;
  onEnd?: (complete: boolean) => void;
  /** Called just before events are written to the device's store, and just after: a reader of knowledge that must not straddle a write uses them. */
  beforeWrite?: () => void;
  afterWrite?: () => void;
}

/** With this many remembered refusals or fewer, each is asked for by itself; with more, the range they lie in is read again page by page. */
const REFUSED_SINGLY = 20;

/** The account this device last pulled from and how far (the stored cursor), or undefined when it never pulled. Read-only. */
export async function pullPosition(c: TransferContext): Promise<{ remoteLearnerId: string; afterSeq: number; refused: number } | undefined> {
  const stored = (await area(c).get(c.io.keys.pull))[c.io.keys.pull] as PullCursor | undefined;
  return stored && typeof stored.learnerId === 'string' && Number.isInteger(stored.afterSeq) && stored.afterSeq >= 0
    ? { remoteLearnerId: stored.learnerId, afterSeq: stored.afterSeq, refused: Array.isArray(stored.refused) ? stored.refused.length : 0 } : undefined;
}

export async function pull(c: TransferContext, remote: RepositoryApi, newId: () => string, opts: PullOptions = {}): Promise<PullOutcome> {
  const me = await remote.me().catch(() => undefined);
  const remoteLearner = me?.ok ? me.data.learner?.learnerId : undefined;
  if (!me || !me.ok || !remoteLearner) return { added: 0, complete: false, ...(me && !me.ok && me.status === 401 ? { unauthorized: true } : {}) };
  const stored = (await area(c).get(c.io.keys.pull))[c.io.keys.pull] as PullCursor | undefined;
  const mine = !!stored && stored.learnerId === remoteLearner && Number.isInteger(stored.afterSeq) && stored.afterSeq >= 0;
  let afterSeq = mine ? stored!.afterSeq : 0;
  let refusedSeqs: number[] = mine && Array.isArray(stored!.refused) ? stored!.refused.filter((n) => Number.isInteger(n) && n > 0) : [];
  const pageSize = opts.pageSize ?? PAGE;
  let added = 0;
  let head: number | undefined;
  let complete = false; // true when the loop reached the account's head (not when a request failed): the host asks, to know whether a pull must be resumed
  const appended: GoEvent[] = [];
  const registered = new Set<string>(); // events that would register the same surfaces as one already registered in this pull are not registered again
  const enrolmentOf = new Map<string, string>(); // the local enrolment events of a language go under, found once per pull

  /** Takes these account events into the device's store. Returns the sequence numbers of the ones the store would not take, and the marker rows to write. */
  const take = async (events: StoredEvent[]): Promise<{ refused: number[]; rows: Record<string, unknown> }> => {
    const rows: Record<string, unknown> = {};
    const fresh: Array<{ local: GoEvent; remoteId: string; seq: number }> = [];
    const notTaken: number[] = [];
    for (const e of events) {
      if (!isUploadable(e)) continue;
      const have = await c.store.get(c.learnerId, e.id);
      if (have) {
        // the account has an event this device recorded itself: it will not be sent again
        const m = (await area(c).get(c.io.keys.uploaded + e.id))[c.io.keys.uploaded + e.id] as UploadMarker | undefined;
        if (!m) rows[c.io.keys.uploaded + e.id] = { to: remoteLearner, at: c.now() } satisfies UploadMarker;
        continue;
      }
      let enrolmentId = enrolmentOf.get(e.languageId);
      if (enrolmentId === undefined) { enrolmentId = await localEnrolment(c, e.languageId, me.data.enrolments ?? [], newId); enrolmentOf.set(e.languageId, enrolmentId); }
      const { seq, recordedAt: _rec, ...rest } = e;
      void _rec;
      fresh.push({ local: { ...rest, learnerId: c.learnerId, enrolmentId }, remoteId: e.id, seq });
    }
    // one append for the page, not one per event: each append is a store transaction (and, over IndexedDB, a request per rule it checks)
    if (fresh.length) {
      try { opts.beforeWrite?.(); } catch { /* a listener must not break a pull */ }
      let outcomes: Awaited<ReturnType<ConcreteStore['append']>>;
      try { outcomes = await c.store.append(c.learnerId, fresh.map((x) => x.local)); } finally { try { opts.afterWrite?.(); } catch { /* as above */ } }
      const taken: GoEvent[] = [];
      fresh.forEach((x, i) => {
        if (outcomes[i]?.stored) { added += 1; appended.push(x.local); taken.push(x.local); rows[c.io.keys.uploaded + x.remoteId] = { from: remoteLearner, at: c.now() } satisfies UploadMarker; }
        else if (outcomes[i]?.duplicateOf === undefined) notTaken.push(x.seq); // the device's store would not take an event the account holds: the device is then NOT a whole copy
      });
      // surfaces are registered per page: a pull stopped here resumes after these events and would never register them
      const unseen = taken.filter((e) => { const k = `${e.kind} ${e.languageId} ${(e.subject?.itemIds ?? []).join('')} ${String((e.payload as { surface?: unknown } | undefined)?.surface ?? '')}`; if (registered.has(k)) return false; registered.add(k); return true; });
      if (unseen.length) await c.register(unseen);
    }
    return { refused: notTaken, rows };
  };
  // every refused sequence number is kept, however many: one left off this row would be forgotten for good, with the cursor already past it
  const cursorRow = (): PullCursor => ({ learnerId: remoteLearner, afterSeq, ...(refusedSeqs.length ? { refused: refusedSeqs } : {}) });

  // What the learner deleted on the account goes first: the event list only says what was added. Each instruction is carried out here once (the
  // device's store keeps it, as the service's does), BEFORE the new events are read, so an event that reached the account after a deletion of its
  // range, and so survived there, survives here too.
  let deletions: 'applied' | 'unknown' = 'unknown';
  let removed = 0;
  {
    let list;
    try { list = await remote.listTombstones(); } catch { list = undefined; }
    if (list?.ok && Array.isArray(list.data.tombstones)) {
      try {
        const done = new Set((await c.store.listTombstones(c.learnerId)).map((t) => t.tombstoneId));
        for (const t of list.data.tombstones) {
          if (!t || typeof t.tombstoneId !== 'string' || done.has(t.tombstoneId) || t.scope?.kind === 'learner') continue; // erasing a whole account is not a device's to repeat
          try { opts.beforeWrite?.(); } catch { /* a listener must not break a pull */ }
          try { removed += (await c.store.applyTombstone({ ...t, learnerId: c.learnerId })).events; } finally { try { opts.afterWrite?.(); } catch { /* as above */ } }
        }
        deletions = 'applied';
      } catch { deletions = 'unknown'; }
    }
  }

  // the events an earlier pull could not store are asked for again: a build that can store them now takes them
  if (refusedSeqs.length) {
    const sorted = [...new Set(refusedSeqs)].sort((x, y) => x - y);
    const still = new Set(sorted);
    if (sorted.length <= REFUSED_SINGLY) {
      for (const seq of sorted) {
        let r;
        try { r = await remote.listEvents({ afterSeq: seq - 1, limit: 1 }); } catch { r = undefined; }
        if (!r || !r.ok) break; // the rest stay on the list
        const e = r.data.events.find((x) => x.seq === seq);
        if (!e) { still.delete(seq); continue; } // the account no longer holds it
        const t = await take([e]);
        if (!t.refused.length) still.delete(seq);
        if (Object.keys(t.rows).length) await writeRows(c.io, t.rows);
      }
    } else {
      // many (a kind of event an app records often): the range they lie in is read again, a page at a time
      const wanted = new Set(sorted);
      const last = sorted[sorted.length - 1];
      let at = sorted[0] - 1;
      for (let guard = 0; guard < 10_000 && at < last; guard++) {
        let r;
        try { r = await remote.listEvents({ afterSeq: at, limit: pageSize }); } catch { r = undefined; }
        if (!r || !r.ok) break; // what was not reached stays on the list
        const got = r.data.events.filter((e) => e.seq > at).sort((x, y) => x.seq - y.seq);
        if (!got.length) { for (const seq of sorted) if (seq > at) still.delete(seq); break; } // the account holds nothing more: those events are gone from it
        const upTo = got[got.length - 1].seq;
        const present = new Set(got.map((e) => e.seq));
        const mineNow = got.filter((e) => wanted.has(e.seq));
        const t = await take(mineNow);
        const refusedAgain = new Set(t.refused);
        for (const e of mineNow) if (!refusedAgain.has(e.seq)) still.delete(e.seq);
        for (const seq of sorted) if (seq > at && seq <= upTo && !present.has(seq)) still.delete(seq); // no longer in the account
        if (Object.keys(t.rows).length) await writeRows(c.io, t.rows);
        at = upTo;
      }
    }
    if (still.size !== refusedSeqs.length) { refusedSeqs = [...still].sort((x, y) => x - y); await writeRows(c.io, { [c.io.keys.pull]: cursorRow() }); }
  }

  let retried = -1; // the cursor position whose page was asked for a second time
  let emptyAt = -1; // the cursor position at which an empty page was asked for a second time
  for (let page = 0; page < 10_000; page++) {
    let r;
    try { r = await remote.listEvents({ afterSeq, limit: pageSize }); } catch { r = undefined; }
    if (!r || !r.ok) break;
    if (typeof r.data.head === 'number') head = r.data.head;
    const events = [...r.data.events].sort((a, b) => a.seq - b.seq).filter((e) => e.seq > afterSeq);
    if (!events.length) {
      // Nothing after the cursor although the head lies beyond it: a wrong answer, or events the account deleted at its end (the head does not fall when
      // events are deleted). Asked once more; the same answer twice is the account's own state, and the device holds all there is.
      if (head !== undefined && afterSeq < head && emptyAt !== afterSeq) { emptyAt = afterSeq; continue; }
      complete = true;
      break;
    }
    // A page that does not begin at the event after the cursor: an answer for another position (the events between would never be asked for
    // again), or a range the account deleted. The page is asked for once more; if it still begins late, ONE event after the cursor is asked
    // for by itself (another request, so not the same wrong answer again). An event before the page's first shows a hole: the page is not
    // taken, the cursor stays, and the pull ends incomplete. The page's own first event again is the account's own state.
    if (events[0].seq !== afterSeq + 1) {
      if (retried !== afterSeq) { retried = afterSeq; continue; }
      let probe;
      try { probe = await remote.listEvents({ afterSeq, limit: 1 }); } catch { probe = undefined; }
      if (!probe || !probe.ok) break;
      const next = probe.data.events.filter((e) => e.seq > afterSeq).sort((a, b) => a.seq - b.seq)[0];
      if (next && next.seq < events[0].seq) break; // events lie between the cursor and this page: not taken
    }
    const t = await take(events);
    if (t.refused.length) refusedSeqs = [...new Set([...refusedSeqs, ...t.refused])];
    afterSeq = events[events.length - 1].seq;
    await writeRows(c.io, { ...t.rows, [c.io.keys.pull]: cursorRow() });
    // the end is the account's head, when the service says where it is: a page shorter than asked is not the end while the head lies beyond it
    if (head !== undefined ? afterSeq >= head : events.length < pageSize) { complete = true; break; }
  }
  // Projection runs ONCE, after the last page (a page touches most of the learner's units, and projecting re-reads their events). The cursor and the markers above are written
  // per page, so a pull stopped after any page resumes from there; until it is projected, every read folds the events newer than the projection cursor, so knowledge is correct.
  if (appended.length || removed) await c.project();
  try { opts.onEnd?.(complete); } catch { /* a listener must not break a pull */ }
  return { added, complete, remoteLearnerId: remoteLearner, afterSeq, ...(head !== undefined ? { head } : {}), ...(refusedSeqs.length ? { refused: refusedSeqs.length } : {}), deletions, ...(removed ? { removed } : {}) };
}
