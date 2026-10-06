/** Stamp canonical German children’s documents with the project content signature. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { contentSignatureOf } from '../src/ingest/publish';

const root = 'data/sources/de-children-wikisource';
const date = process.argv.includes('--date') ? process.argv[process.argv.indexOf('--date') + 1] : '2026-10-02';
for (const file of ['grimm-khm-1850-documents.json', 'hauff-almanach-1826-documents.json']) {
  const full = path.join(root, file);
  const docs = JSON.parse(fs.readFileSync(full, 'utf8')) as any[];
  for (const doc of docs) {
    doc.review = { ...doc.review, reviewedAt: date, contentSignature: contentSignatureOf(doc) };
  }
  fs.writeFileSync(full, JSON.stringify(docs) + '\n');
  console.log(`${file}: signed ${docs.length} documents`);
}
const manifestPath = path.join(root, 'library-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const entry of manifest.entries) {
  entry.review = { ...entry.review, coversSourceSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, entry.source.file))).digest('hex') };
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
