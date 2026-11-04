/**
 * The loading mark: the Go logo's globe turning about its axis, a whole sphere and not a picture sliding behind a window (the owner, 2026-11-03: the
 * flat strip showed the logo's cut Africa and Europe as crescents at the top left and bottom right, and half the loop was empty). The meridian, the
 * stand and the sphere's rim stay still, drawn in the page's ink as CSS masks cut from go-logo.png by scripts/split-go-globe.cjs. The land is one
 * full turn rendered on a real sphere by scripts/render-go-globe-turn.cjs: 361 frames in a sheet of 19 columns and 19 rows (the logo's Americas,
 * Greenland and Iceland, the rest of the world drawn in the same style, the land fading before the rim), shown through a disc by one stepped
 * animation of 361 stops. A transform on the compositor keeps it turning while the page is busy loading.
 * A home load shows up to three marks in a row. Each one takes its place in the turn from the clock, so the globe carries on instead of restarting
 * at its first frame, and one that follows another within a moment shows at once instead of fading in again.
 * The shell shows the mark while a screen opens and the home shows it while its deck loads. The label is for assistive technology
 * (role=status); the mark itself is decorative. The mask images are inline styles with absolute URLs, so they resolve wherever the
 * stylesheet lives (the web build bundles it under assets/). The sliding span carries no mask of its own: WebKit does not repaint a
 * transform animation on an element that carries a mask itself (2026-10-28: the globe stood still on the owner's phone); the sheet's
 * mask is on its child.
 */
import { h } from './dom';

const turnUrl = new URL('../../shared-brand/go-globe-turn.png', import.meta.url).href;
const rimUrl = new URL('../../shared-brand/go-globe-rim.png', import.meta.url).href;
const frameUrl = new URL('../../shared-brand/go-globe-frame.png', import.meta.url).href;

const masked = (url: string): string => `-webkit-mask-image: url("${url}"); mask-image: url("${url}")`;

/** One turn, as in the stylesheet: .go-globe-turn, and its slower duration under reduced motion. */
const TURN_MS = 6000, TURN_REDUCED_MS = 15000;
/** A mark this soon after the last one replaces it on the same load: it shows at once. */
const CONTINUES_WITHIN_MS = 1000;
let lastMarkAt: number | undefined;

const reducedMotion = (): boolean => { try { return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; } };

export function loadingMark(label: string): HTMLElement {
  const now = performance.now();
  const continues = lastMarkAt !== undefined && now - lastMarkAt < CONTINUES_WITHIN_MS;
  lastMarkAt = now;
  // a negative delay starts the turn where the clock says it is, so every mark on the page shows the same moment of the same turn
  const place = Math.round(now % (reducedMotion() ? TURN_REDUCED_MS : TURN_MS));
  return h('div', { class: continues ? 'go-loading continues' : 'go-loading', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'go-globe', 'aria-hidden': 'true' },
      h('span', { class: 'go-globe-frame', style: masked(frameUrl) }),
      h('span', { class: 'go-globe-rim', style: masked(rimUrl) }),
      h('span', { class: 'go-globe-sphere' },
        h('span', { class: 'go-globe-disc' },
          h('span', { class: 'go-globe-turn', style: `animation-delay: -${place}ms` }, h('span', { class: 'go-globe-land', style: masked(turnUrl) }))))),
    h('span', { class: 'sr' }, label));
}
