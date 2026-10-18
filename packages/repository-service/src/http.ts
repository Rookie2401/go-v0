/**
 * What the handler, the account routes and the limiter share: the refusal type, the response builder with its CORS and security headers, the request
 * context, and a few tiny input helpers. Web APIs only.
 */
import type { Account, Session } from '../../repository-contract/src';
import type { ServiceDeps } from './deps';
import type { LimitName } from './ratelimit';

export const MESSAGES = {
  unauthorized: 'Sign in again: this session is missing, unknown, expired or ended.',
  notYours: 'That belongs to a different learner. A request can only name its own learner.',
  notFound: 'Nothing here.',
  method: 'That method is not allowed here.',
  tooLarge: 'That request is too large (the limit is 1 MB). Send it in smaller parts.',
  invalidJson: 'The request body is not valid JSON.',
  server: 'The server could not complete the request.',
} as const;

/** A failure the handler turns into a response. */
export class Refusal extends Error {
  constructor(readonly status: number, readonly error: string, message: string, readonly extra: Record<string, unknown> = {}, readonly headers: Record<string, string> = {}) {
    super(message);
  }
}

/** 429 for a rate limit rule: `Retry-After` says when a token will exist again. */
export const rateLimited = (retryAfterSec: number, rule: string): Refusal =>
  new Refusal(429, 'rate-limited', `Too many requests. Try again in ${retryAfterSec} second${retryAfterSec === 1 ? '' : 's'}.`, { retryAfterSec, rule }, { 'Retry-After': String(retryAfterSec) });

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match',
  // a browser asks permission (an OPTIONS round trip) before each cross-origin call that carries Authorization; browsers cap this at 2 h (Chromium) or 5 min (WebKit)
  'Access-Control-Max-Age': '7200',
  // the typed client reads the validator to ask "has it changed?" next time
  'Access-Control-Expose-Headers': 'ETag, Retry-After, X-Request-Id, Content-Disposition',
};

/**
 * Sent on every response. The service answers JSON only, some of it user-controlled (document bodies, titles), so a browser
 * must never sniff it into something else (nosniff), never frame it, never leak the address of the page that fetched it
 * (a path can hold an id), and has no business running anything from it (an empty CSP).
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
};

export function respond(status: number, body?: unknown, extraHeaders: Record<string, string> = {}): Response {
  const headers: Record<string, string> = { ...CORS, ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...extraHeaders };
  if (body === undefined || status === 204) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(body), { status, headers });
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
export const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
export const uuid = (): string => crypto.randomUUID();

export const invalid = (message: string, issues?: unknown): Refusal => new Refusal(422, 'invalid-input', message, issues ? { issues } : {});
export const normalEmail = (e: string): string => e.trim().toLowerCase();
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Ctx {
  request: Request;
  deps: ServiceDeps;
  query: URLSearchParams;
  params: Record<string, string>;
  now: () => string;
  body: () => Promise<Record<string, unknown>>;
  /** Only after `authed`. */
  session: Session;
  /** The caller's address as the limiter sees it ("unknown" when the deps cannot tell). */
  ip: string;
  /** The id logged with this request and returned as `X-Request-Id`. */
  requestId: string;
  /** Only after `authed`: the session's account (without its hash). */
  account: Account;
}

export type Handler = (ctx: Ctx) => Promise<Response>;
export interface Route { method: string; path: string[]; auth: boolean; run: Handler }

export const MIN_PASSWORD_CHARS = 10;
export const MAX_PASSWORD_CHARS = 1000;

/** The password rules of account creation and reset: 422 `weak-password` under 10 characters, 422 `invalid-input` over 1000. */
export function checkPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_CHARS) throw new Refusal(422, 'weak-password', `The password needs at least ${MIN_PASSWORD_CHARS} characters.`);
  if (password.length > MAX_PASSWORD_CHARS) throw invalid(`"password" is too long (at most ${MAX_PASSWORD_CHARS} characters).`);
  return password;
}

/** Takes one token from a named rate limit; 429 with `Retry-After` when it is empty. A no-op when the deps carry no limiter. */
export function takeLimit(deps: ServiceDeps, name: LimitName, key: string): void {
  const r = deps.limiter?.take(name, key);
  if (r && !r.ok) {
    deps.metrics?.registry.observeLimited(name);
    throw rateLimited(r.retryAfterSec, name);
  }
}
