/**
 * jsdom helpers for the tutorial tests: select text inside an element, and give ranges and the card a layout jsdom does
 * not compute. (Small and local on purpose: the extension’s own test helpers import the lookup controller, which another
 * part of the repository is free to change.)
 */
export function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text);
  return out;
}

/** Select `needle` (first occurrence inside a single text node under `root`). */
export function selectText(root: Node, needle: string): Range {
  for (const t of textNodes(root)) {
    const at = t.data.indexOf(needle);
    if (at < 0) continue;
    const r = document.createRange();
    r.setStart(t, at);
    r.setEnd(t, at + needle.length);
    const s = document.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    return r;
  }
  throw new Error(`text not found: ${needle}`);
}

export function stubLayout(): () => void {
  const rect = () => ({ top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20, x: 50, y: 100, toJSON() { /* */ } });
  const P = Range.prototype as unknown as Record<string, unknown>;
  const E = HTMLElement.prototype as unknown as Record<string, unknown>;
  const saved = { b: P.getBoundingClientRect, c: P.getClientRects, e: E.getBoundingClientRect };
  P.getBoundingClientRect = rect;
  P.getClientRects = () => [rect()];
  E.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList?.contains('card')) return { top: 0, left: 0, right: 340, bottom: 200, width: 340, height: 200, x: 0, y: 0, toJSON() { /* */ } };
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() { /* */ } };
  };
  return () => { P.getBoundingClientRect = saved.b; P.getClientRects = saved.c; E.getBoundingClientRect = saved.e; };
}
