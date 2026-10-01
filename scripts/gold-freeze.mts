/// <reference types="node" />
/**
 * npm run gold:freeze -- --name <id> [--strata a,b] [--held-out-only] [--dir <gold dir>]
 * npm run gold:freeze -- --verify <id> [--dir <gold dir>]
 * npm run gold:freeze -- --list [--dir <gold dir>]
 *
 * Freezes the checked gold files under data/private/benchmarks/th/ (words: *.gold.jsonl, reading units: *.units.jsonl)
 * into data/private/benchmarks/th/frozen/<id>.json: every file with its sha256, row counts per stratum, who checked
 * them and when, the tool versions and a set hash. A frozen set is immutable: bench:words -- --frozen <id> verifies
 * every hash first, and gold:accept refuses to write into a frozen file. Machine drafts (rows without checkedBy)
 * cannot be frozen. --verify re-checks the hashes (use it before bench:units, which cannot check them itself).
 */
import { COURSE_DIR } from '../src/bench/gold/io-node';
import { COURSE_STRATA } from '../src/bench/gold/types';
import { freezeSet, listFrozen, readManifest, verifyFrozen } from '../src/bench/gold/freeze';

const USAGE = 'usage: npm run gold:freeze -- --name <id> [--strata a,b] [--held-out-only] [--dir <gold dir>]  |  --verify <id>  |  --list';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const flags = new Set<string>();
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--held-out-only' || k === '--list') { flags.add(k.slice(2)); continue; }
  const v = args[i + 1];
  if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v; i++;
}
for (const k of Object.keys(opt)) if (!['name', 'strata', 'dir', 'verify'].includes(k)) fail(`unknown option --${k}`);
const dir = (opt.dir ?? COURSE_DIR).replace(/\\/gu, '/');

try {
  if (flags.has('list')) {
    const all = listFrozen(dir);
    console.log(all.length ? `gold:freeze - ${all.length} frozen set(s) under ${dir}` : `gold:freeze - no frozen sets under ${dir}`);
    for (const m of all) {
      const rows = Object.values(m.counts.words).reduce((a, b) => a + b, 0);
      const units = Object.values(m.counts.units).reduce((a, b) => a + b, 0);
      console.log(`  ${m.id}  ${m.createdAt.slice(0, 10)}  ${rows} sentences, ${units} paragraphs  hash ${m.setHash.slice(0, 16)}`);
    }
  } else if (opt.verify) {
    const m = readManifest(dir, opt.verify);
    const problems = verifyFrozen(dir, m);
    if (problems.length) {
      console.error(`gold:freeze --verify: "${m.id}" does NOT match its freeze:`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`gold:freeze --verify: "${m.id}" verified, ${m.files.length} file(s), set hash ${m.setHash}`);
  } else {
    if (!opt.name) fail('--name <id> is required');
    const strata = opt.strata ? opt.strata.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    for (const s of strata ?? []) if (!(COURSE_STRATA as readonly string[]).includes(s)) fail(`unknown stratum "${s}" (one of ${COURSE_STRATA.join(', ')})`);
    const m = freezeSet(dir, { id: opt.name as string, strata, heldOutOnly: flags.has('held-out-only') });
    const w = Object.entries(m.counts.words).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
    const u = Object.entries(m.counts.units).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
    console.log(`gold:freeze - frozen "${m.id}" (set hash ${m.setHash})`);
    console.log(`  files:          ${m.files.length}`);
    console.log(`  sentences:      ${w}`);
    console.log(`  held out:       ${Object.entries(m.counts.wordsHeldOut).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
    console.log(`  paragraphs:     ${u}`);
    console.log(`  checked by:     ${m.checkedBy.map((c) => `${c.name} (${c.rows})`).join(', ')}`);
    console.log(`  manifest:       ${dir}/frozen/${m.id}.json (git-ignored; never edit the gold files it lists)`);
  }
} catch (e) {
  console.error(`gold:freeze failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
