/**
 * Synchronization with the Repository, run in the background worker only.
 *
 *   queue     createLocalQueue(adaptStorageArea(chrome.storage.local))   durable: every event is on disk before it is acknowledged
 *   client    createSyncClient({ transport })                            push, pull, backoff, status
 *   transport the typed API client's syncPush / syncPull with the session's token
 *
 * When it runs: once, debounced 2 s after an event is queued; every 5 minutes on a `chrome.alarms` alarm (the manifest
 * declares the "alarms" permission for this and nothing else); on request from an extension page.
 *
 * Events recorded while signed out are attributed to `local:<deviceId>` and are INVISIBLE to the sync client (a view of
 * the queue hides them) until they are re-attributed on sign-in. A 401 sets `needsSignIn`; sync then stops until the
 * learner signs in again: it is never retried forever.
 */
import type { EventLog, GoEvent, SyncPullRequest, SyncPullResponse, SyncPushRequest, SyncPushResponse } from '../../../repository-contract/src';
import { adaptStorageArea, createLocalQueue, createSyncClient, pushIsolatingRefusals, type LocalQueue, type SyncClient, type Transport } from '../../../repository-sync/src';
import type { ChromeApi, StorageArea } from '../platform';
import type { SyncView } from '../protocol';
import { isLocalLearner } from './recorder';
import type { SessionManager } from './session';

export const SYNC_STATUS_KEY = 'golearn:sync-status';
export const SYNC_ALARM = 'golearn-sync';
/**
 * This debounce is what bounds the latency of a live second device. GoReview on the phone holds `POST /sync/wait` against the service and
 * hears of new events the moment a push lands, so "learner reads on the desktop -> phone knows" is this 2 s plus the push itself.
 * A signed-in event (SelectionLookedUp, ItemMarked, ...) is pushed after one debounce; do not lengthen it without telling GoReview.
 */
export const SYNC_DEBOUNCE_MS = 2_000;
export const SYNC_PERIOD_MINUTES = 5;

export class UnauthorizedError extends Error { constructor() { super('The service did not accept the stored sign-in (401).'); this.name = 'UnauthorizedError'; } }

/** The persisted part of the status (survives a service-worker restart). */
interface Persisted { lastPushAt?: number; lastError?: string; needsSignIn?: boolean }

export interface SyncServiceOptions {
  area: StorageArea;
  session: SessionManager;
  deviceId: () => Promise<string>;
  now?: () => number;
  /** Called after a successful sync round (the profile cache refresh). */
  onSynced?: () => Promise<void> | void;
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
}

/** The extension keeps no copy of other devices' events (knowledge comes from the Repository's projection); pulled events are counted and dropped. */
const discardLog: EventLog = {
  append: async (_learnerId, events: GoEvent[]) => events.map((e) => ({ id: e.id, stored: true as const })) as Awaited<ReturnType<EventLog['append']>>,
  list: async () => [],
  get: async () => undefined,
  head: async () => 0,
};

export function createSyncService(opts: SyncServiceOptions) {
  const now = opts.now ?? Date.now;
  const timers = opts.timers ?? { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  const queue: LocalQueue = createLocalQueue(adaptStorageArea(opts.area), { now });
  // the sync client sees only events that carry the learner's own identity
  const syncable: LocalQueue = {
    ...queue,
    pending: async () => (await queue.pending()).filter((r) => !isLocalLearner(r.event.learnerId)),
    size: async () => (await queue.pending()).filter((r) => !isLocalLearner(r.event.learnerId)).length,
  };

  let client: SyncClient | undefined;
  let persisted: Persisted | undefined;
  let debounce: unknown;
  let online = true;
  let sawUnauthorized = false;
  let forceNext = false;

  const load = async (): Promise<Persisted> => (persisted ??= ((await opts.area.get(SYNC_STATUS_KEY))[SYNC_STATUS_KEY] as Persisted | undefined) ?? {});
  const save = async (patch: Persisted): Promise<void> => {
    persisted = { ...(await load()), ...patch };
    try { await opts.area.set({ [SYNC_STATUS_KEY]: persisted }); } catch { /* status is a convenience */ }
  };

  const transport: Transport = {
    async push(req: SyncPushRequest): Promise<SyncPushResponse> {
      const a = await opts.session.authenticated();
      if (!a) { sawUnauthorized = true; throw new UnauthorizedError(); }
      // The service refuses a whole batch when any event in it is invalid (422 with the bad indexes). One bad event must not wedge the
      // good ones behind it: the rest is sent again, and each bad one is reported as refused so the client sets it aside as a rejected row.
      const r = await pushIsolatingRefusals((q) => a.api.syncPush(q), req);
      if (r.ok) return r.data;
      // 403 not-your-device: the session is bound to another device id (this one was lost or damaged) -> sign in again, which re-registers it (audit O-03)
      if (r.status === 401 || (r.status === 403 && r.error === 'not-your-device')) { sawUnauthorized = true; throw new UnauthorizedError(); }
      throw new Error(`sync push refused: ${r.error}${r.message ? ` (${r.message})` : ''}`);
    },
    async pull(req: SyncPullRequest): Promise<SyncPullResponse> {
      const a = await opts.session.authenticated();
      if (!a) { sawUnauthorized = true; throw new UnauthorizedError(); }
      const r = await a.api.syncPull(req);
      if (r.ok) return r.data;
      if (r.status === 401 || (r.status === 403 && r.error === 'not-your-device')) { sawUnauthorized = true; throw new UnauthorizedError(); }
      throw new Error(`sync pull refused: ${r.error}${r.message ? ` (${r.message})` : ''}`);
    },
  };

  async function getClient(): Promise<SyncClient> {
    if (client) return client;
    const deviceId = await opts.deviceId();
    client = createSyncClient({ queue: syncable, local: discardLog, transport, deviceId, now, pullLimit: 200, backoff: { baseMs: 2_000, maxMs: 5 * 60_000, factor: 2, jitter: 0.5 } });
    client.setOnline(online);
    return client;
  }

  async function status(): Promise<SyncView & { localOnly: number }> {
    const p = await load();
    const all = await queue.pending();
    const localOnly = all.filter((r) => isLocalLearner(r.event.learnerId)).length;
    const s = await opts.session.status();
    const c = await getClient();
    const cs = await c.status();
    return {
      pending: all.length - localOnly,
      rejected: cs.rejected,
      lastPushAt: cs.lastPushAt ?? p.lastPushAt,
      lastError: p.needsSignIn ? 'Sign in again to sync.' : (cs.lastError ?? p.lastError),
      online: cs.online,
      needsSignIn: !!p.needsSignIn || (s.connected && s.expired),
      localOnly,
    };
  }

  /** The persisted 401 state, read without touching the queue. */
  async function needsSignIn(): Promise<boolean> { return !!(await load()).needsSignIn; }

  /** One round: push, then pull. Resolves with the outcome; never throws. */
  async function syncOnce(o: { force?: boolean } = {}): Promise<{ ok: boolean; skipped?: 'not-connected' | 'needs-sign-in' | 'offline' | 'backoff' }> {
    try {
      // a sign-out that could not reach the service left a session alive there: end it as soon as a round can run (audit P-08)
      if (online) { try { await opts.session.retryRevocation(); } catch { /* the slot stays for the next round */ } }
      const s = await opts.session.status();
      if (!s.connected) return { ok: true, skipped: 'not-connected' };
      const p = await load();
      if (p.needsSignIn || s.expired) return { ok: false, skipped: 'needs-sign-in' };
      const c = await getClient();
      sawUnauthorized = false;
      const r = await c.syncOnce({ force: o.force });
      if (r.skipped) return { ok: r.ok, skipped: r.skipped };
      const st = await c.status();
      if (r.ok) {
        await save({ lastPushAt: st.lastPushAt ?? now(), lastError: undefined });
        try { await opts.onSynced?.(); } catch { /* a cache refresh must not fail a sync */ }
        return { ok: true };
      }
      // the transport throws UnauthorizedError; the client keeps only its message
      const message = st.lastError ?? r.push?.error ?? r.pull?.error ?? 'sync failed';
      if (sawUnauthorized) { await save({ needsSignIn: true, lastError: message }); return { ok: false, skipped: 'needs-sign-in' }; }
      await save({ lastError: message });
      return { ok: false };
    } catch (e) {
      await save({ lastError: e instanceof Error ? e.message : String(e) });
      return { ok: false };
    }
  }

  /** Debounced: a burst of events (a card, its layers, a pronunciation) is one round. */
  function schedule(force = false): void {
    if (debounce !== undefined) timers.clear(debounce);
    forceNext = forceNext || force;
    debounce = timers.set(() => { debounce = undefined; const f = forceNext; forceNext = false; void syncOnce({ force: f }); }, SYNC_DEBOUNCE_MS);
  }

  /** A new sign-in clears the 401 state and tries at once. */
  async function onSignedIn(): Promise<void> {
    await save({ needsSignIn: false, lastError: undefined });
    schedule(true); // a fresh sign-in does not wait out the backoff of the dead one
  }

  /** Any other call that met a 401 (a correction, a knowledge query) reports it here so the popup can say "sign in again". */
  async function noteUnauthorized(): Promise<void> { await save({ needsSignIn: true, lastError: 'The service did not accept the stored sign-in (401).' }); }

  function setOnline(v: boolean): void { online = v; client?.setOnline(v); if (v) schedule(); }

  function registerAlarm(chrome: ChromeApi): void {
    const alarms = chrome.alarms;
    if (!alarms) return; // the permission is not declared or not available: the debounce and the popup's button remain
    try {
      void Promise.resolve(alarms.get?.(SYNC_ALARM)).then((existing) => { if (!existing) void alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES, delayInMinutes: 1 }); }, () => { void alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES }); });
      alarms.onAlarm.addListener((a) => { if (a.name === SYNC_ALARM) void syncOnce(); });
    } catch { /* an alarm is an extra, not a requirement */ }
  }

  return { queue, status, needsSignIn, syncOnce, schedule, onSignedIn, noteUnauthorized, setOnline, registerAlarm };
}

export type SyncService = ReturnType<typeof createSyncService>;
