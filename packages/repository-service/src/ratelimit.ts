/**
 * Token-bucket rate limits for the service. Pure and clock-injected (tests drive a fake clock); web APIs only.
 *
 * A rule is `max` requests per `windowSec`: the bucket holds at most `max` tokens (a burst of `max` is allowed) and refills continuously at
 * `max / windowSec` tokens per second, so the long-run rate is the stated one. One token per request. A refused request is told how many seconds
 * until a token exists again (`Retry-After`).
 *
 * Buckets live in memory, PER PROCESS (as the sign-in lockout does): they are lost on restart and not shared between instances. One service
 * process per database is the supported deployment; behind several, put a shared limiter (the reverse proxy) in front as well.
 */

export interface Rule { max: number; windowSec: number }

export const LIMIT_NAMES = ['signin', 'signup', 'syncPush', 'general', 'recovery', 'export'] as const;
export type LimitName = (typeof LIMIT_NAMES)[number];
export type LimitConfig = Record<LimitName, Rule>;

/** Defaults (per IP unless noted). Sign-in has the per-email lockout in the handler as well. */
export const DEFAULT_LIMITS: LimitConfig = {
  /** POST /sessions, per IP. */
  signin: { max: 10, windowSec: 60 },
  /** POST /accounts, per IP. */
  signup: { max: 5, windowSec: 3600 },
  /** POST /sync/push, per account. */
  syncPush: { max: 60, windowSec: 60 },
  /** Every request, per IP. */
  general: { max: 600, windowSec: 60 },
  /** Verification, resend, forgot and reset routes, per IP; the mailing routes also have a per-address limit of 3 per hour. */
  recovery: { max: 10, windowSec: 3600 },
  /** GET /me/export, per account. */
  export: { max: 3, windowSec: 3600 },
};

/** The environment names: RATE_<NAME>_MAX and RATE_<NAME>_WINDOW_S, where NAME is SIGNIN, SIGNUP, SYNC_PUSH, GENERAL, RECOVERY or EXPORT. */
const ENV_NAME: Record<LimitName, string> = { signin: 'SIGNIN', signup: 'SIGNUP', syncPush: 'SYNC_PUSH', general: 'GENERAL', recovery: 'RECOVERY', export: 'EXPORT' };

/**
 * The limits from the environment, or `undefined` when `RATE_LIMIT=off` (no limiting at all; for a trusted network or a test rig). A value that is not
 * a positive whole number is an error, so a typo does not silently leave the service unprotected.
 */
export function limitsFromEnv(env: Record<string, string | undefined>): LimitConfig | undefined {
  if ((env.RATE_LIMIT ?? '').toLowerCase() === 'off') return undefined;
  const out = {} as LimitConfig;
  for (const name of LIMIT_NAMES) {
    const base = DEFAULT_LIMITS[name];
    const read = (suffix: 'MAX' | 'WINDOW_S', fallback: number): number => {
      const key = `RATE_${ENV_NAME[name]}_${suffix}`;
      const raw = env[key];
      if (raw === undefined || raw === '') return fallback;
      if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`${key} must be a positive whole number, not "${raw}"`);
      return Number(raw);
    };
    out[name] = { max: read('MAX', base.max), windowSec: read('WINDOW_S', base.windowSec) };
  }
  return out;
}

export type Take = { ok: true } | { ok: false; retryAfterSec: number };

export interface RateLimiter {
  readonly rules: Readonly<LimitConfig>;
  /** Takes one token from the bucket `name:key`. */
  take(name: LimitName, key: string): Take;
  /** Takes one token from a bucket with an ad hoc rule (for example the per-address mail limit). */
  takeWith(bucket: string, rule: Rule): Take;
  /** How many buckets are held (for tests and the metrics). */
  size(): number;
}

interface Bucket { tokens: number; at: number; max: number; windowMs: number }

export function createRateLimiter(rules: LimitConfig, clock: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function prune(nowMs: number): void {
    // a bucket that has been idle long enough to be full again carries no information
    for (const [k, b] of buckets) if (b.tokens + ((nowMs - b.at) * b.max) / b.windowMs >= b.max) buckets.delete(k);
  }

  function takeFrom(key: string, rule: Rule): Take {
    const nowMs = clock();
    const windowMs = rule.windowSec * 1000;
    let b = buckets.get(key);
    if (!b) {
      if (buckets.size >= 50_000) prune(nowMs);
      b = { tokens: rule.max, at: nowMs, max: rule.max, windowMs };
      buckets.set(key, b);
    } else {
      b.tokens = Math.min(rule.max, b.tokens + (Math.max(0, nowMs - b.at) * rule.max) / windowMs);
      b.at = nowMs;
      b.max = rule.max;
      b.windowMs = windowMs;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(((1 - b.tokens) * windowMs) / rule.max / 1000)) };
  }

  return {
    rules,
    take: (name, key) => takeFrom(`${name}\u0000${key}`, rules[name]),
    takeWith: (bucket, rule) => takeFrom(`~${bucket}`, rule),
    size: () => buckets.size,
  };
}

/** Which proxy header names the client: `'xff'` = the last X-Forwarded-For entry (Caddy, nginx), `'cloudflare'` = CF-Connecting-IP (a Cloudflare tunnel), `false` = none. */
export type TrustProxy = false | 'xff' | 'cloudflare';

/**
 * The address a request came from. `peer` is the socket's remote address (supplied by the Node bridge, never by a header). Behind a reverse proxy the
 * proxy's own address is the peer. With `'xff'` the client is the LAST entry of X-Forwarded-For: the one the trusted proxy appended (earlier entries are
 * whatever the client claimed). With `'cloudflare'` it is CF-Connecting-IP, which Cloudflare sets and overwrites. With `false` headers are ignored entirely.
 * Trust a header only when nothing but the proxy can reach the service (listen on 127.0.0.1).
 */
export function resolveClientIp(peer: string | undefined, headers: { get(name: string): string | null }, trustProxy: TrustProxy): string {
  const clean = (v: string): string => v.trim().replace(/^::ffff:/i, '');
  if (trustProxy === 'xff') {
    const parts = (headers.get('x-forwarded-for') ?? '').split(',').map(clean).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.length <= 64) return last;
  } else if (trustProxy === 'cloudflare') {
    const v = clean(headers.get('cf-connecting-ip') ?? '');
    if (v && v.length <= 64) return v;
  }
  return peer ? clean(peer) : 'unknown';
}

export const isLoopback = (ip: string): boolean => ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || /^127\./.test(ip);
