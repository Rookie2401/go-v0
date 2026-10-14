/**
 * The in-process change notifier behind `POST /sync/wait`: one set of waiters per learner.
 *
 * A waiter is a held long-poll. `poke(learnerId)` (called by the handler after any request that may have appended events) asks the
 * learner's waiters to look again; each waiter re-reads the head and resolves `changed: true` only if it moved. A waiter also ends
 * when its timer fires, when its request is aborted, or when the notifier is closed (shutdown). Every path through `finish` clears the
 * timer and removes the waiter, so nothing leaks.
 *
 * Process-local on purpose: the service is one process over one SQLite file. A second process would not wake this one's waiters
 * (they would still time out and report the truth).
 */

/** Most concurrent waiters per learner; the next one is refused with 429 `too-many-waiters`. */
export const MAX_WAITERS_PER_LEARNER = 4;
/** The longest a wait is held, and the default (milliseconds). */
export const MAX_WAIT_MS = 25_000;

export interface WaitOutcome { changed: boolean }

export interface ChangeNotifier {
  /** Hold until `check()` is true after a poke, the timeout, the abort signal or `closeAll()`. Returns `undefined` when the learner already has the maximum waiters. */
  wait(learnerId: string, opts: { timeoutMs: number; check: () => Promise<boolean>; signal?: AbortSignal }): Promise<WaitOutcome> | undefined;
  /** Ask the learner's waiters to look again. Cheap and a no-op when there are none. */
  poke(learnerId: string): void;
  /** Resolve every waiter with `changed: false` and refuse to hold new ones (they return at once). */
  closeAll(): void;
  /** The number of waiters held for a learner (or in all). */
  size(learnerId?: string): number;
}

interface Waiter { wake: () => void; end: (changed: boolean) => void }

export function createChangeNotifier(): ChangeNotifier {
  const waiters = new Map<string, Set<Waiter>>();
  let closed = false;

  return {
    wait(learnerId, { timeoutMs, check, signal }) {
      if (closed || timeoutMs <= 0 || signal?.aborted) return Promise.resolve({ changed: false });
      let set = waiters.get(learnerId);
      if (set && set.size >= MAX_WAITERS_PER_LEARNER) return undefined;
      if (!set) { set = new Set(); waiters.set(learnerId, set); }
      const mine = set;
      return new Promise<WaitOutcome>((resolve) => {
        let done = false;
        let checking = false;
        let again = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onAbort = (): void => end(false);
        const waiter: Waiter = { wake: () => void look(), end: (changed) => end(changed) };
        function end(changed: boolean): void {
          if (done) return;
          done = true;
          if (timer !== undefined) clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          mine.delete(waiter);
          if (mine.size === 0 && waiters.get(learnerId) === mine) waiters.delete(learnerId);
          resolve({ changed });
        }
        // One check at a time; a poke that arrives during a check asks for another, so none is lost.
        async function look(): Promise<void> {
          if (done) return;
          if (checking) { again = true; return; }
          checking = true;
          try {
            do {
              again = false;
              let moved = false;
              try { moved = await check(); } catch { moved = false; }
              if (moved) { end(true); return; }
            } while (again && !done);
          } finally { checking = false; }
        }
        mine.add(waiter);
        timer = setTimeout(() => end(false), timeoutMs);
        signal?.addEventListener('abort', onAbort, { once: true });
        // Registered first, checked second: a push that landed between the caller's first look and now is seen here, not lost.
        void look();
      });
    },
    poke(learnerId) {
      const set = waiters.get(learnerId);
      if (!set) return;
      for (const w of [...set]) w.wake();
    },
    closeAll() {
      closed = true;
      for (const set of [...waiters.values()]) for (const w of [...set]) w.end(false);
      waiters.clear();
    },
    size(learnerId) {
      if (learnerId !== undefined) return waiters.get(learnerId)?.size ?? 0;
      let n = 0;
      for (const s of waiters.values()) n += s.size;
      return n;
    },
  };
}
