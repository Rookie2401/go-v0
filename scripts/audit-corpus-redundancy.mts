/** Read-only checks across every installed language: exact content, IDs and work/chapter aliases. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { documentPathOf, parseManifest, parseShard } from '../src/library/format';
import type { LanguageCode } from '../src/core';
import type { CorpusDocument } from '../src/ingest';
import { computePublished } from '../src/ingest';

type Hit = { id: string; file: string; title: string; work?: string; chapter?: number; kind: string; published: boolean; characters: number };
const LANGUAGES: LanguageCode[] = ['th', 'sq', 'hi', 'de', 'es'];
const body = (d: CorpusDocument) => d.sections.flatMap((s) => s.paragraphs.flatMap((p) => 'sentences' in p ? p.sentences.map((x) => x.text) : [p.text])).join('\n').normalize('NFC').replace(/\s+/g, ' ').trim();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function group(hits: { key: string; hit: Hit }[]) {
  const by = new Map<string, Hit[]>();
  for (const { key, hit } of hits) (by.get(key) ?? by.set(key, []).get(key)!).push(hit);
  return [...by.values()].filter((g) => g.length > 1);
}
const hit = (doc: CorpusDocument, file: string, textId = doc.id): Hit => ({ id: textId, file: file.replaceAll('\\', '/'), title: doc.title, work: doc.work?.slug, chapter: doc.work?.chapter?.index, kind: doc.contentType, published: computePublished(doc).published, characters: body(doc).length });

const languages = [];
for (const lang of LANGUAGES) {
  const root = `public/library/${lang}`;
  const manifest = parseManifest(JSON.parse(fs.readFileSync(`${root}/manifest.json`, 'utf8')), lang);
  if (!manifest) throw new Error(`${lang}: invalid library manifest`);
  const rows = manifest.shards.flatMap((s) => parseShard(JSON.parse(fs.readFileSync(`${root}/${s.file}`, 'utf8')), lang));
  const installed = rows.map((row) => {
    const file = `${root}/${documentPathOf(row.id)}`;
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument;
    return { doc, hit: hit(doc, file, row.id) };
  });
  const bundled = fs.readdirSync(`data/corpus/${lang}`).filter((f) => f.endsWith('.json')).flatMap((f) => {
    const file = `data/corpus/${lang}/${f}`;
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument;
    return Array.isArray(doc.sections) ? [{ doc, hit: hit(doc, file, `text:${lang}:${doc.id}`) }] : [];
  });
  const allDuplicateBodies = group(installed.map(({ doc, hit }) => ({ key: hash(body(doc)), hit })));
  // The identical short directions introduce different acts in the original play.
  const isStageDirection = (g: Hit[]) => lang === 'de' && g.length === 2 && g.every((h) => h.characters === 17 && h.work === 'lessing-emilia-galotti') && g.some((h) => h.chapter === 30) && g.some((h) => h.chapter === 39);
  const repeatedStageDirections = allDuplicateBodies.filter(isStageDirection);
  const duplicateBodies = allDuplicateBodies.filter((g) => !isStageDirection(g));
  const duplicateIds = group(installed.map(({ hit }) => ({ key: hit.id, hit })));
  const duplicateChapters = group(installed.filter(({ hit }) => hit.work && hit.chapter !== undefined).map(({ hit }) => ({ key: `${hit.work}:${hit.chapter}`, hit })));
  const overlaps = group([...installed, ...bundled].map(({ doc, hit }) => ({ key: hash(body(doc)), hit })));
  const intentionalScriptureOverlaps = overlaps.filter((g) => g.every((h) => h.kind === 'scripture'));
  const literaryOverlaps = overlaps.filter((g) => g.some((h) => h.kind !== 'scripture') && !isStageDirection(g));
  const baselineFile = `C:/Users/CJWal/Documents/Codex/2026-10-02/i-w/work/corpus-review/${lang}-baseline.json`;
  const baseline: { id: string; stream: string }[] = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : [];
  const present = new Set(rows.map((r) => r.id));
  const lostReadingIds = baseline.filter((r) => r.stream !== 'scripture' && !present.has(r.id)).map((r) => r.id);
  const readingRows = rows.filter((r) => r.stream !== 'scripture');
  const report = { language: lang, installedDocuments: rows.length, readingDocuments: readingRows.length, publishedReadingDocuments: readingRows.filter((r) => r.published).length,
    readingWorks: new Set(readingRows.map((r) => r.workId)).size, readingWords: readingRows.reduce((n, r) => n + r.features.words, 0),
    bundledDocuments: bundled.length, publishedBundledReadingDocuments: bundled.filter(({ hit }) => hit.kind !== 'scripture' && hit.published).length,
    repeatedStageDirections, duplicateBodies, duplicateIds, duplicateChapters, intentionalScriptureOverlaps, literaryOverlaps, lostReadingIds };
  languages.push(report);
  console.log(`${lang}: ${report.readingDocuments} lazy reading texts (${report.publishedReadingDocuments} published), ${report.readingWorks} reading works, ${report.readingWords} words; ${duplicateBodies.length} duplicate bodies, ${duplicateIds.length} duplicate IDs, ${duplicateChapters.length} duplicate chapters, ${literaryOverlaps.length} literary aliases; ${lostReadingIds.length} previously installed readings lost`);
}
fs.mkdirSync('data/review/library-audit', { recursive: true });
fs.writeFileSync('data/review/library-audit/corpus-redundancy.json', JSON.stringify({ checkedAt: '2026-10-02', method: 'NFC body text, whitespace normalized; no source or learner data modified', languages }, null, 2) + '\n');
if (languages.some((l) => l.duplicateBodies.length || l.duplicateIds.length || l.duplicateChapters.length || l.literaryOverlaps.length || l.lostReadingIds.length)) process.exitCode = 1;
