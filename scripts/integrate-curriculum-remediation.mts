/// <reference types="node" />
/** Install source-cleared additions after pure-build QA, preserving every previous document byte. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { courseForLang, hash, ids, type LanguageCode, type RegisterTag, type Work } from '../src/core';
import { computePublished, type CorpusDocument } from '../src/ingest';
import type { BuildEntry } from '../src/library/build';
import type { LibraryManifest } from '../src/library/format';
type Entry = BuildEntry & { translator?: string; pedagogicalRole?: string; source: BuildEntry['source'] & { sha256?: string; acquiredAt?: string } };
const date = '2026-10-04';
const allWorks: Work[] = [];
const integration: unknown[] = [];
const sha = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
for (const lang of ['de', 'es', 'hi', 'sq'] as LanguageCode[]) {
  const course = courseForLang(lang), installed = path.resolve('public/library', lang);
  const previous = JSON.parse(fs.readFileSync(path.join(installed, 'manifest.json'), 'utf8')) as LibraryManifest;
  const existing = new Map<string, string>();
  for (const shard of previous.shards) for (const row of JSON.parse(fs.readFileSync(path.join(installed, shard.file), 'utf8')).rows) {
    existing.set(row.documentPath, sha(fs.readFileSync(path.join(installed, row.documentPath))));
  }
  const combinedFile = `data/sources/course-library/${lang}.json`;
  const combined = JSON.parse(fs.readFileSync(combinedFile, 'utf8')) as { entries: Entry[] };
  const provenance = JSON.parse(fs.readFileSync(path.join(installed, 'provenance.json'), 'utf8'));
  let addedTexts = 0, addedWorks = 0, addedWords = 0;
  let digest = previous.digest;
  const shards = [...previous.shards];
  for (const family of lang === 'de' ? ['de', 'modern'] : ['modern']) {
    const input = family === 'de' ? 'data/sources/curriculum-remediation/de/library-manifest.json' : `data/sources/curriculum-remediation/modern/${lang}-library-manifest.json`;
    const entries = (JSON.parse(fs.readFileSync(input, 'utf8')) as { entries: Entry[] }).entries;
    const builtRoot = path.resolve('data/review/curriculum-remediation/pure-build', lang, family);
    const built = JSON.parse(fs.readFileSync(path.join(builtRoot, 'manifest.json'), 'utf8')) as LibraryManifest;
    const addedProvenance = JSON.parse(fs.readFileSync(path.join(builtRoot, 'provenance.json'), 'utf8'));
    if (addedProvenance.refused?.length) throw new Error('All batch sources must pass pure-build QA before integration');
    for (const entry of entries) {
      if (combined.entries.some(e => e.slug === entry.slug)) throw new Error(`Already integrated ${entry.slug}; do not rerun single-use installation`);
      const file = path.posix.join(path.posix.dirname(input).replace(/^data\/sources\//, ''), entry.source.file);
      const sourceHash = sha(fs.readFileSync(path.join('data/sources', file)));
      if (sourceHash !== entry.review?.coversSourceSha256) throw new Error(`Source changed after review: ${entry.slug}`);
        const registers: RegisterTag[] = family === 'de' ? ['historical', 'literary'] : ['standard'];
        if (lang === 'hi') entry.streams = ['knowledge'];
      entry.source = { ...entry.source, file, sourceHash, retrievedAt: date, licence: entry.rights.licensing ?? 'Public domain in the United States', modifications: entry.source.provenance };
      entry.rights = { ...entry.rights, checksum: sourceHash, retrievedAt: date, sourceRepository: family === 'de' ? 'Project Gutenberg' : 'Global Voices',
        licence: entry.rights.licensing ?? 'US Public Domain', commercialUse: true, attributionRequired: family !== 'de',
          userImportOnly: false, jurisdictions: Object.keys(entry.rights.statusByJurisdiction ?? {}),
          compliance: 'Text-only edition; retain credited source and licence; excluded media and audio; native placement review pending.',
          modifications: entry.source.provenance, proofreading: 'Exact source extraction checked by tool; native placement review pending' };
      entry.curriculum = { lifecycle: 'published', role: family === 'de' ? 'graded' : 'authentic', registers, rejectionReasons: [],
        provenance: { kind: 'original', sourceTitle: entry.title, description: entry.source.provenance }, audio: { state: 'unavailable', rightsCleared: false } };
      combined.entries.push(entry);
      allWorks.push({ id: ids.work(course.id, entry.slug), courseId: course.id, lang, stageId: ids.stage(course.id, entry.stage!),
        role: 'subsidiary', order: 100 + allWorks.length, title: entry.title, author: entry.author, translator: entry.translator,
        edition: entry.source.edition, sourceUrl: entry.source.url, purpose: ['Provisional bridge placement from adapter measurements; native placement and transition validation pending'],
        registers, rights: entry.rights, bibliographyVerified: true, streams: lang === 'hi' ? ['knowledge'] : ['library'], genre: entry.genre, era: entry.era,
        variety: family === 'de' ? 'de' : lang === 'es' ? 'es' : lang === 'hi' ? 'hi-IN' : lang === 'sq' ? 'sq' : 'de-DE',
        ingestion: 'ingested', readiness: 'implemented', orthography: family === 'de' ? 'Historical original German spelling; not modernized' : 'Contemporary publisher wording',
        modernization: 'original', notes: 'Text only. Source-fidelity tool review; no native review, recorded audio or learner transition validation claimed.' });
    }
    for (let i = 0; i < built.shards.length; i++) {
      const shard = built.shards[i];
      const raw = JSON.parse(fs.readFileSync(path.join(builtRoot, shard.file), 'utf8'));
      for (const row of raw.rows) {
        const entry = entries.find(e => row.workId === ids.work(course.id, e.slug));
        if (!entry) throw new Error(`No source entry for ${row.id}`);
        const document = JSON.parse(fs.readFileSync(path.join(builtRoot, row.documentPath), 'utf8')) as CorpusDocument;
        document.curriculum = entry.curriculum;
        if (lang === 'hi') { row.stream = 'knowledge'; row.streams = ['knowledge']; document.streams = ['knowledge']; }
        document.source.sourceHash = entry.source.sourceHash;
        document.source.retrievedAt = date;
        document.source.licence = entry.source.licence;
        document.source.modifications = entry.source.modifications;
        document.source.licenseNote = family === 'de' ? 'Exact Project Gutenberg edition: public domain in the United States only. https://www.gutenberg.org/policy/license.html' : 'CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/';
        if (!computePublished(document).published) throw new Error(`Publication gate refused ${row.id}`);
        for (const file of [row.documentPath, row.profilePath]) {
          const target = path.join(installed, file);
          if (fs.existsSync(target)) throw new Error(`Refuse to overwrite ${file}`);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          if (file === row.documentPath) fs.writeFileSync(target, JSON.stringify(document)); else fs.copyFileSync(path.join(builtRoot, file), target);
        }
      }
      const content = JSON.stringify(raw), file = `index/curriculum-remediation-${date}-${family}-${i}.json`;
      if (fs.existsSync(path.join(installed, file))) throw new Error(`Refuse to overwrite ${file}`);
      fs.writeFileSync(path.join(installed, file), content);
      shards.push({ ...shard, file, ...(lang === 'hi' ? { stream: 'knowledge', streams: ['knowledge'] } : {}) }); digest = hash(digest + hash(content));
    }
    for (const work of addedProvenance.works) {
      const entry = entries.find(e => e.slug === work.slug)!;
      work.source = entry.source; work.rights = entry.rights;
    }
    provenance.works.push(...addedProvenance.works);
    addedTexts += built.texts; addedWorks += built.works; addedWords += built.words;
  }
  // All pre-existing documents retain their exact bytes, including Bible editions.
  for (const [file, before] of existing) if (sha(fs.readFileSync(path.join(installed, file))) !== before) throw new Error(`Pre-existing document altered ${file}`);
  fs.writeFileSync(path.join(installed, 'manifest.json'), JSON.stringify({ ...previous, id: `library-${lang}@${date}`, builtAt: date,
    texts: previous.texts + addedTexts, works: previous.works + addedWorks, words: previous.words + addedWords, digest, shards }));
  fs.writeFileSync(path.join(installed, 'provenance.json'), JSON.stringify(provenance, null, 2));
  fs.writeFileSync(combinedFile, JSON.stringify(combined, null, 2));
  integration.push({ lang, addedWorks, addedTexts, addedWords, previousDocuments: existing.size, previousDocumentHashesUnchanged: true });
  console.log(`${lang}: +${addedWorks} works, +${addedTexts} reading units, +${addedWords} tokens; all prior document bytes preserved`);
}
fs.writeFileSync('src/course/curriculum-acquired-works.json', JSON.stringify(allWorks, null, 2));
fs.writeFileSync('data/review/curriculum-remediation/integration.json', JSON.stringify({ date, integration }, null, 2));
