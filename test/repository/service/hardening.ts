/**
 * A harness for the operations and accounts-hardening tests: the REAL stores (memory, SQLite, Postgres), a memory mailer, a limiter and a clock the
 * test advances, and the fake engine, linguistics and crypto of the other service tests.
 */
import { handle } from '../../../packages/repository-service/src/handler';
import type { AccountPolicy, ServiceDeps } from '../../../packages/repository-service/src/deps';
import { createMemoryMailer } from '../../../packages/repository-service/src/mailer';
import type { MemoryMailer } from '../../../packages/repository-service/src/mailer';
import { createMetricsRegistry } from '../../../packages/repository-service/src/metrics';
import { DEFAULT_LIMITS, createRateLimiter } from '../../../packages/repository-service/src/ratelimit';
import type { LimitConfig, RateLimiter } from '../../../packages/repository-service/src/ratelimit';
import type { ConcreteStore } from '../../../packages/repository-store/src';
import { createClock, createFakeCrypto, createFakeEngine, createFakeLinguistics } from './fakes';
import type { Clock } from './fakes';

export interface Hardening {
  deps: ServiceDeps;
  store: ConcreteStore;
  clock: Clock;
  mailer: MemoryMailer;
  logs: string[];
  limiter?: RateLimiter;
}

export interface HardeningOptions {
  policy?: Partial<AccountPolicy>;
  /** Rate limits (a fake-clock limiter is built from them); absent = no limiting. `true` = the defaults. */
  limits?: Partial<LimitConfig> | true;
  withMetrics?: { token?: string };
  logFormat?: 'text' | 'json';
  /** The address each request comes from; default "10.0.0.1". A test may change `ip.current`. */
  ip?: string;
  storeInfo?: { storeKind: string };
}

export function hardening(open: (now: () => string) => ConcreteStore | Promise<ConcreteStore>, opts: HardeningOptions = {}): Promise<Hardening & { ip: { current: string } }> {
  return (async () => {
    const clock = createClock();
    const store = await open(clock.now);
    const mailer = createMemoryMailer();
    const logs: string[] = [];
    const ip = { current: opts.ip ?? '10.0.0.1' };
    const limiter = opts.limits ? createRateLimiter({ ...DEFAULT_LIMITS, ...(opts.limits === true ? {} : opts.limits) }, () => Date.parse(clock.now())) : undefined;
    const deps: ServiceDeps = {
      store, engine: createFakeEngine(store), linguistics: createFakeLinguistics(store, clock.now), crypto: createFakeCrypto(), now: clock.now, log: (l) => logs.push(l),
      mailer, accountPolicy: { graceDays: 7, deleteGraceDays: 14, requireVerification: true, ...opts.policy },
      clientIp: () => ip.current,
      ...(limiter ? { limiter } : {}),
      ...(opts.logFormat ? { logFormat: opts.logFormat } : {}),
      ...(opts.withMetrics ? { metrics: { registry: createMetricsRegistry(), ...(opts.withMetrics.token ? { token: opts.withMetrics.token } : {}) } } : {}),
      ...(opts.storeInfo ? { info: { storeKind: opts.storeInfo.storeKind, startedAt: Date.now() - 5000, schemaVersion: async () => (await store.stats?.())?.schemaVersion } } : {}),
    };
    return { deps, store, clock, mailer, logs, ip, ...(limiter ? { limiter } : {}) };
  })();
}

export interface Reply { status: number; body: Record<string, any>; headers: Headers; text: string }

export async function call(h: Pick<Hardening, 'deps'>, method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; rawBody?: string } = {}): Promise<Reply> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const payload = opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
  const res = await handle(new Request(`http://repository.local${path}`, { method, headers, ...(payload !== undefined ? { body: payload } : {}) }), h.deps);
  const text = res.status === 204 ? '' : await res.text();
  let body: Record<string, any> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* not JSON (metrics) */ }
  return { status: res.status, body, headers: res.headers, text };
}

export const PASSWORD = 'correct horse battery';

export async function createAccount(h: Hardening, email: string, password = PASSWORD): Promise<{ learnerId: string; accountId: string }> {
  const r = await call(h, 'POST', '/accounts', { body: { email, password, displayName: email.split('@')[0] } });
  if (r.status !== 201) throw new Error(`createAccount ${r.status} ${r.text}`);
  return r.body as { learnerId: string; accountId: string };
}

export async function signIn(h: Hardening, email: string, deviceId = 'dev-1', password = PASSWORD): Promise<Reply> {
  return call(h, 'POST', '/sessions', { body: { email, password, deviceId, platform: 'test' } });
}

/** An account that is signed in and enrolled in Albanian (so it can record events). */
export async function member(h: Hardening, email: string, deviceId = 'dev-1'): Promise<{ learnerId: string; token: string; email: string; enrolmentId: string; deviceId: string }> {
  const acc = await createAccount(h, email);
  const s = await signIn(h, email, deviceId);
  if (s.status !== 201) throw new Error(`signIn ${s.status} ${s.text}`);
  const e = await call(h, 'POST', '/enrolments', { token: s.body.token, body: { languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] } });
  if (e.status !== 201) throw new Error(`enrol ${e.status} ${e.text}`);
  return { learnerId: acc.learnerId, token: s.body.token, email, enrolmentId: e.body.enrolment.enrolmentId, deviceId };
}

/** The most recent mail to an address, and the token or code in it (the last line of its text that looks like one). */
export function lastMail(h: Hardening, to: string): { subject: string; text: string; token: string } {
  const m = [...h.mailer.sent].reverse().find((x) => x.to === to);
  if (!m) throw new Error(`no mail was sent to ${to}`);
  const token = m.text.split('\n').filter((l) => /^[A-Za-z0-9_-]{43}$/.test(l.trim())).pop();
  if (!token) throw new Error(`no token in the mail: ${m.text}`);
  return { subject: m.subject, text: m.text, token: token.trim() };
}

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;
