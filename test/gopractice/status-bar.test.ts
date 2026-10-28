// @vitest-environment jsdom
/**
 * The status bar counted once (packages/gopractice/statusBar.ts; the owner, 2026-10-28: GoReview's top bar sat one status bar lower than
 * Duolingo's row on the same phone). Where the page already starts below the status bar, html[data-status-bar="clear"] zeroes --top-inset.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { startsBelowStatusBar, watchStatusBar } from '../../packages/gopractice/statusBar';

const phone = { screenWidth: 393, screenHeight: 852, innerWidth: 393 };

describe('startsBelowStatusBar', () => {
  it('a page drawn under a translucent status bar (full screen height) still needs the inset', () => {
    expect(startsBelowStatusBar({ ...phone, inset: 59, innerHeight: 852 })).toBe(false);
  });
  it('a page the shell placed below the status bar (shorter by the inset, or by the inset and the home indicator) does not', () => {
    expect(startsBelowStatusBar({ ...phone, inset: 59, innerHeight: 793 })).toBe(true);
    expect(startsBelowStatusBar({ ...phone, inset: 59, innerHeight: 759 })).toBe(true);
    expect(startsBelowStatusBar({ ...phone, inset: 47, innerHeight: 805.5 })).toBe(true);
  });
  it('no inset (a desktop, a phone browser tab that reports none) and landscape change nothing', () => {
    expect(startsBelowStatusBar({ ...phone, inset: 0, innerHeight: 700 })).toBe(false);
    expect(startsBelowStatusBar({ screenWidth: 393, screenHeight: 852, inset: 59, innerWidth: 852, innerHeight: 393 })).toBe(false);
  });
});

describe('watchStatusBar', () => {
  afterEach(() => { document.documentElement.removeAttribute('data-status-bar'); document.body.innerHTML = ''; });
  it('sets and clears html[data-status-bar] from the measured inset and the viewport, follows resizes, and leaves nothing behind', () => {
    let inset = 59;
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) { return { height: this.getAttribute('aria-hidden') === 'true' && this.style.position === 'fixed' ? inset : 0 } as DOMRect; }; // the probe (jsdom drops the env() height it cannot parse)
    try {
      Object.defineProperty(window, 'screen', { configurable: true, value: { width: 393, height: 852 } });
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 393 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 793 });
      const off = watchStatusBar(window, document);
      expect(document.documentElement.getAttribute('data-status-bar')).toBe('clear');
      (window as { innerHeight: number }).innerHeight = 852;
      window.dispatchEvent(new Event('resize'));
      expect(document.documentElement.hasAttribute('data-status-bar')).toBe(false);
      (window as { innerHeight: number }).innerHeight = 793;
      inset = 0;
      window.dispatchEvent(new Event('orientationchange'));
      expect(document.documentElement.hasAttribute('data-status-bar')).toBe(false);
      inset = 59;
      window.dispatchEvent(new Event('resize'));
      expect(document.documentElement.getAttribute('data-status-bar')).toBe('clear');
      off();
      expect(document.documentElement.hasAttribute('data-status-bar')).toBe(false);
      expect(document.body.children).toHaveLength(0);
      window.dispatchEvent(new Event('resize'));
      expect(document.documentElement.hasAttribute('data-status-bar')).toBe(false);
    } finally { HTMLElement.prototype.getBoundingClientRect = orig; }
  });
});
