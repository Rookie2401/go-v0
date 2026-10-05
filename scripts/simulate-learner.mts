/// <reference types="node" />
/**
 * Simulated learner (READ-ONLY on the repository; writes only data/research/simulate/, which is git-ignored).
 *
 *   npx vite-node scripts/simulate-learner.mts [-- es de sq th hi] [--mode normal|preview|both] [--max-words N] [--max-texts N]
 *                                              [--max-minutes N] [--dict] [--skip-rereads] [--quiet]
 *
 * The owner's question: starting from zero, could a student reach B2 reading with this system, and is there fluff in the way?
 * This tool answers the READING half by letting the app's real engine choose every text (GoLearn.recommend, the ladder path, the
 * whole-library ranking), reading each as a deterministic learner (a lemma is known after 3 encounters; src/sim/learner.ts), and
 * emitting the events the reader emits so that GoLearn folds them as for a real student. Per language and mode it writes
 * data/research/simulate/<lang>-<mode>.json (per-text rows + summary) and one summary.md over every json found there.
 *
 *   normal    the learner may open only what the app opens outside preview (published texts)
 *   preview   as if every draft had been reviewed and recorded (recommend with includeUnpublished)
 *
 * --skip-rereads: the learner declines any recommendation for a text he has already finished (default: he follows the engine,
 * so a reread loop ends the run with "same text 3 times in a row"). Defaults: --max-words 1500000, --max-texts 3000, --max-minutes 30 (each per run). --dict also serves public/dict to the importer.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LanguageCode } from '../src/core';
import { createRealEngine } from '../src/sim/engine';
import { runSimulation } from '../src/sim/run';
import { renderReport, summarise } from '../src/sim/summary';
import type { SimMode, SimRun } from '../src/sim/types';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const ALL: LanguageCode[] = ['es', 'de', 'sq', 'th', 'hi'];
const langs: LanguageCode[] = [];
let mode: SimMode | 'both' = 'both';
let maxWords = 1_500_000, maxTexts = 3000, maxMinutes = 30;
let dict = false, quiet = false, skipRereads = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  const val = () => argv[++i];
  if (a === '--mode') { const v = val(); if (v === 'normal' || v === 'preview' || v === 'both') mode = v; else throw new Error(`--mode: normal, preview or both (got ${v})`); }
  else if (a === '--max-words') maxWords = Number(val());
  else if (a === '--max-texts') maxTexts = Number(val());
  else if (a === '--max-minutes') maxMinutes = Number(val());
  else if (a === '--dict') dict = true;
  else if (a === '--quiet') quiet = true;
  else if (a === '--skip-rereads') skipRereads = true;
  else if ((ALL as string[]).includes(a)) langs.push(a as LanguageCode);
  else throw new Error(`unknown argument: ${a}`);
}
if (![maxWords, maxTexts, maxMinutes].every((n) => Number.isFinite(n) && n > 0)) throw new Error('the budgets must be positive numbers');
const run: LanguageCode[] = langs.length ? langs : ALL;
const modes: SimMode[] = mode === 'both' ? ['normal', 'preview'] : [mode];

const OUT = path.resolve('data/research/simulate');
fs.mkdirSync(OUT, { recursive: true });
const t0 = performance.now();

for (const lang of run) {
  for (const m of modes) {
    const t1 = performance.now();
    console.log(`\n== ${lang} / ${m} ==`);
    const engine = await createRealEngine({ lang, dict });
    const tSetup = (performance.now() - t1) / 1000;
    try {
      const result = await runSimulation(engine, {
        includeUnpublished: m === 'preview', maxWords, maxTexts, maxMinutes, skipRereads,
        onRow: (r) => { if (!quiet && (r.n <= 5 || r.n % 25 === 0)) console.log(`  #${r.n} ${r.kind} ${r.words}w cov ${(r.cov3 * 100).toFixed(1)}% +${r.newKnown} known (${r.cumKnown} total, ${r.cumWords} words)  ${r.title.slice(0, 50)}`); },
      });
      const summary = summarise(result);
      fs.writeFileSync(path.join(OUT, `${lang}-${m}.json`), JSON.stringify({ summary, run: result }));
      console.log(`  setup ${tSetup.toFixed(1)} s (bootstrap ${(engine.setupMs.bootstrap / 1000).toFixed(1)}, ensureCourse ${(engine.setupMs.ensureCourse / 1000).toFixed(1)}); recommend ${(result.timing.recommendMs / 1000).toFixed(1)} s, open+analyse ${(result.timing.openMs / 1000).toFixed(1)} s, Stage 0 ${(result.timing.stage0Ms / 1000).toFixed(1)} s, reading ${(result.timing.readMs / 1000).toFixed(1)} s`);
      console.log(`  stop: ${result.stop.reason} - ${result.stop.detail}`);
      console.log(`  ${result.rows.length} texts, ${summary.words} words, ${summary.knownLemmas} known lemmas, ${((performance.now() - t1) / 1000).toFixed(1)} s`
        + `  (${(((performance.now() - t1) / 1000) / Math.max(1, summary.textsAfterStage0) * 100).toFixed(1)} s per 100 texts)`);
    } finally {
      engine.dispose();
    }
  }
}

// summary.md over every run on disk (so a partial re-run does not drop the others)
const found: Array<{ run: SimRun; summary: ReturnType<typeof summarise> }> = [];
for (const f of fs.readdirSync(OUT).filter((x) => /^[a-z]{2}-(normal|preview)\.json$/.test(x)).sort()) {
  try { found.push(JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))); } catch { /* an unreadable file is left out */ }
}
found.sort((a, b) => ALL.indexOf(a.run.lang) - ALL.indexOf(b.run.lang) || (a.run.mode < b.run.mode ? -1 : 1));
fs.writeFileSync(path.join(OUT, 'summary.md'), renderReport(found, new Date().toISOString()));
console.log(`\ndone in ${((performance.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
