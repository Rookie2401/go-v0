// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EpubCFI } from 'epubjs';
import { READER_PAGE_TITLE } from '../../packages/controlled-reader/src/adapter';
import type { LayoutChange } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { validateCapabilities } from '../../packages/golearn-extension/src/contract/readerCapabilities';
import { openFixture, rangeAt, rangeOfText, rangeSpan, select, type Opened } from './helpers/book';

let open: Opened | undefined;
afterEach(async () => { await open?.close(); open = undefined; });

const TITLES = ['Mëngjesi', 'Gjyshi dhe gjyshja', 'Shiu'];

describe('capabilities and matching', () => {
  it('declares exactly what the controlled reader can honestly provide, and the contract accepts it', async () => {
    open = await openFixture('udha-sample.epub');
    const c = open.adapter.capabilities();
    expect(validateCapabilities(c)).toEqual([]);
    expect(c).toMatchObject({
      readerId: 'epub-local', wordSelection: true, selectedTextAvailable: true, sentenceContext: 'full', adjacentContext: true,
      stableAnchors: { kind: 'cfi' }, popupPositioning: 'range-rect', offline: true,
      contentAccessRestrictions: 'DRM-free files only; protected EPUBs refused', contextConfidence: 0.9, requiredPermissions: [],
    });
    expect(c.persistentAnnotation.supported).toBe(true);
  });

  it('matches the reader page (by title or path) and nothing else', async () => {
    open = await openFixture('udha-sample.epub');
    const page = (over: object) => ({ href: 'http://localhost:5197/', protocol: 'http:', host: 'localhost:5197', pathname: '/', ...over });
    expect(open.adapter.matches(page({ title: READER_PAGE_TITLE }))).toBe(true);
    expect(open.adapter.matches(page({ pathname: '/packages/controlled-reader/index.html' }))).toBe(true);
    expect(open.adapter.matches(page({ title: 'Some other site', host: 'example.org' }))).toBe(false);
    expect(open.adapter.matches(page({ protocol: 'chrome-extension:', title: READER_PAGE_TITLE }))).toBe(false);
  });
});

describe('spine navigation and chapter changes', () => {
  it('lists the spine in reading order and shows each chapter in that order', async () => {
    open = await openFixture('udha-sample.epub');
    expect(open.book.spine.spineItems.map((s: { href: string }) => s.href)).toEqual(['ch1.xhtml', 'ch2.xhtml', 'ch3.xhtml']);
    const nav = await open.book.loaded.navigation;
    expect(nav.toc.map((t: { label: string }) => t.label)).toEqual(TITLES);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await open.show(i);
      expect(c.sectionIndex).toBe(i);
      seen.push(c.document.querySelector('h1')!.textContent!);
    }
    expect(seen).toEqual(TITLES);
  });

  it('the source reference follows the displayed chapter and never carries text', async () => {
    open = await openFixture('udha-sample.epub');
    const locators: string[] = [];
    for (let i = 0; i < 3; i++) {
      await open.show(i);
      const ref = open.adapter.sourceRef();
      expect(ref.kind).toBe('file');
      expect(ref.title).toBe('Udha 1 — mostër (Go owner-authored sample)');
      locators.push(ref.locator!);
      expect(new EpubCFI().isCfiString(ref.locator!)).toBe(true);
      expect(JSON.stringify(ref)).not.toMatch(/mëngjes|Beni|Gjyshi/i); // locator and title only
    }
    expect(locators[0]).toMatch(/^epubcfi\(\/6\/2!/);
    expect(locators[1]).toMatch(/^epubcfi\(\/6\/4!/);
    expect(locators[2]).toMatch(/^epubcfi\(\/6\/6!/);
  });

  it('a range from a chapter that is no longer displayed has no live range and no context', async () => {
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    const range = rangeOfText(c.document, 'zgjohet');
    expect(open.adapter.isRangeLive(range)).toBe(true);
    await open.show(1);
    expect(open.adapter.isRangeLive(range)).toBe(false);
    expect(open.adapter.context(range)).toMatchObject({ kind: 'none', confidence: 0 });
  });
});

describe('selection inside the chapter iframe', () => {
  it('reads the selection from the same-origin iframe: sandboxed, no scripts, NFC surface', async () => {
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    const frame = c.window.frameElement as HTMLIFrameElement;
    expect(String(frame.sandbox)).toContain('allow-same-origin');
    expect(String(frame.sandbox)).not.toContain('allow-scripts');
    // put a decomposed form in the page ("e" + combining diaeresis) and select it: the surface must come back composed
    const word = rangeOfText(c.document, 'mëngjes');
    const node = word.startContainer as Text;
    const at = word.startOffset;
    node.data = node.data.slice(0, at) + 'mëngjes' + node.data.slice(at + 'mëngjes'.length);
    const decomposed = rangeOfText(c.document, 'mëngjes');
    select(c.document, decomposed);
    const s = open.adapter.selection();
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.surface).toBe('mëngjes');
    expect(s.surface).toBe(s.surface.normalize('NFC'));
    expect(s.frame).toBe('same-origin-frame');
    expect(s.pageLanguage).toBe('sq');
    expect(s.direction).toBe('ltr');
  });

  it('fails clearly when nothing, a block-crossing text or too much is selected', async () => {
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    c.window.getSelection()!.removeAllRanges();
    expect(open.adapter.selection()).toMatchObject({ ok: false, reason: 'no-selection' });
    select(c.document, rangeSpan(c.document, 'vishet.', 'Nëna'));
    expect(open.adapter.selection()).toMatchObject({ ok: false, reason: 'multi-block' });
    const small = new (await import('../../packages/controlled-reader/src/adapter')).EpubLocalAdapter(
      { book: open.book, rendition: open.rendition }, { maxSelectionWords: 2 });
    select(c.document, rangeOfText(c.document, 'Beni zgjohet herët'));
    expect(small.selection()).toMatchObject({ ok: false, reason: 'too-long' });
  });

  it('rebuilds the sentence across <em>/<span> boundaries in the real fixture, for every sentence of every chapter', async () => {
    // ground truth: the corpus sentence entries the fixture was built from (test/fixtures/epub/udha-sample.sentences.json)
    const truth = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/epub/udha-sample.sentences.json'), 'utf8')) as { chapters: string[][][] };
    const reader = (open = await openFixture('udha-sample.epub'));
    let entries = 0;
    let exact = 0;
    for (let i = 0; i < 3; i++) {
      const c = await reader.show(i);
      const paragraphs = [...c.document.querySelectorAll('p')];
      expect(paragraphs).toHaveLength(truth.chapters[i].length);
      let inChapter = 0;
      paragraphs.forEach((p, pi) => {
        expect(p.textContent, `chapter ${i} paragraph ${pi}`).toBe(truth.chapters[i][pi].join(' '));
        let cursor = 0;
        for (const entry of truth.chapters[i][pi]) {
          const start = p.textContent!.indexOf(entry, cursor);
          cursor = start + entry.length;
          const cut = entry.includes(' ') ? entry.indexOf(' ') : entry.length;
          // select the FIRST word of the entry (it may itself sit in an <em>, a <span>, or plain text)
          select(c.document, rangeAt(p, start, start + cut));
          const sel = reader.adapter.selection();
          expect(sel.ok, entry).toBe(true);
          if (!sel.ok) continue;
          const ctx = reader.adapter.context(sel.range, { adjacent: true });
          expect(ctx.kind, entry).toBe('sentence');
          // the rebuilt sentence is the corpus entry, or its first typographic sentence when the entry holds two
          expect(entry.startsWith(ctx.sentence!), entry).toBe(true);
          expect(ctx.sentence!.slice(ctx.selStart, ctx.selEnd), entry).toBe(entry.slice(0, cut));
          if (ctx.sentence === entry) exact++;
          inChapter++;
        }
      });
      entries += inChapter;
      expect(inChapter).toBe([22, 18, 21][i]); // the sentence counts of the three chapters
    }
    expect(entries).toBe(61);
    // only "— Mirëmëngjes, Beni! A do çaj?" is one corpus entry with two typographic sentences
    expect(entries - exact).toBeLessThanOrEqual(2);
  });

  it('returns the neighbouring sentences only when asked (data minimisation) and a selection over two sentences is a fragment', async () => {
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    select(c.document, rangeOfText(c.document, 'zgjohet'));
    const s = open.adapter.selection();
    if (!s.ok) throw new Error('no selection');
    const plain = open.adapter.context(s.range);
    expect(plain.before).toBeUndefined();
    expect(plain.after).toBeUndefined();
    const withAdjacent = open.adapter.context(s.range, { adjacent: true });
    expect(withAdjacent.before).toBe('Është mëngjes.');
    expect(withAdjacent.after).toBe('Ai lahet dhe vishet.');

    select(c.document, rangeOfText(c.document, 'mëngjes. Beni zgjohet'));
    const two = open.adapter.selection();
    if (!two.ok) throw new Error('no selection');
    const frag = open.adapter.context(two.range);
    expect(frag.kind).toBe('fragment');
    expect(frag.sentence).toBe('Është mëngjes. Beni zgjohet herët.');
    expect(frag.confidence).toBeLessThan(0.6);
  });
});

describe('CFI anchors and highlights', () => {
  it('the CFI of a selection resolves back to the same text after the chapter is re-rendered', async () => {
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    select(c.document, rangeOfText(c.document, 'zgjohet'));
    const s = open.adapter.selection();
    if (!s.ok) throw new Error('no selection');
    const cfi = open.adapter.cfiOf(s.range)!;
    expect(new EpubCFI().isCfiString(cfi)).toBe(true);
    expect(cfi).toMatch(/^epubcfi\(\/6\/2!/);
    expect(cfi).not.toMatch(/zgjohet/); // an address, not text
    expect(open.adapter.rangeFromCfi(cfi)!.toString()).toBe('zgjohet');

    await open.show(1); // the iframe is replaced
    expect(open.adapter.rangeFromCfi(cfi)).toBeUndefined(); // that chapter is not displayed: nothing is loaded to find it
    await open.show(cfi); // display by CFI: epub.js re-creates the iframe
    const again = open.adapter.rangeFromCfi(cfi)!;
    expect(again.toString()).toBe('zgjohet');
    expect(open.adapter.cfiOf(again)).toBe(cfi); // the same address comes back: stable
  });

  it('survives pagination moves: the stored CFI stays valid when the displayed location changes inside the chapter', async () => {
    // jsdom has no layout, so rendition.next()/prev() cannot paginate here (the browser steps are in MANUAL.md); what a page
    // turn does inside one chapter is change the displayed location, which display(cfi) reproduces
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    select(c.document, rangeOfText(c.document, 'zgjohet'));
    const s = open.adapter.selection();
    if (!s.ok) throw new Error('no selection');
    const cfi = open.adapter.cfiOf(s.range)!;
    const paragraphs = c.document.querySelectorAll('p');
    const last = paragraphs[paragraphs.length - 1];
    const lastCfi = open.adapter.cfiOf(rangeAt(last, 0, 3))!;
    const sameChapter = await open.show(lastCfi); // "page N": the later part of the same chapter
    expect(sameChapter.sectionIndex).toBe(0);
    expect(open.adapter.rangeFromCfi(cfi)!.toString()).toBe('zgjohet');
    expect(open.adapter.rangeFromCfi(lastCfi)!.toString()).toBe(last.textContent!.slice(0, 3));
    await open.show(cfi); // and back
    expect(open.adapter.rangeFromCfi(cfi)!.toString()).toBe('zgjohet');
  });

  it('re-anchors after reflow: a font-size change keeps the CFI valid and emits a font layout change', async () => {
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    select(c.document, rangeOfText(c.document, 'zgjohet'));
    const s = open.adapter.selection();
    if (!s.ok) throw new Error('no selection');
    const cfi = open.adapter.cfiOf(s.range)!;
    const changes: LayoutChange[] = [];
    open.adapter.onLayoutChange((x) => changes.push(x));
    open.adapter.setFontSize(120);
    open.adapter.setFontSize(140);
    expect(changes.map((x) => x.reason)).toEqual(['font', 'font']);
    expect(c.document.body.style.fontSize || c.document.documentElement.style.fontSize).toBe('140%');
    const refound = open.adapter.rangeFromCfi(cfi)!;
    expect(refound.toString()).toBe('zgjohet');
    expect(open.adapter.cfiOf(refound)).toBe(cfi);
    // the rendition is resized (all views are re-created): the same CFI is re-found once the chapter is displayed again
    open.rendition.resize(300, 200);
    await open.show(cfi);
    expect(open.adapter.rangeFromCfi(cfi)!.toString()).toBe('zgjohet');
  });

  it('highlights by CFI through the annotations API (local only) and removes them', async () => {
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    const range = rangeOfText(c.document, 'zgjohet');
    const cfi = open.adapter.highlight(range)!;
    expect(open.adapter.highlights()).toEqual([cfi]);
    expect(Object.keys(open.rendition.annotations._annotations)).toHaveLength(1);
    await open.show(1);
    await open.show(0); // re-render: epub.js re-attaches stored annotations, the adapter's list is unchanged
    expect(Object.keys(open.rendition.annotations._annotations)).toHaveLength(1);
    open.adapter.removeHighlight(cfi);
    expect(open.adapter.highlights()).toEqual([]);
    expect(Object.keys(open.rendition.annotations._annotations)).toHaveLength(0);
  });
});

describe('layout changes and popup positioning', () => {
  it('relays relocation, resize and layout events, and stops after unsubscribe', async () => {
    open = await openFixture('udha-sample.epub');
    const seen: string[] = [];
    const off = open.adapter.onLayoutChange((c) => seen.push(c.reason));
    open.rendition.emit('relocated', {});
    open.rendition.emit('resized', { width: 1, height: 1 });
    open.rendition.emit('layout', {});
    expect(seen).toEqual(['scroll', 'resize', 'resize']);
    off();
    open.rendition.emit('relocated', {});
    open.rendition.emit('resized', {});
    expect(seen).toHaveLength(3);
  });

  it('converts the selection rect to host-page coordinates (iframe rect + inner rect, with scale) and falls back when off screen', async () => {
    open = await openFixture('udha-sample.epub');
    const c = await open.show(0);
    const range = rangeOfText(c.document, 'zgjohet');
    const frame = c.window.frameElement as HTMLIFrameElement;
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });
    range.getClientRects = (() => [rect(40, 30, 50, 18)]) as unknown as Range['getClientRects'];
    frame.getBoundingClientRect = () => rect(100, 60, 600, 400) as DOMRect;
    open.host.getBoundingClientRect = () => rect(100, 60, 600, 400) as DOMRect;
    (open.rendition.manager.container as HTMLElement).getBoundingClientRect = () => rect(100, 60, 600, 400) as DOMRect;
    const a = open.adapter.anchor(range);
    expect(a.source).toBe('range');
    expect(a.rect).toMatchObject({ left: 140, top: 90, width: 50, height: 18, right: 190, bottom: 108 });
    expect(a.viewport.width).toBeGreaterThan(0);
    expect(a.rtl).toBe(false);

    // the next column: the iframe is shifted left by one page, the word sits outside the reading area
    frame.getBoundingClientRect = () => rect(-500, 60, 1200, 400) as DOMRect;
    const off = open.adapter.anchor(range);
    expect(off.source).toBe('fallback');

    // without geometry (jsdom default) there is no rect at all: fixed corner
    range.getClientRects = (() => []) as unknown as Range['getClientRects'];
    expect(open.adapter.anchor(range).source).toBe('fallback');
    expect(open.adapter.anchor(undefined).source).toBe('fallback');
  });
});

describe('right-to-left book', () => {
  it('renders with dir=rtl and extracts the selection, sentence and direction correctly', async () => {
    open = await openFixture('rtl-sample.epub');
    expect(open.book.packaging.metadata.direction).toBe('rtl');
    const c = await open.show(0);
    expect(c.document.documentElement.getAttribute('dir')).toBe('rtl');
    select(c.document, rangeOfText(c.document, 'בירושלים'));
    const s = open.adapter.selection();
    if (!s.ok) throw new Error('no selection');
    expect(s.surface).toBe('בירושלים');
    expect(s.direction).toBe('rtl');
    expect(s.directionSource).toBe('attribute');
    expect(s.pageLanguage).toBe('he');
    const ctx = open.adapter.context(s.range, { adjacent: true });
    expect(ctx.kind).toBe('sentence');
    expect(ctx.sentence).toBe('אני גר בירושלים.');
    expect(ctx.sentence!.slice(ctx.selStart, ctx.selEnd)).toBe('בירושלים');
    expect(ctx.before).toBe('שלום, שמי דוד.');
    expect(ctx.after).toBe('זה הבית שלי.');
    expect(open.adapter.anchor(s.range).rtl).toBe(true);
  });
});
