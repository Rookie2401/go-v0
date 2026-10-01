/// <reference types="node" />
/**
 * npm run library:build -- --lang es --manifest <manifest.json> --in <dir> [--out public/library] [--date YYYY-MM-DD]
 *   [--dict <dictionary dir>] [--strict]
 * Builds the library of one language from a manifest of works and their source files (never downloaded by this script;
 * no network access at all). For each entry it checks the rights record, runs the quality check, converts, validates,
 * analyses and writes the per-text documents, profiles and the index shards under <out>/<lang>/ (see src/library/format.ts).
 *
 * It REFUSES an entry whose rights state is not verified-public-domain, verified-open-licence or course-authored (the
 * verified states also need a named verifier and the basis), and any text whose quality verdict is "damaged", and
 * prints why. Exit codes: 0 when at least one work was built (refusals are listed; with --strict any refusal makes it
 * 1), 1 on bad arguments, an unreadable manifest, or when nothing could be built (nothing is written, an earlier build
 * is left as it was). The output is deterministic for the same inputs and --date.
 * Thin CLI over src/library/build.ts and src/library/build-node.ts.
 */
import fs from 'node:fs';
import { LANGUAGES, type LanguageCode } from '../src/core';
import { buildLibraryFiles } from '../src/library/build-node';

const USAGE = 'usage: npm run library:build -- --lang es --manifest <manifest.json> --in <dir> [--out public/library] [--date YYYY-MM-DD] [--dict <dir>] [--strict]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
let strict = false;
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--strict') { strict = true; continue; }
  const v = args[i + 1];
  if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v;
  i++;
}
for (const k of Object.keys(opt)) if (!['lang', 'manifest', 'in', 'out', 'date', 'dict'].includes(k)) fail(`unknown option --${k}`);

if (!opt.lang) fail('--lang is required');
if (!(LANGUAGES as readonly string[]).includes(opt.lang)) fail(`unknown language "${opt.lang}" (one of ${LANGUAGES.join(', ')})`);
if (!opt.manifest) fail('--manifest is required');
if (!opt.in) fail('--in is required');
const date = opt.date ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`--date must be YYYY-MM-DD, got "${date}"`);
if (!fs.existsSync(opt.manifest)) fail(`cannot read the manifest: ${opt.manifest}`);
if (!fs.existsSync(opt.in) || !fs.statSync(opt.in).isDirectory()) fail(`the input directory does not exist: ${opt.in}`);
if (opt.dict !== undefined && !fs.existsSync(opt.dict)) fail(`the dictionary directory does not exist: ${opt.dict}`);

try {
  const t0 = Date.now();
  const r = await buildLibraryFiles({
    lang: opt.lang as LanguageCode, manifestFile: opt.manifest, inDir: opt.in, outDir: opt.out ?? 'public/library', date, dictDir: opt.dict,
  });
  const m = r.manifest;
  console.log(`library:build - ${m.id} (schema ${m.schema})`);
  console.log(`  built:    ${r.built.length} work(s), ${m.texts} text(s), ${m.words} words`);
  for (const b of r.built) {
    console.log(`    + ${b.slug}: ${b.texts} text(s), ${b.words} words, ${b.published} published, rights ${b.rights}, quality ${b.quality}${b.notes.length ? ` (${b.notes.join(' ')})` : ''}`);
  }
  console.log(`  refused:  ${r.refused.length}`);
  for (const f of r.refused) console.log(`    - ${f.slug}: ${f.reasons.join('; ')}`);
  console.log(`  written:  ${m.shards.length} index shard(s), ${r.files} file(s), ${r.bytes} bytes -> ${r.dir}`);
  console.log(`  digest:   ${m.digest}`);
  console.log(`  build time: ${Date.now() - t0} ms`);
  if (strict && r.refused.length) { console.error('library:build: --strict and some entries were refused'); process.exit(1); }
} catch (e) {
  console.error(`library:build failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
