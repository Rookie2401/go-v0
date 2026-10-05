/// <reference types="node" />
/**
 * npm run sq:ladder-author -- [--from <unit id>] [--known] [--draft <file.txt>]
 *
 * The writer's view of the Albanian ladder (the gate's view is `npm run ladder:check -- sq`). Walks Stage 0 and the units
 * of data/ladder/sq/ladder.json in order, exactly as the gate counts (src/ladder/analyse.ts: the adapter's first reading,
 * a lemma "known" after three earlier running-word encounters, names and numerals known by definition), and prints for
 * each unit (from `--from` on) what is not yet known in it: the lemmas never met, and those met once or twice, with how
 * often they were met before. That is what a bridge text before the unit has to bring up to three encounters.
 *
 *   --known         also print every lemma known at the end (≥ 3 encounters), with its count: the vocabulary to write with
 *   --draft <file>  measure a candidate text (one sentence per line; "Albanian || English" lines are fine) as if it were
 *                   read after the last unit: words, coverage, new and weak lemmas — before it is put into the ladder
 *
 * Reads only; writes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import { analyseDocument, loadLadder, POLICY, Progress } from '../src/ladder';
import type { CorpusDocument } from '../src/ingest';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const from = opt('from');
const draft = opt('draft');
const adapter = createAdapterRegistry().get('sq');
const loaded = loadLadder('sq', path.resolve('.'));
const progress = new Progress(POLICY.minEncounters);

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
for (const h of loaded.head) progress.add(analyseDocument(adapter, h.doc));
console.log(`Stage 0: ${loaded.head.length} scenes, ${progress.seen.size} lemmas met, ${[...progress.seen.values()].filter((n) => n >= POLICY.minEncounters).length} known`);
if (args.includes('--head')) {
  const all = [...progress.seen.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  known after Stage 0: ${all.filter(([, n]) => n >= POLICY.minEncounters).map(([l, n]) => `${l} ${n}`).join(', ')}`);
  console.log(`  met once or twice in Stage 0: ${all.filter(([, n]) => n < POLICY.minEncounters).map(([l, n]) => `${l} ${n}`).join(', ')}`);
}

let printing = from === undefined;
for (const u of loaded.units) {
  if (u.unit.id === from) printing = true;
  if (!u.doc) { console.log(`${u.unit.id}: ${u.status} (${u.problem ?? ''})`); continue; }
  const stat = analyseDocument(adapter, u.doc);
  if (printing) {
    const { cov3 } = progress.coverage(stat);
    const fresh = progress.newLemmas(stat);
    const weak = [...stat.lemmas.keys()].filter((l) => { const s = progress.seen.get(l) ?? 0; return s > 0 && s < POLICY.minEncounters; });
    console.log(`\n${u.unit.id} (${u.unit.title ?? ''}): ${stat.words} words, cov3 ${pct(cov3)}, new ${fresh.length} (${((100 * fresh.length) / Math.max(1, stat.words)).toFixed(1)}/100)`);
    if (fresh.length) console.log(`  new:  ${fresh.map((l) => `${l}×${stat.lemmas.get(l)}`).join(', ')}`);
    if (weak.length) console.log(`  weak: ${weak.map((l) => `${l}(${progress.seen.get(l)})×${stat.lemmas.get(l)}`).join(', ')}`);
  }
  progress.add(stat);
}

if (args.includes('--known')) {
  const known = [...progress.seen.entries()].filter(([, n]) => n >= POLICY.minEncounters).sort((a, b) => b[1] - a[1]);
  console.log(`\nknown (${known.length}): ${known.map(([l, n]) => `${l} ${n}`).join(', ')}`);
  const weak = [...progress.seen.entries()].filter(([, n]) => n < POLICY.minEncounters).sort((a, b) => b[1] - a[1]);
  console.log(`\nmet once or twice (${weak.length}): ${weak.map(([l, n]) => `${l} ${n}`).join(', ')}`);
}

if (draft) {
  const lines = fs.readFileSync(draft, 'utf8').split('\n').map((l) => l.split('||')[0].trim()).filter((l) => l && !l.startsWith('#'));
  const doc = { schemaVersion: 2, id: 'draft', lang: 'sq', title: 'draft', sections: [{ paragraphs: [{ sentences: lines.map((text) => ({ text })) }] }] } as unknown as CorpusDocument;
  const stat = analyseDocument(adapter, doc);
  const { cov3 } = progress.coverage(stat);
  const fresh = progress.newLemmas(stat);
  const weak = [...stat.lemmas.keys()].filter((l) => { const s = progress.seen.get(l) ?? 0; return s > 0 && s < POLICY.minEncounters; });
  console.log(`\ndraft ${draft}: ${stat.words} words, cov3 ${pct(cov3)}, new ${fresh.length} (${((100 * fresh.length) / Math.max(1, stat.words)).toFixed(1)}/100)`);
  if (fresh.length) console.log(`  new:  ${fresh.map((l) => `${l}×${stat.lemmas.get(l)}`).join(', ')}`);
  if (weak.length) console.log(`  weak: ${weak.map((l) => `${l}(${progress.seen.get(l)})×${stat.lemmas.get(l)}`).join(', ')}`);
}
