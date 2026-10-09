/**
 * Test helpers for the controlled reader: load a fixture EPUB, open it with epub.js inside jsdom, wait for a chapter
 * to render, and select text inside the chapter iframe. jsdom has no layout, so everything here is about the DOM and
 * epub.js object model; pixel geometry and real pagination are manual checks (test/controlled-reader/MANUAL.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import ePub, { Contents } from 'epubjs';
import { EpubLocalAdapter, type ContentsLike, type ReaderHandle } from '../../../packages/controlled-reader/src/adapter';
import { installUrlShims, shimIframesOnLoad, shimWindow } from './jsdom-shims';

const FIXTURES = path.resolve(__dirname, '../../fixtures/epub');

export const fixtureBytes = (name: string): Uint8Array => new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyBook = any;
export type AnyRendition = any;

export interface Opened {
  book: AnyBook;
  rendition: AnyRendition;
  host: HTMLElement;
  adapter: EpubLocalAdapter;
  contents(): ContentsLike;
  /** Display a spine index / href / CFI and resolve when that chapter's iframe has rendered. */
  show(target?: number | string): Promise<ContentsLike>;
  close(): Promise<void>;
}

let patched = false;
/**
 * epub.js debounces selection changes by 250 ms. A timer that outlives its iframe (the chapter was switched or the book
 * closed first) reaches into a destroyed jsdom window and throws into whichever test runs next; swallow that, in tests only.
 */
function patchSelectionTimer(): void {
  if (patched) return;
  patched = true;
  const proto = (Contents as unknown as { prototype: Record<string, unknown> }).prototype;
  proto.onSelectionChange = function (this: AnyBook): void {
    clearTimeout(this.selectionEndTimeout);
    this.selectionEndTimeout = setTimeout(() => {
      try { this.triggerSelectedEvent(this.window.getSelection()); } catch { /* the iframe is already gone */ }
    }, 250);
  };
}

export async function openFixture(name: string, flow: 'paginated' | 'scrolled-doc' = 'paginated'): Promise<Opened> {
  installUrlShims();
  patchSelectionTimer();
  shimWindow(window as unknown as Window & typeof globalThis);
  const unshim = shimIframesOnLoad(document);
  const bytes = fixtureBytes(name);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const book: AnyBook = (ePub as unknown as () => AnyBook)();
  // open as 'binary' explicitly: jsdom's ArrayBuffer is a different realm from Node's, which defeats the constructor's sniffing
  await book.open(ab, 'binary');
  await book.ready;
  await book.opened; // the resource replacements have finished
  const host = document.createElement('div');
  document.body.appendChild(host);
  const rendition: AnyRendition = book.renderTo(host, { width: 600, height: 400, flow, spread: 'none', method: 'write' }); // jsdom has no iframe srcdoc: epub.js's document.write path stands in
  const adapter = new EpubLocalAdapter({ book, rendition } as unknown as ReaderHandle, { hostWindow: window });
  const contents = (): ContentsLike => rendition.getContents()[0] as ContentsLike;
  const show = async (target?: number | string): Promise<ContentsLike> => {
    const rendered = new Promise<void>((resolve) => rendition.once('rendered', () => resolve()));
    await rendition.display(target);
    // a display inside the chapter that is already shown re-renders nothing, so 'rendered' may never come
    await Promise.race([rendered, new Promise<void>((resolve) => setTimeout(resolve, 400))]);
    return contents();
  };
  const close = async (): Promise<void> => {
    // epub.js starts the rendition on a timer: destroying the book before that leaves a timer pointing at nothing
    await Promise.race([rendition.started, new Promise((resolve) => setTimeout(resolve, 300))]).catch(() => undefined);
    try { adapter.dispose(); rendition.destroy(); book.destroy(); } catch { /* already gone */ }
    host.remove();
    unshim();
  };
  return { book, rendition, host, adapter, contents, show, close };
}

/** A DOM Range over the first occurrence of `needle` in the document's text (text nodes concatenated, across inline elements). */
export function rangeOfText(doc: Document, needle: string, occurrence = 0): Range {
  const nodes: Text[] = [];
  const tw = doc.createTreeWalker(doc.body, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n as Text);
  const all = nodes.map((n) => n.data).join('');
  let at = -1;
  for (let k = 0; k <= occurrence; k++) at = all.indexOf(needle, at + 1);
  if (at < 0) throw new Error(`text not found: ${needle}`);
  const locate = (pos: number, end: boolean): [Text, number] => {
    let acc = 0;
    for (const n of nodes) {
      const next = acc + n.data.length;
      if (end ? pos <= next && pos > acc : pos < next) return [n, pos - acc];
      acc = next;
    }
    const last = nodes[nodes.length - 1];
    return [last, last.data.length];
  };
  const range = doc.createRange();
  const [sn, so] = locate(at, false);
  const [en, eo] = locate(at + needle.length, true);
  range.setStart(sn, so);
  range.setEnd(en, eo);
  return range;
}

export function select(doc: Document, range: Range): void {
  const sel = doc.defaultView!.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Independent sentence expectation for fixture paragraphs: split after . ! ? followed by white space. */
export const naiveSentences = (paragraph: string): string[] => paragraph.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

/** A Range over [start,end) of an element's text (text nodes concatenated, across inline elements). */
export function rangeAt(el: Element, start: number, end: number): Range {
  const doc = el.ownerDocument;
  const nodes: Text[] = [];
  const tw = doc.createTreeWalker(el, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n as Text);
  const find = (pos: number, isEnd: boolean): [Text, number] => {
    let acc = 0;
    for (const n of nodes) {
      const next = acc + n.data.length;
      if (isEnd ? pos <= next && pos > acc : pos < next) return [n, pos - acc];
      acc = next;
    }
    const last = nodes[nodes.length - 1];
    return [last, last.data.length];
  };
  const range = doc.createRange();
  const [sn, so] = find(start, false);
  const [en, eo] = find(end, true);
  range.setStart(sn, so);
  range.setEnd(en, eo);
  return range;
}

/** A Range from the start of the first occurrence of `from` to the end of the first occurrence of `to` after it. */
export function rangeSpan(doc: Document, from: string, to: string): Range {
  const a = rangeOfText(doc, from);
  const b = rangeOfText(doc, to);
  const range = doc.createRange();
  range.setStart(a.startContainer, a.startOffset);
  range.setEnd(b.endContainer, b.endOffset);
  return range;
}
