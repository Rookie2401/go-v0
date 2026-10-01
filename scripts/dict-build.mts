/// <reference types="node" />
/**
 * npm run dict:build -- --in <file.jsonl> --lang th [--out public/dict] [--date YYYY-MM-DD]
 * Builds the dictionary shards from a kaikki.org Wiktionary JSON-Lines extract (never downloaded by this script).
 * Writes <out>/<lang>/manifest.json and s-<hh>.json shards, prints counts, exit 1 on bad arguments or unusable input.
 * Thin CLI over src/dict/build.ts and src/dict/build-node.ts.
 */
import fs from 'node:fs';
import { LANGUAGES, type LanguageCode } from '../src/core';
import { buildDictionaryFile } from '../src/dict/build-node';
import { KAIKKI_SKIPS } from '../src/dict/map';

const USAGE = 'usage: npm run dict:build -- --in <file.jsonl> --lang th [--out public/dict] [--date YYYY-MM-DD]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  const k = args[i];
  const v = args[i + 1];
  if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v;
}
for (const k of Object.keys(opt)) if (!['in', 'lang', 'out', 'date'].includes(k)) fail(`unknown option --${k}`);

if (!opt.in) fail('--in is required');
if (!opt.lang) fail('--lang is required');
if (!(LANGUAGES as readonly string[]).includes(opt.lang)) fail(`unknown language "${opt.lang}" (one of ${LANGUAGES.join(', ')})`);
const date = opt.date ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`--date must be YYYY-MM-DD, got "${date}"`);
if (!fs.existsSync(opt.in)) fail(`cannot read input: ${opt.in}`);

try {
  const r = await buildDictionaryFile({ input: opt.in, lang: opt.lang as LanguageCode, outDir: opt.out ?? 'public/dict', date });
  const s = r.stats;
  console.log(`dict:build - ${r.manifest.id}`);
  console.log(`  input lines:      ${s.lines} (+ ${s.blank} blank)`);
  console.log(`  malformed lines:  ${s.malformed}`);
  console.log(`  skipped:          ${KAIKKI_SKIPS.map((k) => `${k} ${s.skipped[k]}`).join(', ')}`);
  console.log(`  entries kept:     ${s.kept} lines -> ${s.entries} entries after merging same form + part of speech`);
  console.log(`  shards written:   ${s.shards} -> ${r.dir}`);
  console.log(`  attribution:      ${r.manifest.attribution}`);
} catch (e) {
  console.error(`dict:build failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
