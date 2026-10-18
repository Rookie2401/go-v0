// @vitest-environment node
/**
 * Accounts hardening through the real handler, with the REAL stores: email verification (24 h token, grace period), password reset (1 h, single use,
 * revokes every session), the session list, the learner's own export, deletion with a grace period and the purge, and the security log. Everything runs
 * on a clock the test advances. The lifecycle runs against memory, SQLite and Postgres (PGlite).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryStore, openPostgresStore, openSqliteStore } from '../../../packages/repository-store/src';
import type { ConcreteStore } from '../../../packages/repository-store/src';
import { runMaintenance } from '../../../packages/repository-service/src/purge';
import { pgliteTestPool } from '../store/pg-pool';
import type { TestPool } from '../store/pg-pool';
import { DAY, HOUR, PASSWORD, call, createAccount, hardening, lastMail, member, signIn } from './hardening';
import type { Hardening } from './hardening';
import { lookupEvent, makeEvent } from './fakes';

const tmp = mkdtempSync(join(tmpdir(), 'hardening-'));
let pool: TestPool;
let n = 0;
beforeAll(async () => { pool = pgliteTestPool(); await (await openPostgresStore(pool)).close(); }, 60_000);
afterAll(async () => { await pool.destroy(); try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows keeps open SQLite files locked; the OS temp cleaner takes them */ } });

const backends: Array<{ name: string; open: (now: () => string) => ConcreteStore | Promise<ConcreteStore>; sqlitePath?: () => string }> = [
  { name: 'memory', open: (now) => createMemoryStore({ now }) },
  { name: 'sqlite', open: (now) => openSqliteStore(join(tmp, `s${++n}.sqlite`), { now }) },
  { name: 'postgres (PGlite)', open: async (now) => { await pool.reset(); return openPostgresStore(pool, { now }); } },
];

describe.each(backends)('accounts hardening on the $name store', ({ open }) => {
  const make = (policy: Parameters<typeof hardening>[1] = {}) => hardening(open, policy);

  describe('email verification', () => {
    it('creates the account unverified and mails a token that is stored only as a digest', async () => {
      const h = await make();
      const acc = await createAccount(h, 'Ana@Example.com');
      expect((await h.store.getAccount(acc.accountId))?.verifiedAt).toBeUndefined();
      expect(h.mailer.sent).toHaveLength(1);
      const { subject, token, text } = lastMail(h, 'ana@example.com');
      expect(subject).toMatch(/confirm/i);
      expect(text).toMatch(/24 hours/);
      // the raw token is not a key of anything stored; its digest is
      expect(await h.store.security!.consumeAccountToken(token, 'verify-email', h.clock.now())).toBeUndefined();
      const me = await call(h, 'GET', '/me', { token: (await signIn(h, 'ana@example.com')).body.token });
      expect(me.body.account).toMatchObject({ verified: false, emailVerified: false });
      expect(Date.parse(me.body.account.verifyBy) - Date.parse(h.clock.now())).toBe(7 * DAY);
    });

    it('links to the hosted setup app: <APP_PUBLIC_URL>#/verify?token=… and #/reset?token=…', async () => {
      const h = await make({ policy: { verifyUrl: 'https://setup.example.org/app#/verify?token={token}', resetUrl: 'https://setup.example.org/app#/reset?token={token}' } });
      await createAccount(h, 'ana@example.com');
      const v = lastMail(h, 'ana@example.com');
      expect(v.text).toContain(`https://setup.example.org/app#/verify?token=${v.token}`);
      await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } });
      const r = lastMail(h, 'ana@example.com');
      expect(r.text).toContain(`https://setup.example.org/app#/reset?token=${r.token}`);
    });

    it('POST /accounts/verify confirms the address once; the same token again is refused', async () => {
      const h = await make();
      const acc = await createAccount(h, 'ana@example.com');
      const { token } = lastMail(h, 'ana@example.com');
      const ok = await call(h, 'POST', '/accounts/verify', { body: { token } });
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ verified: true });
      expect((await h.store.getAccount(acc.accountId))?.verifiedAt).toBe(h.clock.now());
      const again = await call(h, 'POST', '/accounts/verify', { body: { token } });
      expect(again.status).toBe(422);
      expect(again.body.error).toBe('invalid-token');
      const me = await call(h, 'GET', '/me', { token: (await signIn(h, 'ana@example.com')).body.token });
      expect(me.body.account.emailVerified).toBe(true);
      expect(me.body.account.verifyBy).toBeUndefined();
    });

    it('refuses a token after 24 hours, a made-up token, and a missing one', async () => {
      const h = await make();
      await createAccount(h, 'ana@example.com');
      const { token } = lastMail(h, 'ana@example.com');
      h.clock.advance(24 * HOUR + 1000);
      expect((await call(h, 'POST', '/accounts/verify', { body: { token } })).body.error).toBe('invalid-token');
      expect((await call(h, 'POST', '/accounts/verify', { body: { token: 'x'.repeat(43) } })).status).toBe(422);
      expect((await call(h, 'POST', '/accounts/verify', { body: {} })).status).toBe(422);
    });

    it('lets an unverified account sign in during the grace period, then answers 403 email-unverified with a resend hint; verifying restores it', async () => {
      const h = await make();
      await createAccount(h, 'ana@example.com');
      h.clock.advance(7 * DAY - HOUR);
      const early = await signIn(h, 'ana@example.com');
      expect(early.status).toBe(201);
      expect(early.body.emailVerified).toBe(false);
      h.clock.advance(2 * HOUR);
      const late = await signIn(h, 'ana@example.com');
      expect(late.status).toBe(403);
      expect(late.body.error).toBe('email-unverified');
      expect(late.body.resend).toMatchObject({ method: 'POST', path: '/accounts/verify/resend' });
      expect(JSON.stringify(late.body)).not.toContain('ana@example.com');
      // a wrong password is still the ordinary 401: the state of the account is not told to someone who cannot sign in
      expect((await call(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: 'wrong password!!', deviceId: 'd' } })).status).toBe(401);
      // the session signed in during the grace keeps working
      expect((await call(h, 'GET', '/me', { token: early.body.token })).status).toBe(200);
      await call(h, 'POST', '/accounts/verify/resend', { body: { email: 'ana@example.com' } });
      await call(h, 'POST', '/accounts/verify', { body: { token: lastMail(h, 'ana@example.com').token } });
      expect((await signIn(h, 'ana@example.com')).status).toBe(201);
    });

    it('does not enforce verification when the policy does not (no mail can be delivered), and never for accounts that were verified', async () => {
      const lax = await make({ policy: { requireVerification: false } });
      await createAccount(lax, 'ana@example.com');
      lax.clock.advance(60 * DAY);
      expect((await signIn(lax, 'ana@example.com')).status).toBe(201);
      const strict = await make();
      const acc = await createAccount(strict, 'old@example.com');
      const stored = (await strict.store.getAccountByEmail('old@example.com'))!;
      await strict.store.putAccount({ ...stored, verifiedAt: stored.createdAt }); // what migration 004 does for accounts that predate the rule
      strict.clock.advance(60 * DAY);
      expect((await signIn(strict, 'old@example.com')).status).toBe(201);
      expect(acc.accountId).toBeTruthy();
    });

    it('resend answers 202 for every address and mails only an existing unverified account, replacing the earlier token', async () => {
      const h = await make();
      await createAccount(h, 'ana@example.com');
      const first = lastMail(h, 'ana@example.com').token;
      const unknown = await call(h, 'POST', '/accounts/verify/resend', { body: { email: 'nobody@example.com' } });
      expect(unknown.status).toBe(202);
      expect(unknown.body).toEqual({ accepted: true });
      expect(h.mailer.sent.filter((m) => m.to === 'nobody@example.com')).toHaveLength(0);
      const known = await call(h, 'POST', '/accounts/verify/resend', { body: { email: 'ANA@example.com' } });
      expect(known.status).toBe(202);
      expect(known.body).toEqual(unknown.body); // the same answer: it does not say which addresses exist
      const second = lastMail(h, 'ana@example.com').token;
      expect(second).not.toBe(first);
      expect((await call(h, 'POST', '/accounts/verify', { body: { token: first } })).status).toBe(422); // replaced
      expect((await call(h, 'POST', '/accounts/verify', { body: { token: second } })).status).toBe(200);
      const before = h.mailer.sent.length;
      expect((await call(h, 'POST', '/accounts/verify/resend', { body: { email: 'ana@example.com' } })).status).toBe(202); // verified now: nothing sent
      expect(h.mailer.sent.length).toBe(before);
    });
  });

  describe('password reset', () => {
    it('forgot is 202 for any address and mails a one-hour token to an existing one', async () => {
      const h = await make();
      await createAccount(h, 'ana@example.com');
      const before = h.mailer.sent.length;
      const unknown = await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'nobody@example.com' } });
      const known = await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } });
      expect([unknown.status, known.status]).toEqual([202, 202]);
      expect(known.body).toEqual(unknown.body);
      expect(h.mailer.sent.length).toBe(before + 1);
      expect(lastMail(h, 'ana@example.com').text).toMatch(/one hour/);
    });

    it('reset sets the password, revokes every session, spends the token and unlocks the lockout', async () => {
      const h = await make();
      await createAccount(h, 'ana@example.com');
      const phone = (await signIn(h, 'ana@example.com', 'phone')).body.token;
      const laptop = (await signIn(h, 'ana@example.com', 'laptop')).body.token;
      for (let i = 0; i < 5; i++) await call(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: 'not the password', deviceId: 'x' } });
      expect((await signIn(h, 'ana@example.com')).status).toBe(429); // locked out
      await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } });
      const { token } = lastMail(h, 'ana@example.com');
      const reset = await call(h, 'POST', '/accounts/password/reset', { body: { token, password: 'a brand new password' } });
      expect(reset.status).toBe(200);
      expect(reset.body).toMatchObject({ reset: true, sessionsRevoked: 2 });
      expect((await call(h, 'GET', '/me', { token: phone })).status).toBe(401);
      expect((await call(h, 'GET', '/me', { token: laptop })).status).toBe(401);
      expect((await signIn(h, 'ana@example.com', 'dev-1', PASSWORD)).status).toBe(401); // the old password is gone
      expect((await signIn(h, 'ana@example.com', 'dev-1', 'a brand new password')).status).toBe(201); // and the lockout with it
      expect((await call(h, 'POST', '/accounts/password/reset', { body: { token, password: 'yet another password' } })).body.error).toBe('invalid-token');
    });

    it('a weak password does not spend the token; a token older than an hour, or of the other purpose, is refused', async () => {
      const h = await make();
      await createAccount(h, 'ana@example.com');
      const verifyToken = lastMail(h, 'ana@example.com').token;
      await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } });
      const { token } = lastMail(h, 'ana@example.com');
      const weak = await call(h, 'POST', '/accounts/password/reset', { body: { token, password: 'short' } });
      expect(weak.status).toBe(422);
      expect(weak.body.error).toBe('weak-password');
      expect((await call(h, 'POST', '/accounts/password/reset', { body: { token: verifyToken, password: 'a long enough password' } })).body.error).toBe('invalid-token');
      h.clock.advance(HOUR + 1000);
      expect((await call(h, 'POST', '/accounts/password/reset', { body: { token, password: 'a long enough password' } })).body.error).toBe('invalid-token');
    });

    it('a reset also confirms the address, and a second request replaces the first token', async () => {
      const h = await make();
      const acc = await createAccount(h, 'ana@example.com');
      await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } });
      const first = lastMail(h, 'ana@example.com').token;
      await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } });
      const second = lastMail(h, 'ana@example.com').token;
      expect((await call(h, 'POST', '/accounts/password/reset', { body: { token: first, password: 'a long enough password' } })).status).toBe(422);
      expect((await call(h, 'POST', '/accounts/password/reset', { body: { token: second, password: 'a long enough password' } })).status).toBe(200);
      expect((await h.store.getAccount(acc.accountId))?.verifiedAt).toBeDefined();
    });

    it('limits how many mails one address can ask for in an hour, without changing the answer', async () => {
      const h = await make({ limits: { recovery: { max: 1000, windowSec: 3600 } } });
      await createAccount(h, 'ana@example.com');
      const before = h.mailer.sent.length;
      const answers: number[] = [];
      for (let i = 0; i < 6; i++) answers.push((await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } })).status);
      expect(answers).toEqual([202, 202, 202, 202, 202, 202]);
      expect(h.mailer.sent.length - before).toBe(3);
      h.clock.advance(HOUR + 1000);
      await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } });
      expect(h.mailer.sent.length - before).toBe(4);
    });
  });

  describe('sessions', () => {
    it('lists the live sessions with the current one marked, and ends one or all the others', async () => {
      const h = await make({ policy: { requireVerification: false } });
      const ana = await member(h, 'ana@example.com', 'laptop');
      const phone = await signIn(h, 'ana@example.com', 'phone');
      const tablet = await signIn(h, 'ana@example.com', 'tablet');
      const bob = await member(h, 'bob@example.com', 'bobs-laptop');
      h.clock.advance(10 * 60 * 1000);
      await call(h, 'GET', '/me', { token: phone.body.token }); // stamps lastSeenAt
      const list = await call(h, 'GET', '/me/sessions', { token: phone.body.token });
      expect(list.status).toBe(200);
      expect(list.body.sessions).toHaveLength(3);
      expect(list.body.sessions.map((s: any) => [s.deviceId, s.current])).toEqual(expect.arrayContaining([['laptop', false], ['phone', true], ['tablet', false]]));
      const phoneRow = list.body.sessions.find((s: any) => s.deviceId === 'phone');
      expect(phoneRow).toMatchObject({ platform: 'test', lastSeenAt: h.clock.now() });
      expect(JSON.stringify(list.body)).not.toMatch(/tokenHash|passwordHash/);
      expect(JSON.stringify(list.body)).not.toContain(bob.learnerId);
      // another learner's session is "not found", never "forbidden"
      const bobsId = (await call(h, 'GET', '/me/sessions', { token: bob.token })).body.sessions[0].sessionId;
      expect((await call(h, 'DELETE', `/me/sessions/${bobsId}`, { token: phone.body.token })).status).toBe(404);
      expect((await call(h, 'GET', '/me', { token: bob.token })).status).toBe(200);
      // end the tablet
      const tabletId = list.body.sessions.find((s: any) => s.deviceId === 'tablet').sessionId;
      expect((await call(h, 'DELETE', `/me/sessions/${tabletId}`, { token: phone.body.token })).status).toBe(204);
      expect((await call(h, 'GET', '/me', { token: tablet.body.token })).status).toBe(401);
      expect((await call(h, 'DELETE', `/me/sessions/${tabletId}`, { token: phone.body.token })).status).toBe(404); // already ended
      // end everything but this one
      const rest = await call(h, 'DELETE', '/me/sessions', { token: phone.body.token });
      expect(rest.status).toBe(200);
      expect(rest.body).toEqual({ revoked: 1 });
      expect((await call(h, 'GET', '/me', { token: ana.token })).status).toBe(401);
      expect((await call(h, 'GET', '/me', { token: phone.body.token })).status).toBe(200);
      expect((await call(h, 'GET', '/me/sessions', { token: phone.body.token })).body.sessions).toHaveLength(1);
    });

    it('does not list expired sessions', async () => {
      const h = await make({ policy: { requireVerification: false } });
      await createAccount(h, 'ana@example.com');
      const old = (await signIn(h, 'ana@example.com', 'old')).body.token;
      h.clock.advance(31 * DAY);
      const fresh = (await signIn(h, 'ana@example.com', 'new')).body.token;
      expect((await call(h, 'GET', '/me', { token: old })).status).toBe(401);
      expect((await call(h, 'GET', '/me/sessions', { token: fresh })).body.sessions.map((s: any) => s.deviceId)).toEqual(['new']);
    });
  });

  describe('export', () => {
    it('is one attachment with the learner\'s data and nothing of anyone else\'s', async () => {
      const h = await make({ policy: { requireVerification: false } });
      const ana = await member(h, 'ana@example.com');
      const bob = await member(h, 'bob@example.com');
      const aEvent = lookupEvent(ana, { enrolmentId: ana.enrolmentId });
      const bEvent = lookupEvent(bob, { enrolmentId: bob.enrolmentId, subject: { itemIds: ['form:sq:bobsecret'], sentenceKey: 'bb' } });
      expect((await call(h, 'POST', '/events', { token: ana.token, body: { events: [aEvent] } })).status).toBe(200);
      expect((await call(h, 'POST', '/events', { token: bob.token, body: { events: [bEvent] } })).status).toBe(200);
      const put = (who: typeof ana, id: string, body: string) => call(h, 'PUT', `/documents/${id}`, { token: who.token, body: { doc: { languageId: 'sq', kind: 'note', title: id, body }, expectedRevision: 0 } });
      expect((await put(ana, 'a-note', 'ana private words')).status).toBe(200);
      expect((await put(bob, 'b-note', 'bob private words')).status).toBe(200);

      const r = await call(h, 'GET', '/me/export', { token: ana.token });
      expect(r.status).toBe(200);
      expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="go-repository-export-2026-10-08\.json"$/);
      expect(r.body).toMatchObject({ format: 'go-repository-export@1', learnerId: ana.learnerId });
      expect(r.body.account).toEqual({ accountId: expect.any(String), email: 'ana@example.com', createdAt: expect.any(String) });
      expect(r.body.enrolments).toHaveLength(1);
      expect(r.body.events.map((e: any) => e.id)).toContain(aEvent.id);
      expect(r.body.documents.map((d: any) => d.body)).toEqual(['ana private words']);
      expect(r.body.units.map((u: any) => u.unitId)).toContain('form:sq:shtëpinë');
      expect(Array.isArray(r.body.analyses)).toBe(true);
      expect(Array.isArray(r.body.sessions)).toBe(true);
      expect(r.body.securityEvents.map((e: any) => e.kind)).toContain('sign-in');
      // the whole document: no hash, no token, and not one trace of the other learner
      expect(r.text).not.toMatch(/passwordHash|fake\$|tokenHash/);
      expect(r.text).not.toContain(ana.token);
      for (const secret of [bob.learnerId, 'bob@example.com', bEvent.id, 'bob private words', 'bobsecret', bob.token, bob.enrolmentId]) expect(r.text, secret).not.toContain(secret);
      // it can be restored by the store's own importer
      const { importLearner } = await import('../../../packages/repository-store/src');
      const target = createMemoryStore();
      const summary = await importLearner(target, r.body as never);
      expect(summary).toBeDefined();
      expect((await target.list({ learnerId: ana.learnerId })).map((e) => e.id)).toContain(aEvent.id);
    });

    it('is rate limited per account, answers 429 with Retry-After, and is noted in the security log', async () => {
      const h = await make({ policy: { requireVerification: false }, limits: { export: { max: 3, windowSec: 3600 } } });
      const ana = await member(h, 'ana@example.com');
      const bob = await member(h, 'bob@example.com');
      for (let i = 0; i < 3; i++) expect((await call(h, 'GET', '/me/export', { token: ana.token })).status).toBe(200);
      const limited = await call(h, 'GET', '/me/export', { token: ana.token });
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(limited.body).toMatchObject({ error: 'rate-limited', rule: 'export' });
      expect((await call(h, 'GET', '/me/export', { token: bob.token })).status).toBe(200); // another account has its own allowance
      h.clock.advance(HOUR);
      expect((await call(h, 'GET', '/me/export', { token: ana.token })).status).toBe(200);
      const log = await call(h, 'GET', '/me/security-events?limit=500', { token: ana.token });
      expect(log.body.events.filter((e: any) => e.kind === 'export-requested')).toHaveLength(4);
    });
  });

  describe('deletion with a grace period', () => {
    async function ready() {
      const h = await make({ policy: { requireVerification: false } });
      const ana = await member(h, 'ana@example.com');
      const bob = await member(h, 'bob@example.com');
      await call(h, 'POST', '/lookup', { token: ana.token, body: { languageId: 'sq', surface: 'shtëpinë', sentence: 'Shtëpinë e kam.' } }); // a shared linguistic row
      await call(h, 'POST', '/events', { token: ana.token, body: { events: [lookupEvent(ana, { enrolmentId: ana.enrolmentId }), makeEvent(ana, { enrolmentId: ana.enrolmentId })] } });
      await call(h, 'POST', '/events', { token: bob.token, body: { events: [lookupEvent(bob, { enrolmentId: bob.enrolmentId })] } });
      await call(h, 'PUT', '/documents/a-note', { token: ana.token, body: { doc: { languageId: 'sq', kind: 'note', body: 'ana words' }, expectedRevision: 0 } });
      return { h, ana, bob };
    }

    it('rejects a wrong password, then schedules: 202 with the due date, every OTHER session revoked (the asking one stays, to show the date and cancel), the account flagged', async () => {
      const { h, ana } = await ready();
      const other = (await signIn(h, 'ana@example.com', 'other')).body.token;
      const wrong = await call(h, 'DELETE', '/me', { token: ana.token, body: { password: 'not the password' } });
      expect(wrong.status).toBe(401);
      expect((await call(h, 'GET', '/me', { token: ana.token })).status).toBe(200); // nothing happened
      const asked = await call(h, 'DELETE', '/me', { token: ana.token, body: { password: PASSWORD } });
      expect(asked.status).toBe(202);
      expect(asked.body).toMatchObject({ deletionRequestedAt: h.clock.now(), graceDays: 14, scheduledPurgeAt: asked.body.deletionDueAt });
      expect(Date.parse(asked.body.deletionDueAt) - Date.parse(h.clock.now())).toBe(14 * DAY);
      expect((await call(h, 'GET', '/me', { token: other })).status).toBe(401);
      const mine = await call(h, 'GET', '/me', { token: ana.token });
      expect(mine.status).toBe(200); // the session that asked stays signed in, and sees the date
      expect(mine.body.account).toMatchObject({ scheduledPurgeAt: asked.body.deletionDueAt });
      const account = await h.store.getAccountByEmail('ana@example.com');
      expect(account).toMatchObject({ deletionRequestedAt: h.clock.now(), deletionDueAt: asked.body.deletionDueAt });
      // nothing is erased yet
      expect(await h.store.head(ana.learnerId)).toBeGreaterThan(0);
    });

    it('lets the learner sign in to cancel, and only to cancel, look, export and sign out', async () => {
      const { h, ana } = await ready();
      await call(h, 'DELETE', '/me', { token: ana.token, body: { password: PASSWORD } });
      const again = await signIn(h, 'ana@example.com', 'phone');
      expect(again.status).toBe(201);
      expect(again.body).toMatchObject({ deletionRequestedAt: expect.any(String), deletionDueAt: expect.any(String) });
      const t = again.body.token;
      const blocked = await call(h, 'GET', '/events', { token: t });
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject({ error: 'deletion-pending', cancel: { method: 'POST', path: '/me/delete/cancel' } });
      expect((await call(h, 'POST', '/sync/push', { token: t, body: {} })).status).toBe(403);
      expect((await call(h, 'GET', '/me', { token: t })).body.account).toMatchObject({ deletionDueAt: again.body.deletionDueAt });
      expect((await call(h, 'GET', '/me/export', { token: t })).status).toBe(200);
      const cancelled = await call(h, 'POST', '/me/delete/cancel', { token: t });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body).toEqual({ cancelled: true });
      expect((await call(h, 'GET', '/events', { token: t })).status).toBe(200); // the account works again
      expect((await call(h, 'POST', '/me/delete/cancel', { token: t })).status).toBe(409); // nothing left to cancel
      expect((await h.store.getAccountByEmail('ana@example.com'))?.deletionDueAt).toBeUndefined();
      // a cancelled deletion is not purged
      h.clock.advance(30 * DAY);
      expect((await runMaintenance(h.store, { now: h.clock.now })).purged).toBe(0);
      expect(await h.store.head(ana.learnerId)).toBeGreaterThan(0);
    });

    it('asking twice keeps the first due date', async () => {
      const { h, ana } = await ready();
      const first = await call(h, 'DELETE', '/me', { token: ana.token, body: { password: PASSWORD } });
      h.clock.advance(3 * DAY);
      const t = (await signIn(h, 'ana@example.com', 'phone')).body.token;
      const second = await call(h, 'DELETE', '/me', { token: t, body: { password: PASSWORD } });
      expect(second.status).toBe(202);
      expect(second.body.deletionDueAt).toBe(first.body.deletionDueAt);
    });

    it('purges only after the grace: the learner\'s data goes, another learner\'s and the shared facts stay, and the audit line names no one', async () => {
      const { h, ana, bob } = await ready();
      const unitsBefore = await h.store.findUnits({ languageId: 'sq' });
      expect(unitsBefore.length).toBeGreaterThan(0);
      await call(h, 'DELETE', '/me', { token: ana.token, body: { password: PASSWORD } });
      h.clock.advance(14 * DAY - 1000);
      expect(await runMaintenance(h.store, { now: h.clock.now })).toMatchObject({ purged: 0 });
      expect(await h.store.head(ana.learnerId)).toBeGreaterThan(0);
      h.clock.advance(2000);
      const accountId = (await h.store.getAccountByEmail('ana@example.com'))!.accountId;
      const result = await runMaintenance(h.store, { now: h.clock.now });
      expect(result.purged).toBe(1);

      expect(await h.store.getAccountByEmail('ana@example.com')).toBeUndefined();
      expect(await h.store.getLearner(ana.learnerId)).toBeUndefined();
      expect(await h.store.list({ learnerId: ana.learnerId })).toEqual([]);
      expect(await h.store.head(ana.learnerId)).toBe(0);
      expect(await h.store.listDocuments(ana.learnerId)).toEqual([]);
      expect(await h.store.listEnrolments(ana.learnerId)).toEqual([]);
      expect(await h.store.security!.listSecurityEvents(ana.learnerId)).toEqual([]);
      expect((await signIn(h, 'ana@example.com')).status).toBe(401);
      // others and shared facts remain
      expect(await h.store.head(bob.learnerId)).toBeGreaterThan(0);
      expect((await call(h, 'GET', '/me', { token: bob.token })).status).toBe(200);
      expect((await h.store.findUnits({ languageId: 'sq' })).length).toBe(unitsBefore.length);
      // the address can be used again
      expect((await call(h, 'POST', '/accounts', { body: { email: 'ana@example.com', password: PASSWORD } })).status).toBe(201);
      // the purge audit line: kind, a digest, counts. No learner id, no email, no account id.
      const audit = await purgeAuditLines(h);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ kind: 'deletion-purged', subjectRef: expect.stringMatching(/^[0-9a-f]{16}$/) });
      const line = JSON.stringify(audit[0]);
      for (const personal of [ana.learnerId, 'ana@example.com', accountId, ana.token]) expect(line).not.toContain(personal);
      expect(audit[0]!.detail).toMatch(/^events=\d+ documents=1 knowledge=\d+$/);
    });

    it('keeps the old immediate deletion with the account email', async () => {
      const { h, ana } = await ready();
      expect((await call(h, 'DELETE', '/me', { token: ana.token, body: { confirmEmail: 'ana@example.com' } })).status).toBe(204);
      expect(await h.store.head(ana.learnerId)).toBe(0);
    });

    it('counts wrong passwords against the lockout', async () => {
      const { h, ana } = await ready();
      for (let i = 0; i < 5; i++) expect((await call(h, 'DELETE', '/me', { token: ana.token, body: { password: `wrong password ${i}` } })).status).toBe(401);
      const locked = await call(h, 'DELETE', '/me', { token: ana.token, body: { password: PASSWORD } });
      expect(locked.status).toBe(429);
      expect(locked.headers.get('retry-after')).toBe('900');
    });

    /** The security-log lines that name no learner. */
    const purgeAuditLines = (h: Hardening) => h.store.security!.listSecurityEvents(null, 1000);
  });

  describe('the security log', () => {
    it('records the learner\'s own events, newest first, with no secret in any of them', async () => {
      const h = await make();
      const acc = await createAccount(h, 'ana@example.com');
      const s = await signIn(h, 'ana@example.com', 'phone');
      await call(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: 'a wrong password!!', deviceId: 'x' } });
      h.clock.advance(1000);
      await call(h, 'POST', '/accounts/password/forgot', { body: { email: 'ana@example.com' } });
      await call(h, 'POST', '/accounts/verify', { body: { token: lastMailOfKind(h, /confirm/i).token } });
      await call(h, 'DELETE', '/sessions/current', { token: s.body.token });
      h.clock.advance(1000);
      const t = (await signIn(h, 'ana@example.com', 'again')).body.token;
      const events = (await call(h, 'GET', '/me/security-events', { token: t })).body.events;
      const kinds = events.map((e: any) => e.kind);
      expect(kinds).toEqual(expect.arrayContaining(['account-created', 'email-verification-sent', 'sign-in', 'sign-in-failed', 'password-reset-requested', 'email-verified', 'sign-out']));
      expect(events.map((e: any) => e.at)).toEqual([...events.map((e: any) => e.at)].sort().reverse());
      expect(events[0].kind).toBe('sign-in');
      const text = JSON.stringify(events);
      for (const secret of [PASSWORD, 'a wrong password!!', s.body.token, t, lastMail(h, 'ana@example.com').token, acc.learnerId, 'ana@example.com']) expect(text, secret).not.toContain(secret);
      expect((await call(h, 'GET', '/me/security-events?limit=abc', { token: t })).status).toBe(422);
      expect((await call(h, 'GET', '/me/security-events?limit=2', { token: t })).body.events).toHaveLength(2);
    });

    it('shows a learner no one else\'s lines', async () => {
      const h = await make({ policy: { requireVerification: false } });
      const ana = await member(h, 'ana@example.com');
      const bob = await member(h, 'bob@example.com');
      await call(h, 'GET', '/me/export', { token: bob.token });
      const mine = (await call(h, 'GET', '/me/security-events', { token: ana.token })).body.events;
      expect(mine.every((e: any) => e.kind !== 'export-requested')).toBe(true);
      expect(await h.store.security!.listSecurityEvents(bob.learnerId)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'export-requested' })]));
    });
  });
});

function lastMailOfKind(h: Hardening, subject: RegExp): { token: string } {
  const m = [...h.mailer.sent].reverse().find((x) => subject.test(x.subject));
  if (!m) throw new Error('no such mail');
  return { token: m.text.split('\n').filter((l) => /^[A-Za-z0-9_-]{43}$/.test(l.trim())).pop()!.trim() };
}

describe('the purge audit line, read from SQLite directly', () => {
  it('has a NULL learner and no personal data', async () => {
    const path = join(tmp, `audit-${++n}.sqlite`);
    const h = await hardening((now) => openSqliteStore(path, { now }), { policy: { requireVerification: false } });
    const ana = await member(h, 'ana@example.com');
    await call(h, 'DELETE', '/me', { token: ana.token, body: { password: PASSWORD } });
    h.clock.advance(15 * DAY);
    await runMaintenance(h.store, { now: h.clock.now });
    const raw = new DatabaseSync(path);
    const rows = raw.prepare('SELECT * FROM security_events').all() as Array<Record<string, unknown>>;
    raw.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'deletion-purged', learner_id: null, device_id: null });
    expect(JSON.stringify(rows)).not.toMatch(/ana@example|learner-|@/);
  });
});

describe('a store without the security port', () => {
  it('still creates accounts and signs in; the new routes answer 501', async () => {
    const h = await hardening((now) => { const s = createMemoryStore({ now }); delete s.security; return s; }, { policy: { requireVerification: true } });
    await createAccount(h, 'ana@example.com');
    h.clock.advance(60 * DAY);
    expect((await signIn(h, 'ana@example.com')).status).toBe(201); // nothing to verify against: it does not lock anyone out
    const t = (await signIn(h, 'ana@example.com')).body.token;
    expect((await call(h, 'GET', '/me/sessions', { token: t })).status).toBe(501);
    expect((await call(h, 'POST', '/accounts/verify', { body: { token: 'x'.repeat(43) } })).status).toBe(501);
    expect((await call(h, 'DELETE', '/me', { token: t, body: { password: PASSWORD } })).status).toBe(501);
  });
});
