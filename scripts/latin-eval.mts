/// <reference types="node" />
/**
 * Latin evaluation CLI (2026-10-17): coverage and gold-standard accuracy of the Latin analyser over the Vulgate, Cicero, Vergil,
 * Ovid and Newton's Principia, with PROIEL and the Perseus treebank as gold. Method, caveats and results: docs/latin/EVAL.md.
 *
 *   npx vite-node scripts/latin-eval.mts -- --corpus all --gold --json data/review/latin-eval/report.json --misses data/review/latin-eval/misses.json --md docs/latin/EVAL.md
 *
 *   --corpus  vulgate|nt|cicero|vergil|ovid|principia|perseus|perseus-<author>|main|all (comma list; default all)
 *   --gold    also score against PROIEL (nt) and the Perseus treebank (perseus-*, and cicero/vergil/ovid aligned onto it)
 *   --limit N first N sentences of each corpus (deterministic)
 *   --json F  full report as JSON          --misses F  top 300 unconfirmed / missing forms and top 300 gold lemma errors per corpus
 *   --md F    refresh the generated block of a markdown file (docs/latin/EVAL.md)     --raw-principia  do not expand q; and &
 *
 * Reads only: the Clementine USFX and PROIEL files of vetus-v0, the Wikisource JSON of romance-v0, and the downloads under
 * C:\Users\CJWal\dev\latin-eval-sources (override: LATIN_EVAL_SOURCES, LATIN_EVAL_VETUS, LATIN_EVAL_ROMANCE). Deterministic order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runEval, resolveCorpora, writeMarkdown, ALL_CORPORA } from './latin-eval-lib.mts';
import { loadLatinLexicon } from '../src/adapters/la';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const flag = (n: string): boolean => argv.includes(`--${n}`);
const arg = (n: string): string | undefined => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined; };

if (flag('help') || flag('h')) { console.log(`corpora: ${ALL_CORPORA.join(', ')}, perseus, main, all`); process.exit(0); }
const gold = flag('gold');
const spec = (arg('corpus') ?? 'all').split(',').map((s) => s.trim()).filter(Boolean);
const limit = arg('limit') ? Number(arg('limit')) : undefined;
const jsonOut = arg('json'); const missOut = arg('misses'); const mdOut = arg('md');
console.log(`latin-eval: corpora ${resolveCorpora(spec, gold).join(',')} gold=${gold} limit=${limit ?? 'none'}`);
const t0 = performance.now();
// The full lexicon (Whitaker + Lewis & Short backstop + form priors) is loaded lazily by the analyser; the measurement is of that state unless --seed-only asks for the inline seed.
if (!flag('seed-only')) await loadLatinLexicon();
const report = runEval({ corpora: spec, gold, limit, misses: !!missOut, rawPrincipia: flag('raw-principia') });
const secs = ((performance.now() - t0) / 1000).toFixed(1);

const pad = (s: string, n: number): string => s.padEnd(n);
const num = (x: number): string => x.toLocaleString('en-US');
console.log(`\nadapter ${report.adapter.id}; index build ${report.initMs} ms\n`);
console.log(pad('corpus', 20) + pad('words', 10) + pad('any', 8) + pad('lexicon', 9) + pad('rule', 7) + pad('guess', 8) + pad('none', 7) + pad('multi', 8) + 'words/s');
for (const c of Object.values(report.corpora)) {
  console.log(pad(c.name, 20) + pad(num(c.tokens), 10) + pad(c.anyReadingPct.toFixed(1), 8) + pad(c.lexiconConfirmedPct.toFixed(1), 9) + pad(c.ruleBuiltPct.toFixed(1), 7) + pad(c.unconfirmedGuessPct.toFixed(1), 8) + pad(c.noReadingPct.toFixed(1), 7) + pad(c.multiReadingPct.toFixed(1), 8) + num(c.wordsPerSecond));
}
const gs = Object.values(report.corpora).filter((c) => c.gold);
if (gs.length) {
  console.log('\n' + pad('gold corpus', 20) + pad('aligned', 18) + pad('lemma S/L', 14) + pad('POS S/L', 14) + pad('lemma+POS S/L', 16) + pad('feat-subset S/L', 17) + 'all L');
  for (const c of gs) {
    const g = c.gold!;
    console.log(pad(c.name, 20) + pad(`${num(g.aligned)} (${g.alignedPct.toFixed(0)}%)`, 18) + pad(`${g.lemmaStrict.toFixed(1)}/${g.lemmaLenient.toFixed(1)}`, 14) + pad(`${g.posStrict.toFixed(1)}/${g.posLenient.toFixed(1)}`, 14) + pad(`${g.lemmaPosStrict.toFixed(1)}/${g.lemmaPosLenient.toFixed(1)}`, 16) + pad(`${g.featuresSubsetStrict.toFixed(1)}/${g.featuresSubsetLenient.toFixed(1)}`, 17) + g.fullLenient.toFixed(1));
  }
  for (const c of gs) console.log(`\n${c.name}: top POS errors (lenient): ` + c.gold!.topPosErrors.map((e) => `${e.gold}->${e.system} ${e.n}`).join('; '));
}
const write = (file: string, body: string): void => { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, body); console.log(`wrote ${file}`); };
if (jsonOut) {
  const lean = JSON.parse(JSON.stringify(report)) as typeof report;
  for (const c of Object.values(lean.corpora)) { delete c.misses; if (c.gold) { c.gold.topLemmaErrors = []; c.gold.topPosErrorForms = []; c.gold.topFeatureErrors = []; } }
  write(jsonOut, JSON.stringify(lean, null, 1) + '\n');
}
if (missOut) {
  // sizes: the six main corpora keep the full lists, the treebank-own-text corpora a shorter one; examples only on the first rows of the gold lists
  const cap = <T extends { example?: string }>(xs: T[], n: number, withExample: number): T[] => xs.slice(0, n).map((x, i) => (i < withExample ? x : { ...x, example: undefined }));
  const m: Record<string, unknown> = { note: 'per corpus: unconfirmedOrMissing = commonest forms the adapter reads by guess or not at all (kind none|guess, count, one example); goldLemmaErrors = commonest forms whose first-reading lemma disagrees with the gold lemma (lenient); goldPosErrors = commonest (gold lemma, gold tag, adapter tag) POS disagreements (lenient); goldFeatureErrors = commonest feature disagreements on words whose lemma and POS are right. Rows are sorted by count, ties by text; fixed order.', adapter: report.adapter };
  for (const c of Object.values(report.corpora)) {
    const main = !c.name.startsWith('perseus-');
    m[c.name] = {
      tokens: c.tokens,
      unconfirmedOrMissing: c.misses ?? [],
      goldLemmaErrors: cap(c.gold?.topLemmaErrors ?? [], main ? 150 : 50, main ? 60 : 20),
      goldPosErrors: cap(c.gold?.topPosErrorForms ?? [], main ? 80 : 30, main ? 30 : 10),
      goldFeatureErrors: cap(c.gold?.topFeatureErrors ?? [], main ? 80 : 30, main ? 30 : 10),
    };
  }
  write(missOut, JSON.stringify(m) + '\n');
}
if (mdOut) { writeMarkdown(mdOut, report); console.log(`wrote ${mdOut}`); }
console.log(`\ntotal ${secs} s`);
