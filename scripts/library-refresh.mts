/// <reference types="node" />
/** Refresh derived profiles of an installed library, preserving every document byte and canonical ID.
 * Writes a separate output directory for audit before installation; never downloads or edits source wording.
 * npm exec vite-node scripts/library-refresh.mts -- <lang> <output-root>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { COURSES, hash, type LanguageCode } from '../src/core';
import { createAuditStore as createMemoryStore } from './audit-store';
import { createAdapterRegistry } from '../src/adapters';
import { createCourseCatalog } from '../src/course';
import { createFileLexiconSource } from '../src/dict/file';
import { importDocuments, type CorpusDocument } from '../src/ingest';
import { parseManifest, parseShard, safeRelative } from '../src/library/format';
import { groupedAnalysesOf, measureStoredText } from '../src/library/measure';

const [lang, output] = process.argv.slice(2).filter(a => a !== '--') as [LanguageCode, string];
if (!COURSES.some(c => c.lang === lang) || !output) throw new Error('usage: library-refresh.mts <lang> <separate output-root>');
const source = path.resolve('public/library', lang), target = path.resolve(output, lang);
if (target === source || target.startsWith(source + path.sep) || fs.existsSync(target)) throw new Error('output must be a new, separate directory');
const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8')), lang);
if (!manifest) throw new Error('invalid library manifest');
const adapters = createAdapterRegistry();
const dict = createFileLexiconSource('public/dict', lang);
const course = COURSES.find(c => c.lang === lang)!;
const catalogue = createMemoryStore();
await createCourseCatalog({ store: catalogue }).install(course.id);
const works = await catalogue.works.all(), stages = await catalogue.stages.all();
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true, errorOnExist: true });
let count = 0, words = 0, digest = hash('');
const documents = new Map<string, string>();
for (const shard of manifest.shards) {
  const raw = JSON.parse(fs.readFileSync(path.join(source, shard.file), 'utf8'));
  const rows = parseShard(raw, lang);
  if (rows.length !== shard.rows) throw new Error(`malformed shard ${shard.file}`);
  for (const row of rows) {
    if (!safeRelative(row.documentPath) || !safeRelative(row.profilePath)) throw new Error(`unsafe path ${row.id}`);
    const bytes = fs.readFileSync(path.join(source, row.documentPath));
    documents.set(row.documentPath, crypto.createHash('sha256').update(bytes).digest('hex'));
    const doc = JSON.parse(bytes.toString('utf8')) as CorpusDocument;
    const store = createMemoryStore();
    await store.works.bulkPut(works); await store.stages.bulkPut(stages);
    const report = await importDocuments(store, adapters, [doc], { clock: () => '2026-10-03T00:00:00.000Z', lexicon: l => l === lang ? dict : undefined });
    if (!report.ok || report.documents[0]?.action === 'rejected') throw new Error(`import failed: ${row.id}`);
    const text = await store.texts.get(row.id);
    if (!text || text.published !== row.published || text.workId !== row.workId || text.chapter?.index !== row.chapter) throw new Error(`source metadata changed: ${row.id}`);
    const measured = await measureStoredText(store, row.id, { analysesOf: groupedAnalysesOf(store) });
    if (!measured) throw new Error(`cannot measure ${row.id}`);
    row.features = measured.features;
    fs.writeFileSync(path.join(target, row.profilePath), JSON.stringify(measured.profile));
    words += measured.profile.words; count++;
    if (count % 100 === 0) console.log(`refreshed ${count}/${manifest.texts} texts`);
  }
  const content = JSON.stringify({ ...raw, rows });
  fs.writeFileSync(path.join(target, shard.file), content);
  digest = hash(digest + hash(content));
}
if (count !== manifest.texts) throw new Error('text count changed');
for (const [file, sha] of documents) {
  if (crypto.createHash('sha256').update(fs.readFileSync(path.join(target, file))).digest('hex') !== sha) throw new Error(`document changed: ${file}`);
}
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ ...manifest, words, digest }));
fs.writeFileSync(path.join(target, 'profile-refresh.json'), JSON.stringify({ tool: 'library-refresh@1', checkedAt: new Date().toISOString(), texts: count, sourceDigest: manifest.digest, digest, documentsUnchanged: true }));
console.log(`${lang}: refreshed ${count} profiles; ${words} words; every source document byte unchanged; output ${target}`);
