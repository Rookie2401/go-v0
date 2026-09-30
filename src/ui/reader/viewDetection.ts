/**
 * Sentence view detection, behind a small interface so the Reader never touches the DOM observer API.
 *
 *  - Browser: IntersectionObserver implementation — a sentence counts as "viewed" once at least
 *    VISIBLE_RATIO of it has stayed on screen for DWELL_MS (continuous).
 *  - No IntersectionObserver (jsdom, very old browsers): `createViewDetector` returns null and the
 *    Reader renders a per-sentence "Mark as read" button instead — the same callback, driven by a click.
 *    Tests use either that path or a scripted detector (see `ManualViewDetector`).
 */
export const DWELL_MS = 600;
export const VISIBLE_RATIO = 0.6;

export interface ViewDetector {
  observe(el: Element, sentenceId: string): void;
  unobserve(sentenceId: string): void;
  disconnect(): void;
}

export type ViewedCallback = (sentenceId: string, dwellMs: number) => void;
/** Returns null when automatic detection is unavailable → manual "mark read" path. */
export type ViewDetectorFactory = (onViewed: ViewedCallback) => ViewDetector | null;

export const createViewDetector: ViewDetectorFactory = (onViewed) => {
  if (typeof IntersectionObserver === 'undefined') return null;
  const byEl = new Map<Element, string>();
  const byId = new Map<string, Element>();
  const timers = new Map<string, { handle: ReturnType<typeof setTimeout>; since: number }>();

  const clear = (id: string) => {
    const t = timers.get(id);
    if (t) { clearTimeout(t.handle); timers.delete(id); }
  };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const id = byEl.get(entry.target);
      if (!id) continue;
      const visible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO;
      if (visible && !timers.has(id)) {
        const since = Date.now();
        timers.set(id, {
          since,
          handle: setTimeout(() => {
            timers.delete(id);
            onViewed(id, Date.now() - since);
          }, DWELL_MS),
        });
      } else if (!visible) {
        clear(id);
      }
    }
  }, { threshold: [0, VISIBLE_RATIO, 1] });

  return {
    observe(el, sentenceId) {
      byEl.set(el, sentenceId);
      byId.set(sentenceId, el);
      io.observe(el);
    },
    unobserve(sentenceId) {
      const el = byId.get(sentenceId);
      if (el) { io.unobserve(el); byEl.delete(el); byId.delete(sentenceId); }
      clear(sentenceId);
    },
    disconnect() {
      for (const id of [...timers.keys()]) clear(id);
      io.disconnect();
      byEl.clear();
      byId.clear();
    },
  };
};

/**
 * A scripted detector for tests: records what the Reader observes and lets the test "see" a sentence.
 */
export class ManualViewDetector implements ViewDetector {
  readonly observed = new Set<string>();
  private cb: ViewedCallback | null = null;
  readonly factory: ViewDetectorFactory = (onViewed) => { this.cb = onViewed; return this; };
  observe(_el: Element, sentenceId: string) { this.observed.add(sentenceId); }
  unobserve(sentenceId: string) { this.observed.delete(sentenceId); }
  disconnect() { this.observed.clear(); }
  /** Simulate the sentence having been visible long enough. */
  see(sentenceId: string, dwellMs = DWELL_MS) { this.cb?.(sentenceId, dwellMs); }
}
