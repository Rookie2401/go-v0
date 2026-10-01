/// <reference types="node" />
/**
 * npm run bench:words [-- --gold <dir|file>] [--systems adapter,icu,dict-mm] [--external <name>=<file>]...
 *                       [--dict <kaikki.jsonl>] [--held-out] [--errors <dir>] [--md <file>] [--patterns 50]
 *
 * Word-segmentation benchmark: boundary precision / recall / F1 (overall and per stratum), word-level P / R / F1 and
 * the sentence exact-match rate, for each system, on the gold sentences found below --gold (default: the set derived
 * from Wiktionary examples, data/benchmarks/th/generated). Every sentence with an error is kept in
 * <errors dir>/<system>.errors.jsonl; --md writes tables and the most frequent error patterns as Markdown.
 *
 * Held-out sentences (gold rows with heldOut: true) are excluded from ordinary runs. An explicit --held-out run
 * evaluates ONLY them, prints numbers only, and writes their errors (with text) to <system>.heldout.errors.jsonl.
 * Systems: adapter (the real thAdapter), icu (Intl.Segmenter alone), dict-mm (OUR baseline over the Wiktionary
 * headwords, not an established tokenizer), external:<name> (a file in the editing format from another tool).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_KAIKKI_FILE, loadKaikkiBench } from '../src/bench/gold/kaikki-node';
import { GENERATED_DIR, loadGoldDir, writeText } from '../src/bench/gold/io-node';
import { evaluateSystem } from '../src/bench/words/metrics';
import { consoleSummary, markdownErrorKinds, markdownPatterns, markdownTable } from '../src/bench/words/report';
import { adapterSystem, dictMMSystem, externalSystem, icuSystem, type WordSystem } from '../src/bench/words/systems';

const USAGE = 'usage: npm run bench:words [-- --gold <dir|file>] [--systems adapter,icu,dict-mm] [--external <name>=<file>]... [--dict <kaikki.jsonl>] [--held-out] [--errors <dir>] [--md <file>] [--patterns 50]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const externals: string[] = [];
let heldOut = false;
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--held-out') { heldOut = true; continue; }
  const v = args[i + 1];
  if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  i++;
  if (k === '--external') externals.push(v); else opt[k.slice(2)] = v;
}
for (const k of Object.keys(opt)) if (!['gold', 'systems', 'dict', 'errors', 'md', 'patterns'].includes(k)) fail(`unknown option --${k}`);
const patternsN = opt.patterns === undefined ? 50 : Number(opt.patterns);
if (!Number.isInteger(patternsN) || patternsN < 0) fail('--patterns must be a whole number');
const wanted = (opt.systems ?? 'adapter,icu,dict-mm').split(',').map((s) => s.trim()).filter(Boolean);
for (const w of wanted) if (!['adapter', 'icu', 'dict-mm'].includes(w)) fail(`unknown system "${w}" (adapter, icu, dict-mm; external ones come from --external)`);

const goldArg = (opt.gold ?? GENERATED_DIR).replace(/\\/gu, '/');
const loaded = loadGoldDir(goldArg);
if (loaded.files.length === 0) fail(`no *.gold.jsonl found at ${goldArg}${goldArg === GENERATED_DIR ? ' (run: npm run gold:wiktionary)' : ''}`);
for (const p of loaded.problems.slice(0, 10)) console.error(`warning: ${p}`);
const gold = loaded.sentences.filter((s) => (heldOut ? s.heldOut === true : s.heldOut !== true));
if (gold.length === 0) fail(heldOut ? 'no held-out sentences in the gold set' : 'no (non held-out) sentences in the gold set');

const systems: WordSystem[] = [];
try {
  for (const w of wanted) {
    if (w === 'adapter') systems.push(adapterSystem);
    else if (w === 'icu') systems.push(icuSystem);
    else {
      const dictFile = opt.dict ?? DEFAULT_KAIKKI_FILE;
      if (!fs.existsSync(dictFile)) { console.error(`skipping dict-mm: cannot read ${dictFile}`); continue; }
      systems.push(dictMMSystem((await loadKaikkiBench(dictFile)).mmWords));
    }
  }
  for (const e of externals) {
    const eq = e.indexOf('=');
    if (eq < 1) fail(`--external wants <name>=<file>, got "${e}"`);
    const file = e.slice(eq + 1);
    if (!fs.existsSync(file)) fail(`cannot read ${file}`);
    systems.push(externalSystem(e.slice(0, eq), fs.readFileSync(file, 'utf8')));
  }
  if (systems.length === 0) fail('no systems to run');

  const reports = systems.map((s) => evaluateSystem(gold, s));
  const errorsDir = (opt.errors ?? path.join(fs.existsSync(goldArg) && fs.statSync(goldArg).isFile() ? path.dirname(goldArg) : goldArg, 'errors')).replace(/\\/gu, '/');
  const suffix = heldOut ? '.heldout.errors.jsonl' : '.errors.jsonl';
  for (const r of reports) {
    writeText(`${errorsDir}/${r.system.replace(/[^a-z0-9-]+/giu, '-')}${suffix}`, r.errors.map((e) => JSON.stringify(e)).join('\n') + (r.errors.length ? '\n' : ''));
  }

  console.log(`bench:words - ${gold.length} ${heldOut ? 'held-out ' : ''}sentences from ${loaded.files.length} gold file(s) at ${goldArg}`);
  console.log(`  runtime: Node ${process.version}, ICU ${process.versions.icu}, Unicode ${process.versions.unicode}`);
  console.log(consoleSummary(reports));
  console.log(`errors kept in ${errorsDir}/ (${heldOut ? 'held-out run: numbers only on screen' : 'one file per system'})`);

  if (opt.md) {
    const parts = [
      `Sentences: ${gold.length}. Percentages. Runtime: Node ${process.version}, ICU ${process.versions.icu}.`, '', markdownTable(reports), '', markdownErrorKinds(reports),
      ...(patternsN > 0 && !heldOut ? reports.flatMap((r) => ['', `#### Most frequent error patterns: ${r.system}`, '', markdownPatterns(r, patternsN)]) : []),
    ];
    writeText(opt.md, parts.join('\n') + '\n');
    console.log(`markdown written to ${opt.md}`);
  }
} catch (e) {
  console.error(`bench:words failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
