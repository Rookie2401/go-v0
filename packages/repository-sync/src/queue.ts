/**
 * The device's outbound event queue. Every row is persisted in the key-value area BEFORE `enqueue` returns; nothing is
 * held only in memory, so a crash or a closed tab loses nothing that `enqueue` acknowledged. A second queue over the
 * same area (a restart) sees the same rows.
 *
 * Rows:  `queue:<eventId>`     { event, ord, enqueuedAt, attempts, lastError? }   — waiting for the server
 *        `rejected:<eventId>`  { event, issues, rejectedAt, attempts }            — the server refused it; kept, never dropped
 *
 * Order: each row carries `ord`, a counter that only grows while the queue is non-empty; `pending()` sorts by it (ties by
 * id, which is time-ordered), so the insertion order is the send order and no separate index row can disagree with the rows.
 */
import { validateEvent, type GoEvent, type ValidationIssue } from '../../repository-contract/src';
import { createLock, getByPrefix, getOne, type KeyValueArea } from './area';

export const QUEUE_PREFIX = 'queue:';
export const REJECTED_PREFIX = 'rejected:';

export interface QueueRow { event: GoEvent; ord: number; enqueuedAt: string; attempts: number; lastError?: string; lastAttemptAt?: string }
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

export function createLocalQueue(area: KeyValueArea, opts: LocalQueueOptions = {}): LocalQueue {
  const now = opts.now ?? Date.now;
  const lock = createLock();
  let nextOrd: number | undefined;

  const iso = () => new Date(now()).toISOString();
  const ordCounter = async (): Promise<number> => {
    if (nextOrd === undefined) {
      const rows = await getByPrefix<QueueRow>(area, QUEUE_PREFIX);
      nextOrd = rows.reduce((m, [, r]) => Math.max(m, r.ord), 0) + 1;
    }
    return nextOrd++;
  };
  const sorted = (rows: Array<[string, QueueRow]>): QueueRow[] =>
    rows.map(([, r]) => r).sort((a, b) => a.ord - b.ord || (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0));

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
    size: () => lock.run(async () => (await area.list(QUEUE_PREFIX)).length),
  };
}
