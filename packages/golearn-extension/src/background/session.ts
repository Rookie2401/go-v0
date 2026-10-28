/**
 * The Repository connection. It lives ONLY in the background worker:
 *
 *   chrome.storage.local  golearn:service  { baseUrl, assetBase? }
 *   chrome.storage.local  golearn:session  { token, learnerId, enrolmentId?, languageId?, expiresAt, email }
 *
 * Nothing here is ever put in a message to a content script, in a page, in a log or in a status reply. The token is read
 * from storage for each call (a service worker may be restarted at any time) and handed only to the typed API client.
 * The service address must be https, or http on a loopback host (a local development service). When the extension ships one
 * (app/config.json, `shippedBaseUrl`) that is the address in use; what golearn:service holds is never used in its place (2026-10-28).
 */
import { createRepositoryApi, type ApiResult, type MeResponse, type RepositoryApi } from '../../../repository-service/src/api';
import type { Enrolment, LearningGoal } from '../../../repository-contract/src';
import type { StorageArea } from '../platform';

export const SERVICE_KEY = 'golearn:service';
export const SESSION_KEY = 'golearn:session';
/** A sign-out that could not tell the service keeps ONLY the token it must still revoke, here, until the revocation succeeds (audit P-08). */
export const PENDING_REVOKE_KEY = 'golearn:pending-revoke';

export interface ServiceConfig {
  /** The Repository service. */
  baseUrl: string;
  /** Where dictionary shards are fetched from (the service's or the Pages site's assets). Defaults to `baseUrl`. */
  assetBase?: string;
}

export interface SessionRecord {
  token: string;
  learnerId: string;
  /** The enrolment events are recorded against; absent until the learner has enrolled in a language. */
  enrolmentId?: string;
  languageId?: string;
  expiresAt: string;
  email: string;
}

/** What may be said about a session outside the background: no token, no learner id. */
export interface SessionStatus {
  connected: boolean;
  /** The stored session has passed its expiry (the service will answer 401). */
  expired: boolean;
  email?: string;
  languageId?: string;
  hasEnrolment: boolean;
  /** The last sign-out could not reach the service: its session is still alive there and is revoked at the next connection. */
  revocationPending?: boolean;
  expiresAt?: string;
  baseUrl?: string;
  assetBase?: string;
}

export type Failure = { ok: false; error: string; message: string };
export type SessionResult = { ok: true; status: SessionStatus; /** Account creation only: the service said whether it sent the confirmation email. */ verificationSent?: boolean } | Failure;

export interface ConnectInput { baseUrl: string; email: string; password: string; deviceId: string }
export interface CreateAccountInput extends ConnectInput { displayName?: string }
export interface EnrolInput { languageId: string; packId: string; packVersion: string; goals: LearningGoal[]; varietyId?: string; scriptId?: string; teamId?: string }

export interface SessionManagerOptions {
  /** This extension's id: the dictionary may also be served from its own origin (chrome-extension://<id>/). */
  extensionId?: string;
  area: StorageArea;
  fetch: typeof fetch;
  /** The service address the extension ships with; when it gives one, that is the address in use (2026-10-28). */
  shippedBaseUrl?: () => Promise<string | undefined>;
  now?: () => number;
  /** Whether a language has an installable pack (the choice of enrolment prefers one that has). */
  packAvailable?: (languageId: string) => boolean;
  /** Called after a successful sign-in (re-attribute the queue, start syncing). */
  onConnect?: (s: SessionRecord) => Promise<void> | void;
  /** Called after sign-out. */
  onDisconnect?: () => Promise<void> | void;
  /** Called when the enrolment or language of the session changed. */
  onEnrolmentChange?: (s: SessionRecord) => Promise<void> | void;
}

/** The address check: https, or http on localhost / 127.0.0.1 / [::1] / *.localhost; no credentials in the URL. */
export function validateBaseUrl(raw: unknown): { ok: true; url: string } | Failure {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'invalid-url', message: 'Enter the address of the GoLearn service.' };
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, error: 'invalid-url', message: 'That is not a web address.' }; }
  const host = u.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' || host.endsWith('.localhost');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) {
    return { ok: false, error: 'insecure-url', message: 'The service address must start with https:// (http:// is allowed only for localhost).' };
  }
  if (u.username || u.password) return { ok: false, error: 'invalid-url', message: 'The service address must not contain a user name or password.' };
  const path = u.pathname.replace(/\/+$/, '');
  return { ok: true, url: `${u.protocol}//${u.host}${path}` };
}

/** A dictionary location: a service-style address, or this extension's own origin (the setup build packages dict/<lang> inside it). Other schemes and non-localhost http stay refused. */
export function validateAssetBase(raw: unknown, extensionId?: string): { ok: true; url: string } | Failure {
  if (typeof raw === 'string' && extensionId) {
    const own = `chrome-extension://${extensionId}`;
    const t = raw.trim();
    if (t === own || t.startsWith(own + '/')) return { ok: true, url: t.replace(/[?#].*$/, '').replace(/\/+$/, '') };
  }
  return validateBaseUrl(raw);
}

/** The enrolment events are recorded against: an open one, preferring a language with a pack, then the most recent. */
export function pickEnrolment(enrolments: Enrolment[], packAvailable: (languageId: string) => boolean = () => true): Enrolment | undefined {
  const open = enrolments.filter((e) => !e.endedAt);
  const ranked = [...open].sort((a, b) => Number(packAvailable(b.languageId)) - Number(packAvailable(a.languageId)) || b.startedAt.localeCompare(a.startedAt));
  return ranked[0];
}

const fail = (error: string, message: string): Failure => ({ ok: false, error, message });
const fromApi = (r: Extract<ApiResult<unknown>, { ok: false }>): Failure => {
  const msg =
    r.status === 401 ? 'The email or password was not accepted.'
    : r.status === 429 ? 'Too many sign-in attempts. Wait a few minutes and try again.'
    : r.status === 409 ? 'An account with that email already exists.'
    : r.status === 403 && r.error === 'email-unverified' ? (r.message || 'Confirm your email address first: open the link in the email GoLearn sent you, or ask for it again.')
    : r.status === 422 && r.error === 'weak-password' ? 'The password must be at least 10 characters.'
    : r.message || 'The service refused the request.';
  return fail(r.error, msg);
};

export function createSessionManager(opts: SessionManagerOptions) {
  const { area } = opts;
  const now = opts.now ?? Date.now;
  const packAvailable = opts.packAvailable ?? (() => true);

  const readService = async (): Promise<ServiceConfig | undefined> => {
    const v = (await area.get(SERVICE_KEY))[SERVICE_KEY] as Partial<ServiceConfig> | undefined;
    if (!v || typeof v.baseUrl !== 'string') return undefined;
    // the extension's own address wins over a stored one (an earlier build's, or the field that existed until 2026-10-28)
    const shipped = validateBaseUrl(await opts.shippedBaseUrl?.());
    const ok = shipped.ok ? shipped : validateBaseUrl(v.baseUrl); // never trust what is in storage either
    if (!ok.ok) return undefined;
    return { baseUrl: ok.url, ...(typeof v.assetBase === 'string' && validateAssetBase(v.assetBase, opts.extensionId).ok ? { assetBase: v.assetBase } : {}) };
  };
  const readSession = async (): Promise<SessionRecord | undefined> => {
    const v = (await area.get(SESSION_KEY))[SESSION_KEY] as Partial<SessionRecord> | undefined;
    if (!v || typeof v.token !== 'string' || typeof v.learnerId !== 'string' || typeof v.expiresAt !== 'string' || typeof v.email !== 'string') return undefined;
    return v as SessionRecord;
  };
  const isExpired = (s: SessionRecord): boolean => { const t = Date.parse(s.expiresAt); return Number.isFinite(t) && t <= now(); };

  const apiFor = (baseUrl: string, token?: string): RepositoryApi => createRepositoryApi({ baseUrl, fetch: opts.fetch, token });

  async function status(): Promise<SessionStatus> {
    const [svc, s, pending] = await Promise.all([readService(), readSession(), area.get(PENDING_REVOKE_KEY)]);
    return {
      ...(pending[PENDING_REVOKE_KEY] ? { revocationPending: true } : {}),
      connected: !!s, expired: s ? isExpired(s) : false, email: s?.email, languageId: s?.languageId, hasEnrolment: !!s?.enrolmentId,
      expiresAt: s?.expiresAt, baseUrl: svc?.baseUrl, assetBase: svc?.assetBase,
    };
  }

  async function setService(input: { baseUrl: string; assetBase?: string }): Promise<SessionResult> {
    const base = validateBaseUrl(input.baseUrl);
    if (!base.ok) return base;
    let assetBase: string | undefined;
    if (input.assetBase !== undefined && input.assetBase !== '') {
      const a = validateAssetBase(input.assetBase, opts.extensionId);
      if (!a.ok) return fail(a.error, `Dictionary address: ${a.message}`);
      assetBase = a.url;
    }
    await area.set({ [SERVICE_KEY]: { baseUrl: base.url, ...(assetBase ? { assetBase } : {}) } satisfies ServiceConfig });
    return { ok: true, status: await status() };
  }

  async function signedIn(baseUrl: string, api: RepositoryApi, token: string, learnerId: string, expiresAt: string, email: string): Promise<SessionResult> {
    // enrolment: best effort; a learner who has not enrolled yet is connected without one
    let enrolment: Enrolment | undefined;
    try { const me = await api.me(); if (me.ok) enrolment = pickEnrolment((me.data as MeResponse).enrolments, packAvailable); } catch { /* connected without an enrolment */ }
    const record: SessionRecord = { token, learnerId, expiresAt, email, ...(enrolment ? { enrolmentId: enrolment.enrolmentId, languageId: enrolment.languageId } : {}) };
    const prev = (await readService()) ?? { baseUrl };
    await area.set({ [SESSION_KEY]: record, [SERVICE_KEY]: { ...prev, baseUrl } satisfies ServiceConfig });
    await opts.onConnect?.(record);
    return { ok: true, status: await status() };
  }

  async function connect(input: ConnectInput): Promise<SessionResult> {
    const base = validateBaseUrl(input.baseUrl);
    if (!base.ok) return base;
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!email || typeof input.password !== 'string' || !input.password) return fail('invalid-input', 'Enter your email and password.');
    const api = apiFor(base.url);
    let r: ApiResult<{ token: string; learnerId: string; expiresAt: string }>;
    try { r = await api.createSession({ email, password: input.password, deviceId: input.deviceId, platform: 'chrome-extension' }); }
    catch { return fail('unreachable', 'GoLearn could not reach the service. Check the address and your connection.'); }
    if (!r.ok) return fromApi(r);
    return signedIn(base.url, api, r.data.token, r.data.learnerId, r.data.expiresAt, email.toLowerCase());
  }

  async function createAccount(input: CreateAccountInput): Promise<SessionResult> {
    const base = validateBaseUrl(input.baseUrl);
    if (!base.ok) return base;
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!email || typeof input.password !== 'string' || !input.password) return fail('invalid-input', 'Enter an email and a password.');
    const api = apiFor(base.url);
    let verificationSent: boolean | undefined;
    try {
      const made = await api.createAccount({ email, password: input.password, ...(input.displayName ? { displayName: input.displayName } : {}) });
      if (!made.ok) return fromApi(made);
      const said = (made.data as { verificationSent?: unknown } | null)?.verificationSent;
      if (typeof said === 'boolean') verificationSent = said;
    } catch { return fail('unreachable', 'GoLearn could not reach the service. Check the address and your connection.'); }
    const signedIn = await connect(input);
    return signedIn.ok && verificationSent !== undefined ? { ...signedIn, verificationSent } : signedIn;
  }

  async function disconnect(): Promise<{ ok: true; remoteRevoked: boolean }> {
    const [svc, s] = await Promise.all([readService(), readSession()]);
    let remoteRevoked = false;
    if (svc && s) {
      try { const r = await apiFor(svc.baseUrl, s.token).deleteSession(); remoteRevoked = r.ok || r.status === 401; } catch { remoteRevoked = false; }
    }
    // The service could not be told (or refused): keep the one thing needed to tell it later, apart from the session, and say so in the status.
    if (svc && s && !remoteRevoked) await area.set({ [PENDING_REVOKE_KEY]: { token: s.token, baseUrl: svc.baseUrl, at: new Date(now()).toISOString() } });
    await area.remove(SESSION_KEY); // local sign-out happens whether or not the service could be told
    await opts.onDisconnect?.();
    return { ok: true, remoteRevoked };
  }

  /** Retries a revocation a sign-out could not make; true when nothing is pending any more. Called at the start of every sync round and when the network returns. */
  async function retryRevocation(): Promise<boolean> {
    const p = (await area.get(PENDING_REVOKE_KEY))[PENDING_REVOKE_KEY] as { token?: unknown; baseUrl?: unknown } | undefined;
    if (!p) return true;
    const base = validateBaseUrl(p.baseUrl);
    if (typeof p.token !== 'string' || !base.ok) { await area.remove(PENDING_REVOKE_KEY); return true; }
    try {
      const r = await apiFor(base.url, p.token).deleteSession();
      if (r.ok || r.status === 401) { await area.remove(PENDING_REVOKE_KEY); return true; }
    } catch { /* still offline: the slot stays */ }
    return false;
  }

  /** The authenticated client, or undefined when there is no usable session. A 401 from it is the caller's to report with `markUnauthorized`. */
  async function authenticated(): Promise<{ api: RepositoryApi; session: SessionRecord; service: ServiceConfig } | undefined> {
    const [svc, s] = await Promise.all([readService(), readSession()]);
    if (!svc || !s || isExpired(s)) return undefined;
    return { api: apiFor(svc.baseUrl, s.token), session: s, service: svc };
  }

  async function updateEnrolment(enrolment: Enrolment | undefined): Promise<SessionResult> {
    const s = await readSession();
    if (!s) return fail('not-connected', 'Sign in first.');
    const next: SessionRecord = { ...s };
    if (enrolment) { next.enrolmentId = enrolment.enrolmentId; next.languageId = enrolment.languageId; } else { delete next.enrolmentId; delete next.languageId; }
    await area.set({ [SESSION_KEY]: next });
    await opts.onEnrolmentChange?.(next);
    return { ok: true, status: await status() };
  }

  /** Re-reads the learner's enrolments (after the setup page enrolled them) and picks the one to record against. */
  async function refresh(): Promise<SessionResult> {
    const a = await authenticated();
    if (!a) return fail('not-connected', 'Sign in first.');
    let me: ApiResult<MeResponse>;
    try { me = await a.api.me(); } catch { return fail('unreachable', 'GoLearn could not reach the service.'); }
    if (!me.ok) return fromApi(me);
    const keep = me.data.enrolments.find((e) => e.enrolmentId === a.session.enrolmentId && !e.endedAt);
    return updateEnrolment(keep ?? pickEnrolment(me.data.enrolments, packAvailable));
  }

  async function enrol(input: EnrolInput): Promise<SessionResult> {
    const a = await authenticated();
    if (!a) return fail('not-connected', 'Sign in first.');
    let r: ApiResult<{ enrolment: Enrolment }>;
    try { r = await a.api.enrol(input); } catch { return fail('unreachable', 'GoLearn could not reach the service.'); }
    if (!r.ok) return fromApi(r);
    return updateEnrolment(r.data.enrolment);
  }

  async function selectEnrolment(enrolmentId: string): Promise<SessionResult> {
    const a = await authenticated();
    if (!a) return fail('not-connected', 'Sign in first.');
    let r: ApiResult<{ enrolments: Enrolment[] }>;
    try { r = await a.api.listEnrolments(); } catch { return fail('unreachable', 'GoLearn could not reach the service.'); }
    if (!r.ok) return fromApi(r);
    const found = r.data.enrolments.find((e) => e.enrolmentId === enrolmentId && !e.endedAt);
    if (!found) return fail('no-such-enrolment', 'That enrolment is not open.');
    return updateEnrolment(found);
  }

  return { status, getService: readService, setService, current: readSession, authenticated, connect, createAccount, disconnect, retryRevocation, refresh, enrol, selectEnrolment, isExpired };
}

export type SessionManager = ReturnType<typeof createSessionManager>;
