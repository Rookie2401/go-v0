/**
 * The loading mark: the Go logo's globe turning about its axis, a whole sphere and not a picture sliding behind a window (the owner, 2026-11-03: the
 * flat strip showed the logo's cut Africa and Europe as crescents at the top left and bottom right, and half the loop was empty). The meridian, the
 * stand and the sphere's rim stay still, drawn in the page's ink as CSS masks cut from go-logo.png by scripts/split-go-globe.cjs. The land is one
 * full turn rendered on a real sphere by scripts/render-go-globe-turn.cjs: 120 frames in a sheet of 12 columns and 10 rows (the logo's Americas,
 * Greenland and Iceland, the rest of the world drawn in the same style, the land fading before the rim), shown through a disc by two nested
 * stepped slides, one for the rows and one for the columns. A transform on the compositor keeps it turning while the page is busy loading.
 * The shell shows the mark while a screen opens and the home shows it while its deck loads. The label is for assistive technology
 * (role=status); the mark itself is decorative. The mask images are inline styles with absolute URLs, so they resolve wherever the
 * stylesheet lives (the web build bundles it under assets/). The sliding spans carry no mask of their own: WebKit does not repaint a
 * transform animation on an element that carries a mask itself (2026-10-28: the globe stood still on the owner's phone); the sheet's
 * mask is on their child.
 */
import { h } from './dom';

const turnUrl = new URL('../../shared-brand/go-globe-turn.png', import.meta.url).href;
const rimUrl = new URL('../../shared-brand/go-globe-rim.png', import.meta.url).href;
const frameUrl = new URL('../../shared-brand/go-globe-frame.png', import.meta.url).href;

const masked = (url: string): string => `-webkit-mask-image: url("${url}"); mask-image: url("${url}")`;

export function loadingMark(label: string): HTMLElement {
  return h('div', { class: 'go-loading', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'go-globe', 'aria-hidden': 'true' },
      h('span', { class: 'go-globe-frame', style: masked(frameUrl) }),
      h('span', { class: 'go-globe-rim', style: masked(rimUrl) }),
      h('span', { class: 'go-globe-sphere' },
        h('span', { class: 'go-globe-disc' },
          h('span', { class: 'go-globe-rows' },
            h('span', { class: 'go-globe-turn' }, h('span', { class: 'go-globe-land', style: masked(turnUrl) })))))),
    h('span', { class: 'sr' }, label));
}
