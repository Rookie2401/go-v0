/// <reference types="node" />
/**
 * npm run dict:status [-- --require th,es] [--dir public/dict]
 * Which dictionaries will a build ship? Reads public/dict/<lang>/manifest.json for every language and prints one
 * line each: id, entries, shards and bytes on disk, the source file and its date, the licence. The dictionaries are
 * built data (git-ignored): a clean checkout has none until `npm run dict:build` has run for each language.
 * `npm run build` runs this first, so a build that ships without a dictionary says so. Exit 1 only with --require
 * when a named language has no usable dictionary, or when a manifest is present but its shards are not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES } from '../src/core';

const args = process.argv.slice(2).filter((a) => a !== '--');
const reqAt = args.indexOf('--require');
const required = reqAt >= 0 && process.env.GO_ALLOW_MISSING_CONTENT !== '1' ? (args[reqAt + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [];
const dirAt = args.indexOf('--dir');
const root = dirAt >= 0 && args[dirAt + 1] ? args[dirAt + 1] : 'public/dict';
let bad = 0;

for (const lang of LANGUAGES) {
  const dir = path.join(root, lang);
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) {
    console.log(`dict:status - ${lang}: none (the build ships no ${lang} dictionary)`);
    if (required.includes(lang)) { console.error(`  required dictionary missing: run npm run dict:build -- --in <file.jsonl> --lang ${lang}`); bad++; }
    continue;
  }
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8')) as { id?: string; entries?: number; licence?: string; shardFiles?: string[]; source?: { file?: string; lastModified?: string; sha256?: string } };
    const shards = m.shardFiles ?? [];
    const missing = shards.filter((s) => !fs.existsSync(path.join(dir, s)));
    const bytes = shards.reduce((n, s) => n + (fs.existsSync(path.join(dir, s)) ? fs.statSync(path.join(dir, s)).size : 0), 0);
    console.log(`dict:status - ${lang}: ${m.id} · ${(m.entries ?? 0).toLocaleString('en-US')} entries · ${shards.length} shards, ${(bytes / 1e6).toFixed(1)} MB · source ${m.source?.file ?? '?'} (${m.source?.lastModified ?? 'date unknown'}) · ${m.licence ?? 'licence not stated'}`);
    if (missing.length) { console.error(`  ${missing.length} shard file(s) named by the manifest are missing: rebuild the dictionary`); bad++; }
    if (!m.licence) { console.error('  the manifest states no licence: rebuild the dictionary'); bad++; }
  } catch (e) {
    console.error(`dict:status - ${lang}: manifest unreadable (${e instanceof Error ? e.message : String(e)})`);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
