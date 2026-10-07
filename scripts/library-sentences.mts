/// <reference types="node" />
/**
 * npm run library:sentences -- <lang|all> [--library <dir>] [--max-median 60] [--list]
 *
 * Per work of a built library: how many words are in a sentence as the learner will meet it. Declared sentences are
 * taken as stored; raw paragraphs are cut by the language adapter's `segmentSentences` (exactly what the importer
 * does); words are the adapter's word tokens. Lists every work whose MEDIAN sentence has more than --max-median words
 * (default 60: a whole paragraph stored as one "sentence" shows up here) and the longest sentence of each. Exit 1 when
 * a work is over the limit. Changes nothing. The same check runs inside `library:audit`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES, type LanguageCode } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import type { CorpusDocument } from '../src/ingest';
import { parseManifest, parseShard } from '../src/library/format';
import { MAX_MEDIAN_SENTENCE_WORDS, median, sentenceWordCounts } from '../src/library/sentences';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const target = args.find((a) => !a.startsWith('--') && a !== opt('library') && a !== opt('max-median'));
if (!target) { console.error('usage: library:sentences -- <lang|all> [--library <dir>] [--max-median 60] [--list]'); process.exit(1); }
const libRoot = path.resolve(opt('library') ?? 'public/library');
const maxMedian = Number(opt('max-median') ?? MAX_MEDIAN_SENTENCE_WORDS);
const list = args.includes('--list');
const adapters = createAdapterRegistry();

let over = 0;
for (const lang of (target === 'all' ? [...LANGUAGES] : [target]) as LanguageCode[]) {
  const root = path.join(libRoot, lang);
  if (!fs.existsSync(path.join(root, 'manifest.json'))) { console.log(`${lang}: no library at ${root}`); continue; }
  const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')), lang)!;
  const adapter = adapters.get(lang);
  const byWork = new Map<string, { lens: number[]; texts: number }>();
  let texts = 0, words = 0, sentences = 0;
  for (const shard of manifest.shards) {
    for (const row of parseShard(JSON.parse(fs.readFileSync(path.join(root, shard.file), 'utf8')), lang)) {
      const doc = JSON.parse(fs.readFileSync(path.join(root, row.documentPath!), 'utf8')) as CorpusDocument;
      const lens = sentenceWordCounts(doc, adapter);
      const e = byWork.get(row.workId ?? row.id) ?? byWork.set(row.workId ?? row.id, { lens: [], texts: 0 }).get(row.workId ?? row.id)!;
      e.lens.push(...lens); e.texts++; texts++; sentences += lens.length; words += lens.reduce((a, b) => a + b, 0);
    }
  }
  const bad = [...byWork].filter(([, e]) => median(e.lens) > maxMedian);
  console.log(`${lang}: ${texts} texts, ${byWork.size} works, ${words} words, ${sentences} sentences; median of all ${median([...byWork.values()].flatMap((e) => e.lens))}; works with a median sentence over ${maxMedian} words: ${bad.length}`);
  for (const [w, e] of list ? [...byWork] : bad) console.log(`  ${median(e.lens) > maxMedian ? 'OVER' : '    '} ${w.split(':').pop()}: median ${median(e.lens)}, longest ${Math.max(...e.lens)}, ${e.lens.length} sentences in ${e.texts} text(s)`);
  over += bad.length;
}
process.exit(over ? 1 : 0);
