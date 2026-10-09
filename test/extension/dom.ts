/**
 * jsdom helpers for the extension tests: build fixture pages, select text, stub the layout jsdom does not compute.
 */
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { WebGenericAdapter, UnsupportedAdapter } from '../../packages/golearn-extension/src/adapters';
import { LookupController, type ControllerDeps } from '../../packages/golearn-extension/src/content/controller';
import { createMemoryEncounterStore } from '../../packages/golearn-extension/src/store';
import { createMemoryMetricsStore } from '../../packages/golearn-extension/src/metrics';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { sqAdapter } from '../../src/adapters/sq';
import type { ReaderAdapter } from '../../packages/golearn-extension/src/contract/readerAdapter';
import type { GoEvent } from '../../packages/repository-contract/src';

export function setBody(html: string): void {
  document.body.innerHTML = html;
  document.getSelection()?.removeAllRanges();
}

/** All text nodes under root. */
export function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text);
  return out;
}

/** Select `needle` (first occurrence inside a single text node under `root`). Returns the range. */
export function selectText(root: Node, needle: string, occurrence = 0): Range {
  let seen = 0;
  for (const t of textNodes(root)) {
    let from = 0;
    for (;;) {
      const at = t.data.indexOf(needle, from);
      if (at < 0) break;
      if (seen++ === occurrence) {
        const r = document.createRange();
        r.setStart(t, at);
        r.setEnd(t, at + needle.length);
        applyRange(r);
        return r;
      }
      from = at + 1;
    }
  }
  throw new Error(`text not found: ${needle}`);
}

export function applyRange(r: Range): void {
  const s = document.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
}

/** Select from (node1, off1) to (node2, off2). */
export function selectAcross(a: Node, ao: number, b: Node, bo: number): Range {
  const r = document.createRange();
  r.setStart(a, ao); r.setEnd(b, bo);
  applyRange(r);
  return r;
}

const fontPx = (n: Node | null): number => {
  const el = n && (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement);
  const v = el && (el as HTMLElement).closest<HTMLElement>('[style*="font-size"]')?.style.fontSize;
  return v && v.endsWith('px') ? parseFloat(v) : 16;
};

/** jsdom has no layout: give ranges a rect that follows the font size, and give the card a size. */
export function stubLayout(opts: { cardWidth?: number; cardHeight?: number; top?: number; viewportHeight?: number } = {}): () => void {
  const top = opts.top ?? 100;
  const rangeRect = function (this: Range) {
    const h = fontPx(this.startContainer) * 1.2;
    return { top, left: 50, right: 110, bottom: top + h, width: 60, height: h, x: 50, y: top, toJSON() {} };
  };
  const P = Range.prototype as unknown as Record<string, unknown>;
  const E = HTMLElement.prototype as unknown as Record<string, unknown>;
  const saved = { b: P.getBoundingClientRect, c: P.getClientRects, e: E.getBoundingClientRect };
  P.getBoundingClientRect = rangeRect;
  P.getClientRects = function (this: Range) { return [rangeRect.call(this)]; };
  E.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList?.contains('card')) return { top: 0, left: 0, right: opts.cardWidth ?? 340, bottom: opts.cardHeight ?? 200, width: opts.cardWidth ?? 340, height: opts.cardHeight ?? 200, x: 0, y: 0, toJSON() {} };
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
  };
  const vh = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  if (opts.viewportHeight) Object.defineProperty(window, 'innerHeight', { value: opts.viewportHeight, configurable: true, writable: true });
  return () => {
    P.getBoundingClientRect = saved.b; P.getClientRects = saved.c; E.getBoundingClientRect = saved.e;
    if (opts.viewportHeight && vh) Object.defineProperty(window, 'innerHeight', vh);
  };
}

export interface Rig {
  controller: LookupController;
  ui: CardUI;
  store: ReturnType<typeof createMemoryEncounterStore>;
  metrics: ReturnType<typeof createMemoryMetricsStore>;
  adapter: WebGenericAdapter;
  deps: ControllerDeps;
}

let n = 0;
/** A controller wired to the real parser and the real web-generic adapter, with memory stores and an immediate frame. */
export function makeRig(over: Partial<ControllerDeps> & { adapters?: ReaderAdapter[] } = {}): Rig {
  const adapter = new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) });
  const holder: { c?: LookupController } = {};
  const ui = over.ui ?? createCardUI({ doc: document, speech: null, onDismiss: () => holder.c?.onCardDismissed() });
  const store = createMemoryEncounterStore();
  const metrics = createMemoryMetricsStore();
  const deps: ControllerDeps = {
    doc: document,
    adapters: over.adapters ?? [adapter, new UnsupportedAdapter()],
    parse: parseSelection,
    ui,
    store: (over.store as typeof store) ?? store,
    metrics: (over.metrics as typeof metrics) ?? metrics,
    identity: { learnerId: 'local-learner', enrolmentId: 'local-enrolment:sq', deviceId: 'dev-test' },
    version: '0.0.1',
    sessionId: `test-${n++}`,
    nextFrame: () => Promise.resolve(),
    ...over,
  };
  const controller = new LookupController(deps);
  holder.c = controller;
  return { controller, ui, store: deps.store as typeof store, metrics: deps.metrics as typeof metrics, adapter, deps };
}

export const flush = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The stored events of one kind (a lookup writes SelectionLookedUp and AnalysisShown; most tests count the lookups). */
export const rowsOf = async (store: { list(): Promise<GoEvent[]> }, kind: string = 'SelectionLookedUp'): Promise<GoEvent[]> => (await store.list()).filter((e) => e.kind === kind);
