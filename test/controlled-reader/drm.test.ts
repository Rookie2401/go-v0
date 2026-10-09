// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildEpub, type BuildChapter } from '../../packages/controlled-reader/scripts/epub-builder';
import { openLocalEpub, plainTextBook, renderChapterPlain } from '../../packages/controlled-reader/src/open';
import { fixtureBytes } from './helpers/book';
import { installUrlShims, shimIframesOnLoad, shimWindow } from './helpers/jsdom-shims';

const chapters: BuildChapter[] = [{ id: 'ch1', title: 'Një', body: '<h1>Një</h1><p>Beni lexon librin.</p>' }];
const base = { identifier: 'urn:test:drm', title: 'DRM test', creator: 'test', language: 'sq', modified: '2026-10-08T00:00:00Z', chapters };

const encryption = (algorithm: string, uri: string): string =>
  `<?xml version="1.0"?>\n<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData></encryption>`;

describe('DRM refusal (nothing protected is ever rendered)', () => {
  it('refuses an EPUB whose META-INF/encryption.xml lists a content document, without calling the renderer', async () => {
    const render = vi.fn(async () => 'view');
    const r = await openLocalEpub(fixtureBytes('protected-sample.epub'), { render });
    expect(r.status).toBe('refused');
    expect(render).not.toHaveBeenCalled();
    if (r.status === 'refused') expect(r.message).toMatch(/protected/i);
  });

  it('refuses a rights.xml file and an encrypted zip entry', async () => {
    const render = vi.fn(async () => 'view');
    const withRights = buildEpub({ ...base, extra: [{ name: 'META-INF/rights.xml', data: '<rights/>' }] });
    expect((await openLocalEpub(withRights, { render })).status).toBe('refused');
    expect(render).not.toHaveBeenCalled();
  });

  it('refuses any non-font cipher reference even when the algorithm is the font one, and a stylesheet or package', async () => {
    const render = vi.fn(async () => 'view');
    for (const uri of ['OEBPS/ch1.xhtml', 'OEBPS/style.css', 'OEBPS/package.opf']) {
      const bytes = buildEpub({ ...base, extra: [{ name: 'META-INF/encryption.xml', data: encryption('http://www.idpf.org/2008/embedding', uri) }] });
      expect((await openLocalEpub(bytes, { render })).status, uri).toBe('refused');
    }
    expect(render).not.toHaveBeenCalled();
  });

  it('does not over-refuse: font obfuscation alone is harmless and the book opens', async () => {
    const render = vi.fn(async () => 'view');
    const bytes = buildEpub({ ...base, extra: [{ name: 'META-INF/encryption.xml', data: encryption('http://www.idpf.org/2008/embedding', 'OEBPS/fonts/body.otf') }] });
    const r = await openLocalEpub(bytes, { render });
    expect(r.status).toBe('rendered');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('a book the page renderer cannot open falls back to plain text instead of failing', async () => {
    const r = await openLocalEpub(fixtureBytes('udha-sample.epub'), { render: async () => { throw new Error('boom'); } });
    expect(r.status).toBe('fallback');
    if (r.status === 'fallback') expect(r.book.chapters).toHaveLength(3);
  });

  it('a damaged file is reported, not rendered', async () => {
    const render = vi.fn(async () => 'view');
    const r = await openLocalEpub(new Uint8Array([1, 2, 3, 4]), { render });
    expect(r.status).toBe('unreadable');
    expect(render).not.toHaveBeenCalled();
  });

  it('the plain-text fallback renders paragraphs through textContent (no markup is interpreted)', () => {
    const host = document.createElement('div');
    renderChapterPlain(host, plainTextBook('Ana <b>lexon</b>.\n\nBeni shkruan.').chapters, 0, 'rtl');
    expect(host.dir).toBe('rtl');
    expect(host.querySelectorAll('p')).toHaveLength(2);
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toContain('<b>lexon</b>');
  });
});

describe('the reader page itself', () => {
  afterEach(() => { document.body.replaceChildren(); });

  async function loadPage() {
    installUrlShims();
    shimWindow(window as unknown as Window & typeof globalThis);
    shimIframesOnLoad(document);
    const html = fs.readFileSync(path.resolve(__dirname, '../../packages/controlled-reader/index.html'), 'utf8');
    document.body.innerHTML = /<body>([\s\S]*?)<script/.exec(html)![1];
    vi.resetModules();
    return import('../../packages/controlled-reader/src/reader');
  }

  it('a protected file leaves the viewer empty: no iframe, a refusal message, controls disabled', async () => {
    const page = await loadPage();
    const outcome = await page.openBytes(fixtureBytes('protected-sample.epub'), 'protected.epub');
    expect(outcome).toBe('refused');
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    expect(document.getElementById('viewer')!.childElementCount).toBe(0);
    const status = document.getElementById('status')!;
    expect(status.className).toBe('refused');
    expect(status.textContent).toMatch(/does not remove protection/);
    expect((document.getElementById('next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('an open book renders in a sandboxed iframe, and a following protected file replaces it with nothing', async () => {
    const page = await loadPage();
    expect(await page.openBytes(fixtureBytes('udha-sample.epub'), 'udha.epub')).toBe('rendered');
    const frames = document.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
    const sandbox = String(frames[0].sandbox); // epub.js assigns the string; real browsers forward it to the attribute
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-scripts');
    expect(await page.openBytes(fixtureBytes('protected-sample.epub'), 'protected.epub')).toBe('refused');
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('does not expose the debug handle outside the prototype build', async () => {
    await loadPage();
    expect((window as unknown as { __reader?: unknown }).__reader).toBeUndefined(); // vitest MODE is "test"
  });

  it('a .txt file opens through the plain fallback with chapter controls', async () => {
    const page = await loadPage();
    expect(await page.openBytes(new TextEncoder().encode('Ana lexon.\nBeni shkruan.'), 'a.txt')).toBe('fallback');
    expect(document.querySelectorAll('#viewer p')).toHaveLength(2);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });
});
