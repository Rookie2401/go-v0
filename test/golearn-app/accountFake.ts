/**
 * A fake of the account-hardening routes of the Repository service, as a `fetch`, following the service contract:
 *   POST /accounts/verify {token} · POST /accounts/verify/resend {email} (202 always) · POST /accounts/password/forgot {email} (202 always)
 *   POST /accounts/password/reset {token,password} · GET /me · GET /me/sessions · DELETE /me/sessions/{id} · DELETE /me/sessions
 *   GET /me/export · DELETE /me {password} (202 {scheduledPurgeAt}) · POST /me/delete/cancel · GET /me/security-events
 * Any bearer token that has not been revoked here counts as the signed-in account (`email`). Shared by the GoLearn and GoReview tests.
 */
export interface FakeSessionRow { id: string; deviceLabel?: string; createdAt: string; lastSeenAt: string; current: boolean }

export class FakeAccountService {
  email = 'ana@example.org';
  password = 'correct horse battery';
  verified = false;
  /** Whether `GET /me` says anything about verification (`undefined` = it does not). */
  reportVerified = true;
  validVerifyTokens = new Set(['good-verify']);
  validResetTokens = new Set(['good-reset']);
  sessions: FakeSessionRow[] = [
    { id: 's-current', deviceLabel: 'This browser', createdAt: '2026-10-08T09:00:00.000Z', lastSeenAt: '2026-10-08T11:59:00.000Z', current: true },
    { id: 's-phone', deviceLabel: 'Phone', createdAt: '2026-10-01T09:00:00.000Z', lastSeenAt: '2026-10-07T18:30:00.000Z', current: false },
    { id: 's-laptop', deviceLabel: 'Old laptop', createdAt: '2026-09-20T09:00:00.000Z', lastSeenAt: '2026-09-25T08:00:00.000Z', current: false },
  ];
  events: Array<{ kind: string; at: string; deviceLabel?: string }> = [
    { kind: 'sign-in', at: '2026-10-08T09:00:00.000Z', deviceLabel: 'This browser' },
    { kind: 'password-reset', at: '2026-10-02T10:00:00.000Z' },
  ];
  exportBody: Record<string, unknown> = { schema: 'go-repository-export@1', events: [{ id: 'e1' }], enrolments: [] };
  scheduledPurgeAt: string | undefined;
  purgeAt = '2026-10-22T12:00:00.000Z';
  /** Make every request fail as if the network were down. */
  down = false;
  /** Status to answer the next request to a path with (once). */
  failNext = new Map<string, { status: number; body?: Record<string, unknown> }>();
  calls: Array<{ method: string; path: string; body?: Record<string, unknown>; auth?: string }> = [];
  revokedTokens = new Set<string>();

  count(method: string, path: string): number { return this.calls.filter((c) => c.method === method && c.path === path).length; }
  last(method: string, path: string): { body?: Record<string, unknown>; auth?: string } | undefined { return [...this.calls].reverse().find((c) => c.method === method && c.path === path); }

  /** The display name on the learner record (GET /me carries it; POST /me/profile sets it). */
  name?: string;

  private json(status: number, body?: unknown): Response {
    return status === 204 ? new Response(null, { status }) : new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  readonly fetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.down) throw new TypeError('network down');
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const auth = headers.Authorization ?? headers.authorization;
    this.calls.push({ method, path, ...(body ? { body } : {}), ...(auth ? { auth } : {}) });
    const forced = this.failNext.get(`${method} ${path}`);
    if (forced) { this.failNext.delete(`${method} ${path}`); return this.json(forced.status, forced.body ?? { error: 'error', message: '' }); }
    const signedIn = !!auth && auth.startsWith('Bearer ') && !this.revokedTokens.has(auth.slice(7));
    const need = (): Response | undefined => (signedIn ? undefined : this.json(401, { error: 'unauthorized', message: 'Sign in.' }));

    if (method === 'POST' && path === '/accounts/verify') {
      const t = String(body?.token ?? '');
      if (!this.validVerifyTokens.has(t)) return this.json(400, { error: 'invalid-token', message: 'That link has expired or was already used.' });
      this.validVerifyTokens.delete(t);
      this.verified = true;
      this.events.unshift({ kind: 'email-verified', at: '2026-10-08T12:00:00.000Z' });
      return this.json(200, { verified: true });
    }
    if (method === 'POST' && path === '/accounts/verify/resend') return this.json(202, { accepted: true });
    if (method === 'POST' && path === '/accounts/password/forgot') return this.json(202, { accepted: true });
    if (method === 'POST' && path === '/accounts/password/reset') {
      const t = String(body?.token ?? '');
      if (!this.validResetTokens.has(t)) return this.json(400, { error: 'invalid-token', message: 'That link has expired or was already used.' });
      if (String(body?.password ?? '').length < 10) return this.json(422, { error: 'weak-password', message: 'The password must be at least 10 characters.' });
      this.validResetTokens.delete(t);
      this.password = String(body?.password);
      this.sessions = [];
      return this.json(200, { reset: true });
    }
    const denied = need();
    if (method === 'GET' && path === '/me') {
      if (denied) return denied;
      return this.json(200, { learner: this.name ? { learnerId: 'learner-1', createdAt: '2026-09-01T00:00:00.000Z', displayName: this.name } : null, account: { accountId: 'acct-1', email: this.email, createdAt: '2026-09-01T00:00:00.000Z', ...(this.reportVerified ? { verified: this.verified } : {}), ...(this.scheduledPurgeAt ? { scheduledPurgeAt: this.scheduledPurgeAt } : {}) }, enrolments: [], devices: [], consents: [] });
    }
    if (method === 'GET' && path === '/me/sessions') return denied ?? this.json(200, { sessions: this.sessions });
    if (method === 'DELETE' && path === '/me/sessions') {
      if (denied) return denied;
      this.sessions = this.sessions.filter((s) => s.current);
      return this.json(204);
    }
    const one = /^\/me\/sessions\/([^/]+)$/.exec(path);
    if (method === 'DELETE' && one) {
      if (denied) return denied;
      this.sessions = this.sessions.filter((s) => s.id !== decodeURIComponent(one[1]));
      return this.json(204);
    }
    if (method === 'GET' && path === '/me/export') return denied ?? new Response(JSON.stringify(this.exportBody), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="export.json"' } });
    if (method === 'POST' && path === '/me/profile') {
      if (denied) return denied;
      if (typeof body?.displayName !== 'string') return this.json(400, { error: 'invalid', message: '"displayName" must be a string.' });
      this.name = body.displayName.trim() || undefined;
      return this.json(200, { learner: { learnerId: 'learner-1', createdAt: '2026-09-01T00:00:00.000Z', ...(this.name ? { displayName: this.name } : {}) } });
    }
    if (method === 'DELETE' && path === '/me') {
      if (denied) return denied;
      if (body?.password !== this.password) return this.json(403, { error: 'bad-password', message: 'Wrong password.' });
      this.scheduledPurgeAt = this.purgeAt;
      return this.json(202, { scheduledPurgeAt: this.purgeAt });
    }
    if (method === 'POST' && path === '/me/delete/cancel') {
      if (denied) return denied;
      this.scheduledPurgeAt = undefined;
      return this.json(200, { cancelled: true });
    }
    if (method === 'GET' && path === '/me/security-events') return denied ?? this.json(200, { events: this.events });
    return this.json(404, { error: 'not-found', message: `No route ${method} ${path}` });
  }) as typeof fetch;
}
