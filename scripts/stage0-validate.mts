/**
 * Stage 0 authoring check: validates every language pack in data/stage0 and prints the coverage along the path.
 *   npx vite-node scripts/stage0-validate.mts                 all languages
 *   npx vite-node scripts/stage0-validate.mts -- es de        some
 *   npx vite-node scripts/stage0-validate.mts -- es --coverage   with the per-step coverage table
 *   npx vite-node scripts/stage0-validate.mts -- es --quiet      errors only (no warnings)
 * Exit code 1 when any error is found.
 */
import { createAdapterRegistry } from '../src/adapters';
import type { LanguageCode } from '../src/core';
import { bundledStage0, pathCoverage, validatePack } from '../src/stage0';

const args = process.argv.slice(2).filter((a) => a !== '--');
const showCoverage = args.includes('--coverage');
const quiet = args.includes('--quiet');
const wanted = args.filter((a) => !a.startsWith('--')) as LanguageCode[];
const { world, packs } = bundledStage0();
const registry = createAdapterRegistry();
let errors = 0;
for (const [lang, pack] of packs) {
  if (wanted.length && !wanted.includes(lang)) continue;
  const adapter = registry.get(lang);
  const issues = validatePack(pack, adapter, world);
  const e = issues.filter((i) => i.severity === 'error');
  const w = issues.filter((i) => i.severity === 'warning');
  errors += e.length;
  console.log(`\n== ${lang}: ${pack.scenes.size} scenes, ${pack.sounds.size} sound steps, ${pack.exits.size} exit forms, ${pack.path.steps.length} path steps — ${e.length} errors, ${w.length} warnings`);
  for (const i of e) console.log(`  ERROR ${i.where} [${i.code}] ${i.message}`);
  if (!quiet) for (const i of w) console.log(`  warn  ${i.where} [${i.code}] ${i.message}`);
  if (showCoverage) {
    console.log('  step              kind     tokens  met    new');
    for (const c of pathCoverage(pack, adapter, world)) {
      if (c.kind === 'exit' || c.kind === 'review') continue;
      console.log(`  ${c.stepId.padEnd(17)} ${c.kind.padEnd(8)} ${String(c.tokens).padStart(6)}  ${String(Math.round(c.coverage * 100)).padStart(3)} %  ${c.newItems.join(', ')}`);
    }
  }
}
if (!packs.size) console.log('No Stage 0 packs found in data/stage0/<lang>/.');
process.exit(errors ? 1 : 0);
