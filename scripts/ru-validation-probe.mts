/// <reference types="node" />
/**
 * npx vite-node --config scripts/vite.config.ts scripts/ru-validation-probe.mts -- [--full] "sentence" ["sentence" …]
 *
 * Prints, for each word asked about, what the Russian adapter really reads and the status the pack rule gives it
 * (packages/language-packs/src/analysis.ts `readSelection`), in the shape of a pack validation case: the lead copies the lines into
 * packages/language-packs/src/packs/ru.ts, never the other way round. By default the adapter has its COMPILED CORE alone (what a
 * validation case must hold with); --full also loads the shards of the sentence's words from public/lexicon/ru/standard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ruAdapter } from '../src/adapters/ru';
import { createRussianShardLoader } from '../src/adapters/russian/shards';
import { readSelection } from '../packages/language-packs/src/analysis';

const args = process.argv.slice(2);
const full = args.includes('--full');
// every argument is one sentence; all of its words are printed
const groups: string[][] = args.filter((x) => x !== "--full" && x !== "--").map((x) => [x]);

const base = path.join(process.cwd(), 'public/lexicon/ru/standard');
const loader = full ? await createRussianShardLoader({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), fetchBytes: async (p) => new Uint8Array(fs.readFileSync(p)) }, { base, maxLoaded: 2000 }) : undefined;

for (const [sentence, ...surfaces] of groups) {
  if (!sentence) continue;
  if (loader) await loader.ensure(ruAdapter.tokenize(sentence).filter((t) => t.isWord).map((t) => t.normalized));
  const words = surfaces.length ? surfaces : ruAdapter.tokenize(sentence).filter((t) => t.isWord).map((t) => t.surface);
  console.log(`// ${sentence}`);
  for (const surface of words) {
    const r = readSelection(ruAdapter, surface, sentence);
    if (!r.top) { console.log(`  { id: 'v-', surface: '${surface}', sentence: S, expect: { readings: 'none' } },   // ${r.found ? 'no reading' : 'NOT FOUND'}`); continue; }
    const f = Object.entries(r.top.morph).map(([k, v]) => `${k}: '${v}'`).join(', ');
    const others = r.candidates.slice(1, 4).map((c) => `${c.confidence.toFixed(2)} ${c.lemma ?? '?'} ${c.pos ?? ''} ${Object.values(c.morph).join('.')}`).join(' | ');
    console.log(`  { id: 'v-', surface: '${surface}', sentence: S, expect: { lemma: '${r.top.lemma ?? ''}', pos: '${r.top.pos ?? ''}', features: { ${f} }, status: '${r.status}' } },   // ${r.top.confidence.toFixed(2)}${r.top.unconfirmed ? ' GUESS' : ''} (${r.candidates.length})${others ? ' then ' + others : ''}`);
  }
}
