/** Append verified source acquisitions without replacing existing canonical or deduplicated inputs. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ids, type LanguageCode, type Work } from '../src/core';
import { parseBuildManifest, type BuildManifest } from '../src/library/build';
import { BUNDLABLE_WORK_STATES } from '../src/ingest/rights';
import { GERMAN_WORKS, SPANISH_WORKS } from '../src/course';

const file = process.argv[2];
if (!file) throw new Error('Pass the acquired library-manifest.json path.');
const sourcesRoot = path.resolve('data/sources');
const sourceManifest = path.resolve(file);
const relative = (absolute: string) => {
  const result = path.relative(sourcesRoot, absolute);
  if (result.startsWith('..') || path.isAbsolute(result)) throw new Error(`Source escapes data/sources: ${absolute}`);
  return result.replaceAll('\\', '/');
};
relative(sourceManifest);
const raw = JSON.parse(fs.readFileSync(sourceManifest, 'utf8')) as BuildManifest;
const lang = raw.lang as LanguageCode;
const acquired = parseBuildManifest(raw, lang);
const courses: Record<LanguageCode, string> = { de: 'germany-de', es: 'honduras-es', hi: 'india-hi', sq: 'albania-sq', th: 'thailand-th', nb: 'norway-nb', nn: 'norway-nb', he: 'hebrew', el: 'greek', la: 'latin-la' };
const courseId = courses[lang];
if (!courseId) throw new Error(`Unsupported language: ${lang}`);
const combinedFile = `data/sources/course-library/${lang}.json`;
const combined = JSON.parse(fs.readFileSync(combinedFile, 'utf8')) as BuildManifest;
const recordsFile = 'src/course/reading-bridge-works.json';
const records = JSON.parse(fs.readFileSync(recordsFile, 'utf8')) as Partial<Record<LanguageCode, Work[]>>;
const acquiredRecordsFile = 'src/course/acquired-library-works.json';
const acquiredRecords = JSON.parse(fs.readFileSync(acquiredRecordsFile, 'utf8'));
const nativeCatalogueIds = new Set([...GERMAN_WORKS, ...SPANISH_WORKS].map((w) => w.id));
const provenanceFile = `public/library/${lang}/provenance.json`;
const installed = fs.existsSync(provenanceFile)
  ? new Map<string, string>(JSON.parse(fs.readFileSync(provenanceFile, 'utf8')).works.map((w: { slug: string; source: { sha256: string } }) => [w.slug, w.source.sha256]))
  : new Map<string, string>();
const additions: Work[] = [];
let appended = 0;
for (const entry of acquired.entries) {
  const sourceFile = path.resolve(path.dirname(sourceManifest), entry.source.file);
  const sourcePath = relative(sourceFile);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
  if (entry.review?.coversSourceSha256 !== digest) throw new Error(`${entry.slug}: review is not bound to these source bytes`);
  if (!BUNDLABLE_WORK_STATES.includes(entry.rights.state ?? '') || entry.rights.canBundle === false) throw new Error(`${entry.slug}: source is not cleared for bundling`);
  if (!entry.stage) throw new Error(`${entry.slug}: a curriculum shelf is required`);
  const existing = combined.entries.find((e) => e.slug === entry.slug);
  if (existing) {
    if (existing.source.file !== sourcePath) throw new Error(`${entry.slug}: existing source differs; refusing to replace it`);
    combined.entries[combined.entries.indexOf(existing)] = { ...existing, ...entry, courseId, source: { ...entry.source, file: sourcePath } };
  } else {
    combined.entries.push({ ...entry, courseId, source: { ...entry.source, file: sourcePath } });
    appended++;
  }
  const available = installed.get(entry.slug) === digest;
  const workId = ids.work(courseId, entry.slug);
  // Existing DE/ES recommendations receive acquired metadata through their existing registry.
  // Adding a second Work with their canonical identity would create duplicate catalogue rows.
  if ((lang === 'de' || lang === 'es') && nativeCatalogueIds.has(workId) && !(records[lang] ?? []).some((w) => w.id === workId)) {
    acquiredRecords[lang] ??= {};
    acquiredRecords[lang][entry.slug] = { rights: entry.rights, edition: entry.source.edition, sourceUrl: entry.source.url, installed: available };
    continue;
  }
  additions.push({
    id: workId, courseId, lang, stageId: ids.stage(courseId, entry.stage),
    role: 'subsidiary', order: 1200 + (records[lang]?.length ?? 0) + additions.length,
    title: entry.title, author: entry.author, edition: entry.source.edition, sourceUrl: entry.source.url,
    streams: entry.streams ?? [entry.stream ?? 'library'], purpose: ['source-authored reading to fill a documented material gap'],
    rights: { ...entry.rights, canBundleAudio: false, audiobook: 'unknown' },
    bibliographyVerified: true, optional: true, ingestion: available ? 'ingested' : 'catalogued', readiness: available ? 'implemented' : 'verified-ready',
    variety: entry.variety, genre: entry.genre, domains: entry.domains,
    notes: 'Authentic source wording and source credits retained. Shelf placement is course orientation; source-fidelity review does not certify a CEFR level or native linguistic review.',
  });
}
// All checks run before either release input is changed.
const updated = new Map(additions.map((w) => [w.id, w]));
records[lang] = (records[lang] ?? []).map((w) => {
  const replacement = updated.get(w.id);
  updated.delete(w.id);
  return replacement ? { ...replacement, order: w.order } : w;
});
records[lang].push(...updated.values());
fs.writeFileSync(combinedFile, JSON.stringify(combined, null, 2) + '\n');
fs.writeFileSync(recordsFile, JSON.stringify(records, null, 2) + '\n');
fs.writeFileSync(acquiredRecordsFile, JSON.stringify(acquiredRecords, null, 2) + '\n');
console.log(`${lang}: appended ${appended} verified source works; retained ${combined.entries.length - appended} existing entries`);
