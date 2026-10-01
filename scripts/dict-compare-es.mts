/// <reference types="node" />
/**
 * npm run dict:compare-es -- [--in <file.jsonl|.jsonl.gz>] [--id kaikki-es@YYYY-MM-DD]
 *   [--json data/review/es/disagreements.json] [--resolutions data/review/es/resolutions.json] [--report docs/spanish/DICTIONARY_REPORT.md]
 * Compares the Spanish word list (about 1,700 lemmas, machine-drafted) with the kaikki.org extract of Wiktionary:
 * missing words, part of speech, gender, meaning, variety (region) and listed forms. Streams the file once (plain, or
 * gzip by its extension), reads data, downloads nothing. Where the two differ nothing is chosen: the difference is
 * recorded for a human reviewer. The dictionary id comes from --id, else from the Last-Modified line of
 * data/dictionaries/headers-es.txt, else today's date. Exit 1 on bad arguments or an unusable or incomplete input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { compareEsFile, countByEsKind, esDictionaryId, writeEsOutputs } from '../src/dict/compare-es';

const USAGE = 'usage: npm run dict:compare-es -- [--in <file.jsonl|.jsonl.gz>] [--id kaikki-es@YYYY-MM-DD] [--json <json>] [--resolutions <json>] [--report <md>]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  const k = args[i];
  const v = args[i + 1];
  if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v;
}
const KNOWN = ['in', 'id', 'json', 'resolutions', 'report'];
for (const k of Object.keys(opt)) if (!KNOWN.includes(k)) fail(`unknown option --${k}`);

const dir = 'data/dictionaries';
const input = opt.in ?? [`${dir}/kaikki.org-dictionary-Spanish.jsonl`, `${dir}/kaikki.org-dictionary-Spanish.jsonl.gz`].find((f) => fs.existsSync(f)) ?? '';
if (!input) fail(`no input: pass --in <file>, or put kaikki.org-dictionary-Spanish.jsonl(.gz) in ${dir}`);
if (!fs.existsSync(input)) fail(`cannot read input: ${input}`);
if (opt.id !== undefined && !/^kaikki-es@\d{4}-\d{2}-\d{2}$/.test(opt.id)) fail(`--id must look like kaikki-es@YYYY-MM-DD, got "${opt.id}"`);

const headers = path.join(path.dirname(input), 'headers-es.txt');
const { id, lastModified } = esDictionaryId({
  id: opt.id,
  headersText: fs.existsSync(headers) ? fs.readFileSync(headers, 'utf8') : undefined,
  today: new Date().toISOString().slice(0, 10),
});

const options = {
  input,
  dictionaryId: id,
  lastModified,
  resolutionsFile: opt.resolutions ?? 'data/review/es/resolutions.json',
  reportFile: opt.report ?? 'docs/spanish/DICTIONARY_REPORT.md',
  jsonFile: opt.json ?? 'data/review/es/disagreements.json',
};

try {
  const out = await compareEsFile(options);
  writeEsOutputs(options, out);
  const r = out.result;
  const c = r.coverage;
  console.log(`dict:compare-es - ${r.dictionaryId}`);
  console.log(`  dictionary:       ${out.stats.entries} entries read (${out.stats.lines} lines, ${out.stats.malformed} malformed), ${out.stats.kept} kept`);
  console.log(`  word list:        ${c.entries} entries, ${c.distinctLemmas} lemmas; ${c.lemmasWithOwnEntry} found with an entry of their own, ${c.lemmasAnyEntry} headwords at all`);
  console.log(`  disagreements:    ${countByEsKind(r.disagreements).filter((k) => k.open + k.resolved).map((k) => `${k.kind} ${k.open}${k.resolved ? `+${k.resolved} resolved` : ''}`).join(', ') || 'none'}`);
  console.log(`  wrote:            ${options.reportFile}, ${options.jsonFile}`);
} catch (e) {
  console.error(`dict:compare-es failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
