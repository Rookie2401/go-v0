/// <reference types="node" />
/** Read-only inventory of every shipped document, including lazy chapters. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createAdapterRegistry } from '../src/adapters';
import { ids, LANGUAGES } from '../src/core';
import { computePublished, loadBundledCorpus, validateDocument, type CorpusDocument } from '../src/ingest';
import { parseManifest, parseShard } from '../src/library/format';
import { checkVerifiedScripture, type VerifiedTranslation } from './verified-scripture';
const output = process.argv[2];
if (!output) throw new Error('usage: content-inventory.mts <report.json>');
const adapters = createAdapterRegistry();
const documents: { location: string; doc: CorpusDocument; words?: number }[] = loadBundledCorpus().map(doc => ({ location: 'bundled', doc }));
const libraries = [];
for (const lang of LANGUAGES) {
  const root = path.join('public/library', lang);
  const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')), lang);
  if (!manifest) throw new Error(`invalid manifest ${lang}`);
  libraries.push(manifest);
  for (const shard of manifest.shards) for (const row of parseShard(JSON.parse(fs.readFileSync(path.join(root, shard.file), 'utf8')), lang)) {
    documents.push({ location: 'lazy', doc: JSON.parse(fs.readFileSync(path.join(root, row.documentPath!), 'utf8')), words: row.features.words });
  }
}
const errors: string[] = [];
const bodies = new Map<string, { id: string; location: string; scripture: boolean }[]>();
const identities = new Set<string>();
const byLanguage = Object.fromEntries(LANGUAGES.map(lang => [lang, { bundled: 0, lazy: 0, published: 0, unpublished: 0, generated: 0, scripture: 0, sentences: 0, paragraphs: 0, words: 0, review: {} as Record<string, number>, rights: {} as Record<string, number> }]));
for (const { location, doc, words } of documents) {
  const id = ids.text(doc.lang, doc.id), stats = byLanguage[doc.lang];
  if (identities.has(id)) errors.push(`canonical identity repeated: ${id}`);
  identities.add(id);
  const validation = validateDocument(doc, { registry: adapters });
  for (const issue of validation.filter(i => i.severity === 'error')) errors.push(`${id}: ${issue.code}: ${issue.message}`);
  stats[location as 'bundled' | 'lazy']++;
  stats[computePublished(doc).published ? 'published' : 'unpublished']++;
  stats.generated += Number(!!doc.generated); stats.scripture += Number(doc.contentType === 'scripture'); stats.words += words ?? 0;
  stats.review[doc.review.status] = (stats.review[doc.review.status] ?? 0) + 1;
  stats.rights[doc.source.rights] = (stats.rights[doc.source.rights] ?? 0) + 1;
  const paragraphs = doc.sections.flatMap(s => s.paragraphs);
  stats.paragraphs += paragraphs.length;
  stats.sentences += paragraphs.reduce((n, p) => n + ('sentences' in p ? p.sentences.length : 0), 0);
  const body = paragraphs.map(p => 'sentences' in p ? p.sentences.map(s => s.text).join(' ') : p.text).join(' ').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (body.length >= 40) {
    const key = `${doc.lang}:${crypto.createHash('sha256').update(body).digest('hex')}`;
    const rows = bodies.get(key) ?? []; rows.push({ id, location, scripture: doc.contentType === 'scripture' }); bodies.set(key, rows);
  }
}
const verified = JSON.parse(fs.readFileSync('data/verified/scripture.json', 'utf8')) as { translations: VerifiedTranslation[] };
const scripture = checkVerifiedScripture(documents.map(d => d.doc), verified.translations);
errors.push(...scripture.errors);
const duplicates = [...bodies.values()].filter(rows => rows.length > 1);
const report = { checkedAt: new Date().toISOString(), documents: documents.length, identities: identities.size, byLanguage, libraries,
  verifiedScriptureSentences: scripture.sentences, duplicates, errors,
  limits: ['Source-fidelity checks do not certify native-speaker quality or comprehension.', 'Inventory covers repository documents and installed lazy libraries; learner-owned device databases are not extracted.', 'Lazy word counts use the installed profile; bundled words are separately reported by corpus checks.'] };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`${documents.length} documents; ${identities.size} identities; ${scripture.sentences} verified Scripture sentences; ${duplicates.length} duplicate body groups; ${errors.length} errors`);
if (errors.length) process.exitCode = 1;
