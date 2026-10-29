/**
 * The loading mark: the Go logo's globe, its sphere turning inside the still meridian and stand, drawn in the page's ink as two
 * CSS masks (packages/shared-brand/go-globe-disc.png and go-globe-frame.png, cut from go-logo.png by scripts/split-go-globe.cjs).
 * The shell shows it while a screen opens and the home shows it while its deck loads. The label is for assistive technology
 * (role=status); the mark itself is decorative. The mask images are inline styles with absolute URLs, so they resolve wherever
 * the stylesheet lives (the web build bundles it under assets/). The sphere's mask sits on a child of the turning span: WebKit does
 * not repaint a transform animation on an element that carries a mask itself (2026-10-28: the globe stood still on the owner's phone).
 */
import { h } from './dom';

const discUrl = new URL('../shared-brand/go-globe-disc.png', import.meta.url).href;
const frameUrl = new URL('../shared-brand/go-globe-frame.png', import.meta.url).href;

export function loadingMark(label: string): HTMLElement {
  return h('div', { class: 'go-loading', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'go-globe', 'aria-hidden': 'true' },
      h('span', { class: 'go-globe-frame', style: `-webkit-mask-image: url("${frameUrl}"); mask-image: url("${frameUrl}")` }),
      h('span', { class: 'go-globe-disc' }, h('span', { class: 'go-globe-sphere', style: `-webkit-mask-image: url("${discUrl}"); mask-image: url("${discUrl}")` }))),
    h('span', { class: 'sr' }, label));
}
