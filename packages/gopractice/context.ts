/**
 * The application context handed to every screen: the environment, the storage, the signed-in learner, the one active
 * language, the learner's data (local queue, local event log, sync client) and the few operations more than one screen
 * needs (sign-in, sign-out, recording events, syncing).
 *
 * One learner's data (queue, rejected rows, sync cursor, local event log) lives under the area prefix `u:<learnerId>:`.
 * Signing in as another account therefore never exposes the previous learner's rows and never destroys events that
 * were waiting to be sent; what an account switch clears is the cache: profile, active language, candidate lists.
 *
 * An account is optional where there is an on-device Repository (the extension's copy). Then, signed out, the "service" is that
 * repository: `api()` returns its typed client, the sync client moves the queue and the local log through its append / list routes
 * (localTransport), and the learner is the device's own anonymous one. Signing in uploads the device's history once and switches to
 * the account; signing out returns to the device without removing anything. The hosted copy has no such repository and needs an account.
 */
import type { Enrolment, GoEvent, EventLog } from '../repository-contract/src';
import { validateEvent } from '../repository-contract/src';
import type { RepositoryApi, ApiResult } from '../repository-service/src/api';
import {
  createLocalQueue, createSyncClient, pushIsolatingRefusals, type LocalQueue, type SyncClient, type SyncResult, type SyncStatus, type Transport,
} from '../repository-sync/src';
import { createAccountClient, type AccountClient } from './accountClient';
import { explainFailure, resolveServiceUrl, validateServiceUrl } from './config';
import { localTransport, uploadedCount, type LocalRepo } from './localRepo';
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

/** `uploaded`: how many of this device's events the account holds after the one-time upload (absent when there was nothing to upload it from, or it failed). */
export type SignInResult = { ok: true; email: string; switched: boolean; uploaded?: number } | { ok: false; message: string; /** The service’s error code (`email-unverified` …), when it gave one. */ code?: string };

/** 'account': signed in. 'device': no account, the on-device Repository answers. 'none': the hosted copy before sign-in. */
export type Mode = 'account' | 'device' | 'none';
export interface RecordResult { queued: number; duplicates: number; refused: Array<{ id: string; issues: string[] }> }

export interface SyncView { status: SyncStatus | undefined; authExpired: boolean; syncing: boolean }

export interface AppContext {
  deps: Deps;
  state: StateStore;
  engine: ReviewEngine;
  /** The session in progress, or the one that just ended (its summary). */
  run: { active?: ActiveRun };
  /** Whether this copy works on the device (the extension), with an account (signed in), or can do nothing until one signs in (the hosted copy). */
  mode(): Promise<Mode>;
  /** The on-device Repository, when this copy has one. */
  local(): Promise<LocalRepo | undefined>;
  serviceUrl(): Promise<string>;
  saveService(baseUrl: string | undefined): Promise<{ ok: true } | { ok: false; message: string }>;
  api(): Promise<{ api: RepositoryApi; session: Session | undefined; baseUrl: string }>;
  /** The account-hardening routes (confirmation, reset, sessions, export, deletion) on the service address, with the session’s token when it belongs to that address. */
  accountApi(): Promise<{ client: AccountClient; session: Session | undefined; baseUrl: string }>;
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
  /** Deliberately removes this device's own data: the on-device Repository and the learner's local queue, log and preferences. Never a side effect of signing out. */
  clearLocalData(): Promise<number>;
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
  /** Called when the learner's data changed underneath the screen (a pull brought events, a live update arrived); screens repaint themselves when they can. */
  onData(cb: () => void): () => void;
  notifyData(): void;
  /** Marks the cached profile (enrolments) stale: the next read fetches it again. A live update calls this. */
  invalidateProfile(): void;
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

/** The longest the sync client waits after a failed round before trying again (it was two minutes: a service that came back stayed unseen for that long). */
export const SYNC_BACKOFF_MAX_MS = 30_000;
/** After a failed round, a forced attempt (ignoring the backoff) is made for a newly recorded event at most this often. */
export const FORCED_PUSH_GAP_MS = 5_000;
/** Events asked for per pull page (the service's cap; it was 500): a fresh install or a new service address reads its history in few round trips. */
export const SYNC_PULL_PAGE = 1_000;

export function defaultTransport(api: RepositoryApi): Transport {
  return {
    // one event the service refuses (422 invalid-events) is set aside by the sync client and the rest goes in the same round (audit O-06)
    async push(req) { const r = await pushIsolatingRefusals((q) => api.syncPush(q), req); return r.ok ? r.data : throwFailure(r as Extract<ApiResult<unknown>, { ok: false }>); },
    // this app keeps no private documents in its sync client: ask for none, so a pull never carries every document body
    async pull(req) { const r = await api.syncPull({ ...req, documents: false }); return r.ok ? r.data : throwFailure(r); },
  };
}

export function createContext(deps: Deps, hooks: { go(route: string): void; changed(): void }): AppContext {
  const state = createStateStore(deps.area, deps.mobile?.native ? {
    get: async () => {
      const session = await deps.mobile!.getSession(await serviceUrl());
      return session?.serviceUrl ? session : undefined;
    },
    set: (session) => deps.mobile!.setSession(session),
    clear: async () => {
      const origin = await serviceUrl();
      const session = await deps.mobile!.getSession(origin);
      await deps.mobile!.clearSession(session?.serviceUrl ?? origin);
    },
  } : undefined);
  const run: { active?: ActiveRun } = {};
  let handle: DataHandle | undefined;
  let handleKey = '';
  let localOpen: Promise<LocalRepo | undefined> | undefined;
  let inflight: Promise<unknown> = Promise.resolve();
  let syncing = false;
  let authExpired = false;
  let lastStatus: SyncStatus | undefined;
  let consentCache = false;
  let audioDeps: AudioDeps | null | undefined;
  const listeners = new Set<(v: SyncView) => void>();
  const dataListeners = new Set<() => void>();
  /** How long a fetched profile is trusted, and whether a live update has declared it stale. */
  const PROFILE_TTL_MS = 10 * 60_000;
  let profileDirty = false;
  let lastProfileTry = 0;
  const disposers: Array<() => void> = [];
  let identityMemo: { expiresAt: number; value: Identity | undefined } | undefined;
  let identityFlight: Promise<Identity | undefined> | undefined;
  let identityRevision = 0;
  let identityMemoAllowed = !deps.local;
  let lastRemoteClient: { baseUrl: string; token?: string; factory: Deps['createApi']; client: RepositoryApi } | undefined;
  const invalidateIdentity = (): void => { identityRevision += 1; identityMemo = undefined; identityFlight = undefined; };
  const changed = (): void => { invalidateIdentity(); hooks.changed(); };

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
    const id = `${deps.mobile?.native && deps.mobile.platform === 'ios' ? 'ios' : 'web'}-${deps.newId()}`;
    await deps.area.set({ [KEYS.device]: id });
    return id;
  }

  function openLocal(): Promise<LocalRepo | undefined> {
    localOpen ??= (async () => {
      if (!deps.local) return undefined;
      try { return await deps.local(); } catch { return undefined; }
    })();
    return localOpen;
  }

  async function mode(): Promise<Mode> {
    if (await state.getSession()) return 'account';
    return (await openLocal()) ? 'device' : 'none';
  }

  /** The Repository client: the account's over HTTP when signed in, else the device's own where there is one, else the service without a token. */
  async function api(): Promise<{ api: RepositoryApi; session: Session | undefined; baseUrl: string }> {
    const [baseUrl, session] = await Promise.all([serviceUrl(), state.getSession()]);
    if (!session) { const l = await openLocal(); if (l) return { api: l.api, session: undefined, baseUrl: '' }; }
    const token = session?.serviceUrl && session.serviceUrl !== baseUrl ? undefined : session?.token;
    let client = lastRemoteClient?.baseUrl === baseUrl && lastRemoteClient.token === token && lastRemoteClient.factory === deps.createApi ? lastRemoteClient.client : undefined;
    if (!client) { client = deps.createApi(baseUrl, token); lastRemoteClient = { baseUrl, token, factory: deps.createApi, client }; }
    return { api: client, session, baseUrl };
  }

  function dropHandle(): void {
    if (handle) { try { handle.sync.stop(); } catch { /* */ } }
    handle = undefined; handleKey = ''; run.active = undefined;
    lastStatus = undefined; syncing = false;
  }

  /** The learner's data on the device alone: the local learner's own queue and log, synchronised with the on-device Repository. */
  async function localData(l: LocalRepo): Promise<DataHandle> {
    const id = await l.identity();
    const key = `device|${id.learnerId}`;
    if (handle && handleKey === key) return handle;
    dropHandle();
    const device = id.deviceId || await deviceId();
    const area = createScopedArea(deps.area, learnerPrefix(id.learnerId));
    const queue = createLocalQueue(area, { now: () => deps.now().getTime() });
    const log = createLocalEventLog(area, { now: () => deps.now().toISOString() });
    const sync = createSyncClient({
      queue, local: log, transport: localTransport(l.api, () => deps.now().toISOString()), deviceId: device, now: () => deps.now().getTime(), area,
      backoff: { baseMs: 2_000, maxMs: SYNC_BACKOFF_MAX_MS }, pullLimit: SYNC_PULL_PAGE,
      onStatus: (s) => { lastStatus = s; notify(); },
    });
    sync.setOnline(true); // the repository is on this device: there is no network to be offline from
    handle = { learnerId: id.learnerId, deviceId: device, area, queue, log, sync };
    handleKey = key;
    if (deps.autoSync) sync.start(30_000); else void syncNow();
    return handle;
  }

  const learnerDataPrefix = (learnerId: string, baseUrl?: string): string => deps.mobile?.native && baseUrl
    ? `u:server:${encodeURIComponent(baseUrl)}:${encodeURIComponent(learnerId)}:`
    : learnerPrefix(learnerId);

  async function data(): Promise<DataHandle | undefined> {
    const { api: client, session, baseUrl } = await api();
    if (!session) {
      const l = await openLocal();
      if (!l) { dropHandle(); return undefined; }
      return localData(l);
    }
    const key = `${session.learnerId}|${session.token}|${baseUrl}`;
    if (handle && handleKey === key) return handle;
    dropHandle();
    const device = await deviceId();
    const area = createScopedArea(deps.area, learnerDataPrefix(session.learnerId, baseUrl));
    const queue = createLocalQueue(area, { now: () => deps.now().getTime() });
    const log = createLocalEventLog(area, { now: () => deps.now().toISOString() });
    const transport = (deps.createTransport ?? defaultTransport)(client);
    const guarded: Transport = {
      async push(req) { try { const r = await transport.push(req); authExpired = false; return r; } catch (e) { noteAuth(e); throw e; } },
      async pull(req) { try { const r = await transport.pull(req); authExpired = false; return r; } catch (e) { noteAuth(e); throw e; } },
    };
    const sync = createSyncClient({
      queue, local: log, transport: guarded, deviceId: device, now: () => deps.now().getTime(), area,
      backoff: { baseMs: 2_000, maxMs: SYNC_BACKOFF_MAX_MS }, pullLimit: SYNC_PULL_PAGE,
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

  /**
   * A new event is sent now, whatever the sync client's backoff says: a learner who answers a card while the service is back must not wait out the
   * minutes a dead service earned. While it keeps failing, a forced attempt is made at most every FORCED_PUSH_GAP_MS (the rest wait for the backoff).
   */
  let lastForcedAt = 0;
  function pushOptions(): { force: boolean } | undefined {
    const at = deps.now().getTime();
    if (lastStatus?.lastError && at - lastForcedAt < FORCED_PUSH_GAP_MS) return undefined;
    lastForcedAt = at;
    return { force: true };
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
    // events from another device arrived: the cached profile (enrolments, languages) may be out of date with them, so the next read asks again
    if (out.pull && out.pull.appended > 0) { profileDirty = true; lastProfileTry = 0; changed(); notifyData(); }
    return out;
  }

  function notifyData(): void { invalidateIdentity(); for (const l of [...dataListeners]) { try { l(); } catch { /* a screen's repaint must not break another */ } } }

  const onOnline = (): void => { if (handle) { handle.sync.setOnline(true); void syncNow({ force: true }); } };
  const onOffline = (): void => { if (handle && !handleKey.startsWith('device|')) handle.sync.setOnline(false); };
  const onResume = (): void => {
    if (!handle) return;
    handle.sync.setOnline(onlineNow());
    if (deps.autoSync) handle.sync.start(30_000);
    profileDirty = true;
    invalidateIdentity();
    lastProfileTry = 0;
    void syncNow({ force: true });
  };
  const onSuspend = (): void => {
    if (!handle) return;
    handle.sync.stop();
  };
  deps.win.addEventListener('online', onOnline);
  deps.win.addEventListener('offline', onOffline);
  deps.win.addEventListener('resume', onResume);
  deps.win.addEventListener('suspend', onSuspend);
  const removeMobileLifecycle = deps.mobile?.native ? deps.mobile.installLifecycle?.(deps.win) : undefined;
  disposers.push(() => { deps.win.removeEventListener('online', onOnline); deps.win.removeEventListener('offline', onOffline); deps.win.removeEventListener('resume', onResume); deps.win.removeEventListener('suspend', onSuspend); removeMobileLifecycle?.(); });

  async function refreshProfile(): Promise<'fresh' | 'cached' | 'none'> {
    const { api: client, session } = await api();
    if (!session) return 'none';
    try {
      const me = await client.me();
      if (me.ok) {
        await state.setProfile({ fetchedAt: deps.now().toISOString(), email: me.data.account.email, learnerId: session.learnerId, enrolments: me.data.enrolments });
        profileDirty = false;
        return 'fresh';
      }
      if (me.status === 401 || me.status === 403) { authExpired = true; notify(); }
    } catch { /* offline: the cache stands */ }
    const cached = await state.getProfile();
    return cached && cached.learnerId === session.learnerId ? 'cached' : 'none';
  }

  /** The device's open enrolments, the ones the learner chose in GoLearn setup first, newest first. */
  async function localEnrolments(l: LocalRepo): Promise<Enrolment[]> {
    try {
      const r = await l.api.listEnrolments();
      if (!r.ok) return [];
      const open = r.data.enrolments.filter((e) => !e.endedAt);
      const chosen = (e: Enrolment): number => (e.goals.length > 0 ? 1 : 0);
      return open.sort((a, b) => chosen(b) - chosen(a) || b.startedAt.localeCompare(a.startedAt));
    } catch { return []; }
  }

  async function enrolments(): Promise<Enrolment[]> {
    const session = await state.getSession();
    if (!session) { const l = await openLocal(); return l ? localEnrolments(l) : []; }
    let profile = await state.getProfile();
    if (!profile || profile.learnerId !== session.learnerId) { await refreshProfile(); profile = await state.getProfile(); }
    else {
      // a cached profile is trusted for ten minutes, and not at all after a live update; offline, the cache stands (one retry in half a minute)
      const age = deps.now().getTime() - Date.parse(profile.fetchedAt);
      const stale = profileDirty || !(age >= 0 && age < PROFILE_TTL_MS);
      const at = deps.now().getTime();
      if (stale && at - lastProfileTry >= 30_000) { lastProfileTry = at; await refreshProfile(); profile = (await state.getProfile()) ?? profile; }
    }
    if (!profile || profile.learnerId !== session.learnerId) return [];
    return profile.enrolments.filter((e) => !e.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /**
   * When each language was last read in: the newest `SelectionLookedUp` (a lookup is the sign of reading) per language, over the learner's whole
   * history, from the local log and, on the device, from the on-device Repository itself (which GoLearn writes to between syncs). Scanned
   * incrementally (only events after the last seen seq), so asking again costs one head read.
   */
  let recentScan: { learnerId: string; logSeq: number; repoSeq: number; byLanguage: Map<string, string> } | undefined;
  async function lastReadAtByLanguage(learnerId: string, local: LocalRepo | undefined): Promise<Map<string, string>> {
    if (!recentScan || recentScan.learnerId !== learnerId) recentScan = { learnerId, logSeq: 0, repoSeq: 0, byLanguage: new Map() };
    const scan = recentScan;
    const note = (e: { kind: string; languageId: string; at: string }): void => {
      if (e.kind !== 'SelectionLookedUp' || typeof e.languageId !== 'string' || Number.isNaN(Date.parse(e.at))) return;
      const cur = scan.byLanguage.get(e.languageId);
      if (cur === undefined || Date.parse(e.at) > Date.parse(cur)) scan.byLanguage.set(e.languageId, e.at);
    };
    try {
      const d = await data();
      if (d && d.learnerId === learnerId) {
        const head = await d.log.head(learnerId);
        if (head < scan.logSeq) { scan.logSeq = 0; scan.byLanguage.clear(); scan.repoSeq = 0; } // the log was cleared
        if (head > scan.logSeq) {
          for (const e of await d.log.list({ learnerId, kinds: ['SelectionLookedUp'], afterSeq: scan.logSeq })) note(e);
          scan.logSeq = head;
        }
      }
    } catch { /* an unreadable log leaves the earlier scan standing */ }
    if (local) {
      try {
        for (let page = 0; page < 200; page++) {
          const r = await local.api.listEvents({ afterSeq: scan.repoSeq, kinds: ['SelectionLookedUp'], limit: 500 });
          if (!r.ok || !r.data.events.length) { if (r.ok && r.data.head < scan.repoSeq) scan.repoSeq = 0; break; }
          for (const e of r.data.events) { note(e); scan.repoSeq = Math.max(scan.repoSeq, e.seq); }
        }
      } catch { /* the repository could not be read: the log's view stands */ }
    }
    return scan.byLanguage;
  }

  /** The enrolment of the language read in most recently, among the learner's enrolments; undefined when none has been read in. */
  async function mostRecentlyRead(learnerId: string, list: Enrolment[], local: LocalRepo | undefined): Promise<Enrolment | undefined> {
    const lastRead = await lastReadAtByLanguage(learnerId, local);
    let best: Enrolment | undefined;
    let bestAt: string | undefined;
    for (const e of list) {
      const at = lastRead.get(e.languageId);
      if (at !== undefined && (bestAt === undefined || Date.parse(at) > Date.parse(bestAt))) { best = e; bestAt = at; }
    }
    return best;
  }

  async function computeIdentity(): Promise<Identity | undefined> {
    const session = await state.getSession();
    // Local Repository enrolments can change in GoLearn without a GoPractice invalidation event.
    // Keep only in-flight deduplication there; remote identities retain the short result memo.
    identityMemoAllowed = !!session || !deps.local;
    if (!session) {
      const l = await openLocal();
      if (!l) return undefined;
      const list = await localEnrolments(l);
      if (!list.length) return undefined;
      const who = await l.identity();
      const wanted = await state.getActive(who.learnerId);
      const chosenInSetup = l.activeLanguageId ? await l.activeLanguageId().catch(() => undefined) : undefined;
      // the learner's own pick in GoPractice, else where they read most recently, else GoLearn's setup choice, else the first
      const picked = list.find((e) => e.enrolmentId === wanted);
      const recent = picked ? undefined : await mostRecentlyRead(who.learnerId, list, l);
      const setup = picked || recent || !chosenInSetup ? undefined : list.find((e) => e.languageId === chosenInSetup);
      const active = picked ?? recent ?? setup ?? list[0];
      return {
        learnerId: who.learnerId, enrolmentId: active.enrolmentId, languageId: active.languageId,
        ...(active.varietyId ? { varietyId: active.varietyId } : {}), deviceId: who.deviceId || await deviceId(), email: '', enrolment: active,
        chosenBy: picked ? 'picked' : recent ? 'recent-reading' : setup ? 'setup' : 'first',
      };
    }
    const list = await enrolments();
    if (!list.length) return undefined;
    const wanted = await state.getActive(session.learnerId);
    const picked = list.find((e) => e.enrolmentId === wanted);
    const recent = picked ? undefined : await mostRecentlyRead(session.learnerId, list, undefined);
    const active = picked ?? recent ?? list[0];
    return {
      learnerId: session.learnerId, enrolmentId: active.enrolmentId, languageId: active.languageId,
      ...(active.varietyId ? { varietyId: active.varietyId } : {}), deviceId: await deviceId(), email: session.email, enrolment: active,
      chosenBy: picked ? 'picked' : recent ? 'recent-reading' : 'first',
    };
  }

  async function identity(): Promise<Identity | undefined> {
    const at = deps.now().getTime();
    if (identityMemoAllowed && identityMemo && at < identityMemo.expiresAt) return identityMemo.value;
    if (identityFlight) return identityFlight;
    const revision = identityRevision;
    const request = computeIdentity();
    identityFlight = request;
    try {
      const value = await request;
      if (revision === identityRevision && identityMemoAllowed && value !== undefined) identityMemo = { expiresAt: deps.now().getTime() + 2_000, value };
      return value;
    } finally {
      if (identityFlight === request) identityFlight = undefined;
    }
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
    serviceUrl, mode, local: openLocal,
    async saveService(baseUrl) {
      let next: string | undefined;
      if (baseUrl !== undefined && baseUrl.trim() !== '') {
        const check = validateServiceUrl(baseUrl);
        if (!check.ok) return { ok: false, message: check.message };
        next = check.url;
      }
      const previousUrl = await serviceUrl();
      const previousSession = deps.mobile?.native ? await state.getSession() : undefined;
      const nextUrl = resolveServiceUrl(next, deps.config);
      if (deps.mobile?.native && previousUrl !== nextUrl) {
        if (previousSession) {
          try { await deps.createApi(previousUrl, previousSession.token).deleteSession(); } catch { /* the old credential is still cleared locally */ }
          try { await state.clearSession(); }
          catch { return { ok: false, message: 'GoReview could not clear the previous sign-in securely. Try again before changing the service address.' }; }
          await state.clearCaches(previousSession.learnerId);
          await removeByPrefix(deps.area, [`gopractice:choices:${previousSession.learnerId}`, `gopractice:prefs:${previousSession.learnerId}:`]);
        }
        dropHandle();
        authExpired = false;
        changed();
      }
      await state.setService(next);
      if (!(deps.mobile?.native && previousUrl !== nextUrl)) invalidateIdentity();
      return { ok: true };
    },
    api, deviceId,
    async accountApi() {
      const [baseUrl, session] = await Promise.all([serviceUrl(), state.getSession()]);
      const token = session?.serviceUrl && session.serviceUrl !== baseUrl ? undefined : session?.token;
      return { client: createAccountClient({ baseUrl, fetch: deps.fetch, token }), session, baseUrl };
    },
    session: () => state.getSession(),
    enrolments, refreshProfile, identity,
    async setLanguage(enrolmentId) {
      const session = await state.getSession();
      const learnerId = session ? session.learnerId : (await (await openLocal())?.identity())?.learnerId;
      if (!learnerId) return false;
      const target = (await enrolments()).find((e) => e.enrolmentId === enrolmentId);
      if (!target) return false;
      await state.setActive(learnerId, enrolmentId);
      changed();
      return true;
    },
    async signIn(input) {
      if (deps.mobile?.native && !deps.mobile.bridgeAvailable) return { ok: false, message: 'Secure sign-in storage is unavailable in this GoReview build.' };
      const baseUrl = await serviceUrl();
      const check = validateServiceUrl(baseUrl);
      if (!check.ok) return { ok: false, message: check.message };
      const email = input.email.trim();
      const device = await deviceId();
      // inside the extension the worker is signed in to the same account first, so that its upload and pull (the device's history) use it
      const l = await openLocal();
      if (l?.connectAccount) {
        const worker = await l.connectAccount({ baseUrl: check.url, email, password: input.password });
        if (!worker.ok) return { ok: false, message: worker.message, ...(worker.code ? { code: worker.code } : {}) };
      }
      let result: ApiResult<{ token: string; learnerId: string; expiresAt: string }>;
      try {
        const platform = deps.mobile?.native ? deps.mobile.platform : 'web';
        result = await deps.createApi(check.url).createSession({ email, password: input.password, deviceId: device, platform });
      } catch {
        return { ok: false, message: `Could not reach the service at ${check.url}. Check that it is running and that the address is right.` };
      }
      if (!result.ok) return { ok: false, message: explainFailure(result, 'signin'), code: result.error };
      const previous = await state.getSession();
      const switched = !!previous && previous.learnerId !== result.data.learnerId;
      // an account switch forgets the cache of the account it replaces; that learner's queued events stay under their own prefix
      if (previous && switched) await state.clearCaches(previous.learnerId);
      else await state.clearProfile();
      dropHandle();
      audioDeps = undefined;
      try { await state.setSession({ token: result.data.token, learnerId: result.data.learnerId, email, expiresAt: result.data.expiresAt, serviceUrl: check.url }); }
      catch { return { ok: false, message: 'GoReview could not save the sign-in securely. Close and reopen the app, then try again.' }; }
      invalidateIdentity();
      authExpired = false;
      await refreshProfile();
      await data();
      // the one-time upload of the device's own history to the account just signed into; a failure never undoes the sign-in
      let uploaded: number | undefined;
      if (l) { try { uploaded = uploadedCount(await l.uploadTo(deps.createApi(check.url, result.data.token))); } catch { uploaded = undefined; } }
      changed();
      return { ok: true, email, switched, ...(uploaded !== undefined ? { uploaded } : {}) };
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
        // back to the device alone: what the account holds comes down first, so nothing done while signed in is missing afterwards
        const l = await openLocal();
        if (l?.pullFrom) { try { const { api: remote } = await api(); await l.pullFrom(remote); } catch { /* the account's rows stay on the account */ } }
        try { const { api: client } = await api(); await client.deleteSession(); } catch { /* the token expires on its own */ }
        if (l?.disconnectAccount) await l.disconnectAccount();
        await state.clearSession();
        await state.clearCaches(session.learnerId);
        if (opts?.forget) await removeByPrefix(deps.area, [learnerDataPrefix(session.learnerId, session.serviceUrl), `gopractice:prefs:${session.learnerId}:`, `gopractice:choices:${session.learnerId}`, `gopractice:decks:${session.learnerId}:`, `gopractice:snapshot:${session.learnerId}:`]);
      }
      dropHandle();
      audioDeps = undefined;
      authExpired = false;
      invalidateIdentity();
      changed();
      return { pendingLeft };
    },
    data,
    async clearLocalData() {
      const l = await openLocal();
      if (!l) return 0;
      const who = await Promise.resolve(l.identity()).catch(() => undefined);
      try { await l.clear(); } catch { /* the rows below are still removed */ }
      let n = 0;
      if (who) n += await removeByPrefix(deps.area, [learnerDataPrefix(who.learnerId, (await state.getSession())?.serviceUrl), `gopractice:prefs:${who.learnerId}:`, `gopractice:choices:${who.learnerId}`, `gopractice:decks:${who.learnerId}:`, `gopractice:snapshot:${who.learnerId}:`]);
      n += await state.clearCaches(who?.learnerId);
      dropHandle();
      changed();
      return n;
    },
    eventContext,
    async events(languageId) {
      const d = await data();
      if (!d) return [];
      const rows = await d.log.list({ learnerId: d.learnerId, ...(languageId ? { languageId } : {}) });
      // Refused submissions remain in the audit log and rejected queue, but must
      // not continue advancing the displayed memory model after a sync conflict.
      const refused = new Set((await d.queue.rejected()).map((r) => r.event.id));
      return rows.filter((e) => !refused.has(e.id));
    },
    async record(events) {
      const out: RecordResult = { queued: 0, duplicates: 0, refused: [] };
      const d = await data();
      if (!d) { for (const e of events) out.refused.push({ id: e.id, issues: ['not signed in'] }); return out; }
      // Validate the whole attempted review before accepting its CardAdded or grade.
      // A refused partner must not leave half a review in the outbound queue.
      for (const e of events) {
        const issues = validateEvent(e);
        if (e.learnerId !== d.learnerId) issues.push({ path: 'learnerId', message: 'does not match this learner' });
        if (issues.length) out.refused.push({ id: e.id, issues: issues.map((i) => `${i.path}: ${i.message}`) });
      }
      if (out.refused.length) return out;
      for (const e of events) {
        const r = await d.queue.enqueue(e);
        if (r.ok) out.queued += 1;
        else if (r.reason === 'duplicate') out.duplicates += 1;
        else { out.refused.push({ id: e.id, issues: r.issues.map((i) => `${i.path}: ${i.message}`) }); continue; }
        await d.log.append(d.learnerId, [e]);
      }
      if (out.queued > 0) notifyData();
      try { lastStatus = await d.sync.status(); notify(); } catch { /* the header may lag one event */ }
      if (deps.autoSync && out.queued) void syncNow(pushOptions());
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
    onData(cb) { dataListeners.add(cb); return () => { dataListeners.delete(cb); }; },
    notifyData,
    invalidateProfile() { profileDirty = true; lastProfileTry = 0; invalidateIdentity(); },
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
    destroy() {
      for (const d of disposers) { try { d(); } catch { /* */ } }
      dropHandle(); listeners.clear(); dataListeners.clear();
      const o = localOpen; localOpen = undefined;
      if (o) void o.then((l) => { try { return l?.close(); } catch { return undefined; } }, () => undefined);
    },
  };
  return ctx;
}

export type { Profile };
