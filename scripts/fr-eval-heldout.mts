/**
 * The held-out French set (data/benchmarks/fr/heldout): frozen before the analyser was run on it.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/fr-eval-heldout.mts [-- --lemmas]
 *
 * With --lemmas the larger dictionary lemma list is loaded first (the extension loads it a moment after the analyser);
 * without it only the hand word list answers. Prints the summary and then every failing case on one line.
 */
import { join } from 'node:path';
import { frAdapter, loadFrenchLexicon } from '../src/adapters/fr';
import { evaluateAll, formatSummary, loadFixtures, summarise } from '../src/bench/fr/fixtures';

const ROOT = join(import.meta.dirname ?? '.', '..');
const withLemmas = process.argv.slice(2).includes('--lemmas');
if (withLemmas) { await loadFrenchLexicon(); console.log('(the dictionary lemma list is loaded)'); } else console.log('(the hand word list alone)');

const files = loadFixtures(join(ROOT, 'data/benchmarks/fr/heldout'));
const byId = new Map<string, { sentence: string; target: string; expect: unknown }>();
for (const f of files) for (const c of f.cases) byId.set(c.id, { sentence: c.sentence, target: c.target, expect: c.expect });

const results = evaluateAll(frAdapter, files);
console.log(formatSummary(summarise(results)));
console.log('');
for (const r of results) {
  if (r.ok) continue;
  const c = byId.get(r.id)!;
  const readings = r.got.readings.slice(0, 3).join(' ; ');
  console.log(`${r.id} [${r.level}] ${JSON.stringify(c.sentence)} target=${JSON.stringify(c.target)} expected=${JSON.stringify(c.expect)} failed=${r.failed.join(',')} readings=${readings || '(none)'} constructions=${r.got.constructions.join(',') || '-'}${r.failed.includes('tokens') ? ` tokens=${JSON.stringify(r.got.tokens)}` : ''}`);
}
