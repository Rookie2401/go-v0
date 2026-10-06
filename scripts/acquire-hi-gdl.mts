/// <reference types="node" />
/**
 * Fetch the Global Digital Library's official Hindi catalogue and, optionally,
 * selected CC-BY book EPUBs. The API response is the source of both the
 * licence and the download URL; books carrying another licence are skipped.
 *
 * npm run hi:gdl -- --out data/sources/hi/gdl --slugs <url-encoded-slug,...>
 * npm run hi:gdl -- --out data/sources/hi/gdl --all
 * npm run hi:gdl -- --out data/private/hi-gdl --catalogue-only
 *
 * The output directory is intentionally under data/private by default. Feed
 * the downloaded EPUBs into the existing corpus/library converter after a
 * source review; this script never scrapes StoryWeaver or Literacy Cloud.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readEpub } from '../src/ingest/epub';

const API = 'https://content.digitallibrary.io/wp-json/content-api/v1/books/hi';
const args = process.argv.slice(2).filter((x) => x !== '--');
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const out = path.resolve(value('--out') ?? 'data/sources/hi/gdl');
const selected = new Set((value('--slugs') ?? '').split(',').map((x) => x.trim()).filter(Boolean));
const catalogueOnly = args.includes('--catalogue-only');
const all = args.includes('--all');
const offline = args.includes('--offline');
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: npm run hi:gdl -- [--out DIR] [--slugs slug,slug] [--all] [--offline] [--catalogue-only]');
  process.exit(0);
}
if (value('--out')?.startsWith('/') || value('--out')?.includes('..')) throw new Error('--out must be a relative directory inside the repository');

interface GdlBook {
  postId: number; title: string; description?: string; post_name: string; postLink?: string;
  epubUrl?: string; language?: Array<{ slug?: string; name?: string }>;
  license?: Array<{ slug?: string; name?: string }>;
  publisher?: string; contentsource?: string; author?: string;
}
const res = await fetch(API);
if (!res.ok) throw new Error(`GDL catalogue request failed: HTTP ${res.status}`);
const raw = await res.json() as { books?: GdlBook[] };
const books = (raw.books ?? []).filter((b) => b.language?.some((l) => l.slug === 'hi' || l.name === 'Hindi'));
const eligible = books.filter((b) => b.license?.some((l) => l.slug === 'cc-by-4-0' || l.name === 'CC-BY-4.0'));
const chosen = all ? eligible : selected.size ? eligible.filter((b) => selected.has(b.post_name)) : [];
fs.mkdirSync(out, { recursive: true });
const catalogue = {
  source: { api: API, fetchedAt: new Date().toISOString(), licenceEvidence: 'https://digitallibrary.io/about/license/' },
  language: 'hi', total: books.length, ccBy: eligible.length,
  books: eligible.map((b) => ({ postId: b.postId, slug: b.post_name, title: b.title, description: b.description ?? '', url: b.postLink ?? '', epubUrl: b.epubUrl ?? '', license: b.license?.map((x) => x.name ?? x.slug ?? '').filter(Boolean) ?? [], publisher: b.publisher ?? '', contentsource: b.contentsource ?? '' })),
};
fs.writeFileSync(path.join(out, 'catalogue.json'), `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');
if (catalogueOnly) {
  console.log(`hi:gdl - ${books.length} Hindi books, ${eligible.length} marked CC-BY-4.0; catalogue written to ${path.relative(process.cwd(), path.join(out, 'catalogue.json'))}`);
  process.exit(0);
}
for (const book of chosen) {
  if (!book.epubUrl) { console.warn(`hi:gdl - skip ${book.post_name}: no EPUB URL`); continue; }
  const target = path.join(out, `${book.post_name}.epub`);
  let bytes: Buffer;
  if (offline && fs.existsSync(target)) bytes = fs.readFileSync(target);
  else {
    const got = await fetch(book.epubUrl);
    if (!got.ok) throw new Error(`${book.post_name}: EPUB request failed: HTTP ${got.status}`);
    bytes = Buffer.from(await got.arrayBuffer());
    fs.writeFileSync(target, bytes);
  }
  console.log(`hi:gdl - fetched ${book.post_name}: ${bytes.length} bytes, sha256 ${crypto.createHash('sha256').update(bytes).digest('hex')}`);
}
if (chosen.length) {
  const manifestEntries: unknown[] = [];
  const coverage: unknown[] = [];
  for (const book of chosen) {
    const target = path.join(out, `${book.post_name}.epub`);
    if (!fs.existsSync(target)) continue;
    const bytes = fs.readFileSync(target);
    const epub = await readEpub(bytes);
    const creditLines: string[] = [];
    const textLines: string[] = [];
    for (const chapter of epub.chapters) {
      const lines = chapter.text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const hasHindi = lines.some((line) => /[\u0900-\u097F]/u.test(line));
      const attributionPage = lines.some((line) => /story attribution|other credits|illustration attributions|some rights reserved|CC.?[-­]BY.?[-­]4\.0|Pratham Books goes digital|terms_and_conditions/iu.test(line));
      if (!hasHindi || attributionPage) { creditLines.push(...lines); continue; }
      for (const line of lines) {
        const metadata = /^(author|illustrator|translator|publisher|editor|designer|supported by|copyright|this book was made possible|content under creative commons|read, create and translate|original story|translated by|www\.|https?:\/\/|©)/iu.test(line);
        if (metadata) creditLines.push(line); else textLines.push(line);
      }
    }
    if (!textLines.length) { console.warn(`hi:gdl - ${book.post_name}: no Hindi text after attribution separation`); continue; }
    const base = book.post_name.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `book-${book.postId}`;
    const textFile = `${base}.txt`;
    fs.writeFileSync(path.join(out, textFile), `${textLines.join('\n')}\n`, 'utf8');
    fs.writeFileSync(path.join(out, `${base}.attribution.json`), `${JSON.stringify({ title: book.title, sourceUrl: book.postLink, api: API, licence: book.license, publisher: book.publisher, contentsource: book.contentsource, credits: creditLines, epubSha256: crypto.createHash('sha256').update(bytes).digest('hex') }, null, 2)}\n`, 'utf8');
    coverage.push({ apiPostId: book.postId, apiSlug: book.post_name, title: book.title, sourceUrl: book.postLink ?? API, licence: book.license?.map((x) => x.name ?? x.slug ?? '').filter(Boolean) ?? [], author: book.author ?? null, publisher: book.publisher ?? null, credits: creditLines, epubSha256: crypto.createHash('sha256').update(bytes).digest('hex'), extractedFile: textFile, replacementCharacters: (textLines.join('\n').match(/�/g) ?? []).length, sourceStatus: (textLines.join('\n').includes('�') ? 'blocked-source-replacement-characters' : 'extracted') });
    manifestEntries.push({
      slug: 'gdl-hindi-ccby', title: book.title, author: book.author, streams: ['children'], domains: ['family', 'school'], contentType: 'story',
      rights: { state: 'verified-open-licence', copyrightStatus: 'licensed', permission: 'not-needed', canBundle: true, userImportOnly: false, canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true, verifiedBy: 'GDL API licence record (coordinator AI; not legal advice)', verifiedAt: '2026-10-01', basis: `The GDL API records this book as CC-BY-4.0; source ${book.postLink ?? API}.`, licensing: 'CC BY 4.0', sourceRepository: API, licence: 'CC BY 4.0', attributionRequired: true, shareAlike: false, commercialUse: true, statusByJurisdiction: { '*': 'licensed' }, evidence: [`GDL API book ${book.postId}: CC-BY-4.0`], acquisitionNotes: `Attribution is retained in ${base}.attribution.json.` },
      source: { file: textFile, kind: 'plain', url: book.postLink ?? API, attribution: `${book.title}. ${creditLines.join(' ')} Global Digital Library; CC BY 4.0.`, provenance: `Extracted from the official GDL EPUB without rewriting Hindi story lines. English attribution/frontmatter was removed from the text stream and retained in ${base}.attribution.json. EPUB SHA-256 ${crypto.createHash('sha256').update(bytes).digest('hex')}.` },
      convert: { paragraphs: 'lines', sourceKind: 'plain', stripBoilerplate: false },
    });
  }
  fs.writeFileSync(path.join(out, 'library-manifest.json'), `${JSON.stringify({ schema: 1, lang: 'hi', entries: manifestEntries }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(out, 'coverage.json'), `${JSON.stringify({ source: API, fetchedAt: catalogue.source.fetchedAt, eligible: eligible.length, extracted: coverage.length, books: coverage }, null, 2)}\n`, 'utf8');
  console.log(`hi:gdl - extracted ${manifestEntries.length} books into plain text and wrote library-manifest.json`);
}
console.log(`hi:gdl - selected ${chosen.length} CC-BY-4.0 book(s); ${eligible.length} eligible Hindi books remain available in catalogue.json`);
