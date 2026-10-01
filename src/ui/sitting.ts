/**
 * One sitting-stable session id per learner.
 *
 * The `session` string scopes the dedupe keys of view events. It used to be minted on every page load, so a reload
 * or a route revisit made a fresh key and could count the same sentence as a new encounter. Now the id is kept in
 * localStorage (`go-v0:sitting:<userId>`) together with the time of the learner's last activity, and reused while
 * that activity is less than SITTING_GAP_MS old; after that gap a new sitting (and id) begins. The timestamp is
 * refreshed on every learner event the app appends (see AppProvider). GoLearn derives sittings from event times
 * on its own: this id only keeps the UI from minting needless keys.
 *
 * Storage may be blocked or absent: then every call falls back to an id held in memory for this page load.
 */
import { scopedKey } from './sandbox';

export const SITTING_GAP_MS = 30 * 60 * 1000;

/** Namespaced in sandbox mode (sandbox.ts); the in-memory copies are keyed the same way so the two namespaces never share a sitting. */
const keyOf = (userId: string) => scopedKey(`go-v0:sitting:${userId}`);

interface SittingRecord { id: string; lastActivityAt: number }

/** In-memory copy, used when localStorage is unavailable (and as the source of truth within one page load). */
const memory = new Map<string, SittingRecord>();

export function newSession(): string {
  return `ses:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function load(userId: string): SittingRecord | undefined {
  let readable = false;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(keyOf(userId));
      readable = true;
      if (raw) {
        const v = JSON.parse(raw) as Partial<SittingRecord>;
        if (typeof v.id === 'string' && v.id && typeof v.lastActivityAt === 'number') return { id: v.id, lastActivityAt: v.lastActivityAt };
      }
    }
  } catch { /* blocked or corrupt */ }
  // Storage is the source of truth whenever it can be read; memory only stands in when it cannot.
  return readable ? undefined : memory.get(keyOf(userId));
}

function save(userId: string, rec: SittingRecord): void {
  memory.set(keyOf(userId), rec);
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(keyOf(userId), JSON.stringify(rec)); } catch { /* memory only */ }
}

/** The session id for this learner now: the stored one while its last activity is < 30 minutes old, otherwise a new one (stored). */
export function sittingSession(userId: string, now: number = Date.now()): string {
  const existing = load(userId);
  if (existing && now - existing.lastActivityAt >= 0 && now - existing.lastActivityAt < SITTING_GAP_MS) return existing.id;
  const id = newSession();
  save(userId, { id, lastActivityAt: now });
  return id;
}

/** Record learner activity under `session`, extending the sitting. */
export function touchSitting(userId: string, session: string, now: number = Date.now()): void {
  save(userId, { id: session, lastActivityAt: now });
}

/** Test helper: forget the in-memory copies (localStorage is cleared by the test itself). */
export function resetSittingsForTests(): void {
  memory.clear();
}
