/**
 * Sentence view detection (READING EXPOSURE), behind a small interface so the Reader never touches the DOM
 * observer API.
 *
 * A sentence yields a view only after a CONTINUOUS dwell of `max(1500 ms, 220 ms x word tokens)` (capped at 12 s)
 * at >= 60 % visibility, while all of these hold:
 *   - `document.visibilityState === 'visible'` (the tab is the one being looked at),
 *   - the window has focus,
 *   - nothing has paused reading (a preparation / preview panel or a modal is open; the word sheet is NOT one of
 *     these: it is part of reading).
 * When any of them stops holding, every running timer is cancelled and the dwell starts again from zero once they
 * hold again. A view says "this sentence stayed in front of the learner", nothing more. After a sentence has fired it
 * does not fire again until it has left the screen and come back (the Reader decides per sitting whether that
 * is a new exposure; a page left open across a gap of 30 minutes can therefore still record a second sitting).
 *
 *  - Browser: IntersectionObserver implementation (below).
 *  - No IntersectionObserver (jsdom, very old browsers): `createViewDetector` returns null and the Reader renders a
 *    per-sentence "Mark as seen" button instead — the same callback, driven by an explicit click, with no timing.
 *    Tests use either that path, a fake IntersectionObserver, or a scripted detector (`ManualViewDetector`).
 */
export const MIN_DWELL_MS = 1500;
export const MS_PER_WORD = 220;
export const MAX_DWELL_MS = 12_000;
export const VISIBLE_RATIO = 0.6;

/** How long a sentence of `words` word tokens must stay in view before it counts as seen. */
export function requiredDwellMs(words: number): number {
  return Math.min(MAX_DWELL_MS, Math.max(MIN_DWELL_MS, MS_PER_WORD * Math.max(0, Math.floor(words))));
}

export interface ViewDetector {
  /** `wordCount` = word tokens in the sentence (drives the required dwell). */
  observe(el: Element, sentenceId: string, wordCount?: number): void;
  unobserve(sentenceId: string): void;
  /** A preparation / preview panel or modal is open: timers stop and reset until it is closed. */
  setPaused(paused: boolean): void;
  disconnect(): void;
}

/** `dwellMs` is the measured continuous dwell; absent for a manual mark (nothing was timed). */
export type ViewedCallback = (sentenceId: string, dwellMs?: number) => void;
/** Returns null when automatic detection is unavailable → manual "mark as seen" path. */
export type ViewDetectorFactory = (onViewed: ViewedCallback) => ViewDetector | null;

const tabVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
const windowFocused = () => typeof document === 'undefined' || typeof document.hasFocus !== 'function' || document.hasFocus();

interface Tracked {
  id: string;
  words: number;
  visible: boolean;
  /** Fired during the current stay on screen; cleared when the sentence leaves the screen. */
  fired: boolean;
  since?: number;
  timer?: ReturnType<typeof setTimeout>;
}

export const createViewDetector: ViewDetectorFactory = (onViewed) => {
  if (typeof IntersectionObserver === 'undefined') return null;
  const byEl = new Map<Element, Tracked>();
  const byId = new Map<string, { el: Element; t: Tracked }>();
  let paused = false;
  let focusedByEvent = true; // blur / focus events keep this honest between document.hasFocus() checks

  const active = () => !paused && focusedByEvent && tabVisible() && windowFocused();

  const stop = (t: Tracked) => {
    if (t.timer !== undefined) clearTimeout(t.timer);
    t.timer = undefined;
    t.since = undefined;
  };

  const evaluate = (t: Tracked) => {
    const should = t.visible && !t.fired && active();
    if (!should) { stop(t); return; }
    if (t.timer !== undefined) return;
    t.since = Date.now();
    t.timer = setTimeout(() => {
      t.timer = undefined;
      // Conditions are re-checked at the moment the dwell completes.
      if (!t.visible || t.fired || !active() || t.since === undefined) { t.since = undefined; return; }
      const dwellMs = Date.now() - t.since;
      t.since = undefined;
      t.fired = true;
      onViewed(t.id, dwellMs);
    }, requiredDwellMs(t.words));
  };

  const evaluateAll = () => { for (const { t } of byId.values()) evaluate(t); };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const t = byEl.get(entry.target);
      if (!t) continue;
      t.visible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO;
      if (!t.visible) t.fired = false;
      evaluate(t);
    }
  }, { threshold: [0, VISIBLE_RATIO, 1] });

  const onVisibility = () => evaluateAll();
  const onBlur = () => { focusedByEvent = false; evaluateAll(); };
  const onFocus = () => { focusedByEvent = true; evaluateAll(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  if (typeof window !== 'undefined') { window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus); }

  return {
    observe(el, sentenceId, wordCount = 0) {
      const t: Tracked = { id: sentenceId, words: wordCount, visible: false, fired: false };
      byEl.set(el, t);
      byId.set(sentenceId, { el, t });
      io.observe(el);
    },
    unobserve(sentenceId) {
      const entry = byId.get(sentenceId);
      if (!entry) return;
      io.unobserve(entry.el);
      stop(entry.t);
      byEl.delete(entry.el);
      byId.delete(sentenceId);
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      evaluateAll();
    },
    disconnect() {
      for (const { t } of byId.values()) stop(t);
      io.disconnect();
      byEl.clear();
      byId.clear();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      if (typeof window !== 'undefined') { window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); }
    },
  };
};

/**
 * A scripted detector for tests: records what the Reader observes and lets the test "see" a sentence — which, like
 * the real detector, does nothing while reading is paused.
 */
export class ManualViewDetector implements ViewDetector {
  readonly observed = new Set<string>();
  readonly words = new Map<string, number>();
  paused = false;
  private cb: ViewedCallback | null = null;
  readonly factory: ViewDetectorFactory = (onViewed) => { this.cb = onViewed; return this; };
  observe(_el: Element, sentenceId: string, wordCount = 0) { this.observed.add(sentenceId); this.words.set(sentenceId, wordCount); }
  unobserve(sentenceId: string) { this.observed.delete(sentenceId); this.words.delete(sentenceId); }
  setPaused(paused: boolean) { this.paused = paused; }
  disconnect() { this.observed.clear(); this.words.clear(); }
  /** Simulate the sentence having been visible long enough. */
  see(sentenceId: string, dwellMs = MIN_DWELL_MS) { if (!this.paused) this.cb?.(sentenceId, dwellMs); }
}
