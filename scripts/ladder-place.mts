/// <reference types="node" />
/**
 * Where could a candidate text enter the ladder? `npm run ladder:place -- --lang es <textId | path/to/document.json>`
 * Prints the candidate's coverage after Stage 0 and after each unit, and either "could enter after <unit>" (the first point
 * at which coverage is >= 95 %) or "library, not ladder (best: x % after the last unit)".
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LanguageCode } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import type { CorpusDocument } from '../src/ingest';
import { LadderFormatError, ladderFile, loadLadder, placeCandidate, resolveTextDocument } from '../src/ladder';

const root = path.resolve('.');
const argv = process.argv.slice(2).filter((a) => a !== '--');
let lang: string | undefined;
const rest: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--lang') lang = argv[++i];
  else rest.push(argv[i]);
}
if (!lang || rest.length !== 1) {
  console.error('usage: npm run ladder:place -- --lang <es|de|sq|th|hi> <textId | path/to/document.json>');
  process.exit(2);
}
const l = lang as LanguageCode;
const target = rest[0];

if (!fs.existsSync(ladderFile(l, root))) { console.error(`no ladder for ${l} yet (data/ladder/${l}/ladder.json not found)`); process.exit(2); }

let doc: CorpusDocument | undefined;
if (target.startsWith('text:')) {
  const found = resolveTextDocument(l, root, target);
  if (!found.doc) { console.error(`${target}: ${found.problem}`); process.exit(2); }
  doc = found.doc;
} else {
  const file = path.resolve(target);
  if (!fs.existsSync(file)) { console.error(`${target}: file not found`); process.exit(2); }
  doc = JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument;
  if (!Array.isArray(doc.sections)) { console.error(`${target}: not a corpus document (no sections)`); process.exit(2); }
}

try {
  const loaded = loadLadder(l, root);
  const adapter = createAdapterRegistry().get(l);
  const p = placeCandidate(loaded, doc, { adapter });
  console.log(`${target}: ${p.words} words; ${loaded.units.length} units${loaded.head.length ? ` after ${loaded.head.length} Stage 0 scenes` : ''}`);
  console.log('after'.padEnd(26) + 'coverage %');
  for (const s of p.steps) console.log(`${s.after.padEnd(26)}${(s.cov3 * 100).toFixed(1).padStart(8)}${s.cov3 >= p.threshold ? '  <= enters here' : ''}`);
  console.log(`\n${p.verdict}`);
} catch (e) {
  if (!(e instanceof LadderFormatError)) throw e;
  console.error(e.message);
  process.exit(1);
}
