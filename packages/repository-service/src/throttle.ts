/**
 * The sign-in lockout: five failed attempts for one email within fifteen minutes lock that email out (even for the right password) until the oldest
 * failure is fifteen minutes old.
 *
 * Failed sign-ins per email, in memory. PER PROCESS: it is lost on restart and not shared between instances, so a horizontally scaled deployment
 * multiplies the allowance. Unknown emails are counted the same as known ones, so the 429 reveals nothing about which addresses have accounts.
 * (The per-IP rate limit in ./ratelimit sits in front of this one.)
 */
import type { ServiceDeps } from './deps';

export const LOCKOUT_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

const failures = new WeakMap<object, Map<string, number[]>>();
const dummyHashes = new WeakMap<object, Promise<string>>();

function failureLog(deps: ServiceDeps): Map<string, number[]> {
  let m = failures.get(deps);
  if (!m) { m = new Map(); failures.set(deps, m); }
  return m;
}

function recentFailures(deps: ServiceDeps, email: string, nowMs: number): number[] {
  const m = failureLog(deps);
  const recent = (m.get(email) ?? []).filter((t) => nowMs - t < LOCKOUT_WINDOW_MS);
  if (recent.length) m.set(email, recent); else m.delete(email);
  if (m.size > 10_000) for (const [k, v] of m) if (v.every((t) => nowMs - t >= LOCKOUT_WINDOW_MS)) m.delete(k);
  return recent;
}

/** Whether `email` has used up its failed attempts. */
export const lockedOut = (deps: ServiceDeps, email: string, nowMs: number): boolean => recentFailures(deps, email, nowMs).length >= LOCKOUT_ATTEMPTS;

/** Records one failed attempt (known email or not). */
export function noteFailure(deps: ServiceDeps, email: string, nowMs: number): void {
  failureLog(deps).set(email, [...recentFailures(deps, email, nowMs), nowMs]);
}

/** A success, or a password reset, clears the count. */
export function forgetFailures(deps: ServiceDeps, email: string): void {
  failureLog(deps).delete(email);
}

/** A throw-away hash for the unknown-email path, so the work (and the answer) is the same as for a wrong password. */
export function dummyHash(deps: ServiceDeps): Promise<string> {
  let dummy = dummyHashes.get(deps);
  if (!dummy) { dummy = deps.crypto.hashPassword(deps.crypto.randomToken()); dummyHashes.set(deps, dummy); }
  return dummy;
}
