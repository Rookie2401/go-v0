/**
 * The account-hardening routes of the Repository service (email confirmation, password reset, sessions, data export, deletion
 * with a grace period, security events) as one small typed client over `fetch`. Every method resolves; none throws.
 * `{ ok: true, status, data }` or `{ ok: false, status, error, message }`; status 0 = the service could not be reached.
 *
 * The password is only ever passed through to the request body; nothing here keeps it. The bearer token is the one
 * the application already holds (the session record), sent as `Authorization: Bearer …` on the routes that need a session
 * and left off the routes a learner reaches from an email link (confirm, reset), which need none.
 */
export type AccountResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; message: string };

export interface SessionRow { id: string; deviceLabel?: string; createdAt: string; lastSeenAt: string; current: boolean }
export interface SecurityEvent { kind: string; at: string; deviceLabel?: string }

/** What `GET /me` says about the account that matters here; each field is absent when the service did not say. */
export interface AccountState {
  /** The display name on the account (the learner record), when one is set. */
  name?: string;
  /** The address the service has for the account. */
  email?: string;
  /** true = the email address is confirmed. */
  verified?: boolean;
  /** When the account will be purged, if its deletion is scheduled. */
  scheduledPurgeAt?: string;
}

export interface AccountClient {
  state(): Promise<AccountResult<AccountState>>;
  verify(token: string): Promise<AccountResult<{ verified: boolean }>>;
  resendVerification(email: string): Promise<AccountResult<null>>;
  forgotPassword(email: string): Promise<AccountResult<null>>;
  resetPassword(token: string, password: string): Promise<AccountResult<null>>;
  sessions(): Promise<AccountResult<{ sessions: SessionRow[] }>>;
  revokeSession(id: string): Promise<AccountResult<null>>;
  /** Every session but the current one. */
  revokeOthers(): Promise<AccountResult<null>>;
  /** The learner’s whole data as the JSON text the service sent. */
  exportData(): Promise<AccountResult<string>>;
  deleteAccount(password: string): Promise<AccountResult<{ scheduledPurgeAt?: string }>>;
  cancelDeletion(): Promise<AccountResult<null>>;
  securityEvents(): Promise<AccountResult<{ events: SecurityEvent[] }>>;
  /** Sets the display name on the account (POST /me/profile); an older service answers 404. */
  rename(displayName: string): Promise<AccountResult<null>>;
}

export interface AccountClientOptions { baseUrl: string; fetch: typeof fetch; token?: string }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** Reads the verification and pending-deletion facts out of a `GET /me` body, whichever of the plausible spellings the service uses. */
export function readAccountState(me: unknown): AccountState {
  const top = rec(me) ?? {};
  const account = rec(top.account) ?? {};
  const out: AccountState = {};
  const learner = rec(top.learner) ?? {};
  const name = str(learner.displayName);
  if (name) out.name = name;
  const email = str(account.email);
  if (email) out.email = email;
  for (const key of ['verified', 'emailVerified']) {
    if (typeof account[key] === 'boolean') { out.verified = account[key] as boolean; break; }
    if (typeof top[key] === 'boolean') { out.verified = top[key] as boolean; break; }
  }
  if (out.verified === undefined) {
    for (const key of ['verifiedAt', 'emailVerifiedAt']) {
      if (key in account) { out.verified = !!str(account[key]); break; }
    }
  }
  const deletion = rec(account.deletion) ?? rec(top.deletion);
  const purge = str(account.scheduledPurgeAt) ?? str(account.deletionScheduledAt) ?? str(deletion?.scheduledPurgeAt) ?? str(top.scheduledPurgeAt);
  if (purge) out.scheduledPurgeAt = purge;
  return out;
}

export function createAccountClient(o: AccountClientOptions): AccountClient {
  const base = o.baseUrl.replace(/\/+$/, '');

  async function call<T>(method: string, path: string, opts: { body?: unknown; session?: boolean; raw?: boolean } = {}): Promise<AccountResult<T>> {
    const headers: Record<string, string> = {};
    if (opts.session && o.token) headers.Authorization = `Bearer ${o.token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await o.fetch(`${base}${path}`, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
      const text = response.status === 204 ? '' : await response.text();
      if (response.ok) {
        if (opts.raw) return { ok: true, status: response.status, data: text as unknown as T };
        let data: unknown = null;
        if (text) { try { data = JSON.parse(text); } catch { data = null; } }
        return { ok: true, status: response.status, data: data as T };
      }
      let body: Record<string, unknown> = {};
      try { body = rec(JSON.parse(text)) ?? {}; } catch { /* not JSON */ }
      return { ok: false, status: response.status, error: str(body.error) ?? 'error', message: str(body.message) ?? '' };
    } catch {
      return { ok: false, status: 0, error: 'unreachable', message: 'The service could not be reached.' };
    }
  }

  return {
    async state() {
      const r = await call<unknown>('GET', '/me', { session: true });
      return r.ok ? { ok: true, status: r.status, data: readAccountState(r.data) } : r;
    },
    verify: (token) => call('POST', '/accounts/verify', { body: { token } }),
    resendVerification: (email) => call('POST', '/accounts/verify/resend', { body: { email } }),
    forgotPassword: (email) => call('POST', '/accounts/password/forgot', { body: { email } }),
    resetPassword: (token, password) => call('POST', '/accounts/password/reset', { body: { token, password } }),
    sessions: () => call('GET', '/me/sessions', { session: true }),
    revokeSession: (id) => call('DELETE', `/me/sessions/${encodeURIComponent(id)}`, { session: true }),
    revokeOthers: () => call('DELETE', '/me/sessions', { session: true }),
    exportData: () => call('GET', '/me/export', { session: true, raw: true }),
    deleteAccount: (password) => call('DELETE', '/me', { session: true, body: { password } }),
    cancelDeletion: () => call('POST', '/me/delete/cancel', { session: true, body: {} }),
    securityEvents: () => call('GET', '/me/security-events', { session: true }),
    rename: (displayName) => call('POST', '/me/profile', { session: true, body: { displayName } }),
  };
}

/** The plain-language reason for a refused or failed request. */
export function explainAccountFailure(r: Extract<AccountResult<unknown>, { ok: false }>): string {
  if (r.status === 0) return 'The service could not be reached. Check your connection and try again.';
  if (r.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  if (r.status === 401) return 'Your session is no longer valid. Sign in again.';
  return r.message || `The service answered ${r.status}.`;
}
