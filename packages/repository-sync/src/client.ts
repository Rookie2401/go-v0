/**
 * The sync client of one device: push the local queue, pull the server's log, reconcile documents, report status.
 *
 * Model (see README):
 *  - Events are immutable and merge by UNION on id. Push is at-least-once; the server answers every event with `stored`
 *    or `duplicateOf`, and a duplicate IS success (the server has it), so a lost acknowledgement is repaired by the retry.
 *  - Nothing is dropped. A transport failure keeps every row (attempts and lastError recorded) and schedules a retry with
 *    exponential backoff and jitter. An event the server REFUSES (validation issues) moves to a `rejected:` row and is
 *    reported in status; only the host's explicit `dismissRejected` removes it.
 *  - Order and time. The client never reorders events by `at`: the server's `seq` is authoritative for pull order, and the
 *    device's `at` stays the event's time. The clock skew (client − server) is MEASURED and REPORTED, not applied: rewriting
 *    `at` would rewrite the learner's own timeline from a clock that may itself be wrong, and the projection's fold is
 *    order-independent, so a skewed `at` costs nothing the skew number does not already explain.
 *  - The pull cursor (`sync:cursor`) advances only after the pulled events are appended to the local log, so a local
 *    failure re-reads the same page; local append is idempotent on id.
 */
import type {
  AppendOutcome, EventLog, GoEvent, PrivateDocument, StoredEvent,
  SyncPullRequest, SyncPullResponse, SyncPushRequest, SyncPushResponse, ValidationIssue,
} from '../../repository-contract/src';
import { createLock, getOne, type KeyValueArea } from './area';
import { mergeDocument, type DocumentMerge, type LocalDocuments } from './documents';
import { CORRUPT_PREFIX, type LocalQueue } from './queue';

/** The only way the client reaches the server. Throw on any transport failure, including a timeout. */
export interface Transport {
  push(req: SyncPushRequest): Promise<SyncPushResponse>;
  pull(req: SyncPullRequest): Promise<SyncPullResponse>;
}

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  factor: number;
  /** 0 = deterministic; 1 = full jitter (a random delay in [0, cap]). In between: cap × (1 − jitter + jitter × random). */
  jitter: number;
}
export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1_000, maxMs: 5 * 60_000, factor: 2, jitter: 1 };

export const PUSH_BATCH = 200;
export const CURSOR_KEY = 'sync:cursor';
export const DOCS_SINCE_KEY = 'sync:docsSince';
export const QUARANTINE_PREFIX = 'quarantine:';

export interface SyncStatus {
  /** Events waiting for the server. */
  pending: number;
  /** Events the server refused (kept; see `rejected()`). */
  rejected: number;
  /** Pulled events that failed local validation, and queue rows set aside as unreadable (kept under `quarantine:`; the cursor moved past the events). */
  quarantined: number;
  /** Of `quarantined`: queue rows that could not be read as events (`quarantine:corrupt:`). */
  corrupt: number;
  /** What the client repaired by itself since it started (a damaged cursor, unreadable rows), for the diagnostics screen. */
  notes: string[];
  /** Documents edited here and not yet accepted by the server. */
  dirtyDocuments: number;
  /** Epoch ms (the client's `now`) of the last successful push / pull. */
  lastPushAt?: number;
  lastPullAt?: number;
  lastError?: string;
  /** Epoch ms before which `syncOnce` (without force) will not try again. */
  nextRetryAt?: number;
  /** Client clock minus server clock, ms (positive = this device is ahead). Reported, never applied to `at`. */
  skewMs?: number;
  serverTime?: string;
  /** The server's highest seq as last reported. */
  head?: number;
  /** Highest seq already appended locally. */
  cursor: number;
  online: boolean;
  /** Conflict copies made since this client started. */
  conflictCopies: string[];
}

export interface PushResult { ok: boolean; skipped?: 'offline'; sent: number; acked: number; duplicates: number; rejected: number; failed: number; error?: string }
export interface DocumentPushResult {
  ok: boolean; skipped?: 'offline' | 'no-documents'; sent: number; accepted: number; conflicts: Array<{ docId: string; copyId?: string }>; failed: number; error?: string;
  /** Documents the server refused one by one without a current copy to merge (they stay dirty and are tried again next round; they never fail the batch). */
  refused?: Array<{ docId: string; reason: string }>;
}
export interface PullResult { ok: boolean; skipped?: 'offline'; received: number; appended: number; duplicates: number; quarantined: number; documents: number; cursor: number; error?: string }
export interface SyncResult { skipped?: 'offline' | 'backoff'; push?: PushResult; documents?: DocumentPushResult; pull?: PullResult; ok: boolean }

export interface SyncClientOptions {
  queue: LocalQueue;
  /** The device's own log; pulled events are appended to it (idempotent on id). */
  local: EventLog;
  transport: Transport;
  deviceId: string;
  now: () => number;
  backoff?: Partial<BackoffOptions>;
  onStatus?: (s: SyncStatus) => void;
  /** Where the cursor lives. Defaults to the queue's area. */
  area?: KeyValueArea;
  /** The device's mutable documents; without it documents are neither pushed nor applied. */
  documents?: LocalDocuments;
  /** Document conflict rule. Defaults to `mergeDocument`. */
  merge?: DocumentMerge;
  random?: () => number;
  /** Page size asked of pull. */
  pullLimit?: number;
  /** Timer functions for `start()`; injectable for tests. */
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
}

export interface SyncClient {
  push(): Promise<PushResult>;
  pushDocuments(): Promise<DocumentPushResult>;
  pull(): Promise<PullResult>;
  /** push → pushDocuments → pull, each skipped if the one before failed. Respects offline and (unless `force`) backoff. */
  syncOnce(opts?: { force?: boolean }): Promise<SyncResult>;
  status(): Promise<SyncStatus>;
  setOnline(online: boolean): void;
  /** Runs `syncOnce` now and then, at `nextRetryAt` after a failure, else every `pollMs`. */
  start(pollMs?: number): void;
  stop(): void;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Channel { streak: number; nextAt?: number; error?: string }

export function createSyncClient(opts: SyncClientOptions): SyncClient {
  const { queue, local, transport, deviceId, now } = opts;
  const area = opts.area ?? queue.area;
  const docs = opts.documents;
  const merge = opts.merge ?? mergeDocument;
  const backoff: BackoffOptions = { ...DEFAULT_BACKOFF, ...opts.backoff };
  const random = opts.random ?? Math.random;
  const pullLimit = opts.pullLimit ?? 500;
  const timers = opts.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  const lock = createLock();

  let online = true;
  let lastPushAt: number | undefined;
  let lastPullAt: number | undefined;
  let skewMs: number | undefined;
  let serverTime: string | undefined;
  let head: number | undefined;
  const conflictCopies: string[] = [];
  const channels: Record<'push' | 'docs' | 'pull', Channel> = { push: { streak: 0 }, docs: { streak: 0 }, pull: { streak: 0 } };
  let timer: unknown;
  let running = false;

  const iso = () => new Date(now()).toISOString();
  const delayFor = (streak: number): number => {
    const cap = Math.min(backoff.maxMs, backoff.baseMs * backoff.factor ** Math.max(0, streak - 1));
    return Math.round(cap * (1 - backoff.jitter + backoff.jitter * random()));
  };
  const fail = (c: Channel, message: string) => { c.streak += 1; c.error = message; c.nextAt = now() + delayFor(c.streak); };
  const succeed = (c: Channel) => { c.streak = 0; c.error = undefined; c.nextAt = undefined; };
  const nextRetryAt = (): number | undefined => {
    const ts = [channels.push.nextAt, channels.docs.nextAt, channels.pull.nextAt].filter((t): t is number => t !== undefined);
    return ts.length ? Math.max(...ts) : undefined;
  };
  const noteServer = (r: { serverTime: string; head: number; clockSkewMs?: number }) => {
    serverTime = r.serverTime;
    head = r.head;
    if (typeof r.clockSkewMs === 'number' && Number.isFinite(r.clockSkewMs)) skewMs = r.clockSkewMs;
    else { const t = Date.parse(r.serverTime); if (!Number.isNaN(t)) skewMs = now() - t; }
  };

  const notes: string[] = [];
  const note = (m: string) => { if (!notes.includes(m)) notes.push(m); };
  /** The pull cursor, repaired: anything but a non-negative whole number is a damaged value, and a re-pull from 0 is idempotent (local append dedupes on id). */
  const getCursor = async (): Promise<number> => {
    const v = await getOne<unknown>(area, CURSOR_KEY);
    if (v === undefined) return 0;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
    note('the sync cursor was damaged and was reset to 0: the history is read again from the start (nothing is duplicated)');
    try { await area.set({ [CURSOR_KEY]: 0 }); } catch { /* the next round repairs it again */ }
    return 0;
  };
  /** The documents cursor, repaired the same way (an ISO time or nothing). */
  const getDocsSince = async (): Promise<string | undefined> => {
    const v = await getOne<unknown>(area, DOCS_SINCE_KEY);
    if (v === undefined) return undefined;
    if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
    note('the documents cursor was damaged and was reset: every document is read again (revisions decide what changes)');
    try { await area.remove(DOCS_SINCE_KEY); } catch { /* */ }
    return undefined;
  };

  async function status(): Promise<SyncStatus> {
    const [pending, rejected, quarantined, corrupt, dirty, cursor] = await Promise.all([
      queue.size(), queue.rejected().then((r) => r.length), area.list(QUARANTINE_PREFIX).then((k) => k.length), area.list(CORRUPT_PREFIX).then((k) => k.length),
      docs ? docs.dirty().then((d) => d.length) : Promise.resolve(0), getCursor(),
    ]);
    return {
      pending, rejected, quarantined, corrupt, notes: [...notes], dirtyDocuments: dirty, lastPushAt, lastPullAt,
      lastError: channels.push.error ?? channels.docs.error ?? channels.pull.error, nextRetryAt: nextRetryAt(),
      skewMs, serverTime, head, cursor, online, conflictCopies: [...conflictCopies],
    };
  }
  const emit = async () => {
    if (!opts.onStatus) return;
    try { opts.onStatus(await status()); } catch { /* a faulty listener must not break sync */ }
  };

  // ───────────── push ─────────────

  async function pushImpl(): Promise<PushResult> {
    const res: PushResult = { ok: true, sent: 0, acked: 0, duplicates: 0, rejected: 0, failed: 0 };
    if (!online) return { ...res, skipped: 'offline' };
    // A row that is not a queue row must not stand in front of the good ones: set it aside (with a diagnostic) and carry on.
    try {
      const aside = await queue.setAsideUnreadable();
      if (aside.length) note(`${aside.length} unreadable queue row(s) were set aside under quarantine:corrupt: and are not waiting to be sent`);
    } catch { /* the rows are skipped by pending() either way */ }
    const rows = await queue.pending();
    if (!rows.length) succeed(channels.push); // whatever failed earlier is no longer waiting to be retried
    for (let i = 0; i < rows.length; i += PUSH_BATCH) {
      const batch = rows.slice(i, i + PUSH_BATCH);
      let resp: SyncPushResponse;
      try {
        resp = await transport.push({ deviceId, events: batch.map((r) => r.event), documents: [], clientTime: iso() });
      } catch (e) {
        const message = errMsg(e);
        for (const r of batch) await queue.fail(r.event.id, message);
        fail(channels.push, message);
        res.ok = false; res.error = message; res.failed += batch.length;
        await emit();
        return res;
      }
      res.sent += batch.length;
      noteServer(resp);
      const byId = new Map(resp.outcomes.map((o) => [o.id, o] as const));
      const acks: string[] = [];
      let unresolved = 0;
      for (const r of batch) {
        const o: AppendOutcome | undefined = byId.get(r.event.id);
        if (o && (o.stored || o.duplicateOf)) { // a duplicate IS success: the server has it
          acks.push(r.event.id);
          if (!o.stored) res.duplicates += 1;
        } else if (o?.issues?.length) {
          await queue.reject(r.event.id, o.issues as ValidationIssue[]);
          res.rejected += 1;
        } else {
          await queue.fail(r.event.id, o ? 'the server neither stored nor refused the event' : 'no outcome returned for the event');
          unresolved += 1;
        }
      }
      await queue.ack(acks);
      res.acked += acks.length;
      if (unresolved) {
        const message = `${unresolved} event(s) without a usable outcome`;
        fail(channels.push, message);
        res.ok = false; res.error = message; res.failed += unresolved;
        await emit();
        return res;
      }
    }
    if (res.sent) { succeed(channels.push); lastPushAt = now(); }
    await emit();
    return res;
  }

  // ───────────── documents ─────────────

  /** Applies the merge rule to one remote document; shared by pull and by the 409 path of pushDocuments. Returns the conflict copy id, if one was made. */
  async function reconcileDocument(remote: PrivateDocument): Promise<string | undefined> {
    if (!docs) return undefined;
    const cur = await docs.get(remote.docId);
    const r = merge(cur?.doc, remote, cur?.dirty ?? false, cur?.baseRevision);
    if (r.action === 'take-remote') await docs.acceptRemote(r.keep ?? remote);
    else if (r.action === 'conflict') {
      // the copy is written FIRST: if the process dies between the two writes the local text still exists.
      if (r.conflictCopy) { await docs.putConflictCopy(r.conflictCopy); conflictCopies.push(r.conflictCopy.docId); }
      await docs.acceptRemote(r.keep ?? remote);
      return r.conflictCopy?.docId;
    }
    return undefined;
  }

  async function pushDocumentsImpl(): Promise<DocumentPushResult> {
    const res: DocumentPushResult = { ok: true, sent: 0, accepted: 0, conflicts: [], failed: 0 };
    if (!docs) return { ...res, skipped: 'no-documents' };
    if (!online) return { ...res, skipped: 'offline' };
    // a conflict creates a new dirty copy, which goes in the next round of the same call
    for (let round = 0; round < 4; round++) {
      const dirty = await docs.dirty();
      if (!dirty.length) break;
      let resp: SyncPushResponse;
      try {
        resp = await transport.push({ deviceId, events: [], documents: dirty.map((d) => ({ doc: d.doc, expectedRevision: d.baseRevision })), clientTime: iso() });
      } catch (e) {
        const message = errMsg(e);
        fail(channels.docs, message);
        res.ok = false; res.error = message; res.failed += dirty.length;
        await emit();
        return res;
      }
      res.sent += dirty.length;
      noteServer(resp);
      const sent = new Map(dirty.map((d) => [d.doc.docId, d] as const));
      let conflicted = false;
      for (const r of resp.documents) {
        const d = sent.get(r.docId);
        if (!d) continue;
        if (r.ok) { await docs.markPushed(d.doc); res.accepted += 1; continue; }
        if (r.current) {
          const copyId = await reconcileDocument(r.current);
          if (copyId) { res.conflicts.push({ docId: r.docId, copyId }); conflicted = true; }
          else if ((await docs.get(r.docId))?.dirty) { res.failed += 1; res.ok = false; res.error = `document ${r.docId} was refused at revision ${r.current.revision}`; }
        } else if (r.reason === 'no-such-document' && docs.rebase && (await docs.rebase(r.docId))) {
          // the server holds no document at the revision this device built on (it lost it, or never had it): the local text is the only copy,
          // so it goes up as a NEW document (expectedRevision 0), in the next round of this call. Nothing is discarded.
          conflicted = true;
        } else {
          // refused with no copy to merge: that document's failure alone. The other documents, the events and the pull go on; it is tried again next round.
          res.failed += 1;
          (res.refused ??= []).push({ docId: r.docId, reason: r.reason ?? 'refused' });
        }
      }
      if (!conflicted) break;
    }
    if (res.ok) { succeed(channels.docs); if (res.sent) lastPushAt = now(); } else fail(channels.docs, res.error ?? 'document push failed');
    await emit();
    return res;
  }

  // ───────────── pull ─────────────

  async function pullImpl(): Promise<PullResult> {
    const res: PullResult = { ok: true, received: 0, appended: 0, duplicates: 0, quarantined: 0, documents: 0, cursor: await getCursor() };
    if (!online) return { ...res, skipped: 'offline' };
    try {
      let docsSince = docs ? await getDocsSince() : undefined;
      let newestDoc = docsSince;
      for (let page = 0; page < 10_000; page++) {
        const req: SyncPullRequest = { deviceId, afterSeq: res.cursor, limit: pullLimit, ...(page === 0 && docsSince ? { documentsSince: docsSince } : {}) };
        const resp = await transport.pull(req);
        noteServer({ serverTime: resp.serverTime, head: resp.head });
        const events = [...resp.events].sort((a, b) => a.seq - b.seq);
        res.received += events.length;
        if (events.length) {
          const stats = await appendLocal(events);
          res.appended += stats.appended; res.duplicates += stats.duplicates; res.quarantined += stats.quarantined;
          // only now, after the local append succeeded:
          res.cursor = Math.max(res.cursor, events[events.length - 1].seq);
          await area.set({ [CURSOR_KEY]: res.cursor });
          // our own events coming back prove the server has them, whatever happened to the acknowledgement
          const own = events.filter((e) => e.producer.deviceId === deviceId).map((e) => e.id);
          if (own.length) await queue.ack(own);
        }
        if (docs) {
          for (const d of resp.documents) {
            await reconcileDocument(d);
            res.documents += 1;
            if (!newestDoc || d.updatedAt > newestDoc) newestDoc = d.updatedAt;
          }
        }
        if (!events.length || res.cursor >= resp.head) break;
      }
      if (docs && newestDoc && newestDoc !== docsSince) { docsSince = newestDoc; await area.set({ [DOCS_SINCE_KEY]: docsSince }); }
    } catch (e) {
      const message = errMsg(e);
      fail(channels.pull, message);
      res.ok = false; res.error = message;
      await emit();
      return res;
    }
    succeed(channels.pull);
    lastPullAt = now();
    await emit();
    return res;
  }

  async function appendLocal(events: StoredEvent[]): Promise<{ appended: number; duplicates: number; quarantined: number }> {
    const byLearner = new Map<string, GoEvent[]>();
    const byId = new Map<string, GoEvent>();
    for (const stored of events) {
      const { seq: _seq, ...event } = stored;
      void _seq;
      byId.set(event.id, event);
      const list = byLearner.get(event.learnerId) ?? [];
      list.push(event);
      byLearner.set(event.learnerId, list);
    }
    const out = { appended: 0, duplicates: 0, quarantined: 0 };
    for (const [learnerId, list] of byLearner) {
      const outcomes = await local.append(learnerId, list); // may throw: the caller leaves the cursor where it was
      const seen = new Set(outcomes.map((o) => o.id));
      if (list.some((e) => !seen.has(e.id))) throw new Error('the local log returned no outcome for some pulled events');
      for (const o of outcomes) {
        if (o.stored) out.appended += 1;
        else if (o.duplicateOf) out.duplicates += 1;
        else if (o.issues?.length) {
          // a pulled event this build cannot validate (a newer client's kind, say) must not wedge the cursor: keep it aside
          await area.set({ [QUARANTINE_PREFIX + o.id]: { event: byId.get(o.id), issues: o.issues, at: iso() } });
          out.quarantined += 1;
        } else throw new Error(`the local log neither stored nor refused ${o.id}`);
      }
    }
    return out;
  }

  // ───────────── public surface ─────────────

  const client: SyncClient = {
    push: () => lock.run(pushImpl),
    pushDocuments: () => lock.run(pushDocumentsImpl),
    pull: () => lock.run(pullImpl),
    async syncOnce(o) {
      if (!online) return { skipped: 'offline', ok: true };
      const nextAt = nextRetryAt();
      if (!o?.force && nextAt !== undefined && now() < nextAt) return { skipped: 'backoff', ok: true };
      const push = await client.push();
      if (!push.ok) return { push, ok: false };
      const documents = await client.pushDocuments();
      if (!documents.ok) return { push, documents, ok: false };
      const pull = await client.pull();
      return { push, documents, pull, ok: pull.ok };
    },
    status,
    setOnline(v) { online = v; void emit(); },
    start(pollMs = 30_000) {
      if (running) return;
      running = true;
      const tick = async () => {
        if (!running) return;
        try { await client.syncOnce(); } catch { /* syncOnce reports through status; the loop must survive */ }
        if (!running) return;
        const nextAt = nextRetryAt();
        const wait = nextAt !== undefined ? Math.max(0, nextAt - now()) : pollMs;
        timer = timers.set(() => { void tick(); }, wait);
      };
      void tick();
    },
    stop() { running = false; if (timer !== undefined) timers.clear(timer); timer = undefined; },
  };
  return client;
}
