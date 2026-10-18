/**
 * Accounts hardening: email verification, password reset, the session list, the learner's own export, account deletion with a grace period, and the
 * security log. The pieces the existing sign-in and account routes call (`sendVerification`, `signInGate`, `accountStatus`, `audit`) and the new
 * routes (`registerAccountRoutes`) live here; the handler registers the routes and owns the shared dispatch.
 *
 * Rules that hold throughout:
 *  - A token is 32 random bytes, base64url, shown only in the email; the store keeps its sha256. Verification lasts 24 h, a reset 1 h; both are single
 *    use, and a newer token replaces the unused older one.
 *  - The routes that mail a link answer 202 whether or not the address has an account, and send the mail without making the caller wait for it, so
 *    neither the answer nor its timing says which addresses exist.
 *  - Nothing here logs or audits a password, a token or an address.
 */
import type { Account, SecurityEventKind, Session } from '../../repository-contract/src';
import { DEFAULT_ACCOUNT_POLICY } from './deps';
import type { AccountPolicy, ServiceDeps } from './deps';
import { Refusal, checkPassword, invalid, normalEmail, respond, takeLimit, uuid } from './http';
import type { Ctx, Handler } from './http';
import { dummyHash, forgetFailures, lockedOut, noteFailure } from './throttle';

const DAY_MS = 24 * 3600 * 1000;
export const VERIFY_TTL_MS = DAY_MS;
export const RESET_TTL_MS = 3600 * 1000;
/** A session's `lastSeenAt` is rewritten at most this often (one write per request would be a write for every read). */
export const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
/** The mailing routes also allow each address this many mails an hour, however many addresses one IP tries. */
export const MAIL_PER_ADDRESS = { max: 3, windowSec: 3600 };

type Register = (method: string, path: string, auth: boolean, run: Handler) => void;

export const policyOf = (deps: ServiceDeps): AccountPolicy => deps.accountPolicy ?? DEFAULT_ACCOUNT_POLICY;
const nowOf = (deps: ServiceDeps): string => (deps.now ?? (() => new Date().toISOString()))();

/** The Account with its password hash, which `getAccount` does not return. */
export async function accountWithHash(deps: ServiceDeps, accountId: string): Promise<(Account & { passwordHash: string }) | undefined> {
  const a = await deps.store.getAccount(accountId);
  return a ? deps.store.getAccountByEmail(a.email) : undefined;
}

// ───────────────────────────── the security log ─────────────────────────────

/** Appends a line to the security log. Best effort: a log failure never fails the request. */
export async function audit(deps: ServiceDeps, kind: SecurityEventKind, learnerId: string | undefined, extra: { deviceId?: string; detail?: string; subjectRef?: string } = {}, at?: string): Promise<void> {
  const sec = deps.store.security;
  if (!sec) return;
  try {
    await sec.appendSecurityEvent({ eventId: uuid(), kind, at: at ?? nowOf(deps), ...(learnerId ? { learnerId } : {}), ...extra });
  } catch { /* the log is a record, not a gate */ }
}

// ───────────────────────────── status of an account ─────────────────────────────

/** What a client needs to know about an account's standing. */
export function accountStatus(deps: ServiceDeps, a: Account): { verified: boolean; emailVerified: boolean; verifyBy?: string; scheduledPurgeAt?: string; deletionRequestedAt?: string; deletionDueAt?: string } {
  const p = policyOf(deps);
  const verified = a.verifiedAt !== undefined;
  return {
    // `verified` and `scheduledPurgeAt` are the names the apps read; `emailVerified` and `deletionDueAt` are the same values under their older names
    verified,
    emailVerified: verified,
    ...(!verified ? { verifyBy: new Date(Date.parse(a.createdAt) + p.graceDays * DAY_MS).toISOString() } : {}),
    ...(a.deletionRequestedAt !== undefined ? { deletionRequestedAt: a.deletionRequestedAt } : {}),
    ...(a.deletionDueAt !== undefined ? { scheduledPurgeAt: a.deletionDueAt, deletionDueAt: a.deletionDueAt } : {}),
  };
}

/** Sign-in refused (403 `email-unverified`) once an unverified account is past its grace, when the policy requires verification. */
export function signInGate(deps: ServiceDeps, a: Account, nowMs: number): void {
  const p = policyOf(deps);
  // no gate where verification cannot be completed: a store without the security port, or no way to send the mail
  if (!p.requireVerification || a.verifiedAt !== undefined || !deps.store.security || !deps.mailer) return;
  if (nowMs <= Date.parse(a.createdAt) + p.graceDays * DAY_MS) return;
  throw new Refusal(403, 'email-unverified', 'Confirm your email address to sign in. Ask for a new confirmation email and open the link in it.', {
    resend: { method: 'POST', path: '/accounts/verify/resend', body: { email: 'the address of this account' } },
  });
}

// ───────────────────────────── mail ─────────────────────────────

const linkWith = (template: string | undefined, token: string): string | undefined => (template ? template.replace('{token}', encodeURIComponent(token)) : undefined);

/** Hands the message to the mailer without waiting for it (an SMTP round trip would tell a caller which addresses exist). A failure is logged without its content. */
function fire(deps: ServiceDeps, to: string, subject: string, text: string): void {
  const mailer = deps.mailer;
  if (!mailer) return;
  mailer.send({ to, subject, text }).catch(() => deps.log?.(`mail: sending failed (${mailer.kind})`));
}

/** Issues a verification token and mails it. False when nothing can be sent (no security store or no mailer). */
export async function sendVerification(deps: ServiceDeps, a: Account, at: string): Promise<boolean> {
  const sec = deps.store.security;
  if (!sec || !deps.mailer) return false;
  const p = policyOf(deps);
  const token = deps.crypto.randomToken();
  await sec.clearAccountTokens(a.accountId, 'verify-email');
  await sec.putAccountToken({ tokenHash: deps.crypto.sha256(token), accountId: a.accountId, purpose: 'verify-email', createdAt: at, expiresAt: new Date(Date.parse(at) + VERIFY_TTL_MS).toISOString() });
  const link = linkWith(p.verifyUrl, token);
  const name = p.serviceName ?? 'Go';
  fire(deps, a.email, `Confirm your email for ${name}`, [
    `Confirm the email address of your ${name} account.`,
    '',
    ...(link ? [`Open this link:`, link, '', `Or, in the app, enter this code:`] : ['In the app, enter this code:']),
    token,
    '',
    'It works for 24 hours and once. If you did not create this account, ignore this email: nothing will happen.',
    '',
  ].join('\n'));
  await audit(deps, 'email-verification-sent', a.learnerId, {}, at);
  return true;
}

async function sendReset(deps: ServiceDeps, a: Account, at: string): Promise<void> {
  const sec = deps.store.security;
  if (!sec || !deps.mailer) return;
  const p = policyOf(deps);
  const token = deps.crypto.randomToken();
  await sec.clearAccountTokens(a.accountId, 'reset-password');
  await sec.putAccountToken({ tokenHash: deps.crypto.sha256(token), accountId: a.accountId, purpose: 'reset-password', createdAt: at, expiresAt: new Date(Date.parse(at) + RESET_TTL_MS).toISOString() });
  const link = linkWith(p.resetUrl, token);
  const name = p.serviceName ?? 'Go';
  fire(deps, a.email, `Reset your ${name} password`, [
    `Someone asked to reset the password of your ${name} account.`,
    '',
    ...(link ? [`Open this link to choose a new one:`, link, '', `Or, in the app, enter this code:`] : ['In the app, enter this code with your new password:']),
    token,
    '',
    'It works for one hour and once. If you did not ask for this, ignore this email: your password has not changed.',
    '',
  ].join('\n'));
  await audit(deps, 'password-reset-requested', a.learnerId, {}, at);
}

// ───────────────────────────── routes ─────────────────────────────

const needSecurity = (deps: ServiceDeps): NonNullable<ServiceDeps['store']['security']> => {
  const sec = deps.store.security;
  if (!sec) throw new Refusal(501, 'unsupported', 'This Repository store does not support accounts hardening.');
  return sec;
};

const invalidToken = (): Refusal => new Refusal(422, 'invalid-token', 'That link or code is not valid any more. It may have expired or been used. Ask for a new one.');

function readToken(b: Record<string, unknown>): string {
  if (typeof b.token !== 'string' || b.token.length < 20 || b.token.length > 200) throw invalidToken();
  return b.token.trim();
}

function readEmail(b: Record<string, unknown>): string {
  if (typeof b.email !== 'string' || b.email.length > 254) throw invalid('"email" is required.');
  return normalEmail(b.email);
}

/** One mail per address per hour window (3), silently: the caller cannot tell a throttled address from an unknown one. */
const addressAllowed = (deps: ServiceDeps, purpose: string, email: string): boolean => {
  const r = deps.limiter?.takeWith(`${purpose}:${email}`, MAIL_PER_ADDRESS);
  return r === undefined || r.ok;
};

export interface AccountRouteHelpers {
  /** The export document of the base route (`GET /export`): account view, enrolments, events, knowledge, preferences, documents, tombstones, unit provenance. */
  buildExport(ctx: Ctx): Promise<Record<string, unknown>>;
}

export function registerAccountRoutes(route: Register, helpers: AccountRouteHelpers): void {
  // ── email verification ──

  route('POST', '/accounts/verify', false, async (ctx) => {
    takeLimit(ctx.deps, 'recovery', ctx.ip);
    const b = await ctx.body();
    const sec = needSecurity(ctx.deps);
    const at = ctx.now();
    const used = await sec.consumeAccountToken(ctx.deps.crypto.sha256(readToken(b)), 'verify-email', at);
    if (!used) throw invalidToken();
    const account = await accountWithHash(ctx.deps, used.accountId);
    if (!account) throw invalidToken();
    if (account.verifiedAt === undefined) await ctx.deps.store.putAccount({ ...account, verifiedAt: at });
    await audit(ctx.deps, 'email-verified', account.learnerId, {}, at);
    return respond(200, { verified: true });
  });

  route('POST', '/accounts/verify/resend', false, async (ctx) => {
    takeLimit(ctx.deps, 'recovery', ctx.ip);
    const email = readEmail(await ctx.body());
    if (ctx.deps.store.security && ctx.deps.mailer && addressAllowed(ctx.deps, 'verify', email)) {
      const account = await ctx.deps.store.getAccountByEmail(email);
      if (account && !account.disabledAt && account.verifiedAt === undefined) await sendVerification(ctx.deps, account, ctx.now());
    }
    return respond(202, { accepted: true });
  });

  // ── password reset ──

  route('POST', '/accounts/password/forgot', false, async (ctx) => {
    takeLimit(ctx.deps, 'recovery', ctx.ip);
    const email = readEmail(await ctx.body());
    if (ctx.deps.store.security && ctx.deps.mailer && addressAllowed(ctx.deps, 'reset', email)) {
      const account = await ctx.deps.store.getAccountByEmail(email);
      if (account && !account.disabledAt) await sendReset(ctx.deps, account, ctx.now());
    }
    return respond(202, { accepted: true });
  });

  route('POST', '/accounts/password/reset', false, async (ctx) => {
    takeLimit(ctx.deps, 'recovery', ctx.ip);
    const b = await ctx.body();
    const sec = needSecurity(ctx.deps);
    const token = readToken(b);
    const password = checkPassword(b.password); // checked before the token is spent: a weak password does not burn the link
    const at = ctx.now();
    const used = await sec.consumeAccountToken(ctx.deps.crypto.sha256(token), 'reset-password', at);
    if (!used) throw invalidToken();
    const account = await accountWithHash(ctx.deps, used.accountId);
    if (!account) throw invalidToken();
    const passwordHash = await ctx.deps.crypto.hashPassword(password);
    // proving control of the mailbox also confirms the address
    await ctx.deps.store.putAccount({ ...account, passwordHash, verifiedAt: account.verifiedAt ?? at });
    const revoked = await sec.revokeSessions(account.learnerId, at);
    forgetFailures(ctx.deps, account.email);
    await audit(ctx.deps, 'password-reset-used', account.learnerId, { detail: `sessions-revoked=${revoked}` }, at);
    return respond(200, { reset: true, sessionsRevoked: revoked });
  });

  // ── sessions ──

  route('GET', '/me/sessions', true, async (ctx) => {
    const sec = needSecurity(ctx.deps);
    const nowMs = Date.parse(ctx.now());
    const live = (await sec.listSessions(ctx.session.learnerId)).filter((s) => s.revokedAt === undefined && Date.parse(s.expiresAt) > nowMs);
    const devices = new Map<string, { platform?: string; label?: string }>();
    for (const id of new Set(live.map((s) => s.deviceId))) {
      const d = await ctx.deps.store.getDevice(ctx.session.learnerId, id);
      if (d) devices.set(id, { ...(d.platform ? { platform: d.platform } : {}), ...(d.label ? { label: d.label } : {}) });
    }
    return respond(200, {
      sessions: live.map((s: Session) => ({
        sessionId: s.sessionId, deviceId: s.deviceId, ...(devices.get(s.deviceId) ?? {}), createdAt: s.createdAt,
        ...(s.lastSeenAt ? { lastSeenAt: s.lastSeenAt } : {}), expiresAt: s.expiresAt, current: s.sessionId === ctx.session.sessionId,
      })),
    });
  });

  route('DELETE', '/me/sessions/:id', true, async (ctx) => {
    const sec = needSecurity(ctx.deps);
    const at = ctx.now();
    // listed per learner: another learner's session is indistinguishable from a missing one
    const found = (await sec.listSessions(ctx.session.learnerId)).find((s) => s.sessionId === ctx.params.id && s.revokedAt === undefined && Date.parse(s.expiresAt) > Date.parse(at));
    if (!found) throw new Refusal(404, 'no-such-session', 'You have no active session with that id.');
    await ctx.deps.store.revokeSession(found.sessionId, at);
    await audit(ctx.deps, 'sessions-revoked', ctx.session.learnerId, { detail: 'count=1', deviceId: found.deviceId }, at);
    return respond(204);
  });

  route('DELETE', '/me/sessions', true, async (ctx) => {
    const sec = needSecurity(ctx.deps);
    const at = ctx.now();
    const revoked = await sec.revokeSessions(ctx.session.learnerId, at, ctx.session.sessionId);
    await audit(ctx.deps, 'sessions-revoked', ctx.session.learnerId, { detail: `count=${revoked}` }, at);
    return respond(200, { revoked });
  });

  // ── the learner's own copy ──

  route('GET', '/me/export', true, async (ctx) => {
    takeLimit(ctx.deps, 'export', ctx.session.accountId);
    const { store } = ctx.deps;
    const learnerId = ctx.session.learnerId;
    const base = await helpers.buildExport(ctx);
    const events = (base.events ?? []) as Array<{ subject?: { itemIds?: string[] }; provenance?: { analysisId?: string } }>;
    const knowledge = (base.knowledge ?? []) as Array<{ unitId: string }>;
    // The shared linguistic rows the learner's own history points at (facts about words, not learner data): units by id, analyses by id.
    const unitIds = [...new Set([...events.flatMap((e) => e.subject?.itemIds ?? []), ...knowledge.map((k) => k.unitId)])].sort();
    const units = [];
    for (let i = 0; i < unitIds.length; i += 500) units.push(...(await store.getUnits(unitIds.slice(i, i + 500))));
    const analysisIds = [...new Set(events.flatMap((e) => (e.provenance?.analysisId ? [e.provenance.analysisId] : [])))].sort().slice(0, 5000);
    const analyses = [];
    for (const id of analysisIds) { const a = await store.getAnalysis(id); if (a) analyses.push(a); }
    const sec = store.security;
    const sessions = sec ? (await sec.listSessions(learnerId)).map((s) => ({ sessionId: s.sessionId, deviceId: s.deviceId, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt, revokedAt: s.revokedAt })) : [];
    const securityEvents = sec ? (await sec.listSecurityEvents(learnerId, 1000)).map(({ learnerId: _l, ...rest }) => rest) : [];
    const at = ctx.now();
    await audit(ctx.deps, 'export-requested', learnerId, { deviceId: ctx.session.deviceId }, at);
    const document = { ...base, units, analyses, sessions, securityEvents };
    return respond(200, document, { 'Content-Disposition': `attachment; filename="go-repository-export-${at.slice(0, 10)}.json"` });
  });

  route('GET', '/me/security-events', true, async (ctx) => {
    const sec = needSecurity(ctx.deps);
    const raw = ctx.query.get('limit');
    if (raw !== null && raw !== '' && !/^\d+$/.test(raw)) throw new Refusal(422, 'invalid-query', '"limit" must be a whole number.');
    const limit = Math.max(1, Math.min(500, raw ? Number(raw) : 100));
    const events = (await sec.listSecurityEvents(ctx.session.learnerId, limit)).map(({ learnerId: _l, subjectRef: _s, ...rest }) => rest);
    return respond(200, { events });
  });

  // ── deletion with a grace period ──

  route('POST', '/me/delete/cancel', true, async (ctx) => {
    const sec = needSecurity(ctx.deps);
    void sec;
    const account = await accountWithHash(ctx.deps, ctx.session.accountId);
    if (!account || account.deletionRequestedAt === undefined) throw new Refusal(409, 'no-deletion-pending', 'No deletion is waiting for this account.');
    const { deletionRequestedAt: _a, deletionDueAt: _b, ...rest } = account;
    await ctx.deps.store.putAccount(rest);
    await audit(ctx.deps, 'deletion-cancelled', account.learnerId, { deviceId: ctx.session.deviceId });
    return respond(200, { cancelled: true });
  });
}

/**
 * `DELETE /me` with a `password`: schedule the deletion instead of erasing at once. The password is checked (and counted against the sign-in lockout),
 * every OTHER session of the learner is revoked (the one that asked stays, so the page that asked can show the date and offer Cancel), and the
 * account is flagged; `purgeDueAccounts` erases it when `deletionDueAt` has passed. Sign-in stays possible for the account so the learner can
 * cancel (`POST /me/delete/cancel`); until then a session reaches only the routes `DELETION_ALLOWED` lists.
 */
export async function requestDeletion(ctx: Ctx, password: string): Promise<Response> {
  const { deps } = ctx;
  const sec = needSecurity(deps);
  const at = ctx.now();
  const nowMs = Date.parse(at);
  const account = await accountWithHash(deps, ctx.session.accountId);
  if (!account) throw new Refusal(401, 'unauthorized', 'Sign in again.');
  if (lockedOut(deps, account.email, nowMs)) throw new Refusal(429, 'too-many-attempts', 'Too many failed attempts for this account. Wait 15 minutes and try again.', {}, { 'Retry-After': '900' });
  await dummyHash(deps); // keep the work uniform with sign-in
  if (!(await deps.crypto.verifyPassword(password, account.passwordHash))) {
    noteFailure(deps, account.email, nowMs);
    throw new Refusal(401, 'bad-credentials', 'The password is not right.');
  }
  forgetFailures(deps, account.email);
  const policy = policyOf(deps);
  const requestedAt = account.deletionRequestedAt ?? at;
  const dueAt = account.deletionDueAt ?? new Date(nowMs + policy.deleteGraceDays * DAY_MS).toISOString();
  if (account.deletionRequestedAt === undefined) {
    await deps.store.putAccount({ ...account, deletionRequestedAt: requestedAt, deletionDueAt: dueAt });
    await audit(deps, 'deletion-requested', account.learnerId, { deviceId: ctx.session.deviceId, detail: `graceDays=${policy.deleteGraceDays}` }, at);
  }
  await sec.revokeSessions(account.learnerId, at, ctx.session.sessionId);
  return respond(202, { scheduledPurgeAt: dueAt, deletionRequestedAt: requestedAt, deletionDueAt: dueAt, graceDays: policy.deleteGraceDays });
}

/** The routes an account with a pending deletion may still call (everything else is 403 `deletion-pending`). */
export const DELETION_ALLOWED: ReadonlySet<string> = new Set([
  'GET /me', 'DELETE /me', 'POST /me/delete/cancel', 'DELETE /sessions/current', 'GET /me/export', 'GET /me/security-events', 'GET /me/sessions', 'DELETE /me/sessions/:id',
]);

export function deletionPending(a: Account): Refusal {
  return new Refusal(403, 'deletion-pending', 'This account is scheduled for deletion. Cancel the deletion to use it again.', {
    ...(a.deletionDueAt ? { scheduledPurgeAt: a.deletionDueAt, deletionDueAt: a.deletionDueAt } : {}), cancel: { method: 'POST', path: '/me/delete/cancel' },
  });
}

/** Stamps the session's `lastSeenAt` when it is older than TOUCH_INTERVAL_MS. Best effort. */
export async function touchSession(deps: ServiceDeps, s: Session, nowIso: string): Promise<void> {
  const sec = deps.store.security;
  if (!sec) return;
  if (s.lastSeenAt !== undefined && Date.parse(nowIso) - Date.parse(s.lastSeenAt) < TOUCH_INTERVAL_MS) return;
  try { await sec.touchSession(s.sessionId, nowIso); } catch { /* a missed stamp costs nothing */ }
}

