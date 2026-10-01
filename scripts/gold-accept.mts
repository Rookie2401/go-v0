/// <reference types="node" />
/**
 * npm run gold:accept -- <draft.txt> --by "Name" [--confirm-unchanged] [--out <file.gold.jsonl>] [--overwrite]
 * Validates a corrected draft (editing format) and writes the gold JSON Lines next to it under
 * data/private/benchmarks/th/<stratum>/ with checkedBy / checkedAt. Refuses without --by, refuses a draft nobody
 * changed unless --confirm-unchanged, refuses invalid boundaries and ids already accepted. Prints counts only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { acceptDraft } from '../src/bench/gold/accept';
import { parseGoldJsonl, toJsonl } from '../src/bench/gold/format';
import { COURSE_DIR, findGoldFiles, writeText } from '../src/bench/gold/io-node';

const USAGE = 'usage: npm run gold:accept -- <draft.txt> --by "Name" [--confirm-unchanged] [--out <file.gold.jsonl>] [--overwrite]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const flags = new Set<string>();
let file: string | undefined;
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--confirm-unchanged' || k === '--overwrite') { flags.add(k.slice(2)); continue; }
  if (!k.startsWith('--')) { if (file) fail(`unexpected argument: ${k}`); file = k; continue; }
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v; i++;
}
for (const k of Object.keys(opt)) if (!['by', 'out'].includes(k)) fail(`unknown option --${k}`);
if (!file) fail('a draft file is required');
if (!fs.existsSync(file as string)) fail(`cannot read ${file}`);

try {
  const input = file as string;
  const r = acceptDraft(fs.readFileSync(input, 'utf8'), { by: opt.by, at: new Date().toISOString().slice(0, 10), confirmUnchanged: flags.has('confirm-unchanged') });
  if (!r.ok) {
    console.error(`gold:accept refused ${input}:`);
    for (const x of r.refusals.slice(0, 20)) console.error(`  - ${x}`);
    if (r.refusals.length > 20) console.error(`  ... and ${r.refusals.length - 20} more`);
    process.exit(1);
  }
  const out = (opt.out ?? path.join(COURSE_DIR, r.stratum, path.basename(input).replace(/\.draft\.txt$|\.txt$/u, '') + '.gold.jsonl')).replace(/\\/gu, '/');
  // an id already accepted elsewhere is refused (the same text drafted twice)
  const sameFile = path.resolve(out);
  const taken = new Map<string, string>();
  for (const f of findGoldFiles(COURSE_DIR)) {
    if (path.resolve(f) === sameFile) continue;
    for (const s of parseGoldJsonl(fs.readFileSync(f, 'utf8')).sentences) taken.set(s.id, f);
  }
  const clash = r.sentences.filter((s) => taken.has(s.id));
  if (clash.length) fail(`${clash.length} sentence(s) are already in the gold set (${path.basename(taken.get(clash[0].id) as string)}); remove them from the draft`);
  if (fs.existsSync(out) && !flags.has('overwrite')) fail(`${out} already exists; pass --overwrite to replace it`);
  writeText(out, toJsonl(r.sentences));
  console.log(`gold:accept - ${r.sentences.length} sentences accepted for stratum ${r.stratum} (${r.heldOut} held out), checked by ${opt.by}`);
  console.log(`  written to: ${out} (git-ignored)`);
} catch (e) {
  console.error(`gold:accept failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
