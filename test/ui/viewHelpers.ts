/**
 * Helpers for exercising REAL view detection in jsdom: a fake IntersectionObserver the test drives, and switches for
 * tab visibility and window focus. (jsdom has none of these behaviours; the production detector reads them.)
 */
import { act } from 'react';
import { vi } from 'vitest';

type Entry = { target: Element; isIntersecting: boolean; intersectionRatio: number };

export class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(private readonly callback: (entries: Entry[], observer: unknown) => void, readonly options?: unknown) { FakeIntersectionObserver.all.push(this); }
  observe(el: Element) { this.targets.add(el); }
  unobserve(el: Element) { this.targets.delete(el); }
  disconnect() { this.targets.clear(); }
  takeRecords() { return []; }
  fire(el: Element, ratio: number) { this.callback([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }], this); }
}

export interface ViewEnv {
  /** Put the sentence on screen at this visible ratio (default fully visible). */
  show(sentenceId: string, ratio?: number): Promise<void>;
  /** Take the sentence off screen. */
  hide(sentenceId: string): Promise<void>;
  /** Move the tab between visible and hidden (fires visibilitychange). */
  setTabVisible(visible: boolean): Promise<void>;
  /** Focus or blur the window (fires focus / blur). */
  setWindowFocused(focused: boolean): Promise<void>;
  /** Let time pass (fake timers). */
  advance(ms: number): Promise<void>;
  restore(): void;
}

/**
 * Install the fake observer, a visible + focused tab, and fake timers that also follow real time (so the harness's own
 * `flush` helpers keep working). Call `restore()` in afterEach.
 */
export function installViewEnv(): ViewEnv {
  FakeIntersectionObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  let visible = true;
  let focused = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
  const hasFocus = vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  vi.useFakeTimers({ shouldAdvanceTime: true });

  const observerOf = (sentenceId: string) => {
    const el = document.querySelector(`[data-sentence-id="${sentenceId}"]`);
    if (!el) throw new Error(`no sentence element ${sentenceId}`);
    const io = FakeIntersectionObserver.all.filter((o) => o.targets.has(el)).at(-1);
    if (!io) throw new Error(`sentence ${sentenceId} is not observed`);
    return { el, io };
  };

  return {
    async show(sentenceId, ratio = 1) { const { el, io } = observerOf(sentenceId); await act(async () => { io.fire(el, ratio); }); },
    async hide(sentenceId) { const { el, io } = observerOf(sentenceId); await act(async () => { io.fire(el, 0); }); },
    async setTabVisible(v) { visible = v; await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); },
    async setWindowFocused(f) { focused = f; await act(async () => { window.dispatchEvent(new Event(f ? 'focus' : 'blur')); }); },
    async advance(ms) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); },
    restore() {
      vi.useRealTimers();
      hasFocus.mockRestore();
      delete (document as unknown as Record<string, unknown>).visibilityState;
      vi.unstubAllGlobals();
    },
  };
}
