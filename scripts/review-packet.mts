/// <reference types="node" />
/**
 * npm run review:packet -- --unit <path to a unit document> [--out <dir>]
 *
 * Writes, for a person who will review a ladder unit (docs/LADDER.md, "The pipeline"):
 *   <unit id>.packet.html   a self-contained, printable packet: the unit's numbered sentences, the eight checklist questions
 *                           in plain words, room for a correction under every sentence, and the reviewer's details
 *   <unit id>.return.json   the template the reviewer fills in (or someone types the paper into); `npm run review:apply`
 *                           reads it back
 * into `--out` (default `data/review/<lang>/packets/`, which is git-ignored). The unit is never changed.
 *
 * A return file that already sits there is never overwritten: it is moved aside to `<unit id>.return.previous-<n>.json`.
 * Exit codes: 0 written; 1 usage error, unreadable / invalid unit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { validateBatch, type CorpusDocument } from '../src/ingest';
import { buildReviewPacket, pipelineSummary } from '../src/ingest/pipeline';
import { printIssues, registry } from './corpus-cli.mts';

const USAGE = 'usage: npm run review:packet -- --unit <path to a unit document> [--out <dir>]';
const fail = (msg: string): never => { console.error(msg); process.exit(1); };

const argv = process.argv.slice(2).filter((a) => a !== '--');
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) fail(`unexpected argument ${a}\n${USAGE}`);
  const eq = a.indexOf('=');
  const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
  if (!['unit', 'out'].includes(name)) fail(`unknown option --${name}\n${USAGE}`);
  if (eq > 0) { flags.set(name, a.slice(eq + 1)); continue; }
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value\n${USAGE}`);
  flags.set(name, value);
  i++;
}
const unitArg = flags.get('unit');
if (!unitArg) fail(`--unit is required\n${USAGE}`);
const unitFile = path.resolve(unitArg!);

let raw = '';
try { raw = fs.readFileSync(unitFile, 'utf8'); } catch (e) { fail(`cannot read ${unitFile}: ${e instanceof Error ? e.message : String(e)}`); }
let doc: CorpusDocument;
try { doc = JSON.parse(raw.replace(/^﻿/, '')) as CorpusDocument; } catch (e) { fail(`${unitFile}: not valid JSON: ${e instanceof Error ? e.message : String(e)}`); }
doc = doc!;

// a reviewer must not be handed a broken unit
const batch = validateBatch([doc], { registry });
const errors = batch.documents[0].issues.filter((i) => i.severity === 'error');
if (errors.length) {
  console.error(`review:packet - ${unitFile} does not validate; no packet written`);
  printIssues(errors);
  process.exit(1);
}

const adapter = registry.get(doc.lang);
const unitPath = path.relative(process.cwd(), unitFile).split(path.sep).join('/');
const packet = buildReviewPacket(doc, { segment: (text) => adapter.segmentSentences(text), unitPath });

const outDir = path.resolve(flags.get('out') ?? path.join('data', 'review', doc.lang, 'packets'));
fs.mkdirSync(outDir, { recursive: true });
const htmlFile = path.join(outDir, packet.htmlName);
const returnFile = path.join(outDir, packet.returnName);
const returnText = JSON.stringify(packet.returnTemplate, null, 2) + '\n';

let movedAside: string | undefined;
if (fs.existsSync(returnFile) && fs.readFileSync(returnFile, 'utf8') !== returnText) {
  let k = 1;
  while (fs.existsSync(path.join(outDir, `${doc.id}.return.previous-${k}.json`))) k++;
  movedAside = path.join(outDir, `${doc.id}.return.previous-${k}.json`);
  fs.renameSync(returnFile, movedAside);
}
fs.writeFileSync(htmlFile, packet.html, 'utf8');
fs.writeFileSync(returnFile, returnText, 'utf8');

console.log(`review:packet - ${unitFile}  [${doc.id}]`);
console.log(`  ${packet.sentences.length} sentence(s); language ${doc.lang}${doc.variety ? `, variety ${doc.variety}` : ''}; pipeline: ${pipelineSummary(doc).line}`);
console.log(`  packet  ${htmlFile}`);
console.log(`  return  ${returnFile}`);
if (movedAside) console.log(`  the return file that was there was kept as ${movedAside}`);
if (!doc.pipeline) console.log('  note: this unit has no pipeline block yet; review:apply will refuse it until it has one (state machine-draft)');
console.log(`next: the reviewer fills in the return file (or the paper); then npm run review:apply -- ${path.relative(process.cwd(), returnFile).split(path.sep).join('/')}`);
