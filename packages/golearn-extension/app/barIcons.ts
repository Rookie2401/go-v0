/**
 * The line icons of the top bar and of the way to GoReview, in GoReview's manner (packages/goreview/app/app.ts `cogIcon`, `personIcon`,
 * icons.ts `arrow`): plain inline SVG in the current colour, no text, hidden from assistive technology. The link that holds one carries
 * the name (`aria-label` and `title`), so a symbol is never the only thing that says where it leads.
 */
export type BarIconName = 'languages' | 'account' | 'settings' | 'arrow';

type Shape = { circle: [number, number, number] } | { path: string };

const SHAPES: Record<BarIconName, Shape[]> = {
  // a globe: the outline, the equator and one meridian
  languages: [{ circle: [12, 12, 9] }, { path: 'M3 12h18' }, { path: 'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z' }],
  account: [{ circle: [12, 8.5, 3.5] }, { path: 'M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6' }],
  settings: [{ circle: [12, 12, 3] }, { path: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }],
  arrow: [{ path: 'M4 12h15' }, { path: 'm13 6 6 6-6 6' }],
};

export function barIcon(doc: Document, name: BarIconName): Element {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'bar-icon' })) svg.setAttribute(k, v);
  for (const shape of SHAPES[name]) {
    if ('circle' in shape) {
      const circle = doc.createElementNS(ns, 'circle');
      const [cx, cy, r] = shape.circle;
      for (const [k, v] of Object.entries({ cx, cy, r })) circle.setAttribute(k, String(v));
      svg.append(circle);
    } else {
      const path = doc.createElementNS(ns, 'path');
      path.setAttribute('d', shape.path);
      svg.append(path);
    }
  }
  return svg;
}
