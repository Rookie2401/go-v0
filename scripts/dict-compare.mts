/// <reference types="node" />
/**
 * npm run dict:compare -- --in <file.jsonl> --lang th [--last-modified YYYY-MM-DD] [--id kaikki-th@YYYY-MM-DD]
 *   [--source-url <url>] [--corpus data/corpus/th] [--text <file>] [--report docs/thai/DICTIONARY_REPORT.md]
 *   [--json data/review/th/disagreements.json] [--resolutions data/review/th/resolutions.json]
 * Compares the Thai hand data (word list, phrase units, compounds, tone exception lists) with the dictionary source
 * and writes the coverage report and the list of disagreements for a reviewer. Reads data, downloads nothing.
 * The dictionary id comes from --id, else from --last-modified, else from the Last-Modified line of headers.txt next
 * to the input. Exit 1 on bad arguments or unusable input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES, type LanguageCode } from '../src/core';
import { compareFile, lastModifiedFromHeaders, writeCompareOutputs } from '../src/dict/compare-node';
import { countByKind } from '../src/dict/compare';

const USAGE = 'usage: npm run dict:compare -- --in <file.jsonl> --lang th [--last-modified YYYY-MM-DD] [--id kaikki-th@YYYY-MM-DD] [--source-url <url>] [--corpus <dir>] [--text <file>] [--report <md>] [--json <json>] [--resolutions <json>]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  const k = args[i];
  const v = args[i + 1];
  if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v;
}
const KNOWN = ['in', 'lang', 'id', 'last-modified', 'source-url', 'corpus', 'text', 'report', 'json', 'resolutions'];
for (const k of Object.keys(opt)) if (!KNOWN.includes(k)) fail(`unknown option --${k}`);

if (!opt.in) fail('--in is required');
if (!opt.lang) fail('--lang is required');
if (!(LANGUAGES as readonly string[]).includes(opt.lang)) fail(`unknown language "${opt.lang}" (one of ${LANGUAGES.join(', ')})`);
if (opt.lang !== 'th') fail('only --lang th has hand data to compare');
if (!fs.existsSync(opt.in)) fail(`cannot read input: ${opt.in}`);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
let lastModified: string | undefined = opt['last-modified'];
if (lastModified !== undefined && !dateRe.test(lastModified)) fail(`--last-modified must be YYYY-MM-DD, got "${lastModified}"`);
if (!lastModified) {
  const headers = path.join(path.dirname(opt.in), 'headers.txt');
  if (fs.existsSync(headers)) lastModified = lastModifiedFromHeaders(fs.readFileSync(headers, 'utf8'));
}
const id = opt.id ?? (lastModified ? `kaikki-${opt.lang}@${lastModified}` : undefined);
if (!id) fail('cannot tell the dictionary version: pass --last-modified YYYY-MM-DD (or --id)');

const synthetic = 'test/integration/fixtures/thai-synthetic-book.txt';
const options = {
  input: opt.in,
  lang: opt.lang as LanguageCode,
  dictionaryId: id as string,
  lastModified,
  url: opt['source-url'],
  corpusDir: opt.corpus ?? 'data/corpus/th',
  textFiles: opt.text ? [opt.text] : [synthetic],
  resolutionsFile: opt.resolutions ?? 'data/review/th/resolutions.json',
  reportFile: opt.report ?? 'docs/thai/DICTIONARY_REPORT.md',
  jsonFile: opt.json ?? 'data/review/th/disagreements.json',
};

try {
  const out = await compareFile(options);
  writeCompareOutputs(options, out);
  const r = out.result;
  console.log(`dict:compare - ${r.dictionaryId}`);
  console.log(`  dictionary:       ${out.stats.entries} entries, ${out.stats.forms} forms (${out.stats.lines} lines, ${out.stats.malformed} malformed)`);
  for (const c of r.coverage) {
    console.log(`  ${c.label.padEnd(28)} ${String(c.total).padStart(4)}  by form ${String(c.byForm).padStart(4)}${c.byFormPos === undefined ? '' : `  form+POS ${String(c.byFormPos).padStart(4)} / or equivalent ${String(c.byFormPosCompatible).padStart(4)}`}`);
  }
  console.log(`  disagreements:    ${countByKind(r.disagreements).filter((c) => c.open + c.resolved).map((c) => `${c.kind} ${c.open}${c.resolved ? `+${c.resolved} resolved` : ''}`).join(', ') || 'none'}`);
  console.log(`  wrote:            ${options.reportFile}, ${options.jsonFile}`);
} catch (e) {
  console.error(`dict:compare failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
