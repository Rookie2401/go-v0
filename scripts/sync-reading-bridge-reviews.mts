/** Integrate renewed source-fidelity reviews without replacing course source entries. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { contentSignatureOf } from '../src/ingest';
import type { CorpusDocument } from '../src/ingest';
import type { BuildManifest } from '../src/library/build';
import type { Work } from '../src/core';

const recordsFile = 'src/course/reading-bridge-works.json';
const records: Record<string, Work[]> = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));

for (const [lang, folder] of [['de', 'de'], ['es', 'es-es']]) {
  const sourceRoot = `data/sources/reading-bridge/${folder}`;
  const source: BuildManifest = JSON.parse(fs.readFileSync(`${sourceRoot}/library-manifest.json`, 'utf8'));
  const combinedFile = `data/sources/course-library/${lang}.json`;
  const combined: BuildManifest = JSON.parse(fs.readFileSync(combinedFile, 'utf8'));
  const installed = JSON.parse(fs.readFileSync(`public/library/${lang}/provenance.json`, 'utf8'));
  let renewed = 0;
  for (const entry of source.entries) {
    const target = combined.entries.find(e => e.slug === entry.slug);
    if (!target) continue; // Preserve the source lane's excluded candidates.
    const filename = path.join(sourceRoot, entry.source.file);
    const bytes = fs.readFileSync(filename);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const doc = JSON.parse(bytes.toString('utf8')) as CorpusDocument;
    if (doc.generated === true || doc.source.authorship === 'generated' || entry.review?.status !== 'reviewed' || doc.review?.status !== 'reviewed' || doc.review?.contentSignature !== contentSignatureOf(doc)) throw new Error(`${entry.slug}: reviewed source does not match`);
    // The source reviewer has renewed the paragraph signature; bind its serialization too.
    entry.review.coversSourceSha256 = hash;
    if (path.resolve('data/sources', target.source.file) !== path.resolve(filename)) throw new Error(`${entry.slug}: source identity changed`);
    target.review = entry.review;
    const built = installed.works.find((w: any) => w.slug === entry.slug);
    const record = records[lang]?.find(w => w.id.endsWith(`:${entry.slug}`));
    if (record && built?.source.sha256 === hash && built.published === built.texts) {
      record.ingestion = 'ingested';
      record.readiness = 'implemented';
    }
    renewed++;
  }
  fs.writeFileSync(combinedFile, JSON.stringify(combined, null, 2) + '\n');
  fs.writeFileSync(`${sourceRoot}/library-manifest.json`, JSON.stringify(source, null, 2) + '\n');
  console.log(`${lang}: synchronized ${renewed} exact source review records`);
}
fs.writeFileSync(recordsFile, JSON.stringify(records, null, 2) + '\n');
