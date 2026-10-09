// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOCKOUT_ATTEMPTS, LOCKOUT_WINDOW_MS, SESSION_TTL_MS } from '../../../packages/repository-service/src/handler';
import { createHarness, lookupEvent, makeEvent, raw, signUp } from './fakes';

describe('accounts', () => {
  it('creates a learner and an account and never returns the hash', async () => {
    const h = createHarness();
    const r = await raw(h, 'POST', '/accounts', { body: { email: 'Ana@Example.com ', password: 'a long enough password', displayName: 'Ana' } });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual(['accountId', 'learnerId']);
    expect(JSON.stringify(r.body)).not.toMatch(/hash|scrypt|fake\$/i);
    // the email is stored normalised, the learner carries the display name
    const account = await h.store.getAccountByEmail('ana@example.com');
    expect(account?.learnerId).toBe(r.body.learnerId);
    expect((await h.store.getLearner(r.body.learnerId))?.displayName).toBe('Ana');
  });

  it('refuses a short password (422 weak-password), a bad email (422) and a duplicate (409, case-insensitive)', async () => {
    const h = createHarness();
    expect((await raw(h, 'POST', '/accounts', { body: { email: 'a@b.co', password: 'too short' } })).body.error).toBe('weak-password');
    expect((await raw(h, 'POST', '/accounts', { body: { email: 'a@b.co', password: 'too short' } })).status).toBe(422);
    expect((await raw(h, 'POST', '/accounts', { body: { email: 'not an email', password: 'long enough password' } })).status).toBe(422);
    expect((await raw(h, 'POST', '/accounts', { body: { email: 'a@b.co', password: 'long enough password' } })).status).toBe(201);
    const dup = await raw(h, 'POST', '/accounts', { body: { email: 'A@B.co', password: 'another long password' } });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('email-taken');
  });

  it('stores neither the plaintext password nor the token; only the token digest', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const dump = h.store.dump();
    expect(dump).not.toContain(s.password);
    expect(dump).not.toContain(s.token);
    expect(dump).toContain(h.crypto.sha256(s.token));
  });
});

describe('sessions', () => {
  it('returns the token exactly once, with the learner and a 30-day expiry', async () => {
    const h = createHarness();
    const created = await raw(h, 'POST', '/accounts', { body: { email: 'ana@example.com', password: 'a long enough password' } });
    const s = await raw(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: 'a long enough password', deviceId: 'phone', platform: 'ios' } });
    expect(s.status).toBe(201);
    expect(s.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    expect(s.body.learnerId).toBe(created.body.learnerId);
    expect(Date.parse(s.body.expiresAt) - Date.parse(h.clock.now())).toBe(SESSION_TTL_MS);
    const me = await raw(h, 'GET', '/me', { token: s.body.token });
    expect(me.status).toBe(200);
    // no later response repeats the token or exposes any hash
    expect(JSON.stringify(me.body)).not.toContain(s.body.token);
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|tokenHash|fake\$/);
    expect(me.body.devices.map((d: { deviceId: string }) => d.deviceId)).toEqual(['phone']);
    expect(me.body.account.email).toBe('ana@example.com');
  });

  it('a wrong password is 401 with no learner id, and an unknown email takes the same verification path', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com', 'dev-1', { enrol: false });
    const before = h.crypto.calls.verify;
    const wrong = await raw(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: 'not the password', deviceId: 'd' } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('bad-credentials');
    expect(JSON.stringify(wrong.body)).not.toContain(s.learnerId);
    expect(h.crypto.calls.verify).toBe(before + 1);
    const unknown = await raw(h, 'POST', '/sessions', { body: { email: 'nobody@example.com', password: 'not the password', deviceId: 'd' } });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body); // indistinguishable
    expect(h.crypto.calls.verify).toBe(before + 2); // a hash was still verified (the throw-away one)
    expect(h.crypto.calls.verifiedHashes.at(-1)).toMatch(/^fake\$/);
  });

  it(`locks an email for ${LOCKOUT_WINDOW_MS / 60000} minutes after ${LOCKOUT_ATTEMPTS} failures (429), even for the right password`, async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com', 'dev-1', { enrol: false });
    const bad = () => raw(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: 'wrong wrong wrong', deviceId: 'd' } });
    for (let i = 0; i < LOCKOUT_ATTEMPTS; i++) { expect((await bad()).status).toBe(401); h.clock.advance(1000); }
    const good = { body: { email: 'ana@example.com', password: s.password, deviceId: 'd' } };
    const locked = await raw(h, 'POST', '/sessions', good);
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('too-many-attempts');
    expect(locked.headers.get('retry-after')).toBeTruthy();
    expect((await bad()).status).toBe(429);
    h.clock.advance(LOCKOUT_WINDOW_MS + 1000);
    expect((await raw(h, 'POST', '/sessions', good)).status).toBe(201);
    // success clears the count
    for (let i = 0; i < LOCKOUT_ATTEMPTS - 1; i++) await bad();
    expect((await raw(h, 'POST', '/sessions', good)).status).toBe(201);
  });

  it('counts unknown emails too, so a 429 does not reveal which emails exist', async () => {
    const h = createHarness();
    for (let i = 0; i < LOCKOUT_ATTEMPTS; i++) await raw(h, 'POST', '/sessions', { body: { email: 'ghost@example.com', password: 'whatever it is', deviceId: 'd' } });
    expect((await raw(h, 'POST', '/sessions', { body: { email: 'ghost@example.com', password: 'whatever it is', deviceId: 'd' } })).status).toBe(429);
  });

  it('401 for a missing, malformed, unknown, expired or revoked token', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com', 'dev-1', { enrol: false });
    expect((await raw(h, 'GET', '/me')).status).toBe(401);
    expect((await raw(h, 'GET', '/me', { headers: { Authorization: 'Basic abc' } })).status).toBe(401);
    expect((await raw(h, 'GET', '/me', { token: 'x'.repeat(43) })).status).toBe(401);
    expect((await raw(h, 'GET', '/me', { token: s.token })).status).toBe(200);
    // expired: 30 days and a second later
    h.clock.advance(SESSION_TTL_MS + 1000);
    const expired = await raw(h, 'GET', '/me', { token: s.token });
    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe('unauthorized');
    expect(expired.headers.get('www-authenticate')).toBe('Bearer');
    // revoked
    h.clock.set('2026-10-08T10:00:00.000Z');
    const s2 = await raw(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: s.password, deviceId: 'd2' } });
    expect((await raw(h, 'DELETE', '/sessions/current', { token: s2.body.token })).status).toBe(204);
    expect((await raw(h, 'GET', '/me', { token: s2.body.token })).status).toBe(401);
    expect((await raw(h, 'GET', '/me', { token: s.token })).status).toBe(200); // the other session is untouched
  });

  it('every data route needs a session; only health, account creation and sign-in are open', async () => {
    const h = createHarness();
    const routes: Array<[string, string]> = [
      ['GET', '/me'], ['GET', '/enrolments'], ['POST', '/enrolments'], ['GET', '/packs'], ['GET', '/units/x'], ['POST', '/lookup'], ['POST', '/events'], ['GET', '/events'],
      ['GET', '/knowledge'], ['GET', '/candidates'], ['GET', '/preferences'], ['POST', '/reviews'], ['POST', '/writing'], ['GET', '/documents'], ['GET', '/documents/d'],
      ['PUT', '/documents/d'], ['DELETE', '/documents/d'], ['POST', '/corrections'], ['POST', '/sync/push'], ['POST', '/sync/pull'], ['GET', '/export'], ['POST', '/tombstones'],
      ['DELETE', '/me'], ['DELETE', '/sessions/current'],
    ];
    for (const [m, p] of routes) expect((await raw(h, m, p, { body: m === 'GET' || m === 'DELETE' ? undefined : {} })).status, `${m} ${p}`).toBe(401);
    expect((await raw(h, 'GET', '/health')).status).toBe(200);
  });

  it('a session on a disabled account stops working', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com', 'dev-1', { enrol: false });
    const acc = (await h.store.getAccountByEmail('ana@example.com'))!;
    await h.store.putAccount({ ...acc, disabledAt: h.clock.now() });
    expect((await raw(h, 'GET', '/me', { token: s.token })).status).toBe(401);
    expect((await raw(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: s.password, deviceId: 'd' } })).status).toBe(401);
  });
});

describe('/me', () => {
  it('shows the learner, the enrolments, the devices and the latest word on each consent', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const ev = (kind: 'ConsentGiven' | 'ConsentWithdrawn', consent: string, at: string) => makeEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId }, { kind, producer: { app: 'golearn-app', version: '1', deviceId: 'dev-1' }, subject: {}, payload: { consent }, at });
    await s.api.appendEvents([ev('ConsentGiven', 'analytics', '2026-10-01T10:00:00.000Z'), ev('ConsentGiven', 'sync', '2026-10-01T10:00:00.000Z'), ev('ConsentWithdrawn', 'analytics', '2026-10-02T10:00:00.000Z')]);
    const me = await s.api.me();
    expect(me.ok && me.data.enrolments).toHaveLength(1);
    expect(me.ok && me.data.consents.sort((a, b) => a.key.localeCompare(b.key)).map((c) => [c.key, c.given])).toEqual([['analytics', false], ['sync', true]]);
    expect(me.ok && me.data.learner?.learnerId).toBe(s.learnerId);
  });

  it("events with the learner's own id are accepted", async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const r = await s.api.appendEvents([lookupEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId })]);
    expect(r.ok && r.data.stored).toBe(1);
  });
});
