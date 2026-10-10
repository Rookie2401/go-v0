// @vitest-environment jsdom
/** GoLearn Active: underlines through the CSS Custom Highlight API only, never by changing the page's DOM. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVE_CSS, HIGHLIGHT_NAMES, createHighlighter, type HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { ACTIVE_LEVELS } from '../../packages/golearn-extension/src/active/levels';

/** A fake of `Highlight` and `CSS.highlights` (jsdom has neither). */
class FakeHighlight implements HighlightLike {
  ranges = new Set<Range>();
  constructor(...ranges: Range[]) { for (const r of ranges) this.ranges.add(r); }
  add(r: Range) { this.ranges.add(r); return this; }
  delete(r: Range) { return this.ranges.delete(r); }
  clear() { this.ranges.clear(); }
  get size() { return this.ranges.size; }
}

const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };
let saved: { CSS?: unknown; Highlight?: unknown };

beforeEach(() => {
  saved = { CSS: w.CSS, Highlight: w.Highlight };
  document.body.innerHTML = '<p id="p">Beni shkon në shkollë.</p>';
});
afterEach(() => { w.CSS = saved.CSS as typeof w.CSS; w.Highlight = saved.Highlight as typeof w.Highlight; });

const rangeOf = (word: string): Range => {
  const t = document.getElementById('p')!.firstChild as Text;
  const r = document.createRange();
  r.setStart(t, t.data.indexOf(word)); r.setEnd(t, t.data.indexOf(word) + word.length);
  return r;
};

describe('createHighlighter', () => {
  it('without the API: unsupported, and apply() changes nothing (no fallback to wrapping words)', () => {
    w.CSS = undefined; w.Highlight = undefined;
    const before = document.body.innerHTML;
    const h = createHighlighter(document);
    expect(h.supported).toBe(false);
    h.apply(new Map([['met', [rangeOf('Beni')]]]));
    expect(document.body.innerHTML).toBe(before);
    expect(h.counts()).toEqual({ new: 0, met: 0, assisted: 0, known: 0, produced: 0 });
  });

  it('with the API: one named highlight per level, ranges replaced on each apply, and the DOM untouched', () => {
    const registry = new Map<string, HighlightLike>();
    w.CSS = { highlights: registry }; w.Highlight = FakeHighlight;
    const before = document.body.innerHTML;
    const h = createHighlighter(document);
    expect(h.supported).toBe(true);
    h.apply(new Map([['met', [rangeOf('Beni'), rangeOf('shkon')]], ['known', [rangeOf('shkollë')]]]));
    expect(document.body.innerHTML).toBe(before);
    expect([...registry.keys()].sort()).toEqual(['golearn-known', 'golearn-met']);
    expect(h.counts()).toEqual({ new: 0, met: 2, assisted: 0, known: 1, produced: 0 });
    h.apply(new Map([['produced', [rangeOf('në')]], ['new', [rangeOf('shkon')]]]));
    expect(h.counts()).toEqual({ new: 1, met: 0, assisted: 0, known: 0, produced: 1 });
    h.clear();
    expect(h.counts()).toEqual({ new: 0, met: 0, assisted: 0, known: 0, produced: 0 });
    h.apply(new Map([['assisted', [rangeOf('Beni')]]]));
    h.dispose();
    expect(registry.size).toBe(0);
  });

  it('the style sheet has one ::highlight rule per level, each an underline: dashed for new, dotted for the two faint levels, solid for the rest', () => {
    for (const l of ACTIVE_LEVELS) expect(ACTIVE_CSS).toContain(`::highlight(${HIGHLIGHT_NAMES[l]})`);
    expect(ACTIVE_CSS.match(/underline dashed/g)).toHaveLength(1);
    expect(ACTIVE_CSS.match(/underline dotted/g)).toHaveLength(2);
    expect(ACTIVE_CSS.match(/underline solid/g)).toHaveLength(2);
    expect(ACTIVE_CSS).not.toMatch(/background/);
  });
});
