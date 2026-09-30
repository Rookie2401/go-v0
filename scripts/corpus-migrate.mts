/// <reference types="node" />
/**
 * npm run corpus:migrate
 * One-off conversion of the bundled version 1 documents (data/corpus/**) to schema version 2, in place. Documents
 * that are already version 2 are left alone (the command is repeatable). Verse text is never retyped: the es / de
 * Scripture verification is read from data/verified/scripture.json and attached only when the bundled wording is
 * identical to it. Nothing is written unless every converted document validates.
 */
import fs from 'node:fs';
import { migrateV1Document, validateBatch, type V1Document, type VerifiedScripture } from '../src/ingest';
import { collectJsonFiles, loadFiles, printIssues, registry } from './corpus-cli.mts';

const files = collectJsonFiles(['data/corpus']);
const loaded = loadFiles(files);
const verified = fs.existsSync('data/verified/scripture.json')
  ? (JSON.parse(fs.readFileSync('data/verified/scripture.json', 'utf8')) as VerifiedScripture)
  : undefined;
const v1 = loaded.filter((l) => (l.doc as { formatVersion?: unknown } | undefined)?.formatVersion === 1);
const siblings = v1.map((l) => l.doc as V1Document);

const converted = v1.map((l) => ({ file: l.file, ...migrateV1Document(l.doc as V1Document, { verified, siblings }) }));
const untouched = loaded.filter((l) => !v1.includes(l));
const batch = validateBatch([...converted.map((c) => c.doc), ...untouched.map((l) => l.doc)], { registry });
let errors = 0;
batch.documents.forEach((r) => {
  const e = r.issues.filter((i) => i.severity === 'error');
  errors += e.length;
  if (e.length) { console.log(`${r.id}: ${e.length} error(s)`); printIssues(e); }
});
for (const c of converted) for (const n of c.notes) console.log(`note: ${n}`);
if (errors) {
  console.error(`corpus:migrate - ${errors} validation error(s) after conversion; nothing written`);
  process.exit(1);
}
for (const c of converted) fs.writeFileSync(c.file, JSON.stringify(c.doc, null, 2) + '\n');
console.log(`corpus:migrate - converted ${converted.length} document(s) to schemaVersion 2, left ${untouched.length} unchanged`);
