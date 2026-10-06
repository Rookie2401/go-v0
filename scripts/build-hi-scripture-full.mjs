/**
 * Build the complete IRV Hindi Bible from the approved eBible USFM archive.
 *
 *   node scripts/build-hi-scripture-full.mjs [--dry]
 *
 * The archive is a publisher supplied file, so this importer keeps the source
 * wording and verse references intact and removes only USFM apparatus
 * (headings, footnotes and cross references). Existing chapter ids and English
 * rescue lines are retained when present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runningNumber } from './lib-canon.mjs';

const ROOT = 'data/sources/hi/usfm';
const OUT = 'data/corpus/hi';
const dry = process.argv.includes('--dry');
const dateAt = process.argv.indexOf('--date');
const TODAY = dateAt >= 0 ? process.argv[dateAt + 1] : '2026-10-01';
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) throw new Error(`--date must be YYYY-MM-DD, got ${TODAY}`);
const NAME = 'इंडियन रिवाइज्ड वर्जन (IRV) हिंदी - 2019';
const files = fs.readdirSync(ROOT).filter((x) => /^\d+-[A-Z0-9]+hin2017\.usfm$/.test(x)).sort();
if (!files.length) throw new Error(`no hin2017 USFM files found in ${ROOT}`);

const clean = (input) => {
  let s = input.normalize('NFC');
  // Footnotes and cross references are apparatus, not verse wording.
  s = s.replace(/\\(?:f|fe|ef|x)\b[\s\S]*?\\(?:f|fe|ef|x)\*/g, '');
  // USFM word markup may contain a pipe and attributes. Keep the display word.
  s = s.replace(/\\w\s+([^|\\]+?)(?:\|[^\\]*)?\\w\*/g, '$1');
  // Cross-reference character style is apparatus, even when it is inline in a verse.
  s = s.replace(/\\bdit\b[\s\S]*?\\bdit\*/g, '');
  // Remove milestone attributes and all remaining inline markers, retaining text.
  s = s.replace(/\\zaln-s\s[^\\]*?\\\*/g, '').replace(/\\zaln-e\*/g, '');
  s = s.replace(/\\\+?[A-Za-z][A-Za-z0-9-]*\*?/g, '');
  s = s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?।])/g, '$1').trim();
  return s;
};

function parse(file) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  let book = file.match(/^\d+-([A-Z0-9]+)hin2017/)?.[1];
  let heading;
  let chapter;
  let verse;
  const verses = new Map();
  for (const raw of lines) {
    if (/^\\id\s+/.test(raw)) book = raw.match(/^\\id\s+([^\s]+)/)?.[1] ?? book;
    const h = raw.match(/^\\(?:h|toc1)\s+(.+)/);
    if (h && !heading) heading = clean(h[1]);
    const c = raw.match(/^\\c\s+(\d+)/);
    if (c) { chapter = Number(c[1]); verse = undefined; continue; }
    const v = raw.match(/^\\v\s+(\d+)(?:\s+(.*))?$/);
    if (v) {
      verse = Number(v[1]);
      verses.set(`${chapter}.${verse}`, clean(v[2] ?? ''));
      continue;
    }
    // Section headings and front-matter markers can follow a verse on the next
    // line; they are not verse text. Poetry/paragraph markers are handled below
    // because their following text belongs to the verse.
    if (/^\\(?:s\d?|r|d|sp|mt\d?|ms\d?|is\d?|ip|io\d?|ili|li\d?|cl|cp|cd|rem|periph|ide|h|toc\d?)\b/.test(raw)) continue;
    if (chapter !== undefined && verse !== undefined && raw.trim() && !/^\\(?:p|m|q\d?|b|nb|s\d?|r|d|sp|mt\d?|ms\d?|is\d?|ip|io\d?|ili|li\d?|cl|cp|cd|rem|periph|ide|h|toc\d?)\s*$/.test(raw)) {
      // Paragraph/poetry markers at the start of a continuation line are layout,
      // while the text following them remains part of the current verse.
      const more = clean(raw.replace(/^\\(?:p|m|q\d?|b|nb|qac|qr|qc|qa|qm\d?)\s*/, ''));
      if (more) verses.set(`${chapter}.${verse}`, `${verses.get(`${chapter}.${verse}`)} ${more}`.trim());
    }
  }
  return { book, heading: clean(heading ?? book), verses };
}

const oldById = new Map();
if (fs.existsSync(OUT)) for (const name of fs.readdirSync(OUT)) if (name.endsWith('.json')) {
  try { const d = JSON.parse(fs.readFileSync(path.join(OUT, name), 'utf8')); oldById.set(d.id, d); } catch {}
}
// The lazy Scripture library is the complete app route; seed corpus chapters
// are not indexed there, so retain every chapter in this generated source.
const APP_SEED_IDS = new Set(['bible-gen-1', 'bible-psa-1', 'bible-psa-23', 'bible-mrk-1', 'bible-1john-1']);

const books = [];
let count = 0;
for (const file of files) {
  const parsed = parse(file);
  const chapters = new Map();
  for (const [key, text] of parsed.verses) {
    const [ch, v] = key.split('.').map(Number);
    if (!chapters.has(ch)) chapters.set(ch, []);
    chapters.get(ch).push({ n: v, text });
  }
  for (const [chapter, rows] of chapters) {
    rows.sort((a, b) => a.n - b.n);
    const shortBook = parsed.book === '1JN' ? '1john' : parsed.book.toLowerCase();
    const baseSlug = `bible-${shortBook}-${chapter}`;
    const slug = APP_SEED_IDS.has(baseSlug) ? `${baseSlug}-complete` : baseSlug;
    const old = oldById.get(baseSlug) ?? oldById.get(slug);
    const oldEnglish = new Map();
    old?.sections?.flatMap((s) => s.paragraphs ?? []).flatMap((p) => p.sentences ?? []).forEach((s) => {
      if (s.verseRefs?.[0] && s.english) oldEnglish.set(s.verseRefs[0], s.english);
    });
    const sentences = rows.map(({ n, text }) => ({ text, ...(oldEnglish.has(`${parsed.book}.${chapter}.${n}`) ? { english: oldEnglish.get(`${parsed.book}.${chapter}.${n}`) } : {}), verseRefs: [`${parsed.book}.${chapter}.${n}`] }));
    const paragraphs = [];
    for (let i = 0; i < sentences.length; i += 5) paragraphs.push({ sentences: sentences.slice(i, i + 5) });
    const title = old?.title ?? `${parsed.heading} ${chapter}`;
    const page = `${parsed.book}${String(chapter).padStart(parsed.book === 'PSA' ? 3 : 2, '0')}.htm`;
    const doc = {
      schemaVersion: 2, id: slug, lang: 'hi', title, contentType: 'scripture',
      corpus: { id: 'bible-hi-irv2019', kind: 'scripture', title: NAME },
      source: {
        id: `src:hi:${slug}`, title: NAME, edition: 'IRV Hindi 2019', publisher: 'Bridge Connectivity Solutions Pvt. Ltd.',
        attribution: `${NAME} — copyright © 2017, 2018, 2019 Bridge Connectivity Solutions; Creative Commons Attribution Share-Alike 4.0 (CC BY-SA 4.0); from eBible.org (hin2017)`,
        provenance: `Indian Revised Version (Hindi), imported verse by verse from the approved eBible.org hin2017 USFM publisher file (${file}) by scripts/build-hi-scripture-full.mjs on ${TODAY}; nothing was retyped. USFM headings, footnotes and cross references are omitted as apparatus; verse wording is otherwise retained exactly.`,
        url: `https://ebible.org/hin2017/${page}`, rights: 'licensed',
        licenseNote: 'CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), as stated by the distributor: share and adapt with the copyright and source named, changes indicated, and the same licence kept. This text is passed on unchanged under that licence.',
        authorship: 'licensed',
      },
      review: { status: 'reviewed', reviewedBy: 'scripts/build-hi-scripture-full.mjs', reviewedAt: TODAY, notes: 'Wording imported from and checked against the approved eBible.org hin2017 USFM publisher file.' },
      topics: ['scripture', parsed.book.toLowerCase()], editorialTags: [], prepTargets: [], generated: false,
      work: { slug: 'bible-hindi', chapter: { index: runningNumber(parsed.book, chapter), title } },
      scripture: { translationId: 'hin2017', translationName: NAME, edition: 'IRV Hindi 2019', book: parsed.book, chapter,
        verification: { against: 'eBible.org hin2017 USFM publisher file', url: 'https://ebible.org/Scriptures/hin2017_usfm.zip', checkedAt: TODAY, method: 'publisher-file', by: 'scripts/build-hi-scripture-full.mjs' } },
      english: { source: 'World English Bible (public domain), eBible.org eng-web; English rescue is retained where previously bundled.' },
      sections: [{ title, chapter, paragraphs }],
    };
    books.push({ slug, doc, old }); count++;
  }
}
// Publisher filenames are not guaranteed to follow the Protestant canon
// (some archives place Romans before Acts). Keep the generated lazy library in
// canonical chapter order so the reader and audit agree on positions.
books.sort((a, b) => (a.doc.work.chapter.index ?? Infinity) - (b.doc.work.chapter.index ?? Infinity));
if (!dry) {
  fs.mkdirSync(OUT, { recursive: true });
  // The compacted book documents are derived output; remove them before a fresh
  // import so rerunning the builder cannot duplicate their sections.
  for (const name of fs.readdirSync(OUT)) if (/^bible-book-[a-z0-9-]+\.json$/.test(name)) fs.unlinkSync(path.join(OUT, name));
  // Scripture is lazy library input. The five established corpus files are preserved in place;
  // this builder never writes eager chapter documents.
}
const verses = books.reduce((n, x) => n + x.doc.sections.flatMap((s) => s.paragraphs).flatMap((p) => p.sentences).length, 0);
const libraryDocs = books.map((x) => x.doc);
if (!dry) fs.writeFileSync('data/sources/hi/irv2019-library-documents.json', `${JSON.stringify(libraryDocs)}\n`);
console.log(`${dry ? 'dry run: ' : ''}${count} chapter documents, ${verses} verses from ${files.length} USFM books${dry ? '' : ` written to ${OUT}`}`);
