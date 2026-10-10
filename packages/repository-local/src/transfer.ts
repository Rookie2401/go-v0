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

interface PullCursor { learnerId: string; afterSeq: number }

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

export async function pull(c: TransferContext, remote: RepositoryApi, newId: () => string): Promise<{ added: number }> {
  const me = await remote.me().catch(() => undefined);
  const remoteLearner = me?.ok ? me.data.learner?.learnerId : undefined;
  if (!me || !me.ok || !remoteLearner) return { added: 0 };
  const stored = (await area(c).get(c.io.keys.pull))[c.io.keys.pull] as PullCursor | undefined;
  let afterSeq = stored && stored.learnerId === remoteLearner && Number.isInteger(stored.afterSeq) && stored.afterSeq >= 0 ? stored.afterSeq : 0;
  let added = 0;
  const appended: GoEvent[] = [];

  for (let page = 0; page < 10_000; page++) {
    let r;
    try { r = await remote.listEvents({ afterSeq, limit: PAGE }); } catch { r = undefined; }
    if (!r || !r.ok) break;
    const events = [...r.data.events].sort((a, b) => a.seq - b.seq);
    if (!events.length) break;
    const rows: Record<string, unknown> = {};
    for (const e of events) {
      if (!isUploadable(e)) continue;
      const have = await c.store.get(c.learnerId, e.id);
      if (have) {
        // the account has an event this device recorded itself: it will not be sent again
        const m = (await area(c).get(c.io.keys.uploaded + e.id))[c.io.keys.uploaded + e.id] as UploadMarker | undefined;
        if (!m) rows[c.io.keys.uploaded + e.id] = { to: remoteLearner, at: c.now() } satisfies UploadMarker;
        continue;
      }
      const enrolmentId = await localEnrolment(c, e.languageId, me.data.enrolments ?? [], newId);
      const { seq: _seq, recordedAt: _rec, ...rest } = e;
      void _seq; void _rec;
      const local: GoEvent = { ...rest, learnerId: c.learnerId, enrolmentId };
      const [o] = await c.store.append(c.learnerId, [local]);
      if (o?.stored) { added += 1; appended.push(local); rows[c.io.keys.uploaded + e.id] = { from: remoteLearner, at: c.now() } satisfies UploadMarker; }
    }
    afterSeq = events[events.length - 1].seq;
    rows[c.io.keys.pull] = { learnerId: remoteLearner, afterSeq } satisfies PullCursor;
    await writeRows(c.io, rows);
    if (events.length < PAGE || afterSeq >= r.data.head) break;
  }
  if (appended.length) { await c.register(appended); await c.project(); }
  return { added };
}
