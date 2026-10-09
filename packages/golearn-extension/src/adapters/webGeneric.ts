/**
 * web-generic — the reader adapter for an ordinary web page. Candidate for production (with the contract).
 *
 * What it does: reads the user's own selection (`getSelection()`), turns it into a Unicode-safe surface (NFC, whole
 * grapheme clusters, whitespace collapsed), finds the enclosing block, flattens the block's visible text nodes with an
 * exact offset map, and cuts the sentence around the selection with an injected sentence segmenter (the language pack's;
 * a plain Intl.Segmenter fallback when none is given).
 *
 * What it never does: scroll, fetch, observe the page when no lookup is open, read form fields or editable regions,
 * read a cross-origin frame, keep the text after the lookup, or change a pixel of the page. The page text it holds is
 * in memory only, in `located`, and is dropped on the next selection or on dispose().
 */
import { noCapabilities, type ReaderCapabilities, type SentenceContextLevel } from '../contract/readerCapabilities';
import {
  GOLEARN_HOST_ATTR,
  type ContextOptions, type LayoutChange, type PageDescriptor, type PopupAnchor, type ReaderAdapter, type ReaderContext,
  type ReaderSelection, type SelectionFailure, type SelectionResult, type AnySourceReference, type TextDirection, type Rect,
} from '../contract/readerAdapter';
import { collapseWhitespace, nfcOffset, safeCutAfter, safeCutBefore, snapToGraphemes, textDirection, wordCount, type Span } from '../text';
import { declinedHostsFromRegistry } from './registry';
import { documentLanguageOf } from './languageMeta';
import type { AdapterLanguageEvidence } from '../contract/language';

export interface WebGenericOptions {
  doc?: Document;
  /** The adapter's identity; site adapters built from the registry pass their own. Default `web-generic`. */
  readerId?: string;
  /**
   * A fixed sentence segmenter for every language (spans are slices of the text). Normally absent: the controller hands
   * the resolved language's cutter in `context(range, { segmenter })`, and without one this falls back to a locale-aware Intl.Segmenter.
   */
  segmentSentences?: (text: string) => Span[];
  /** Hosts whose reading terms are not reviewed: this adapter declines them (docs/ecosystem strategy §8). */
  declinedHosts?: string[];
  maxSelectionWords?: number;
  maxSelectionChars?: number;
  /** Longest block text that is scanned whole; beyond it a window around the selection is used (a fragment). */
  maxBlockChars?: number;
  windowChars?: number;
}

/**
 * Reader web apps this adapter does not read (blocked, permission-required or unsupported in the registry). Derived from
 * the registry, which is the one place these hosts and their reasons are written down (`registry.ts`).
 */
export const DEFAULT_DECLINED_HOSTS: string[] = [...declinedHostsFromRegistry()];

const TEXT_BLOCKS = new Set(['P', 'LI', 'DD', 'DT', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGCAPTION', 'CAPTION']);
const OTHER_BLOCKS = new Set(['DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'TD', 'TH', 'PRE', 'UL', 'OL', 'DL', 'TABLE', 'TR', 'TBODY', 'THEAD', 'FORM', 'FIELDSET', 'DETAILS', 'SUMMARY', 'BODY', 'HTML', 'ADDRESS', 'HR', 'FIGURE']);
const INLINE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'CODE', 'DATA', 'DFN', 'EM', 'I', 'KBD', 'MARK', 'Q', 'RUBY', 'RT', 'RP', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR', 'FONT', 'BIG', 'TT', 'LABEL', 'DEL', 'INS']);
const SKIPPED_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'OPTION', 'SELECT', 'SVG', 'MATH']);

const hostAttrSelector = `[${GOLEARN_HOST_ATTR}]`;

export interface Located {
  range: Range;
  block: Element;
  blockKind: 'text' | 'container';
  /** The block's visible text, whitespace collapsed (raw Unicode form). In memory for this lookup only. */
  flat: string;
  s: number; // selection start in flat (trimmed, grapheme-snapped)
  e: number;
  rawS: number; // before snapping to whole grapheme clusters
  rawE: number;
  surface: string;
  direction: TextDirection;
  frameDoc: Document;
  frameEl: Element | null;
}

export type Frame = { doc: Document; frameEl: Element | null; crossOrigin: boolean };

export class WebGenericAdapter implements ReaderAdapter {
  readonly id: string;
  protected readonly doc: Document;
  protected readonly opts: Required<Omit<WebGenericOptions, 'doc' | 'segmentSentences' | 'readerId'>> & { segment: ((t: string) => Span[]) | undefined };
  protected located: Located | undefined;
  protected lastFrameState: 'top' | 'same-origin-frame' | 'cross-origin-frame' = 'top';
  protected lastConfidence = 0.7;
  private cleanups = new Set<() => void>();
  private fallbackSegmenters = new Map<string, Intl.Segmenter>();

  constructor(options: WebGenericOptions = {}) {
    this.id = options.readerId ?? 'web-generic';
    this.doc = options.doc ?? document;
    this.opts = {
      declinedHosts: options.declinedHosts ?? DEFAULT_DECLINED_HOSTS,
      maxSelectionWords: options.maxSelectionWords ?? 80,
      maxSelectionChars: options.maxSelectionChars ?? 1200,
      maxBlockChars: options.maxBlockChars ?? 6000,
      windowChars: options.windowChars ?? 240,
      segment: options.segmentSentences,
    };
  }

  matches(location: PageDescriptor): boolean {
    if (!['http:', 'https:', 'file:'].includes(location.protocol)) return false;
    if (location.contentType && !/^(text\/html|application\/xhtml\+xml|text\/plain)/i.test(location.contentType)) return false;
    const host = location.host.toLowerCase().replace(/:\d+$/, '');
    return !this.opts.declinedHosts.some((h) => host === h || host.endsWith('.' + h));
  }

  capabilities(): ReaderCapabilities {
    if (this.lastFrameState === 'cross-origin-frame') {
      return {
        ...noCapabilities(this.id, 'The selection is inside a cross-origin frame: the browser does not let this script read it or its sentence.'),
        platform: 'web',
      };
    }
    const level: SentenceContextLevel = this.lastConfidence >= 0.5 ? 'full' : 'partial';
    return {
      readerId: this.id,
      platform: 'web',
      userTriggeredSelection: true,
      wordSelection: true,
      selectedTextAvailable: true,
      sentenceContext: level,
      adjacentContext: true,
      stableAnchors: { kind: 'dom-range', note: 'A live Range; valid only until the page re-renders. No persistent anchor is stored.' },
      popupPositioning: 'range-rect',
      layoutChangeHandling: 'observer',
      persistentAnnotation: { supported: false },
      offline: true,
      contentAccessRestrictions: 'Visible text of the top document and same-origin frames only; form fields, editable regions and cross-origin frames are not read.',
      contextConfidence: this.lastConfidence,
      requiredPermissions: ['activeTab'],
    };
  }

  // ─────────────────────────────── selection ───────────────────────────────

  selection(): SelectionResult {
    this.located = undefined;
    const frame = this.activeFrame();
    if (frame.crossOrigin) {
      this.lastFrameState = 'cross-origin-frame';
      return fail('cross-origin-frame', 'This selection is inside a frame GoLearn cannot read.');
    }
    this.lastFrameState = frame.frameEl ? 'same-origin-frame' : 'top';

    const doc = frame.doc;
    const active = doc.activeElement as HTMLElement | null;
    if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName)) {
      const f = active as HTMLInputElement;
      if (typeof f.selectionStart === 'number' && f.selectionStart !== f.selectionEnd) return fail('unreadable', 'GoLearn does not read text inside form fields.');
    }
    const sel = doc.getSelection?.();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return fail('no-selection', 'Select a word first.');
    const range = sel.getRangeAt(0).cloneRange();
    if (this.inEditable(range.commonAncestorContainer)) return fail('unreadable', 'GoLearn does not read text inside editable regions.');

    const loc = this.locate(range, frame);
    if ('ok' in loc) return loc;
    const words = wordCount(loc.surface);
    if (words > this.opts.maxSelectionWords || loc.surface.length > this.opts.maxSelectionChars) {
      return fail('too-long', `Select a word or a short phrase (up to ${this.opts.maxSelectionWords} words).`);
    }
    this.located = loc;
    this.lastConfidence = this.baseConfidence(loc);
    const out: ReaderSelection = {
      ok: true,
      surface: loc.surface.normalize('NFC'),
      range,
      direction: loc.direction,
      directionSource: this.directionSource(loc.block),
      snapped: loc.s !== loc.rawS || loc.e !== loc.rawE,
      frame: frame.frameEl ? 'same-origin-frame' : 'top',
      pageLanguage: this.pageLanguage(loc.block),
    };
    return out;
  }

  protected activeFrame(): Frame {
    let doc = this.doc;
    let frameEl: Element | null = null;
    for (let depth = 0; depth < 4; depth++) {
      const active = doc.activeElement;
      if (!active || !/^(IFRAME|FRAME)$/.test(active.tagName)) break;
      let inner: Document | null = null;
      try { inner = (active as HTMLIFrameElement).contentDocument; } catch { inner = null; }
      if (!inner) return { doc, frameEl: active, crossOrigin: true };
      doc = inner;
      frameEl = active;
    }
    return { doc, frameEl, crossOrigin: false };
  }

  private inEditable(node: Node): boolean {
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
    return !!el?.closest?.('[contenteditable]:not([contenteditable="false"]), input, textarea');
  }

  protected pageLanguage(block: Element): string | undefined {
    const withLang = block.closest('[lang]');
    const v = withLang?.getAttribute('lang') ?? this.doc.documentElement?.getAttribute('lang');
    return v ? v.trim() || undefined : undefined;
  }

  private directionSource(block: Element): ReaderSelection['directionSource'] {
    if (block.closest('[dir="rtl"], [dir="ltr"]')) return 'attribute';
    const styled = block.closest<HTMLElement>('[style*="direction"]');
    if (styled) return 'style';
    return this.located?.direction && this.located.direction !== 'unknown' ? 'text' : 'none';
  }

  // ─────────────────────────────── locate ───────────────────────────────

  private isBlock(el: Element): boolean {
    if (TEXT_BLOCKS.has(el.tagName) || OTHER_BLOCKS.has(el.tagName)) return true;
    // a span styled display:block is a paragraph in all but name (some reader sites build their paragraphs that way)
    if (INLINE.has(el.tagName)) {
      if (el.tagName !== 'SPAN') return false;
      try { const d = el.ownerDocument.defaultView?.getComputedStyle(el).display ?? ''; return d === 'block' || d === 'flex' || d === 'list-item' || d === 'flow-root'; } catch { return false; }
    }
    try {
      const view = el.ownerDocument.defaultView;
      const d = view?.getComputedStyle(el).display ?? 'inline';
      return !(d.startsWith('inline') || d === 'contents' || d === 'none' || d === '');
    } catch { return false; }
  }

  private blockOf(node: Node): Element | null {
    let el: Element | null = node.nodeType === 1 ? (node as Element) : node.parentElement;
    while (el && !this.isBlock(el)) el = el.parentElement;
    return el ?? node.ownerDocument?.documentElement ?? null;
  }

  protected isSkipped(el: Element): boolean {
    if (SKIPPED_TEXT.has(el.tagName.toUpperCase()) || el.hasAttribute(GOLEARN_HOST_ATTR)) return true;
    if ((el as HTMLElement).hidden) return true;
    const st = (el as HTMLElement).style;
    return !!st && (st.display === 'none' || st.visibility === 'hidden');
  }

  /** The text nodes the range selects (clipped to the range), document order. */
  private selectedSlices(range: Range): Array<{ node: Text; start: number; end: number }> {
    const out: Array<{ node: Text; start: number; end: number }> = [];
    const root = range.commonAncestorContainer;
    const push = (n: Text) => {
      const start = n === range.startContainer ? range.startOffset : 0;
      const end = n === range.endContainer ? range.endOffset : n.data.length;
      if (end > start && !this.insideSkipped(n)) out.push({ node: n, start, end });
    };
    if (root.nodeType === 3) { push(root as Text); return out; }
    const walker = (root.ownerDocument ?? this.doc).createTreeWalker(root, 4 /* SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (range.intersectsNode(n)) push(n as Text);
    return out;
  }

  private insideSkipped(node: Node): boolean {
    for (let el = node.parentElement; el; el = el.parentElement) if (this.isSkipped(el)) return true;
    return false;
  }

  /** Visible text of one block, whitespace collapsed, with an exact map from each text node offset to a flat offset. */
  private flatten(block: Element): { flat: string; maps: Map<Text, Int32Array> } {
    const chars: string[] = [];
    const maps = new Map<Text, Int32Array>();
    const doc = block.ownerDocument;
    const breakHere = () => {
      if (!chars.length) return;
      if (chars[chars.length - 1] === ' ') chars[chars.length - 1] = '\n';
      else if (chars[chars.length - 1] !== '\n') chars.push('\n');
    };
    const walker = doc.createTreeWalker(block, 1 | 4, {
      acceptNode: (n: Node) => {
        if (n.nodeType === 3) return 1;
        const el = n as Element;
        if (this.isSkipped(el)) return 2; // reject subtree
        if (el.tagName === 'BR') { breakHere(); return 3; }
        if (this.isBlock(el)) { breakHere(); return 2; } // a nested block is its own block: a boundary here
        return 3; // skip the element itself, visit its children
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType !== 3) continue;
      const t = n as Text;
      const data = t.data;
      const map = new Int32Array(data.length + 1);
      for (let i = 0; i < data.length; i++) {
        const c = data[i];
        if (/\s/u.test(c) || c === '​' || c === '﻿') {
          if (!chars.length) map[i] = 0;
          else if (chars[chars.length - 1] === ' ' || chars[chars.length - 1] === '\n') map[i] = chars.length - 1;
          else { map[i] = chars.length; chars.push(' '); }
        } else { map[i] = chars.length; chars.push(c); }
      }
      map[data.length] = chars.length;
      maps.set(t, map);
    }
    return { flat: chars.join(''), maps };
  }

  private locate(range: Range, frame: Frame): Located | SelectionFailure {
    const slices = this.selectedSlices(range);
    if (!slices.length) return fail('empty', 'Nothing to look up in that selection.');
    const first = slices[0];
    const last = slices[slices.length - 1];
    const b1 = this.blockOf(first.node);
    const b2 = this.blockOf(last.node);
    if (!b1 || !b2) return fail('unreadable', 'GoLearn could not read that selection.');
    if (b1 !== b2) return fail('multi-block', 'Select a word or phrase inside one paragraph.');
    const { flat, maps } = this.flatten(b1);
    const m1 = maps.get(first.node);
    const m2 = maps.get(last.node);
    if (!m1 || !m2) return fail('unreadable', 'GoLearn could not read that selection.');
    let rawS = m1[first.start];
    let rawE = m2[last.end - 1] + 1;
    while (rawS < rawE && /\s/u.test(flat[rawS])) rawS++;
    while (rawE > rawS && /\s/u.test(flat[rawE - 1])) rawE--;
    if (rawE <= rawS) return fail('empty', 'Nothing to look up in that selection.');
    const snapped = snapToGraphemes(flat, rawS, rawE);
    const surface = collapseWhitespace(flat.slice(snapped.start, snapped.end));
    if (!surface) return fail('empty', 'Nothing to look up in that selection.');
    const explicit = b1.closest('[dir]')?.getAttribute('dir')?.toLowerCase();
    let direction: TextDirection = explicit === 'rtl' || explicit === 'ltr' ? explicit : 'unknown';
    if (direction === 'unknown') {
      const cs = (() => { try { return b1.ownerDocument.defaultView?.getComputedStyle(b1).direction; } catch { return undefined; } })();
      if (cs === 'rtl') direction = 'rtl';
    }
    if (direction === 'unknown') {
      const byText = textDirection(surface);
      if (byText === 'rtl') direction = 'rtl';
      else if (byText === 'ltr') direction = 'ltr';
    }
    return {
      range, block: b1, blockKind: TEXT_BLOCKS.has(b1.tagName) ? 'text' : 'container', flat,
      s: snapped.start, e: snapped.end, rawS, rawE, surface, direction, frameDoc: frame.doc, frameEl: frame.frameEl,
    };
  }

  private baseConfidence(loc: Located): number {
    if (loc.blockKind === 'text') return loc.block.tagName === 'P' ? 0.9 : 0.8;
    return /^(TD|TH|PRE)$/.test(loc.block.tagName) ? 0.5 : 0.6;
  }

  // ─────────────────────────────── context ───────────────────────────────

  context(range: Range, options: ContextOptions = {}): ReaderContext {
    if (this.lastFrameState === 'cross-origin-frame') return { kind: 'none', confidence: 0, reason: 'cross-origin frame' };
    const cached = this.located;
    let loc: Located | undefined;
    if (cached && cached.range === range && this.isRangeLive(range) && cached.block.isConnected) {
      const again = this.locate(range, { doc: cached.frameDoc, frameEl: cached.frameEl, crossOrigin: false });
      loc = 'ok' in again ? undefined : again;
    }
    if (!loc) return this.fragmentFromCache(cached, 'the page changed before the context was read');

    let spans: Span[];
    try { spans = splitAtScriptTerminators(loc.flat, (options.segmenter ?? this.opts.segment ?? ((t: string) => this.fallbackSegment(t, options.languageId)))(loc.flat).filter((x) => x.end > x.start)); } catch { return this.fragmentAround(loc, 'sentence segmentation failed'); }
    if (!spans.length) return this.fragmentAround(loc, 'no sentence found');

    if (loc.flat.length > this.opts.maxBlockChars) return this.fragmentAround(loc, 'block too long: a window around the selection was used', 0.4);

    const iStart = indexOfSpan(spans, loc.s);
    const iEnd = indexOfSpan(spans, Math.max(loc.s, loc.e - 1));
    if (iStart < 0 || iEnd < 0) return this.fragmentAround(loc, 'selection not inside any sentence span');
    const a = spans[iStart].start;
    const b = spans[iEnd].end;
    const rawSentence = loc.flat.slice(a, b);
    let confidence = this.baseConfidence(loc);
    const reasons: string[] = [];
    if (iEnd > iStart) { confidence -= 0.15; reasons.push('the selection spans several sentences'); }
    if (rawSentence.length > 600) { confidence *= 0.8; reasons.push('very long sentence: a boundary may have been missed'); }
    const doubt = boundaryDoubt(loc.flat, spans[iStart], spans[iEnd]);
    if (doubt) { confidence -= 0.1; reasons.push(doubt); }
    if (unbalancedQuotes(rawSentence)) { confidence -= 0.1; reasons.push('unbalanced quotation mark'); }
    if (loc.blockKind === 'container') reasons.push(`text taken from a <${loc.block.tagName.toLowerCase()}>, not a paragraph`);
    confidence = Math.max(0.05, Math.min(0.95, Number(confidence.toFixed(2))));
    this.lastConfidence = confidence;

    const sentence = rawSentence.normalize('NFC');
    const out: ReaderContext = {
      kind: 'sentence',
      confidence,
      sentence,
      selStart: nfcOffset(rawSentence, loc.s - a),
      selEnd: nfcOffset(rawSentence, loc.e - a),
      reason: reasons.length ? reasons.join('; ') : undefined,
    };
    if (options.adjacent) {
      if (iStart > 0) out.before = loc.flat.slice(spans[iStart - 1].start, spans[iStart - 1].end).normalize('NFC');
      if (iEnd < spans.length - 1) out.after = loc.flat.slice(spans[iEnd + 1].start, spans[iEnd + 1].end).normalize('NFC');
    }
    return out;
  }

  private fragmentAround(loc: Located, reason: string, conf = 0.35): ReaderContext {
    const from = safeCutBefore(loc.flat, Math.max(0, loc.s - this.opts.windowChars));
    const to = safeCutAfter(loc.flat, Math.min(loc.flat.length, loc.e + this.opts.windowChars));
    const raw = loc.flat.slice(from, to);
    this.lastConfidence = conf;
    return { kind: 'fragment', confidence: conf, sentence: raw.normalize('NFC'), selStart: nfcOffset(raw, loc.s - from), selEnd: nfcOffset(raw, loc.e - from), reason };
  }

  /** The block is gone: only what was cached at selection time remains (a window; never a claimed sentence). */
  private fragmentFromCache(cached: Located | undefined, reason: string): ReaderContext {
    if (!cached) return { kind: 'none', confidence: 0, reason: 'no selection was recorded' };
    const out = this.fragmentAround(cached, reason, 0.25);
    return out;
  }

  // ─────────────────────────────── source, anchor, layout ───────────────────────────────

  sourceRef(): AnySourceReference | undefined {
    const title = (this.doc.title ?? '').trim().slice(0, 120);
    const loc = this.doc.defaultView?.location;
    return { kind: 'web', title: title || undefined, locator: loc?.pathname || undefined };
  }

  anchor(range: Range | undefined): PopupAnchor {
    const view = this.doc.defaultView;
    const viewport = { width: view?.innerWidth || 1024, height: view?.innerHeight || 768 };
    const rtl = this.located?.direction === 'rtl';
    let rect: Rect | undefined;
    if (range) {
      try {
        const rects = Array.from(range.getClientRects?.() ?? []).filter((r) => r.width > 0 || r.height > 0);
        const r = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0)) {
          rect = toRect(r);
          const fe = this.located?.frameEl;
          if (fe) { const f = fe.getBoundingClientRect(); rect = shift(rect, f.left, f.top); }
        }
      } catch { /* a detached range has no rect */ }
    }
    if (rect) return { rect, viewport, rtl, source: 'range' };
    return { rect: { top: 16, left: viewport.width - 16, right: viewport.width - 16, bottom: 16, width: 0, height: 0 }, viewport, rtl, source: 'fallback' };
  }

  isRangeLive(range: Range): boolean {
    try { return range.startContainer.isConnected && range.endContainer.isConnected && !range.collapsed; } catch { return false; }
  }

  onLayoutChange(cb: (change: LayoutChange) => void): () => void {
    const view = this.doc.defaultView;
    if (!view) return () => {};
    let pending: LayoutChange['reason'] | undefined;
    let timer: number | undefined;
    const flush = () => { timer = undefined; const r = pending; pending = undefined; if (r) cb({ reason: r }); };
    const schedule = (reason: LayoutChange['reason']) => {
      pending = pending === 'mutation' ? 'mutation' : reason;
      if (timer !== undefined) return;
      timer = typeof view.requestAnimationFrame === 'function' ? view.requestAnimationFrame(flush) : (setTimeout(flush, 16) as unknown as number);
    };
    const onResize = () => schedule('resize');
    const onScroll = () => schedule('scroll');
    view.addEventListener('resize', onResize);
    view.addEventListener('scroll', onScroll, { capture: true, passive: true });
    const isOwn = (n: Node | null): boolean => !!n && ((n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest?.(hostAttrSelector) != null);
    let mo: MutationObserver | undefined;
    if (typeof view.MutationObserver === 'function') {
      mo = new view.MutationObserver((records) => {
        for (const r of records) {
          if (isOwn(r.target)) continue;
          if (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every((n) => isOwn(n))) continue;
          schedule('mutation');
          return;
        }
      });
      mo.observe(this.doc, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'dir', 'lang'] });
    }
    let ro: ResizeObserver | undefined;
    const RO = (view as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (typeof RO === 'function' && this.doc.documentElement) {
      ro = new RO(() => schedule('resize'));
      ro.observe(this.doc.documentElement);
    }
    const off = () => {
      // a window being torn down (page unload, a test environment closing) may no longer be an EventTarget
      try {
        if (typeof view.removeEventListener === 'function') {
          view.removeEventListener('resize', onResize);
          view.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
        }
      } catch { /* nothing left to unsubscribe from */ }
      try { mo?.disconnect(); } catch { /* already gone */ }
      try { ro?.disconnect(); } catch { /* already gone */ }
      if (timer !== undefined) { try { view.cancelAnimationFrame?.(timer); } catch { /* */ } clearTimeout(timer); timer = undefined; }
      this.cleanups.delete(off);
    };
    this.cleanups.add(off);
    return off;
  }

  dispose(): void {
    for (const off of [...this.cleanups]) off();
    this.cleanups.clear();
    this.located = undefined;
  }

  /** The page's declared language near the selection, as metadata evidence for the language resolver (never page text). */
  languageEvidence(): AdapterLanguageEvidence {
    const doc = this.located?.frameDoc ?? this.doc;
    const el = this.located?.block ?? null;
    return { documentLanguage: documentLanguageOf(doc, el) };
  }

  /** Intl.Segmenter for the language when it is a valid locale tag, else for the browser default; one per language. */
  private fallbackSegment(text: string, languageId?: string): Span[] {
    const key = languageId ?? '';
    let seg = this.fallbackSegmenters.get(key);
    if (!seg) {
      try { seg = new Intl.Segmenter(languageId || undefined, { granularity: 'sentence' }); } catch { seg = new Intl.Segmenter(undefined, { granularity: 'sentence' }); }
      this.fallbackSegmenters.set(key, seg);
    }
    const out: Span[] = [];
    for (const s of seg.segment(text)) {
      const raw = s.segment;
      const lead = raw.length - raw.trimStart().length;
      const t = raw.trim();
      if (t) out.push({ start: s.index + lead, end: s.index + lead + t.length, text: t });
    }
    return out;
  }
}

// ───────────────────────────── helpers ─────────────────────────────

function fail(reason: SelectionFailure['reason'], message: string): SelectionFailure { return { ok: false, reason, message }; }

/** Sentence terminators of scripts a Latin-script pack's segmenter does not know (danda, Arabic question mark, CJK, Ethiopic). */
const SCRIPT_TERMINATOR = /[।॥؟۔。！？።](?=\s|$)/gu;

/** The pack's spans, cut again after any such terminator followed by a space or the end of the span. */
function splitAtScriptTerminators(text: string, spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const sp of spans) {
    const piece = text.slice(sp.start, sp.end);
    let from = 0;
    for (const m of piece.matchAll(SCRIPT_TERMINATOR)) {
      const end = (m.index ?? 0) + m[0].length;
      const part = piece.slice(from, end);
      const lead = part.length - part.trimStart().length;
      if (part.trim()) out.push({ start: sp.start + from + lead, end: sp.start + end, text: part.trim() });
      from = end;
    }
    const rest = piece.slice(from);
    if (rest.trim()) { const lead = rest.length - rest.trimStart().length; out.push({ start: sp.start + from + lead, end: sp.end, text: rest.trim() }); }
  }
  return out;
}

function indexOfSpan(spans: Span[], pos: number): number {
  for (let i = 0; i < spans.length; i++) if (pos >= spans[i].start && pos < spans[i].end) return i;
  // a position in the gap after a span belongs to the preceding span
  let best = -1;
  for (let i = 0; i < spans.length; i++) if (spans[i].start <= pos) best = i;
  return best;
}

const ABBREV_TAIL = /(?:^|[\s(«"“„'])\p{L}{1,3}\.$/u;

/** A reason to doubt a sentence boundary: an abbreviation-looking tail before it, an ellipsis, a boundary inside a quote. */
function boundaryDoubt(flat: string, first: Span, last: Span): string | undefined {
  const before = flat.slice(0, first.start).trimEnd();
  const afterText = flat.slice(0, last.end);
  if (first.start > 0 && (ABBREV_TAIL.test(before) || /(?:…|\.\.\.)$/u.test(before))) return 'the sentence starts after an abbreviation or ellipsis: the boundary is uncertain';
  if (last.end < flat.length && (ABBREV_TAIL.test(afterText) || /(?:…|\.\.\.)$/u.test(afterText))) return 'the sentence ends at an abbreviation or ellipsis: the boundary is uncertain';
  return undefined;
}

function unbalancedQuotes(s: string): boolean {
  const n = (c: string): number => s.split(c).length - 1;
  if (n('"') % 2 === 1) return true;
  if (n('«') !== n('»') || n('‹') !== n('›')) return true;
  return s.includes('„') ? n('„') !== n('“') + n('”') : n('“') !== n('”');
}

const toRect = (r: { top: number; left: number; right: number; bottom: number; width: number; height: number }): Rect => ({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
const shift = (r: Rect, dx: number, dy: number): Rect => ({ top: r.top + dy, bottom: r.bottom + dy, left: r.left + dx, right: r.right + dx, width: r.width, height: r.height });
