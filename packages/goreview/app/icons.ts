/** The line icons of the home's choice rows: plain inline SVG, no text, hidden from assistive technology (the row's own title and caption name it). */
export type IconName = 'deck' | 'review' | 'saved' | 'vocab' | 'tell' | 'book';

const PATHS: Record<IconName, string[]> = {
  deck: ['M7 8.5h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19.5H7A1.5 1.5 0 0 1 5.5 18v-8A1.5 1.5 0 0 1 7 8.5z', 'M8.5 5.5h9.5a1.5 1.5 0 0 1 1.5 1.5'],
  review: ['M19.5 12a7.5 7.5 0 1 1-2.4-5.5', 'M19.5 4.5v4h-4'],
  saved: ['M7 4.5h10a1 1 0 0 1 1 1v14l-6-4-6 4v-14a1 1 0 0 1 1-1z'],
  vocab: ['M9 7h10', 'M9 12h10', 'M9 17h10', 'M5 7h.01', 'M5 12h.01', 'M5 17h.01'],
  tell: ['M5 19l1.2-4.2L16.5 4.5a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L9.2 17.8 5 19z', 'M14.5 6.5l3 3'],
  book: ['M12 6.5C10.2 5.2 7.6 4.8 4.5 5v13c3.1-.2 5.7.2 7.5 1.5 1.8-1.3 4.4-1.7 7.5-1.5V5c-3.1-.2-5.7.2-7.5 1.5z', 'M12 6.5v13'],
};

export function icon(doc: Document, name: IconName): Element {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ec-icon' })) svg.setAttribute(k, v);
  for (const d of PATHS[name]) {
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
