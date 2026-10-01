/// <reference types="node" />
/**
 * npm run gold:status [-- --dir data/private/benchmarks/th]
 * Checked sentences per stratum of the course gold set against the target of 500-1,000 overall, which strata are
 * empty, and how many drafts wait to be corrected. Counts only: nothing of any sentence is printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COURSE_DIR, loadGoldDir } from '../src/bench/gold/io-node';
import { fromEditing } from '../src/bench/gold/format';
import { goldStatus } from '../src/bench/gold/status';

const USAGE = 'usage: npm run gold:status [-- --dir <gold directory>]';
const args = process.argv.slice(2).filter((a) => a !== '--');
let dir = COURSE_DIR;
if (args.length === 2 && args[0] === '--dir') dir = args[1];
else if (args.length) { console.error(`bad arguments\n${USAGE}`); process.exit(1); }

const loaded = loadGoldDir(dir);
for (const p of loaded.problems.slice(0, 10)) console.error(`warning: ${p}`);
const st = goldStatus(loaded.sentences);

// drafts waiting for a person (count of sentences only)
const waiting = new Map<string, number>();
const walk = (d: string) => {
  if (!fs.existsSync(d)) return;
  for (const name of fs.readdirSync(d).sort()) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.draft.txt')) waiting.set(path.basename(path.dirname(p)), (waiting.get(path.basename(path.dirname(p))) ?? 0) + fromEditing(fs.readFileSync(p, 'utf8')).entries.length);
  }
};
walk(dir);

console.log(`gold:status - course gold set at ${dir}`);
console.log(`  ${'stratum'.padEnd(22)} ${'checked'.padStart(7)} ${'held out'.padStart(9)} ${'unchecked'.padStart(10)} ${'in drafts'.padStart(10)}`);
for (const s of st.strata) {
  console.log(`  ${s.stratum.padEnd(22)} ${String(s.checked).padStart(7)} ${String(s.heldOut).padStart(9)} ${String(s.unchecked).padStart(10)} ${String(waiting.get(s.stratum) ?? 0).padStart(10)}`);
}
console.log(`  checked in all: ${st.checkedTotal} (${st.heldOutTotal} held out), target ${st.target.min}-${st.target.max}: ${st.vsTarget}${st.missingToMin ? `, ${st.missingToMin} more to the minimum` : ''}`);
console.log(st.emptyStrata.length ? `  empty strata: ${st.emptyStrata.join(', ')}` : '  no empty strata');
if (st.checkedTotal === 0) console.log('  nothing is in the course gold set yet: supply a lawful text, then npm run gold:draft (docs/thai/BENCHMARKS.md, section 2).');
