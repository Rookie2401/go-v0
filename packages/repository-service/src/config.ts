/**
 * The service's settings from environment variables, parsed and validated in one place (pure; `main.ts` calls it, tests feed it objects).
 * A bad value is an error at start-up, never a silent default: a typo in RATE_SIGNIN_MAX must not leave sign-in unprotected.
 *
 * | variable | meaning | default |
 * |---|---|---|
 * | DATABASE_URL | `postgres://…` selects the Postgres store; absent: SQLite in `--data` | SQLite |
 * | TRUST_PROXY | `1`: believe the last X-Forwarded-For entry (behind Caddy); `cloudflare`: believe CF-Connecting-IP (behind a Cloudflare tunnel). The service must listen on 127.0.0.1 only | off |
 * | LOG_FORMAT | `json` for one JSON object per request | text |
 * | METRICS_TOKEN | Bearer token for `GET /metrics`; absent: loopback only | none |
 * | RATE_LIMIT / RATE_<NAME>_MAX / RATE_<NAME>_WINDOW_S | see ./ratelimit | see ./ratelimit |
 * | SMTP_URL, RESEND_API_KEY, MAIL_FROM, MAIL_SINK, OUTBOX_DIR | see ./mailer | file outbox |
 * | GRACE_DAYS | days an unverified account may still sign in | 7 |
 * | DELETE_GRACE_DAYS | days a requested deletion waits before the purge | 14 |
 * | REQUIRE_EMAIL_VERIFICATION | `1`/`0`; default: on exactly when mail can be delivered | auto |
 * | APP_PUBLIC_URL | where the hosted GoLearn setup app lives; the emails link to `<APP_PUBLIC_URL>#/verify?token=…` and `<APP_PUBLIC_URL>#/reset?token=…`. No default: without it an email carries the code alone | none |
 * | VERIFY_URL, RESET_URL | override the two link templates (`{token}` is replaced) | derived from APP_PUBLIC_URL |
 * | SERVICE_NAME | the product name in the emails | "Go" |
 * | PURGE_ON_BOOT | `0` to skip the maintenance pass at start | on |
 * | PURGE_INTERVAL_MINUTES | how often the maintenance pass runs while up; `0` = never | 60 |
 */
import { limitsFromEnv } from './ratelimit';
import type { LimitConfig, TrustProxy } from './ratelimit';

export interface ServiceConfig {
  databaseUrl?: string;
  trustProxy: TrustProxy;
  logFormat: 'text' | 'json';
  metricsToken?: string;
  /** Undefined when RATE_LIMIT=off. */
  limits?: LimitConfig;
  graceDays: number;
  deleteGraceDays: number;
  /** Undefined = decide from whether mail can be delivered. */
  requireVerification?: boolean;
  appPublicUrl?: string;
  verifyUrl?: string;
  resetUrl?: string;
  serviceName?: string;
  purgeOnBoot: boolean;
  purgeIntervalMinutes: number;
}

type Env = Record<string, string | undefined>;

function flag(env: Env, key: string, def: boolean): boolean {
  const v = env[key];
  if (v === undefined || v === '') return def;
  if (/^(1|true|yes|on)$/i.test(v)) return true;
  if (/^(0|false|no|off)$/i.test(v)) return false;
  throw new Error(`${key} must be 1 or 0, not "${v}"`);
}

function proxyMode(env: Env): TrustProxy {
  const v = (env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (v === '' || /^(0|false|no|off)$/.test(v)) return false;
  if (/^(1|true|yes|on|xff)$/.test(v)) return 'xff';
  if (v === 'cloudflare') return 'cloudflare';
  throw new Error(`TRUST_PROXY must be 1, cloudflare or 0, not "${env.TRUST_PROXY}"`);
}

function whole(env: Env, key: string, def: number, min: number): number {
  const v = env[key];
  if (v === undefined || v === '') return def;
  if (!/^\d+$/.test(v) || Number(v) < min) throw new Error(`${key} must be a whole number of at least ${min}, not "${v}"`);
  return Number(v);
}

function template(env: Env, key: string): string | undefined {
  const v = env[key];
  if (v === undefined || v === '') return undefined;
  if (!/^https?:\/\//i.test(v) || !v.includes('{token}')) throw new Error(`${key} must be an http(s) URL containing {token}`);
  return v;
}

/** `https://app.example/setup/` or `…/setup#/x` -> `https://app.example/setup/` (no fragment); only http(s). */
function appUrl(env: Env): string | undefined {
  const v = env.APP_PUBLIC_URL?.trim();
  if (!v) return undefined;
  if (!/^https?:\/\/[^\s#]+/i.test(v)) throw new Error(`APP_PUBLIC_URL must be an http(s) URL, not "${v}"`);
  return v.split('#')[0]!;
}

export function serviceConfigFromEnv(env: Env): ServiceConfig {
  const app = appUrl(env);
  const logFormat = (env.LOG_FORMAT ?? 'text').toLowerCase();
  if (logFormat !== 'text' && logFormat !== 'json') throw new Error(`LOG_FORMAT must be text or json, not "${env.LOG_FORMAT}"`);
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  if (databaseUrl && !/^postgres(ql)?:\/\//i.test(databaseUrl)) throw new Error('DATABASE_URL must start with postgres:// or postgresql:// (leave it unset to use SQLite)');
  const limits = limitsFromEnv(env);
  return {
    ...(databaseUrl ? { databaseUrl } : {}),
    trustProxy: proxyMode(env),
    logFormat,
    ...(env.METRICS_TOKEN ? { metricsToken: env.METRICS_TOKEN } : {}),
    ...(limits ? { limits } : {}),
    graceDays: whole(env, 'GRACE_DAYS', 7, 0),
    deleteGraceDays: whole(env, 'DELETE_GRACE_DAYS', 14, 0),
    ...(env.REQUIRE_EMAIL_VERIFICATION !== undefined && env.REQUIRE_EMAIL_VERIFICATION !== '' ? { requireVerification: flag(env, 'REQUIRE_EMAIL_VERIFICATION', false) } : {}),
    ...(app ? { appPublicUrl: app } : {}),
    ...(template(env, 'VERIFY_URL') ? { verifyUrl: template(env, 'VERIFY_URL')! } : app ? { verifyUrl: `${app}#/verify?token={token}` } : {}),
    ...(template(env, 'RESET_URL') ? { resetUrl: template(env, 'RESET_URL')! } : app ? { resetUrl: `${app}#/reset?token={token}` } : {}),
    ...(env.SERVICE_NAME ? { serviceName: env.SERVICE_NAME.slice(0, 60) } : {}),
    purgeOnBoot: flag(env, 'PURGE_ON_BOOT', true),
    purgeIntervalMinutes: whole(env, 'PURGE_INTERVAL_MINUTES', 60, 0),
  };
}
