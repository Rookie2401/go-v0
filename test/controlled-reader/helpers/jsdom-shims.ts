/**
 * jsdom has no layout engine. epub.js needs a few browser APIs jsdom lacks; these shims return zero geometry so the
 * epub.js object model (book, spine, navigation, CFI, rendition, iframe contents, annotations) can be exercised
 * WITHOUT claiming anything about pagination or pixel positions (those are manual browser checks: see MANUAL.md).
 */
export function installUrlShims(): void {
  const u = globalThis.URL as unknown as { createObjectURL?: (b: unknown) => string; revokeObjectURL?: (s: string) => void };
  let n = 0;
  u.createObjectURL = () => `blob:jsdom-shim/${++n}`;
  u.revokeObjectURL = () => undefined;
}

const ZERO = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };

/** Add the missing geometry/scroll APIs to a window (the main window, or the window of an epub.js iframe). */
export function shimWindow(win: Window & typeof globalThis): void {
  const range = win.Range?.prototype as unknown as Record<string, unknown> | undefined;
  if (range) {
    if (!range.getBoundingClientRect) range.getBoundingClientRect = () => ({ ...ZERO });
    if (!range.getClientRects) range.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () { /* empty */ } });
  }
  win.scrollTo = (() => undefined) as typeof win.scrollTo;
  // epub.js's resize listener calls requestAnimationFrame from a timer, sometimes after the test environment is
  // gone; a timer-backed shim keeps that from surfacing as an unhandled ReferenceError (seen in the full-suite run).
  const w = win as unknown as { requestAnimationFrame?: (cb: (t: number) => void) => number; cancelAnimationFrame?: (h: number) => void };
  if (typeof w.requestAnimationFrame !== 'function') w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  if (typeof w.cancelAnimationFrame !== 'function') w.cancelAnimationFrame = (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
  const g = globalThis as unknown as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
  if (typeof g.requestAnimationFrame !== 'function') g.requestAnimationFrame = w.requestAnimationFrame;
  if (typeof g.cancelAnimationFrame !== 'function') g.cancelAnimationFrame = w.cancelAnimationFrame;
}

/**
 * Shim every iframe window the moment it finishes loading. A capturing listener on the host document runs before the
 * iframe's own load handler (epub.js's), so the shims are in place before epub.js lays the document out.
 */
export function shimIframesOnLoad(doc: Document): () => void {
  const onLoad = (e: Event): void => {
    const t = e.target as HTMLIFrameElement | null;
    if (t && t.tagName === 'IFRAME' && t.contentWindow) shimWindow(t.contentWindow as unknown as Window & typeof globalThis);
  };
  doc.addEventListener('load', onLoad, true);
  return () => doc.removeEventListener('load', onLoad, true);
}
