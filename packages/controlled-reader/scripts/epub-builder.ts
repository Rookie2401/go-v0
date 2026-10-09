/**
 * Builds a minimal valid EPUB 3 (mimetype stored first, container.xml, package.opf, nav.xhtml, one XHTML per chapter)
 * from chapter bodies. Used by make-fixture.mts and by tests (which add `extra` entries such as META-INF/encryption.xml
 * to make protected files for the refusal check). Node only.
 */
import { writeZip, type ZipInput } from './zip';

export interface BuildChapter { id: string; title: string; /** inner XHTML of <body> */ body: string }
export interface BuildOptions {
  identifier: string;
  title: string;
  creator: string;
  language: string;
  /** 'rtl' sets <html dir="rtl"> in every chapter and page-progression-direction="rtl" on the spine. */
  direction?: 'ltr' | 'rtl';
  modified: string;
  chapters: BuildChapter[];
  /** Extra zip entries (e.g. META-INF/encryption.xml). */
  extra?: ZipInput[];
}

export const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = 'body { font-family: serif; line-height: 1.5; margin: 0; padding: 0; }\nh1, h2 { font-weight: 600; }\np { margin: 0 0 0.8em 0; }\nem { font-style: italic; }\n';

export function buildEpub(o: BuildOptions): Uint8Array {
  const dir = o.direction ?? 'ltr';
  const chapterXhtml = (c: BuildChapter): string =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${o.language}" xml:lang="${o.language}" dir="${dir}">\n<head>\n<meta charset="utf-8"/>\n<title>${xmlEscape(c.title)}</title>\n<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n${c.body}\n</body>\n</html>\n`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${o.language}" xml:lang="${o.language}" dir="${dir}">\n<head><meta charset="utf-8"/><title>${xmlEscape(o.title)}</title></head>\n<body>\n<nav epub:type="toc" id="toc">\n<ol>\n${o.chapters.map((c) => `<li><a href="${c.id}.xhtml">${xmlEscape(c.title)}</a></li>`).join('\n')}\n</ol>\n</nav>\n</body>\n</html>\n`;

  const opf = `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${o.language}">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:identifier id="bookid">${xmlEscape(o.identifier)}</dc:identifier>\n<dc:title>${xmlEscape(o.title)}</dc:title>\n<dc:creator>${xmlEscape(o.creator)}</dc:creator>\n<dc:language>${o.language}</dc:language>\n<meta property="dcterms:modified">${o.modified}</meta>\n</metadata>\n<manifest>\n<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n<item id="css" href="style.css" media-type="text/css"/>\n${o.chapters.map((c) => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}\n</manifest>\n<spine${dir === 'rtl' ? ' page-progression-direction="rtl"' : ''}>\n${o.chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n')}\n</spine>\n</package>\n`;

  const container = '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles>\n<rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>\n</rootfiles>\n</container>\n';

  return writeZip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/package.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: CSS },
    ...o.chapters.map((c) => ({ name: `OEBPS/${c.id}.xhtml`, data: chapterXhtml(c) })),
    ...(o.extra ?? []),
  ]);
}
