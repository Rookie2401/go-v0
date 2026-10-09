// @vitest-environment jsdom
/**
 * Per-fixture behaviour of the registry's site adapters (packages/golearn-extension/harness/sites/*.html): the surface
 * (exact Unicode, NFC, grapheme-snapped), the context or the declared refusal, the source reference, the language
 * evidence, the popup anchor, chapter replacement, reader chrome and error recovery. Sentences are owner-authored test text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describePage, parseScriptureUrl, registryEntry, type SiteAdapter } from '../../packages/golearn-extension/src/adapters';
import { validateCapabilities } from '../../packages/golearn-extension/src/contract/readerCapabilities';
import type { ReaderContext } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import { sqAdapter } from '../../src/adapters/sq';
import { thAdapter } from '../../src/adapters/th';
import { flush, stubLayout, textNodes } from './dom';
import { fixtureNames, fixtureText, focusFrame, mount, ok, selectIn, selectTop, setUrl, siteAdapter, unmount } from './sites.support';

let restore: () => void;
let adapter: SiteAdapter | undefined;
beforeEach(() => { restore = stubLayout(); });
afterEach(() => { adapter?.dispose(); adapter = undefined; unmount(); restore(); vi.restoreAllMocks(); });

const ctxOf = (a: SiteAdapter, r: Range, o: Parameters<SiteAdapter['context']>[1] = {}): ReaderContext => a.context(r, o);
const byId = (id: string, doc: Document = document): HTMLElement => doc.getElementById(id)!;

describe('the fixtures are owner-authored and honest', () => {
  it('the nine fixtures exist and each says it is test-authored', () => {
    expect(fixtureNames()).toEqual([
      'biblegateway-passage.html', 'kanah-reader.html', 'libroteka-reader.html', 'playbooks-reader.html', 'pratilipi-hindi.html',
      'readawrite-chapter.html', 'tolino-reader.html', 'vivlio-reader.html', 'youversion-chapter.html',
    ]);
    for (const f of fixtureNames()) expect(fixtureText(f), f).toMatch(/Owner-authored test fixture/);
  });

  it('the readAwrite fixture reproduces the site\'s copy protection (user-select: none, context menu blocked)', () => {
    const t = fixtureText('readawrite-chapter.html');
    expect(t).toMatch(/user-select:\s*none/);
    expect(t).toMatch(/oncontextmenu="return false"/);
  });
});

describe('BibleGateway-like passage', () => {
  const setup = (): { p: HTMLElement } => {
    mount('biblegateway-passage.html');
    adapter = siteAdapter('biblegateway');
    return { p: byId('p1') };
  };

  it('is chosen for its host; the selection is the exact word, NFC; the sentence drops every sup marker and the verse numbers', () => {
    const { p } = setup();
    expect(adapter!.matches(describePage(document))).toBe(true);
    selectTop(p, 'lamp');
    const s = ok(adapter!.selection());
    expect(s.surface).toBe('lamp');
    expect(s.surface).toBe(s.surface.normalize('NFC'));
    const c = ctxOf(adapter!, s.range, { languageId: 'en' });
    expect(c.kind).toBe('sentence');
    expect(c.sentence).toBe('A small lamp stood on the table, and its light reached the far wall.');
    expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('lamp');
    expect(c.sentence).not.toMatch(/\(A\)|\[a\]|16|17/);
    expect(adapter!.capabilities().sentenceContext).toBe('full');
    expect(validateCapabilities(adapter!.capabilities())).toEqual([]);
  });

  it('the second verse is cut on its own; the footnote marker between sentences does not join them', () => {
    const { p } = setup();
    selectTop(p, 'carried');
    const s = ok(adapter!.selection());
    const c = ctxOf(adapter!, s.range, { languageId: 'en' });
    expect(c.sentence).toBe('Later they carried it outside.');
    selectTop(p, 'glad');
    const c2 = ctxOf(adapter!, ok(adapter!.selection()).range, { languageId: 'en' });
    expect(c2.sentence).toBe('Nobody had asked for the lamp, yet everyone was glad of it.');
  });

  it('the Scripture reference comes from the URL and the verse-number marker, exactly, and carries no text', () => {
    const { p } = setup();
    selectTop(p, 'lamp');
    ok(adapter!.selection());
    // URL and verse marker agree: confidence 0.9; the address is the passage address only; the restrictions are the registry entry's
    const BG = { ...registryEntry('biblegateway')!.restrictions };
    const ADDRESS = 'https://www.biblegateway.com/passage/?search=John%203%3A16-17&version=NIV';
    expect(adapter!.sourceRef()).toEqual({ kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, languageHint: 'en', confidence: 0.9, url: ADDRESS, restrictions: BG });
    selectTop(p, 'Nobody');
    ok(adapter!.selection());
    expect(adapter!.sourceRef()).toEqual({ kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 17, languageHint: 'en', confidence: 0.9, url: ADDRESS, restrictions: BG });
    // the address names the site (its host), so the text check is on everything but the address
    const json = JSON.stringify({ ...adapter!.sourceRef(), url: undefined });
    expect(json).not.toMatch(/lamp|Nobody|small|Gateway|fixture/i);
  });

  it('the page title (which quotes a verse) is never used; a page without a reference gets a path-only web reference', () => {
    const { p } = setup();
    expect(document.title).toMatch(/small lamp/);
    setUrl('https://www.biblegateway.com/passage/');
    selectTop(p, 'lamp');
    ok(adapter!.selection());
    const ref = adapter!.sourceRef();
    expect(ref).toEqual({ kind: 'web', locator: '/passage/', restrictions: { ...registryEntry('biblegateway')!.restrictions } });
    expect(JSON.stringify(ref)).not.toMatch(/lamp/);
  });

  it('language evidence: html lang (en) plus the translation\'s language; no og:locale, a content-language meta', () => {
    const { p } = setup();
    selectTop(p, 'lamp');
    ok(adapter!.selection());
    expect(adapter!.languageEvidence()).toEqual({
      documentLanguage: { languageId: 'en', source: 'html-lang', confidence: 0.8 },
      bookLanguage: { languageId: 'en', source: 'scripture-translation', confidence: 0.85 },
    });
    document.documentElement.removeAttribute('lang');
    expect(adapter!.languageEvidence().documentLanguage).toMatchObject({ languageId: 'en', source: 'meta' });
  });

  it('reader chrome is ignored: menus, verse numbers, markers, footnotes, the copyright line and the ad frame are refused', () => {
    setup();
    const refuse = (needle: string, root: Node = document.body): void => {
      selectIn(document, root, needle);
      expect(adapter!.selection(), needle).toMatchObject({ ok: false, reason: 'unsupported' });
    };
    refuse('Menu');
    refuse('Search');
    refuse('(A)');
    refuse('[a]');
    refuse('A note written');
    refuse('Fixture text');
    refuse('New Test Version');
    const r = adapter!.selection() as { message: string };
    expect(r.message.length).toBeGreaterThan(10);
  });

  it('a selection outside the reading area is refused with a message, and the next good selection works (error recovery)', () => {
    const { p } = setup();
    const stray = document.createElement('p');
    stray.textContent = 'A stray line outside the passage.';
    document.body.appendChild(stray);
    selectTop(stray, 'stray');
    const bad = adapter!.selection() as { ok: false; reason: string; message: string };
    expect(bad).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(bad.message).toMatch(/outside the reading area/);
    selectTop(p, 'table');
    expect(ok(adapter!.selection()).surface).toBe('table');
  });

  it('anchors the popup to the selection; a collapsed or missing selection fails cleanly', () => {
    const { p } = setup();
    expect(adapter!.selection()).toMatchObject({ ok: false, reason: 'no-selection' });
    selectTop(p, 'wall');
    const s = ok(adapter!.selection());
    const a = adapter!.anchor(s.range);
    expect(a.source).toBe('range');
    expect(a.rect.width).toBeGreaterThan(0);
    expect(a.rtl).toBe(false);
  });

  it('a selection that crosses paragraphs is not a word lookup (multi-block)', () => {
    const { p } = setup();
    const h = document.querySelector('h3')!;
    const r = document.createRange();
    const last = textNodes(p).pop()!;
    r.setStart(h.firstChild!, 0); r.setEnd(last, 3);
    const s = document.getSelection()!; s.removeAllRanges(); s.addRange(r);
    expect(adapter!.selection()).toMatchObject({ ok: false, reason: 'multi-block' });
  });
});

describe('Scripture references parsed from the URL, exactly', () => {
  const bg = (q: string) => parseScriptureUrl('biblegateway', `https://www.biblegateway.com/passage/?${q}`);
  it('BibleGateway search and version parameters', () => {
    expect(bg('search=John+3:16&version=NIV')).toEqual({ kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, languageHint: 'en' });
    expect(bg('search=John%203%3A16-17&version=NIV')).toMatchObject({ book: 'JHN', chapter: 3, verse: 16 });
    expect(bg('search=1+John+4:7-8&version=ESV')).toEqual({ kind: 'scripture', translationId: 'ESV', book: '1JN', chapter: 4, verse: 7, languageHint: 'en' });
    expect(bg('search=Psalm+23&version=NIV')).toEqual({ kind: 'scripture', translationId: 'NIV', book: 'PSA', chapter: 23, languageHint: 'en' });
    expect(bg('search=Genesis+1:1-2:3&version=KJV')).toMatchObject({ book: 'GEN', chapter: 1, verse: 1 });
    expect(bg('search=Song+of+Solomon+2:1&version=NIV')).toMatchObject({ book: 'SNG', chapter: 2, verse: 1 });
    expect(bg('search=John+3:16;+Romans+5:8&version=NIV;ESV')).toMatchObject({ book: 'JHN', translationId: 'NIV' });
    expect(bg('search=Juan+3:16&version=RVR1960')).toBeUndefined(); // an unknown book name is not guessed
    expect(bg('search=Rom+5:8&version=RVR1960')).toEqual({ kind: 'scripture', translationId: 'RVR1960', book: 'ROM', chapter: 5, verse: 8, languageHint: 'es' });
    expect(bg('search=John+3:16')).toMatchObject({ translationId: 'unknown' });
    expect(bg('search=John+3:16')).not.toHaveProperty('languageHint');
    expect(bg('version=NIV')).toBeUndefined();
    expect(bg('search=Nonsense&version=NIV')).toBeUndefined();
  });

  const yv = (p: string) => parseScriptureUrl('youversion', `https://www.bible.com${p}`);
  it('YouVersion version id, USFM reference and abbreviation', () => {
    expect(yv('/bible/111/JHN.3.16.NIV')).toEqual({ kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, languageHint: 'en' });
    expect(yv('/bible/111/JHN.3.16-17.NIV')).toMatchObject({ book: 'JHN', chapter: 3, verse: 16, translationId: 'NIV' });
    expect(yv('/bible/111/JHN.3.NIV')).toEqual({ kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, languageHint: 'en' });
    expect(yv('/bible/111/1JN.4.8')).toEqual({ kind: 'scripture', translationId: '111', book: '1JN', chapter: 4, verse: 8 });
    expect(yv('/es/bible/111/JHN.3.16.NVI')).toEqual({ kind: 'scripture', translationId: 'NVI', book: 'JHN', chapter: 3, verse: 16, languageHint: 'es' });
    expect(yv('/bible/111/XXX.3.16.NIV')).toBeUndefined();
    expect(yv('/about')).toBeUndefined();
  });
});

describe('YouVersion-like chapter', () => {
  const setup = (): HTMLElement => { mount('youversion-chapter.html'); adapter = siteAdapter('youversion'); return byId('chapter'); };

  it('the verse comes from the wrapper\'s data-usfm; the translation from the URL; the verse label and notes are skipped', () => {
    const ch = setup();
    selectTop(ch, 'traveller');
    const s = ok(adapter!.selection());
    expect(s.surface).toBe('traveller');
    expect(adapter!.sourceRef()).toEqual({ kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, languageHint: 'en', confidence: 0.9, url: 'https://www.bible.com/bible/111/JHN.3.NIV', restrictions: { ...registryEntry('youversion')!.restrictions } });
    const c = ctxOf(adapter!, s.range, { languageId: 'en' });
    expect(c.sentence).toBe('The traveller stopped at the gate and listened to the wind.');
    expect(c.sentence).not.toMatch(/16/);
    selectTop(ch, 'slowly');
    const s2 = ok(adapter!.selection());
    expect(adapter!.sourceRef()).toMatchObject({ verse: 17 });
    expect(ctxOf(adapter!, s2.range, { languageId: 'en' }).sentence).toBe('Nothing moved in the field, so she walked on slowly.');
    expect(JSON.stringify(adapter!.sourceRef())).not.toMatch(/traveller|slowly|walked/);
  });

  it('chrome is ignored: the verse labels, notes and the action bar are refused', () => {
    setup();
    for (const needle of ['16', 'a fixture note', 'Copy', 'Verse actions']) {
      try { selectIn(document, document.body, needle); } catch { continue; }
      expect(adapter!.selection(), needle).toMatchObject({ ok: false, reason: 'unsupported' });
    }
  });

  it('language evidence prefers html lang, then og:locale, then a locale carried by the path', () => {
    const ch = setup();
    selectTop(ch, 'gate');
    ok(adapter!.selection());
    expect(adapter!.languageEvidence().documentLanguage).toMatchObject({ languageId: 'en', source: 'html-lang' });
    expect(adapter!.languageEvidence().bookLanguage).toMatchObject({ languageId: 'en' });
    document.documentElement.removeAttribute('lang');
    expect(adapter!.languageEvidence().documentLanguage).toMatchObject({ languageId: 'en', source: 'og-locale' });
    document.head.querySelector('meta[property="og:locale"]')!.remove();
    expect(adapter!.languageEvidence().documentLanguage).toBeUndefined();
    setUrl('https://www.bible.com/es/bible/111/JHN.3.NIV');
    expect(adapter!.languageEvidence().documentLanguage).toEqual({ languageId: 'es', source: 'url', confidence: 0.5 });
  });
});

describe('readAwrite-like chapter: the site prevents selection, so GoLearn declines and says why', () => {
  const load = (): HTMLElement => {
    mount('readawrite-chapter.html');
    const box = byId('loaded');
    box.appendChild((byId('chapter-1') as HTMLTemplateElement).content.cloneNode(true)); // what the page\'s script does after load
    return box;
  };

  it('reports an honest unsupported failure with the site\'s reason, declares nothing, reads nothing, and never touches the page', () => {
    const box = load();
    adapter = siteAdapter('readawrite');
    const before = document.documentElement.outerHTML;
    selectTop(box, 'ตลาด');
    const r = adapter.selection() as { ok: false; reason: string; message: string };
    expect(r).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(r.message).toMatch(/user-select: none/);
    expect(r.message).toMatch(/context menu disabled/);
    expect(adapter.context(document.getSelection()!.getRangeAt(0))).toMatchObject({ kind: 'none', confidence: 0 });
    expect(adapter.sourceRef()).toBeUndefined();
    const caps = adapter.capabilities();
    expect(caps).toMatchObject({ selectedTextAvailable: false, sentenceContext: 'none', contextConfidence: 0, popupPositioning: 'none' });
    expect(caps.contentAccessRestrictions).toMatch(/does not override/);
    expect(validateCapabilities(caps)).toEqual([]);
    expect(document.documentElement.outerHTML).toBe(before); // no CSS, no script, nothing injected
  });

  describe('markup handling, checked with the entry switched on (TEST-ONLY override; the real entry stays blocked)', () => {
    const on = (): SiteAdapter => siteAdapter('readawrite', { status: 'unverified', enabled: true });

    it('mixed Thai/English is not refused: the surface is exact, the sentence is cut by the Thai pack when it is injected', () => {
      const box = load();
      adapter = on();
      selectTop(box, 'LINE');
      const s = ok(adapter.selection());
      expect(s.surface).toBe('LINE');
      const c = ctxOf(adapter, s.range, { languageId: 'th', segmenter: (t) => thAdapter.segmentSentences(t) });
      expect(c.kind).toBe('sentence');
      expect(c.sentence).toBe('เธออ่านหนังสือทุกวัน เราคุยกันทาง LINE ทุกคืน');
      expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('LINE');
      selectTop(box, 'หนังสือ');
      expect(ok(adapter.selection()).surface).toBe('หนังสือ');
      selectTop(box, 'ทาง LINE');
      expect(ok(adapter.selection()).surface).toBe('ทาง LINE');
    });

    it('paragraph spans styled display:block are blocks of their own, so the sentence is one paragraph, not the whole chapter', () => {
      const box = load();
      adapter = on();
      selectTop(box, 'ตลาด');
      const c = ctxOf(adapter, ok(adapter.selection()).range, { languageId: 'th', segmenter: (t) => thAdapter.segmentSentences(t) });
      expect(c.sentence).toBe('วันนี้อากาศดีมาก ฉันไปตลาดกับเพื่อน แล้วก็กลับบ้าน');
    });

    it('a chat-style block (div.chat lines) is read line by line with the lower confidence of a non-paragraph block', () => {
      const box = load();
      adapter = on();
      selectTop(box, 'later');
      const s = ok(adapter.selection());
      const c = ctxOf(adapter, s.range, { languageId: 'th' });
      expect(c.sentence).toBe('ไปห้องสมุดค่ะ See you later');
      expect(c.confidence).toBeLessThan(0.9);
      expect(c.reason).toMatch(/<div>/);
      expect(c.sentence).not.toMatch(/สวัสดี/);
    });

    it('language evidence: the page says Thai (html lang), and the nearest lang attribute wins when there is one', () => {
      const box = load();
      adapter = on();
      selectTop(box, 'ตลาด');
      ok(adapter.selection());
      expect(adapter.languageEvidence().documentLanguage).toEqual({ languageId: 'th', source: 'html-lang', confidence: 0.8 });
      box.setAttribute('lang', 'th-TH');
      expect(adapter.languageEvidence().documentLanguage).toEqual({ languageId: 'th', source: 'element-lang', confidence: 0.9, tag: 'th-TH' });
    });

    it('dynamic chapters: the live range dies when the container is replaced, and the next chapter\'s selection works', () => {
      const box = load();
      adapter = on();
      expect(adapter.dynamicContent).toBe(true);
      selectTop(box, 'ตลาด');
      const s = ok(adapter.selection());
      expect(adapter.isRangeLive(s.range)).toBe(true);
      box.replaceChildren((byId('chapter-1') as HTMLTemplateElement).content.cloneNode(true)); // the next chapter replaces the text
      expect(adapter.isRangeLive(s.range)).toBe(false);
      const c = ctxOf(adapter, s.range);
      expect(c.kind).not.toBe('sentence'); // never a claimed sentence from a replaced page
      selectTop(box, 'หนังสือ');
      expect(ok(adapter.selection()).surface).toBe('หนังสือ');
    });
  });
});

describe('Pratilipi-like Hindi page: the entry is disabled, so the adapter refuses and says why', () => {
  const book = (): HTMLElement => { mount('pratilipi-hindi.html'); return byId('book'); };

  it('refuses the selection and the context, with the reason, and declares nothing', () => {
    const b = book();
    adapter = siteAdapter('pratilipi');
    expect(adapter.matches(describePage(document))).toBe(true);
    selectTop(b, 'किताबें');
    const r = adapter.selection() as { ok: false; reason: string; message: string };
    expect(r).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(r.message).toMatch(/switched off/);
    expect(r.message).toMatch(/terms/);
    const range = document.getSelection()!.getRangeAt(0);
    const c = adapter.context(range);
    expect(c).toMatchObject({ kind: 'none', confidence: 0 });
    expect(c.reason).toMatch(/disabled/);
    expect(adapter.sourceRef()).toBeUndefined();
    expect(adapter.capabilities()).toMatchObject({ selectedTextAvailable: false, sentenceContext: 'none' });
    expect(adapter.refuses).toBe(true);
    expect(adapter.entry).toMatchObject({ enabled: false, experimental: true, status: 'permission-required' });
  });

  describe('markup handling, checked with the entry switched on (TEST-ONLY override)', () => {
    const on = (): SiteAdapter => siteAdapter('pratilipi', { status: 'unverified', enabled: true });

    it('combining marks stay with their base: the surface is NFC, the sentence is cut at the danda, offsets locate the selection', () => {
      const b = book();
      adapter = on();
      selectTop(b, 'बाज़ार');
      const s = ok(adapter.selection());
      expect(s.surface).toBe('बाज़ार');
      expect(s.surface).toBe(s.surface.normalize('NFC'));
      const c = ctxOf(adapter, s.range, { languageId: 'hi' });
      expect(c.sentence).toBe('मैं बाज़ार जा रहा हूँ।');
      expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('बाज़ार');
      selectTop(b, 'किताबें');
      expect(ok(adapter.selection()).surface).toBe('किताबें');
    });

    it('an edge inside a letter cluster is moved outward (grapheme snap), never leaving a stray matra', () => {
      const b = book();
      adapter = on();
      const t = b.querySelector('#h2')!.firstChild as Text;
      const at = t.data.indexOf('किताबें');
      const r = document.createRange();
      r.setStart(t, at + 1); // between क and ि
      r.setEnd(t, at + 4);   // inside the next cluster
      const sel = document.getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const s = ok(adapter.selection());
      expect(s.snapped).toBe(true);
      expect(s.surface.startsWith('कि')).toBe(true);
      expect([...new Intl.Segmenter('hi', { granularity: 'grapheme' }).segment(s.surface)].map((x) => x.segment).join('')).toBe(s.surface);
      expect(s.surface).toBe(s.surface.normalize('NFC'));
    });

    it('the Hindi pack\'s own cutter can be injected', () => {
      const b = book();
      adapter = on();
      selectTop(b, 'पार्क');
      const c = ctxOf(adapter, ok(adapter.selection()).range, { languageId: 'hi', segmenter: (t) => (void t, [{ start: 0, end: 5, text: t.slice(0, 5) }, { start: 6, end: t.length, text: t.slice(6) }]) });
      expect(c.kind).toBe('sentence');
    });

    it('language evidence: the nearest lang attribute (element-lang hi)', () => {
      const b = book();
      adapter = on();
      selectTop(b, 'पार्क');
      ok(adapter.selection());
      expect(adapter.languageEvidence().documentLanguage).toEqual({ languageId: 'hi', source: 'element-lang', confidence: 0.9 });
    });

    it('the paywalled block, the login popup and the next-part link are not the reading area', () => {
      book();
      adapter = on();
      for (const needle of ['सदस्यों', 'लॉग इन', 'अगला भाग']) {
        selectIn(document, document.body, needle);
        expect(adapter.selection(), needle).toMatchObject({ ok: false, reason: 'unsupported' });
      }
    });

    it('loading the next part in place replaces the text: the old range is dead and the new text can be looked up', () => {
      const b = book();
      adapter = on();
      selectTop(b, 'पार्क');
      const s = ok(adapter.selection());
      b.innerHTML = '<p id="n1">कल हम घर जाएँगे।</p>';
      expect(adapter.isRangeLive(s.range)).toBe(false);
      selectTop(b, 'जाएँगे');
      expect(ok(adapter.selection()).surface).toBe('जाएँगे');
    });
  });
});

describe('Tolino-like and Vivlio-like readers: text in a same-origin iframe, a toolbar overlay on top', () => {
  it('Tolino: reads the focused same-origin frame; German sentence cut by the German pack; the overlay is ignored', () => {
    const { frames } = mount('tolino-reader.html');
    adapter = siteAdapter('tolino-webreader');
    const frame = frames.get('reader')!;
    const fd = frame.contentDocument!;
    focusFrame(frame);
    selectIn(fd, fd.body, 'Straßenbahn');
    const s = ok(adapter.selection());
    expect(s.surface).toBe('Straßenbahn');
    expect(s.frame).toBe('same-origin-frame');
    const c = ctxOf(adapter, s.range, { languageId: 'de', segmenter: (t) => deAdapter.segmentSentences(t) });
    expect(c.sentence).toBe('Die Straßenbahn kommt pünktlich.');
    expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('Straßenbahn');
    expect(adapter.sourceRef()).toEqual({ kind: 'web', title: 'Lesen (fixture)', locator: '/library/index.html', restrictions: { ...registryEntry('tolino-webreader')!.restrictions } });
    expect(adapter.languageEvidence().documentLanguage).toEqual({ languageId: 'de', source: 'html-lang', confidence: 0.8 });
    expect(adapter.capabilities().contextConfidence).toBeLessThanOrEqual(0.8);
    // the toolbar overlay lives in the top document and is not text to look up
    vi.restoreAllMocks();
    selectIn(document, document.body, 'Inhalt');
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('Tolino: the popup anchor is the selection\'s rect moved by the frame\'s position in the page', () => {
    const { frames } = mount('tolino-reader.html');
    adapter = siteAdapter('tolino-webreader');
    const frame = frames.get('reader')!;
    const fd = frame.contentDocument!;
    const P = (frame.contentWindow as unknown as { Range: { prototype: Record<string, unknown> } }).Range.prototype;
    P.getClientRects = () => [{ top: 10, left: 20, right: 80, bottom: 30, width: 60, height: 20 }];
    P.getBoundingClientRect = () => ({ top: 10, left: 20, right: 80, bottom: 30, width: 60, height: 20 });
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ top: 44, left: 5, right: 800, bottom: 500, width: 795, height: 456, x: 5, y: 44, toJSON() {} });
    focusFrame(frame);
    selectIn(fd, fd.body, 'Hund');
    const s = ok(adapter.selection());
    const a = adapter.anchor(s.range);
    expect(a.source).toBe('range');
    expect(a.rect).toMatchObject({ top: 54, left: 25, right: 85, bottom: 74 });
  });

  it('Vivlio: Spanish with its inverted marks; the sentence is cut by the Spanish pack', () => {
    const { frames } = mount('vivlio-reader.html');
    adapter = siteAdapter('vivlio-casadellibro');
    const frame = frames.get('book')!;
    const fd = frame.contentDocument!;
    focusFrame(frame);
    selectIn(fd, fd.body, 'favorito');
    const s = ok(adapter.selection());
    expect(s.surface).toBe('favorito');
    const c = ctxOf(adapter, s.range, { languageId: 'es', segmenter: (t) => esAdapter.segmentSentences(t) });
    expect(c.sentence).toBe('¿Dónde está mi libro favorito?');
    selectIn(fd, fd.body, '¿Dónde');
    expect(ok(adapter.selection()).surface).toBe('¿Dónde');
    expect(adapter.languageEvidence().documentLanguage).toMatchObject({ languageId: 'es' });
  });

  it('a frame is read only when the learner is working in it; the top document\'s selection is the top document\'s', () => {
    const { frames } = mount('vivlio-reader.html');
    adapter = siteAdapter('vivlio-casadellibro');
    const fd = frames.get('book')!.contentDocument!;
    selectIn(fd, fd.body, 'gato');
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'no-selection' }); // focus is on the top document
  });
});

describe('Play-Books-like reader: the text is in a cross-origin frame', () => {
  const setup = () => {
    const { frames } = mount('playbooks-reader.html');
    adapter = siteAdapter('play-books');
    const frame = frames.get('page')!;
    Object.defineProperty(frame, 'contentDocument', { get: () => null, configurable: true }); // what a cross-origin frame does
    return frame;
  };

  it('declares, before any selection, that its text is not readable; the fallback is the browser\'s selection text', () => {
    setup();
    const caps = adapter!.capabilities();
    expect(caps).toMatchObject({ selectedTextAvailable: false, sentenceContext: 'none', contextConfidence: 0 });
    expect(validateCapabilities(caps)).toEqual([]);
    expect(adapter!.entry.fallback).toBe('selection-only');
    expect(adapter!.entry.site?.frames).toBe('declare-cross-origin');
  });

  it('a selection in the frame fails with cross-origin-frame, and the declaration stays "none"', () => {
    const frame = setup();
    focusFrame(frame);
    expect(adapter!.selection()).toMatchObject({ ok: false, reason: 'cross-origin-frame' });
    expect(adapter!.capabilities()).toMatchObject({ selectedTextAvailable: false, sentenceContext: 'none' });
    expect(adapter!.context(document.createRange())).toMatchObject({ kind: 'none' });
  });

  it('a readable top-document selection is read normally once it proves readable', () => {
    setup();
    const p = document.createElement('p');
    p.textContent = 'A line in the top document.';
    document.body.appendChild(p);
    selectTop(p, 'line');
    expect(ok(adapter!.selection()).surface).toBe('line');
    expect(adapter!.capabilities().sentenceContext).toBe('full');
  });
});

describe('Kanah-like reader: the chapter is in a same-origin frame, navigation buttons are in the top document', () => {
  it('reads the focused frame (Albanian), cuts the sentence with the Albanian pack, and takes the language from the frame', () => {
    const { frames } = mount('kanah-reader.html');
    adapter = siteAdapter('kanah');
    const frame = frames.get('chapter')!;
    const fd = frame.contentDocument!;
    focusFrame(frame);
    selectIn(fd, fd.body, 'çaj');
    const s = ok(adapter.selection());
    expect(s.surface).toBe('çaj');
    const c = ctxOf(adapter, s.range, { languageId: 'sq', segmenter: (t) => sqAdapter.segmentSentences(t) });
    expect(c.sentence).toBe('Çdo mëngjes pi një çaj.');
    expect(adapter.languageEvidence().documentLanguage).toEqual({ languageId: 'sq', source: 'html-lang', confidence: 0.8 });
  });

  it('the language named in the URL is evidence when the frame declares none', () => {
    const { frames } = mount('kanah-reader.html');
    adapter = siteAdapter('kanah');
    const frame = frames.get('chapter')!;
    const fd = frame.contentDocument!;
    fd.documentElement.removeAttribute('lang');
    focusFrame(frame);
    selectIn(fd, fd.body, 'mëngjes');
    ok(adapter.selection());
    expect(adapter.languageEvidence().documentLanguage).toMatchObject({ languageId: 'sq', source: 'url', confidence: 0.5 });
  });

  it('the previous/next buttons are controls, not text; the top document\'s own selection sees nothing', () => {
    mount('kanah-reader.html');
    adapter = siteAdapter('kanah');
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'no-selection' });
    const next = byId('next');
    const r = document.createRange(); r.selectNodeContents(next);
    const sel = document.getSelection()!; sel.removeAllRanges(); sel.addRange(r);
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('the next chapter replaces the frame\'s content: the old range is dead and the new chapter can be looked up', () => {
    const { frames } = mount('kanah-reader.html');
    adapter = siteAdapter('kanah');
    const frame = frames.get('chapter')!;
    const fd = frame.contentDocument!;
    focusFrame(frame);
    selectIn(fd, fd.body, 'punë');
    const s = ok(adapter.selection());
    fd.open(); fd.write((byId('chapter-2') as HTMLTemplateElement).innerHTML); fd.close(); // what the page does on "next"
    expect(adapter.isRangeLive(s.range)).toBe(false);
    selectIn(fd, fd.body, 'kuzhinë');
    expect(ok(adapter.selection()).surface).toBe('kuzhinë');
  });
});

describe('Libroteka-like reader: an article whose chapter buttons replace the content', () => {
  it('reads the article, and the navigation buttons are ignored', () => {
    mount('libroteka-reader.html');
    adapter = siteAdapter('libroteka');
    selectTop(byId('text'), 'shtëpinë');
    const s = ok(adapter.selection());
    expect(s.surface).toBe('shtëpinë');
    const c = ctxOf(adapter, s.range, { languageId: 'sq', segmenter: (t) => sqAdapter.segmentSentences(t) });
    expect(c.sentence).toBe('Unë po lexoj një libër të bukur në shtëpinë time.');
    expect(adapter.sourceRef()).toEqual({ kind: 'web', title: 'Libri im (fixture)', locator: '/liber/fixture/0', restrictions: { ...registryEntry('libroteka')!.restrictions } });
    expect(adapter.languageEvidence().documentLanguage).toMatchObject({ languageId: 'sq', source: 'html-lang' });
    selectTop(document.body, 'Mbrapa');
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('NFD text is returned NFC and the offsets still locate the selection', () => {
    mount('libroteka-reader.html');
    adapter = siteAdapter('libroteka');
    byId('l2').textContent = 'Pastaj shkoj ne puna e re. Ajo ka shtëpi.'; // "shtëpi" with ë decomposed
    selectTop(byId('l2'), 'shtëpi');
    const s = ok(adapter.selection());
    expect(s.surface).toBe('shtëpi');
    expect(s.surface).toBe(s.surface.normalize('NFC'));
    const c = ctxOf(adapter, s.range, { languageId: 'sq', segmenter: (t) => sqAdapter.segmentSentences(t) });
    expect(c.sentence).toBe(c.sentence!.normalize('NFC'));
    expect(c.sentence!.slice(c.selStart, c.selEnd)).toBe('shtëpi');
  });

  it('chapter navigation replaces the content: the live range is gone, the layout observer reports it, and the next chapter works', async () => {
    mount('libroteka-reader.html');
    adapter = siteAdapter('libroteka');
    const cb = vi.fn();
    const off = adapter.onLayoutChange(cb);
    selectTop(byId('text'), 'punë');
    const s = ok(adapter.selection());
    byId('text').replaceChildren((byId('chapter-2') as HTMLTemplateElement).content.cloneNode(true));
    await flush(60);
    expect(cb).toHaveBeenCalled();
    expect(adapter.isRangeLive(s.range)).toBe(false);
    selectTop(byId('text'), 'kuzhinë');
    expect(ok(adapter.selection()).surface).toBe('kuzhinë');
    off();
  });

  it('too-long and empty selections fail with the contract\'s reasons, and a lookup after them still works', () => {
    mount('libroteka-reader.html');
    adapter = siteAdapter('libroteka', {}, { maxSelectionWords: 3 });
    selectTop(byId('l1'), 'Unë po lexoj një libër');
    expect(adapter.selection()).toMatchObject({ ok: false, reason: 'too-long' });
    selectTop(byId('l1'), 'libër');
    expect(ok(adapter.selection()).surface).toBe('libër');
  });
});
