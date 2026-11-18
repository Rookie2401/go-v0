/**
 * Reading Analysis: which text of the page is the text to be read.
 *
 * The WHOLE readable text the document holds, not the part on screen: a learner looking at the first paragraph of a long article gets the
 * article. What the document does not hold (the next chapter of a reader that loads one at a time) is not fetched, followed or guessed:
 * the scope says what was read.
 *
 * The rules are the reader registry's and GoLearn Active's, not new ones:
 *   - a page whose registry entry refuses reading (a blocked or permission-required reader) is refused here too, before anything is read;
 *   - the site's own reading area (`containers`) and chrome (`ignore`) are honoured, and frames are read only as its frame policy allows;
 *   - the scanner's rules decide what a readable text node is (no form fields, scripts, editable regions, GoLearn's own card, navigation,
 *     banners, footers, menus, dialogs);
 * and on top of them, for a count of a text rather than an underline:
 *   - sidebars, forms, search boxes, closed disclosures and advertisement slots are left out;
 *   - text that is not rendered (display: none anywhere above it, visibility: hidden) is left out, so a page that keeps a desktop and a
 *     mobile copy of its text counts it once;
 *   - a block that declares another language (lang=) is left out and counted as such; the page-wide html lang is never taken as proof;
 *   - on a page with no site reading area, the main content (main, article, role=main) is the scope when it holds most of the readable
 *     text; otherwise the whole page is, and the scope says so.
 * No layout is required (it works on a page that was never painted); no network; nothing is kept beyond the returned nodes.
 */
import type { LanguageAdapter } from '../../../../src/core';
import { canonicalVarietyId, hasLearningVarieties } from '../../../repository-contract/src/varieties';
import { chooseAdapter, describePage, entryRefuses, registryEntry } from '../adapters';
import { createScanner } from '../active/scan';
import type { ReaderAdapter } from '../contract/readerAdapter';
import { mapLanguageTag } from '../language/resolve';
import type { ReadingScope } from './protocol';

/** Left out of a reading count besides what the scanner leaves out. */
export const READING_IGNORE: readonly string[] = [
  'aside', 'form', '[inert]', 'details:not([open])', '[role="complementary"]', '[role="search"]', '[role="form"]', '[role="alert"]', '[role="status"]',
  'ins.adsbygoogle', '[aria-label="Advertisement" i]', '[data-ad]', '[data-ad-slot]', '.advertisement',
];
/** The main content of a page with no site reading area. */
export const MAIN_SELECTOR = 'main, article, [role="main"], [data-reader-content], [data-chapter]';
/** The main content is the scope when it holds at least this share of the page's readable letters. */
export const MAIN_SHARE = 0.5;

export interface Extraction {
  ok: true;
  nodes: Text[];
  scope: Pick<ReadingScope, 'kind' | 'title' | 'foreignBlocks' | 'frames' | 'characters'>;
  /** Changes when the text does: the nodes' text, in order. Two extractions with the same fingerprint read the same text. */
  fingerprint: string;
}
export type ExtractionFailure = { ok: false; code: 'unsupported-page'; message: string };

export interface ExtractOptions {
  doc: Document;
  languageId: string;
  /** The text variety the learner analyses the page as (Hebrew, Greek): a block that declares another one is left out. */
  varietyId?: string;
  /** The content script's reader adapters (createAdapters): which reader this page is. */
  adapters: ReaderAdapter[];
  adapterOf(languageId: string): LanguageAdapter | undefined;
}

/**
 * The variety a language tag states outright (`hbo`, `grc-x-koine`, `el-modern` ...). A bare `he`, `el` or `grc` states none: it is not
 * evidence of Biblical against Modern, nor of Attic against Koine.
 */
export function declaredVariety(languageId: string, tag: string | null | undefined): string | undefined {
  if (!tag?.trim() || !hasLearningVarieties(languageId)) return undefined;
  const t = tag.trim().toLowerCase().replace(/_/gu, '-').replace(/-x-/u, '-');
  return canonicalVarietyId(languageId, t);
}

/** Two 32-bit FNV-1a hashes with different offsets over the UTF-16 units, as one string: fast enough for a book, wide enough to tell texts apart. */
export function fingerprintOf(nodes: readonly Text[]): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  let length = 0;
  for (const n of nodes) {
    const s = n.data;
    length += s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x85ebca6b) + 0x7ed55d16;
    }
    a = Math.imul(a ^ 0x1f, 0x01000193); // a node boundary: the same letters cut differently are another text
  }
  return `${nodes.length}:${length}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

function renderedCheck(doc: Document): (el: Element) => boolean {
  const view = doc.defaultView;
  const cache = new WeakMap<Element, boolean>();
  const own = (el: Element): boolean => {
    if (!view) return true;
    let st: CSSStyleDeclaration | undefined;
    try { st = view.getComputedStyle(el); } catch { st = undefined; }
    if (!st) return true;
    return st.display !== 'none' && st.visibility !== 'hidden' && st.visibility !== 'collapse';
  };
  const rendered = (el: Element): boolean => {
    const hit = cache.get(el);
    if (hit !== undefined) return hit;
    // the browser's own answer where it has one (display, visibility and content-visibility through every ancestor); the walk elsewhere
    const check = (el as Element & { checkVisibility?: (o?: Record<string, boolean>) => boolean }).checkVisibility;
    let ok: boolean;
    if (typeof check === 'function') { try { ok = check.call(el, { checkVisibilityCSS: true, visibilityProperty: true }); } catch { ok = own(el); } }
    else ok = own(el) && (!el.parentElement || el.parentElement === doc.documentElement || rendered(el.parentElement));
    cache.set(el, ok);
    return ok;
  };
  return rendered;
}

/**
 * The element that says this text is in another language (or, for Hebrew and Greek, another variety than the one being analysed): the
 * nearest ancestor with a lang attribute, when what it declares is not the analysed language. Undefined when the text is not declared foreign.
 */
function declaresOther(node: Text, languageId: string, varietyId: string | undefined): Element | undefined {
  const root = node.ownerDocument.documentElement;
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    const tag = el.getAttribute('lang') ?? el.getAttribute('xml:lang');
    if (!tag?.trim()) continue;
    const mapped = mapLanguageTag(tag);
    if (mapped.kind !== 'pack' || mapped.languageId !== languageId) return el;
    const stated = declaredVariety(languageId, tag);
    return !!stated && !!varietyId && stated !== varietyId ? el : undefined;
  }
  return undefined;
}

const letters = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;

export function extractReadingText(o: ExtractOptions): Extraction | ExtractionFailure {
  const { doc } = o;
  const adapter = chooseAdapter(describePage(doc), o.adapters);
  const entry = registryEntry(adapter.id);
  // the registry's refusal is authoritative even for an analysis the learner asked for: a refused reader is never probed through this feature
  if (adapter.id === 'unsupported' || !entry || entryRefuses(entry)) {
    return { ok: false, code: 'unsupported-page', message: entry?.refusal ?? 'GoLearn does not read this page.' };
  }
  const containers = entry.site?.containers ?? [];
  const scanner = createScanner({ doc, adapterOf: o.adapterOf, containers, ignore: [...(entry.site?.ignore ?? []), ...READING_IGNORE], viewport: 'all' });

  const roots: Document[] = [doc];
  const frames = entry.site?.frames;
  if (frames !== 'top-only' && frames !== 'declare-cross-origin') {
    for (const f of doc.querySelectorAll('iframe, frame')) {
      let inner: Document | null = null;
      try { inner = (f as HTMLIFrameElement).contentDocument; } catch { inner = null; }
      if (inner?.body) roots.push(inner);
    }
  }

  const seen = new Set<Text>();
  const readable: Text[] = [];
  // counted by the element that makes the declaration: a quotation of three paragraphs under one lang= is one passage, not three
  const foreign = new Set<Element>();
  let framesRead = 0;
  for (const root of roots) {
    const rendered = renderedCheck(root);
    let any = false;
    for (const node of scanner.textNodes(root)) {
      if (seen.has(node)) continue; // nested reading areas name the same text twice
      seen.add(node);
      const parent = node.parentElement;
      if (!parent || !rendered(parent)) continue;
      const other = declaresOther(node, o.languageId, o.varietyId);
      if (other) { foreign.add(other); continue; }
      readable.push(node);
      any = true;
    }
    if (any && root !== doc) framesRead++;
  }

  let kind: ReadingScope['kind'] = containers.length ? 'reader' : 'page';
  let nodes = readable;
  if (!containers.length) {
    // the text of a framed reading area is content, whatever its own markup
    const main = readable.filter((n) => n.ownerDocument !== doc || !!n.parentElement?.closest(MAIN_SELECTOR));
    const all = readable.reduce((sum, n) => sum + letters(n.data), 0);
    const inMain = main.reduce((sum, n) => sum + letters(n.data), 0);
    if (main.length && all > 0 && inMain / all >= MAIN_SHARE) { kind = 'main'; nodes = main; }
  }
  const characters = nodes.reduce((sum, n) => sum + n.data.length, 0);
  const title = (doc.title || '').replace(/\s+/gu, ' ').trim().slice(0, 160);
  return { ok: true, nodes, scope: { kind, title, foreignBlocks: foreign.size, frames: framesRead, characters }, fingerprint: fingerprintOf(nodes) };
}
