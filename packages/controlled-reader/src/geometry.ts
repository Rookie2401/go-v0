/**
 * Coordinate conversion for the card popup: a rectangle measured inside the epub.js iframe (its own viewport) →
 * the host page's viewport. Pure functions; the browser supplies the rectangles (`getBoundingClientRect`).
 */

export interface Rect { left: number; top: number; width: number; height: number }

/** CSS transforms on the iframe (epub.js scales fixed-layout books) make the rendered size differ from the layout size. */
export function scaleOf(iframeRect: Rect, offsetWidth: number, offsetHeight: number): { x: number; y: number } {
  return {
    x: offsetWidth > 0 && iframeRect.width > 0 ? iframeRect.width / offsetWidth : 1,
    y: offsetHeight > 0 && iframeRect.height > 0 ? iframeRect.height / offsetHeight : 1,
  };
}

/** inner rect (iframe viewport coordinates) → host viewport coordinates. */
export function toHostRect(inner: Rect, iframeRect: Rect, scale: { x: number; y: number } = { x: 1, y: 1 }): Rect {
  return {
    left: iframeRect.left + inner.left * scale.x,
    top: iframeRect.top + inner.top * scale.y,
    width: inner.width * scale.x,
    height: inner.height * scale.y,
  };
}

/** Does the rect intersect the container (the page the learner can see)? Zero-area rects at a corner do not count. */
export function intersects(a: Rect, container: Rect): boolean {
  return a.left < container.left + container.width && a.left + a.width > container.left
    && a.top < container.top + container.height && a.top + a.height > container.top;
}

/** Where to put a popup of `size` so it does not cover the anchor: below it, else above, clamped to the viewport. */
export function popupPosition(anchor: Rect, viewport: { width: number; height: number }, size: { width: number; height: number }, margin = 8): { left: number; top: number; placement: 'below' | 'above' } {
  const below = anchor.top + anchor.height + margin;
  const fitsBelow = below + size.height <= viewport.height;
  const top = fitsBelow ? below : Math.max(0, anchor.top - margin - size.height);
  const left = Math.min(Math.max(0, anchor.left + anchor.width / 2 - size.width / 2), Math.max(0, viewport.width - size.width));
  return { left, top, placement: fitsBelow ? 'below' : 'above' };
}
