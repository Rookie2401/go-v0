/// <reference types="node" />
/**
 * The ladder coverage gate (docs/LADDER.md): `npm run ladder:check [-- es de ...]`.
 * Default: every language with a data/ladder/<lang>/ladder.json. Prints a table per language, then the findings; exits 1
 * when any finding is an error (or a ladder file is malformed). With no ladder files: "no ladders yet", exit 0.
 */
import path from 'node:path';
import type { LanguageCode } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { LadderFormatError, ladderFile, ladderLanguages, loadLadder, measureLadder } from '../src/ladder';
import type { LadderReport } from '../src/ladder';
import fs from 'node:fs';

const root = path.resolve('.');
const args = process.argv.slice(2).filter((a) => a !== '--');
const available = ladderLanguages(root);
const requested = args.length ? (args as LanguageCode[]) : available;

const pad = (s: string | number, n: number, right = false): string => (right ? String(s).padStart(n) : String(s).padEnd(n));
const pct = (x: number): string => (x * 100).toFixed(1);

function printReport(r: LadderReport): void {
  console.log(`\n=== ${r.lang}: ${r.rows.length} units; Stage 0 head ${r.head.texts} texts, ${r.head.words} words, ${r.head.lemmas} lemmas, ${r.head.constructions} constructions ===`);
  console.log(`${pad('unit', 22)} ${pad('stage', 9)} ${pad('kind', 10)} ${pad('domain', 14)} ${pad('words', 6, true)} ${pad('cov3 %', 7, true)} ${pad('cov1 %', 7, true)} ${pad('new', 4, true)} ${pad('/100w', 6, true)}  constructions first met`);
  for (const row of r.rows) {
    const flag = row.status !== 'ok' ? ` [${row.status}]` : row.allowance ? ' [first-units band]' : '';
    console.log(`${pad(row.id, 22)} ${pad(row.stage, 9)} ${pad(row.kind, 10)} ${pad(row.domain + (row.scripture ? '*' : ''), 14)} ${pad(row.words, 6, true)} ${pad(pct(row.cov3), 7, true)} ${pad(pct(row.cov1), 7, true)} ${pad(row.newLemmas, 4, true)} ${pad(row.newPer100.toFixed(1), 6, true)}  ${row.constructionsFirstMet.join(', ')}${flag}`);
  }
  console.log('\nstage       units   words  scripture %  mean cov3 %   (* = Scripture)');
  for (const s of r.stages) console.log(`${pad(s.stage, 10)} ${pad(s.units, 6, true)} ${pad(s.words, 7, true)} ${pad(pct(s.scriptureShare), 11, true)} ${pad(s.meanCov3 === null ? '-' : pct(s.meanCov3), 12, true)}`);
  const o = r.advice.orphans, rc = r.advice.recurrence;
  console.log(`\norphans    (advice): ${o.orphanLemmas} of ${o.newLemmas} new lemmas in ${o.judgedUnits} judged units are never met again; ${o.unitsOverThreshold} unit(s) over the threshold${o.worst.length ? '; worst: ' + o.worst.map((w) => `${w.unit} ${w.orphans}/${w.newLemmas}`).join(', ') : ''}`);
  console.log(`recurrence (advice): ${rc.nonWidening} of ${rc.judgedUnits} judged units have intervals that do not widen${rc.worst.length ? '; worst: ' + rc.worst.map((w) => `${w.unit} ${w.first}->${w.second}`).join(', ') : ''}`);
  if (!r.findings.length) console.log('\nno findings.');
  else {
    console.log('');
    for (const f of r.findings) console.log(`${f.level === 'error' ? 'ERROR  ' : 'warning'} ${r.lang} ${f.unit} [${f.check}] ${f.message}`);
  }
  console.log(`\n${r.lang}: ${r.errors} error(s), ${r.warnings} warning(s)`);
}

if (!requested.length) {
  console.log('no ladders yet (no data/ladder/<lang>/ladder.json)');
} else {
  const registry = createAdapterRegistry();
  let errors = 0;
  for (const lang of requested) {
    if (!fs.existsSync(ladderFile(lang, root))) { console.log(`${lang}: no ladder yet (data/ladder/${lang}/ladder.json not found)`); continue; }
    try {
      printReport((() => { const r = measureLadder(lang, loadLadder(lang, root), { adapter: registry.get(lang) }); errors += r.errors; return r; })());
    } catch (e) {
      if (!(e instanceof LadderFormatError)) throw e;
      errors++;
      console.log(`ERROR   ${lang} ladder.json: ${e.message}`);
    }
  }
  if (errors) { console.log(`\nladder:check FAILED: ${errors} error(s)`); process.exitCode = 1; }
  else console.log('\nladder:check ok');
}
