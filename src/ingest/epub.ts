/**
 * EPUB reading. An EPUB is a zip of XHTML: a minimal zip reader (central directory; stored and deflate entries through
 * `DecompressionStream('deflate-raw')`, which exists in browsers and in Node), `META-INF/container.xml` → the package
 * document → the spine order → each XHTML document as plain text (block elements become paragraphs, headings stay their
 * own lines, scripts, styles and navigation are dropped, entities are decoded, page-break markers are dropped).
 *
 * A PROTECTED FILE IS REFUSED. `META-INF/encryption.xml` that lists content documents (anything but the harmless font
 * obfuscation), or a `rights.xml`, makes `readEpub` throw `EpubError('encrypted')` with a plain message. Nothing here
 * decrypts, strips or works around protection, and nothing is uploaded: the bytes are read where they are.
 */
import { plainTextToDocuments, type PlainTextOptions, type PlainTextResult } from './plaintext';

export interface EpubChapter { title?: string; text: string }

export interface EpubBook {
  title?: string;
  author?: string;
  language?: string;
  /** In reading order (the spine), each as plain text with one paragraph per line; headings kept as their own lines. */
  chapters: EpubChapter[];
  notes: string[];
}

/** Thrown for a file that cannot be read lawfully or at all; the message is shown to the learner. */
export class EpubError extends Error {
  constructor(readonly code: 'not-epub' | 'encrypted' | 'damaged' | 'unsupported', message: string) { super(message); this.name = 'EpubError'; }
}

// ───────────────────────────── zip ─────────────────────────────

interface ZipEntry { name: string; method: number; flags: number; crc: number; compressedSize: number; size: number; offset: number }

const MAX_ENTRY = 64 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (data: Uint8Array): number => { let c = 0xFFFFFFFF; for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xFFFF); i--) if (view.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
  if (eocd < 0) throw new EpubError('not-epub', 'This file is not an EPUB: it is not a zip file.');
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  let p = view.getUint32(eocd + 16, true);
  if (count === 0xFFFF || cdSize === 0xFFFFFFFF || p === 0xFFFFFFFF) throw new EpubError('unsupported', 'This EPUB uses a zip format (zip64) that Go cannot read.');
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  for (let k = 0; k < count; k++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014B50) throw new EpubError('damaged', 'This EPUB is damaged: its table of contents (the zip directory) cannot be read.');
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    if (p + 46 + nameLength > bytes.length) throw new EpubError('damaged', 'This EPUB is damaged: a file name runs past the end of the file.');
    entries.push({
      flags: view.getUint16(p + 8, true), method: view.getUint16(p + 10, true), crc: view.getUint32(p + 16, true),
      compressedSize: view.getUint32(p + 20, true), size: view.getUint32(p + 24, true), offset: view.getUint32(p + 42, true),
      name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength)),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(data as BufferSource).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel().catch(() => undefined); throw new EpubError('damaged', 'This EPUB is damaged or unsafe: a file inside it is larger than it says.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

async function readEntry(bytes: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  if (e.flags & 1) throw new EpubError('encrypted', 'This EPUB is protected (its files are encrypted). Go does not remove protection; use a copy without it.');
  if (e.size > MAX_ENTRY) throw new EpubError('unsupported', 'A file inside this EPUB is too large to read here.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (e.offset + 30 > bytes.length || view.getUint32(e.offset, true) !== 0x04034B50) throw new EpubError('damaged', `This EPUB is damaged: "${e.name}" cannot be found where the zip directory says.`);
  const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
  if (start + e.compressedSize > bytes.length) throw new EpubError('damaged', `This EPUB is damaged: "${e.name}" runs past the end of the file.`);
  const raw = bytes.subarray(start, start + e.compressedSize);
  let data: Uint8Array;
  if (e.method === 0) data = raw;
  else if (e.method === 8) {
    try { data = await inflate(raw, e.size); }
    catch (err) { if (err instanceof EpubError) throw err; throw new EpubError('damaged', `This EPUB is damaged: "${e.name}" cannot be unpacked.`); }
  } else throw new EpubError('unsupported', `This EPUB uses a compression method Go cannot read (in "${e.name}").`);
  if (data.length !== e.size || crc32(data) !== e.crc) throw new EpubError('damaged', `This EPUB is damaged: "${e.name}" does not match its checksum.`);
  return data;
}

// ───────────────────────────── xml / html helpers ─────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '­', iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', copy: '©', deg: '°', ordm: 'º', ordf: 'ª',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', agrave: 'à', egrave: 'è', ograve: 'ò', ccedil: 'ç', auml: 'ä', ouml: 'ö', szlig: 'ß', Auml: 'Ä', Ouml: 'Ö',
};

function decodeEntities(s: string, unknown?: Set<string>): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : whole;
    }
    const known = ENTITIES[body];
    if (known !== undefined) return known;
    unknown?.add(body);
    return whole;
  });
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|[\\s"'])${name.replace(/[:.]/g, '\\$&')}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2]) : undefined;
};
const tags = (xml: string, name: string): string[] => [...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
const element = (xml: string, name: string): string | undefined => {
  const m = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'i').exec(xml);
  return m ? decodeEntities(m[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() || undefined : undefined;
};
const utf8 = (data: Uint8Array): string => new TextDecoder('utf-8').decode(data).replace(/^﻿/, '');

const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
function resolvePath(base: string, href: string): string {
  const parts = `${base}${href.split('#')[0]}`.split('/');
  const out: string[] = [];
  for (const part of parts) { if (part === '..') out.pop(); else if (part !== '.' && part !== '') out.push(part); }
  return out.join('/');
}

// ───────────────────────────── XHTML → text ─────────────────────────────

const BLOCKS = new Set('address article aside blockquote body caption dd details div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main ol p pre section table tbody td tfoot th thead tr ul'.split(' '));
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const SKIP = new Set(['script', 'style', 'head', 'noscript', 'svg', 'rp', 'template']);
const HEADING = /^h[1-6]$/;

interface Converted { lines: string[]; title?: string }

function htmlToText(xhtml: string, unknown: Set<string>): Converted {
  const lines: string[] = [];
  let title: string | undefined;
  let buffer = '';
  let headingLevel = 0;
  let headingText = '';
  const flush = () => {
    const line = buffer.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, '');
    buffer = '';
    if (line !== '') lines.push(line);
  };
  let skipName = '';
  let skipDepth = 0;
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![A-Za-z][^>]*>|<(\/?)([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+|<)/g;
  for (let m = token.exec(xhtml); m; m = token.exec(xhtml)) {
    const [whole, cdata, closing, rawName, rest, text] = m;
    if (rawName !== undefined) {
      const name = rawName.toLowerCase().replace(/^.*:/, '');
      const selfClosing = /\/\s*$/.test(rest ?? '') || VOID.has(name);
      if (skipDepth > 0) {
        if (name === skipName && !selfClosing) { skipDepth += closing ? -1 : 1; }
        continue;
      }
      if (!closing) {
        const type = `${attr(rest, 'epub:type') ?? ''} ${attr(rest, 'role') ?? ''}`;
        const dropped = SKIP.has(name) || name === 'nav' || /\b(?:pagebreak|doc-pagebreak|toc)\b/.test(type) && name !== 'body' && name !== 'section';
        if (dropped && !selfClosing) { flush(); skipName = name; skipDepth = 1; continue; }
        if (name === 'br') { flush(); continue; }
        if (BLOCKS.has(name)) { flush(); if (HEADING.test(name)) { headingLevel = Number(name[1]); headingText = ''; } }
      } else if (BLOCKS.has(name)) {
        if (HEADING.test(name)) {
          const heading = buffer.replace(/[ \t\r\n\f]+/g, ' ').trim();
          if (heading && title === undefined && headingLevel <= 3) title = heading;
          headingLevel = 0; headingText = '';
        }
        flush();
      }
      continue;
    }
    if (skipDepth > 0 || whole.startsWith('<!--') || whole.startsWith('<?') || whole.startsWith('<!') && cdata === undefined) continue;
    const t = cdata !== undefined ? cdata : text === '<' ? '<' : decodeEntities(text, unknown);
    buffer += t;
    headingText += t;
  }
  flush();
  return { lines, title };
}

/** Convert one official HTML/XHTML book member with the same block/entity rules used by EPUB ingestion. */
export function htmlToPlainText(xhtml: string): string {
  return htmlToText(xhtml, new Set<string>()).lines.join('\n');
}

// ───────────────────────────── the book ─────────────────────────────

const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
const CONTENT_URI = /\.(?:x?html?|xml|ncx|opf|css|svg)$/i;

/** Is anything in META-INF/encryption.xml more than the harmless obfuscation of embedded fonts? */
function protectedByEncryption(xml: string): boolean {
  const blocks = [...xml.matchAll(/<(?:[\w.-]+:)?EncryptedData\b[\s\S]*?<\/(?:[\w.-]+:)?EncryptedData>/gi)].map((m) => m[0]);
  if (!blocks.length) return /Cipher/i.test(xml);
  return blocks.some((b) => {
    const algorithm = tags(b, 'EncryptionMethod').map((t) => attr(t, 'Algorithm')).find(Boolean) ?? '';
    const uri = tags(b, 'CipherReference').map((t) => attr(t, 'URI')).find(Boolean) ?? '';
    return !FONT_OBFUSCATION.includes(algorithm) || CONTENT_URI.test(uri);
  });
}

const PROTECTED = 'This EPUB is protected (it has digital rights management). Go does not remove protection; use a copy without it.';

/**
 * Read an unprotected EPUB (a zip of XHTML). A protected file (DRM: META-INF/encryption.xml naming content
 * documents, or rights.xml) is REFUSED with code 'encrypted' — protection is never removed or worked around.
 * Nothing is uploaded: the bytes are read where they are.
 */
export async function readEpub(bytes: Uint8Array): Promise<EpubBook> {
  const entries = readCentralDirectory(bytes);
  const byName = new Map<string, ZipEntry>(entries.map((e) => [e.name, e]));
  const find = (name: string): ZipEntry | undefined => byName.get(name) ?? entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
  const total = entries.reduce((n, e) => n + e.size, 0);
  if (total > MAX_TOTAL) throw new EpubError('unsupported', 'This EPUB is too large to read here.');

  const container = find('META-INF/container.xml');
  if (!container) throw new EpubError('not-epub', 'This zip file is not an EPUB: it has no META-INF/container.xml.');

  // protection first: nothing of a protected book is read
  if (find('META-INF/rights.xml') || find('META-INF/sinf.xml')) throw new EpubError('encrypted', PROTECTED);
  const encryption = find('META-INF/encryption.xml');
  if (encryption && protectedByEncryption(utf8(await readEntry(bytes, encryption)))) throw new EpubError('encrypted', PROTECTED);

  const notes: string[] = [];
  const rootfile = tags(utf8(await readEntry(bytes, container)), 'rootfile').map((t) => attr(t, 'full-path')).find(Boolean);
  if (!rootfile) throw new EpubError('damaged', 'This EPUB is damaged: container.xml does not name the book\'s package file.');
  const opfEntry = find(rootfile);
  if (!opfEntry) throw new EpubError('damaged', `This EPUB is damaged: its package file "${rootfile}" is missing.`);
  const opf = utf8(await readEntry(bytes, opfEntry));
  const base = dirname(rootfile);

  const manifest = new Map<string, { href: string; type: string; properties: string }>();
  for (const t of tags(opf, 'item')) {
    const id = attr(t, 'id');
    const href = attr(t, 'href');
    if (id && href) manifest.set(id, { href, type: attr(t, 'media-type') ?? '', properties: attr(t, 'properties') ?? '' });
  }
  const spine = tags(opf, 'itemref').map((t) => ({ idref: attr(t, 'idref'), linear: attr(t, 'linear') })).filter((s) => s.idref);
  if (!spine.length) throw new EpubError('damaged', 'This EPUB is damaged: it lists no pages to read (its spine is empty).');

  const chapters: EpubChapter[] = [];
  const unknown = new Set<string>();
  let missing = 0;
  let empty = 0;
  let skipped = 0;
  for (const s of spine) {
    const item = manifest.get(s.idref!);
    if (!item) { missing++; continue; }
    if (!/x?html|xml/i.test(item.type) || /\bnav\b/.test(item.properties)) { skipped++; continue; } // images, the navigation document
    const entry = find(decodeURIComponent(resolvePath(base, item.href)));
    if (!entry) { missing++; continue; }
    const { lines, title } = htmlToText(utf8(await readEntry(bytes, entry)), unknown);
    if (!lines.length) { empty++; continue; }
    chapters.push({ ...(title ? { title } : {}), text: lines.join('\n') });
  }
  if (missing) notes.push(`${missing} page${missing === 1 ? '' : 's'} listed in the book could not be found in the file and ${missing === 1 ? 'was' : 'were'} skipped.`);
  if (empty) notes.push(`${empty} page${empty === 1 ? ' has' : 's have'} no text (covers or pictures) and ${empty === 1 ? 'was' : 'were'} skipped.`);
  if (skipped) notes.push(`${skipped} item${skipped === 1 ? '' : 's'} in the reading order ${skipped === 1 ? 'is' : 'are'} not text (pictures, navigation) and ${skipped === 1 ? 'was' : 'were'} skipped.`);
  if (unknown.size) notes.push(`Unknown character names were left as written: ${[...unknown].slice(0, 5).map((n) => `&${n};`).join(' ')}.`);
  if (!chapters.length) throw new EpubError('unsupported', 'This EPUB has no readable text (it may be made of page images).');
  notes.push(`${chapters.length} section${chapters.length === 1 ? '' : 's'} of text read in the book's own order.`);

  return { title: element(opf, 'title'), author: element(opf, 'creator'), language: element(opf, 'language'), chapters, notes };
}

// ───────────────────────────── EPUB → documents ─────────────────────────────

export interface EpubDocumentsResult extends PlainTextResult {
  /** What the file says about itself. */
  epub: { title?: string; author?: string; language?: string; sections: number };
}

/**
 * An unprotected EPUB → personal-copy documents, through the same path as plain text (`plainTextToDocuments`): one
 * paragraph per line of the book's text, chapters by headings found in the text, or — when none are found — by the
 * book's own sections that start with a heading. A protected file is refused (`EpubError('encrypted')`).
 */
export async function epubToDocuments(bytes: Uint8Array, opts: PlainTextOptions): Promise<EpubDocumentsResult> {
  const book = await readEpub(bytes);
  const title = opts.work?.title ?? opts.title ?? book.title;
  if (!title) throw new EpubError('unsupported', 'This EPUB does not give its title: say which book it is.');

  const lines: string[] = [];
  const sectionStarts: number[] = []; // 1-based line numbers of sections that begin with their own heading
  for (const ch of book.chapters) {
    const own = ch.text.split('\n');
    if (ch.title && own[0] === ch.title) sectionStarts.push(lines.length + 1);
    lines.push(...own);
  }
  const text = lines.join('\n');
  const common: PlainTextOptions = { ...opts, title: opts.work ? opts.title : title, author: opts.author ?? book.author, paragraphs: 'lines', unwrap: false, sourceKind: 'epub' };

  let result = plainTextToDocuments(text, common);
  const bySections = !opts.headings && (opts.chapters ?? 'auto') === 'auto' && result.headings.length < 2 && sectionStarts.length >= 2;
  if (bySections) result = plainTextToDocuments(text, { ...common, headings: sectionStarts });

  const notes = [...book.notes];
  if (bySections) notes.push(`No chapter headings such as "Capítulo I" were found in the text, so the book's own ${sectionStarts.length} sections that begin with a heading are the chapters.`);
  if (book.language && !book.language.toLowerCase().startsWith(opts.lang)) notes.push(`The book says its language is "${book.language}", not "${opts.lang}". Check that this is the right book.`);
  return { ...result, notes: [...notes, ...result.notes], epub: { title: book.title, author: book.author, language: book.language, sections: book.chapters.length } };
}
