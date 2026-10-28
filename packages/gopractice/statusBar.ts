/**
 * Whether the page already starts BELOW the phone's status bar (the owner, 2026-10-28: the GoReview top bar sat one status bar lower than
 * Duolingo's row on the same phone).
 *
 * The top bar pads itself by the top safe-area inset (`--top-inset`, styles.css) so that, where the page is drawn under the status bar
 * (the installed GoReview with its translucent status bar), the Go mark is not hidden behind the clock. Some shells put the page below the
 * status bar themselves and still report the inset (a home-screen copy without the translucent bar; a native shell that adjusts its scroll
 * view's content inset): adding the inset there counts the status bar twice. This module measures it: when the page is shorter than the
 * screen by at least the inset, the status bar is not over the page, `html[data-status-bar="clear"]` is set and `--top-inset` becomes 0.
 */

export interface ViewportFacts {
  /** env(safe-area-inset-top) as the page measures it, in CSS px. */
  inset: number;
  innerWidth: number;
  innerHeight: number;
  /** screen.width / screen.height (on iOS these stay the portrait values whatever the orientation). */
  screenWidth: number;
  screenHeight: number;
}

/** True when the page already starts below the status bar, so the top inset must not be added again. Landscape and a zero inset: false. */
export function startsBelowStatusBar(f: ViewportFacts): boolean {
  if (!(f.inset > 0)) return false;
  if (f.innerWidth > f.innerHeight) return false;
  const long = Math.max(f.screenWidth, f.screenHeight);
  return long - f.innerHeight >= f.inset - 1;
}

/** Measures now and on every resize or turn of the phone; returns the function that stops watching and removes the probe. */
export function watchStatusBar(win: Window, doc: Document): () => void {
  const root = doc.documentElement;
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top, 0px);visibility:hidden;pointer-events:none';
  (doc.body ?? root).append(probe);
  const measure = (): void => {
    const inset = probe.getBoundingClientRect().height;
    const scr = (win as unknown as { screen?: { width?: number; height?: number } }).screen;
    const clear = startsBelowStatusBar({ inset, innerWidth: win.innerWidth, innerHeight: win.innerHeight, screenWidth: scr?.width ?? 0, screenHeight: scr?.height ?? 0 });
    if (clear) root.setAttribute('data-status-bar', 'clear');
    else root.removeAttribute('data-status-bar');
  };
  measure();
  win.addEventListener('resize', measure);
  win.addEventListener('orientationchange', measure);
  return () => {
    win.removeEventListener('resize', measure);
    win.removeEventListener('orientationchange', measure);
    probe.remove();
    root.removeAttribute('data-status-bar');
  };
}
