// @vitest-environment jsdom
/** The launch screen fades after the first screen, never before SPLASH_MIN_MS from the page's start, waits (capped) for its mark image, and is gone after the fade; a page without one is untouched. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissSplash, SPLASH_FADE_MS, SPLASH_ID, SPLASH_MARK_WAIT_MS, SPLASH_MIN_MS } from '../../packages/gopractice/splash';

describe('the GoReview launch screen', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; });
  afterEach(() => { vi.useRealTimers(); });

  const splash = (): HTMLElement => { const el = document.createElement('div'); el.id = SPLASH_ID; document.body.append(el); return el; };
  const winAt = (nowMs: number): Window => ({ setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms), performance: { now: () => nowMs } } as unknown as Window);

  it('a fast load keeps it on screen until SPLASH_MIN_MS, then fades it and removes it', async () => {
    const el = splash();
    dismissSplash(document, winAt(200));
    await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS - 200 - 1);
    expect(el.classList.contains('out')).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(el.classList.contains('out')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(document.getElementById(SPLASH_ID)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(SPLASH_FADE_MS);
    expect(document.getElementById(SPLASH_ID)).toBeNull();
  });

  it('a slow load fades it at once', async () => {
    const el = splash();
    dismissSplash(document, winAt(SPLASH_MIN_MS + 3000));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.classList.contains('out')).toBe(true);
  });

  it('with a mark image it waits for the image (or SPLASH_MARK_WAIT_MS at most) before fading', async () => {
    const el = splash();
    const mark = document.createElement('span');
    mark.className = 'splash-mark';
    mark.setAttribute('style', "-webkit-mask-image: url('./icons/go-logo.png'); mask-image: url('./icons/go-logo.png')");
    el.append(mark);
    let src = '';
    class FakeImage { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(v: string) { src = v; } }
    const win = { ...winAt(SPLASH_MIN_MS + 3000), Image: FakeImage } as unknown as Window;
    dismissSplash(document, win);
    await vi.advanceTimersByTimeAsync(0);
    expect(src).toBe('./icons/go-logo.png');
    await vi.advanceTimersByTimeAsync(SPLASH_MARK_WAIT_MS - 1);
    expect(el.classList.contains('out')).toBe(false); // still waiting for the image
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1); // the fade timer (0 ms) is set from the image promise's continuation and runs on the next tick
    expect(el.classList.contains('out')).toBe(true); // the cap passed: it fades anyway
  });

  it('does nothing on a page without the element', async () => {
    expect(() => dismissSplash(document, winAt(0))).not.toThrow();
    await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS + SPLASH_FADE_MS);
    expect(document.body.innerHTML).toBe('');
  });
});
