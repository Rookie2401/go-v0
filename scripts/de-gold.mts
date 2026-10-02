/**
 * The German gold sets, reported: correctness per round, and for every failing sentence the exact expectations that
 * fail, told apart as known (recorded in known-limits.json), new on a known-limit sentence, resolved, or unrecorded.
 *
 *   npx vite-node scripts/de-gold.mts                 every round
 *   npx vite-node scripts/de-gold.mts -- --round 3    one round (1 = gold.json, 2 = gold-2.json, 3 = gold-3.json …)
 *   npx vite-node scripts/de-gold.mts -- --signatures prints a known-limits.json body for the current failures
 *
 * A green test run is not a correctness score: the test accepts a known limit as long as it fails exactly as recorded.
 */
import fs from 'node:fs';
import { deAdapter } from '../src/adapters/de';
import { evaluateRound, roundLine, type GoldFile, type KnownLimits } from '../src/bench/de/gold';

const DIR = 'data/benchmarks/de';
const args = process.argv.slice(2);
const only = args.includes('--round') ? Number(args[args.indexOf('--round') + 1]) : undefined;
const limits: KnownLimits = fs.existsSync(`${DIR}/known-limits.json`) ? JSON.parse(fs.readFileSync(`${DIR}/known-limits.json`, 'utf8')) : {};
const files = fs.readdirSync(DIR).filter((f) => /^gold(-\d+)?\.json$/.test(f)).sort((a, b) => a.length - b.length || a.localeCompare(b));

const signatures: Record<string, { reason: string; expected: string[] }> = {};
for (const [i, file] of files.entries()) {
  if (only !== undefined && only !== i + 1) continue;
  const gold = JSON.parse(fs.readFileSync(`${DIR}/${file}`, 'utf8')) as GoldFile;
  const round = evaluateRound(deAdapter, `Round ${i + 1} (${file})`, gold.sentences, limits);
  console.log(`\n${roundLine(round)}`);
  for (const r of round.results) {
    if (r.failures.length === 0 && r.standing === 'correct') continue;
    console.log(`\n  ${r.sentence.id} [${r.standing}] ${r.sentence.text}`);
    if (r.standing === 'known-limit-resolved') { console.log('    now correct: remove it from known-limits.json'); continue; }
    for (const f of r.failures) {
      const tag = !r.comparison ? 'UNRECORDED' : r.comparison.appeared.includes(f.key) ? 'NEW' : 'known';
      console.log(`    ${tag.padEnd(10)} ${f.key}  —  ${f.detail}`);
    }
    for (const k of r.comparison?.resolved ?? []) console.log(`    RESOLVED   ${k}`);
    signatures[r.sentence.id] = { reason: limits[r.sentence.id]?.reason ?? '', expected: r.failures.map((f) => f.key) };
  }
}
if (args.includes('--signatures')) console.log(`\n${JSON.stringify(signatures, null, 2)}`);
