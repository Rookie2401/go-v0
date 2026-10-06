import fs from 'node:fs';
import path from 'node:path';
import * as german from '../src/course/german';
import * as spanish from '../src/course/spanish';
import * as hindi from '../src/course/hindi';
import * as albanian from '../src/course/albanian';
import * as thai from '../src/course/thai';
import { computePublished } from '../src/ingest/publish';

type AnyRecord = Record<string, any>;
const root = process.cwd();
const outDir = path.join(root, 'data', 'benchmarks', 'reading-ladders');
fs.mkdirSync(outDir, { recursive: true });

const languages = [
  { code: 'de', name: 'German', course: german, stages: 'GERMAN_SHELVES', works: 'GERMAN_WORKS' },
  { code: 'es', name: 'Spanish', course: spanish, stages: 'SPANISH_SHELVES', works: 'SPANISH_WORKS' },
  { code: 'hi', name: 'Hindi', course: hindi, stages: 'HINDI_SHELVES', works: 'HINDI_WORKS' },
  { code: 'sq', name: 'Albanian', course: albanian, stages: 'ALBANIAN_STAGES', works: 'ALBANIAN_WORKS' },
  { code: 'th', name: 'Thai', course: thai, stages: 'THAI_STAGES', works: 'THAI_WORKS' },
] as const;

const readJson = (file: string): AnyRecord | AnyRecord[] | undefined => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
};
const words = (text: string) => (text.match(/\p{L}[\p{L}\p{M}'’\-]*/gu) ?? []).length;
const sentenceWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const sentenceTexts = (value: unknown, result: string[] = []): string[] => {
  if (Array.isArray(value)) { for (const item of value) sentenceTexts(item, result); return result; }
  if (!value || typeof value !== 'object') return result;
  const record = value as AnyRecord;
  if (typeof record.text === 'string' && !Array.isArray(record.sentences)) result.push(record.text);
  if (Array.isArray(record.sentences)) for (const sentence of record.sentences) {
    if (typeof sentence === 'string') result.push(sentence);
    else if (sentence && typeof sentence.text === 'string') result.push(sentence.text);
  }
  for (const [key, child] of Object.entries(record)) if (key !== 'sentences' && key !== 'source' && key !== 'rights') sentenceTexts(child, result);
  return result;
};
const sourceMetrics = (file: string | undefined) => {
  if (!file) return { available: false, words: 0, sentences: 0, meanSentenceWords: null, p90SentenceWords: null };
  let absolute = path.join(root, 'data', 'sources', file);
  if (!fs.existsSync(absolute)) {
    const wanted = path.basename(file);
    const visit = (dir: string): string | undefined => {
      for (const name of fs.readdirSync(dir)) {
        const candidate = path.join(dir, name);
        if (name === wanted && fs.statSync(candidate).isFile()) return candidate;
        if (fs.statSync(candidate).isDirectory()) { const found = visit(candidate); if (found) return found; }
      }
      return undefined;
    };
    absolute = visit(path.join(root, 'data', 'sources')) ?? absolute;
  }
  if (!fs.existsSync(absolute)) return { available: false, words: 0, sentences: 0, meanSentenceWords: null, p90SentenceWords: null };
  const raw = fs.readFileSync(absolute, 'utf8');
  const parsed = file.endsWith('.json') ? readJson(absolute) : undefined;
  const extracted = parsed ? sentenceTexts(parsed) : [];
  const sentences = extracted.length ? extracted : raw.split(/(?<=[.!?।؟])\s+/u).filter(Boolean);
  const lengths = sentences.map(sentenceWords).filter(Boolean).sort((a, b) => a - b);
  const percentile = (p: number) => lengths.length ? lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * p))] : null;
  return { available: true, words: words(extracted.length ? extracted.join(' ') : raw), sentences: lengths.length, meanSentenceWords: lengths.length ? Number((lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1)) : null, p90SentenceWords: percentile(.9) };
};
const stageKey = (id: string | undefined) => id?.slice(id.lastIndexOf(':') + 1) ?? null;
const generatedCorpus = (lang: string) => {
  const dir = path.join(root, 'data', 'corpus', lang); const rows: AnyRecord[] = [];
  if (!fs.existsSync(dir)) return rows;
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    const doc = readJson(path.join(dir, name)) as AnyRecord | undefined;
    if (doc && !Array.isArray(doc) && doc.generated === true && doc.contentType !== 'scripture' && doc.review?.status === 'unreviewed') rows.push(doc);
  }
  return rows;
};
const classify = (entry: AnyRecord, work: AnyRecord | undefined) => {
  const slug = `${entry.slug ?? ''} ${entry.title ?? ''}`.toLowerCase();
  if ((work?.streams ?? []).includes('scripture') || work?.role === 'scripture' || /bible|scripture|luther|reina-valera/.test(slug)) return 'scripture';
  const source = [entry.source?.file, entry.source?.url, entry.source?.edition, work?.sourceUrl, work?.edition].join(' ');
  if (/reading-bridge|hi[\\/]gdl|sq-modern-open|digitallibrary|wikipedia|global digital library/i.test(source)) return 'modern-source-authored';
  if (entry.source?.kind === 'gutenberg' || /wikisource/i.test(source) || work?.rights?.state?.includes('public-domain')) return 'heritage';
  return 'source-era-unclassified';
};

const reports: AnyRecord[] = [];
for (const language of languages) {
  const course: AnyRecord = language.course as AnyRecord;
  const stages: AnyRecord[] = course[language.stages] ?? [];
  const works: AnyRecord[] = course[language.works] ?? [];
  const manifest = readJson(path.join(root, 'public', 'library', language.code, 'manifest.json')) as AnyRecord | undefined;
  const provenance = readJson(path.join(root, 'public', 'library', language.code, 'provenance.json')) as AnyRecord | undefined;
  const installed = new Map<string, AnyRecord>((((provenance?.works ?? []) as AnyRecord[]).map((entry) => [entry.slug, entry])));
  const stageCounts: AnyRecord = {};
  for (const stage of stages) stageCounts[stage.key] = { label: stage.label, works: 0, installedWorks: 0, words: 0 };
  const workRows = works.map((work) => {
    const slug = String(work.id).slice(String(work.id).lastIndexOf(':') + 1);
    const stage = stageKey(work.stageId);
    const installedEntry = installed.get(slug);
    if (stageCounts[stage ?? 'unassigned']) stageCounts[stage ?? 'unassigned'].works++;
    if (installedEntry && stageCounts[stage ?? 'unassigned']) {
      stageCounts[stage ?? 'unassigned'].installedWorks++;
      stageCounts[stage ?? 'unassigned'].words += Number(installedEntry.words ?? 0);
    }
    const metrics = installedEntry ? sourceMetrics(installedEntry.source?.file) : undefined;
    return { slug, title: work.title, stage, levelLabel: work.genericLevel ?? null, rightsState: work.rights?.state ?? null, installed: Boolean(installedEntry), installedPublishedTexts: installedEntry?.published ?? 0, words: installedEntry?.words ?? 0, class: installedEntry ? classify(installedEntry, work) : 'catalogue-only', metrics };
  });
  const installedWorks = [...installed.values()];
  const totalWords = installedWorks.reduce((sum, entry) => sum + Number(entry.words ?? 0), 0);
  const totalTexts = installedWorks.reduce((sum, entry) => sum + Number(entry.published ?? entry.texts ?? 0), 0);
  const publishedByClass = installedWorks.reduce((out: AnyRecord, entry) => {
    const work = works.find((candidate) => String(candidate.id).endsWith(':' + entry.slug));
    const key = classify(entry, work);
    const bucket = (out[key] ??= { works: 0, texts: 0, words: 0 });
    bucket.works++;
    bucket.texts += Number(entry.published ?? entry.texts ?? 0);
    bucket.words += Number(entry.words ?? 0);
    return out;
  }, {});
  const allMetrics = installedWorks.map((entry) => sourceMetrics(entry.source?.file)).filter((metric) => metric.available);
  const planning = { assumption: 'Assumes 40–80 assisted words/minute while reading with lookup/help; estimates are planning ranges, not CEFR or native-speaker certification.', hours50: { wordsAt40wpm: 120000, wordsAt80wpm: 240000 }, hours100: { wordsAt40wpm: 240000, wordsAt80wpm: 480000 }, exposureGap: totalWords < 120000 ? 'below a 50-hour assisted-reading floor' : totalWords < 240000 ? 'covers roughly 50 hours at 40 words/minute' : 'covers at least 50 hours at 40 words/minute' };
  const generated = generatedCorpus(language.code);
  const gdlDocs = language.code === 'hi' ? (readJson(path.join(root, 'data', 'sources', 'hi', 'gdl', 'gdl-library-documents.json')) as AnyRecord[] | undefined) ?? [] : [];
  const gdlSignatures = new Set(gdlDocs.map((doc) => doc.review?.contentSignature).filter(Boolean));
  reports.push({ language: language.code, name: language.name, observed: { catalogueStages: stages.length, catalogueWorks: works.length, installedLibrary: Boolean(manifest), installedWorks: installedWorks.length, installedTexts: totalTexts, installedWords: totalWords, publishedByClass, installedManifest: manifest ? { id: manifest.id, builtAt: manifest.builtAt, works: manifest.works, texts: manifest.texts, words: manifest.words } : null, classCounts: installedWorks.reduce((out: AnyRecord, entry) => { const key = classify(entry, works.find((work) => String(work.id).endsWith(':' + entry.slug))); out[key] = (out[key] ?? 0) + 1; return out; }, {}), sentenceMetrics: { sourcesMeasured: allMetrics.length, sentences: allMetrics.reduce((sum, metric) => sum + metric.sentences, 0), meanSentenceWords: allMetrics.length ? Number((allMetrics.reduce((sum, metric) => sum + (metric.meanSentenceWords ?? 0), 0) / allMetrics.length).toFixed(1)) : null }, unpublishedGenerated: { documents: generated.length, words: generated.reduce((sum, doc) => sum + words(sentenceTexts(doc.sections).join(' ')), 0), note: 'Generated drafts are counted separately from published library provenance and are not treated as installed or CEFR evidence.' }, gdlHindi: language.code === 'hi' ? { documents: gdlDocs.length, uniqueContentSignatures: gdlSignatures.size, duplicateDocumentCount: gdlDocs.length - gdlSignatures.size, readingLevelEvidence: 'The retained GDL catalogue exposes titles, descriptions, publisher and licence, but no publisher reading-level field; course Class 1 placement is catalogue placement, not independent level evidence.' } : null }, stageCounts, works: workRows, planning });
}

const report = { schema: 1, generatedAt: '2026-10-02', methodology: { observed: 'Counts come from course catalog exports and installed public/library manifests/provenance. A work is installed only when it has a published provenance entry; catalogue recommendations and empty stage slots are reported as planning signals, not proven CEFR gaps.', publishedOnly: 'Installed text and word totals are taken from published provenance entries. Scripture and secular/heritage classes are separated in publishedByClass; generated unreviewed drafts are counted separately and never inflate installed coverage.', classification: 'Scripture is separated from secular reading. Heritage means an installed public-domain or scan-backed source; modern-source-authored and modern-standard-or-unreviewed works remain separate.', limitations: 'Word and sentence metrics are source-level approximations and may include front matter or document segmentation artifacts. They are not CEFR measurements or native-speaker review. Thai word counts require adapter tokenization; Latin-script and Devanagari word counts use Unicode-letter approximations.' }, languages: reports };
for (const language of reports) {
  const dir = path.join(root, 'data', 'corpus', language.language);
  const docs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => readJson(path.join(dir, name)) as AnyRecord).filter((doc) => doc?.schemaVersion === 2 && doc.contentType !== 'scripture') : [];
  language.observed.bundledSecular = { documents: docs.length, published: docs.filter((doc) => computePublished(doc).published).length,
    note: 'Bundled document publication is counted independently of catalogue work placement and the lazy library.' };
}
fs.writeFileSync(path.join(outDir, 'reading-ladder-audit.json'), JSON.stringify(report, null, 2) + '\n');
const markdown = [
  '# Reading ladder audit', '', 'Generated from current course catalogues, published library provenance and bundled document publication decisions. Shelf placement is an orientation; an empty work slot does not prove a CEFR gap.', '',
  '| Language | Installed works / texts | Scripture words | Secular words | Published bundled secular texts | Generated drafts awaiting review |',
  '|---|---:|---:|---:|---:|---:|',
  ...reports.map((row) => { const o = row.observed; const scripture = o.publishedByClass.scripture?.words ?? 0; return `| ${row.name} | ${o.installedWorks} / ${o.installedTexts} | ${scripture.toLocaleString('en-US')} | ${(o.installedWords - scripture).toLocaleString('en-US')} | ${o.bundledSecular.published} | ${o.unpublishedGenerated.documents} |`; }), '',
  'The machine report is [reading-ladder-audit.json](../data/benchmarks/reading-ladders/reading-ladder-audit.json). It separates historical/heritage reading from modern source-authored reading. Source era and learner difficulty are different facts: none of these totals certifies A0–B1 coverage.', '',
  'Prioritize 60–70% of human review on controlled and easy A0–B1 material, and 20–30% on modern Albanian and Hindi linguistic quality. The [review queue](READING_REVIEW_QUEUE.md) lists the current generated drafts; a tool or source-fidelity check never substitutes for native review of generated lessons.', '',
  'Hindi’s GDL collection contains 124 document IDs and 92 unique content signatures. The 32 duplicate records do not provide additional distinct exposure. The retained catalogue has no independent publisher reading-level field; Class 1 is a course placement decision.', '',
  'German and Spanish now have short licensed native-language source readers alongside heritage literature. Hindi also has accessible Premchand prose. Albanian’s contemporary article collection is an intermediate bridge, and historical/Gheg works remain distinct. Thai’s secular beginner drafts remain unpublished pending native review; its large Bible corpus does not solve that gap.', '',
  'A continuous ladder still requires linguistic review and learner coverage measurements: controlled/very easy → easy native → intermediate native → ordinary literature → unrestricted reading. Book counts alone cannot establish that continuity. Each course has a separate [Bible access route](BIBLE_ACCESS.md).', '',
  'The optional 40–80 assisted words/minute planning assumption gives 120,000–240,000 words for 50 hours. It is not a universal rate across scripts, proficiency levels or lookup habits. Unreviewed drafts and Scripture are kept separate when assessing easy secular exposure.', '',
];
fs.writeFileSync(path.join(root, 'docs', 'READING_LADDER_AUDIT.md'), markdown.join('\n'));
console.log(JSON.stringify(reports.map((r) => ({ language: r.language, catalogueWorks: r.observed.catalogueWorks, installedWorks: r.observed.installedWorks, installedTexts: r.observed.installedTexts, installedWords: r.observed.installedWords, stages: r.observed.catalogueStages })), null, 2));
