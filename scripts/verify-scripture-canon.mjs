/**
 * Verify that each bundled full Bible source has the complete 66-book Protestant
 * canon, with every canonical chapter represented by non-empty verse text.
 *
 * This deliberately checks the expected book/chapter map instead of counting
 * whatever rows happen to be present. It is a structural check; wording and
 * rights are verified by the language-specific source verification scripts.
 */
import fs from 'node:fs';
import { CANON, runningNumber } from './lib-canon.mjs';

const CHAPTERS = Object.fromEntries(CANON);

const SOURCES = {
  de: ['data/sources/de-bible/deu1912-library-documents.json', undefined],
  es: ['data/sources/es-bible/spaRV1909-library-documents.json', undefined],
  hi: ['data/sources/hi/irv2019-library-documents.json', undefined],
  // Thai's full builder includes the seed chapter in its generated source.
  th: ['data/sources/th/otcv2025-library-documents.json', undefined],
};

function rows(source) {
  if (!source) return [];
  const files = fs.statSync(source).isDirectory()
    ? fs.readdirSync(source).filter((f) => /^bible-.*\.json$/.test(f)).map((f) => `${source}/${f}`)
    : [source];
  const docs = files.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  validateDocuments(source, docs);
  return docs.flatMap((d) => d.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.sentences ?? [])))
    .flatMap((s) => (s.text?.trim() && s.verseRefs?.length ? [{ ref: s.verseRefs[0], text: s.text }] : []));
}

function validateDocuments(label, docs) {
  const addresses = new Set();
  let previous = 0;
  let edition;
  for (const doc of docs) {
    const meta = doc.scripture;
    const n = meta && runningNumber(meta.book, meta.chapter);
    if (!n) throw new Error(label + ': invalid chapter in ' + doc.id);
    if (!meta.translationId || !meta.edition) throw new Error(label + ': missing edition in ' + doc.id);
    const identity = JSON.stringify([meta.translationId, meta.edition]);
    if (edition && edition !== identity) throw new Error(label + ': mixed editions in canonical library');
    edition = identity;
    const key = identity + ':' + meta.book + '.' + meta.chapter;
    if (addresses.has(key)) throw new Error(label + ': duplicate canonical address ' + key);
    addresses.add(key);
    if (n <= previous) throw new Error(label + ': canonical book/chapter order at ' + doc.id);
    previous = n;
    let lastVerse = 0;
    for (const section of doc.sections ?? []) for (const paragraph of section.paragraphs ?? []) {
      for (const sentence of paragraph.sentences ?? []) {
        if (!sentence.verseRefs?.length) throw new Error(label + ': missing verse address in ' + doc.id);
        for (const ref of sentence.verseRefs) {
          const match = /^([1-3]?[A-Z]{2,3})\.([1-9]\d*)\.([1-9]\d*)$/.exec(ref);
          if (!match || match[1] !== meta.book || Number(match[2]) !== meta.chapter) throw new Error(label + ': cross-chapter contamination ' + ref + ' in ' + doc.id);
          const verse = Number(match[3]);
          if (verse <= lastVerse) throw new Error(label + ': duplicate/out-of-order verse ' + ref);
          lastVerse = verse;
        }
      }
    }
  }
}

function verify(lang, file, corpus) {
  return verifyRows(lang, [...rows(file), ...rows(corpus)]);
}

function verifyRows(lang, input) {
  const found = new Map();
  for (const row of input) {
    if (found.has(row.ref)) throw new Error(`${lang}: duplicate verse ${row.ref}`);
    found.set(row.ref, row.text);
  }
  const missingBooks = [], missingChapters = [];
  for (const [book, count] of Object.entries(CHAPTERS)) {
    const chapters = new Set([...found.keys()].filter((r) => r.startsWith(`${book}.`)).map((r) => Number(r.split('.')[1])));
    if (!chapters.size) missingBooks.push(book);
    for (let chapter = 1; chapter <= count; chapter++) if (!chapters.has(chapter)) missingChapters.push(`${book}.${chapter}`);
  }
  const unexpected = [...found.keys()].filter((r) => {
    const [book, chapter, verse] = r.split('.');
    return !(book in CHAPTERS) || !Number.isInteger(Number(chapter)) || Number(chapter) < 1 || Number(chapter) > CHAPTERS[book]
      || !Number.isInteger(Number(verse)) || Number(verse) < 1;
  });
  if (missingBooks.length || missingChapters.length || unexpected.length) {
    throw new Error(`${lang}: incomplete canon; missing books=${missingBooks.join(',') || 'none'}; missing chapters=${missingChapters.slice(0, 12).join(',') || 'none'}; unexpected refs=${unexpected.slice(0, 12).join(',') || 'none'}`);
  }
  const chapters = new Set([...found.keys()].map((r) => r.split('.').slice(0, 2).join('.')));
  return { books: Object.keys(CHAPTERS).length, chapters: chapters.size, verses: found.size };
}

function installedRows(lang) {
  const root = `public/library/${lang}`;
  const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, 'utf8'));
  const out = [];
  const docs = [];
  const ids = new Set();
  for (const shard of manifest.shards.filter((s) => s.stream === 'scripture')) {
    const index = JSON.parse(fs.readFileSync(`${root}/${shard.file}`, 'utf8'));
    for (const row of index.rows) {
      if (ids.has(row.id)) throw new Error(`${lang}: duplicate catalog text id ${row.id}`);
      ids.add(row.id);
      if (row.stream !== 'scripture' || row.published !== true) throw new Error(`${lang}: non-published/non-Scripture row in Scripture shard: ${row.id}`);
      const doc = JSON.parse(fs.readFileSync(`${root}/${row.documentPath}`, 'utf8'));
      docs.push(doc);
      if (doc.work?.chapter?.index !== row.chapter) throw new Error(lang + ': catalog chapter mismatch for ' + row.id);
      if (doc.id !== row.id.slice(`text:${lang}:`.length)) throw new Error(`${lang}: document id mismatch for ${row.id}`);
      for (const section of doc.sections ?? []) for (const paragraph of section.paragraphs ?? []) {
        for (const sentence of paragraph.sentences ?? []) for (const ref of sentence.verseRefs ?? []) {
          if (!sentence.text?.trim()) throw new Error(`${lang}: empty installed verse ${ref}`);
          out.push({ ref, text: sentence.text, edition: JSON.stringify([doc.scripture?.translationId, doc.scripture?.edition]) });
        }
      }
    }
  }
  validateDocuments(lang + ' installed', docs);
  return out;
}

for (const [lang, [source, corpus]] of Object.entries(SOURCES)) {
  const result = verify(lang, source, corpus);
  const sourceWords = new Map([...rows(source), ...rows(corpus)].map((row) => [row.ref, row.text]));
  const sourceDocs = JSON.parse(fs.readFileSync(source, 'utf8'));
  const edition = JSON.stringify([sourceDocs[0].scripture.translationId, sourceDocs[0].scripture.edition]);
  const actual = installedRows(lang);
  for (const row of actual) if (row.edition !== edition) throw new Error(`${lang}: installed edition differs from protected source at ${row.ref}`);
  for (const row of actual) if (sourceWords.get(row.ref) !== row.text) throw new Error(`${lang}: installed wording differs from protected source at ${row.ref}`);
  const installed = verifyRows(`${lang} installed`, actual);
  if (installed.books !== result.books || installed.chapters !== result.chapters) throw new Error(`${lang}: installed coverage differs from source (${installed.books} books/${installed.chapters} chapters vs ${result.books}/${result.chapters})`);
  if (installed.verses !== result.verses) throw new Error(`${lang}: installed verse count differs from source (${installed.verses} vs ${result.verses})`);
  console.log(`${lang}: ${result.books} books, ${result.chapters} chapters, ${result.verses} source verses; installed ${installed.verses} verses`);
}
