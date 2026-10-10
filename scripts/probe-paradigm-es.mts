/// <reference types="node" />
/**
 * Spanish paradigm probe (READ-ONLY on the repository; writes only docs/ecosystem/linguistics/paradigm-es-2026-10-10.json).
 *
 *   npx vite-node scripts/probe-paradigm-es.mts [-- --limit N] [--out path]
 *
 * Streams data/dictionaries/kaikki.org-dictionary-Spanish.jsonl line by line (never whole). For every verb entry with
 * inflection-table rows (source "conjugation") and every noun / adjective entry with form rows, it maps the rows to the
 * adapter's feature keys (`featuresFromTableTags`), generates the adapter's own paradigm (`paradigm()`), merges the two
 * with `mergeParadigm`, and reports cells by status (verified / supported / generated / conflicted), the lemmas with the
 * most conflicts, the irregular verbs with the most conflicts, and the table tags the mapper does not know.
 * `--limit N` stops after N lines of the file (a fast run).
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { esAdapter, esLexicon } from '../src/adapters/es';
import { stripAccents } from '../src/adapters/spanish/morph-orth';
import { mergeParadigm, paradigmSummary, featureKey, type Paradigm } from '../src/core/paradigm';
import { alignDictionaryCells, enclitic } from '../src/adapters/spanish/paradigm';
import { tableRow, unknownTableTags } from '../src/adapters/spanish/table-tags';
import { conjugateSpanish } from '../src/adapters/spanish/morphology';
import type { PartOfSpeech } from '../src/core/model';

const args = process.argv.slice(2);
const argOf = (k: string): string | undefined => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const LIMIT = argOf('--limit') ? Number(argOf('--limit')) : Infinity;
const OUT = resolve(argOf('--out') ?? 'docs/ecosystem/linguistics/paradigm-es-2026-10-10.json');
const FILE = resolve('data/dictionaries/kaikki.org-dictionary-Spanish.jsonl');

type Row = { form: string; tags: string[]; raw_tags?: string[]; source?: string };
interface Pending { lemma: string; pos: PartOfSpeech; rows: Row[]; entries: number }
const POS: Record<string, PartOfSpeech> = { verb: 'VERB', noun: 'NOUN', adj: 'ADJ' };

const pending = new Map<string, Pending>();
const unknownTags = new Map<string, number>();
const bump = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1; };
let lines = 0;
let parsed = 0;

async function stream(): Promise<void> {
  const rl = createInterface({ input: createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (++lines > LIMIT) break;
    // cheap pre-filter: only verb / noun / adj entries that have forms at all
    if (!(line.startsWith('{"pos": "verb"') || line.startsWith('{"pos": "noun"') || line.startsWith('{"pos": "adj"'))) continue;
    if (!line.includes('"forms": [')) continue;
    const e = JSON.parse(line) as { word: string; pos: string; lang_code?: string; forms?: Row[] };
    if (e.lang_code && e.lang_code !== 'es') continue;
    const pos = POS[e.pos];
    if (!pos || !e.forms) continue;
    parsed++;
    // a verb's table is its "conjugation" rows; a noun / adjective has no table source, only form rows
    const rows = e.forms.filter((f) => (pos === 'VERB' ? f.source === 'conjugation' : true));
    if (!rows.length) continue;
    const key = `${pos}|${e.word}`;
    const p = pending.get(key) ?? { lemma: e.word, pos, rows: [], entries: 0 };
    p.entries++;
    p.rows.push(...rows);
    pending.set(key, p);
  }
}

interface Conflict { lemma: string; pos: string; cell: string; dictionary: string; generated: string[] }
const conflicts: Conflict[] = [];
const byLemma = new Map<string, { pos: string; n: number; kind: string; examples: Conflict[] }>();
const inList = { lemmas: 0, generated: 0, lemmasWithConflict: 0, cells: { verified: 0, supported: 0, generated: 0, conflicted: 0 } as Record<string, number> };
const totals = { lemmasWithTables: 0, generated: 0, notGenerated: 0, cells: { verified: 0, supported: 0, generated: 0, conflicted: 0 } as Record<string, number> };
const byPos: Record<string, { lemmas: number; generated: number; cells: Record<string, number> }> = {};
const byKind: Record<string, { lemmas: number; cells: Record<string, number> }> = {};
const conflictCells = new Map<string, number>();
const notGeneratedSample: string[] = [];
const rowOutcomes: Record<string, number> = {};

function kindOf(gen: { template?: string } | undefined): string {
  const t = gen?.template ?? 'none';
  if (t.startsWith('irregular')) return 'irregular';
  if (t.startsWith('stem-changing')) return 'stem-change';
  if (t.startsWith('regular')) return 'regular';
  return t;
}

function process1(p: Pending): void {
  totals.lemmasWithTables++;
  if (esLexicon.find(p.lemma, p.pos) || (p.pos === 'VERB' && esLexicon.find(p.lemma, 'AUX'))) inList.lemmas++;
  const pos = p.pos;
  const posStat = (byPos[pos] ??= { lemmas: 0, generated: 0, cells: { verified: 0, supported: 0, generated: 0, conflicted: 0 } });
  posStat.lemmas++;

  // dictionary cells
  const lemmaReflexive = pos === 'VERB' && /(ar|er|ir|ír)se$/.test(p.lemma);
  // some plain lemmas (apozar) carry the table of their pronominal use: infinitive apozarse, forms 'me apozo'
  const tableReflexive = pos === 'VERB' && p.rows.some((r) => r.form === `${p.lemma}se` && r.tags?.includes('infinitive'));
  const reflexive = lemmaReflexive || tableReflexive;
  const seen = new Set<string>();
  const dict: Array<{ features: Record<string, string>; form: string }> = [];
  for (const r of p.rows) {
    for (const t of unknownTableTags(r.tags)) unknownTags.set(t, (unknownTags.get(t) ?? 0) + 1);
    const form = (r.form ?? '').normalize('NFC');
    if (!form || form === '-') { bump(rowOutcomes, 'missing form ("-")'); continue; }
    // a reflexive verb's table writes the clitic before the form (me quejo): compare the bare form, the clitic is the cell's note
    const bare = reflexive ? /^(me|te|se|nos|os) (\S+)$/u.exec(form)?.[2] : undefined;
    if (!bare && /\s/.test(form)) { bump(rowOutcomes, 'phrase form (contains a space)'); continue; }
    if ((r.raw_tags ?? []).length && pos !== 'VERB') { bump(rowOutcomes, 'row with raw tags (a restricted use)'); continue; }
    const out = tableRow(r.tags ?? [], pos);
    if (!('features' in out)) { bump(rowOutcomes, `not placed: ${out.skipped}`); continue; }
    const k = featureKey(out.features) + '=' + (bare ?? form);
    if (seen.has(k)) continue;
    seen.add(k);
    bump(rowOutcomes, 'placed');
    let shown = bare ?? form;
    if (tableReflexive && !lemmaReflexive && out.features.VerbForm === 'Inf' && shown.endsWith('se')) shown = shown.slice(0, -2);
    if (tableReflexive && !lemmaReflexive && out.features.VerbForm === 'Ger' && shown.endsWith('se')) shown = stripAccents(shown.slice(0, -2));
    dict.push({ features: out.features, form: shown });
  }
  // the headword itself is the lemma cell of a noun or adjective (kaikki lists only the other forms)
  if (pos === 'NOUN') dict.push({ features: { Number: 'Sing' }, form: p.lemma });
  if (pos === 'ADJ') {
    const gendered = dict.some((d) => d.features.Gender === 'Fem' && d.features.Number === 'Sing');
    dict.push({ features: gendered ? { Gender: 'Masc', Number: 'Sing' } : { Number: 'Sing' }, form: p.lemma });
  }

  const gen = esAdapter.paradigm!(p.lemma, pos);
  if (!gen) {
    totals.notGenerated++;
    if (notGeneratedSample.length < 40) notGeneratedSample.push(`${p.lemma} (${pos})`);
    return;
  }
  totals.generated++;
  posStat.generated++;
  if (reflexive) {
    // the affirmative command is written with the clitic attached (lávate): equal to the cell's enclitic form = agreement
    const baseLemma = lemmaReflexive ? p.lemma.slice(0, -2) : p.lemma;
    for (const d of dict) {
      if (d.features.Mood !== 'Imp') continue;
      const g = gen.cells.find((c) => featureKey(c.features) === featureKey(d.features));
      if (g && enclitic(g.form, d.features.Person, d.features.Number, baseLemma) === d.form) d.form = g.form;
    }
  }
  const merged: Paradigm = mergeParadigm(
    { languageId: 'es', lemma: p.lemma, pos, kind: gen.kind, template: gen.template, notes: gen.notes, sources: [], layout: gen.layout },
    gen.cells,
    alignDictionaryCells(gen.cells, dict),
  );
  const sum = paradigmSummary(merged);
  if (esLexicon.find(p.lemma, pos) || (pos === 'VERB' && esLexicon.find(p.lemma, 'AUX'))) {
    inList.generated++;
    if (sum.conflicted) inList.lemmasWithConflict++;
    for (const st of ['verified', 'supported', 'generated', 'conflicted'] as const) inList.cells[st] += sum[st];
  }
  const kind = kindOf(gen);
  const ks = (byKind[`${pos}:${kind}`] ??= { lemmas: 0, cells: { verified: 0, supported: 0, generated: 0, conflicted: 0 } });
  ks.lemmas++;
  for (const s of ['verified', 'supported', 'generated', 'conflicted'] as const) { totals.cells[s] += sum[s]; posStat.cells[s] += sum[s]; ks.cells[s] += sum[s]; }
  if (sum.conflicted) {
    const entry = byLemma.get(`${pos}|${p.lemma}`) ?? { pos, n: 0, kind, examples: [] };
    for (const c of merged.cells) {
      if (c.status !== 'conflicted') continue;
      const cell = featureKey(c.features);
      const cf: Conflict = { lemma: p.lemma, pos, cell, dictionary: c.form, generated: c.alternatives ?? [] };
      entry.n++;
      if (entry.examples.length < 6) entry.examples.push(cf);
      conflictCells.set(cell.replace(/\|?(Number|Gender)=[A-Za-z]+/g, '').replace(/^\|/, ''), (conflictCells.get(cell.replace(/\|?(Number|Gender)=[A-Za-z]+/g, '').replace(/^\|/, '')) ?? 0) + 1);
      conflicts.push(cf);
    }
    byLemma.set(`${pos}|${p.lemma}`, entry);
  }
}

await stream();
const started = Date.now();
for (const p of pending.values()) process1(p);

const top = [...byLemma.entries()].map(([k, v]) => ({ lemma: k.split('|')[1], ...v })).sort((a, b) => b.n - a.n);
const topConflicting = top.slice(0, 20);
const irregularTop = top.filter((t) => t.pos === 'VERB' && t.kind === 'irregular').slice(0, 20);
const topCells = [...conflictCells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
const unknown = [...unknownTags.entries()].sort((a, b) => b[1] - a[1]);
const lemmaConflictCounts = { withConflict: byLemma.size };
void conjugateSpanish;

const report = {
  generatedAt: new Date().toISOString(),
  adapter: `adapter-es@${esAdapter.version}`,
  file: 'data/dictionaries/kaikki.org-dictionary-Spanish.jsonl',
  linesRead: Math.min(lines, LIMIT),
  limit: Number.isFinite(LIMIT) ? LIMIT : null,
  entriesParsed: parsed,
  lemmasWithTables: totals.lemmasWithTables,
  lemmasGenerated: totals.generated,
  lemmasNotGenerated: totals.notGenerated,
  cells: totals.cells,
  byPos,
  byKind,
  rowOutcomes,
  lemmasWithConflict: lemmaConflictCounts.withConflict,
  courseWordList: inList,
  topConflictingLemmas: topConflicting,
  irregularVerbsMostConflicts: irregularTop,
  conflictsByCell: topCells,
  unknownTags: unknown,
  notGeneratedSample,
  seconds: Math.round((Date.now() - started) / 1000),
};
writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n', 'utf8');

const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(2) + ' %' : 'n/a');
const cellTotal = Object.values(totals.cells).reduce((a, b) => a + b, 0);
console.log(`lines read ${report.linesRead}; entries parsed ${parsed}; lemmas with tables ${totals.lemmasWithTables}; generated ${totals.generated}; not generated ${totals.notGenerated}`);
console.log(`cells ${cellTotal}: verified ${totals.cells.verified} (${pct(totals.cells.verified, cellTotal)}), supported ${totals.cells.supported}, generated-only ${totals.cells.generated}, conflicted ${totals.cells.conflicted} (${pct(totals.cells.conflicted, cellTotal)})`);
console.log('by pos', JSON.stringify(byPos));
console.log('by kind', JSON.stringify(byKind));
console.log('row outcomes', JSON.stringify(rowOutcomes));
console.log('lemmas with a conflict', byLemma.size);
console.log('course word list:', JSON.stringify(inList));
console.log('top conflicting lemmas:');
for (const t of topConflicting) console.log(`  ${t.lemma} (${t.pos}, ${t.kind}) ${t.n}: ${t.examples.slice(0, 2).map((e) => `${e.cell} dict=${e.dictionary} gen=${e.generated.join('/')}`).join(' | ')}`);
console.log('irregular verbs with most conflicts:');
for (const t of irregularTop) console.log(`  ${t.lemma} ${t.n}: ${t.examples.slice(0, 2).map((e) => `${e.cell} dict=${e.dictionary} gen=${e.generated.join('/')}`).join(' | ')}`);
console.log('conflicts by cell kind (top):', JSON.stringify(topCells.slice(0, 12)));
console.log('unknown tags:', JSON.stringify(unknown.slice(0, 40)));
console.log('wrote', OUT);
const allOut = argOf('--conflicts');
if (allOut) writeFileSync(resolve(allOut), conflicts.map((c) => `${c.pos}\t${c.lemma}\t${c.cell}\t${c.dictionary}\t${c.generated.join('/')}`).join('\n') + '\n', 'utf8');
