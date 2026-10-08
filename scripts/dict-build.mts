/// <reference types="node" />
/**
 * npm run dict:build -- --in <file.jsonl> --lang th [--out public/dict] [--date YYYY-MM-DD]
 *   [--source-url <url>] [--last-modified YYYY-MM-DD] [--retrieved YYYY-MM-DD]
 * Builds the dictionary shards from a kaikki.org Wiktionary JSON-Lines extract (never downloaded by this script).
 * Writes <out>/<lang>/manifest.json (schema 3, with the label sets of the form-of relations and the source record: file name, sha256, line count, and the url /
 * last-modified / retrieved dates you state) and s-<hh>.json shards, prints counts, exit 1 on bad arguments or
 * unusable input. The dictionary id is kaikki-<lang>@<last-modified date> (the build date when none is given).
 * The input is streamed and memory stays bounded (entries are spilled to the temp directory by form hash, then merged
 * and written one partition at a time); the bucket count is chosen from the data size and recorded in the manifest.
 * Thin CLI over src/dict/build.ts and src/dict/build-node.ts.
 */
import fs from 'node:fs';
import { LANGUAGES, type LanguageCode } from '../src/core';
import { DROP_FORM_PRONUNCIATIONS } from '../src/dict/build';
import { buildDictionaryFile } from '../src/dict/build-node';
import { repatchManifestFrequency } from '../src/dict/frequency-node';
import { KAIKKI_SKIPS } from '../src/dict/map';

const USAGE = 'usage: npm run dict:build -- --in <file.jsonl> --lang th [--out public/dict] [--date YYYY-MM-DD] [--source-url <url>] [--last-modified YYYY-MM-DD] [--retrieved YYYY-MM-DD]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  const k = args[i];
  const v = args[i + 1];
  if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v;
}
for (const k of Object.keys(opt)) if (!['in', 'lang', 'out', 'date', 'source-url', 'last-modified', 'retrieved'].includes(k)) fail(`unknown option --${k}`);

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
if (!opt.in) fail('--in is required');
if (!opt.lang) fail('--lang is required');
if (!(LANGUAGES as readonly string[]).includes(opt.lang)) fail(`unknown language "${opt.lang}" (one of ${LANGUAGES.join(', ')})`);
const date = opt.date ?? new Date().toISOString().slice(0, 10);
if (!isDate(date)) fail(`--date must be YYYY-MM-DD, got "${date}"`);
for (const k of ['last-modified', 'retrieved']) if (opt[k] !== undefined && !isDate(opt[k])) fail(`--${k} must be YYYY-MM-DD, got "${opt[k]}"`);
if (!fs.existsSync(opt.in)) fail(`cannot read input: ${opt.in}`);

try {
  const t0 = Date.now();
  const r = await buildDictionaryFile({
    input: opt.in, lang: opt.lang as LanguageCode, outDir: opt.out ?? 'public/dict', date,
    source: { url: opt['source-url'], lastModified: opt['last-modified'], retrievedAt: opt.retrieved },
  });
  const s = r.stats;
  // a frequency sidecar from an earlier run (scripts/library-frequency.mts) survives a rebuild; the manifest says so again
  const keptFrequency = repatchManifestFrequency(r.dir);
  const nonWord = Object.entries(s.nonWord).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`dict:build - ${r.manifest.id} (schema ${r.manifest.schema})`);
  console.log(`  input lines:      ${s.lines} (+ ${s.blank} blank)`);
  console.log(`  malformed lines:  ${s.malformed}`);
  console.log(`  skipped:          ${KAIKKI_SKIPS.map((k) => `${k} ${s.skipped[k]}`).join(', ')}${nonWord ? ` (non-word: ${nonWord})` : ''}`);
  console.log(`  entries kept:     ${s.kept} lines -> ${s.entries} entries (${s.forms} forms) after merging same form + part of speech + etymology + pronunciations`);
  console.log(`  with respelling:  ${s.withRespelling}; ipa ${s.withIpa}; romanization ${s.withRomanization}; register ${s.withRegister}`);
  console.log(`  inflected forms:  ${s.withFormOf} entries are forms of a lemma (${s.formOfRelations} form-of relations, no gloss of their own)`);
  console.log(`  preserved:        ${s.senses} senses, ${s.pronunciations} pronunciations (${s.withPronunciations} entries); ${s.unpairedGroups} entries with unpaired pronunciation rows`);
  console.log(`  label sets:       ${s.labelSets} distinct label lists of the form-of relations (in the manifest; a relation names one by number)`);
  console.log(`  pronunciations dropped: ${s.pronunciationsDropped} (off ${s.pronunciationEntriesDropped} inflected-form lines; ${DROP_FORM_PRONUNCIATIONS[r.manifest.lang] ? 'this language drops them' : 'this language keeps them'})`);
  console.log(`  shards written:   ${s.shards} of ${s.buckets} buckets (${s.shardBytes} bytes total, largest ${s.largestShardBytes}) -> ${r.dir}`);
  if (s.largestShardBytes > 250_000) console.log('  warning:          the largest shard is over 250 kB (a few very heavy forms); consider a raise of the bucket target');
  console.log(`  source:           ${r.manifest.source?.file}, ${r.manifest.source?.lines} lines, sha256 ${r.manifest.source?.sha256}`);
  console.log(`  attribution:      ${r.manifest.attribution}`);
  console.log(`  frequency:        ${keptFrequency ? 'frequency.json kept, hasFrequency true' : 'none (npm run library:frequency -- <lang> writes it)'}`);
  console.log(`  build time:       ${Date.now() - t0} ms`);
  console.log(`  peak memory:      ${Math.round(process.resourceUsage().maxRSS / 1024)} MB (resident set, this process)`);
} catch (e) {
  console.error(`dict:build failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
