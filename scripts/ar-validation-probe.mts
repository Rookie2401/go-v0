/// <reference types="node" />
/**
 * npx vite-node --config scripts/vite.config.ts scripts/ar-validation-probe.mts -- [--full] "sentence" ["sentence" …]
 *
 * Prints, for each word asked about, what the Arabic adapter really reads and the status the pack rule gives it
 * (packages/language-packs/src/analysis.ts `readSelection`), in the shape of a pack validation case: the lead copies the lines into
 * packages/language-packs/src/packs/ar.ts, never the other way round. By default the adapter has its COMPILED CORE alone (what a
 * validation case must hold with); --write instead rewrites ONLY the `status` field of every pack validation case in packages/language-packs/src/packs/ar.ts
 * from what the analyser and the deck gate give now (core alone, as test/language-packs/arabic.test.ts runs them) and prints the cases that changed:
 * run it after any analyser change. --full also loads the shards of the sentence's words from public/lexicon/ar/standard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { arAdapter } from '../src/adapters/ar';
import { createArabicShardLoader } from '../src/adapters/arabic/shards';
import { readSelection } from '../packages/language-packs/src/analysis';
import { AR_VALIDATION } from '../packages/language-packs/src/packs/ar';

const args = process.argv.slice(2);
const full = args.includes('--full');
// every argument is one sentence; all of its words are printed
if (args.includes('--write')) {
  const file = path.join(process.cwd(), 'packages/language-packs/src/packs/ar.ts');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let changed = 0;
  for (const c of AR_VALIDATION) {
    if (!c.expect.status) continue;
    const now = readSelection(arAdapter, c.surface, c.sentence).status;
    if (now === c.expect.status) continue;
    const i = lines.findIndex((l) => l.includes(`id: '${c.id}'`));
    if (i < 0) throw new Error(`case ${c.id} not found in ar.ts`);
    lines[i] = lines[i].replace(`status: '${c.expect.status}'`, `status: '${now}'`);
    console.log(`${c.id}: ${c.expect.status} -> ${now}`);
    changed++;
  }
  fs.writeFileSync(file, lines.join('\n'));
  console.log(`${changed} status field(s) rewritten`);
  process.exit(0);
}
const groups: string[][] = args.filter((x) => x !== "--full" && x !== "--").map((x) => [x]);

const base = path.join(process.cwd(), 'public/lexicon/ar/standard');
const loader = full ? await createArabicShardLoader({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), fetchBytes: async (p) => new Uint8Array(fs.readFileSync(p)) }, { base, maxLoaded: 2000 }) : undefined;

for (const [sentence, ...surfaces] of groups) {
  if (!sentence) continue;
  if (loader) await loader.ensure(arAdapter.tokenize(sentence).filter((t) => t.isWord).map((t) => t.normalized));
  const words = surfaces.length ? surfaces : arAdapter.tokenize(sentence).filter((t) => t.isWord).map((t) => t.surface);
  console.log(`// ${sentence}`);
  for (const surface of words) {
    const r = readSelection(arAdapter, surface, sentence);
    if (!r.top) { console.log(`  { id: 'v-', surface: '${surface}', sentence: S, expect: { readings: 'none' } },   // ${r.found ? 'no reading' : 'NOT FOUND'}`); continue; }
    const f = Object.entries(r.top.morph).map(([k, v]) => `${k}: '${v}'`).join(', ');
    const others = r.candidates.slice(1, 4).map((c) => `${c.confidence.toFixed(2)} ${c.lemma ?? '?'} ${c.pos ?? ''} ${Object.values(c.morph).join('.')}`).join(' | ');
    console.log(`  { id: 'v-', surface: '${surface}', sentence: S, expect: { lemma: '${r.top.lemma ?? ''}', pos: '${r.top.pos ?? ''}', features: { ${f} }, status: '${r.status}' } },   // ${r.top.confidence.toFixed(2)}${r.top.unconfirmed ? ' GUESS' : ''} (${r.candidates.length})${others ? ' then ' + others : ''}`);
  }
}
