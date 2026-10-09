/**
 * `epub-local` — the ReaderAdapter for the controlled EPUB reader page (an epub.js rendition of a DRM-free file the
 * learner chose). PROTOTYPE: this adapter and src/sentences.ts are production candidates; the reader page is not.
 *
 * Why the claims in `capabilities()` are honest here (and would not be for a third-party reader):
 *  - epub.js renders each chapter in an `<iframe sandbox="allow-same-origin">` created from `srcdoc`, so the iframe
 *    document is same-origin with the host page and its DOM is readable. Book scripts do not run (no allow-scripts).
 *  - a selection yields a CFI (EpubCFI.fromRange): a stable locator that is re-found after pagination, font-size
 *    reflow and re-render, because it is built from the DOM path, not from geometry.
 *  - the adapter reads only the chapter document that is displayed; it never loads another spine item to find a
 *    neighbouring sentence (see sentences.ts `limits`).
 *
 * The adapter implements the shared contract (packages/golearn-extension/src/contract: type imports only).
 */
import type {
  ContextOptions, LayoutChange, PageDescriptor, PopupAnchor, ReaderAdapter, ReaderContext, Rect, SelectionFailure,
  SelectionResult, SourceReference, TextDirection,
} from '../../golearn-extension/src/contract/readerAdapter';
import type { ReaderCapabilities } from '../../golearn-extension/src/contract/readerCapabilities';
import { toHostRect, scaleOf, intersects, type Rect as GRect } from './geometry';
import { cleanText, contextFromRange, locate, type SentenceOptions } from './sentences';

// ───────────────────────────── the epub.js surface this adapter uses (structural) ─────────────────────────────

export interface ContentsLike {
  document: Document;
  window: Window;
  cfiBase: string;
  sectionIndex: number;
  cfiFromRange(range: Range): string;
  range(cfi: string): Range;
}

export interface RenditionLike {
  getContents(): ContentsLike[] | ContentsLike;
  location?: { start?: { cfi?: string; index?: number } };
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  themes: { fontSize(size: string): void };
  annotations: {
    highlight(cfiRange: string, data?: object, cb?: (e: Event) => void, className?: string, styles?: object): unknown;
    remove(cfiRange: string, type: string): void;
  };
  manager?: { container?: HTMLElement };
}

export interface BookLike {
  packaging?: { metadata?: { title?: string; language?: string; direction?: string } };
}

export interface ReaderHandle { book: BookLike; rendition: RenditionLike }

export interface EpubLocalOptions extends SentenceOptions {
  /** epub.js version string, reported in capabilities. */
  version?: string;
  maxSelectionWords?: number;
  maxSelectionChars?: number;
  /** The window that hosts the reader page (default: the global window). */
  hostWindow?: Window;
}

/** Title the reader page carries; `matches` uses it because a dev server serves the page at `/`. */
export const READER_PAGE_TITLE = 'Go controlled reader (prototype)';

const fail = (reason: SelectionFailure['reason'], message: string): SelectionFailure => ({ ok: false, reason, message });

const wordCount = (s: string): number => {
  let n = 0;
  for (const seg of new Intl.Segmenter('und', { granularity: 'word' }).segment(s)) if (seg.isWordLike) n++;
  return n;
};

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/gu;
const LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿऀ-෿฀-໿]/gu;
function textDirection(text: string): TextDirection {
  const r = (text.match(RTL) ?? []).length;
  const l = (text.match(LTR) ?? []).length;
  if (!r && !l) return 'unknown';
  return r > l ? 'rtl' : 'ltr';
}

const toRect = (r: { top: number; left: number; width: number; height: number }): Rect =>
  ({ top: r.top, left: r.left, right: r.left + r.width, bottom: r.top + r.height, width: r.width, height: r.height });

export class EpubLocalAdapter implements ReaderAdapter {
  readonly id = 'epub-local';
  private readonly reader: ReaderHandle;
  private readonly opts: EpubLocalOptions;
  private readonly hostWin: Window;
  private readonly cleanups = new Set<() => void>();
  private readonly layoutListeners = new Set<(c: LayoutChange) => void>();
  private readonly highlightCfis = new Set<string>();
  private lastDirection: TextDirection = 'unknown';

  constructor(reader: ReaderHandle, options: EpubLocalOptions = {}) {
    this.reader = reader;
    this.opts = options;
    this.hostWin = options.hostWindow ?? window;
  }

  // ─────────────────────────────── contract ───────────────────────────────

  matches(location: PageDescriptor): boolean {
    if (!['http:', 'https:', 'file:'].includes(location.protocol)) return false;
    return (location.title ?? '').startsWith(READER_PAGE_TITLE) || /\/controlled-reader(\/|$)/.test(location.pathname);
  }

  capabilities(): ReaderCapabilities {
    return {
      readerId: this.id,
      platform: 'epub.js rendition, same-origin sandboxed iframe',
      ...(this.opts.version ? { version: this.opts.version } : {}),
      userTriggeredSelection: true,
      wordSelection: true,
      selectedTextAvailable: true,
      sentenceContext: 'full',
      adjacentContext: true,
      stableAnchors: { kind: 'cfi', note: 'EPUB CFI of the selection range (epub.js EpubCFI); re-found after pagination, reflow and re-render; never contains text.' },
      popupPositioning: 'range-rect',
      layoutChangeHandling: 'observer',
      persistentAnnotation: { supported: true, mechanism: 'epub.js annotations API (CFI highlights); local only, CFIs only, no text', termsReviewed: true },
      offline: true,
      contentAccessRestrictions: 'DRM-free files only; protected EPUBs refused',
      contextConfidence: 0.9,
      requiredPermissions: [],
    };
  }

  selection(): SelectionResult {
    for (const c of this.contents()) {
      const sel = c.document.getSelection?.() ?? c.window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) continue;
      const range = sel.getRangeAt(0).cloneRange();
      const loc = locate(range);
      if ('failure' in loc) {
        if (loc.failure === 'multi-block') return fail('multi-block', 'Select a word or phrase inside one paragraph.');
        return fail(loc.failure === 'empty' ? 'empty' : 'unreadable', 'Nothing to look up in that selection.');
      }
      const surface = cleanText(loc.text.slice(loc.s, loc.e));
      if (!surface) return fail('empty', 'Nothing to look up in that selection.');
      const maxWords = this.opts.maxSelectionWords ?? 80;
      const maxChars = this.opts.maxSelectionChars ?? 1200;
      if (wordCount(surface) > maxWords || surface.length > maxChars) return fail('too-long', `Select a word or a short phrase (up to ${maxWords} words).`);
      const { direction, source } = this.directionOf(loc.block, surface);
      this.lastDirection = direction;
      const pageLanguage = loc.block.closest('[lang]')?.getAttribute('lang') ?? c.document.documentElement.getAttribute('lang') ?? undefined;
      return {
        ok: true, surface, range, direction, directionSource: source,
        snapped: loc.s !== loc.rawS || loc.e !== loc.rawE, frame: 'same-origin-frame',
        ...(pageLanguage ? { pageLanguage: pageLanguage.trim() || undefined } : {}),
      };
    }
    return fail('no-selection', 'Select a word first.');
  }

  context(range: Range, options: ContextOptions = {}): ReaderContext {
    if (!this.contentsOf(range)) return { kind: 'none', confidence: 0, reason: 'the chapter that held this selection is no longer displayed' };
    const ctx = contextFromRange(range, { abbreviations: this.opts.abbreviations, segment: this.opts.segment });
    if (ctx.kind === 'none') return { kind: 'none', confidence: 0, reason: ctx.reason };
    const out: ReaderContext = {
      kind: ctx.kind, confidence: ctx.confidence, sentence: ctx.sentence, selStart: ctx.selStart, selEnd: ctx.selEnd,
      ...(ctx.reason ? { reason: ctx.reason.replace(/-/g, ' ') } : {}),
    };
    if (options.adjacent) {
      if (ctx.before) out.before = ctx.before;
      if (ctx.after) out.after = ctx.after;
    }
    return out;
  }

  /** Kind, title and CFI locator of what is being read — never its text. */
  sourceRef(): SourceReference {
    const title = (this.reader.book.packaging?.metadata?.title ?? '').trim().slice(0, 120);
    const locator = this.locator();
    return { kind: 'file', ...(title ? { title } : {}), ...(locator ? { locator } : {}) };
  }

  anchor(range: Range | undefined): PopupAnchor {
    const viewport = { width: this.hostWin.innerWidth || 1024, height: this.hostWin.innerHeight || 768 };
    const rtl = this.lastDirection === 'rtl';
    const fallback: PopupAnchor = { rect: { top: 16, left: viewport.width - 16, right: viewport.width - 16, bottom: 16, width: 0, height: 0 }, viewport, rtl, source: 'fallback' };
    if (!range) return fallback;
    const c = this.contentsOf(range);
    const frame = c?.window.frameElement as HTMLIFrameElement | null | undefined;
    if (!c || !frame) return fallback;
    let inner: GRect | undefined;
    try {
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
      const r = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) inner = { left: r.left, top: r.top, width: r.width, height: r.height };
    } catch { /* a detached range has no rect */ }
    if (!inner) return fallback;
    const fr = frame.getBoundingClientRect();
    const frameRect: GRect = { left: fr.left, top: fr.top, width: fr.width, height: fr.height };
    const host = toHostRect(inner, frameRect, scaleOf(frameRect, frame.offsetWidth, frame.offsetHeight));
    // text in a column that is not on the screen has a rect outside the reading area: do not pretend it is shown
    const box = this.reader.rendition.manager?.container?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0 && !intersects(host, { left: box.left, top: box.top, width: box.width, height: box.height })) return fallback;
    return { rect: toRect(host), viewport, rtl, source: 'range' };
  }

  onLayoutChange(cb: (change: LayoutChange) => void): () => void {
    const r = this.reader.rendition;
    const pairs: Array<[string, () => void]> = [
      ['relocated', () => cb({ reason: 'scroll' })], // a page turn or chapter change moves the text under a shown card
      ['resized', () => cb({ reason: 'resize' })],
      ['layout', () => cb({ reason: 'resize' })],
    ];
    for (const [ev, fn] of pairs) r.on(ev, fn);
    this.layoutListeners.add(cb);
    const off = (): void => {
      for (const [ev, fn] of pairs) r.off(ev, fn);
      this.layoutListeners.delete(cb);
      this.cleanups.delete(off);
    };
    this.cleanups.add(off);
    return off;
  }

  isRangeLive(range: Range): boolean {
    try {
      const frame = range.startContainer.ownerDocument?.defaultView?.frameElement;
      return range.startContainer.isConnected && range.endContainer.isConnected && !range.collapsed && !!frame && frame.isConnected;
    } catch { return false; }
  }

  dispose(): void {
    for (const off of [...this.cleanups]) off();
    this.cleanups.clear();
    this.layoutListeners.clear();
    this.highlightCfis.clear();
  }

  // ─────────────────────────────── beyond the contract: CFI anchors, highlights, font size ───────────────────────────────

  /** The EPUB CFI of a range inside a displayed chapter (text-free locator), or undefined if no chapter shows it. */
  cfiOf(range: Range): string | undefined {
    return this.contentsOf(range)?.cfiFromRange(range);
  }

  /** Re-find a range from its CFI in the displayed chapter that holds it; undefined when that chapter is not displayed. */
  rangeFromCfi(cfi: string): Range | undefined {
    const m = /^epubcfi\(\/6\/(\d+)(?:\[[^\]]*\])?!/.exec(cfi);
    const sectionIndex = m ? Number(m[1]) / 2 - 1 : undefined;
    const c = this.contents().find((x) => x.sectionIndex === sectionIndex);
    if (!c) return undefined;
    try { return c.range(cfi); } catch { return undefined; }
  }

  /** Highlight a range (annotation by CFI, local only). Returns the CFI. */
  highlight(range: Range, className = 'go-highlight'): string | undefined {
    const cfi = this.cfiOf(range);
    if (!cfi) return undefined;
    this.reader.rendition.annotations.highlight(cfi, {}, undefined, className, { fill: 'gold', 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' });
    this.highlightCfis.add(cfi);
    return cfi;
  }

  removeHighlight(cfi: string): void {
    this.reader.rendition.annotations.remove(cfi, 'highlight');
    this.highlightCfis.delete(cfi);
  }

  /** CFIs of the highlights this adapter added in this session. */
  highlights(): string[] { return [...this.highlightCfis]; }

  /** Change the reading font size (percent) — reflows the pages — and tell the card to re-anchor. */
  setFontSize(percent: number): void {
    this.reader.rendition.themes.fontSize(`${Math.round(percent)}%`);
    for (const cb of [...this.layoutListeners]) cb({ reason: 'font' });
  }

  /** Current position as a CFI: the rendition's location when it belongs to the displayed chapter, else the chapter. */
  locator(): string | undefined {
    const first = this.contents()[0];
    const loc = this.reader.rendition.location?.start;
    if (loc?.cfi && (!first || loc.index === undefined || loc.index === first.sectionIndex)) return loc.cfi;
    return first ? `epubcfi(${first.cfiBase}!)` : undefined;
  }

  // ─────────────────────────────── internals ───────────────────────────────

  private contents(): ContentsLike[] {
    const c = this.reader.rendition.getContents();
    return (Array.isArray(c) ? c : c ? [c] : []).filter((x) => !!x?.document);
  }

  private contentsOf(range: Range): ContentsLike | undefined {
    const doc = range.startContainer.ownerDocument;
    return this.contents().find((c) => c.document === doc);
  }

  private directionOf(block: Element, surface: string): { direction: TextDirection; source: 'attribute' | 'style' | 'text' | 'none' } {
    const explicit = block.closest('[dir]')?.getAttribute('dir')?.toLowerCase();
    if (explicit === 'rtl' || explicit === 'ltr') return { direction: explicit, source: 'attribute' };
    try {
      const d = block.ownerDocument.defaultView?.getComputedStyle(block).direction;
      if (d === 'rtl') return { direction: 'rtl', source: 'style' };
    } catch { /* no computed style */ }
    const byText = textDirection(surface);
    return byText === 'unknown' ? { direction: 'unknown', source: 'none' } : { direction: byText, source: 'text' };
  }
}
