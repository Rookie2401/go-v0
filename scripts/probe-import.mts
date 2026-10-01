/**
 * Probe: what does the installed dictionary cost at import time? A chapter-sized synthetic Thai text (the test
 * fixture's lines repeated; text content is irrelevant here, only volume) is planned and imported into a memory store
 * without a dictionary, with the real dictionary read from disk (cold and warm), and the stored size is compared.
 * Run: npx vite-node scripts/probe-import.mts [paragraphs=400]
 */
import { readFileSync } from 'node:fs';
import { createMemoryStore } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { createFileLexiconSource } from '../src/dict/file';
import { importDocuments, plainTextToDocuments } from '../src/ingest';

const N = Number(process.argv[2] ?? 400);
const lines = readFileSync(new URL('../test/integration/fixtures/thai-synthetic-book.txt', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('บทที่'));
const text = Array.from({ length: N }, (_, i) => lines[i % lines.length]).join('\n');
const adapters = createAdapterRegistry();
const { documents } = plainTextToDocuments(text, { lang: 'th', title: 'Import probe (synthetic)', chapters: 'none' });

async function run(label: string, lexicon?: Parameters<typeof importDocuments>[3] extends infer O ? O extends { lexicon?: infer L } ? L : never : never) {
  const store = createMemoryStore();
  const t0 = performance.now();
  const report = await importDocuments(store, adapters, documents, { clock: () => '2026-10-01T00:00:00.000Z', lexicon });
  const ms = performance.now() - t0;
  const analyses = await store.analyses.all();
  const bytes = JSON.stringify(analyses).length;
  const tokens = await store.tokens.count();
  const withAlt = analyses.filter((a) => (a.alternatives ?? []).some((x) => x.origin === 'dictionary')).length;
  console.log(`${label.padEnd(34)} ${ms.toFixed(0).padStart(6)} ms  ok=${report.ok}  tokens=${tokens}  analyses=${analyses.length}  with dictionary beside=${withAlt}  analysis JSON=${(bytes / 1024).toFixed(0)} KiB (${(bytes / Math.max(1, analyses.length)).toFixed(0)} B each)`);
}

console.log(`${N} paragraphs, ${text.length} characters`);
await run('no dictionary');
const dict = createFileLexiconSource('public/dict', 'th');
const info = await dict.info();
if (!info) { console.log('no dictionary under public/dict/th — build it with npm run dict:build'); process.exit(0); }
await run(`dictionary ${info.id} (cold)`, () => dict);
await run(`dictionary ${info.id} (warm)`, () => dict);
