/// <reference types="node" />
/**
 * npm run gold:accept -- <draft.txt> --by "Name" [--kind words|units] [--confirm-unchanged] [--out <file>] [--overwrite] [--dir <gold dir>]
 *
 * --kind words (default): validates a corrected word-boundary draft and writes <dir>/<stratum>/<name>.gold.jsonl.
 * --kind units: validates a corrected reading-unit draft (its .meta.json sidecar is read beside it) and writes
 *               <dir>/units/<name>.units.jsonl (formats of src/bench/units/gold.ts).
 * Both record checkedBy / checkedAt. Refuses without --by, refuses a draft nobody changed unless --confirm-unchanged,
 * refuses invalid boundaries and ids already accepted, refuses to write into a file that belongs to a FROZEN set
 * (gold:freeze; make a new file and a new freeze instead), and will not overwrite a file without --overwrite.
 * <dir> is data/private/benchmarks/th (git-ignored). Prints counts only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { acceptDraft } from '../src/bench/gold/accept';
import { frozenSetsHolding } from '../src/bench/gold/freeze';
import { parseGoldJsonl, toJsonl } from '../src/bench/gold/format';
import { COURSE_DIR, UNITS_SUBDIR, findGoldFiles, findUnitFiles, writeText } from '../src/bench/gold/io-node';
import { acceptUnitsDraft } from '../src/bench/gold/units-tools';
import { parseJsonl, toJsonl as unitsToJsonl } from '../src/bench/units/gold';

const USAGE = 'usage: npm run gold:accept -- <draft.txt> --by "Name" [--kind words|units] [--confirm-unchanged] [--out <file>] [--overwrite] [--dir <gold dir>]';
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
for (const k of Object.keys(opt)) if (!['by', 'out', 'kind', 'dir'].includes(k)) fail(`unknown option --${k}`);
if (!file) fail('a draft file is required');
if (!fs.existsSync(file as string)) fail(`cannot read ${file}`);
const kind = opt.kind ?? 'words';
if (kind !== 'words' && kind !== 'units') fail('--kind must be words or units');
const root = (opt.dir ?? COURSE_DIR).replace(/\\/gu, '/');
const at = new Date().toISOString().slice(0, 10);

/** Refuse a target inside a frozen set, then refuse an existing file without --overwrite. */
function checkTarget(out: string): void {
  const frozen = frozenSetsHolding(root, out);
  if (frozen.length) fail(`${out} belongs to the frozen set(s) ${frozen.join(', ')} and may not change; write a new file (--out) and freeze a new set`);
  if (fs.existsSync(out) && !flags.has('overwrite')) fail(`${out} already exists; pass --overwrite to replace it`);
}

function printRefusals(input: string, refusals: string[]): never {
  console.error(`gold:accept refused ${input}:`);
  for (const x of refusals.slice(0, 20)) console.error(`  - ${x}`);
  if (refusals.length > 20) console.error(`  ... and ${refusals.length - 20} more`);
  return process.exit(1);
}

try {
  const input = file as string;
  const text = fs.readFileSync(input, 'utf8');
  if (kind === 'words') {
    const r = acceptDraft(text, { by: opt.by, at, confirmUnchanged: flags.has('confirm-unchanged') });
    if (!r.ok) printRefusals(input, r.refusals);
    else {
      const out = (opt.out ?? path.join(root, r.stratum, path.basename(input).replace(/\.draft\.txt$|\.txt$/u, '') + '.gold.jsonl')).replace(/\\/gu, '/');
      // an id already accepted elsewhere is refused (the same text drafted twice)
      const taken = new Map<string, string>();
      for (const f of findGoldFiles(root)) {
        if (path.resolve(f) === path.resolve(out)) continue;
        for (const s of parseGoldJsonl(fs.readFileSync(f, 'utf8')).sentences) taken.set(s.id, f);
      }
      const clash = r.sentences.filter((s) => taken.has(s.id));
      if (clash.length) fail(`${clash.length} sentence(s) are already in the gold set (${path.basename(taken.get(clash[0].id) as string)}); remove them from the draft`);
      checkTarget(out);
      writeText(out, toJsonl(r.sentences));
      console.log(`gold:accept - ${r.sentences.length} sentences accepted for stratum ${r.stratum} (${r.heldOut} held out), checked by ${opt.by}`);
      console.log(`  written to: ${out} (git-ignored)`);
      console.log('  next: npm run gold:status, then npm run gold:freeze -- --name <id> when the set is complete');
    }
  } else {
    const metaFile = `${input}.meta.json`;
    if (!fs.existsSync(metaFile)) fail(`cannot read ${metaFile}: the sidecar written by gold:draft --kind units must stay beside the draft`);
    let meta: unknown;
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { fail(`${metaFile} is not valid JSON`); }
    const r = acceptUnitsDraft(text, meta, { by: opt.by, at, confirmUnchanged: flags.has('confirm-unchanged') });
    if (!r.ok) printRefusals(input, r.refusals);
    else {
      const out = (opt.out ?? path.join(root, UNITS_SUBDIR, path.basename(input).replace(/\.units-draft\.txt$|\.txt$/u, '') + '.units.jsonl')).replace(/\\/gu, '/');
      const taken = new Map<string, string>();
      for (const f of findUnitFiles(root)) {
        if (path.resolve(f) === path.resolve(out)) continue;
        for (const c of parseJsonl(fs.readFileSync(f, 'utf8'))) taken.set(c.id, f);
      }
      const clash = r.cases.filter((c) => taken.has(c.id));
      if (clash.length) fail(`${clash.length} paragraph(s) are already in the gold set (${path.basename(taken.get(clash[0].id) as string)}); remove them from the draft`);
      checkTarget(out);
      writeText(out, unitsToJsonl(r.cases));
      console.log(`gold:accept - ${r.cases.length} paragraphs accepted as reading units for stratum ${r.stratum}, checked by ${opt.by}`);
      console.log(`  written to: ${out} (git-ignored)`);
      console.log(`  next: npm run gold:freeze -- --name <id>, then npm run bench:units -- --gold ${root}/${UNITS_SUBDIR}`);
    }
  }
} catch (e) {
  console.error(`gold:accept failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
