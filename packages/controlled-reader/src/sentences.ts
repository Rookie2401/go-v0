/**
 * Sentence reconstruction from a DOM selection — the part of the reader adapter that is a production candidate.
 *
 * Input: a live DOM Range inside one chapter document (an epub.js iframe document, or any document). Output: the
 * sentence that contains the selection, rebuilt from the enclosing block's text nodes ACROSS inline elements
 * (<em>, <span>, <a>, <b> …), plus the neighbouring sentences. It reads only the DOM that is already displayed; it
 * never fetches, scrolls or loads another page.
 *
 * What it can and cannot do (also recorded in `SentenceContext.limits`):
 *  - sentences are rebuilt inside ONE block element (p, li, h1…, blockquote, td, div …). Nested blocks are boundaries.
 *    A sentence that a book breaks over two <p> elements is returned as two fragments, never joined.
 *  - page / column boundaries do not matter: a paginated EPUB view is one chapter document laid out in columns, so a
 *    sentence that runs over two pages is whole in the DOM.
 *  - the chapter document is the limit: the first sentence of a chapter has no `before`, the last has no `after`
 *    from the next spine item (that document is not loaded, and is not read).
 *  - a selection that spans two sentences is `kind: 'fragment'` (never a guessed sentence); one that spans blocks
 *    is a fragment too.
 *  - segmentation is rule-based (terminators, closing quotes, lower-case continuation, a short abbreviation list);
 *    it is right for ordinary prose, and wrong for some abbreviations it does not know. A language pack's segmenter
 *    can be passed in (`SentenceOptions.segment`).
 */

export interface Span { start: number; end: number }

export interface SentenceContext {
  kind: 'sentence' | 'fragment' | 'none';
  /**
   * The text of the returned unit, NFC: the sentence containing the selection ('sentence'), or — for a 'fragment' —
   * the whole sentences a multi-sentence selection touches (or the selected text itself when it spans blocks).
   */
  sentence?: string;
  /** The selection inside `sentence` (NFC offsets). */
  selStart?: number;
  selEnd?: number;
  /** The preceding / following sentence in the same chapter document. */
  before?: string;
  after?: string;
  /** 0..1: how far `sentence` can be trusted as the real sentence. */
  confidence: number;
  /** Why the result is a fragment or empty. */
  reason?: 'selection-spans-sentences' | 'selection-spans-blocks' | 'empty-selection' | 'selection-outside-text';
  /** What this reconstruction could not see (always filled; the consumer may show or ignore them). */
  limits: string[];
}

export interface SentenceOptions {
  /** Extra lower-case abbreviations (without the final full stop) that do not end a sentence. */
  abbreviations?: Iterable<string>;
  /** The language pack's sentence segmenter; spans are offsets into the text given. Default: `splitSentences`. */
  segment?: (text: string) => Span[];
}

// ───────────────────────────── text hygiene ─────────────────────────────

const INVISIBLE = /[­؜​-‏‪-‮⁦-⁩﻿]/g; // soft hyphen, bidi marks, ZW space, BOM

/** NFC, invisible formatting marks removed, whitespace collapsed, trimmed. */
export function cleanText(s: string): string {
  return s.replace(INVISIBLE, '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Like cleanText but keeps leading/trailing space, so that prefix lengths stay exact. */
const tidy = (s: string): string => s.replace(INVISIBLE, '').normalize('NFC').replace(/\s+/g, ' ');

/** The text of a selection range as the lookup surface (NFC). */
export function selectionSurface(range: Range): string {
  return cleanText(range.toString());
}

// ───────────────────────────── blocks ─────────────────────────────

const BLOCKS = new Set('address article aside blockquote body caption dd details div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr html li main nav ol p pre section table tbody td tfoot th thead tr ul'.split(' '));
const SKIPPED = new Set(['script', 'style', 'rt', 'rp', 'noscript', 'template', 'head']);
const HEADING = /^h[1-6]$/;
const LEAF_SELECTOR = 'p, li, dd, dt, blockquote, div, td, th, figcaption, pre, h1, h2, h3, h4, h5, h6, caption';

const tag = (e: Element): string => e.localName.toLowerCase();

/** Nearest block-level ancestor-or-self of a node (the document element when there is none). */
export function enclosingBlock(node: Node): Element {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === 1 && BLOCKS.has(tag(n as Element))) return n as Element;
    n = n.parentNode;
  }
  return node.ownerDocument!.documentElement;
}

interface Entry { node: Node; start: number; end: number }
export interface Flat { text: string; entries: Entry[] }

/**
 * The block's own inline text, in document order. Text nodes contribute their data; <br> and nested blocks contribute
 * a line break (a sentence boundary); scripts, styles and ruby annotations are skipped.
 */
export function flattenBlock(block: Element): Flat {
  const entries: Entry[] = [];
  let text = '';
  const push = (node: Node, s: string): void => { entries.push({ node, start: text.length, end: text.length + s.length }); text += s; };
  const walk = (parent: Node): void => {
    for (let c = parent.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) push(c, (c as Text).data);
      else if (c.nodeType === 1) {
        const name = tag(c as Element);
        if (SKIPPED.has(name)) continue;
        if (name === 'br') push(c, '\n');
        else if (BLOCKS.has(name)) push(c, '\n');
        else walk(c);
      }
    }
  };
  walk(block);
  return { text, entries };
}

/** Character offset in the flattened block text of a DOM boundary point (container, offset). */
export function boundaryOffset(flat: Flat, container: Node, offset: number): number | undefined {
  if (container.nodeType === 3 && !flat.entries.some((e) => e.node === container)) return undefined; // text in a skipped subtree
  const doc = container.ownerDocument ?? (container as Document);
  const b = doc.createRange();
  b.setStart(container, offset);
  b.collapse(true);
  let acc = 0;
  for (const e of flat.entries) {
    if (e.node === container && container.nodeType === 3) return e.start + Math.min(offset, e.end - e.start);
    if (e.node.nodeType === 3) {
      if (b.comparePoint(e.node, (e.node as Text).length) <= 0) acc = e.end; // the whole text node is before the point
      else return acc;
    } else {
      const parent = e.node.parentNode!;
      const after = Array.prototype.indexOf.call(parent.childNodes, e.node) + 1;
      if (b.comparePoint(parent, after) <= 0) acc = e.end; else return acc;
    }
  }
  return acc;
}

// ───────────────────────────── sentence segmentation ─────────────────────────────

const TERMINATORS = new Set('.!?…؟।॥。！？۔׃'.split(''));
const ALWAYS_BOUNDARY = new Set('!?؟।॥。！？۔׃'.split(''));
const CLOSERS = new Set('"\'”’»)]›」』'.split(''));
export const DEFAULT_ABBREVIATIONS: readonly string[] = ['dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'p.sh', 'etj', 'z', 'zj', 'nr', 'fig', 'e.g', 'i.e', 'cf', 'vv', 'ff'];

/** Sentence spans (trimmed) of a flattened block text. Line breaks always end a sentence. */
export function splitSentences(text: string, opts: { abbreviations?: Iterable<string> } = {}): Span[] {
  const abbr = new Set([...DEFAULT_ABBREVIATIONS, ...(opts.abbreviations ?? [])].map((a) => a.toLowerCase()));
  const spans: Span[] = [];
  let start = 0;
  const close = (end: number): void => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) spans.push({ start: s, end: e });
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') { close(i); i++; start = i; continue; }
    if (!TERMINATORS.has(ch)) { i++; continue; }
    let j = i;
    while (j < text.length && TERMINATORS.has(text[j])) j++;
    const runStart = i;
    const run = text.slice(runStart, j);
    while (j < text.length && CLOSERS.has(text[j])) j++;
    const next = text[j];
    const atEnd = j >= text.length;
    const spaceNext = atEnd || /\s/.test(next);
    const cjk = /[。！？]/.test(run);
    let boundary = spaceNext || cjk;
    if (boundary && !atEnd && !cjk && ![...run].some((c) => ALWAYS_BOUNDARY.has(c))) {
      // a full stop / ellipsis: not a boundary after an abbreviation or an initial, or before a lower-case word
      const word = /([\p{L}][\p{L}.]*)$/u.exec(text.slice(0, runStart))?.[1] ?? '';
      const after = /^\s*(\S)/.exec(text.slice(j))?.[1];
      if (word && (abbr.has(word.toLowerCase()) || (word.length === 1 && word === word.toUpperCase() && word !== word.toLowerCase()))) boundary = false;
      else if (after && /\p{Ll}/u.test(after)) boundary = false;
    } else if (boundary && !atEnd && /^[!?]+$/.test(run)) {
      // "Eja!" tha ai.  /  — Ku është libri? — pyet Ana.: a speech tag that starts in lower case continues the sentence
      const after = /^\s*(?:[—–]\s*)?(\S)/u.exec(text.slice(j))?.[1];
      if (after && /\p{Ll}/u.test(after)) boundary = false;
    }
    if (boundary) { close(j); start = j; }
    i = j;
  }
  close(text.length);
  return spans;
}

const segment = (text: string, opts: SentenceOptions): Span[] => (opts.segment ? opts.segment(text) : splitSentences(text, opts)).filter((s) => s.end > s.start);

// ───────────────────────────── locating the selection ─────────────────────────────

let graphemeSegmenter: Intl.Segmenter | undefined;

/** Move [start,end) outward to whole grapheme clusters (a base letter keeps its vowel signs, marks, virama). */
export function snapToGraphemes(text: string, start: number, end: number): { start: number; end: number; moved: boolean } {
  graphemeSegmenter ??= new Intl.Segmenter('und', { granularity: 'grapheme' });
  let s = start;
  let e = end;
  let sFound = false;
  let eFound = false;
  for (const g of graphemeSegmenter.segment(text)) {
    const gs = g.index;
    const ge = g.index + g.segment.length;
    if (!sFound && start >= gs && start < ge) { s = gs; sFound = true; }
    if (!eFound && end > gs && end <= ge) { e = ge; eFound = true; }
    if (sFound && eFound) break;
  }
  return { start: s, end: e, moved: s !== start || e !== end };
}

export interface Located {
  block: Element;
  /** The block's flattened inline text. In memory for one lookup; never stored. */
  text: string;
  /** Selection [s,e) in `text`: trimmed of white space, snapped to whole grapheme clusters. */
  s: number;
  e: number;
  /** Before snapping. */
  rawS: number;
  rawE: number;
}

export type LocateFailure = { failure: 'multi-block' | 'empty' | 'outside-text' };

/** Where a DOM selection lies in its block's text. A selection across two blocks is a failure ('multi-block'). */
export function locate(range: Range): Located | LocateFailure {
  const startBlock = enclosingBlock(range.startContainer);
  const endBlock = enclosingBlock(range.endContainer);
  if (startBlock !== endBlock) return { failure: 'multi-block' };
  const flat = flattenBlock(startBlock);
  let rawS = boundaryOffset(flat, range.startContainer, range.startOffset);
  let rawE = boundaryOffset(flat, range.endContainer, range.endOffset);
  if (rawS === undefined || rawE === undefined) return { failure: 'outside-text' };
  // a double-click on Windows selects the trailing space: shrink the selection to its visible text
  while (rawS < rawE && /\s/.test(flat.text[rawS])) rawS++;
  while (rawE > rawS && /\s/.test(flat.text[rawE - 1])) rawE--;
  if (rawS >= rawE) return { failure: 'empty' };
  const snapped = snapToGraphemes(flat.text, rawS, rawE);
  return { block: startBlock, text: flat.text, s: snapped.start, e: snapped.end, rawS, rawE };
}

// ───────────────────────────── the context ─────────────────────────────

const LIMITS_BASE = 'Only the displayed chapter document is read: sentences in other spine items are never loaded.';

function ownSentences(block: Element, opts: SentenceOptions): string[] {
  const flat = flattenBlock(block);
  return segment(flat.text, opts).map((s) => cleanText(flat.text.slice(s.start, s.end))).filter(Boolean);
}

function neighbour(block: Element, dir: -1 | 1, opts: SentenceOptions): string | undefined {
  if (HEADING.test(tag(block))) return undefined;
  const all = Array.from(block.ownerDocument!.querySelectorAll(LEAF_SELECTOR));
  let at = all.indexOf(block) + dir;
  for (; at >= 0 && at < all.length; at += dir) {
    const b = all[at];
    if (HEADING.test(tag(b))) continue;
    const s = ownSentences(b, opts);
    if (s.length) return dir < 0 ? s[s.length - 1] : s[0];
  }
  return undefined;
}

/** Base trust in a sentence taken from this kind of block (paragraph-like blocks are the reliable ones). */
export function blockConfidence(block: Element): number {
  const t = tag(block);
  if (t === 'p') return 0.9;
  if (/^(li|dd|dt|blockquote|figcaption|caption)$/.test(t)) return 0.85;
  if (HEADING.test(t)) return 0.8;
  return /^(td|th|pre)$/.test(t) ? 0.5 : 0.6;
}

/**
 * The sentence (or fragment) around a DOM selection, with neighbours. See the file header for the limits.
 * `sentence` is the text of the returned unit (the sentence, or the whole sentences a multi-sentence selection
 * touches); `selStart`/`selEnd` delimit the selection inside it (NFC offsets).
 */
export function contextFromRange(range: Range, opts: SentenceOptions = {}): SentenceContext {
  const limits = [LIMITS_BASE];
  const loc = locate(range);
  if ('failure' in loc) {
    if (loc.failure === 'multi-block') {
      limits.push('The selection runs across block elements, so no single sentence is claimed.');
      const text = selectionSurface(range);
      return { kind: 'fragment', reason: 'selection-spans-blocks', sentence: text, selStart: 0, selEnd: text.length, confidence: 0.3, limits };
    }
    return { kind: 'none', reason: loc.failure === 'empty' ? 'empty-selection' : 'selection-outside-text', confidence: 0, limits };
  }
  const { text, s, e, block } = loc;
  const spans = segment(text, opts);
  if (!spans.length) return { kind: 'none', reason: 'selection-outside-text', confidence: 0, limits };
  const indexAt = (p: number, forward: boolean): number => {
    const k = spans.findIndex((sp) => p >= sp.start && p < sp.end);
    if (k >= 0) return k;
    const next = spans.findIndex((sp) => sp.start >= p);
    return forward ? (next >= 0 ? next : spans.length - 1) : (next > 0 ? next - 1 : next < 0 ? spans.length - 1 : 0);
  };
  const first = indexAt(s, true);
  const last = indexAt(e - 1, false);
  const sentence = tidy(text.slice(spans[first].start, spans[last].end));
  const selStart = tidy(text.slice(spans[first].start, s)).length;
  const selEnd = tidy(text.slice(spans[first].start, e)).length;

  let before = first > 0 ? cleanText(text.slice(spans[first - 1].start, spans[first - 1].end)) : neighbour(block, -1, opts);
  let after = last < spans.length - 1 ? cleanText(text.slice(spans[last + 1].start, spans[last + 1].end)) : neighbour(block, 1, opts);
  if (!before) { before = undefined; limits.push('No earlier sentence in this chapter document.'); }
  if (!after) { after = undefined; limits.push('No later sentence in this chapter document.'); }

  const common = { sentence, selStart, selEnd, ...(before ? { before } : {}), ...(after ? { after } : {}), limits };
  if (first === last) return { kind: 'sentence', confidence: blockConfidence(block), ...common };
  return { kind: 'fragment', reason: 'selection-spans-sentences', confidence: Math.max(0.05, blockConfidence(block) - 0.4), ...common };
}
