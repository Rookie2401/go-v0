/**
 * The application context handed to every screen: the environment, the storage, the link to the extension's
 * background worker, and the few operations more than one screen needs (service address, API client, sign-in,
 * recording an event, settings).
 *
 * In the extension the background worker owns the Repository connection, so this page asks it (messages are the
 * extension's own, `MSG` in src/platform.ts, all answered for extension pages only):
 *   golearn:connect / golearn:create-account  { baseUrl, email, password }  → the worker signs in and keeps the session
 *   golearn:disconnect                                                      → the worker revokes and drops it
 *   golearn:service-config  { op:'set', baseUrl, assetBase? }               → the service and dictionary addresses
 *   golearn:select-enrolment { enrolmentId }                                → the enrolment events are recorded against
 *   golearn:settings        { op:'set', patch }                             → the privacy switches
 *   golearn:record          { event }                                       → the extension’s own recording path
 *   golearn:status / golearn:sync-now / golearn:clear-local
 * A message nobody answers (an older worker, or no extension) falls back to the same effect on the shared storage; in
 * the hosted web app there is no worker and this page keeps its own session in its origin’s localStorage.
 *
 * An account is optional. The language the learner picks is kept on this device (`golearn:choice`) and as an enrolment in the
 * on-device Repository (`Deps.openLocal`, the local-repository lane); signing in adds a copy on the account and uploads the local
 * history once. Signing out returns to the device alone and removes nothing.
 */
import { validateEvent, type Enrolment, type GoEvent } from '../../repository-contract/src';
import type { EnrolInput, RepositoryApi } from '../../repository-service/src/api';
import { MSG } from '../src/platform';
import type { PageStatus } from '../src/protocol';
import { LOCAL_IDENTITY, createStorageEncounterStore, getDeviceId } from '../src/store';
import { resolveServiceUrl, validateServiceUrl } from './config';
import { createAccountClient, type AccountClient } from './accountClient';
import { explainFailure } from './errors';
import { uploadedCount, type LocalRepo } from './localRepo';
import type { Deps, PackView } from './ports';
import { createStateStore, type ActiveChoice, type ExplanationDepth, type Session, type Settings, type StateStore } from './state';

export type RecordResult = 'recorded' | 'duplicate' | 'failed';

export interface BackgroundReply<T = unknown> { answered: boolean; value?: T }

export interface AppIdentity { learnerId: string; enrolmentId: string; deviceId: string; signedIn: boolean }

/** `uploaded`: how many events of this device’s history went to the account at sign-in (absent when nothing was uploaded or it could not be counted). */
export type SignInResult =
  | { ok: true; email: string; uploaded?: number; /** Account creation: the service said whether it sent the confirmation email. */ verificationSent?: boolean }
  | { ok: false; message: string; /** The service’s error code (`email-unverified` …), when it gave one. */ code?: string };

export type ChooseResult =
  | { ok: true; choice: ActiveChoice; /** where the choice now lives */ where: 'device' | 'account'; /** the account copy failed; the device copy stands */ accountProblem?: string }
  | { ok: false; message: string };
export type Saved = { ok: true } | { ok: false; message: string };

export interface AppContext {
  deps: Deps;
  state: StateStore;
  inExtension: boolean;
  /** Ask the background worker; `answered: false` when there is no extension, no listener or no reply in time. */
  ask<T = unknown>(message: Record<string, unknown>, timeoutMs?: number): Promise<BackgroundReply<T>>;
  serviceUrl(): Promise<string>;
  /** The service address and the dictionary address as stored (the latter may be unset). */
  saveService(baseUrl: string | undefined, assetBase?: string | null): Promise<Saved>;
  api(): Promise<{ api: RepositoryApi; session: Session | undefined; baseUrl: string }>;
  /** The account-hardening routes (confirmation, reset, sessions, export, deletion) on the service address, with the session’s token when there is one. */
  accountApi(): Promise<{ client: AccountClient; session: Session | undefined; baseUrl: string }>;
  /** The on-device Repository, opened once on this page’s storage area; undefined where none is available. */
  local(): Promise<LocalRepo | undefined>;
  /** The language this device reads: the learner’s choice, or (signed in, nothing chosen here) the account’s active enrolment. */
  activeLanguage(): Promise<ActiveChoice | undefined>;
  /** The languages enrolled on this device (the local Repository’s open enrolments). */
  localEnrolments(): Promise<Enrolment[]>;
  /** Pick a language: an enrolment in the on-device Repository (no account needed) and, when signed in, one on the account too. */
  chooseLanguage(input: { pack: PackView; varietyId?: string; standard?: 'nb' | 'nn' }): Promise<ChooseResult>;
  /** Switch to another enrolment already held on this device. */
  useEnrolment(e: Pick<Enrolment, 'enrolmentId' | 'languageId'> & Partial<Pick<Enrolment, 'varietyId' | 'packId'>>): Promise<void>;
  /**
   * Take a language off this device: its open enrolment in the on-device Repository ends (what was recorded stays under it, and the
   * installed pack stays too). If it was the language being read, the next one still enrolled here takes over, else none is. The account
   * copy is not touched.
   */
  removeEnrolment(e: Pick<Enrolment, 'enrolmentId' | 'languageId'>): Promise<void>;
  /** The one-time upload of this device’s history to the account just signed into; undefined when there is no local Repository or it failed. */
  uploadLocal(): Promise<number | undefined>;
  /** Release what the context holds open (the on-device Repository). */
  destroy(): void;
  deviceId(): Promise<string>;
  identity(): Promise<AppIdentity>;
  /** Sign in (or create the account and sign in). A different sign-in replaces the old session and clears the cached profile. */
  signIn(input: { email: string; password: string; create: boolean; /** The name for a new account's learner record. */ displayName?: string }): Promise<SignInResult>;
  /** Sign out of this device: the service session is revoked when reachable; the local session and cached profile go either way. */
  signOut(): Promise<void>;
  /** Make this enrolment the one events are recorded against. */
  adoptEnrolment(e: Pick<Enrolment, 'enrolmentId' | 'languageId'>): Promise<void>;
  setSettings(patch: Partial<Settings> & { explanationDepth?: ExplanationDepth | undefined }): Promise<Settings>;
  clearLocal(): Promise<number>;
  pageStatus(): Promise<PageStatus | undefined>;
  record(event: GoEvent): Promise<RecordResult>;
  go(route: string): void;
  /** A screen changed something the navigation’s completion marks depend on. */
  changed(): void;
}

const ASK_TIMEOUT_MS = 4000;
const SIGN_IN_TIMEOUT_MS = 30_000;

export function createContext(deps: Deps, hooks: { go(route: string): void; changed(): void }): AppContext {
  const state = createStateStore(deps.area);
  const inExtension = !!deps.chrome;

  async function ask<T>(message: Record<string, unknown>, timeoutMs = ASK_TIMEOUT_MS): Promise<BackgroundReply<T>> {
    if (!deps.chrome) return { answered: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reply = await Promise.race([
        deps.chrome.runtime.sendMessage(message),
        new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs); }),
      ]);
      return reply === undefined ? { answered: false } : { answered: true, value: reply as T };
    } catch { return { answered: false }; } finally { clearTimeout(timer); }
  }
  const okOf = (r: BackgroundReply): boolean => r.answered && !!r.value && typeof r.value === 'object' && (r.value as { ok?: unknown }).ok === true;
  const messageOf = (r: BackgroundReply, fallback: string): string => {
    const m = (r.value as { message?: unknown } | undefined)?.message;
    return typeof m === 'string' && m ? m : fallback;
  };

  /** Sign-in without a background worker: the typed API client from this page, the session in the shared storage. */
  async function directSignIn(input: { email: string; password: string; create: boolean; displayName?: string }, baseUrl: string): Promise<SignInResult> {
    try {
      const api = deps.createApi(baseUrl);
      let sent: unknown;
      if (input.create) {
        const made = await api.createAccount({ email: input.email, password: input.password, ...(input.displayName ? { displayName: input.displayName } : {}) });
        if (!made.ok) return { ok: false, message: explainFailure(made, 'create'), code: made.error };
        sent = (made.data as { verificationSent?: unknown } | null)?.verificationSent;
      }
      const device = await getDeviceId(deps.area);
      const made = await api.createSession({ email: input.email, password: input.password, deviceId: device, platform: inExtension ? 'chrome-extension' : 'web' });
      if (!made.ok) return { ok: false, message: explainFailure(made, 'signin'), code: made.error };
      // an enrolment already on the account is adopted as the active one (the newest that has not ended)
      const enrolments = await api.listEnrolments();
      const active = enrolments.ok ? [...enrolments.data.enrolments].filter((e) => !e.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] : undefined;
      await state.clearProfile();
      await state.setSession({
        token: made.data.token, learnerId: made.data.learnerId, enrolmentId: active?.enrolmentId ?? '', languageId: active?.languageId ?? '',
        expiresAt: made.data.expiresAt, email: input.email,
      });
      return { ok: true, email: input.email, ...(typeof sent === 'boolean' ? { verificationSent: sent } : {}) };
    } catch {
      return { ok: false, message: `Could not reach the service at ${baseUrl}. Check that it is running and that the address is right.` };
    }
  }

  // ── the on-device Repository (opened once; undefined where there is none)
  let localOpen: Promise<LocalRepo | undefined> | undefined;
  const openLocal = (): Promise<LocalRepo | undefined> => {
    localOpen ??= (async () => {
      if (!deps.openLocal) return undefined;
      try { return await deps.openLocal({ area: deps.area, chrome: deps.chrome }); } catch { return undefined; }
    })();
    return localOpen;
  };
  async function localLearnerId(): Promise<string> {
    const l = await openLocal();
    if (l) { try { const i = await l.identity(); if (i?.learnerId) return i.learnerId; } catch { /* the default stands */ } }
    return LOCAL_IDENTITY.learnerId;
  }
  const tell = <T>(v: Promise<T>): Promise<T | undefined> => v.catch(() => undefined);

  /** Make sure the account holds an enrolment for the chosen language and make it the one the background records against. */
  async function enrolOnAccount(input: EnrolInput): Promise<{ ok: true } | { ok: false; message: string }> {
    const { api } = await ctx.api();
    try {
      const list = await api.listEnrolments();
      let found = list.ok ? list.data.enrolments.find((e) => !e.endedAt && e.languageId === input.languageId && (e.varietyId ?? '') === (input.varietyId ?? '')) : undefined;
      if (!found) {
        const made = await api.enrol(input);
        if (!made.ok) return { ok: false, message: made.status === 401 ? 'Your session is no longer valid. Sign in again.' : made.message || `The service answered ${made.status}.` };
        found = made.data.enrolment;
      }
      await ctx.adoptEnrolment(found);
      return { ok: true };
    } catch {
      return { ok: false, message: 'The service could not be reached.' };
    }
  }

  const inputOf = (c: ActiveChoice, pack: PackView | undefined): EnrolInput | undefined => (pack
    ? { languageId: pack.languageId, ...(c.varietyId ? { varietyId: c.varietyId } : {}), scriptId: pack.scriptId, packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] }
    : undefined);

  async function afterSignIn(known: number | undefined): Promise<number | undefined> {
    let uploaded = known;
    if (uploaded === undefined) {
      const local = await openLocal();
      if (local) {
        try { const { api } = await ctx.api(); uploaded = uploadedCount(await local.uploadTo(api)); } catch { uploaded = undefined; }
      }
    }
    // the language chosen on this device is also an enrolment on the account
    const choice = await state.getChoice();
    const input = choice ? inputOf(choice, deps.packs.packFor(choice.languageId)) : undefined;
    if (input) await enrolOnAccount(input).catch(() => undefined);
    return uploaded;
  }

  const ctx: AppContext = {
    deps, state, inExtension, ask,
    local: openLocal,
    async activeLanguage() {
      const c = await state.getChoice();
      if (c) return c;
      const s = await state.getSession();
      return s?.languageId ? { enrolmentId: s.enrolmentId, languageId: s.languageId } : undefined;
    },
    async localEnrolments() {
      const l = await openLocal();
      if (!l) return [];
      try {
        const r = await l.api.listEnrolments();
        return r.ok ? r.data.enrolments.filter((e) => !e.endedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt)) : [];
      } catch { return []; }
    },
    async chooseLanguage({ pack, varietyId, standard }) {
      if (pack.status !== 'installable') return { ok: false, message: `${pack.name} is planned, not installable yet, so it cannot be chosen.` };
      const analysed = pack.varieties.filter((v) => v.analysed);
      const variety = varietyId && analysed.some((v) => v.varietyId === varietyId) ? varietyId : pack.defaultVarietyId;
      const input: EnrolInput = { languageId: pack.languageId, varietyId: variety, scriptId: pack.scriptId, packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] };
      let enrolmentId = `local-enrolment:${pack.languageId}:${variety}`;
      const local = await openLocal();
      if (local) {
        try {
          const have = await local.api.listEnrolments();
          const open = have.ok ? have.data.enrolments.filter((e) => !e.endedAt && e.languageId === pack.languageId) : [];
          const same = open.find((e) => (e.varietyId ?? '') === variety);
          if (same) { enrolmentId = same.enrolmentId; await local.select?.(same.enrolmentId); }
          else {
            // a different preference for the same language replaces the earlier one (its events stay under it)
            for (const other of open) await local.api.endEnrolment(other.enrolmentId);
            if (local.enrol) enrolmentId = (await local.enrol(input)).enrolmentId; // the worker makes it the active one
            else {
              const made = await local.api.enrol(input);
              if (!made.ok) return { ok: false, message: made.message || `The on-device record refused the enrolment (${made.status}).` };
              enrolmentId = made.data.enrolment.enrolmentId;
            }
          }
        } catch (e) { return { ok: false, message: `The enrolment could not be saved on this device: ${e instanceof Error ? e.message : String(e)}` }; }
      }
      const choice: ActiveChoice = { enrolmentId, languageId: pack.languageId, varietyId: variety, packId: pack.packId, ...(standard ? { standard } : {}) };
      await state.setChoice(choice);
      const session = await state.getSession();
      if (!session) {
        hooks.changed();
        return { ok: true, choice, where: 'device' };
      }
      const account = await enrolOnAccount(input);
      hooks.changed();
      return account.ok ? { ok: true, choice, where: 'account' } : { ok: true, choice, where: 'device', accountProblem: account.message };
    },
    async useEnrolment(e) {
      const pack = deps.packs.packFor(e.languageId);
      const standard = pack?.varieties.find((v) => v.varietyId === e.varietyId)?.writtenStandard ?? (e.languageId === 'nb' || e.languageId === 'nn' ? e.languageId : undefined);
      const choice: ActiveChoice = { enrolmentId: e.enrolmentId, languageId: e.languageId, ...(e.varietyId ? { varietyId: e.varietyId } : {}), ...(e.packId ? { packId: e.packId } : pack ? { packId: pack.packId } : {}), ...(standard ? { standard } : {}) };
      await state.setChoice(choice);
      if (await state.getSession()) {
        const input = inputOf(choice, pack);
        if (input) await enrolOnAccount(input);
      }
      // the worker records against the active enrolment of the on-device Repository
      const local = await openLocal();
      if (local?.select) await tell(Promise.resolve(local.select(e.enrolmentId)));
      hooks.changed();
    },
    async removeEnrolment(e) {
      const local = await openLocal();
      if (local) { try { await local.api.endEnrolment(e.enrolmentId); } catch { /* the choice below is cleared either way */ } }
      const choice = await state.getChoice();
      if (choice?.enrolmentId === e.enrolmentId) {
        await state.clearChoice();
        const rest = (await ctx.localEnrolments()).filter((x) => x.enrolmentId !== e.enrolmentId);
        const next = rest[rest.length - 1];
        if (next) await ctx.useEnrolment(next);
      }
      hooks.changed();
    },
    async uploadLocal() {
      const local = await openLocal();
      if (!local) return undefined;
      try { const { api } = await ctx.api(); return uploadedCount(await local.uploadTo(api)); } catch { return undefined; }
    },
    destroy() { const o = localOpen; localOpen = undefined; if (o) void o.then((l) => { try { return l?.close(); } catch { return undefined; } }, () => undefined); },
    async serviceUrl() {
      const stored = await state.getService();
      return resolveServiceUrl(stored?.baseUrl, deps.config);
    },
    async saveService(baseUrl, assetBase) {
      const cur = await state.getService();
      const base = baseUrl ?? resolveServiceUrl(undefined, deps.config);
      const check = validateServiceUrl(base);
      if (!check.ok) return { ok: false, message: check.message };
      let asset: string | undefined = assetBase === undefined ? cur?.assetBase : assetBase === null || assetBase === '' ? undefined : assetBase;
      if (asset !== undefined) {
        const a = validateServiceUrl(asset);
        if (!a.ok) return { ok: false, message: `Dictionary address: ${a.message}` };
        asset = a.url;
      }
      if (inExtension) {
        const r = await ask<{ ok?: boolean; message?: string }>({ type: MSG.serviceConfig, op: 'set', baseUrl: check.url, ...(asset ? { assetBase: asset } : {}) });
        if (r.answered && (r.value as { ok?: boolean } | undefined)?.ok === false) return { ok: false, message: messageOf(r, 'The extension did not accept that address.') };
        if (okOf(r)) return { ok: true };
      }
      await state.setService({ baseUrl: check.url, ...(asset ? { assetBase: asset } : {}) });
      return { ok: true };
    },
    async api() {
      const [baseUrl, session] = await Promise.all([ctx.serviceUrl(), state.getSession()]);
      return { api: deps.createApi(baseUrl, session?.token), session, baseUrl };
    },
    async accountApi() {
      const [baseUrl, session] = await Promise.all([ctx.serviceUrl(), state.getSession()]);
      return { client: createAccountClient({ baseUrl, fetch: deps.fetch, token: session?.token }), session, baseUrl };
    },
    deviceId: () => getDeviceId(deps.area),
    async identity() {
      const [session, deviceId] = await Promise.all([state.getSession(), ctx.deviceId()]);
      if (session && session.enrolmentId) return { learnerId: session.learnerId, enrolmentId: session.enrolmentId, deviceId, signedIn: true };
      const choice = await state.getChoice();
      return { learnerId: await localLearnerId(), enrolmentId: choice?.enrolmentId ?? LOCAL_IDENTITY.enrolmentId, deviceId, signedIn: false };
    },
    async signIn(input) {
      const baseUrl = await ctx.serviceUrl();
      const check = validateServiceUrl(baseUrl);
      if (!check.ok) return { ok: false, message: check.message };
      const email = input.email.trim();
      if (inExtension) {
        const r = await ask<{ ok?: boolean; message?: string }>(
          { type: input.create ? MSG.createAccount : MSG.connect, baseUrl: check.url, email, password: input.password, ...(input.create && input.displayName ? { displayName: input.displayName } : {}) }, SIGN_IN_TIMEOUT_MS);
        if (r.answered && r.value && typeof (r.value as { ok?: unknown }).ok === 'boolean') {
          if (okOf(r)) {
            await state.clearProfile();
            // the worker uploads the device’s history itself and may say how many; otherwise this page does
            const said = (r.value as { uploaded?: unknown }).uploaded;
            const uploaded = await afterSignIn(typeof said === 'number' ? said : undefined);
            hooks.changed();
            const sent = (r.value as { verificationSent?: unknown }).verificationSent;
            return { ok: true, email, ...(uploaded !== undefined ? { uploaded } : {}), ...(typeof sent === 'boolean' ? { verificationSent: sent } : {}) };
          }
          const code = (r.value as { error?: unknown }).error;
          return { ok: false, message: messageOf(r, 'The extension could not sign you in.'), ...(typeof code === 'string' ? { code } : {}) };
        }
        // the worker did not answer: sign in from this page and write the session the worker reads
      }
      const out = await directSignIn({ ...input, email }, check.url);
      if (!out.ok) return out;
      const uploaded = await afterSignIn(undefined);
      hooks.changed();
      return { ...out, ...(uploaded !== undefined ? { uploaded } : {}) };
    },
    async signOut() {
      await state.clearProfile();
      if (inExtension) {
        const r = await ask({ type: MSG.disconnect });
        if (okOf(r)) { hooks.changed(); return; }
      }
      const s = await state.getSession();
      if (s) { const { api } = await ctx.api(); await api.deleteSession().catch(() => undefined); }
      await state.clearSession();
      hooks.changed();
    },
    async adoptEnrolment(e) {
      if (inExtension) {
        const r = await ask({ type: MSG.selectEnrolment, enrolmentId: e.enrolmentId });
        if (okOf(r)) { hooks.changed(); return; }
      }
      const s = await state.getSession();
      if (s) await state.setSession({ ...s, enrolmentId: e.enrolmentId, languageId: e.languageId });
      hooks.changed();
    },
    async setSettings(patch) {
      if (inExtension) {
        const wire: Record<string, unknown> = { ...patch };
        if ('explanationDepth' in patch && patch.explanationDepth === undefined) wire.explanationDepth = null;
        const r = await ask<{ ok?: boolean; settings?: Settings }>({ type: MSG.settings, op: 'set', patch: wire });
        if (okOf(r) && (r.value as { settings?: Settings }).settings) return (r.value as { settings: Settings }).settings;
      }
      return state.patchSettings(patch);
    },
    async clearLocal() {
      // explicit, never a side effect of signing out: the encounter rows, the queue and the on-device Repository
      const local = await openLocal();
      if (local) { try { await local.clear(); } catch { /* the rows below are still removed */ } }
      if (inExtension) {
        const r = await ask<{ ok?: boolean; events?: number; metrics?: number; queued?: number }>({ type: MSG.clearLocal });
        if (okOf(r)) { const v = r.value!; return (v.events ?? 0) + (v.metrics ?? 0) + (v.queued ?? 0); }
      }
      return createStorageEncounterStore(deps.area).clear();
    },
    async pageStatus() {
      const r = await ask<PageStatus>({ type: MSG.status });
      return r.answered && r.value && typeof r.value === 'object' && (r.value as { ok?: unknown }).ok === true ? r.value : undefined;
    },
    async record(event) {
      if (validateEvent(event).length) return 'failed';
      if (inExtension) {
        const r = await ask<{ ok?: boolean; duplicate?: boolean }>({ type: MSG.record, event });
        if (r.answered && r.value && typeof r.value === 'object') return (r.value as { ok?: boolean }).ok === true ? ((r.value as { duplicate?: boolean }).duplicate ? 'duplicate' : 'recorded') : 'failed';
      }
      // web context, or an extension whose worker does not answer: the same store the extension writes
      const res = await createStorageEncounterStore(deps.area).append(event);
      return res.ok ? (res.duplicate ? 'duplicate' : 'recorded') : 'failed';
    },
    go: hooks.go,
    changed: hooks.changed,
  };
  return ctx;
}
