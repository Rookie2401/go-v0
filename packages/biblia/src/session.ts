/**
 * The standalone Biblia's sign-in, as far as this page keeps it: the Repository address it belongs to, the bearer token the service gave, the
 * learner id and the email it was made for, and this browser's device id. Kept in localStorage under 'biblia:session' (GoReview's web edition
 * keeps its own the same way). The password is never part of it: nothing but the five fields below is ever written.
 */
export interface BibliaSession { serviceUrl: string; token: string; learnerId: string; email: string; deviceId: string; expiresAt?: string }

export const SESSION_KEY = 'biblia:session';
export const DEVICE_KEY = 'biblia:device';
const DEVICE_PREFIX = 'biblia:web:';

const trimSlash = (u: string): string => u.replace(/\/+$/, '');
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The session kept for THIS service address, if it is whole and has not run out; a session for another address (a changed config.json) is ignored, not deleted. */
export function loadSession(storage: Storage | undefined, serviceUrl: string, nowMs: number = Date.now()): BibliaSession | undefined {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const j = JSON.parse(raw) as Record<string, unknown> | null;
    if (!j || typeof j !== 'object') return undefined;
    if (!text(j.serviceUrl) || !text(j.token) || !text(j.learnerId) || !text(j.email) || !text(j.deviceId)) return undefined;
    if (trimSlash(j.serviceUrl) !== trimSlash(serviceUrl)) return undefined;
    if (text(j.expiresAt)) { const at = Date.parse(j.expiresAt); if (Number.isFinite(at) && at <= nowMs) return undefined; }
    return { serviceUrl: trimSlash(j.serviceUrl), token: j.token, learnerId: j.learnerId, email: j.email, deviceId: j.deviceId, ...(text(j.expiresAt) ? { expiresAt: j.expiresAt } : {}) };
  } catch { return undefined; }
}

/** Writes exactly the session fields (anything else on the object, a password included, is left out). Storage that is blocked or full is not an error: the learner signs in again next time. */
export function saveSession(storage: Storage | undefined, s: BibliaSession): void {
  try {
    storage?.setItem(SESSION_KEY, JSON.stringify({ serviceUrl: trimSlash(s.serviceUrl), token: s.token, learnerId: s.learnerId, email: s.email, deviceId: s.deviceId, ...(s.expiresAt ? { expiresAt: s.expiresAt } : {}) }));
  } catch { /* storage blocked or full */ }
}

export function clearSession(storage: Storage | undefined): void {
  try { storage?.removeItem(SESSION_KEY); } catch { /* storage blocked */ }
}

function randomPart(): string {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return Array.from(c.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** This browser's device id, `biblia:web:<random>`: made once and kept under 'biblia:device'. Without usable storage a fresh id is returned each call (the caller keeps the one it has). */
export function deviceIdFor(storage: Storage | undefined): string {
  try {
    const have = storage?.getItem(DEVICE_KEY);
    if (have && have.startsWith(DEVICE_PREFIX) && have.length > DEVICE_PREFIX.length) return have;
  } catch { /* storage blocked */ }
  const id = `${DEVICE_PREFIX}${randomPart()}`;
  try { storage?.setItem(DEVICE_KEY, id); } catch { /* storage blocked */ }
  return id;
}
