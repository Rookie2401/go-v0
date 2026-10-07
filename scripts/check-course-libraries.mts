/// <reference types="node" />
/** Check installed lazy libraries without importing the full books into a learner database.
 * npm run library:check -- [--require hi,de,es,th,sq] [--library <dir>]   (--library: check a scratch rebuild instead of public/library) */
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import { THAI_WORKS, SPANISH_WORKS, GERMAN_WORKS, HINDI_WORKS, ALBANIAN_WORKS } from '../src/course';
import { validateDocument, computePublished, type CorpusDocument } from '../src/ingest';
import { bundleDecision } from '../src/ingest/rights';
import { parseManifest, parseShard, documentPathOf } from '../src/library/format';
import type { LanguageCode } from '../src/core';

const works = [...THAI_WORKS, ...SPANISH_WORKS, ...GERMAN_WORKS, ...HINDI_WORKS, ...ALBANIAN_WORKS];
const adapters = createAdapterRegistry();
const verifiedFile = 'data/verified/scripture.json';
const verified = fs.existsSync(verifiedFile) ? JSON.parse(fs.readFileSync(verifiedFile, 'utf8')) : { translations: [] };
const release = process.env.GO_RELEASE_JURISDICTIONS?.split(',').map((s) => s.trim()).filter(Boolean);
// --require hi,de,es,th,sq: a missing library is a failure (npm run build passes all five), unless GO_ALLOW_MISSING_CONTENT=1 says this
// build knowingly ships without them (a developer build on a machine without the built libraries).
const argv = process.argv.slice(2).filter((a) => a !== '--');
const reqAt = argv.indexOf('--require');
// --library <dir>: check the libraries under <dir> (a rebuild into a scratch directory) instead of public/library
const libAt = argv.indexOf('--library');
const libraryDir = libAt >= 0 ? (argv[libAt + 1] ?? 'public/library') : 'public/library';
const requiredLibs = reqAt >= 0 && process.env.GO_ALLOW_MISSING_CONTENT !== '1' ? (argv[reqAt + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean) : [];
let failures = 0; let shownErrors = 0;
const report = (message: string) => { if (shownErrors++ < 20) console.error(message); };
// These manifests are the release source of truth for the combined course
// libraries.  Keep this check here so a scripture-only rebuild cannot appear
// healthy simply because its own internal checks pass.
const combinedManifestLanguages = new Set(['de', 'es', 'hi', 'th', 'sq']);
const combinedSources = new Map<string, { slug: string; courseId?: string; withheld?: boolean; withheldReason?: string }[]>();
for (const lang of combinedManifestLanguages) {
  const file = path.resolve(`data/sources/course-library/${lang}.json`);
  if (!fs.existsSync(file)) { failures++; report(`${lang}: combined source manifest is missing: ${file}`); continue; }
  const source = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: { slug?: string; courseId?: string; withheld?: boolean; withheldReason?: string }[] };
  const entries = (source.entries ?? []).map((entry) => ({
    slug: String(entry.slug ?? ''),
    courseId: entry.courseId ? String(entry.courseId) : undefined,
    withheld: entry.withheld,
    withheldReason: entry.withheldReason,
  }));
  for (const entry of entries) {
    if (!entry.slug) { failures++; report(`${lang}: combined source manifest has an entry without slug`); }
    if (entry.withheld && !entry.withheldReason) { failures++; report(`${lang}:${entry.slug}: withheld entry must include withheldReason`); }
  }
  combinedSources.set(lang, entries);
}
for (const lang of ['hi', 'de', 'es', 'th', 'sq'] as LanguageCode[]) {
  const root = path.resolve(libraryDir, lang);
  const manifestFile = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    if (requiredLibs.includes(lang)) { failures++; report(`${lang}: required library missing: run npm run library:build for ${lang} (docs/COURSE_CONTENT_IMPORTS.md), or set GO_ALLOW_MISSING_CONTENT=1 for a build without it`); }
    else console.log(`${lang}: no installed library`);
    continue;
  }
  const manifest = parseManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf8')), lang);
  if (!manifest) { failures++; report(`${lang}: invalid manifest`); continue; }
  const provenanceFile = path.join(root, 'provenance.json');
  const provenance = fs.existsSync(provenanceFile) ? JSON.parse(fs.readFileSync(provenanceFile, 'utf8')) as { refused?: { slug?: string; reasons?: string[] }[] } : {};
  const refused = new Map((provenance.refused ?? []).filter((entry) => entry.slug && entry.reasons?.length).map((entry) => [entry.slug as string, entry.reasons as string[]]));
  let checked = 0, published = 0;
  const ids = new Set<string>();
  const workCounts = new Map<string, number>();
  for (const shard of manifest.shards) {
    const rows = parseShard(JSON.parse(fs.readFileSync(path.join(root, shard.file), 'utf8')), lang);
    if (rows.length !== shard.rows) { failures++; report(`${lang}: shard row count differs: ${shard.file}`); }
    for (const row of rows) {
      if (ids.has(row.id)) { failures++; report(`${lang}: duplicate text ${row.id}`); }
      ids.add(row.id);
      if (row.workId) workCounts.set(row.workId, (workCounts.get(row.workId) ?? 0) + 1);
      const relative = documentPathOf(row.id);
      if (!relative || relative.includes('..') || path.isAbsolute(relative)) { failures++; report(`${row.id}: invalid document path`); continue; }
      const doc = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')) as CorpusDocument;
      const issues = validateDocument(doc, { registry: adapters, destination: 'library' }).filter((i) => i.severity === 'error');
      const decision = bundleDecision(doc, { release, work: (l, slug) => works.find((w) => w.lang === l && w.id.endsWith(`:${slug}`))?.rights });
      const publication = computePublished(doc);
      if (doc.contentType === 'scripture') {
        const record = verified.translations.find((t: { lang: string; translationId: string }) => t.lang === lang && t.translationId === doc.scripture?.translationId);
        for (const section of doc.sections) for (const paragraph of section.paragraphs) {
          if (!('sentences' in paragraph)) continue;
          for (const sentence of paragraph.sentences) {
            const expected = (sentence.verseRefs ?? []).map((ref) => record?.verses?.[ref]?.text).join(' ');
            if (!expected || expected !== sentence.text) { failures++; report(`${row.id}: verse differs from its verification record: ${sentence.verseRefs?.join(', ')}`); }
          }
        }
      }
      if (issues.length || decision.verdict !== 'bundle' || publication.published !== row.published) {
        failures++;
        report(`${row.id}: ${issues.map((i) => i.message).join('; ')}; rights ${decision.verdict}: ${decision.reason}; publication matches index: ${publication.published === row.published}`);
      }
      if (publication.published) published++;
      checked++;
    }
  }
  if (checked !== manifest.texts) { failures++; report(`${lang}: manifest text count differs`); }
  const combined = combinedSources.get(lang);
  if (combined) {
    for (const entry of combined) {
      if (entry.withheld) continue;
      if (refused.has(entry.slug)) continue;
      const catalogueWork = works.find((work) => work.lang === lang && work.id.endsWith(`:${entry.slug}`));
      const workId = entry.courseId ? `work:${entry.courseId}:${entry.slug}` : catalogueWork?.id;
      if (!workId) {
        failures++;
        report(`${lang}: combined source entry ${entry.slug} cannot resolve a catalogue work id`);
        continue;
      }
      if (!workCounts.has(workId)) {
        failures++;
        report(`${lang}: combined source entry ${entry.slug} has no installed rows for ${workId}`);
      }
    }
    const expectedWorkIds = new Set(combined.filter((entry) => !entry.withheld && !refused.has(entry.slug)).map((entry) => {
      const catalogueWork = works.find((work) => work.lang === lang && work.id.endsWith(`:${entry.slug}`));
      return entry.courseId ? `work:${entry.courseId}:${entry.slug}` : catalogueWork?.id;
    }).filter((workId): workId is string => Boolean(workId)));
    for (const workId of workCounts.keys()) {
      if (!expectedWorkIds.has(workId)) {
        failures++;
        report(`${lang}: installed work ${workId} is absent from combined source manifest`);
      }
    }
  }
  console.log(`${lang}: ${manifest.works} works, ${checked} documents checked, ${published} published, ${manifest.words} words`);
}
console.log(`Library checks: ${failures} failure(s)`);
process.exitCode = failures ? 1 : 0;

