/**
 * The device's outbound event queue. Every row is persisted in the key-value area BEFORE `enqueue` returns; nothing is
 * held only in memory, so a crash or a closed tab loses nothing that `enqueue` acknowledged. A second queue over the
 * same area (a restart) sees the same rows.
 *
 * Rows:  `queue:<eventId>`     { event, ord, enqueuedAt, attempts, lastError? }   — waiting for the server
 *        `rejected:<eventId>`  { event, issues, rejectedAt, attempts }            — the server refused it; kept, never dropped
 *        `quarantine:corrupt:<id>` { corrupt, key, reason, value?, at }           — a `queue:` row that is not a queue row (unreadable, wrong shape);
 *                                   `setAsideUnreadable()` moves it here with a diagnostic. Under `quarantine:` so every existing count and
 *                                   every "forget this device" already covers it. `pending()` never throws for such a row: it skips it.
 *
 * Order: each row carries `ord`, a counter that only grows while the queue is non-empty; `pending()` sorts by it (ties by
 * id, which is time-ordered), so the insertion order is the send order and no separate index row can disagree with the rows.
 */
import { validateEvent, type GoEvent, type ValidationIssue } from '../../repository-contract/src';
import { createLock, getByPrefix, getOne, type KeyValueArea } from './area';

export const QUEUE_PREFIX = 'queue:';
export const REJECTED_PREFIX = 'rejected:';
/** Where an unreadable queue row is set aside (a sub-prefix of the sync client's `quarantine:`). */
export const CORRUPT_PREFIX = 'quarantine:corrupt:';

export interface QueueRow { event: GoEvent; ord: number; enqueuedAt: string; attempts: number; lastError?: string; lastAttemptAt?: string }
/** What is kept of a queue row that could not be read as one. `value` is the row's content when the storage layer could parse it (a few kilobytes at most). */
export interface CorruptRow { corrupt: true; key: string; reason: string; at: string; value?: unknown }
export interface RejectedRow { event: GoEvent; issues: ValidationIssue[]; rejectedAt: string; attempts: number }

export type EnqueueResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'invalid'; issues: ValidationIssue[] }
  | { ok: false; reason: 'duplicate'; id: string };

export interface LocalQueue {
  readonly area: KeyValueArea;
  /** Validates, refuses a duplicate id, persists, then resolves. A storage failure rejects the promise (nothing was queued). */
  enqueue(event: GoEvent): Promise<EnqueueResult>;
  /** Oldest first. */
  pending(): Promise<QueueRow[]>;
  /** Moves every `queue:` row that is not a queue row to `quarantine:corrupt:<id>` with a diagnostic; returns the rows it set aside. Safe to call at any time. */
  setAsideUnreadable(): Promise<CorruptRow[]>;
  /** The rows `setAsideUnreadable` has set aside. */
  corrupt(): Promise<CorruptRow[]>;
  /** The events the server has (stored or already there). Unknown ids are ignored. */
  ack(ids: string[]): Promise<void>;
  /** Keeps the row; counts the attempt and records the error. */
  fail(id: string, error: string): Promise<void>;
  /** Moves the row to `rejected:<id>` with the server's issues. */
  reject(id: string, issues: ValidationIssue[]): Promise<void>;
  rejected(): Promise<RejectedRow[]>;
  /** The host's explicit decision to discard a rejected event (the learner dismissed it). The only way a row is ever dropped unsent. */
  dismissRejected(id: string): Promise<void>;
  size(): Promise<number>;
}

export interface LocalQueueOptions { now?: () => number }

const MAX_KEPT_JSON = 4_000;

/** A queue row the code can use: an object holding an event with at least an id, a kind and a learner. A missing `ord` reads as 0 (oldest). */
export function readableRow(v: unknown): v is QueueRow {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const e = (v as { event?: unknown }).event;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  const ev = e as { id?: unknown; kind?: unknown; learnerId?: unknown };
  return typeof ev.id === 'string' && ev.id.length > 0 && typeof ev.kind === 'string' && typeof ev.learnerId === 'string';
}
const ordOf = (r: QueueRow): number => (typeof r.ord === 'number' && Number.isFinite(r.ord) ? r.ord : 0);

export function createLocalQueue(area: KeyValueArea, opts: LocalQueueOptions = {}): LocalQueue {
  const now = opts.now ?? Date.now;
  const lock = createLock();
  let nextOrd: number | undefined;

  const iso = () => new Date(now()).toISOString();
  const ordCounter = async (): Promise<number> => {
    if (nextOrd === undefined) {
      const rows = await getByPrefix<QueueRow>(area, QUEUE_PREFIX);
      nextOrd = rows.reduce((m, [, r]) => (readableRow(r) ? Math.max(m, ordOf(r)) : m), 0) + 1;
    }
    return nextOrd++;
  };
  const sorted = (rows: Array<[string, QueueRow]>): QueueRow[] =>
    rows.map(([, r]) => r).filter(readableRow).sort((a, b) => ordOf(a) - ordOf(b) || (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0));

  return {
    area,
    enqueue: (event) => lock.run(async (): Promise<EnqueueResult> => {
      const issues = validateEvent(event);
      if (issues.length) return { ok: false, reason: 'invalid', issues };
      const id = event.id;
      if ((await getOne(area, QUEUE_PREFIX + id)) !== undefined || (await getOne(area, REJECTED_PREFIX + id)) !== undefined) {
        return { ok: false, reason: 'duplicate', id };
      }
      const row: QueueRow = { event, ord: await ordCounter(), enqueuedAt: iso(), attempts: 0 };
      await area.set({ [QUEUE_PREFIX + id]: row });
      return { ok: true, id };
    }),
    pending: () => lock.run(async () => sorted(await getByPrefix<QueueRow>(area, QUEUE_PREFIX))),
    ack: (ids) => lock.run(async () => { if (ids.length) await area.remove(ids.map((i) => QUEUE_PREFIX + i)); }),
    fail: (id, error) => lock.run(async () => {
      const row = await getOne<QueueRow>(area, QUEUE_PREFIX + id);
      if (!row) return;
      await area.set({ [QUEUE_PREFIX + id]: { ...row, attempts: row.attempts + 1, lastError: error, lastAttemptAt: iso() } satisfies QueueRow });
    }),
    reject: (id, issues) => lock.run(async () => {
      const row = await getOne<QueueRow>(area, QUEUE_PREFIX + id);
      if (!row) return;
      // written first, removed second: a crash in between leaves the event in both places, never in neither.
      await area.set({ [REJECTED_PREFIX + id]: { event: row.event, issues, rejectedAt: iso(), attempts: row.attempts + 1 } satisfies RejectedRow });
      await area.remove(QUEUE_PREFIX + id);
    }),
    rejected: () => lock.run(async () => (await getByPrefix<RejectedRow>(area, REJECTED_PREFIX)).map(([, r]) => r)),
    dismissRejected: (id) => lock.run(async () => { await area.remove(REJECTED_PREFIX + id); }),
    // readable rows only: an unreadable row is not an event still waiting (it is reported by `corrupt()` once set aside)
    size: () => lock.run(async () => (await getByPrefix<QueueRow>(area, QUEUE_PREFIX)).filter(([, r]) => readableRow(r)).length),
    setAsideUnreadable: () => lock.run(async () => {
      const keys = await area.list(QUEUE_PREFIX);
      if (!keys.length) return [];
      const rows = await area.get(keys);
      const out: CorruptRow[] = [];
      for (const key of keys) {
        const v = rows[key];
        if (readableRow(v)) continue;
        let kept: unknown;
        if (v !== undefined) { try { if (JSON.stringify(v).length <= MAX_KEPT_JSON) kept = v; } catch { /* not serialisable: only the diagnostic is kept */ } }
        const row: CorruptRow = {
          corrupt: true, key, at: iso(),
          reason: v === undefined ? 'the stored value could not be read (not valid JSON)' : 'the value is not a queued event (no event with an id, a kind and a learner)',
          ...(kept !== undefined ? { value: kept } : {}),
        };
        // written first, removed second: a crash in between leaves it in both places, never in neither.
        await area.set({ [CORRUPT_PREFIX + key.slice(QUEUE_PREFIX.length)]: row });
        await area.remove(key);
        out.push(row);
      }
      return out;
    }),
    corrupt: () => lock.run(async () => (await getByPrefix<CorruptRow>(area, CORRUPT_PREFIX)).map(([, r]) => r)),
  };
}
