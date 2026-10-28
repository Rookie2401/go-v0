/**
 * The loading mark: the Go logo's globe turning about its axis, drawn in the page's ink as three CSS masks cut from go-logo.png by
 * scripts/split-go-globe.cjs (packages/shared-brand/go-globe-land.png, -rim.png, -frame.png). The meridian, the stand and the sphere's
 * rim stay still; the continents drift across the sphere and pass out of sight at its edge, as on a desk globe (the owner, 2026-10-28:
 * "the globe should rotate along its axis, not spin"). The sphere is a circle the land is clipped to, tilted like the logo's meridian;
 * inside it a strip twice the sphere's width carries the land twice over and slides along the tilted equator, so when one copy leaves
 * at one edge the next arrives at the other and the motion never jumps.
 * The shell shows the mark while a screen opens and the home shows it while its deck loads. The label is for assistive technology
 * (role=status); the mark itself is decorative. The mask images are inline styles with absolute URLs, so they resolve wherever the
 * stylesheet lives (the web build bundles it under assets/). The sliding strip carries no mask of its own: WebKit does not repaint a
 * transform animation on an element that carries a mask itself (2026-10-28: the globe stood still on the owner's phone); the land's
 * mask is on its child.
 */
import { h } from './dom';

const landUrl = new URL('../../shared-brand/go-globe-land.png', import.meta.url).href;
const rimUrl = new URL('../../shared-brand/go-globe-rim.png', import.meta.url).href;
const frameUrl = new URL('../../shared-brand/go-globe-frame.png', import.meta.url).href;

const masked = (url: string): string => `-webkit-mask-image: url("${url}"); mask-image: url("${url}")`;

export function loadingMark(label: string): HTMLElement {
  return h('div', { class: 'go-loading', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'go-globe', 'aria-hidden': 'true' },
      h('span', { class: 'go-globe-frame', style: masked(frameUrl) }),
      h('span', { class: 'go-globe-rim', style: masked(rimUrl) }),
      h('span', { class: 'go-globe-sphere' },
        h('span', { class: 'go-globe-turn' }, h('span', { class: 'go-globe-land', style: masked(landUrl) })))),
    h('span', { class: 'sr' }, label));
}
