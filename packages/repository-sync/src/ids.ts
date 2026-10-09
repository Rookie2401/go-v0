/**
 * Event ids. `ev:<base36 ms>:<device short hash>:<counter>:<random>`.
 *
 *  - time-ordered: the millisecond field is zero-padded, so ids of one device sort in creation order;
 *  - unique per device: a counter separates ids made in the same millisecond, a random suffix separates two processes of
 *    the same device (two browser tabs) that happen to share a millisecond and a counter;
 *  - monotonic within a process even when the clock goes backwards (NTP step, manual change): a last-ms guard keeps
 *    using the highest millisecond seen, so a later id never sorts before an earlier one.
 *
 * `sentenceKey` (the hash of a sentence) is the producer's concern and is not made here.
 */
import type { GoEvent } from '../../repository-contract/src';

const MS_WIDTH = 9;      // 36^9 ms ≈ 3.2e6 years
const COUNTER_WIDTH = 4; // 36^4 ids in one millisecond before the millisecond is advanced
const RANDOM_WIDTH = 4;
const COUNTER_LIMIT = 36 ** COUNTER_WIDTH;

const states = new Map<string, { ms: number; counter: number }>();

/** FNV-1a 32-bit of the device id, base 36: short, stable, not a secret. */
export function deviceShortHash(deviceId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < deviceId.length; i++) {
    h ^= deviceId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

export function newEventId(deviceId: string, nowMs: number, random: () => number = Math.random): string {
  const st = states.get(deviceId) ?? { ms: -1, counter: 0 };
  let ms = Math.floor(nowMs);
  if (ms < st.ms) ms = st.ms; // the clock stepped back: keep the highest millisecond seen
  if (ms === st.ms) {
    st.counter += 1;
    if (st.counter >= COUNTER_LIMIT) { ms += 1; st.counter = 0; }
  } else st.counter = 0;
  st.ms = ms;
  states.set(deviceId, st);
  const r = Math.floor(random() * 36 ** RANDOM_WIDTH).toString(36).padStart(RANDOM_WIDTH, '0');
  return `ev:${ms.toString(36).padStart(MS_WIDTH, '0')}:${deviceShortHash(deviceId)}:${st.counter.toString(36).padStart(COUNTER_WIDTH, '0')}:${r}`;
}

/** Test hook: forget the last-ms guard of one device (or all). */
export function resetIdState(deviceId?: string): void {
  if (deviceId === undefined) states.clear(); else states.delete(deviceId);
}

/** The idempotency key of an event: its own `dedupeKey` when the producer set one, else its id. */
export function dedupeKeyFor(event: Pick<GoEvent, 'id' | 'dedupeKey'>): string {
  return event.dedupeKey ?? event.id;
}
