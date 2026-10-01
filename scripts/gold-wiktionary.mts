/// <reference types="node" />
/**
 * npm run gold:wiktionary [-- --in <kaikki.jsonl>] [--out <dir>] [--sample 60]
 * Derives the rights-safe, human-tokenized word-segmentation set from the usage examples of the Wiktionary extract
 * (Wiktionary, via kaikki.org — CC BY-SA 4.0): the editors' romanization word breaks are aligned to the Thai text
 * (src/bench/gold/align.ts). Writes ONLY under data/benchmarks/th/generated/ (git-ignored):
 *   wiktionary-examples.gold.jsonl   the aligned sentences
 *   wiktionary-examples.stats.json   what aligned and why the rest did not
 *   wiktionary-examples.rejected.jsonl   every example left out, with its reason
 *   wiktionary-sample.edit.txt       a deterministic sample for checking by eye (editing format)
 */
import { DEFAULT_KAIKKI_FILE, KAIKKI_ATTRIBUTION, loadKaikkiBench } from '../src/bench/gold/kaikki-node';
import { buildWiktionaryGold } from '../src/bench/gold/wiktionary';
import { sentenceToEntry, toEditing, toJsonl, validateGold } from '../src/bench/gold/format';
import { GENERATED_DIR, writeText } from '../src/bench/gold/io-node';
import { seededShuffle } from '../src/bench/shared';

const USAGE = 'usage: npm run gold:wiktionary [-- --in <kaikki.jsonl>] [--out <dir under data/benchmarks/th/generated>] [--sample 60]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  const k = args[i];
  const v = args[i + 1];
  if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v;
}
for (const k of Object.keys(opt)) if (!['in', 'out', 'sample'].includes(k)) fail(`unknown option --${k}`);
const outDir = (opt.out ?? GENERATED_DIR).replace(/\\/gu, '/');
if (!outDir.startsWith(GENERATED_DIR)) fail(`--out must be inside ${GENERATED_DIR} (generated dictionary data is never committed)`);
const sampleN = opt.sample === undefined ? 60 : Number(opt.sample);
if (!Number.isInteger(sampleN) || sampleN < 0) fail('--sample must be a whole number');

try {
  const t0 = Date.now();
  const bench = await loadKaikkiBench(opt.in ?? DEFAULT_KAIKKI_FILE);
  const r = buildWiktionaryGold(bench.examples, bench.index);
  // every row we write must pass the validator
  const invalid = r.sentences.filter((s) => validateGold(s).length > 0);
  if (invalid.length) throw new Error(`${invalid.length} aligned sentences failed validation, first: ${invalid[0].id} ${JSON.stringify(validateGold(invalid[0]))}`);

  writeText(`${outDir}/wiktionary-examples.gold.jsonl`, toJsonl(r.sentences));
  writeText(`${outDir}/wiktionary-examples.rejected.jsonl`, r.rejected.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const stats = {
    source: bench.file, attribution: KAIKKI_ATTRIBUTION, sourceLines: bench.lines,
    headwordsInAlignmentIndex: bench.index.words.size, headwordsForDictMM: bench.mmWords.size,
    ...r.stats,
  };
  writeText(`${outDir}/wiktionary-examples.stats.json`, JSON.stringify(stats, null, 2) + '\n');
  const sample = seededShuffle(r.sentences, 1).slice(0, sampleN);
  writeText(`${outDir}/wiktionary-sample.edit.txt`, toEditing(sample.map(sentenceToEntry), [
    `${KAIKKI_ATTRIBUTION}. Deterministic sample (seed 1) of ${sample.length} aligned sentences for checking by eye.`,
  ]));

  console.log(`gold:wiktionary - ${KAIKKI_ATTRIBUTION}`);
  console.log(`  source lines:        ${bench.lines}`);
  console.log(`  headwords indexed:   ${bench.index.words.size} (${bench.mmWords.size} usable by dict-mm)`);
  console.log(`  examples:            ${r.stats.examples}`);
  console.log(`  aligned:             ${r.stats.aligned} (${Object.entries(r.stats.alignedByStratum).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  console.log(`  words per sentence:  ${r.stats.words.perSentenceMean.toFixed(2)} on average`);
  console.log('  not aligned, by reason:');
  for (const [k, v] of Object.entries(r.stats.rejected).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(36)} ${v}`);
  console.log(`  written to:          ${outDir}/ (git-ignored)   ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} catch (e) {
  console.error(`gold:wiktionary failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
