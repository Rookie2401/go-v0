/// <reference types="node" />
/**
 * npm run bench:units -- [--gold <file|dir>] [--text <file.txt|doc.json>] [--systems adapter,paragraph,spaces]
 *                         [--errors <out.json>] [--markdown] [--sensitivity <file.txt|doc.json|dir>]
 *                         [--write-constructed] [--check-constructed]
 *
 *  (no option)           the constructed stress cases (data/benchmarks/th/constructed-units.gold.jsonl) through every system:
 *                        boundary P / R / F1, paragraph exact-match, per-hazard table, every failing case, and the guards.
 *  --gold                a gold file (.jsonl) or a directory of them (see src/bench/units/gold.ts) instead.
 *  --text                guards only, over any text (no gold): one paragraph per non-empty line, or a v2 document (.json).
 *  --errors              write every error (gold vs system, named) to this JSON file (keep it under data/benchmarks/th/generated/).
 *  --sensitivity         the boundary sensitivity probe over a text file, a v2 document or a directory of documents.
 *  --write-constructed   regenerate the constructed gold file from src/bench/units/constructed.ts.
 * Thin CLI over src/bench/units. Nothing here is downloaded; nothing under src/bench is part of the app bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CorpusDocument } from '../src/ingest';
import {
  CONSTRUCTED_UNIT_CASES, UNIT_SYSTEMS, bookFromGold, type GoldUnits, documentsFromPlainText, evaluateSystem, paragraphsFromDocument, paragraphsFromPlainText,
  parseJsonl, renderBenchmark, renderByStratum, renderFailing, renderGuards, renderSensitivity, runGuards, sensitivity, toJsonl,
  goldSystem, unitSystem, validateUnitCases, type UnitGoldCase,
} from '../src/bench/units';

const USAGE = 'usage: npm run bench:units -- [--gold <file|dir>] [--text <file>] [--systems adapter,paragraph,spaces] [--errors <out.json>] [--sensitivity <file|dir>] [--write-constructed] [--check-constructed]';
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const CONSTRUCTED_FILE = 'data/benchmarks/th/constructed-units.gold.jsonl';
const FLAGS = new Set(['markdown', 'write-constructed', 'check-constructed']);
const OPTIONS = new Set(['gold', 'text', 'systems', 'errors', 'sensitivity']);
const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string | true> = {};
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (!k.startsWith('--')) fail(`bad argument: ${k}`);
  const name = k.slice(2);
  if (FLAGS.has(name)) { opt[name] = true; continue; }
  if (!OPTIONS.has(name)) fail(`unknown option ${k}`);
  const v = args[++i];
  if (v === undefined || v.startsWith('--')) fail(`${k} needs a value`);
  opt[name] = v;
}
const str = (k: string): string | undefined => (typeof opt[k] === 'string' ? (opt[k] as string) : undefined);

const read = (file: string): string => {
  if (!fs.existsSync(file)) fail(`cannot read: ${file}`);
  return fs.readFileSync(file, 'utf8');
};

if (opt['write-constructed']) {
  const errs = validateUnitCases(CONSTRUCTED_UNIT_CASES);
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(CONSTRUCTED_FILE), { recursive: true });
  fs.writeFileSync(CONSTRUCTED_FILE, toJsonl(CONSTRUCTED_UNIT_CASES), 'utf8');
  console.log(`bench:units - wrote ${CONSTRUCTED_UNIT_CASES.length} constructed cases to ${CONSTRUCTED_FILE}`);
  process.exit(0);
}
if (opt['check-constructed']) {
  const onDisk = read(CONSTRUCTED_FILE);
  const same = onDisk === toJsonl(CONSTRUCTED_UNIT_CASES);
  console.log(same ? 'bench:units - the constructed file matches src/bench/units/constructed.ts' : 'bench:units - the constructed file DIFFERS from src/bench/units/constructed.ts (run --write-constructed)');
  process.exit(same ? 0 : 1);
}

const systemIds = (str('systems') ?? UNIT_SYSTEMS.map((s) => s.id).join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const systems = systemIds.map((id) => { try { return unitSystem(id); } catch (e) { return fail(e instanceof Error ? e.message : String(e)); } });

function loadGold(spec: string | undefined): { cases: UnitGoldCase[]; label: string } {
  const where = spec ?? CONSTRUCTED_FILE;
  const files = fs.existsSync(where) && fs.statSync(where).isDirectory()
    ? fs.readdirSync(where).filter((f) => f.endsWith('.jsonl')).sort().map((f) => path.join(where, f))
    : [where];
  const cases = files.flatMap((f) => parseJsonl(read(f)));
  const errs = validateUnitCases(cases);
  if (errs.length) { console.error(errs.slice(0, 20).join('\n')); fail(`${errs.length} gold problem(s) in ${where}`); }
  return { cases, label: where };
}

let goldUnits: GoldUnits | undefined;
function loadDocuments(spec: string): { docs: CorpusDocument[]; label: string } {
  if (spec === 'constructed') {
    // The constructed hazard paragraphs read as a book, one paragraph per line (those with a line break are left out).
    const book = bookFromGold(CONSTRUCTED_UNIT_CASES);
    goldUnits = book.gold;
    return { docs: documentsFromPlainText(book.text), label: `the ${book.kept} constructed hazard paragraphs without a line break, read as a book (not real prose)` };
  }
  if (fs.existsSync(spec) && fs.statSync(spec).isDirectory()) {
    const docs = fs.readdirSync(spec).filter((f) => f.endsWith('.json')).sort()
      .map((f) => JSON.parse(read(path.join(spec, f))) as CorpusDocument).filter((d) => d.lang === 'th' && !d.scripture);
    return { docs, label: spec };
  }
  if (spec.endsWith('.json')) return { docs: [JSON.parse(read(spec)) as CorpusDocument], label: spec };
  return { docs: documentsFromPlainText(read(spec)), label: spec };
}

try {
  const sens = str('sensitivity');
  if (sens) {
    const { docs, label } = loadDocuments(sens);
    if (!docs.length) fail(`no Thai documents found in ${sens}`);
    console.log(renderSensitivity(await sensitivity(label, docs, goldUnits ? { segmentations: ['adapter', 'paragraph', 'spaces', 'gold'], gold: goldUnits } : {})));
    process.exit(0);
  }

  const textSpec = str('text');
  if (textSpec) {
    const paragraphs = textSpec.endsWith('.json') ? paragraphsFromDocument(JSON.parse(read(textSpec)) as CorpusDocument) : paragraphsFromPlainText(read(textSpec));
    console.log(`bench:units - guards over ${paragraphs.length} paragraphs of ${textSpec} (no gold)`);
    const guards = systems.map((s) => runGuards(paragraphs, s));
    console.log(renderGuards(guards));
    for (const g of guards) if (g.samples.length) console.log(`\n${g.system} samples:\n${g.samples.map((x) => `  ${x.guard} (paragraph ${x.paragraph + 1}) ${x.context}`).join('\n')}`);
    process.exit(0);
  }

  const { cases, label } = loadGold(str('gold'));
  console.log(`bench:units - ${cases.length} paragraphs from ${label}`);
  const reports = systems.map((s) => evaluateSystem(cases, s));
  console.log(renderBenchmark(reports));
  for (const r of reports) {
    console.log(`\n== ${r.system}: by hazard ==\n${renderByStratum(r)}`);
    console.log(`\n== ${r.system}: cases that differ from the gold ==\n${renderFailing(r)}`);
  }
  const paragraphs = cases.map((c) => c.paragraph);
  console.log(`\n== guards over the gold paragraphs ==\n${renderGuards(systems.map((s) => runGuards(paragraphs, s)))}`);
  console.log(`\n== guards: the gold units themselves (what a perfect splitter would score) ==\n${renderGuards([runGuards(paragraphs, goldSystem(cases))])}`);

  const errorsOut = str('errors');
  if (errorsOut) {
    fs.mkdirSync(path.dirname(errorsOut), { recursive: true });
    const payload = reports.map((r) => ({ system: r.system, cases: r.failing.map((x) => ({ id: x.id, stratum: x.stratum, paragraph: x.paragraph, gold: x.gold, system: x.system, errors: x.errors })) }));
    fs.writeFileSync(errorsOut, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\nerrors written to ${errorsOut}`);
  }
} catch (e) {
  console.error(`bench:units failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
}
