/**
 * Reconstruct the registered Hindi GDL documents from the cached text and attribution files, put every document in
 * Unicode NFC, and place the books on the course's Classes 1-4 by MEASURED difficulty.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/prepare-hi-gdl-collection.mts [--out f] [--mapping f] [--entry-out f] [--report f]
 *
 * NFC. The cached EPUB extracts write nukta letters as the precomposed U+0958-U+095F (क़ ख़ ग़ ज़ ड़ ढ़ फ़ य़), which Unicode
 * excludes from NFC; the importer, the dictionary and the search all use NFC. Every string of every document is normalised
 * (canonically equivalent: no word changes). The identity of a book (the registered content signature in the id map) is
 * still checked against the cached text exactly as it was extracted, so a changed source is still caught.
 *
 * GRADING (the rule; the measurements are written to the report file beside the documents):
 *   words        running words of the book (adapter tokens that are words)
 *   sentence     mean words per sentence (the Hindi adapter's sentence segmentation of each paragraph)
 *   rarity       share of the book's running words whose normalised word form occurs in fewer than RARE_IN_BOOKS (4) of the
 *                92 books: vocabulary the other children's books do not share. (Forms, not lemmas: the grading then depends only on the
 *                adapter's tokenizer and sentence splitter, not on its word lists, which are revised often; the shelves stay put.)
 * Each measure is turned into a percentile rank among the 92 books (ties share the lower rank); the difficulty score is
 *   0.4 x words + 0.3 x sentence + 0.3 x rarity            (0 = easiest, 1 = hardest)
 * and the books, ordered by score (the book id breaks ties), are cut into four equal shelves: the easiest quarter is Class 1
 * (c1), then c2, c3, c4. Inside a shelf the books stay in order of score, so chapter 1 of a shelf is its easiest book.
 * The publisher's own reading level ("यह पठन स्तर N की किताब है") is recorded in the report for comparison and is not used.
 *
 * Output: the 92 documents (shelf, then difficulty; `work.slug` = the shelf's work, `work.chapter.index` = place in the
 * shelf) and the build entries, one per shelf (slug gdl-hindi-ccby for c1, gdl-hindi-ccby-c2 … -c4), all reading the one
 * documents file through `source.only`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import { plainTextToDocuments } from '../src/ingest/plaintext';
import { contentSignatureOf } from '../src/ingest/publish';

const root = 'data/sources/hi/gdl';
const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const defaultOut = `${root}/gdl-library-documents.json`;
const out = arg('--out', defaultOut), mapPath = arg('--mapping', `${root}/gdl-id-map.json`);
// A scratch reconstruction must not overwrite the installed collection's entry.
const entryOut = arg('--entry-out', out === defaultOut ? `${root}/gdl-library-entry.json` : `${out}.entry.json`);
const reportOut = arg('--report', out === defaultOut ? `${root}/gdl-grading.json` : `${out}.grading.json`);

/** The shelves the books are placed on, in order, and the vocabulary threshold of the rarity measure. */
const SHELVES = ['c1', 'c2', 'c3', 'c4'] as const;
const RARE_IN_BOOKS = 4;
const WEIGHTS = { words: 0.4, sentence: 0.3, rarity: 0.3 } as const;
const BOOKS = 92;
const slugOf = (shelf: string) => (shelf === 'c1' ? 'gdl-hindi-ccby' : `gdl-hindi-ccby-${shelf}`);

const nfc = <T,>(v: T): T => JSON.parse(JSON.stringify(v).normalize('NFC')) as T;
const cov = JSON.parse(fs.readFileSync(`${root}/coverage.json`, 'utf8')) as any;
const cat = JSON.parse(fs.readFileSync(`${root}/catalogue.json`, 'utf8')) as any;
const bad = cov.books.filter((b: any) => b.replacementCharacters > 0 || b.sourceStatus !== 'extracted');
if (bad.length !== 1 || bad[0].apiPostId !== 6161) throw new Error(`unexpected damaged source set: ${bad.length}`);

let map: any[];
if (fs.existsSync(mapPath)) map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
else {
  if (!fs.existsSync(out)) throw new Error('mapping and prior documents are absent');
  const old = JSON.parse(fs.readFileSync(out, 'utf8'));
  map = old.map((d: any, i: number) => ({ id: d.id, sourceId: d.source.id, index: d.work?.chapter?.index ?? i, title: d.title, sourceUrl: d.source.url, signature: d.review?.contentSignature ?? contentSignatureOf(d) }));
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');
}
type CachedBook = { sourceUrl: string; extractedFile: string; replacementCharacters?: number; sourceStatus?: string; apiPostId?: number };
const byUrl = new Map<string, CachedBook>(cov.books.map((b: CachedBook) => [b.sourceUrl, b]));
const seenSignatures = new Set<string>();
const activeMap = [...map].sort((a, b) => a.index - b.index).filter((m) => { if (seenSignatures.has(m.signature)) return false; seenSignatures.add(m.signature); return true; });
if (map.length !== 124 || activeMap.length !== BOOKS) throw new Error(`unexpected archived/unique mapping counts: ${map.length}/${activeMap.length}`);

// ───────────── the documents ─────────────
interface Built { doc: any; publisherLevel?: number }
const built: Built[] = [];
for (const m of activeMap) {
  const b = byUrl.get(m.sourceUrl);
  if (!b) throw new Error(`no source for ${m.id}`);
  const text = fs.readFileSync(path.join(root, b.extractedFile), 'utf8');
  const meta = JSON.parse(fs.readFileSync(path.join(root, b.extractedFile.replace(/\.txt$/, '.attribution.json')), 'utf8'));
  if (!text.trim() || text.includes('�')) throw new Error(`damaged source ${m.id}`);
  const credits = (meta.credits ?? []).join('\n');
  if (!/Authors?:/i.test(credits) || !/StoryWeaver|Pratham Books/i.test(credits) || !/CC.?BY.?4\.0/i.test(credits)) throw new Error(`incomplete credits ${m.id}`);
  const author = credits.match(/Authors?:\s*([^\n]+)/i)?.[1]?.trim();
  const convert = (t: string, title: string) => {
    const made = plainTextToDocuments(t, { lang: 'hi', title, author, idPrefix: m.id.replace(/-ch\d+$/, ''), chapters: 'none', paragraphs: 'blank-line', sourceKind: 'plain' });
    if (made.documents.length !== 1) throw new Error(`${m.id}: expected one document`);
    return made.documents[0] as any;
  };
  // the registered identity: the text exactly as extracted (before NFC) has the registered signature
  const asExtracted = convert(text, m.title);
  if (contentSignatureOf(asExtracted) !== m.signature) throw new Error(`${m.id}: content signature changed`);
  const d = convert(text.normalize('NFC'), String(m.title).normalize('NFC'));
  d.id = m.id; d.title = String(m.title).normalize('NFC');
  d.source = { id: m.sourceId, title: d.title, ...(author ? { author } : {}), publisher: meta.publisher ?? 'StoryWeaver', attribution: credits, provenance: 'Exact Hindi text reconstructed from cached official GDL EPUB extract; source fidelity only, with no native-speaker quality claim. Written in Unicode NFC (canonically equivalent to the extract).', rights: 'licensed', licenseNote: 'CC BY 4.0; attribution retained in this source record.', authorship: 'licensed', url: m.sourceUrl, edition: 'GDL Hindi CC BY 4.0' };
  d.corpus = { id: 'gdl-hindi-ccby', kind: 'comprehensible-input', title: 'Global Digital Library Hindi CC BY collection' };
  d.streams = ['children'];
  const level = credits.match(/पठन स्तर\s*([०-९0-9])/)?.[1];
  built.push({ doc: d, publisherLevel: level === undefined ? undefined : Number(level.replace(/[०-९]/g, (c: string) => String('०१२३४५६७८९'.indexOf(c)))) });
}
if (built.length !== BOOKS || new Set(built.map((x) => x.doc.id)).size !== BOOKS) throw new Error(`expected ${BOOKS} unique stable documents, got ${built.length}`);

// ───────────── measure and grade ─────────────
const hi = createAdapterRegistry().get('hi');
interface Measure { id: string; words: number; sentences: number; meanSentence: number; rareShare: number; score: number; shelf: string; publisherLevel?: number }
const textsOf = (b: Built): string[] => b.doc.sections.flatMap((sec: any) => sec.paragraphs.flatMap((p: any) => ('sentences' in p ? p.sentences.map((s: any) => s.text) : hi.segmentSentences(p.text).map((s) => s.text))));
const formsOf = (sentences: string[]): string[] => {
  const forms: string[] = [];
  for (const t of sentences) for (const tok of hi.tokenize(t)) if (tok.isWord) forms.push(tok.normalized.normalize('NFC'));
  return forms;
};
const sentenceLists = built.map(textsOf);
const lemmaLists = sentenceLists.map(formsOf); // (forms; the name is kept short)
const bookFreq = new Map<string, number>();
for (const l of lemmaLists) for (const x of new Set(l)) bookFreq.set(x, (bookFreq.get(x) ?? 0) + 1);
const raw = built.map((b, i) => {
  const words = lemmaLists[i].length, sentences = Math.max(1, sentenceLists[i].length);
  const rare = lemmaLists[i].filter((x) => (bookFreq.get(x) ?? 0) < RARE_IN_BOOKS).length;
  return { id: b.doc.id as string, words, sentences, meanSentence: words / sentences, rareShare: words ? rare / words : 0, publisherLevel: b.publisherLevel };
});
const percentile = (key: 'words' | 'meanSentence' | 'rareShare') => {
  const sorted = raw.map((r) => r[key]).sort((a, b) => a - b);
  return (r: typeof raw[number]) => sorted.indexOf(r[key]) / (BOOKS - 1);
};
const pw = percentile('words'), ps = percentile('meanSentence'), pr = percentile('rareShare');
const scored = raw.map((r) => ({ ...r, score: WEIGHTS.words * pw(r) + WEIGHTS.sentence * ps(r) + WEIGHTS.rarity * pr(r) }))
  .sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : 1));
const perShelf = BOOKS / SHELVES.length;
const measures: Measure[] = scored.map((r, i) => ({ ...r, score: Math.round(r.score * 10000) / 10000, meanSentence: Math.round(r.meanSentence * 100) / 100, rareShare: Math.round(r.rareShare * 10000) / 10000, shelf: SHELVES[Math.min(SHELVES.length - 1, Math.floor(i / perShelf))] }));

// ───────────── write the documents in shelf order ─────────────
const docs: any[] = [];
const placed = new Map<string, number>();
for (const me of measures) {
  const d = built.find((x) => x.doc.id === me.id)!.doc;
  const n = (placed.get(me.shelf) ?? 0) + 1; placed.set(me.shelf, n);
  d.work = { slug: slugOf(me.shelf), courseId: 'india-hi', chapter: { index: n, title: d.title } };
  d.review = { status: 'reviewed', reviewedBy: 'prepare-hi-gdl-collection source-fidelity check', reviewedAt: '2026-10-01', notes: 'Source fidelity review only; no native-speaker quality claim.', contentSignature: contentSignatureOf(d) };
  docs.push(nfc(d));
}
fs.writeFileSync(out, JSON.stringify(docs) + '\n');

const rights = { state: 'verified-open-licence', verifiedBy: 'Global Digital Library catalogue and cached per-book attribution review', verifiedAt: '2026-10-01', basis: 'Each accepted source record is explicitly CC BY 4.0; damaged source 6161 excluded.', statusByJurisdiction: { '*': 'licensed' }, canBundle: true };
const entries = SHELVES.map((shelf) => {
  const ids = docs.filter((d) => d.work.slug === slugOf(shelf)).map((d) => d.id);
  return {
    slug: slugOf(shelf),
    title: `Global Digital Library Hindi CC BY collection — Class ${shelf.slice(1)}`,
    courseId: 'india-hi', stage: shelf, streams: ['children'], contentType: 'story', rights,
    source: {
      file: 'gdl-library-documents.json', kind: 'documents', only: ids, url: cat.source.api, edition: 'GDL Hindi CC BY 4.0 catalogue',
      attribution: 'Per-book author, translator, illustrator and publisher credits are retained in each document source record.',
      provenance: `${ids.length} of the 92 unique source documents reconstructed from 124 clean cached official GDL text and attribution records (duplicate bodies and damaged source 6161 excluded), placed on Class ${shelf.slice(1)} by measured difficulty (scripts/prepare-hi-gdl-collection.mts).`,
    },
  };
});
fs.writeFileSync(entryOut, JSON.stringify({ schema: 1, lang: 'hi', entries }, null, 2) + '\n');

const summary = SHELVES.map((s) => {
  const m = measures.filter((x) => x.shelf === s);
  const med = (k: 'words' | 'meanSentence' | 'rareShare') => { const v = m.map((x) => x[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  return { shelf: s, books: m.length, wordsRange: [Math.min(...m.map((x) => x.words)), Math.max(...m.map((x) => x.words))], medianWords: med('words'), medianMeanSentence: med('meanSentence'), medianRareShare: med('rareShare') };
});
fs.writeFileSync(reportOut, JSON.stringify({
  rule: { measures: ['words', 'meanSentence', 'rareShare'], weights: WEIGHTS, rareIfInFewerBooksThan: RARE_IN_BOOKS, cut: `${BOOKS / SHELVES.length} books per shelf in order of score, easiest first`, shelves: SHELVES, adapter: `${hi.name} ${hi.version}` },
  summary, books: measures,
}, null, 1) + '\n');
console.log(`reconstructed ${docs.length} documents (NFC); refused ${bad.length}; ids and signatures stable; shelves ${summary.map((s) => `${s.shelf}:${s.books} (${s.wordsRange[0]}–${s.wordsRange[1]} words)`).join(', ')}`);
