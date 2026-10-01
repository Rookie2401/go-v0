/// <reference types="node" />
/**
 * npm run corpus:prove [-- --write]
 * Proves the importer's documented behaviour on the SYNTHETIC files in data/synthetic/import-proof/ (see its README):
 * every case runs through the real importer against an isolated in-memory store, and an expected-vs-actual table is
 * printed. Exit code 1 on any mismatch. With --write the same run regenerates docs/import/PROOF.md (never hand-written).
 * The cases themselves live in scripts/corpus-prove-lib.mts (also run by test/ingest/prove.test.ts).
 */
import fs from 'node:fs';
import { formatTable, renderProof, runProof } from './corpus-prove-lib.mts';

const args = process.argv.slice(2).filter((a) => a !== '--');
const unknown = args.filter((a) => a !== '--write');
if (unknown.length) {
  console.error(`unknown argument ${unknown.join(' ')}\nusage: npm run corpus:prove [-- --write]`);
  process.exit(1);
}
const write = args.includes('--write');

const result = await runProof();
console.log(formatTable(result));

if (write) {
  const doc = renderProof(result, {
    command: write ? 'npm run corpus:prove -- --write' : 'npm run corpus:prove',
    date: new Date().toISOString().slice(0, 10),
    node: process.version,
  });
  fs.writeFileSync('docs/import/PROOF.md', doc, 'utf8');
  console.log(`wrote docs/import/PROOF.md (${result.rows.length} checks)`);
}
process.exit(result.ok ? 0 : 1);
