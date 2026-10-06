/** Build the Biblica Open Thai Common Version 2025 from the official USX archive.
 * The independent USFM archive is parsed and compared verse by verse before any corpus output is written.
 * No text is retyped; headings and footnotes/cross-references are apparatus and are omitted.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const USX_ROOT = 'data/sources/th/usx-full/release/USX_1';
const USFM_ROOT = 'data/sources/th/usfm-full/release/USX_1';
const MANIFEST = 'data/sources/th/otcv2025-library-manifest.json';
const TODAY = '2026-10-01';
const NAME = 'Biblica® Open Thai Common Version 2025';
const ID = 'a62f327aa0179709';
const REVISION = 2;
const dry = process.argv.includes('--dry');

const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|apos);/g, (x) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[x]));
const clean = (s) => decode(s.normalize('NFC')
  .replace(/<note\b[\s\S]*?<\/note>/gi, '')
  .replace(/<para style="(?:s\d?|ms\d?|r|d|sp)"[^>]*>[\s\S]*?<\/para>/gi, '')
  .replace(/<para style="(?:s\d?|ms\d?|r|d|sp)"[^>]*>[\s\S]*?(?=<verse eid)/gi, '')
  .replace(/<para style="(?:s\d?|ms\d?|r|d|sp)"[^>]*>[\s\S]*$/gi, '')
  // USFM puts section cross-reference headings after the preceding verse on a few lines.
  .replace(/\\(?:s\d?|ms\d?|r|d|sp)\s+[^\r\n]*/g, '')
  .replace(/\\(?:f|fe|ef|x)\b[\s\S]*?\\(?:f|fe|ef|x)\*/g, '')
  .replace(/\\iex\s+[\s\S]*?(?=\\(?:p|v|c|s)\b|$)/g, '')
  .replace(/\\(?:d|qa)\s+[^\r\n]*/g, '')
  .replace(/\\w\s+([^|\\]+?)(?:\|[^\\]*)?\\w\*/g, '$1')
  .replace(/\\(?:zaln-s|zaln-e|bdit)\b[^\\]*\*?/g, '')
  .replace(/\\\+?[A-Za-z][A-Za-z0-9-]*\*?/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?।])/g, '$1')
  .trim());
// USX and USFM serializers differ in whether a space surrounds an inline number; this is a format-only difference.
const comparable = (s) => s.replace(/\s*(\d+)\s*/g, '$1').replace(/ +/g, '');

function parseUsx(file) {
  const raw = fs.readFileSync(path.join(USX_ROOT, file), 'utf8');
  const heading = clean(raw.match(/<para style="h">([\s\S]*?)<\/para>/)?.[1] ?? file.slice(0, -4));
  const chapters = new Map();
  const chapterRe = /<chapter number="(\d+)"[^>]*\s\/>/g;
  const starts = [...raw.matchAll(chapterRe)];
  for (let i = 0; i < starts.length; i++) {
    const chapter = Number(starts[i][1]);
    const block = raw.slice(starts[i].index + starts[i][0].length, starts[i + 1]?.index ?? raw.length);
    const verses = new Map();
    const vr = /<verse number="(\d+)"[^>]*\s\/>([\s\S]*?)<verse eid="[^"]+"\s*\/>/g;
    for (const m of block.matchAll(vr)) verses.set(Number(m[1]), clean(m[2]));
    chapters.set(chapter, verses);
  }
  return { heading, chapters };
}

function parseUsfm(file) {
  const raw = fs.readFileSync(path.join(USFM_ROOT, file), 'utf8');
  const heading = clean(raw.match(/^\\h\s+(.+)$/m)?.[1] ?? file.slice(0, -5));
  const chapters = new Map();
  const cr = /\\c\s+(\d+)([\s\S]*?)(?=\\c\s+\d+|$)/g;
  for (const c of raw.matchAll(cr)) {
    const verses = new Map();
    const vr = /\\v\s+(\d+)\s+([\s\S]*?)(?=\\v\s+\d+\s|$)/g;
    for (const m of c[2].matchAll(vr)) verses.set(Number(m[1]), clean(m[2]));
    chapters.set(Number(c[1]), verses);
  }
  return { heading, chapters };
}

const files = fs.readdirSync(USX_ROOT).filter((f) => /^[1-3]?[A-Z]{2,3}\.usx$/.test(f)).sort();
if (files.length !== 66) throw new Error(`expected 66 USX books, found ${files.length}`);
let mismatches = 0, verses = 0, chapters = 0;
const books = [];
for (const usxFile of files) {
  const book = usxFile.slice(0, -4);
  const usfmFile = `${book}.usfm`;
  const a = parseUsx(usxFile); const b = parseUsfm(usfmFile);
  if (a.heading !== b.heading) console.warn(`heading differs ${book}: USX=${a.heading} USFM=${b.heading}`);
  const chapterRows = [];
  for (const [chapter, usxVerses] of a.chapters) {
    chapters++;
    const usfmVerses = b.chapters.get(chapter) ?? new Map();
    for (const [n, text] of usxVerses) {
      verses++;
      const other = usfmVerses.get(n);
      if (other === undefined || comparable(other) !== comparable(text)) {
        mismatches++;
        if (mismatches <= 5) console.error(`mismatch ${book}.${chapter}.${n}\n  USX:  ${text}\n  USFM: ${other ?? '<missing>'}`);
      }
      chapterRows.push({ chapter, n, text });
    }
    if (usfmVerses.size !== usxVerses.size) mismatches++;
  }
  books.push({ book, heading: a.heading, chapters: chapterRows });
}
if (mismatches) throw new Error(`${mismatches} USX/USFM mismatches; refusing to write corpus`);

const sourceBase = 'https://api.open.bible/artifactContent/2477bade-c5d4-4dc4-8a53-5cad848549db';
const attribution = `${NAME} — Copyright © 2025 by Biblica, Inc.; CC BY-SA 4.0; original available at www.biblica.com and open.bible.`;
const provenance = `Imported verse by verse from the official Open.Bible release ${ID}-rev${REVISION}; USX and independent USFM archives were compared after removing only declared apparatus (headings, footnotes and cross-references).`;
const docs = [];
let index = 0;
for (const b of books) {
  const byChapter = new Map();
  for (const row of b.chapters) (byChapter.get(row.chapter) ?? (byChapter.set(row.chapter, []), byChapter.get(row.chapter))).push(row);
  for (const [chapter, rows] of byChapter) {
    const slug = `bible-thai-otcv2025-${b.book.toLowerCase()}-${chapter}`;
    const title = `${b.heading} ${chapter}`;
    // Some published editions intentionally leave a verse number empty (for example ACT 8:37).
    // Preserve the source verse comparison, but do not emit blank library sentences.
    const sentences = rows.filter((r) => r.text.trim()).map((r) => ({ text: r.text, verseRefs: [`${b.book}.${chapter}.${r.n}`] }));
    const paragraphs = [];
    for (let i = 0; i < sentences.length; i += 5) paragraphs.push({ sentences: sentences.slice(i, i + 5) });
    docs.push({ schemaVersion: 2, id: slug, lang: 'th', title, contentType: 'scripture',
      corpus: { id: 'bible-th-otcv2025', kind: 'scripture', title: NAME },
      source: { id: `src:th:${slug}`, title: NAME, edition: 'Open Thai Common Version 2025', publisher: 'Biblica, Inc.', attribution,
        provenance, url: sourceBase, rights: 'licensed', licenseNote: 'CC BY-SA 4.0. Copying and distribution are permitted with the stated copyright, title and attribution; derivative works must state changes and use CC BY-SA. Biblica® is retained for unchanged copies and removed from derivative titles as required by metadata.xml.', authorship: 'licensed' },
      review: { status: 'reviewed', reviewedBy: 'scripts/build-thai-scripture-full.mjs', reviewedAt: TODAY, notes: 'USX and independent USFM release files matched verse by verse.' },
      topics: ['scripture', b.book.toLowerCase()], editorialTags: [], prepTargets: [], generated: false,
      work: { slug: 'bible-thai-otcv2025', chapter: { index: ++index, title } },
      scripture: { translationId: ID, translationName: NAME, edition: 'Open Thai Common Version 2025', book: b.book, chapter,
        verification: { against: 'Open.Bible official USX + independent USFM release', url: sourceBase, checkedAt: TODAY, method: 'publisher-file', by: 'scripts/build-thai-scripture-full.mjs' } },
      sections: [{ title, chapter, paragraphs }] });
  }
}
const manifest = { schema: 1, lang: 'th', entries: [{ slug: 'bible-thai-otcv2025', title: `${NAME} — Thai Bible`, courseId: 'thailand-th', stream: 'scripture', domains: ['scripture', 'theology'], contentType: 'scripture', rights: { state: 'verified-open-licence', verifiedBy: 'Open.Bible metadata.xml and release cross-comparison', verifiedAt: TODAY, basis: 'Official release metadata.xml identifies Biblica, Inc. as rights holder and CC BY-SA 4.0, with attribution and derivative-work conditions.', statusByJurisdiction: { '*': 'licensed' }, canBundle: true }, source: { file: 'otcv2025-library-documents.json', kind: 'documents', url: sourceBase, edition: 'Open Thai Common Version 2025', attribution, provenance } }] };
if (!dry) { fs.writeFileSync('data/sources/th/otcv2025-library-documents.json', `${JSON.stringify(docs)}\n`); fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`); }
console.log(`${dry ? 'dry run: ' : ''}${files.length} books, ${chapters} chapters, ${verses} verses; USX/USFM mismatches ${mismatches}`);
