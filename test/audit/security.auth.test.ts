// @vitest-environment node
/**
 * Security audit (1) authentication and (9) logging, against the Repository service over the REAL stack
 * (memory and SQLite stores, real engine, real linguistics). Raw requests where the client would hide the evidence.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LOCKOUT_ATTEMPTS, LOCKOUT_WINDOW_MS, SESSION_TTL_MS } from '../../packages/repository-service/src';
import { PASSWORD, createStack, dumpStore, fastCrypto, lookup, nodeCrypto, raw, signUp, type Stack, type StoreKind } from './security.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind, opts: Parameters<typeof createStack>[1] = {}): Stack => { const s = createStack(kind, opts); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const LOGIN = (email: string, password: string, deviceId = 'dev-x') => ({ email, password, deviceId });
const UNAUTH = { error: 'unauthorized', message: 'Sign in again: this session is missing, unknown, expired or ended.' };

describe.each(['memory', 'sqlite'] as const)('authentication (%s store)', (kind) => {
  it('a wrong password is refused with 401 bad-credentials and no token; the right one afterwards still works', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    const bad = await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, 'not the password at all') });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('bad-credentials');
    expect(bad.text).not.toMatch(/token|learnerId/);
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, PASSWORD) })).status).toBe(201);
  });

  it('an unknown email and a wrong password give the SAME status, body and headers, and the same amount of password work', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    const before = { ...fastCrypto.calls };
    const wrong = await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, 'wrong password!!') });
    const mid = { ...fastCrypto.calls };
    const unknown = await raw(s, 'POST', '/sessions', { body: LOGIN('nobody@example.com', 'wrong password!!') });
    const after = { ...fastCrypto.calls };
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.text).toBe(wrong.text);
    expect([...unknown.headers.entries()].filter(([k]) => k !== 'content-length')).toEqual([...wrong.headers.entries()].filter(([k]) => k !== 'content-length'));
    // one verification each: the unknown email is checked against a throw-away hash, never skipped
    expect(mid.verify - before.verify).toBe(1);
    expect(after.verify - mid.verify).toBe(1);
  });

  it('a disabled (deleted) account is indistinguishable from a wrong password', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    expect((await a.api.deleteMe(a.email)).ok).toBe(true);
    const r = await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, PASSWORD) });
    const wrong = await raw(s, 'POST', '/sessions', { body: LOGIN('nobody@example.com', PASSWORD) });
    expect(r.status).toBe(401);
    expect(r.text).toBe(wrong.text);
  });

  it(`locks an email for ${LOCKOUT_WINDOW_MS / 60000} minutes after ${LOCKOUT_ATTEMPTS} failures, even for the right password; the window then reopens; success resets the count`, async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    for (let i = 0; i < LOCKOUT_ATTEMPTS; i++) expect((await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, `nope-nope-${i}`) })).status).toBe(401);
    const locked = await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, PASSWORD) });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('too-many-attempts');
    expect(locked.headers.get('retry-after')).toBe('900');
    // case and whitespace do not make a new email
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN('  ANA@Example.COM ', PASSWORD) })).status).toBe(429);
    s.clock.advance(LOCKOUT_WINDOW_MS + 1);
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, PASSWORD) })).status).toBe(201);
    // 4 failures + 1 success + 4 failures is not a lockout
    for (let i = 0; i < LOCKOUT_ATTEMPTS - 1; i++) await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, `nope-${i}-x`) });
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, PASSWORD) })).status).toBe(201);
    for (let i = 0; i < LOCKOUT_ATTEMPTS - 1; i++) await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, `nope-${i}-y`) });
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, PASSWORD) })).status).toBe(201);
  });

  it('the lockout is the same 429 for an unknown email (it reveals nothing about which addresses exist)', async () => {
    const s = make(kind);
    await signUp(s, 'ana@example.com');
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < LOCKOUT_ATTEMPTS + 1; i++) {
      known.push((await raw(s, 'POST', '/sessions', { body: LOGIN('ana@example.com', `bad-bad-${i}`) })).status);
      unknown.push((await raw(s, 'POST', '/sessions', { body: LOGIN('ghost@example.com', `bad-bad-${i}`) })).status);
    }
    expect(unknown).toEqual(known);
    expect(known.at(-1)).toBe(429);
  });

  it('a lockout of one email does not lock another', async () => {
    const s = make(kind);
    await signUp(s, 'ana@example.com');
    const b = await signUp(s, 'ben@example.com');
    for (let i = 0; i < LOCKOUT_ATTEMPTS; i++) await raw(s, 'POST', '/sessions', { body: LOGIN('ana@example.com', `bad-bad-${i}`) });
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN(b.email, PASSWORD) })).status).toBe(201);
  });

  it('malformed, empty, truncated, foreign-scheme and oversized credentials are all the same 401 and never reach a route', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    const t = a.token;
    const headers: Array<Record<string, string>> = [
      {}, { authorization: '' }, { authorization: 'Bearer' }, { authorization: 'Bearer ' }, { authorization: 'Bearer    ' }, { authorization: `Basic ${t}` }, { authorization: `Token ${t}` },
      { authorization: t }, { authorization: `Bearer ${t.slice(0, -1)}` }, { authorization: `Bearer ${t}x` }, { authorization: `Bearer ${t.toUpperCase()}` }, { authorization: `Bearer ${t} ${t}` },
      { authorization: `Bearer ${'A'.repeat(100_000)}` }, { authorization: 'Bearer null' }, { authorization: 'Bearer undefined' }, { authorization: 'Bearer %00' }, { authorization: `Bearer ${encodeURIComponent(t)}%20` },
      { authorization: `Bearer ../${t}` }, { authorization: `Bearer ' OR '1'='1` }, { authorization: `Bearer ${t}'; --` },
    ];
    for (const h of headers) {
      const r = await raw(s, 'GET', '/me', { headers: h });
      expect(r.status, JSON.stringify(h).slice(0, 80)).toBe(401);
      expect(r.body).toEqual(UNAUTH);
      expect(r.headers.get('www-authenticate')).toBe('Bearer');
    }
    // a token in the query string or in the body is not a credential
    expect((await raw(s, 'GET', `/me?token=${t}&access_token=${t}`)).status).toBe(401);
    expect((await raw(s, 'POST', '/events', { body: { token: t, events: [lookup(a)] } })).status).toBe(401);
    // and the right one still works
    expect((await raw(s, 'GET', '/me', { token: t })).status).toBe(200);
  });

  it('a stolen database does not give a working credential: the stored token digest is not itself a token', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    const digest = fastCrypto.sha256(a.token);
    expect((await raw(s, 'GET', '/me', { token: digest })).status).toBe(401);
    expect((await raw(s, 'GET', '/me', { token: fastCrypto.sha256(digest) })).status).toBe(401);
    const dump = await dumpStore(s, [a.learnerId]);
    if (kind === 'sqlite') {
      expect(dump).toContain(digest); // the digest is what is stored ...
      expect(dump).not.toContain(a.token); // ... and the token itself is not
      expect(dump).not.toContain(PASSWORD);
    } else expect(dump).not.toContain(a.token);
  });

  it('an expired session is 401 everywhere, at the expiry instant too; a fresh sign-in works', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    s.clock.advance(SESSION_TTL_MS - 1);
    expect((await raw(s, 'GET', '/me', { token: a.token })).status).toBe(200);
    s.clock.advance(1); // exactly at expiresAt
    for (const [method, path] of [['GET', '/me'], ['GET', '/events'], ['GET', '/export'], ['GET', '/documents'], ['POST', '/events'], ['POST', '/sync/pull'], ['DELETE', '/sessions/current'], ['DELETE', '/me']] as const) {
      expect((await raw(s, method, path, { token: a.token, ...(method === 'POST' ? { body: {} } : {}) })).status, `${method} ${path}`).toBe(401);
    }
    s.clock.advance(SESSION_TTL_MS * 10);
    expect((await raw(s, 'GET', '/me', { token: a.token })).status).toBe(401);
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, PASSWORD) })).status).toBe(201);
  });

  it('after DELETE /sessions/current the token is dead for every route, a second delete is 401, and other sessions of the learner survive', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const second = await s.api().createSession({ email: a.email, password: PASSWORD, deviceId: 'laptop' });
    if (!second.ok) throw new Error('second session');
    expect((await raw(s, 'DELETE', '/sessions/current', { token: a.token })).status).toBe(204);
    for (const [method, path] of [['GET', '/me'], ['GET', '/events'], ['GET', '/knowledge'], ['GET', '/export'], ['GET', '/documents'], ['GET', '/enrolments'], ['DELETE', '/sessions/current']] as const) {
      expect((await raw(s, method, path, { token: a.token })).status, `${method} ${path}`).toBe(401);
    }
    expect((await raw(s, 'POST', '/events', { token: a.token, body: { events: [lookup(a)] } })).status).toBe(401);
    expect((await raw(s, 'POST', '/sync/push', { token: a.token, body: { deviceId: 'phone', clientTime: s.clock.now(), events: [lookup(a)] } })).status).toBe(401);
    expect((await raw(s, 'GET', '/me', { token: second.data.token })).status).toBe(200);
    // nothing was written by the refused calls
    const events = await raw(s, 'GET', '/events', { token: second.data.token });
    expect(events.body.events.filter((e: { kind: string }) => e.kind === 'SelectionLookedUp')).toHaveLength(0);
  });

  it('after DELETE /me the old token, the old password and the old email are all dead, and the data is gone from the raw store', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    await a.api.putDocument('d1', { languageId: 'sq', kind: 'note', body: 'ERASE-ME-BODY-7731' }, 0);
    await a.api.appendEvents([lookup(a)]);
    // a wrong confirmation changes nothing
    expect((await raw(s, 'DELETE', '/me', { token: a.token, body: { confirmEmail: 'someone@else.com' } })).status).toBe(422);
    expect((await raw(s, 'GET', '/me', { token: a.token })).status).toBe(200);
    // another learner's id in the body is refused before anything happens
    const b = await signUp(s, 'ben@example.com');
    expect((await raw(s, 'DELETE', '/me', { token: b.token, body: { learnerId: a.learnerId, confirmEmail: b.email } })).status).toBe(403);
    expect((await raw(s, 'GET', '/me', { token: b.token })).status).toBe(200);
    expect((await raw(s, 'DELETE', '/me', { token: a.token, body: { confirmEmail: a.email } })).status).toBe(204);
    expect((await raw(s, 'GET', '/me', { token: a.token })).status).toBe(401);
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN(a.email, PASSWORD) })).status).toBe(401);
    const dump = await dumpStore(s, [a.learnerId]);
    expect(dump).not.toContain('ERASE-ME-BODY-7731');
    expect(dump).not.toContain(a.token);
    expect(dump).not.toContain(fastCrypto.sha256(a.token));
    // the other learner is untouched
    expect((await b.api.listEvents()).ok).toBe(true);
  });

  it('FINDING (accepted): the lockout is per email, in the service process, so anyone can lock the real owner out of sign-in for 15 minutes with five bad guesses (the owner\'s open sessions keep working)', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    for (let i = 0; i < LOCKOUT_ATTEMPTS; i++) await raw(s, 'POST', '/sessions', { body: LOGIN('ana@example.com', `attacker-guess-${i}`, 'attacker-device') });
    expect((await raw(s, 'POST', '/sessions', { body: LOGIN('ana@example.com', PASSWORD, 'ana-phone') })).status).toBe(429);
    expect((await raw(s, 'GET', '/me', { token: a.token })).status).toBe(200);
  });

  it('FINDING (accepted): POST /accounts answers 409 email-taken, so it confirms that an address has an account', async () => {
    const s = make(kind);
    await signUp(s, 'ana@example.com');
    const r = await raw(s, 'POST', '/accounts', { body: { email: 'ANA@example.com', password: 'another long password' } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('email-taken');
  });

  it('there is no cookie, so a cross-site page cannot ride a session; every response is no-store', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    for (const [method, path] of [['GET', '/me'], ['GET', '/health'], ['GET', '/export'], ['POST', '/sessions']] as const) {
      const r = await raw(s, method, path, { token: a.token, ...(method === 'POST' ? { body: LOGIN(a.email, PASSWORD) } : {}) });
      expect(r.headers.get('set-cookie'), path).toBeNull();
      expect(r.headers.get('cache-control'), path).toBe('no-store');
    }
  });

  it('FIXED S-12: responses carry X-Content-Type-Options: nosniff (user-controlled document bodies are served as JSON)', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    await a.api.putDocument('d1', { languageId: 'sq', kind: 'note', body: '<script>alert(1)</script>' }, 0);
    const r = await raw(s, 'GET', '/documents/d1', { token: a.token });
    expect(r.headers.get('content-type')).toMatch(/^application\/json/);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('passwords and tokens at rest (real scrypt)', () => {
  it('stores a scrypt hash with a random salt, never the password; two accounts with one password get different hashes; the raw file holds only the token digest', async () => {
    const s = make('sqlite', { crypto: nodeCrypto });
    const a = await signUp(s, 'ana@example.com');
    const b = await signUp(s, 'ben@example.com');
    const dump = await dumpStore(s);
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain(a.token);
    expect(dump).not.toContain(b.token);
    const hashes = [...dump.matchAll(/scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+/g)].map((m) => m[0]);
    expect(new Set(hashes).size).toBe(2);
    expect(hashes[0].split('$')[1]).not.toBe(hashes[1].split('$')[1]);
    expect(dump).toContain(nodeCrypto.sha256(a.token));
  });

  it('wrong password and unknown email cost about the same time with real scrypt (no cheap early exit)', async () => {
    const s = make('memory', { crypto: nodeCrypto });
    await signUp(s, 'ana@example.com');
    const time = async (email: string): Promise<number> => {
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        s.clock.advance(LOCKOUT_WINDOW_MS + 1); // keep clear of the lockout
        const t0 = performance.now();
        await raw(s, 'POST', '/sessions', { body: LOGIN(email, `wrong-password-${i}`) });
        samples.push(performance.now() - t0);
      }
      return samples.sort((x, y) => x - y)[1];
    };
    await time('warm@example.com'); // the throw-away hash is made once per service
    const known = await time('ana@example.com');
    const unknown = await time('ghost@example.com');
    expect(unknown).toBeGreaterThan(known / 4);
    expect(known).toBeGreaterThan(unknown / 4);
    expect(unknown).toBeGreaterThan(3); // a scrypt verification was really done (not skipped)
  });
});

describe('logging (service log lines)', () => {
  it.each(['memory', 'sqlite'] as const)('%s: one line per request, METHOD /path status ms, never a body, token, email, password or query string', async (kind) => {
    const s = make(kind);
    const a = await signUp(s, 'ana.private@example.com');
    s.logs.length = 0;
    const secret = 'SECRET-QUERY-VALUE-9911';
    const reqs: Array<[string, string, Record<string, unknown>?]> = [
      ['GET', `/events?learnerId=${a.learnerId}&token=${secret}&email=ana.private@example.com`],
      ['GET', `/me?access_token=${a.token}`],
      ['POST', '/sessions', LOGIN('ana.private@example.com', 'WRONG-PASSWORD-IN-BODY')],
      ['POST', '/sessions', LOGIN('ana.private@example.com', PASSWORD)],
      ['POST', '/accounts', { email: 'new.person@example.com', password: 'a brand new password', displayName: 'DISPLAY-NAME-SECRET' }],
      ['POST', '/events', { events: [lookup(a, { payload: { surface: 'zzz', tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: [], note: 'BODY-SECRET-5521' } })] }],
      ['PUT', '/documents/doc-one', { doc: { languageId: 'sq', kind: 'note', body: 'DOCUMENT-BODY-SECRET-4410', title: 'TITLE-SECRET' }, expectedRevision: 0 }],
      ['GET', '/nonsense?x=1'],
      ['POST', '/events', { events: 'not a list' }],
    ];
    for (const [m, p, body] of reqs) await raw(s, m, p, { token: a.token, ...(body ? { body } : {}) });
    await raw(s, 'POST', '/events', { token: a.token, rawBody: '{"broken": "BROKEN-JSON-SECRET' });
    expect(s.logs).toHaveLength(reqs.length + 1);
    for (const line of s.logs) {
      expect(line, line).toMatch(/^(GET|POST|PUT|DELETE) \/[^\s?#]* \d{3} \d+ms$/);
      for (const bad of [secret, a.token, 'ana.private', 'example.com', 'PASSWORD', 'SECRET', 'learnerId', a.learnerId, PASSWORD, 'BROKEN-JSON']) expect(line).not.toContain(bad);
    }
  });

  it('a server fault is a 500 with no detail in the body, and nothing about the cause in the log', async () => {
    const s = make('memory');
    const a = await signUp(s, 'ana@example.com');
    s.logs.length = 0;
    const boom = 'CAUSE-WITH-PASSWORD-hunter2-AND-TOKEN';
    const original = s.store.getAccount.bind(s.store);
    s.store.getAccount = async () => { throw new Error(boom); };
    const r = await raw(s, 'GET', '/me', { token: a.token });
    s.store.getAccount = original;
    expect(r.status).toBe(500); // authentication needs the account: a fault there stops the request (500), it never lets it through
    expect(r.text).not.toContain('"learner"');
    expect(r.text).not.toContain(boom);
    // a fault after authentication
    const orig2 = s.store.listEnrolments.bind(s.store);
    s.store.listEnrolments = async () => { throw new Error(boom); };
    const r2 = await raw(s, 'GET', '/enrolments', { token: a.token });
    s.store.listEnrolments = orig2;
    expect(r2.status).toBe(500);
    expect(r2.body).toEqual({ error: 'server-error', message: 'The server could not complete the request.' });
    for (const line of s.logs) expect(line).not.toMatch(/CAUSE|hunter2|TOKEN|Error/);
  });

  it('a fault in authentication fails CLOSED (the request is not served)', async () => {
    const s = make('memory');
    const a = await signUp(s, 'ana@example.com');
    s.store.getSessionByTokenHash = async () => { throw new Error('db down'); };
    const r = await raw(s, 'GET', '/export', { token: a.token });
    expect(r.status).toBeGreaterThanOrEqual(401);
    expect(r.text).not.toContain('"events"');
  });
});
