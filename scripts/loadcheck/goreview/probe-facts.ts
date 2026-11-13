/**
 * What the intake fact fetch costs, and what a bounded fetch would change (2026-11-11).
 *
 *   npx vite-node scripts/loadcheck/goreview/probe-facts.ts
 *
 * Runs the real Albanian pack (adapter, dictionary shards served from public/dict/sq through a counting fetch) over deterministic candidate
 * lists, once with every testable candidate's facts fetched (today's engine call) and once with `factsBudget` (off in the engine), and prints
 * the lookups made and the differences in what the outcomes say. Nothing is written; no network.
 */
import { factsBudgetFor } from '../../../packages/goreview/src/intake/fetch';
import type { IntakeOutcome } from '../../../packages/goreview/src/types';
import { makeCandidates, makeDeckForms, makeRig } from '../../../test/loading/goreview.facts.rig';

const tally = (out: IntakeOutcome[]): string => {
  const t: Record<string, number> = {};
  for (const o of out) t[o.decision] = (t[o.decision] ?? 0) + 1;
  return Object.entries(t).sort().map(([k, v]) => `${k} ${v}`).join(', ');
};
const rankless = (o: IntakeOutcome): string => `${o.unitId}|${o.decision}|${(o.reasons ?? []).filter((r) => !/^candidate rank /.test(r)).join(' / ')}`;

async function main(): Promise<void> {
  const maxNew = 10;
  for (const [n, d] of [[125, 0], [250, 0], [500, 0], [250, 100], [250, 300]] as const) {
    const cands = makeCandidates(n);
    const deck = makeDeckForms(d, cands);
    const full = await makeRig().run(cands, { maxNew }, deck);
    const bounded = await makeRig().run(cands, { maxNew }, deck, { factsBudget: factsBudgetFor(maxNew) });
    const topFull = full.out.filter((o) => o.decision === 'test-now').map((o) => o.unitId);
    const topBounded = bounded.out.filter((o) => o.decision === 'test-now').map((o) => o.unitId);
    const diffs = full.out.filter((o, i) => rankless(o) !== rankless(bounded.out[i]!)).length;
    console.log(`candidates ${full.counts.candidates}, deck forms ${d}, maxNew ${maxNew}`);
    console.log(`  today   : factsFor ${full.counts.factsFor}, gloss ${full.counts.gloss}, shard fetches ${full.counts.shardFetches} (${full.counts.distinctShards} distinct)   [${tally(full.out)}]`);
    console.log(`  bounded : factsFor ${bounded.counts.factsFor}, gloss ${bounded.counts.gloss}, shard fetches ${bounded.counts.shardFetches} (${bounded.counts.distinctShards} distinct)   [${tally(bounded.out)}]`);
    console.log(`  the ${topFull.length} test-now words are ${JSON.stringify(topFull) === JSON.stringify(topBounded) ? 'IDENTICAL, same order' : 'DIFFERENT'}; ${diffs} of ${full.out.length} outcomes differ in decision or reasons (rank text ignored)`);
  }
}
void main();
