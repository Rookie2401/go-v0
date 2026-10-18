// @vitest-environment node
/**
 * Operations: rate limits (fake clocks), abuse controls, Prometheus metrics, health, structured logs, the mailers and the settings parser.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../packages/repository-store/src';
import { serviceConfigFromEnv } from '../../../packages/repository-service/src/config';
import { createFileMailer, createResendMailer, createSmtpMailer, mailerFromEnv, parseSmtpUrl } from '../../../packages/repository-service/src/mailer';
import { createMetricsRegistry } from '../../../packages/repository-service/src/metrics';
import { runMaintenance } from '../../../packages/repository-service/src/purge';
import { DEFAULT_LIMITS, createRateLimiter, isLoopback, limitsFromEnv, resolveClientIp } from '../../../packages/repository-service/src/ratelimit';
import { MAX_OPEN_BODY_BYTES } from '../../../packages/repository-service/src/handler';
import { DAY, HOUR, PASSWORD, call, createAccount, hardening, member, signIn } from './hardening';

const mem = (now: () => string) => createMemoryStore({ now });

describe('token buckets', () => {
  it('allows a burst of max, then refuses with the seconds until a token exists, and refills continuously', () => {
    let t = 0;
    const lim = createRateLimiter({ ...DEFAULT_LIMITS, signin: { max: 10, windowSec: 60 } }, () => t);
    for (let i = 0; i < 10; i++) expect(lim.take('signin', 'ip-a')).toEqual({ ok: true });
    expect(lim.take('signin', 'ip-a')).toEqual({ ok: false, retryAfterSec: 6 });
    expect(lim.take('signin', 'ip-b')).toEqual({ ok: true }); // another key has its own bucket
    t = 5_999;
    expect(lim.take('signin', 'ip-a').ok).toBe(false);
    t = 6_000;
    expect(lim.take('signin', 'ip-a')).toEqual({ ok: true }); // one token back after 6 s
    expect(lim.take('signin', 'ip-a').ok).toBe(false);
    t = 10 * 60_000;
    for (let i = 0; i < 10; i++) expect(lim.take('signin', 'ip-a').ok).toBe(true); // full again, but never more than max
    expect(lim.take('signin', 'ip-a').ok).toBe(false);
  });

  it('tells a slow rule how long to wait (5 an hour: 12 minutes)', () => {
    let t = 0;
    const lim = createRateLimiter(DEFAULT_LIMITS, () => t);
    for (let i = 0; i < 5; i++) lim.take('signup', 'ip');
    expect(lim.take('signup', 'ip')).toEqual({ ok: false, retryAfterSec: 720 });
    t = 720_000;
    expect(lim.take('signup', 'ip').ok).toBe(true);
  });

  it('forgets buckets that are full again, so memory does not grow with every address ever seen', () => {
    let t = 0;
    const lim = createRateLimiter(DEFAULT_LIMITS, () => t);
    for (let i = 0; i < 50_001; i++) lim.take('general', `ip-${i}`);
    t = 3_600_000;
    lim.take('general', 'newcomer');
    expect(lim.size()).toBeLessThan(10);
  });

  it('reads its rules from the environment and refuses a typo', () => {
    expect(limitsFromEnv({})).toEqual(DEFAULT_LIMITS);
    expect(limitsFromEnv({ RATE_SIGNIN_MAX: '3', RATE_SYNC_PUSH_WINDOW_S: '10' })).toMatchObject({ signin: { max: 3, windowSec: 60 }, syncPush: { max: 60, windowSec: 10 } });
    expect(limitsFromEnv({ RATE_LIMIT: 'off' })).toBeUndefined();
    expect(() => limitsFromEnv({ RATE_SIGNIN_MAX: 'ten' })).toThrow(/RATE_SIGNIN_MAX/);
    expect(() => limitsFromEnv({ RATE_GENERAL_MAX: '0' })).toThrow(/RATE_GENERAL_MAX/);
  });
});

describe('who is calling', () => {
  const h = (xff?: string, cf?: string) => new Headers({ ...(xff ? { 'x-forwarded-for': xff } : {}), ...(cf ? { 'cf-connecting-ip': cf } : {}) });
  it('ignores proxy headers unless the deployment says to trust them', () => {
    expect(resolveClientIp('::ffff:203.0.113.9', h('1.2.3.4'), false)).toBe('203.0.113.9');
    expect(resolveClientIp(undefined, h(), false)).toBe('unknown');
  });
  it('with TRUST_PROXY=1 takes the LAST X-Forwarded-For entry (the one the trusted proxy added), not what the client claimed', () => {
    expect(resolveClientIp('127.0.0.1', h('6.6.6.6, 198.51.100.7'), 'xff')).toBe('198.51.100.7');
    expect(resolveClientIp('127.0.0.1', h(), 'xff')).toBe('127.0.0.1');
  });
  it('with TRUST_PROXY=cloudflare takes CF-Connecting-IP and ignores X-Forwarded-For', () => {
    expect(resolveClientIp('127.0.0.1', h('6.6.6.6', '198.51.100.9'), 'cloudflare')).toBe('198.51.100.9');
    expect(resolveClientIp('127.0.0.1', h('6.6.6.6'), 'cloudflare')).toBe('127.0.0.1');
  });
  it('knows loopback', () => {
    expect(['127.0.0.1', '::1', '127.4.5.6'].every(isLoopback)).toBe(true);
    expect(['10.0.0.1', '203.0.113.9', 'unknown'].some(isLoopback)).toBe(false);
  });
});

describe('limits in the handler (fake clock)', () => {
  it('sign-in: 10 a minute per IP, with Retry-After, per IP, and counted in the metrics', async () => {
    const h = await hardening(mem, { limits: true, withMetrics: {} });
    const attempt = (i: number) => call(h, 'POST', '/sessions', { body: { email: `nobody-${i}@example.com`, password: 'a wrong password', deviceId: 'd' } });
    for (let i = 0; i < 10; i++) expect((await attempt(i)).status).toBe(401);
    const refused = await attempt(10);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('6');
    expect(refused.body).toMatchObject({ error: 'rate-limited', rule: 'signin', retryAfterSec: 6 });
    h.ip.current = '10.0.0.2';
    expect((await attempt(11)).status).toBe(401); // another address is unaffected
    h.ip.current = '10.0.0.1';
    h.clock.advance(6000);
    expect((await attempt(12)).status).toBe(401); // one token back
    expect((await attempt(13)).status).toBe(429);
    const metrics = h.deps.metrics!.registry.render();
    expect(metrics).toContain('go_repository_rate_limited_total{rule="signin"} 2');
  });

  it('keeps the per-email lockout in force as well (5 wrong passwords, then 429 with Retry-After 900)', async () => {
    const h = await hardening(mem, { limits: true });
    await createAccount(h, 'ana@example.com');
    for (let i = 0; i < 5; i++) expect((await call(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: `wrong password ${i}`, deviceId: 'd' } })).status).toBe(401);
    h.clock.advance(HOUR); // the per-IP bucket is full again
    h.clock.advance(1);
    const locked = await signIn(h, 'ana@example.com');
    expect(locked.status).toBe(201); // fifteen minutes passed
  });

  it('account creation: 5 an hour per IP', async () => {
    const h = await hardening(mem, { limits: true });
    for (let i = 0; i < 5; i++) expect((await call(h, 'POST', '/accounts', { body: { email: `u${i}@example.com`, password: PASSWORD } })).status).toBe(201);
    const refused = await call(h, 'POST', '/accounts', { body: { email: 'u5@example.com', password: PASSWORD } });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('720');
    h.ip.current = '10.9.9.9';
    expect((await call(h, 'POST', '/accounts', { body: { email: 'u5@example.com', password: PASSWORD } })).status).toBe(201);
    h.ip.current = '10.0.0.1';
    h.clock.advance(12 * 60 * 1000);
    expect((await call(h, 'POST', '/accounts', { body: { email: 'u6@example.com', password: PASSWORD } })).status).toBe(201);
  });

  it('sync push: 60 a minute per ACCOUNT, whatever the address', async () => {
    const h = await hardening(mem, { limits: { syncPush: { max: 3, windowSec: 60 }, signup: { max: 100, windowSec: 60 }, signin: { max: 100, windowSec: 60 } }, policy: { requireVerification: false } });
    const a = await member(h, 'a@example.com');
    const b = await member(h, 'b@example.com');
    const push = (who: { token: string }) => call(h, 'POST', '/sync/push', { token: who.token, body: { deviceId: 'dev-1', events: [], clientTime: h.clock.now() } });
    for (let i = 0; i < 3; i++) expect((await push(a)).status).not.toBe(429);
    const refused = await push(a);
    expect(refused.status).toBe(429);
    expect(refused.body.rule).toBe('syncPush');
    h.ip.current = '10.7.7.7'; // the same account from elsewhere has the same bucket
    expect((await push(a)).status).toBe(429);
    expect((await push(b)).status).not.toBe(429);
    h.clock.advance(20_000);
    expect((await push(a)).status).not.toBe(429);
  });

  it('every route: a general per-IP limit, with health and metrics exempt', async () => {
    const h = await hardening(mem, { limits: { general: { max: 4, windowSec: 60 } }, withMetrics: {} });
    for (let i = 0; i < 4; i++) expect((await call(h, 'GET', '/nothing-here')).status).toBe(404);
    const refused = await call(h, 'GET', '/nothing-here');
    expect(refused.status).toBe(429);
    expect(refused.body.rule).toBe('general');
    expect((await call(h, 'GET', '/health')).status).toBe(200);
    h.ip.current = '127.0.0.1';
    expect((await call(h, 'GET', '/metrics')).status).toBe(200);
    h.ip.current = '10.0.0.1';
    expect((await call(h, 'OPTIONS', '/me')).status).toBe(204); // preflights are not charged
  });

  it('no limiter, no limits (the in-process and test default)', async () => {
    const h = await hardening(mem);
    for (let i = 0; i < 700; i++) if ((await call(h, 'GET', '/health')).status !== 200) throw new Error('limited');
    expect(h.limiter).toBeUndefined();
  });

  it('caps what an unauthenticated route will read', async () => {
    const h = await hardening(mem);
    const big = JSON.stringify({ email: 'a@example.com', password: PASSWORD, displayName: 'x'.repeat(MAX_OPEN_BODY_BYTES) });
    const r = await call(h, 'POST', '/accounts', { rawBody: big });
    expect(r.status).toBe(413);
    expect(r.body.error).toBe('too-large');
    const s = await call(h, 'POST', '/sessions', { rawBody: big });
    expect(s.status).toBe(413);
    const ok = await call(h, 'POST', '/accounts', { body: { email: 'a@example.com', password: PASSWORD, displayName: 'x'.repeat(100) } });
    expect(ok.status).toBe(201);
  });

  it('still lets a signed-in route carry up to 1 MB and refuses more', async () => {
    const h = await hardening(mem, { policy: { requireVerification: false } });
    const who = await member(h, 'a@example.com');
    const body = (n: number) => ({ doc: { languageId: 'sq', kind: 'note', body: 'x'.repeat(n) }, expectedRevision: 0 });
    expect((await call(h, 'PUT', '/documents/big', { token: who.token, body: body(300_000) })).status).toBe(200);
    expect((await call(h, 'PUT', '/documents/huge', { token: who.token, body: body(1_100_000) })).status).toBe(413);
  });
});

describe('GET /metrics and GET /health', () => {
  it('is not there when the service has no metrics', async () => {
    const h = await hardening(mem);
    expect((await call(h, 'GET', '/metrics')).status).toBe(404);
  });

  it('without a token: answers a request from this machine only, and not one that came through a proxy', async () => {
    const h = await hardening(mem, { withMetrics: {} });
    expect((await call(h, 'GET', '/metrics')).status).toBe(404); // 10.0.0.1
    h.ip.current = '127.0.0.1';
    const ok = await call(h, 'GET', '/metrics');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toMatch(/^text\/plain/);
    expect((await call(h, 'GET', '/metrics', { headers: { 'X-Forwarded-For': '203.0.113.5' } })).status).toBe(404); // a proxy in front: someone else asked
    expect((await call(h, 'GET', '/metrics', { headers: { 'CF-Connecting-IP': '203.0.113.5' } })).status).toBe(404);
  });

  it('with a token: only the bearer, from anywhere', async () => {
    const h = await hardening(mem, { withMetrics: { token: 'scrape-secret-0123456789' } });
    expect((await call(h, 'GET', '/metrics')).status).toBe(404);
    expect((await call(h, 'GET', '/metrics', { token: 'wrong' })).status).toBe(404);
    h.ip.current = '127.0.0.1';
    expect((await call(h, 'GET', '/metrics')).status).toBe(404); // loopback is not enough once a token is set
    h.ip.current = '203.0.113.5';
    expect((await call(h, 'GET', '/metrics', { token: 'scrape-secret-0123456789' })).status).toBe(200);
  });

  it('exposes request counts by route pattern and status, a latency histogram, and nothing personal', async () => {
    const h = await hardening(mem, { withMetrics: { token: 't0k' }, policy: { requireVerification: false } });
    const ana = await member(h, 'ana@example.com');
    await call(h, 'GET', '/units/lemma:sq:shtëpi:NOUN', { token: ana.token });
    await call(h, 'GET', '/units/lemma:sq:tjetër:NOUN', { token: ana.token });
    await call(h, 'GET', '/definitely/not/a/route/1234');
    await call(h, 'GET', '/me');
    const r = await call(h, 'GET', '/metrics', { token: 't0k' });
    expect(r.status).toBe(200);
    expect(r.text).toContain('# TYPE go_repository_http_requests_total counter');
    expect(r.text).toContain('go_repository_http_requests_total{route="/units/:id",method="GET",status="404"} 2');
    expect(r.text).toContain('go_repository_http_requests_total{route="/me",method="GET",status="401"} 1');
    expect(r.text).toContain('go_repository_http_requests_total{route="unmatched",method="GET",status="404"} 1');
    expect(r.text).toContain('# TYPE go_repository_http_request_duration_seconds histogram');
    expect(r.text).toMatch(/go_repository_http_request_duration_seconds_bucket\{route="\/me",le="\+Inf"\} 1\n/);
    expect(r.text).toMatch(/go_repository_http_request_duration_seconds_count\{route="\/units\/:id"\} 2\n/);
    for (const personal of ['ana@example.com', ana.learnerId, ana.token, 'shtëpi', 'tjetër']) expect(r.text, personal).not.toContain(personal);
  });

  it('renders extra samples with HELP and TYPE once per name and escapes label values', () => {
    const text = createMetricsRegistry().render([
      { name: 'x_gauge', help: 'A gauge.', type: 'gauge', value: 3 },
      { name: 'x_info', help: 'Info.', type: 'gauge', value: 1, labels: { v: 'a"b\\c\nd' } },
    ]);
    expect(text).toContain('# HELP x_gauge A gauge.\n# TYPE x_gauge gauge\nx_gauge 3\n');
    expect(text).toContain('x_info{v="a\\"b\\\\c\\nd"} 1');
  });

  it('health reports the store, the migration version and the uptime, and no secret', async () => {
    const h = await hardening(mem, { storeInfo: { storeKind: 'memory' } });
    const r = await call(h, 'GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, service: 'repository', contractVersion: 3, store: 'memory' });
    expect(r.body.uptimeSec).toBeGreaterThanOrEqual(5);
    expect(Object.keys(r.body).sort()).toEqual(['contractVersion', 'ok', 'service', 'store', 'uptimeSec', 'version']);
    const plain = await hardening(mem);
    expect((await call(plain, 'GET', '/health')).body).toEqual({ ok: true, service: 'repository', version: 1, contractVersion: 3 }); // unchanged where nothing is wired
  });
});

describe('request logs', () => {
  it('in text, keeps the one-line format', async () => {
    const h = await hardening(mem);
    await call(h, 'GET', '/health');
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toMatch(/^GET \/health 200 \d+ms$/);
  });

  it('as JSON: an object per request with a request id, the route pattern, status and duration', async () => {
    const h = await hardening(mem, { logFormat: 'json', limits: { general: { max: 2, windowSec: 60 } } });
    const first = await call(h, 'GET', '/units/abc');
    await call(h, 'GET', '/units/abd', { headers: { 'X-Request-Id': 'client-supplied-id-1' } });
    const third = await call(h, 'GET', '/units/abe', { headers: { 'X-Request-Id': 'bad id with spaces!' } });
    const lines = h.logs.map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ level: 'info', msg: 'request', method: 'GET', path: '/units/abc', route: '/units/:id', status: 401 });
    expect(typeof lines[0].ms).toBe('number');
    expect(Date.parse(lines[0].ts)).not.toBeNaN();
    expect(first.headers.get('x-request-id')).toBe(lines[0].requestId);
    expect(lines[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines[1].requestId).toBe('client-supplied-id-1');
    expect(third.headers.get('x-request-id')).not.toBe('bad id with spaces!');
    expect(lines[2]).toMatchObject({ status: 429, limited: 'general' });
  });

  it('never logs a body, a token, a query or an address; a 500 logs only the error class', async () => {
    const h = await hardening(mem, { logFormat: 'json' });
    const who = await createAccount(h, 'ana@example.com');
    const t = (await signIn(h, 'ana@example.com')).body.token;
    // a store failure whose message carries personal data
    const real = h.store.getAccountByEmail.bind(h.store);
    h.store.getAccountByEmail = async () => { const e = new Error('duplicate key value violates (email)=(ana@example.com)'); (e as { code?: string }).code = '23505'; throw e; };
    const res = await call(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: PASSWORD, deviceId: 'd' } });
    h.store.getAccountByEmail = real;
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('ana@example.com');
    await call(h, 'GET', '/events?kinds=SelectionLookedUp&unitId=secret-unit', { token: t });
    const all = h.logs.join('\n');
    for (const secret of ['ana@example.com', PASSWORD, t, who.learnerId, 'secret-unit', 'duplicate key']) expect(all, secret).not.toContain(secret);
    expect(JSON.parse(h.logs.find((l) => l.includes('"status":500'))!)).toMatchObject({ level: 'error', error: '23505' });
  });
});

describe('maintenance prunes what only needs keeping a while', () => {
  it('removes sessions ended 30 days ago, tokens spent a week ago and security lines older than 400 days', async () => {
    const h = await hardening(mem, { policy: { requireVerification: false } });
    const ana = await member(h, 'ana@example.com');
    await call(h, 'DELETE', '/sessions/current', { token: ana.token });
    const later = await signIn(h, 'ana@example.com', 'phone');
    const sec = h.store.security!;
    h.clock.advance(31 * DAY);
    const result = await runMaintenance(h.store, { now: h.clock.now });
    expect(result.sessionsPruned).toBeGreaterThanOrEqual(1);
    expect(result.tokensPruned).toBeGreaterThanOrEqual(0);
    expect((await sec.listSessions(ana.learnerId)).map((s) => s.deviceId)).not.toContain('dev-1');
    h.clock.advance(400 * DAY);
    expect((await runMaintenance(h.store, { now: h.clock.now })).securityEventsPruned).toBeGreaterThan(0);
    expect(await sec.listSecurityEvents(ana.learnerId)).toEqual([]);
    expect(later.status).toBe(201);
  });
});

// ───────────────────────────── mail ─────────────────────────────

describe('mail', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), 'mail-')); dirs.push(d); return d; };

  it('the file outbox writes one JSON file per message', async () => {
    const dir = join(tmp(), 'outbox');
    const mailer = createFileMailer(dir, () => '2026-10-17T10:00:00.000Z');
    expect(mailer.delivers).toBe(false);
    await mailer.send({ to: 'ana@example.com', subject: 'Hello', text: 'Body\nline two' });
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, files[0]!), 'utf8'))).toEqual({ at: '2026-10-17T10:00:00.000Z', to: 'ana@example.com', subject: 'Hello', text: 'Body\nline two' });
  });

  it('Resend: one authenticated JSON POST; a refusal throws without the key or the body in the message', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const mailer = createResendMailer({ apiKey: 're_secret_key', from: 'Go <no-reply@example.org>', fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status: 200 }); }) as typeof fetch });
    await mailer.send({ to: 'ana@example.com', subject: 'Hi', text: 'T' });
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer re_secret_key');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ from: 'Go <no-reply@example.org>', to: ['ana@example.com'], subject: 'Hi', text: 'T' });
    const failing = createResendMailer({ apiKey: 're_secret_key', from: 'x', fetch: (async () => new Response('{"message":"domain not verified, key re_secret_key"}', { status: 403 })) as typeof fetch });
    await expect(failing.send({ to: 'a@b.co', subject: 's', text: 't' })).rejects.toThrow(/^Resend answered 403$/);
  });

  it('SMTP: speaks EHLO, AUTH, MAIL, RCPT, DATA and delivers a base64 UTF-8 message', async () => {
    const server = await fakeSmtp();
    try {
      const mailer = createSmtpMailer({ ...parseSmtpUrl(`smtp://mailer:p%40ss@127.0.0.1:${server.port}`, 'Go <no-reply@example.org>'), helo: 'test.local' });
      await mailer.send({ to: 'ana@example.com', subject: 'Confirm: café', text: 'Code:\nabc\n.\nline starting with a dot above' });
      expect(server.messages).toHaveLength(1);
      const m = server.messages[0]!;
      expect(m.auth).toBe(`\u0000mailer\u0000p@ss`);
      expect(m.from).toBe('no-reply@example.org');
      expect(m.rcpt).toBe('ana@example.com');
      expect(m.data).toMatch(/^From: Go <no-reply@example\.org>\r\nTo: ana@example\.com\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
      const body = m.data.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n/g, '');
      expect(Buffer.from(body, 'base64').toString('utf8')).toBe('Code:\nabc\n.\nline starting with a dot above');
      expect(Buffer.from(/Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(m.data)![1]!, 'base64').toString('utf8')).toBe('Confirm: café');
    } finally { await server.close(); }
  });

  it('SMTP: a refused recipient is an error carrying the server code, and header injection through the subject is impossible', async () => {
    const server = await fakeSmtp({ rejectRcpt: true });
    try {
      const mailer = createSmtpMailer(parseSmtpUrl(`smtp://127.0.0.1:${server.port}`, 'no-reply@example.org'));
      await expect(mailer.send({ to: 'x@example.com', subject: 's', text: 't' })).rejects.toThrow(/^SMTP 550/);
    } finally { await server.close(); }
    const ok = await fakeSmtp();
    try {
      const mailer = createSmtpMailer(parseSmtpUrl(`smtp://127.0.0.1:${ok.port}`, 'no-reply@example.org'));
      await mailer.send({ to: 'x@example.com', subject: 'line one\r\nBcc: evil@example.com', text: 't' });
      expect(ok.messages[0]!.data).not.toMatch(/\r\nBcc:/);
    } finally { await ok.close(); }
  });

  it('picks SMTP, then Resend, then the file outbox, and insists on MAIL_FROM for the two that send', () => {
    expect(mailerFromEnv({ SMTP_URL: 'smtp://u:p@mail.example.org:587', MAIL_FROM: 'Go <a@b.co>' }, 'x').kind).toBe('smtp');
    expect(mailerFromEnv({ RESEND_API_KEY: 're_x', MAIL_FROM: 'Go <a@b.co>' }, 'x').kind).toBe('resend');
    expect(mailerFromEnv({}, 'x').kind).toBe('file');
    expect(mailerFromEnv({ MAIL_SINK: 'console' }, 'x', () => undefined).kind).toBe('console');
    expect(mailerFromEnv({ SMTP_URL: 'smtp://mail.example.org' , MAIL_FROM: 'a@b.co' }, 'x').delivers).toBe(true);
    expect(() => mailerFromEnv({ SMTP_URL: 'smtp://mail.example.org' }, 'x')).toThrow(/MAIL_FROM/);
    expect(() => mailerFromEnv({ RESEND_API_KEY: 're_x' }, 'x')).toThrow(/MAIL_FROM/);
    expect(() => parseSmtpUrl('http://nope', 'a@b.co')).toThrow(/smtp/);
    expect(parseSmtpUrl('smtps://mail.example.org', 'a@b.co')).toMatchObject({ secure: true, port: 465 });
    expect(parseSmtpUrl('smtp://mail.example.org', 'a@b.co')).toMatchObject({ secure: false, port: 587 });
  });
});

interface SmtpMessage { auth?: string; from: string; rcpt: string; data: string }
async function fakeSmtp(opts: { rejectRcpt?: boolean } = {}): Promise<{ port: number; messages: SmtpMessage[]; close: () => Promise<void> }> {
  const messages: SmtpMessage[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.setEncoding('utf8');
    sock.write('220 fake ESMTP\r\n');
    let buf = '';
    let data: string | undefined;
    const current: Partial<SmtpMessage> = {};
    sock.on('data', (chunk: string) => {
      buf += chunk;
      for (;;) {
        if (data !== undefined) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) { data += buf; buf = ''; return; }
          data += buf.slice(0, end);
          buf = buf.slice(end + 5);
          messages.push({ ...(current.auth !== undefined ? { auth: current.auth } : {}), from: current.from!, rcpt: current.rcpt!, data });
          data = undefined;
          sock.write('250 queued\r\n');
          continue;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (/^EHLO/i.test(line)) sock.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH PLAIN /i.test(line)) { current.auth = Buffer.from(line.slice(11), 'base64').toString('utf8'); sock.write('235 ok\r\n'); }
        else if (/^MAIL FROM:/i.test(line)) { current.from = /<(.*)>/.exec(line)![1]; sock.write('250 ok\r\n'); }
        else if (/^RCPT TO:/i.test(line)) { if (opts.rejectRcpt) sock.write('550 no such user\r\n'); else { current.rcpt = /<(.*)>/.exec(line)![1]; sock.write('250 ok\r\n'); } }
        else if (/^DATA/i.test(line)) { data = ''; sock.write('354 go ahead\r\n'); }
        else if (/^QUIT/i.test(line)) { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 what\r\n');
      }
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { port: (server.address() as net.AddressInfo).port, messages, close: () => new Promise((ok) => { server.close(() => ok()); for (const s of sockets) s.destroy(); }) };
}

describe('settings from the environment', () => {
  it('has safe defaults', () => {
    expect(serviceConfigFromEnv({})).toEqual({
      trustProxy: false, logFormat: 'text', limits: DEFAULT_LIMITS, graceDays: 7, deleteGraceDays: 14, purgeOnBoot: true, purgeIntervalMinutes: 60,
    });
  });
  it('reads every documented variable', () => {
    const c = serviceConfigFromEnv({
      DATABASE_URL: 'postgres://u:p@db.example.org/go', TRUST_PROXY: '1', LOG_FORMAT: 'JSON', METRICS_TOKEN: 'tok', GRACE_DAYS: '3', DELETE_GRACE_DAYS: '30',
      REQUIRE_EMAIL_VERIFICATION: '0', VERIFY_URL: 'https://go.example.org/verify?token={token}', RESET_URL: 'https://go.example.org/reset?token={token}', SERVICE_NAME: 'Go',
      PURGE_ON_BOOT: '0', PURGE_INTERVAL_MINUTES: '5', RATE_SIGNIN_MAX: '4',
    });
    expect(c).toMatchObject({
      databaseUrl: 'postgres://u:p@db.example.org/go', trustProxy: 'xff', logFormat: 'json', metricsToken: 'tok', graceDays: 3, deleteGraceDays: 30, requireVerification: false,
      verifyUrl: 'https://go.example.org/verify?token={token}', serviceName: 'Go', purgeOnBoot: false, purgeIntervalMinutes: 5,
    });
    expect(c.limits!.signin.max).toBe(4);
    expect(serviceConfigFromEnv({ TRUST_PROXY: 'cloudflare' }).trustProxy).toBe('cloudflare');
    const app = serviceConfigFromEnv({ APP_PUBLIC_URL: 'https://setup.example.org/app/#/old' });
    expect(app).toMatchObject({ appPublicUrl: 'https://setup.example.org/app/', verifyUrl: 'https://setup.example.org/app/#/verify?token={token}', resetUrl: 'https://setup.example.org/app/#/reset?token={token}' });
    expect(serviceConfigFromEnv({}).verifyUrl).toBeUndefined();
    expect(serviceConfigFromEnv({ RATE_LIMIT: 'off' }).limits).toBeUndefined();
  });
  it('refuses nonsense instead of defaulting', () => {
    for (const env of [{ LOG_FORMAT: 'xml' }, { DATABASE_URL: 'mysql://x' }, { GRACE_DAYS: '-1' }, { TRUST_PROXY: 'maybe' }, { VERIFY_URL: 'https://x/no-placeholder' }, { PURGE_ON_BOOT: 'sometimes' }, { APP_PUBLIC_URL: 'ftp://x' }]) {
      expect(() => serviceConfigFromEnv(env), JSON.stringify(env)).toThrow();
    }
  });
});
