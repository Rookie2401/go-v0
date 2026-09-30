/// <reference types="node" />
/**
 * npm run corpus:check
 * Checks the bundled corpus (data/corpus): validates the batch, imports it into a throwaway in-memory store twice
 * (the second import must change nothing), prints each document's publication status, and confirms that the
 * verified Scripture (data/verified/scripture.json) is byte-identical to the bundled text. Exit code 1 on any failure.
 */
import fs from 'node:fs';
import { createMemoryStore } from '../src/core';
import { importDocuments, type CorpusDocument } from '../src/ingest';
import { collectJsonFiles, loadFiles, registry, validateAndPrint } from './corpus-cli.mts';

const files = collectJsonFiles(['data/corpus']);
const loaded = loadFiles(files);
const run = validateAndPrint(loaded);
let failures = run.errors;

let published = 0;
let unpublished = 0;
let unchangedOnReimport = false;
if (!run.errors) {
  const store = createMemoryStore();
  const docs = loaded.map((l) => l.doc);
  const clock = () => '2026-01-01T00:00:00.000Z';
  const first = await importDocuments(store, registry, docs, { clock });
  const second = await importDocuments(store, registry, docs, { clock: () => '2027-01-01T00:00:00.000Z' });
  unchangedOnReimport = second.documents.every((d) => d.action === 'unchanged');
  if (!first.ok || !unchangedOnReimport) { failures++; console.log('ERROR: the second import of the unchanged corpus was not a no-op'); }
  for (const d of first.documents) {
    if (d.published) published++; else unpublished++;
    console.log(`${d.textId}  ${d.published ? 'PUBLISHED' : 'unpublished'}  v${d.contentVersion}  ${d.sentencesAdded} sentence(s)${d.published ? '' : `\n      ${d.unpublishedReasons.join('\n      ')}`}`);
  }
}

// verified scripture must be byte-identical to the bundled text
let verifiedVerses = 0;
if (fs.existsSync('data/verified/scripture.json')) {
  const verified = JSON.parse(fs.readFileSync('data/verified/scripture.json', 'utf8')) as { translations: Array<{ lang: string; verses: Record<string, { text: string }> }> };
  for (const t of verified.translations) {
    for (const l of loaded) {
      const d = l.doc as CorpusDocument | undefined;
      if (!d || d.lang !== t.lang || d.contentType !== 'scripture') continue;
      for (const sec of d.sections) for (const p of sec.paragraphs) {
        if (!('sentences' in p)) continue;
        for (const s of p.sentences) {
          const want = (s.verseRefs ?? []).map((r) => t.verses[r]?.text).join(' ');
          if (s.text !== want) { failures++; console.log(`ERROR ${t.lang}: ${(s.verseRefs ?? []).join(',')} differs from data/verified/scripture.json`); }
          else verifiedVerses++;
        }
      }
    }
  }
}

console.log(`corpus:check - ${run.documents} document(s), ${run.errors} validation error(s), ${run.warnings} warning(s); ${published} published, ${unpublished} unpublished; re-import unchanged: ${unchangedOnReimport ? 'yes' : 'no'}; ${verifiedVerses} verified verse(s) byte-identical; ${failures ? 'FAILED' : 'OK'}`);
process.exit(failures ? 1 : 0);
