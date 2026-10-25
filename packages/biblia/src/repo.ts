/**
 * Where Biblia's events go. Inside the GoLearn extension (this page served from chrome-extension://…/biblia/) the extension's background
 * worker owns the device's Repository and this page reaches it over `golearn:local-repo` (the same route GoPractice uses); the learner's
 * enrolment in Hebrew or Greek is found or made there, with the period the text is in as its variety. Anywhere else there is no repository:
 * the reader works, records nothing, and says so. Two further modes sit beside these: 'app' (inside the GoReview iPhone app, over its Keychain
 * session) and, in the standalone web edition, 'account' (signed in to the Repository service named in config.json; see `accountRecorder`,
 * which keeps an offline queue). Nothing in this file handles a password; the account mode holds only the session the service gave.
 */
import { connectLocalRepository } from '../../repository-local/src/proxy';
import type { GoEvent, Enrolment } from '../../repository-contract/src';
import type { RepositoryApi } from '../../repository-service/src/api';
import type { BibliaLang } from './canon';
import { QUEUE_CAP, type EventQueue } from './queue';

const MSG_LOCAL_REPO = 'golearn:local-repo';
export const READER_ID = 'biblia';
export const APP_VERSION = '0.1.0';
const PACK_VERSION: Record<BibliaLang, string> = { he: '1', el: '1' };

export interface Identity { learnerId: string; enrolmentId: string; deviceId: string }
/** `ok` = the events are safe (sent, or kept in the offline queue: then `queued`); `message` is for the learner either way (a refusal, a full queue, the offline note). */
export interface RecordResult { ok: boolean; message?: string; queued?: boolean }
export interface FlushResult { status: 'ok' | 'offline' | 'auth' | 'rejected'; sent: number; pending: number; rejected: number; message?: string }
/** Remembers which enrolment an account's events of a language and period belong to, so a lookup made offline can still be recorded. */
export interface EnrolmentMemo { get(key: string): string | undefined; set(key: string, enrolmentId: string): void; clear(): void }

export interface Recorder {
  /** 'extension' when the on-device Repository is reachable; 'app' inside the GoReview iPhone app over its signed-in session; 'account' in the standalone web edition while signed in to the service; else 'none' with the reason the page shows. */
  readonly mode: 'extension' | 'app' | 'account' | 'none';
  readonly reason?: string;
  /** The identity for events of this language and period (an enrolment is made on first use); undefined when nothing is recorded. */
  identity(lang: BibliaLang, varietyId: string): Promise<Identity | undefined>;
  record(events: GoEvent[]): Promise<RecordResult>;
  /** Account mode: send what the offline queue holds now (on start, when the browser comes back online). */
  flush?(): Promise<FlushResult>;
  /** Account mode: how many events wait in the offline queue for the signed-in learner. */
  pending?(): number;
  destroy?(): void;
}

interface GlobalLike { chrome?: { runtime?: { id?: string; sendMessage?: (m: unknown) => Promise<unknown> } }; location?: { protocol?: string } }

/** The extension API, only when this page really is an extension page (an ordinary tab also has a `chrome` object, without `runtime.id`). */
export function extensionSend(g: GlobalLike = globalThis as unknown as GlobalLike): ((m: unknown) => Promise<unknown>) | undefined {
  const r = g.chrome?.runtime;
  if (!r || typeof r.id !== 'string' || !r.id || typeof r.sendMessage !== 'function') return undefined;
  const protocol = g.location?.protocol;
  if (protocol !== undefined && protocol !== 'chrome-extension:' && protocol !== 'moz-extension:') return undefined;
  return (m) => r.sendMessage!(m);
}

export const noRecorder = (reason: string): Recorder => ({ mode: 'none', reason, identity: async () => undefined, record: async () => ({ ok: false, message: reason }) });

/** A recorder over a Repository API with a learner id (the on-device one through the extension, or any other the host provides). */
export function apiRecorder(api: RepositoryApi, learner: () => Promise<{ learnerId: string; deviceId?: string }>, mode: 'extension' | 'app' | 'account' = 'extension', opts: { memo?: EnrolmentMemo } = {}): Recorder {
  const enrolments = new Map<string, Promise<Enrolment | undefined>>();
  const enrolmentFor = (lang: BibliaLang, varietyId: string): Promise<Enrolment | undefined> => {
    const key = `${lang}|${varietyId}`;
    let p = enrolments.get(key);
    if (!p) {
      p = (async () => {
        const list = await api.listEnrolments();
        if (!list.ok) return undefined;
        const live = list.data.enrolments.filter((e) => e.languageId === lang && !e.endedAt);
        const exact = live.find((e) => e.varietyId === varietyId) ?? live[0];
        if (exact) return exact;
        const made = await api.enrol({ languageId: lang, varietyId, scriptId: lang === 'he' ? 'Hebr' : 'Grek', packId: `pack:${lang}`, packVersion: PACK_VERSION[lang], goals: [] });
        return made.ok ? made.data.enrolment : undefined;
      })();
      enrolments.set(key, p);
      p.then((e) => { if (!e) enrolments.delete(key); }, () => enrolments.delete(key));
    }
    return p;
  };
  return {
    mode,
    async identity(lang, varietyId) {
      // a Repository that cannot be reached is "no identity" (the lookup still shows its card), never an exception
      try {
        const who = await learner();
        const key = `${who.learnerId}|${lang}|${varietyId}`;
        const known = opts.memo?.get(key);
        if (known) return { learnerId: who.learnerId, enrolmentId: known, deviceId: who.deviceId ?? 'this-device' };
        const e = await enrolmentFor(lang, varietyId);
        if (!e) return undefined;
        opts.memo?.set(key, e.enrolmentId);
        return { learnerId: who.learnerId, enrolmentId: e.enrolmentId, deviceId: who.deviceId ?? 'this-device' };
      } catch { return undefined; }
    },
    async record(events) {
      try {
        const r = await api.appendEvents(events);
        return r.ok ? { ok: true } : { ok: false, message: r.message || `The Repository answered ${r.status}.` };
      } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
    },
  };
}

/** The recorder for this page: the extension's on-device Repository when the page is an extension page, else none. */
export function makeRecorder(send = extensionSend(), app?: { api: RepositoryApi; learnerId: string; deviceId: string }): Recorder {
  // inside the GoReview iPhone app: the account session the app keeps in Keychain, against the app's Repository address
  if (app) return apiRecorder(app.api, async () => ({ learnerId: app.learnerId, deviceId: app.deviceId }), 'app');
  if (!send) return noRecorder('Open Biblia from the GoLearn extension to record what you read: here it is a reader only, and nothing is kept.');
  const local = connectLocalRepository(send, MSG_LOCAL_REPO);
  return apiRecorder(local.api, () => local.identity());
}

// ───────────────────────────── the standalone web edition: signed in to the Repository service ─────────────────────────────

export const SIGNED_OUT_REASON = 'Sign in to record what you read; until you do, Biblia is a reader only.';
const ENROLMENTS_KEY = 'biblia:enrolments';
const BATCH = 100;
export const UPLOAD_RETRY_BASE_MS = 5_000;
export const UPLOAD_RETRY_MAX_MS = 30_000;

/** The enrolment ids of this browser's account(s), in localStorage (ids only; nothing a learner typed). */
export function enrolmentMemo(storage: Storage | undefined): EnrolmentMemo {
  const read = (): Record<string, string> => {
    try { const j = JSON.parse(storage?.getItem(ENROLMENTS_KEY) ?? '{}') as unknown; return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, string>) : {}; } catch { return {}; }
  };
  const write = (m: Record<string, string>): void => { try { storage?.setItem(ENROLMENTS_KEY, JSON.stringify(m)); } catch { /* storage blocked */ } };
  return {
    get: (key) => { const v = read()[key]; return typeof v === 'string' && v ? v : undefined; },
    set: (key, id) => write({ ...read(), [key]: id }),
    clear: () => { try { storage?.removeItem(ENROLMENTS_KEY); } catch { /* storage blocked */ } },
  };
}

export interface AccountRecorderOptions {
  /** The signed-in session right now, or undefined when signed out (read at every call, so signing in or out needs no new recorder). */
  session(): { api: RepositoryApi; learnerId: string; deviceId: string } | undefined;
  queue: EventQueue;
  storage?: Storage;
  /** The window whose 'online' event flushes the queue. */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Account state changes flush after sign-in and cancel retries after sign-out or expiry. */
  subscribeSession?(listener: () => void): () => void;
  /** Timer seam for deterministic retry tests. */
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
  /** Optional observer for queue and upload state. */
  onStatus?(status: AccountRecorderStatus): void;
  /** Events the service has acknowledged (the levels on the page refresh from them). */
  onAppended?(events: GoEvent[]): void;
  /** The service said 401: the session is no longer valid (the events stay queued). */
  onAuthExpired?(): void;
}
export interface AccountRecorderStatus { pending: number; lastSuccessAt?: number; lastError?: string; retryAt?: number; retrying: boolean }
export type AccountRecorder = Recorder & { flush(): Promise<FlushResult>; pending(): number; status(): AccountRecorderStatus; subscribeStatus(listener: (status: AccountRecorderStatus) => void): () => void; destroy(): void };

/**
 * The recorder of the standalone edition. `mode` is 'account' while a session exists and 'none' (with the sign-in reason) otherwise, read live.
 * Identities come from `apiRecorder` over the signed-in api (the enrolment is made on first use, then remembered). Every record() goes into the
 * offline queue first and is then sent from it, oldest first, in batches; a batch the service cannot take now (offline, 5xx, 429) stays queued and
 * is retried on start, sign-in, online/focus/resume, and a bounded 5/10/20/30-second ladder; a batch refused for good (4xx) is dropped, one event
 * at a time, so a single bad event cannot block the rest.
 */
export function accountRecorder(o: AccountRecorderOptions): AccountRecorder {
  const memo = enrolmentMemo(o.storage);
  const inner = new WeakMap<RepositoryApi, Recorder>();
  const innerFor = (s: NonNullable<ReturnType<AccountRecorderOptions['session']>>): Recorder => {
    let r = inner.get(s.api);
    if (!r) { r = apiRecorder(s.api, async () => ({ learnerId: s.learnerId, deviceId: s.deviceId }), 'account', { memo }); inner.set(s.api, r); }
    return r;
  };
  const authEnded = (): void => { try { o.onAuthExpired?.(); } catch { /* a listener never stops the queue */ } };
  const appended = (events: GoEvent[]): void => { try { o.onAppended?.(events); } catch { /* a listener never stops the queue */ } };
  const transient = (status: number): boolean => status === 0 || status >= 500 || status === 429 || status === 408;
  const sameSession = (a: NonNullable<ReturnType<AccountRecorderOptions['session']>> | undefined): boolean => {
    const b = o.session();
    return !!a && !!b && a.api === b.api && a.learnerId === b.learnerId && a.deviceId === b.deviceId;
  };

  async function drain(): Promise<FlushResult> {
    const s = o.session();
    const out: FlushResult = { status: 'ok', sent: 0, pending: 0, rejected: 0 };
    if (!s) return out;
    const left = (): number => o.queue.count(s.learnerId);
    for (;;) {
      if (destroyed || !sameSession(s)) { out.pending = left(); return out; }
      const batch = o.queue.peek(s.learnerId, BATCH);
      if (!batch.length) break;
      let r;
      try { r = await s.api.appendEvents(batch); } catch {
        if (!sameSession(s)) { out.pending = left(); return out; }
        return { ...out, status: 'offline', pending: left(), message: 'The service could not be reached.' };
      }
      // A response from the previous account may arrive after sign-out or account switching. Keep its events for that learner and never
      // let an old 401 expire the new account's session.
      if (destroyed || !sameSession(s)) { out.pending = left(); return out; }
      if (r.ok) { o.queue.remove(batch.map((e) => e.id)); out.sent += batch.length; appended(batch); continue; }
      if (r.status === 401) { authEnded(); return { ...out, status: 'auth', pending: left(), message: 'Your sign-in has ended.' }; }
      if (transient(r.status)) return { ...out, status: 'offline', pending: left(), message: r.message || `The service answered ${r.status}.` };
      // refused for good: find which events, one at a time, so the good ones still go
      memo.clear();
      for (const e of batch) {
        if (destroyed || !sameSession(s)) { out.pending = left(); return out; }
        let one;
        try { one = await s.api.appendEvents([e]); } catch {
          if (!sameSession(s)) { out.pending = left(); return out; }
          return { ...out, status: 'offline', pending: left(), message: 'The service could not be reached.' };
        }
        if (destroyed || !sameSession(s)) { out.pending = left(); return out; }
        if (one.ok) { o.queue.remove([e.id]); out.sent += 1; appended([e]); }
        else if (one.status === 401) { authEnded(); return { ...out, status: 'auth', pending: left(), message: 'Your sign-in has ended.' }; }
        else if (transient(one.status)) return { ...out, status: 'offline', pending: left(), message: one.message || `The service answered ${one.status}.` };
        else { o.queue.remove([e.id]); out.rejected += 1; out.status = 'rejected'; out.message = one.message || `The service refused it (${one.status}).`; }
      }
    }
    out.pending = left();
    return out;
  }

  let running: Promise<FlushResult> | undefined;
  let runningOwner: NonNullable<ReturnType<AccountRecorderOptions['session']>> | undefined;
  let again = false;
  const timers = o.timers ?? { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  let retryTimer: unknown;
  let retryStreak = 0;
  let destroyed = false;
  let retryAt: number | undefined;
  let lastSuccessAt: number | undefined;
  let lastError: string | undefined;
  const statusListeners = new Set<(status: AccountRecorderStatus) => void>();
  const status = (): AccountRecorderStatus => {
    const s = o.session();
    return {
      pending: s ? o.queue.count(s.learnerId) : 0,
      ...(lastSuccessAt !== undefined ? { lastSuccessAt } : {}),
      ...(lastError ? { lastError } : {}),
      ...(retryAt !== undefined ? { retryAt } : {}),
      retrying: !!running,
    };
  };
  const notifyStatus = (): void => {
    const value = status();
    try { o.onStatus?.(value); } catch { /* status observers cannot stop uploads */ }
    for (const listener of [...statusListeners]) { try { listener(value); } catch { /* a listener cannot stop uploads */ } }
  };
  const clearRetry = (reset = false): void => {
    if (retryTimer !== undefined) timers.clear(retryTimer);
    retryTimer = undefined;
    retryAt = undefined;
    if (reset) retryStreak = 0;
  };
  const armRetry = (result: FlushResult, owner: NonNullable<ReturnType<AccountRecorderOptions['session']>>): void => {
    if (destroyed || result.status !== 'offline' || result.pending === 0 || !sameSession(owner)) { clearRetry(true); return; }
    clearRetry();
    retryStreak += 1;
    const delay = Math.min(UPLOAD_RETRY_MAX_MS, UPLOAD_RETRY_BASE_MS * 2 ** (retryStreak - 1));
    retryAt = Date.now() + delay;
    retryTimer = timers.set(() => { retryTimer = undefined; void flush(); }, delay);
  };
  function flush(): Promise<FlushResult> {
    if (destroyed) return Promise.resolve({ status: 'ok', sent: 0, pending: 0, rejected: 0 });
    const owner = o.session();
    if (!owner) { clearRetry(true); return Promise.resolve({ status: 'ok', sent: 0, pending: 0, rejected: 0 }); }
    clearRetry();
    if (running) { runningOwner = owner; again = true; return running; }
    lastError = undefined;
    runningOwner = owner;
    running = (async () => {
      let last: FlushResult;
      let sent = 0; let rejected = 0; let message: string | undefined;
      do {
        again = false;
        last = await drain();
        sent += last.sent; rejected += last.rejected; message = last.message ?? message;
        if (last.status === 'auth') break;
      } while (again); // a flush asked for while this one was running (the browser came back online, a new event) gets one more try, never a loop
      return { ...last, sent, rejected, ...(message ? { message } : {}) };
    })().then((result) => {
      const resultOwner = runningOwner ?? owner;
      if (destroyed || !sameSession(resultOwner)) { clearRetry(true); lastError = undefined; return result; }
      if (result.status === 'ok' && result.pending === 0) { lastSuccessAt = Date.now(); lastError = undefined; clearRetry(true); }
      else if (result.status !== 'ok') lastError = result.message ?? (result.status === 'auth' ? 'Your sign-in has ended.' : 'Upload is waiting for the service.');
      armRetry(result, resultOwner);
      return result;
    }).finally(() => { running = undefined; runningOwner = undefined; notifyStatus(); });
    notifyStatus();
    return running;
  }

  const onWake = (): void => { void flush(); };
  const wakeEvents = ['online', 'focus', 'pageshow', 'resume'] as const;
  for (const event of wakeEvents) o.win?.addEventListener(event, onWake);
  const unsubscribeSession = o.subscribeSession?.(() => {
    if (o.session()) { clearRetry(true); void flush(); }
    else { clearRetry(true); lastError = undefined; notifyStatus(); }
  });

  return {
    get mode() { return o.session() ? 'account' : 'none'; },
    get reason() { return o.session() ? undefined : SIGNED_OUT_REASON; },
    async identity(lang, varietyId) {
      const s = o.session();
      return s ? innerFor(s).identity(lang, varietyId) : undefined;
    },
    async record(events) {
      const s = o.session();
      if (!s) return { ok: false, message: SIGNED_OUT_REASON };
      const { dropped } = o.queue.push(events);
      notifyStatus();
      const notes: string[] = [];
      if (dropped) notes.push(`${dropped} of the oldest events waiting on this device were dropped: the offline queue holds at most ${QUEUE_CAP.toLocaleString('en-US')}.`);
      const r = await flush();
      const pending = o.queue.count(s.learnerId);
      if (r.status === 'auth') return { ok: false, queued: true, message: 'Your sign-in has ended. Sign in again; what you did is kept on this device until then.' };
      if (r.status === 'rejected' && pending === 0 && r.sent === 0) return { ok: false, message: r.message ?? 'The service refused this.' };
      if (r.status === 'offline' || pending > 0) notes.unshift(`Saved on this device (${pending} waiting); it is sent when the service can be reached.`);
      return { ok: true, ...(pending > 0 ? { queued: true } : {}), ...(notes.length ? { message: notes.join(' ') } : {}) };
    },
    flush,
    pending() { const s = o.session(); return s ? o.queue.count(s.learnerId) : 0; },
    status,
    subscribeStatus(listener) { statusListeners.add(listener); try { listener(status()); } catch { /* */ } return () => { statusListeners.delete(listener); }; },
    destroy() {
      destroyed = true;
      clearRetry(true);
      for (const event of wakeEvents) o.win?.removeEventListener(event, onWake);
      unsubscribeSession?.();
      statusListeners.clear();
    },
  };
}
