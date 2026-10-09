/**
 * The application context handed to every screen: the environment, the storage, the signed-in learner, the one active
 * language, the learner's data (local queue, local event log, sync client) and the few operations more than one screen
 * needs (sign-in, sign-out, recording events, syncing).
 *
 * One learner's data (queue, rejected rows, sync cursor, local event log) lives under the area prefix `u:<learnerId>:`.
 * Signing in as another account therefore never exposes the previous learner's rows and never destroys events that
 * were waiting to be sent; what an account switch clears is the cache: profile, active language, candidate lists.
 */
import type { Enrolment, GoEvent, EventLog } from '../repository-contract/src';
import type { RepositoryApi, ApiResult } from '../repository-service/src/api';
import {
  createLocalQueue, createSyncClient, type LocalQueue, type SyncClient, type SyncResult, type SyncStatus, type Transport,
} from '../repository-sync/src';
import { explainFailure, resolveServiceUrl, validateServiceUrl } from './config';
import type { ActiveRun, AudioDeps, Deps, EventContext, Identity, ReviewEngine } from './ports';
import {
  KEYS, createLocalEventLog, createScopedArea, createStateStore, learnerPrefix, removeByPrefix, type Profile, type Session, type Settings, type StateStore,
} from './state';

export interface DataHandle {
  learnerId: string;
  deviceId: string;
  /** The learner's own prefixed area. */
  area: import('../repository-sync/src').KeyValueArea;
  queue: LocalQueue;
  log: EventLog;
  sync: SyncClient;
}

export type SignInResult = { ok: true; email: string; switched: boolean } | { ok: false; message: string };
export interface RecordResult { queued: number; duplicates: number; refused: Array<{ id: string; issues: string[] }> }

export interface SyncView { status: SyncStatus | undefined; authExpired: boolean; syncing: boolean }

export interface AppContext {
  deps: Deps;
  state: StateStore;
  engine: ReviewEngine;
  /** The session in progress, or the one that just ended (its summary). */
  run: { active?: ActiveRun };
  serviceUrl(): Promise<string>;
  saveService(baseUrl: string | undefined): Promise<{ ok: true } | { ok: false; message: string }>;
  api(): Promise<{ api: RepositoryApi; session: Session | undefined; baseUrl: string }>;
  deviceId(): Promise<string>;
  session(): Promise<Session | undefined>;
  /** The learner's enrolments that have not ended (from the cache, refreshed when the service answers). */
  enrolments(): Promise<Enrolment[]>;
  refreshProfile(): Promise<'fresh' | 'cached' | 'none'>;
  /** The signed-in learner and the one active language; undefined when signed out or without an enrolment. */
  identity(): Promise<Identity | undefined>;
  setLanguage(enrolmentId: string): Promise<boolean>;
  signIn(input: { email: string; password: string }): Promise<SignInResult>;
  signOut(opts?: { forget?: boolean }): Promise<{ pendingLeft: number }>;
  data(): Promise<DataHandle | undefined>;
  eventContext(): Promise<EventContext | undefined>;
  /** The learner's events in the local log (own + pulled), optionally of one language. */
  events(languageId?: string): Promise<GoEvent[]>;
  /** Persists events to the outbound queue, then to the local log; never throws for a refused event. */
  record(events: GoEvent[]): Promise<RecordResult>;
  syncNow(opts?: { force?: boolean }): Promise<SyncResult | undefined>;
  /** Resolves when the sync in flight (if any) has finished. */
  whenSynced(): Promise<void>;
  syncView(): Promise<SyncView>;
  onSync(cb: (v: SyncView) => void): () => void;
  audio(): Promise<AudioDeps | null>;
  /** Device switches (remote speech consent); the audio's consent getter follows at once. */
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Navigation. */
  go(route: string): void;
  /** Something the header depends on changed (language, sign-in, sync). */
  changed(): void;
  destroy(): void;
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}
const throwFailure = (r: Extract<ApiResult<unknown>, { ok: false }>): never => { throw new ApiError(r.status, r.message || `The service answered ${r.status}.`); };

export function defaultTransport(api: RepositoryApi): Transport {
  return {
    async push(req) { const r = await api.syncPush(req); return r.ok ? r.data : throwFailure(r); },
    async pull(req) { const r = await api.syncPull(req); return r.ok ? r.data : throwFailure(r); },
  };
}

export function createContext(deps: Deps, hooks: { go(route: string): void; changed(): void }): AppContext {
  const state = createStateStore(deps.area);
  const run: { active?: ActiveRun } = {};
  let handle: DataHandle | undefined;
  let handleKey = '';
  let inflight: Promise<unknown> = Promise.resolve();
  let syncing = false;
  let authExpired = false;
  let lastStatus: SyncStatus | undefined;
  let consentCache = false;
  let audioDeps: AudioDeps | null | undefined;
  const listeners = new Set<(v: SyncView) => void>();
  const disposers: Array<() => void> = [];

  const view = (): SyncView => ({ status: lastStatus, authExpired, syncing });
  const notify = (): void => { const v = view(); for (const l of [...listeners]) { try { l(v); } catch { /* a listener must not break sync */ } } };

  void state.getSettings().then((s) => { consentCache = s.remoteSpeechConsent; }, () => undefined);

  const onlineNow = (): boolean => (deps.win.navigator ? deps.win.navigator.onLine !== false : true);

  async function serviceUrl(): Promise<string> {
    return resolveServiceUrl((await state.getService())?.baseUrl, deps.config);
  }

  async function deviceId(): Promise<string> {
    const cur = (await deps.area.get(KEYS.device))[KEYS.device];
    if (typeof cur === 'string' && cur) return cur;
    const id = `web-${deps.newId()}`;
    await deps.area.set({ [KEYS.device]: id });
    return id;
  }

  async function api(): Promise<{ api: RepositoryApi; session: Session | undefined; baseUrl: string }> {
    const [baseUrl, session] = await Promise.all([serviceUrl(), state.getSession()]);
    return { api: deps.createApi(baseUrl, session?.token), session, baseUrl };
  }

  function dropHandle(): void {
    if (handle) { try { handle.sync.stop(); } catch { /* */ } }
    handle = undefined; handleKey = ''; run.active = undefined;
    lastStatus = undefined; syncing = false;
  }

  async function data(): Promise<DataHandle | undefined> {
    const { api: client, session, baseUrl } = await api();
    if (!session) { dropHandle(); return undefined; }
    const key = `${session.learnerId}|${session.token}|${baseUrl}`;
    if (handle && handleKey === key) return handle;
    dropHandle();
    const device = await deviceId();
    const area = createScopedArea(deps.area, learnerPrefix(session.learnerId));
    const queue = createLocalQueue(area, { now: () => deps.now().getTime() });
    const log = createLocalEventLog(area, { now: () => deps.now().toISOString() });
    const transport = (deps.createTransport ?? defaultTransport)(client);
    const guarded: Transport = {
      async push(req) { try { const r = await transport.push(req); authExpired = false; return r; } catch (e) { noteAuth(e); throw e; } },
      async pull(req) { try { const r = await transport.pull(req); authExpired = false; return r; } catch (e) { noteAuth(e); throw e; } },
    };
    const sync = createSyncClient({
      queue, local: log, transport: guarded, deviceId: device, now: () => deps.now().getTime(), area,
      backoff: { baseMs: 2_000, maxMs: 120_000 },
      onStatus: (s) => { lastStatus = s; notify(); },
    });
    sync.setOnline(onlineNow());
    handle = { learnerId: session.learnerId, deviceId: device, area, queue, log, sync };
    handleKey = key;
    if (deps.autoSync) sync.start(30_000); else void syncNow();
    return handle;
  }

  function noteAuth(e: unknown): void {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { authExpired = true; notify(); }
  }

  async function syncNow(opts?: { force?: boolean }): Promise<SyncResult | undefined> {
    const d = await data();
    if (!d) return undefined;
    syncing = true; notify();
    const run = d.sync.syncOnce(opts).catch((): SyncResult => ({ ok: false })).finally(() => { syncing = false; notify(); });
    inflight = run;
    const out = await run;
    try { lastStatus = await d.sync.status(); } catch { /* */ }
    notify();
    if (out.pull && out.pull.appended > 0) hooks.changed();
    return out;
  }

  const onOnline = (): void => { if (handle) { handle.sync.setOnline(true); void syncNow({ force: true }); } };
  const onOffline = (): void => { if (handle) handle.sync.setOnline(false); };
  deps.win.addEventListener('online', onOnline);
  deps.win.addEventListener('offline', onOffline);
  disposers.push(() => { deps.win.removeEventListener('online', onOnline); deps.win.removeEventListener('offline', onOffline); });

  async function refreshProfile(): Promise<'fresh' | 'cached' | 'none'> {
    const { api: client, session } = await api();
    if (!session) return 'none';
    try {
      const me = await client.me();
      if (me.ok) {
        await state.setProfile({ fetchedAt: deps.now().toISOString(), email: me.data.account.email, learnerId: session.learnerId, enrolments: me.data.enrolments });
        return 'fresh';
      }
      if (me.status === 401 || me.status === 403) { authExpired = true; notify(); }
    } catch { /* offline: the cache stands */ }
    const cached = await state.getProfile();
    return cached && cached.learnerId === session.learnerId ? 'cached' : 'none';
  }

  async function enrolments(): Promise<Enrolment[]> {
    const session = await state.getSession();
    if (!session) return [];
    let profile = await state.getProfile();
    if (!profile || profile.learnerId !== session.learnerId) { await refreshProfile(); profile = await state.getProfile(); }
    if (!profile || profile.learnerId !== session.learnerId) return [];
    return profile.enrolments.filter((e) => !e.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async function identity(): Promise<Identity | undefined> {
    const session = await state.getSession();
    if (!session) return undefined;
    const list = await enrolments();
    if (!list.length) return undefined;
    const wanted = await state.getActive(session.learnerId);
    const active = list.find((e) => e.enrolmentId === wanted) ?? list[0];
    return {
      learnerId: session.learnerId, enrolmentId: active.enrolmentId, languageId: active.languageId,
      ...(active.varietyId ? { varietyId: active.varietyId } : {}), deviceId: await deviceId(), email: session.email, enrolment: active,
    };
  }

  async function eventContext(): Promise<EventContext | undefined> {
    const id = await identity();
    if (!id) return undefined;
    return {
      learnerId: id.learnerId, enrolmentId: id.enrolmentId, languageId: id.languageId, ...(id.varietyId ? { varietyId: id.varietyId } : {}),
      deviceId: id.deviceId, appVersion: deps.appVersion, now: deps.now().toISOString(),
    };
  }

  const ctx: AppContext = {
    deps, state, engine: deps.engine, run,
    serviceUrl,
    async saveService(baseUrl) {
      if (baseUrl === undefined || baseUrl.trim() === '') { await state.setService(undefined); return { ok: true }; }
      const check = validateServiceUrl(baseUrl);
      if (!check.ok) return { ok: false, message: check.message };
      await state.setService(check.url);
      return { ok: true };
    },
    api, deviceId,
    session: () => state.getSession(),
    enrolments, refreshProfile, identity,
    async setLanguage(enrolmentId) {
      const session = await state.getSession();
      if (!session) return false;
      const target = (await enrolments()).find((e) => e.enrolmentId === enrolmentId);
      if (!target) return false;
      await state.setActive(session.learnerId, enrolmentId);
      hooks.changed();
      return true;
    },
    async signIn(input) {
      const baseUrl = await serviceUrl();
      const check = validateServiceUrl(baseUrl);
      if (!check.ok) return { ok: false, message: check.message };
      const email = input.email.trim();
      const device = await deviceId();
      let result: ApiResult<{ token: string; learnerId: string; expiresAt: string }>;
      try {
        result = await deps.createApi(check.url).createSession({ email, password: input.password, deviceId: device, platform: 'web' });
      } catch {
        return { ok: false, message: `Could not reach the service at ${check.url}. Check that it is running and that the address is right.` };
      }
      if (!result.ok) return { ok: false, message: explainFailure(result, 'signin') };
      const previous = await state.getSession();
      const switched = !!previous && previous.learnerId !== result.data.learnerId;
      // an account switch forgets the cache of the account it replaces; that learner's queued events stay under their own prefix
      if (previous && switched) await state.clearCaches(previous.learnerId);
      else await state.clearProfile();
      dropHandle();
      audioDeps = undefined;
      await state.setSession({ token: result.data.token, learnerId: result.data.learnerId, email, expiresAt: result.data.expiresAt });
      authExpired = false;
      await refreshProfile();
      await data();
      hooks.changed();
      return { ok: true, email, switched };
    },
    async signOut(opts) {
      const session = await state.getSession();
      let pendingLeft = 0;
      if (session) {
        const d = await data();
        if (d) {
          try { await d.sync.syncOnce({ force: true }); } catch { /* offline: the rows stay */ }
          pendingLeft = await d.queue.size();
        }
        try { const { api: client } = await api(); await client.deleteSession(); } catch { /* the token expires on its own */ }
        await state.clearSession();
        await state.clearCaches(session.learnerId);
        if (opts?.forget) await removeByPrefix(deps.area, [learnerPrefix(session.learnerId), `gopractice:prefs:${session.learnerId}:`, `gopractice:choices:${session.learnerId}`]);
      }
      dropHandle();
      audioDeps = undefined;
      authExpired = false;
      hooks.changed();
      return { pendingLeft };
    },
    data,
    eventContext,
    async events(languageId) {
      const d = await data();
      if (!d) return [];
      const rows = await d.log.list({ learnerId: d.learnerId, ...(languageId ? { languageId } : {}) });
      return rows;
    },
    async record(events) {
      const out: RecordResult = { queued: 0, duplicates: 0, refused: [] };
      const d = await data();
      if (!d) { for (const e of events) out.refused.push({ id: e.id, issues: ['not signed in'] }); return out; }
      for (const e of events) {
        const r = await d.queue.enqueue(e);
        if (r.ok) out.queued += 1;
        else if (r.reason === 'duplicate') out.duplicates += 1;
        else { out.refused.push({ id: e.id, issues: r.issues.map((i) => `${i.path}: ${i.message}`) }); continue; }
        await d.log.append(d.learnerId, [e]);
      }
      try { lastStatus = await d.sync.status(); notify(); } catch { /* the header may lag one event */ }
      if (deps.autoSync && out.queued) void syncNow();
      return out;
    },
    syncNow,
    async whenSynced() { await inflight.catch(() => undefined); },
    async syncView() {
      const d = handle;
      if (d) { try { lastStatus = await d.sync.status(); } catch { /* */ } }
      return view();
    },
    onSync(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    async audio() {
      if (audioDeps !== undefined) return audioDeps;
      const a = deps.audio;
      audioDeps = typeof a === 'function' ? a(() => consentCache) : a;
      return audioDeps;
    },
    async setSettings(patch) {
      const next = await state.patchSettings(patch);
      consentCache = next.remoteSpeechConsent;
      return next;
    },
    go: hooks.go,
    changed: hooks.changed,
    destroy() { for (const d of disposers) { try { d(); } catch { /* */ } } dropHandle(); listeners.clear(); },
  };
  return ctx;
}

export type { Profile };
