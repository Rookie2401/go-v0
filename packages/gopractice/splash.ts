/**
 * The GoReview launch screen: the review build's index.html carries #goreview-splash (the Go mark over the word REVIEW, stacked,
 * in the page's own ink on its own paper) so that something branded is on screen from the first paint, before any script runs.
 * Once the first screen has rendered, the app fades it away; it stays at least SPLASH_MIN_MS so that a fast load does not flash it.
 * Other builds (the web GoPractice, the extension page) have no such element and nothing happens.
 */
export const SPLASH_ID = 'goreview-splash';
/** The least time the launch screen stays, measured from the page's own start (performance.now()). */
export const SPLASH_MIN_MS = 900;
/** The fade (matches the stylesheet's transition on #goreview-splash). */
export const SPLASH_FADE_MS = 550;
/** The longest the launch screen waits for its mark image before fading anyway (a slow or failed fetch must not hold the app). */
export const SPLASH_MARK_WAIT_MS = 2000;

/** The mark is a CSS mask image (so it takes the page's ink); the first visit has to fetch it, and the screen must not fade before it has shown. */
function markLoaded(el: HTMLElement, win: Window): Promise<void> {
  const style = el.querySelector('.splash-mark')?.getAttribute('style') ?? '';
  const url = /url\(['"]?([^'")]+)['"]?\)/.exec(style)?.[1];
  const Img = (win as Window & { Image?: new () => HTMLImageElement }).Image;
  if (!url || typeof Img !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Img();
    const done = (): void => resolve();
    img.onload = done; img.onerror = done;
    win.setTimeout(done, SPLASH_MARK_WAIT_MS);
    img.src = url;
  });
}

export function dismissSplash(doc: Document, win: Window, minMs = SPLASH_MIN_MS): void {
  const el = doc.getElementById(SPLASH_ID);
  if (!el) return;
  void markLoaded(el, win).then(() => {
    const perf = (win as Window & { performance?: { now?: () => number } }).performance;
    const shownFor = typeof perf?.now === 'function' ? perf.now() : minMs;
    const wait = Math.max(0, minMs - shownFor);
    win.setTimeout(() => {
      el.classList.add('out');
      el.setAttribute('aria-hidden', 'true');
      win.setTimeout(() => { el.remove(); }, SPLASH_FADE_MS);
    }, wait);
  });
}
