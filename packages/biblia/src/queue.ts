/**
 * The offline queue of the standalone Biblia: events (`GoEvent[]`) the learner made that the Repository has not yet acknowledged, kept in
 * localStorage under 'biblia:queue' so a reload or a closed tab loses nothing. The recorder (repo.ts) appends to it first and sends from it,
 * so there is one path whether the service is reachable or not. At most 2,000 events are kept: past that the OLDEST are dropped and the caller
 * is told how many (it says so to the learner). Events carry their learner id; the queue keeps every learner's, and `peek` hands out one's own.
 */
import type { GoEvent } from '../../repository-contract/src';

export const QUEUE_KEY = 'biblia:queue';
export const QUEUE_CAP = 2000;

export interface EventQueue {
  /** Events held (all learners). */
  size(): number;
  /** Events held for one learner. */
  count(learnerId: string): number;
  /** Append (an id already held is ignored). `dropped` = how many of the oldest were discarded to stay within the cap or the browser's storage. */
  push(events: GoEvent[]): { dropped: number };
  /** The oldest `max` events of a learner, in the order they were made. */
  peek(learnerId: string, max: number): GoEvent[];
  /** Forget events by id (they were sent, or refused for good). */
  remove(ids: Iterable<string>): void;
}

const isEvent = (v: unknown): v is GoEvent => !!v && typeof v === 'object' && typeof (v as GoEvent).id === 'string' && typeof (v as GoEvent).learnerId === 'string' && typeof (v as GoEvent).kind === 'string';

export function createEventQueue(storage: Storage | undefined, cap: number = QUEUE_CAP): EventQueue {
  let list: GoEvent[] = [];
  try {
    const raw = storage?.getItem(QUEUE_KEY);
    if (raw) { const j = JSON.parse(raw) as unknown; if (Array.isArray(j)) list = j.filter(isEvent).slice(-cap); }
  } catch { list = []; }

  /** Writes the list; when the browser refuses (storage full), sheds the oldest tenth and tries again. Returns how many were shed. */
  function persist(): number {
    let shed = 0;
    for (;;) {
      try {
        if (!storage) return shed;
        if (list.length) storage.setItem(QUEUE_KEY, JSON.stringify(list)); else storage.removeItem(QUEUE_KEY);
        return shed;
      } catch {
        if (!list.length) return shed;
        const n = Math.max(1, Math.ceil(list.length / 10));
        list = list.slice(n);
        shed += n;
      }
    }
  }

  return {
    size: () => list.length,
    count: (learnerId) => list.reduce((n, e) => n + (e.learnerId === learnerId ? 1 : 0), 0),
    push(events) {
      const have = new Set(list.map((e) => e.id));
      for (const e of events) if (isEvent(e) && !have.has(e.id)) { list.push(e); have.add(e.id); }
      let dropped = 0;
      if (list.length > cap) { dropped = list.length - cap; list = list.slice(dropped); }
      dropped += persist();
      return { dropped };
    },
    peek: (learnerId, max) => list.filter((e) => e.learnerId === learnerId).slice(0, Math.max(0, max)),
    remove(ids) {
      const gone = new Set(ids);
      if (!gone.size) return;
      list = list.filter((e) => !gone.has(e.id));
      persist();
    },
  };
}
