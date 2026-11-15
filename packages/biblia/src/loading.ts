/**
 * Biblia's loading mark (the owner, 2026-11-05: "an open book with pages flipping", not GoReview's globe): an open book in the app's own
 * paper and ink, a leaf lifting from the right page and coming down on the left, one after another. It is shown while the app opens (the
 * same markup sits in index.html, so it paints before any script runs) and while a book that has not been read this session is fetched.
 *
 * The leaves turn by a transform on the compositor (styles.css, .bk-leaf), so the turning is as smooth as the screen draws and keeps going
 * while the page is busy. Each leaf is visible only while it turns: lying flat on either side it would look like the page under it and
 * would hide the leaf that turns next.
 */

/** The book: boards, the two pages, three leaves that turn in sequence, the spine. Static markup of this file only, never built from data. */
export const BOOK_MARK_INNER = '<span class="bk" aria-hidden="true"><span class="bk-board"></span><span class="bk-page bk-page-left"></span><span class="bk-page bk-page-right"></span>'
  + '<span class="bk-leaf"></span><span class="bk-leaf"></span><span class="bk-leaf"></span><span class="bk-spine"></span></span>';

/** The label the app's first paint carries (index.html). */
export const OPENING_LABEL = 'Opening Biblia…';

/** A status with the turning book and a label for assistive technology. */
export function bookMark(doc: Document, label: string): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'bk-loading';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = BOOK_MARK_INNER;
  const text = doc.createElement('span');
  text.className = 'bk-label';
  text.textContent = label;
  el.append(text);
  return el;
}
