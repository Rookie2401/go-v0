// @vitest-environment jsdom
/**
 * Reading Analysis: extractReadingText decides which text of a page is "the text to be read" for a whole-document coverage count.
 * Every document is built with its own JSDOM at a real address, because the registry matches on host and path and treats about:blank as
 * unsupported. Expected text is asserted exactly, never only counted.
 */
import fs from 'node:fs';
import path from 'node:path';
// jsdom ships no type declarations in this repo: the constructor is typed here, to the little the tests use
// @ts-expect-error TS7016
import { JSDOM as JSDOMUntyped } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createAdapters, entryRefuses, READER_REGISTRY, registryEntry } from '../../packages/golearn-extension/src/adapters';
import { GOLEARN_HOST_ATTR } from '../../packages/golearn-extension/src/contract/readerAdapter';
import {
  declaredVariety, extractReadingText, fingerprintOf, MAIN_SELECTOR, MAIN_SHARE, READING_IGNORE,
  type Extraction, type ExtractionFailure,
} from '../../packages/golearn-extension/src/reading/extract';

interface JSDOM { window: Window & typeof globalThis }
const JSDOM = JSDOMUntyped as new (html: string, options?: { url?: string }) => JSDOM;

const SITES = path.resolve(__dirname, '../../packages/golearn-extension/harness/sites');

interface Page { dom: JSDOM; doc: Document }
function page(html: string, url = 'https://example.org/article'): Page {
  const dom = new JSDOM(html, { url });
  return { dom, doc: dom.window.document };
}
function fixture(name: string): Page & { url: string } {
  const html = fs.readFileSync(path.join(SITES, name), 'utf8');
  const url = new JSDOM(html).window.document.documentElement.getAttribute('data-fixture-url');
  if (!url) throw new Error(`fixture ${name} names no address`);
  const p = page(html, url);
  // a srcdoc frame is filled the way sites.support does it, if jsdom has not loaded it by itself
  for (const f of Array.from(p.doc.querySelectorAll('iframe'))) {
    const srcdoc = f.getAttribute('srcdoc');
    const fd = f.contentDocument;
    if (srcdoc && fd && !fd.body?.querySelector('p')) { fd.open(); fd.write(srcdoc); fd.close(); }
  }
  return { ...p, url };
}

type Opts = { languageId?: string; varietyId?: string };
function extract(p: Page, o: Opts = {}): Extraction | ExtractionFailure {
  return extractReadingText({ doc: p.doc, languageId: o.languageId ?? 'sq', varietyId: o.varietyId, adapters: createAdapters(p.doc), adapterOf: () => undefined });
}
function read(p: Page, o: Opts = {}): Extraction {
  const r = extract(p, o);
  if (!r.ok) throw new Error(`refused: ${r.message}`);
  return r;
}
const texts = (e: Extraction): string[] => e.nodes.map((n) => n.data.trim());

describe('1. an ordinary article page', () => {
  const html = `<!doctype html><html lang="sq"><head><title>An article</title><style>.x{color:red}</style><script>var a = "script text";</script></head><body>
<header><p>Header banner text</p></header>
<nav><a href="#">Navigation link text</a></nav>
<aside><p>Sidebar related stories</p></aside>
<div role="complementary"><p>Complementary role text</p></div>
<form><p>Login form label</p><input value="field value"></form>
<div role="search"><p>Search role text</p></div>
<button>Button label text</button>
<div aria-hidden="true"><p>Aria hidden text</p></div>
<div ${GOLEARN_HOST_ATTR}=""><p>GoLearn own card text</p></div>
<div role="dialog"><p>Dialog cookie text</p></div>
<details><summary>Closed details summary</summary><p>Closed details body</p></details>
<ins class="adsbygoogle"><span>Adsense slot text</span></ins>
<div data-ad><p>Data ad text</p></div>
<div class="advertisement"><p>Advertisement class text</p></div>
<div aria-label="Advertisement"><p>Labelled ad text</p></div>
<div inert><p>Inert text</p></div>
<div role="alert"><p>Alert text</p></div>
<main>
  <h1>Main title text</h1>
  <p>First article paragraph.</p>
  <p>Second article paragraph with <em>inline emphasis</em> inside.</p>
  <script>var b = "inline script text";</script>
  <p>Third article paragraph.</p>
</main>
<footer><p>Footer legal text</p></footer>
</body></html>`;

  it('returns exactly the article text, in document order, and nothing of the chrome', () => {
    const e = read(page(html));
    expect(texts(e)).toEqual([
      'Main title text', 'First article paragraph.', 'Second article paragraph with', 'inline emphasis', 'inside.', 'Third article paragraph.',
    ]);
  });

  it('names the exclusion lists it relies on', () => {
    for (const s of ['aside', 'form', 'details:not([open])', '.advertisement', 'ins.adsbygoogle', '[data-ad]']) expect(READING_IGNORE).toContain(s);
    expect(MAIN_SELECTOR).toContain('article');
    expect(MAIN_SHARE).toBe(0.5);
  });

  it('keeps the content of an OPEN details', () => {
    const e = read(page('<body><main><details open><summary>Open summary</summary><p>Open body text</p></details></main></body>'));
    expect(texts(e)).toEqual(['Open summary', 'Open body text']);
  });

  it('leaves out each excluded kind on its own (one probe per kind)', () => {
    const probes: Record<string, string> = {
      aside: '<aside>EXCLUDED</aside>',
      form: '<form><label>EXCLUDED</label></form>',
      roleForm: '<div role="form">EXCLUDED</div>',
      roleStatus: '<div role="status">EXCLUDED</div>',
      textarea: '<textarea>EXCLUDED</textarea>',
      select: '<select><option>EXCLUDED</option></select>',
      noscript: '<noscript>EXCLUDED</noscript>',
      template: '<template>EXCLUDED</template>',
      editable: '<div contenteditable="true">EXCLUDED</div>',
      menu: '<div role="menu">EXCLUDED</div>',
      toolbar: '<div role="toolbar">EXCLUDED</div>',
      navRole: '<div role="navigation">EXCLUDED</div>',
      banner: '<div role="banner">EXCLUDED</div>',
      contentinfo: '<div role="contentinfo">EXCLUDED</div>',
      tooltip: '<div role="tooltip">EXCLUDED</div>',
      adSlot: '<div data-ad-slot="1">EXCLUDED</div>',
    };
    for (const [kind, markup] of Object.entries(probes)) {
      const e = read(page(`<body>${markup}<p>Kept paragraph.</p></body>`));
      expect(texts(e), kind).toEqual(['Kept paragraph.']);
    }
  });
});

describe('2. the whole document, not the viewport', () => {
  it('returns every paragraph of a 600-paragraph article, in order, with no layout', () => {
    const paragraphs = Array.from({ length: 600 }, (_, i) => `Paragraph number ${i} of the long article.`);
    const p = page(`<body><article>${paragraphs.map((t) => `<p>${t}</p>`).join('')}</article></body>`);
    const e = read(p);
    expect(texts(e)).toEqual(paragraphs);
    expect(e.scope.kind).toBe('main');
    expect(e.scope.characters).toBe(paragraphs.reduce((s, t) => s + t.length, 0));
  });

  it('does not depend on scroll position or on a viewport size', () => {
    const paragraphs = Array.from({ length: 300 }, (_, i) => `Line ${i} far below the fold.`);
    const p = page(`<body><main>${paragraphs.map((t) => `<p>${t}</p>`).join('')}</main></body>`);
    // a tiny viewport, and every paragraph laid out thousands of pixels below it
    Object.defineProperty(p.dom.window, 'innerHeight', { value: 10, configurable: true });
    p.dom.window.Element.prototype.getBoundingClientRect = () => ({ top: 90000, bottom: 90020, left: 0, right: 100, width: 100, height: 20, x: 0, y: 90000, toJSON: () => ({}) });
    const e = read(p);
    expect(texts(e)).toEqual(paragraphs);
  });
});

describe('3. hidden text is excluded', () => {
  it('leaves out display:none (inline) on an ancestor', () => {
    const e = read(page('<body><main><p>Shown one.</p><div style="display:none"><section><p>Hidden by inline style.</p></section></div><p>Shown two.</p></main></body>'));
    expect(texts(e)).toEqual(['Shown one.', 'Shown two.']);
  });

  it('leaves out display:none set by a <style> rule on an ancestor', () => {
    const e = read(page('<head><style>.gone{display:none}</style></head><body><main><p>Shown one.</p><div class="gone"><section><p>Hidden by a rule.</p></section></div><p>Shown two.</p></main></body>'));
    expect(texts(e)).toEqual(['Shown one.', 'Shown two.']);
  });

  it('leaves out visibility:hidden (inline and by rule)', () => {
    const e = read(page('<head><style>.inv{visibility:hidden}</style></head><body><main><p>Shown one.</p><p style="visibility:hidden">Hidden inline.</p><div class="inv"><p>Hidden by rule.</p></div><p>Shown two.</p></main></body>'));
    expect(texts(e)).toEqual(['Shown one.', 'Shown two.']);
  });

  it('leaves out the hidden attribute (own and ancestor)', () => {
    const e = read(page('<body><main><p>Shown one.</p><p hidden>Hidden itself.</p><div hidden><p>Hidden by ancestor.</p></div><p>Shown two.</p></main></body>'));
    expect(texts(e)).toEqual(['Shown one.', 'Shown two.']);
  });

  it('counts a paragraph once when the page carries a visible desktop copy and a display:none mobile copy', () => {
    const e = read(page('<head><style>.mobile{display:none}</style></head><body><main><div class="desktop"><p>The same paragraph.</p></div><div class="mobile"><p>The same paragraph.</p></div></main></body>'));
    expect(texts(e)).toEqual(['The same paragraph.']);
    const e2 = read(page('<body><main><div><p>The same paragraph.</p></div><div style="display:none"><p>The same paragraph.</p></div></main></body>'));
    expect(texts(e2)).toEqual(['The same paragraph.']);
  });

  it('keeps a visible copy even when the HIDDEN copy comes first', () => {
    const e = read(page('<head><style>.mobile{display:none}</style></head><body><main><div class="mobile"><p>Same text here.</p></div><div><p>Same text here.</p></div></main></body>'));
    expect(texts(e)).toEqual(['Same text here.']);
  });
});

describe('4. nested containers produce no duplicate nodes', () => {
  const bg = (inner: string): Page => page(`<body><main class="page-content"><div class="passage-text"><div class="passage-content">${inner}</div></div></main></body>`, 'https://www.biblegateway.com/passage/?search=John+3');

  it('the biblegateway entry has several nested container selectors', () => {
    expect(registryEntry('biblegateway')!.site!.containers).toEqual(['main.page-content', '.passage-text', '.passage-content']);
  });

  it('returns each Text node at most once, exactly the passage text', () => {
    const e = read(bg('<h3>Heading one</h3><p>Verse one text.</p><p>Verse two text.</p>'));
    expect(texts(e)).toEqual(['Heading one', 'Verse one text.', 'Verse two text.']);
    expect(new Set(e.nodes).size).toBe(e.nodes.length);
    expect(e.scope.characters).toBe(e.nodes.reduce((s, n) => s + n.data.length, 0));
  });

  it('also holds with containers nested inside containers of the same selector', () => {
    const e = read(bg('<div class="passage-content"><p>Inner nested text.</p></div>'));
    expect(texts(e)).toEqual(['Inner nested text.']);
    expect(new Set(e.nodes).size).toBe(e.nodes.length);
  });
});

describe('5. scope kind and title', () => {
  it('is "reader" when the registry entry has containers', () => {
    const e = read(page('<body><main class="page-content"><p>Passage text.</p></main></body>', 'https://www.biblegateway.com/passage/?search=John+3'));
    expect(e.scope.kind).toBe('reader');
  });

  it('is "reader" even if the reading area is tiny beside outside text (containers rule)', () => {
    const e = read(page('<body><main class="page-content"><p>Tiny.</p></main><div><p>A very long paragraph outside the reading area of this site entry.</p></div></body>', 'https://www.biblegateway.com/passage/'));
    expect(e.scope.kind).toBe('reader');
    expect(texts(e)).toEqual(['Tiny.']);
  });

  it('is "main" when main/article holds most of the readable letters, and only main is returned', () => {
    const e = read(page('<body><div><p>Short outside.</p></div><article><p>A much longer article paragraph holding most letters of the page.</p></article></body>'));
    expect(e.scope.kind).toBe('main');
    expect(texts(e)).toEqual(['A much longer article paragraph holding most letters of the page.']);
  });

  it('is "main" at exactly MAIN_SHARE of the letters (inclusive boundary)', () => {
    const e = read(page('<body><div><p>aaaaaaaaaa</p></div><main><p>bbbbbbbbbb</p></main></body>'));
    expect(e.scope.kind).toBe('main');
    expect(texts(e)).toEqual(['bbbbbbbbbb']);
  });

  it('is "page" when the article is a teaser and the body text lies outside it', () => {
    const e = read(page('<body><article><p>Teaser.</p></article><div><p>The real body text of the page lives outside the article element entirely.</p></div></body>'));
    expect(e.scope.kind).toBe('page');
    expect(texts(e)).toEqual(['Teaser.', 'The real body text of the page lives outside the article element entirely.']);
  });

  it('is "page" when there is no main content element at all', () => {
    const e = read(page('<body><div><p>One block.</p></div><div><p>Two block.</p></div></body>'));
    expect(e.scope.kind).toBe('page');
    expect(texts(e)).toEqual(['One block.', 'Two block.']);
  });

  it('counts [role=main] and [data-chapter] as main content', () => {
    expect(read(page('<body><div role="main"><p>Role main text here.</p></div><p>x</p></body>')).scope.kind).toBe('main');
    expect(read(page('<body><div data-chapter><p>Chapter text here.</p></div><p>x</p></body>')).scope.kind).toBe('main');
  });

  it('takes the title from the document title with whitespace collapsed (and cut at 160)', () => {
    const e = read(page('<head><title>  A   long\n\t title  here </title></head><body><main><p>Body.</p></main></body>'));
    expect(e.scope.title).toBe('A long title here');
    const long = read(page(`<head><title>${'w'.repeat(300)}</title></head><body><main><p>Body.</p></main></body>`));
    expect(long.scope.title).toBe('w'.repeat(160));
    expect(read(page('<body><main><p>Body.</p></main></body>')).scope.title).toBe('');
  });
});

describe('6. declared foreign language', () => {
  it('excludes a lang="en" block from a Spanish analysis and counts it; keeps lang="es"', () => {
    const e = read(page(`<html lang="en"><body><main>
      <p>Párrafo sin etiqueta.</p>
      <p lang="es">Párrafo en español.</p>
      <blockquote lang="en"><p>An English quotation.</p><p>Another English line.</p></blockquote>
      <p lang="es-MX">Párrafo mexicano.</p>
    </main></body></html>`), { languageId: 'es' });
    expect(texts(e)).toEqual(['Párrafo sin etiqueta.', 'Párrafo en español.', 'Párrafo mexicano.']);
    expect(e.scope.foreignBlocks).toBe(1); // counted by the declaring element: one quotation of two paragraphs is one passage (changed after this suite's finding 3)
  });

  it('never excludes anything because of the page-wide <html lang>', () => {
    const e = read(page('<html lang="en"><body><main><p>Texto uno.</p><p>Texto dos.</p></main></body></html>'), { languageId: 'es' });
    expect(texts(e)).toEqual(['Texto uno.', 'Texto dos.']);
    expect(e.scope.foreignBlocks).toBe(0);
    const f = read(page('<html lang="fr"><body><main><p>Texto uno.</p></main></body></html>'), { languageId: 'es' });
    expect(texts(f)).toEqual(['Texto uno.']);
  });

  it('the NEAREST lang decides: a Spanish block inside an English one is kept', () => {
    const e = read(page('<body><main><div lang="en"><p>English only.</p><p lang="es">Español dentro.</p></div></main></body>'), { languageId: 'es' });
    expect(texts(e)).toEqual(['Español dentro.']);
    expect(e.scope.foreignBlocks).toBe(1);
  });

  it('excludes a block whose lang maps to no pack or a tag that is not a language', () => {
    const e = read(page('<body><main><p>Kept text.</p><p lang="xx-nonsense1">Odd tag text.</p></main></body>'), { languageId: 'es' });
    expect(texts(e)).toEqual(['Kept text.']);
    expect(e.scope.foreignBlocks).toBe(1);
  });

  it('honours xml:lang too', () => {
    const e = read(page('<body><main><p>Kept text.</p><p xml:lang="en">English via xml.</p></main></body>'), { languageId: 'es' });
    expect(texts(e)).toEqual(['Kept text.']);
    expect(e.scope.foreignBlocks).toBe(1);
  });

  describe('declaredVariety', () => {
    it('hbo -> he-bib, grc-x-koine -> el-koi, and the other stated ones', () => {
      expect(declaredVariety('he', 'hbo')).toBe('he-bib');
      expect(declaredVariety('he', 'HBO')).toBe('he-bib');
      expect(declaredVariety('he', 'he-biblical')).toBe('he-bib');
      expect(declaredVariety('he', 'he_modern')).toBe('he-mod');
      expect(declaredVariety('el', 'grc-x-koine')).toBe('el-koi');
      expect(declaredVariety('el', 'grc-koine')).toBe('el-koi');
      expect(declaredVariety('el', 'el-modern')).toBe('el-mod');
    });
    it('a bare he / el / grc states nothing; neither do empty tags or a language without varieties', () => {
      expect(declaredVariety('he', 'he')).toBeUndefined();
      expect(declaredVariety('el', 'el')).toBeUndefined();
      expect(declaredVariety('el', 'grc')).toBeUndefined();
      expect(declaredVariety('he', '')).toBeUndefined();
      expect(declaredVariety('he', '   ')).toBeUndefined();
      expect(declaredVariety('he', null)).toBeUndefined();
      expect(declaredVariety('he', undefined)).toBeUndefined();
      expect(declaredVariety('es', 'es')).toBeUndefined();
      expect(declaredVariety('es', 'hbo')).toBeUndefined();
    });
  });

  describe('Hebrew with varietyId he-bib', () => {
    const o = { languageId: 'he', varietyId: 'he-bib' };
    it('keeps hbo and bare he, excludes he-modern and another language', () => {
      const e = read(page(`<body><main>
        <p lang="hbo">Biblical block.</p>
        <p lang="he">Bare hebrew block.</p>
        <p>Untagged block.</p>
        <p lang="he-modern">Modern block.</p>
        <p lang="grc">Greek block.</p>
        <p lang="en">English block.</p>
      </main></body>`), o);
      expect(texts(e)).toEqual(['Biblical block.', 'Bare hebrew block.', 'Untagged block.']);
      expect(e.scope.foreignBlocks).toBe(3);
    });
    it('with the Modern variety analysed, a hbo block is the one left out', () => {
      const e = read(page('<body><main><p lang="hbo">Biblical block.</p><p lang="he-mod">Modern block.</p></main></body>'), { languageId: 'he', varietyId: 'he-mod' });
      expect(texts(e)).toEqual(['Modern block.']);
      expect(e.scope.foreignBlocks).toBe(1);
    });
    it('with no varietyId analysed, a variety-stating block is not excluded', () => {
      const e = read(page('<body><main><p lang="hbo">Biblical block.</p><p lang="he-modern">Modern block.</p></main></body>'), { languageId: 'he' });
      expect(texts(e)).toEqual(['Biblical block.', 'Modern block.']);
      expect(e.scope.foreignBlocks).toBe(0);
    });
  });

  describe('Greek with varietyId el-koi', () => {
    it('keeps grc-x-koine, excludes Modern Greek by el-modern', () => {
      const e = read(page('<body><main><p lang="grc-x-koine">Koine block.</p><p lang="el-modern">Modern block.</p><p lang="el">Bare greek.</p></main></body>'), { languageId: 'el', varietyId: 'el-koi' });
      expect(texts(e)).toEqual(['Koine block.', 'Bare greek.']);
      expect(e.scope.foreignBlocks).toBe(1);
    });
  });
});

describe('7. refused readers and non-web pages', () => {
  const refusing = READER_REGISTRY.filter((e) => entryRefuses(e) && e.hosts.some((h) => !h.pathPrefix));

  it('the registry has refusing entries to test against', () => {
    expect(refusing.map((e) => e.readerId)).toEqual(expect.arrayContaining(['kobo-web', 'kindle-web', 'readawrite', 'mebmarket', 'pratilipi']));
  });

  for (const entry of refusing) {
    it(`${entry.readerId}: returns unsupported-page with the entry's own refusal and reads nothing`, () => {
      const h = entry.hosts.find((x) => !x.pathPrefix)!.host.replace(/^\*\./, 'www.');
      const p = page('<body><main><p>Readable looking paragraph.</p></main></body>', `https://${h}/read/something`);
      const r = extract(p);
      expect(r.ok).toBe(false);
      expect(r).toEqual({ ok: false, code: 'unsupported-page', message: entry.refusal });
      expect('nodes' in r).toBe(false);
    });
  }

  it('a page that merely lives at a declined host is refused even inside a container the entry would read', () => {
    const p = page('<body><div class="chapter-content"><p>Chapter paragraph.</p></div></body>', 'https://www.readawrite.com/c/0123456789abcdef');
    expect(extract(p)).toMatchObject({ ok: false, code: 'unsupported-page' });
  });

  it('non-web pages are unsupported (chrome:// and about:blank)', () => {
    for (const url of ['chrome://settings/', 'about:blank']) {
      const p = page('<body><main><p>Some text here.</p></main></body>', url);
      const r = extract(p);
      expect(r.ok, url).toBe(false);
      expect(r, url).toMatchObject({ code: 'unsupported-page' });
    }
  });

  it('an ordinary https page is supported', () => {
    expect(extract(page('<body><main><p>Some text here.</p></main></body>')).ok).toBe(true);
  });
});

describe('8. frames', () => {
  const withFrame = (url: string, frameHtml: string): Page => {
    const p = page('<body><main><p>Top paragraph.</p></main><iframe id="f"></iframe></body>', url);
    const fd = p.doc.getElementById('f') as HTMLIFrameElement;
    if (!fd.contentDocument) throw new Error('jsdom gave the iframe no contentDocument');
    fd.contentDocument.open(); fd.contentDocument.write(frameHtml); fd.contentDocument.close();
    return p;
  };
  const FRAME = '<!doctype html><html><body><p>Frame paragraph one.</p><p>Frame paragraph two.</p></body></html>';

  it('reads same-origin frame text on an ordinary page (no frame policy)', () => {
    const e = read(withFrame('https://example.org/article', FRAME));
    expect(texts(e)).toEqual(['Top paragraph.', 'Frame paragraph one.', 'Frame paragraph two.']);
    expect(e.scope.frames).toBe(1);
  });

  it('reads it on a same-origin-frames entry (libroteka)', () => {
    expect(registryEntry('libroteka')!.site!.frames).toBe('same-origin-frames');
    const e = read(withFrame('https://libroteka.al/liber/x/1', FRAME));
    expect(texts(e)).toEqual(['Top paragraph.', 'Frame paragraph one.', 'Frame paragraph two.']);
    expect(e.scope.frames).toBe(1);
  });

  it('does NOT read it on a top-only entry (youversion)', () => {
    expect(registryEntry('youversion')!.site!.frames).toBe('top-only');
    const p = page('<body><div class="chapter"><p>Top paragraph.</p></div><iframe id="f"></iframe></body>', 'https://www.bible.com/bible/111/JHN.3.NIV');
    const fd = (p.doc.getElementById('f') as HTMLIFrameElement).contentDocument!;
    fd.open(); fd.write(FRAME); fd.close();
    const e = read(p);
    expect(texts(e)).toEqual(['Top paragraph.']);
    expect(e.scope.frames).toBe(0);
  });

  it('does NOT read it on a top-only entry (biblegateway)', () => {
    const p = page('<body><main class="page-content"><p>Top paragraph.</p><iframe id="f"></iframe></main></body>', 'https://www.biblegateway.com/passage/?search=John+3');
    const fd = (p.doc.getElementById('f') as HTMLIFrameElement).contentDocument!;
    fd.open(); fd.write(FRAME); fd.close();
    const e = read(p);
    expect(texts(e)).toEqual(['Top paragraph.']);
    expect(e.scope.frames).toBe(0);
  });

  it('applies the hidden-text and foreign-language rules inside a frame as well', () => {
    const e = read(withFrame('https://example.org/article', '<html><body><p>Frame kept.</p><p style="display:none">Frame hidden.</p><p lang="en">Frame english.</p></body></html>'), { languageId: 'sq' });
    expect(texts(e)).toEqual(['Top paragraph.', 'Frame kept.']);
    expect(e.scope.foreignBlocks).toBe(1);
  });

  it('an empty frame is not counted as read', () => {
    const e = read(withFrame('https://example.org/article', '<html><body></body></html>'));
    expect(texts(e)).toEqual(['Top paragraph.']);
    expect(e.scope.frames).toBe(0);
  });
});

describe('9. fingerprint', () => {
  const html = (p2 = 'Second paragraph of text.') => `<body><main><p>First paragraph of text.</p><p>${p2}</p></main></body>`;

  it('is equal for two extractions of an unchanged document', () => {
    const p = page(html());
    expect(read(p).fingerprint).toBe(read(p).fingerprint);
    expect(read(page(html())).fingerprint).toBe(read(page(html())).fingerprint);
    expect(read(p).fingerprint).toBe(fingerprintOf(read(p).nodes));
  });

  it('differs after one character of one node changes', () => {
    const p = page(html());
    const before = read(p).fingerprint;
    const node = read(p).nodes[1];
    node.data = node.data.replace('Second', 'Secund');
    expect(read(p).fingerprint).not.toBe(before);
  });

  it('differs when a paragraph is added or removed', () => {
    const p = page(html());
    const before = read(p).fingerprint;
    const main = p.doc.querySelector('main')!;
    const extra = p.doc.createElement('p');
    extra.textContent = 'A third paragraph.';
    main.appendChild(extra);
    const added = read(p).fingerprint;
    expect(added).not.toBe(before);
    extra.remove();
    expect(read(p).fingerprint).toBe(before);
    main.querySelector('p')!.remove();
    expect(read(p).fingerprint).not.toBe(before);
  });

  it('differs when the same letters are split across nodes differently', () => {
    const a = read(page('<body><main><p>abc</p><p>def</p></main></body>'));
    const b = read(page('<body><main><p>abcd</p><p>ef</p></main></body>'));
    const c = read(page('<body><main><p>abcdef</p></main></body>'));
    expect(texts(a).join('')).toBe(texts(b).join(''));
    expect(new Set([a.fingerprint, b.fingerprint, c.fingerprint]).size).toBe(3);
  });

  it('differs for the same letters in another order, and for an empty list versus a text', () => {
    const a = read(page('<body><main><p>one</p><p>two</p></main></body>'));
    const b = read(page('<body><main><p>two</p><p>one</p></main></body>'));
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(fingerprintOf([])).not.toBe(a.fingerprint);
  });

  it('a single-page reader that replaces its chapter in place (same URL) changes the fingerprint', () => {
    const p = page('<body><main class="page-content"><div class="passage-content"><h3>Chapter 1</h3><p>Text of the first chapter.</p></div></main></body>', 'https://www.biblegateway.com/passage/?search=John+3');
    const before = read(p);
    const url = p.doc.defaultView!.location.href;
    p.doc.querySelector('.passage-content')!.replaceChildren(
      Object.assign(p.doc.createElement('h3'), { textContent: 'Chapter 2' }),
      Object.assign(p.doc.createElement('p'), { textContent: 'Text of the second chapter.' }),
    );
    expect(p.doc.defaultView!.location.href).toBe(url);
    const after = read(p);
    expect(texts(after)).toEqual(['Chapter 2', 'Text of the second chapter.']);
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });
});

describe('10. the real site fixtures', () => {
  it('biblegateway-passage.html: the passage, not the chrome, notes, markers or copyright', () => {
    const f = fixture('biblegateway-passage.html');
    const e = read(f);
    expect(e.scope.kind).toBe('reader');
    expect(texts(e)).toEqual([
      'The lamp',
      'A small lamp stood on the table, and its light reached the far wall.',
      'Nobody had asked for the lamp, yet everyone was glad of it.',
      'Later they carried it outside.',
    ]);
    expect(e.scope.title).toBe('John 3:16-17 NIV - A small lamp stood on the table - Bible Gateway (fixture)');
    expect(e.scope.frames).toBe(0);
    const all = texts(e).join(' ');
    for (const chrome of ['Menu', 'Search', 'A note written', 'Fixture text', 'New Test Version', '(A)', '[a]']) expect(all).not.toContain(chrome);
  });

  it('youversion-chapter.html: both verses (content spans), not the labels, notes, header or action bar', () => {
    const f = fixture('youversion-chapter.html');
    const e = read(f);
    expect(texts(e)).toEqual([
      'The traveller stopped at the gate and listened to the wind.',
      'Nothing moved in the field, so she walked on slowly.',
    ]);
    expect(e.scope.kind).toBe('page'); // no site container, no <main>/<article>
  });

  it('libroteka-reader.html: the chapter article, not the chapter navigation; a replaced chapter changes the fingerprint', () => {
    const f = fixture('libroteka-reader.html');
    const e = read(f);
    expect(e.scope.kind).toBe('main');
    expect(texts(e)).toEqual([
      'Kapitulli 1',
      'Unë po lexoj një libër të bukur në shtëpinë time. Çdo mëngjes pi një çaj.',
      'Pastaj shkoj në punë.',
    ]);
    const tpl = f.doc.getElementById('chapter-2') as HTMLTemplateElement;
    f.doc.getElementById('text')!.replaceChildren(tpl.content.cloneNode(true));
    const e2 = read(f);
    expect(texts(e2)).toEqual(['Kapitulli 2', 'Nëna është në kuzhinë. Ajo përgatit mëngjesin.']);
    expect(e2.fingerprint).not.toBe(e.fingerprint);
  });

  it('kanah-reader.html: the chapter lives in a same-origin frame and is read from it, not the buttons', () => {
    const f = fixture('kanah-reader.html');
    if (!(f.doc.getElementById('chapter') as HTMLIFrameElement).contentDocument?.body?.querySelector('p')) throw new Error('jsdom did not give the srcdoc frame its content');
    const e = read(f);
    expect(texts(e)).toEqual(['Unë po lexoj një libër të bukur në shtëpinë time. Çdo mëngjes pi një çaj.', 'Pastaj shkoj në punë.']);
    expect(e.scope.frames).toBe(1);
  });

  it('tolino-reader.html: German frame text is read, the toolbar is not', () => {
    const f = fixture('tolino-reader.html');
    if (!(f.doc.getElementById('reader') as HTMLIFrameElement).contentDocument?.body?.querySelector('p')) throw new Error('jsdom did not give the srcdoc frame its content');
    const e = read(f, { languageId: 'de' });
    expect(texts(e)).toEqual([
      'Der Hund läuft durch den Garten. Am Abend lesen wir ein Buch.',
      'Die Straßenbahn kommt pünktlich. Morgen fahren wir nach Österreich.',
    ]);
    expect(e.scope.frames).toBe(1);
  });

  it('the refusing fixtures (pratilipi-hindi, readawrite-chapter) are refused and read nothing', () => {
    for (const name of ['pratilipi-hindi.html', 'readawrite-chapter.html']) {
      const f = fixture(name);
      const r = extract(f, { languageId: name.startsWith('pratilipi') ? 'hi' : 'th' });
      expect(r.ok, name).toBe(false);
      expect(r, name).toMatchObject({ code: 'unsupported-page' });
      expect('nodes' in r, name).toBe(false);
    }
  });
});
