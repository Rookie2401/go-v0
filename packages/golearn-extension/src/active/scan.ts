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
import type { AnalyzeOptions, LanguageAdapter, RawToken } from '../../../../src/core';
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
  /**
   * True when the word was not in the analyser's word list but the language's dictionary (its forms index) has it: `known` was
   * then set and the lemma id added after tokenising (`applyConfirmations`), never by the analyser (2026-10-27).
   */
  confirmed?: boolean;
}

/** What the dictionary said about a normalised form id (`form:<lang>:<normalised>`): the lemma id to credit it with, or `null` = the dictionary does not have it. */
export type Confirmations = ReadonlyMap<string, string | null>;

const FORM_LETTERS = /^[\p{L}\p{M}]+$/u;
const HAS_LETTER = /\p{L}/u;

/** One word of a text, named the way the Repository names it. Offsets index the text as given (not its NFC form). */
export interface TextWord {
  start: number;
  end: number;
  surface: string;
  /** The form id, then the creditable lemma id of the analyser's best reading, if any (what GoLearn Active asks the learner model about). */
  ids: string[];
  /** The analyser read the word as one of its own (see `ScanToken.known`). */
  known: boolean;
  /**
   * The lemma id of EVERY creditable reading (in the lexicon, at or above the parser's confidence floor), the best first, once each. One entry
   * for most words; more when the spelling is two different words (Spanish "como": the conjunction, and a form of comer). Reading Analysis
   * counts such a word as Known only when that holds whichever reading is meant; GoLearn Active reads `ids` and is not changed by this.
   */
  readings: string[];
}

/**
 * The words of a text in a language, with their unit ids: `form:<lang>:<normalised>` always; `lemma:<lang>:<lemma>:<POS>` when the analyser's
 * best reading is creditable. THE one place that names a page word (the scanner below and Reading Analysis both call it), so the two cannot
 * disagree about which unit a word is. Pure: no document, no cache. `analyze` is passed to the analyser as it stands (a text variety breaks
 * the ties the text leaves open; GoLearn Active passes none).
 */
export function wordsOfText(raw: string, adapter: LanguageAdapter, languageId: string, analyze?: AnalyzeOptions): TextWord[] {
  const nfc = raw.normalize('NFC');
  // offsets must index the text's own characters: a text that is not NFC already is mapped back by scanning (rare; most pages are NFC)
  const same = nfc === raw;
  let tokens: RawToken[] = [];
  try { tokens = adapter.tokenize(nfc); } catch { tokens = []; }
  let analysed: ReturnType<LanguageAdapter['analyze']> = [];
  try { analysed = analyze ? adapter.analyze(tokens, analyze) : adapter.analyze(tokens); } catch { analysed = []; }
  const out: TextWord[] = [];
  tokens.forEach((t, i) => {
    if (!t.isWord || !HAS_LETTER.test(t.surface)) return;
    const start = same ? t.start : rawOffset(raw, t.start);
    const end = same ? t.end : rawOffset(raw, t.end);
    if (end <= start) return;
    const ids = [`form:${languageId}:${adapter.normalize(t.surface)}`];
    const candidates = analysed[i]?.candidates ?? [];
    // the first of the highest confidence, as the scanner always chose it
    const best = candidates.length ? candidates.reduce((m, c) => (c.confidence > m.confidence ? c : m), candidates[0]) : undefined;
    const creditable = (c: (typeof candidates)[number] | undefined): boolean => !!c?.lemma && !c.unconfirmed && c.confidence >= LEMMA_MIN_CONFIDENCE;
    const lemmaId = (c: (typeof candidates)[number]): string => `lemma:${languageId}:${c.lemma}${c.pos ? ':' + c.pos : ''}`;
    const known = creditable(best);
    const readings: string[] = [];
    // a reading the language's review gate holds back (notes.reviewGate) is still KNOWN and still a reading (Reading Analysis counts it), but GoLearn Active credits its written form only
    if (known) { if (best!.notes?.reviewGate !== 'yes') ids.push(lemmaId(best!)); readings.push(lemmaId(best!)); }
    for (const c of [...candidates].sort((a, b) => b.confidence - a.confidence)) {
      if (!creditable(c)) continue;
      const id = lemmaId(c);
      if (!readings.includes(id)) readings.push(id);
    }
    out.push({ start, end, surface: t.surface, ids, known, readings });
  });
  return out;
}

/**
 * The form ids of the words the analyser did not confirm that are worth asking the dictionary about: words of letters only, once each,
 * and not the ones already answered. A name, a foreign word or a typo is asked too (the dictionary decides), but a number-like run or a
 * run with punctuation never is.
 */
export function formsToConfirm(tokens: readonly ScanToken[], languageId: string, answered: Confirmations): string[] {
  const prefix = `form:${languageId}:`;
  const out = new Set<string>();
  for (const t of tokens) {
    if (t.known) continue;
    const id = t.ids[0];
    if (!id || !id.startsWith(prefix) || answered.has(id)) continue;
    if (FORM_LETTERS.test(id.slice(prefix.length))) out.add(id);
  }
  return [...out];
}

/**
 * Apply the dictionary's answers to the tokens the analyser did not confirm: a hit becomes `known` and gets its lemma id, the same id
 * shape the scanner gives an analysed word. The tokens are the scanner's per-node CACHE entries, so a hit is written onto the cached token
 * itself: it stays confirmed for as long as the node's text is unchanged (an edited node is tokenised afresh and confirmed again from the
 * answers, with no new request). `known` only ever flips from false to true here, and the answers never change within a tab, so the
 * cache is not frozen in a wrong state. Returns the tokens it confirmed and the ones the dictionary was asked about and did not have.
 */
export function applyConfirmations(tokens: readonly ScanToken[], answers: Confirmations): { confirmed: number; unconfirmed: number } {
  let confirmed = 0;
  let unconfirmed = 0;
  for (const t of tokens) {
    if (t.confirmed) { confirmed++; continue; }
    if (t.known) continue;
    const answer = answers.get(t.ids[0]);
    if (answer === undefined) continue; // never asked (or not answered yet)
    if (answer === null) { unconfirmed++; continue; }
    t.known = true;
    t.confirmed = true;
    if (!t.ids.includes(answer)) t.ids.push(answer);
    confirmed++;
  }
  return { confirmed, unconfirmed };
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
  /**
   * Controls whose own text IS the page's text (a reader that renders each word as a button): an element of SKIPPED that matches one of
   * these is descended into instead of left out. Empty by default; Reading Analysis passes its list (READING_TEXT_CONTROLS), GoLearn Active none.
   */
  textControls?: string[];
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

/** Elements whose text is never read (form fields, scripts, media): shared with Reading Analysis' extraction. */
export const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'BUTTON', 'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'TITLE']);
/** Page chrome is never the text the learner reads (a site entry may add more): shared with Reading Analysis' extraction. */
export const CHROME_SELECTORS: readonly string[] = ['nav', 'header', 'footer', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="menu"]', '[role="menubar"]', '[role="toolbar"]', '[role="dialog"]', '[role="tooltip"]'];
const MARGIN_SCREENS = 1;

export function createScanner(opts: ScannerOptions): Scanner {
  // page chrome is never the text the learner reads: navigation, banners, footers, menus, toolbars and dialogs are left unmarked (a site entry may add more)
  const ignoreSel = [
    ...(opts.ignore ?? []), `[${GOLEARN_HOST_ATTR}]`, '[contenteditable]:not([contenteditable="false"])', '[aria-hidden="true"]',
    ...CHROME_SELECTORS,
  ].join(', ');
  const containerSel = (opts.containers ?? []).join(', ');
  const textControlSel = (opts.textControls ?? []).join(', ');
  const isTextControl = (el: Element): boolean => { if (!textControlSel) return false; try { return el.matches(textControlSel); } catch { return false; } };
  // per node and per language: a page read in several languages tokenises a mixed-script node in each of them (2026-11-09)
  const cache = new WeakMap<Text, Map<string, { data: string; tokens: ScanToken[] }>>();

  const skippedElement = (el: Element): boolean => {
    if (SKIPPED.has(el.tagName.toUpperCase()) && !isTextControl(el)) return true;
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
    const hit = cache.get(node)?.get(languageId);
    if (hit && hit.data === node.data) return hit.tokens;
    const adapter = opts.adapterOf(languageId);
    if (!adapter) return [];
    const raw = node.data;
    const out: ScanToken[] = wordsOfText(raw, adapter, languageId).map((w) => ({ node, start: w.start, end: w.end, surface: w.surface, ids: w.ids, known: w.known }));
    (cache.get(node) ?? cache.set(node, new Map()).get(node)!).set(languageId, { data: raw, tokens: out });
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
