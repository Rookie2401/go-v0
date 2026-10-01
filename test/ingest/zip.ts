/** A tiny zip / EPUB writer for tests (stored and deflate entries). Not a test file. */
import { deflateRawSync } from 'node:zlib';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export const crc32 = (d: Uint8Array): number => { let c = 0xFFFFFFFF; for (const b of d) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

export interface ZipFile {
  name: string;
  data: string | Uint8Array;
  method?: 0 | 8;
  /** General-purpose flags (bit 0 = "encrypted"). */
  flags?: number;
  /** Write a wrong checksum / a wrong declared size, to make a damaged file. */
  badCrc?: boolean;
  declaredSize?: number;
}

const enc = new TextEncoder();
const bytesOf = (d: string | Uint8Array) => (typeof d === 'string' ? enc.encode(d) : d);

export function makeZip(files: ZipFile[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]);
  const u32 = (v: number) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);
  const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
  for (const f of files) {
    const raw = bytesOf(f.data);
    const method = f.method ?? 8;
    const body = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const crc = f.badCrc ? (crc32(raw) ^ 0xFFFF) >>> 0 : crc32(raw);
    const name = enc.encode(f.name);
    const size = f.declaredSize ?? raw.length;
    const local = cat(u32(0x04034B50), u16(20), u16(f.flags ?? 0), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(size), u16(name.length), u16(0), name, body);
    central.push(cat(u32(0x02014B50), u16(20), u16(20), u16(f.flags ?? 0), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name));
    chunks.push(local);
    offset += local.length;
  }
  const cd = cat(...central);
  return cat(...chunks, cd, u32(0x06054B50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0));
}

export interface EpubPage { id: string; href: string; html: string; method?: 0 | 8 }

export interface EpubParts {
  title?: string;
  author?: string;
  language?: string;
  pages: EpubPage[];
  /** Spine order as ids (default: the order of `pages`). */
  spine?: string[];
  extra?: ZipFile[];
  /** Extra manifest items (e.g. an image) not in the spine. */
  manifestExtra?: string;
}

export const xhtml = (body: string, head = '<title>t</title>') =>
  `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head>${head}</head><body>${body}</body></html>`;

export function makeEpub(p: EpubParts): Uint8Array {
  const items = p.pages.map((pg) => `<item id="${pg.id}" href="${pg.href}" media-type="application/xhtml+xml"/>`).join('');
  const spine = (p.spine ?? p.pages.map((pg) => pg.id)).map((id) => `<itemref idref="${id}"/>`).join('');
  const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `${p.title ? `<dc:title>${p.title}</dc:title>` : ''}${p.author ? `<dc:creator>${p.author}</dc:creator>` : ''}<dc:language>${p.language ?? 'es'}</dc:language></metadata>` +
    `<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}${p.manifestExtra ?? ''}</manifest><spine><itemref idref="nav" linear="no"/>${spine}</spine></package>`;
  return makeZip([
    { name: 'mimetype', data: 'application/epub+zip', method: 0 },
    { name: 'META-INF/container.xml', data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: xhtml('<nav epub:type="toc"><ol><li><a href="c1.xhtml">NAVIGATION ENTRY</a></li></ol></nav>') },
    ...p.pages.map((pg) => ({ name: `OEBPS/${pg.href}`, data: pg.html, method: pg.method })),
    ...(p.extra ?? []),
  ]);
}
