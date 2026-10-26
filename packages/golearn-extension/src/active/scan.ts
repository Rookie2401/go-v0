/**
 * GoLearn Active: the page scan. It reads the visible text of the readable blocks (the same rules as the lookup
 * adapters: no form fields, no editable regions, no reader chrome, no hidden text, never the card itself), tokenises
 * each text node with the page's resolved language pack, and names each word's unit ids the way the parser does
 * (`form:<lang>:<normalised>` always; `lemma:<lang>:<lemma>:<POS>` when the analyser's best reading is creditable).
 *
 * Nothing is retained beyond this tab: tokens live in a WeakMap keyed by the text node and are dropped with it;
 * no text is sent anywhere (the ids go to the background for the learner model; ids are not page text, they are
 * normalised dictionary forms of single words). A scan records no event.
 */
import type { LanguageAdapter, RawToken } from '../../../../src/core';
import { GOLEARN_HOST_ATTR } from '../contract/readerAdapter';
import { LEMMA_MIN_CONFIDENCE } from '../parser';

export interface ScanToken {
  node: Text;
  start: number;
  end: number;
  surface: string;
  /** The unit ids the learner model is asked about for this word: the form id, then the creditable lemma id if any. */
  ids: string[];
  /**
   * True when the language's analyser read the word as one of its own (a creditable lemma: in its lexicon, above the parser's
   * confidence floor). False for a word the active language does not have: another language's word on the same page, a name,
   * a number-like run. Active leaves such a word alone, neither underlined nor recorded (2026-10-25).
   */
  known: boolean;
}

export interface ScannerOptions {
  doc: Document;
  /** The analyser of a language, when it is loaded (parser registry). */
  adapterOf(languageId: string): LanguageAdapter | undefined;
  /** The reading area, when the reader's registry entry limits it (site `containers`); empty = the whole document body. */
  containers?: string[];
  /** Reader chrome, menus, the site's own popups: never scanned (site `ignore`). */
  ignore?: string[];
  /** 'visible' scans only text within the viewport plus one screen of margin; 'all' scans the whole document (tests, measurement). */
  viewport?: 'visible' | 'all';
}

export interface Scanner {
  /** The readable text nodes of a document (the top document or a same-origin frame), in document order, within the viewport by default. */
  textNodes(root: Document): Text[];
  /** The word tokens of these nodes in a language, with their unit ids; cached per node while its text is unchanged. */
  tokensIn(nodes: Text[], languageId: string): ScanToken[];
  /** The word token at an offset of a text node, if the node was (or can be) tokenised in the language. */
  tokenAt(node: Text, offset: number, languageId: string): ScanToken | undefined;
  /** Forget the cached tokens (a language change). */
  reset(): void;
}

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'BUTTON', 'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'TITLE']);
const HAS_LETTER = /\p{L}/u;
const MARGIN_SCREENS = 1;

export function createScanner(opts: ScannerOptions): Scanner {
  // page chrome is never the text the learner reads: navigation, banners, footers, menus, toolbars and dialogs are left unmarked (a site entry may add more)
  const ignoreSel = [
    ...(opts.ignore ?? []), `[${GOLEARN_HOST_ATTR}]`, '[contenteditable]:not([contenteditable="false"])', '[aria-hidden="true"]',
    'nav', 'header', 'footer', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="menu"]', '[role="menubar"]', '[role="toolbar"]', '[role="dialog"]', '[role="tooltip"]',
  ].join(', ');
  const containerSel = (opts.containers ?? []).join(', ');
  const cache = new WeakMap<Text, { data: string; languageId: string; tokens: ScanToken[] }>();

  const skippedElement = (el: Element): boolean => {
    if (SKIPPED.has(el.tagName.toUpperCase())) return true;
    if ((el as HTMLElement).hidden) return true;
    const st = (el as HTMLElement).style;
    if (st && (st.display === 'none' || st.visibility === 'hidden')) return true;
    try { if (el.matches(ignoreSel)) return true; } catch { /* a selector the engine rejects: ignored */ }
    return false;
  };

  function inViewport(node: Text, view: Window | null): boolean {
    if (opts.viewport === 'all' || !view) return true;
    const el = node.parentElement;
    if (!el) return false;
    let rect: DOMRect | undefined;
    try { rect = el.getBoundingClientRect(); } catch { return true; }
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) return true; // no layout information (jsdom, display:contents): read it
    const h = view.innerHeight || 0;
    if (h <= 0) return true; // no viewport yet (a tab not shown so far): read what is there; the next resize or visibility change scans again
    const margin = h * MARGIN_SCREENS;
    return rect.bottom >= -margin && rect.top <= h + margin;
  }

  function textNodes(root: Document): Text[] {
    const out: Text[] = [];
    const body = root.body;
    if (!body) return out;
    const roots: Element[] = containerSel ? [...body.querySelectorAll(containerSel)] : [body];
    const view = root.defaultView;
    for (const r of roots) {
      const walker = root.createTreeWalker(r, 1 | 4, {
        acceptNode: (n) => {
          if (n.nodeType === 1) return skippedElement(n as Element) ? 2 /* REJECT: the subtree too */ : 3 /* SKIP: descend */;
          const t = n as Text;
          return HAS_LETTER.test(t.data) && inViewport(t, view) ? 1 : 3;
        },
      });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
    }
    return out;
  }

  function tokenise(node: Text, languageId: string): ScanToken[] {
    const hit = cache.get(node);
    if (hit && hit.languageId === languageId && hit.data === node.data) return hit.tokens;
    const adapter = opts.adapterOf(languageId);
    if (!adapter) return [];
    const raw = node.data;
    const nfc = raw.normalize('NFC');
    // offsets must index the node's own data: a text that is not NFC already is mapped back by scanning (rare; most pages are NFC)
    const same = nfc === raw;
    let tokens: RawToken[] = [];
    try { tokens = adapter.tokenize(nfc); } catch { tokens = []; }
    let analysed: ReturnType<LanguageAdapter['analyze']> = [];
    try { analysed = adapter.analyze(tokens); } catch { analysed = []; }
    const out: ScanToken[] = [];
    tokens.forEach((t, i) => {
      if (!t.isWord || !HAS_LETTER.test(t.surface)) return;
      const start = same ? t.start : rawOffset(raw, t.start);
      const end = same ? t.end : rawOffset(raw, t.end);
      if (end <= start) return;
      const ids = [`form:${languageId}:${adapter.normalize(t.surface)}`];
      const best = analysed[i]?.candidates?.reduce((m, c) => (c.confidence > m.confidence ? c : m), analysed[i].candidates[0]);
      const known = !!best?.lemma && !best.unconfirmed && best.confidence >= LEMMA_MIN_CONFIDENCE;
      if (known) ids.push(`lemma:${languageId}:${best!.lemma}${best!.pos ? ':' + best!.pos : ''}`);
      out.push({ node, start, end, surface: t.surface, ids, known });
    });
    cache.set(node, { data: raw, languageId, tokens: out });
    return out;
  }

  return {
    textNodes,
    tokensIn(nodes, languageId) {
      const out: ScanToken[] = [];
      for (const n of nodes) out.push(...tokenise(n, languageId));
      return out;
    },
    tokenAt(node, offset, languageId) {
      return tokenise(node, languageId).find((t) => offset >= t.start && offset <= t.end);
    },
    reset() { /* the WeakMap cannot be cleared; a new scanner is made per language instead */ },
  };
}

/** The offset in the raw (non-NFC) text that corresponds to an NFC offset: the raw prefix whose NFC form has that length. */
function rawOffset(raw: string, nfcOffset: number): number {
  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (raw.slice(0, mid).normalize('NFC').length < nfcOffset) lo = mid + 1; else hi = mid;
  }
  return lo;
}
