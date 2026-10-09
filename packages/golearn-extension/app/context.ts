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
 */
import { validateEvent, type Enrolment, type GoEvent } from '../../repository-contract/src';
import type { RepositoryApi } from '../../repository-service/src/api';
import { MSG } from '../src/platform';
import type { PageStatus } from '../src/protocol';
import { LOCAL_IDENTITY, createStorageEncounterStore, getDeviceId } from '../src/store';
import { resolveServiceUrl, validateServiceUrl } from './config';
import { explainFailure } from './errors';
import type { Deps } from './ports';
import { createStateStore, type ExplanationDepth, type Session, type Settings, type StateStore } from './state';

export type RecordResult = 'recorded' | 'duplicate' | 'failed';

export interface BackgroundReply<T = unknown> { answered: boolean; value?: T }

export interface AppIdentity { learnerId: string; enrolmentId: string; deviceId: string; signedIn: boolean }

export type SignInResult = { ok: true; email: string } | { ok: false; message: string };
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
  deviceId(): Promise<string>;
  identity(): Promise<AppIdentity>;
  /** Sign in (or create the account and sign in). A different sign-in replaces the old session and clears the cached profile. */
  signIn(input: { email: string; password: string; create: boolean }): Promise<SignInResult>;
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
  async function directSignIn(input: { email: string; password: string; create: boolean }, baseUrl: string): Promise<SignInResult> {
    try {
      const api = deps.createApi(baseUrl);
      if (input.create) {
        const made = await api.createAccount({ email: input.email, password: input.password });
        if (!made.ok) return { ok: false, message: explainFailure(made, 'create') };
      }
      const device = await getDeviceId(deps.area);
      const made = await api.createSession({ email: input.email, password: input.password, deviceId: device, platform: inExtension ? 'chrome-extension' : 'web' });
      if (!made.ok) return { ok: false, message: explainFailure(made, 'signin') };
      // an enrolment already on the account is adopted as the active one (the newest that has not ended)
      const enrolments = await api.listEnrolments();
      const active = enrolments.ok ? [...enrolments.data.enrolments].filter((e) => !e.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] : undefined;
      await state.clearProfile();
      await state.setSession({
        token: made.data.token, learnerId: made.data.learnerId, enrolmentId: active?.enrolmentId ?? '', languageId: active?.languageId ?? '',
        expiresAt: made.data.expiresAt, email: input.email,
      });
      return { ok: true, email: input.email };
    } catch {
      return { ok: false, message: `Could not reach the service at ${baseUrl}. Check that it is running and that the address is right.` };
    }
  }

  const ctx: AppContext = {
    deps, state, inExtension, ask,
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
    deviceId: () => getDeviceId(deps.area),
    async identity() {
      const [session, deviceId] = await Promise.all([state.getSession(), ctx.deviceId()]);
      if (session && session.enrolmentId) return { learnerId: session.learnerId, enrolmentId: session.enrolmentId, deviceId, signedIn: true };
      return { learnerId: LOCAL_IDENTITY.learnerId, enrolmentId: LOCAL_IDENTITY.enrolmentId, deviceId, signedIn: false };
    },
    async signIn(input) {
      const baseUrl = await ctx.serviceUrl();
      const check = validateServiceUrl(baseUrl);
      if (!check.ok) return { ok: false, message: check.message };
      const email = input.email.trim();
      if (inExtension) {
        const r = await ask<{ ok?: boolean; message?: string }>(
          { type: input.create ? MSG.createAccount : MSG.connect, baseUrl: check.url, email, password: input.password }, SIGN_IN_TIMEOUT_MS);
        if (r.answered && r.value && typeof (r.value as { ok?: unknown }).ok === 'boolean') {
          if (okOf(r)) { await state.clearProfile(); hooks.changed(); return { ok: true, email }; }
          return { ok: false, message: messageOf(r, 'The extension could not sign you in.') };
        }
        // the worker did not answer: sign in from this page and write the session the worker reads
      }
      const out = await directSignIn({ ...input, email }, check.url);
      if (out.ok) hooks.changed();
      return out;
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
