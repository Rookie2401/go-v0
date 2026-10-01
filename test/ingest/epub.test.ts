import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { EpubError, epubToDocuments, importDocuments, readEpub, validateBatch } from '../../src/ingest';
import { clock, registry } from './helpers';
import { makeEpub, makeZip, xhtml } from './zip';

const rejects = async (p: Promise<unknown>): Promise<EpubError> => {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(EpubError); return e as EpubError; }
  throw new Error('expected an EpubError');
};

const BOOK = {
  title: 'El libro de prueba', author: 'Ana Autora', language: 'es',
  pages: [
    { id: 'p2', href: 'c2.xhtml', html: xhtml('<h1>Cap&#237;tulo II</h1><p>Segunda p&aacute;gina, con ni&ntilde;os &amp; ni&#xF1;as.</p>') },
    {
      id: 'p1', href: 'c1.xhtml', method: 0 as const,
      html: xhtml(
        '<h1>Cap&iacute;tulo I</h1><p>Primer p&aacute;rrafo,   con   espacios\n y un salto.</p><p>Segundo p&aacute;rrafo<br/>con salto de l&iacute;nea.</p>' +
        '<script>var oculto = 1;</script><style>p { color: red }</style><nav><a>MENU OCULTO</a></nav><span epub:type="pagebreak" title="12">12</span><p>Fin&nbsp;del&nbsp;cap&iacute;tulo &desconocido;.</p>',
        '<title>CABECERA OCULTA</title>'),
    },
  ],
  spine: ['p1', 'p2'], // the reading order is not the manifest order
};

describe('readEpub: the happy path', () => {
  it('follows the spine, makes paragraphs of blocks, keeps headings as their own lines, drops what is not the book', async () => {
    const book = await readEpub(makeEpub(BOOK));
    expect(book).toMatchObject({ title: 'El libro de prueba', author: 'Ana Autora', language: 'es' });
    expect(book.chapters.map((c) => c.title)).toEqual(['Capítulo I', 'Capítulo II']);
    expect(book.chapters[0].text.split('\n')).toEqual([
      'Capítulo I',
      'Primer párrafo, con espacios y un salto.',
      'Segundo párrafo',
      'con salto de línea.',
      'Fin del capítulo &desconocido;.',
    ]);
    expect(book.chapters[1].text).toBe('Capítulo II\nSegunda página, con niños & niñas.');
    const all = book.chapters.map((c) => c.text).join('\n');
    for (const hidden of ['oculto', 'OCULTA', 'MENU', 'NAVIGATION', 'color']) expect(all).not.toContain(hidden);
    expect(all).not.toMatch(/\b12\b/); // the page-break marker is not text
    expect(book.notes.join(' ')).toMatch(/2 sections of text/);
    expect(book.notes.join(' ')).toMatch(/&desconocido;/); // an entity it does not know is kept as written, and said
  });

  it('reads stored and deflated entries alike, and numeric / named entities', async () => {
    const book = await readEpub(makeEpub({ pages: [{ id: 'a', href: 'a.xhtml', html: xhtml('<p>&#161;Hola! &#x00BF;Qu&eacute; tal? &laquo;s&iacute;&raquo; &mdash; &hellip;</p>'), method: 8 }, { id: 'b', href: 'b.xhtml', html: xhtml('<p>Texto guardado</p>'), method: 0 }] }));
    expect(book.chapters.map((c) => c.text)).toEqual(['¡Hola! ¿Qué tal? «sí» — …', 'Texto guardado']);
    expect(book.title).toBeUndefined();
  });

  it('a page without text (a cover) is skipped, and said; a missing page too', async () => {
    const book = await readEpub(makeEpub({
      pages: [{ id: 'cover', href: 'cover.xhtml', html: xhtml('<img src="c.jpg"/>') }, { id: 'a', href: 'a.xhtml', html: xhtml('<p>Texto</p>') }],
      manifestExtra: '<item id="ghost" href="ghost.xhtml" media-type="application/xhtml+xml"/><item id="pic" href="c.jpg" media-type="image/jpeg"/>',
      spine: ['cover', 'a', 'ghost', 'pic'],
    }));
    expect(book.chapters.map((c) => c.text)).toEqual(['Texto']);
    const notes = book.notes.join(' ');
    expect(notes).toMatch(/1 page has no text/);
    expect(notes).toMatch(/1 page listed in the book could not be found/);
    expect(notes).toMatch(/2 items in the reading order are not text/); // the picture and the navigation document
  });
});

describe('readEpub: refusals', () => {
  const protectedBy = (extra: Array<{ name: string; data: string; flags?: number }>) => makeEpub({ ...BOOK, extra });

  it('a protected file is refused with a plain message and nothing is read: encryption.xml listing a content document', async () => {
    const enc = '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><CipherData><CipherReference URI="OEBPS/c1.xhtml"/></CipherData></EncryptedData></encryption>';
    const e = await rejects(readEpub(protectedBy([{ name: 'META-INF/encryption.xml', data: enc }])));
    expect(e.code).toBe('encrypted');
    expect(e.message).toMatch(/protected/);
    expect(e.message).toMatch(/does not remove protection/);
  });

  it('rights.xml (and an encrypted zip entry) also mean protection', async () => {
    expect((await rejects(readEpub(protectedBy([{ name: 'META-INF/rights.xml', data: '<rights/>' }])))).code).toBe('encrypted');
    expect((await rejects(readEpub(protectedBy([{ name: 'META-INF/sinf.xml', data: '<sinf/>' }])))).code).toBe('encrypted');
    const flagged = makeEpub({ ...BOOK, pages: [{ id: 'a', href: 'a.xhtml', html: xhtml('<p>x</p>') }] });
    // set the "encrypted" bit of the first XHTML entry in the central directory
    const patched = makeZip([
      { name: 'META-INF/container.xml', data: '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>' },
      { name: 'OEBPS/content.opf', data: '<package><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>' },
      { name: 'OEBPS/a.xhtml', data: xhtml('<p>x</p>'), flags: 1 },
    ]);
    expect(flagged.length).toBeGreaterThan(0);
    expect((await rejects(readEpub(patched))).code).toBe('encrypted');
  });

  it('font obfuscation alone is not protection: the book is read', async () => {
    const enc = '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="OEBPS/fonts/f.otf"/></CipherData></EncryptedData></encryption>';
    const book = await readEpub(protectedBy([{ name: 'META-INF/encryption.xml', data: enc }, { name: 'OEBPS/fonts/f.otf', data: 'not really a font' }]));
    expect(book.chapters).toHaveLength(2);
  });

  it('epubToDocuments refuses a protected file too (no documents)', async () => {
    const e = await rejects(epubToDocuments(protectedBy([{ name: 'META-INF/rights.xml', data: '<rights/>' }]), { lang: 'es' }));
    expect(e.code).toBe('encrypted');
  });

  it('not an EPUB: random bytes, an empty file, a zip without container.xml', async () => {
    expect((await rejects(readEpub(new Uint8Array([1, 2, 3, 4, 5])))).code).toBe('not-epub');
    expect((await rejects(readEpub(new Uint8Array(0)))).code).toBe('not-epub');
    const e = await rejects(readEpub(makeZip([{ name: 'readme.txt', data: 'hola' }])));
    expect(e.code).toBe('not-epub');
    expect(e.message).toMatch(/container\.xml/);
  });

  it('damaged: a wrong checksum, a corrupt deflate stream, a file bigger than it says, an empty spine, a missing package file', async () => {
    const container = { name: 'META-INF/container.xml', data: '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>' };
    const opf = { name: 'OEBPS/content.opf', data: '<package><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>' };
    const page = (over: object) => ({ name: 'OEBPS/a.xhtml', data: xhtml('<p>texto</p>'), ...over });

    expect((await rejects(readEpub(makeZip([container, opf, page({ badCrc: true })])))).code).toBe('damaged');
    expect((await rejects(readEpub(makeZip([container, opf, page({ declaredSize: 5 })])))).code).toBe('damaged'); // inflates past its declared size

    const good = makeZip([container, opf, page({})]);
    // corrupt the deflate stream of the page: flip bytes in its body (it is the last local entry, just before the central directory)
    const bad = good.slice();
    const marker = new TextEncoder().encode('OEBPS/a.xhtml');
    let at = -1;
    for (let i = 0; i + marker.length < bad.length; i++) if (marker.every((b, k) => bad[i + k] === b)) { at = i; break; }
    for (let k = 0; k < 6; k++) bad[at + marker.length + k] ^= 0xFF;
    expect((await rejects(readEpub(bad))).code).toBe('damaged');

    expect((await rejects(readEpub(makeZip([container, { name: 'OEBPS/content.opf', data: '<package><manifest/><spine/></package>' }])))).code).toBe('damaged');
    expect((await rejects(readEpub(makeZip([container])))).code).toBe('damaged');
  });

  it('a book with no text (page images only) is unsupported, said plainly', async () => {
    const e = await rejects(readEpub(makeEpub({ pages: [{ id: 'a', href: 'a.xhtml', html: xhtml('<img src="x.jpg"/>') }] })));
    expect(e.code).toBe('unsupported');
    expect(e.message).toMatch(/no readable text/);
  });
});

describe('epubToDocuments: personal-copy documents through the plain-text path', () => {
  it('chapters by the headings in the text; one paragraph per line; the exact text of the book', async () => {
    const r = await epubToDocuments(makeEpub(BOOK), { lang: 'es', copyNote: 'my epub' });
    expect(r.documents.map((d) => d.id)).toEqual(['el-libro-de-prueba-ch01', 'el-libro-de-prueba-ch02']);
    expect(r.documents.map((d) => d.title)).toEqual(['El libro de prueba — Capítulo I', 'El libro de prueba — Capítulo II']);
    const first = r.documents[0].sections[0];
    expect(first.title).toBe('Capítulo I');
    expect(first.paragraphs.map((p) => (p as { text: string }).text)).toEqual([
      'Primer párrafo, con espacios y un salto.', 'Segundo párrafo', 'con salto de línea.', 'Fin del capítulo &desconocido;.',
    ]);
    expect(r.documents[0].source).toMatchObject({ rights: 'personal-copy', authorship: 'published', author: 'Ana Autora', title: 'El libro de prueba' });
    expect(r.documents[0].source.provenance).toMatch(/my epub/);
    expect(r.epub).toEqual({ title: 'El libro de prueba', author: 'Ana Autora', language: 'es', sections: 2 });
    expect(r.documents[0].quality?.checkedWith).toBe('quality@1');
    expect(r.notes.join(' ')).toMatch(/2 chapters found/);

    const batch = validateBatch(r.documents, { registry });
    expect(batch.ok).toBe(true);
    const store = createMemoryStore();
    const report = await importDocuments(store, registry, r.documents, { clock });
    expect(report.ok).toBe(true);
    expect(report.documents.every((d) => d.published)).toBe(true); // a personal copy is readable at once
    expect((await store.texts.all()).every((t) => t.personalCopy === true && t.quality !== undefined)).toBe(true);
  });

  it('without headings in the text, the book\'s own sections that start with a heading are the chapters', async () => {
    const r = await epubToDocuments(makeEpub({
      title: 'Cuentos', language: 'es',
      pages: [
        { id: 'a', href: 'a.xhtml', html: xhtml('<h2>El zorro</h2><p>Había una vez un zorro.</p>') },
        { id: 'b', href: 'b.xhtml', html: xhtml('<h2>La luna</h2><p>La luna salió tarde.</p>') },
      ],
    }), { lang: 'es' });
    expect(r.documents.map((d) => d.sections[0].title)).toEqual(['El zorro', 'La luna']);
    expect(r.notes.join(' ')).toMatch(/the book's own 2 sections/);
  });

  it('says when the book\'s language is not the one asked for, and needs a title when the book has none', async () => {
    const r = await epubToDocuments(makeEpub({ title: 'A Book', language: 'en', pages: [{ id: 'a', href: 'a.xhtml', html: xhtml('<p>Some text here.</p>') }] }), { lang: 'es' });
    expect(r.notes.join(' ')).toMatch(/language is "en", not "es"/);
    const e = await rejects(epubToDocuments(makeEpub({ pages: [{ id: 'a', href: 'a.xhtml', html: xhtml('<p>Texto.</p>') }] }), { lang: 'es' }));
    expect(e.message).toMatch(/title/);
    expect((await epubToDocuments(makeEpub({ pages: [{ id: 'a', href: 'a.xhtml', html: xhtml('<p>Texto.</p>') }] }), { lang: 'es', title: 'Mi título' })).documents[0].title).toBe('Mi título');
  });
});
