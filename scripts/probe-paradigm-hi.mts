/**
 * Hindi paradigm probe (GoLearn Linguistic Engine V2, Stage 3; 2026-10-10).
 *
 * Streams the Wiktionary dump (kaikki.org, Hindi), takes every noun / name / adjective / pronoun / verb entry with an
 * inflection table (`forms` rows whose `source` is "declension" or "conjugation"), maps the rows with the adapter's
 * table-tag map, generates the same lexeme's paradigm with the adapter's `paradigm()`, merges the two halves with
 * `mergeParadigm` (through `hiParadigmFromTable`) and reports how far they agree.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/probe-paradigm-hi.mts [--out docs/ecosystem/linguistics/paradigm-hi-2026-10-10.json] [--top 20] [--limit 100000]
 *
 * Reads data/dictionaries/kaikki.org-dictionary-Hindi.jsonl (166 MB, not committed). Agreement of the two halves is not
 * correctness: the dictionary's tables are template-generated and the word list is machine-drafted. A `conflicted` cell
 * is a question for a reviewer.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { PartOfSpeech } from '../src/core';
import { featureKey, paradigmSummary } from '../src/core/paradigm';
import { HI_PARADIGM_CONTEXT, hiAdapter } from '../src/adapters/hi';
import { hiParadigmFromTable, hiTableCells } from '../src/adapters/hindi/paradigm';
import { hiTableTagsDetail } from '../src/adapters/hindi/table-tags';

const argv = process.argv.slice(2);
const arg = (name: string, dflt: string): string => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const OUT = arg('out', 'docs/ecosystem/linguistics/paradigm-hi-2026-10-10.json');
const TOP = Number(arg('top', '20'));
const LIMIT = Number(arg('limit', '1000000'));
const DUMP = path.resolve('data/dictionaries/kaikki.org-dictionary-Hindi.jsonl');

const POS: Record<string, PartOfSpeech> = { noun: 'NOUN', name: 'PROPN', adj: 'ADJ', verb: 'VERB', pron: 'PRON' };
interface Row { form: string; tags: string[] }
interface Stat {
  entries: number; withTables: number; multiword: number; lemmasWithConflict: number; lemmasAllVerified: number; generated: number; generatedAndTable: number; tableOnly: number; generatedOnly: number;
  cells: Record<string, number>; rowsSeen: number; rowsPlaced: number; skipped: Record<string, number>;
}
const blank = (): Stat => ({ entries: 0, withTables: 0, multiword: 0, lemmasWithConflict: 0, lemmasAllVerified: 0, generated: 0, generatedAndTable: 0, tableOnly: 0, generatedOnly: 0, cells: { verified: 0, supported: 0, generated: 0, conflicted: 0 }, rowsSeen: 0, rowsPlaced: 0, skipped: {} });
const stats: Record<string, Stat> = {};
const unknownTags: Record<string, number> = {};
const conflicts: Array<{ lemma: string; pos: string; features: Record<string, string>; dictionary: string; generated: string[] }> = [];
const conflictShapes: Record<string, number> = {};
const supportedShapes: Record<string, number> = {};
const generatedShapes: Record<string, number> = {};

async function main(): Promise<void> {
  if (!fs.existsSync(DUMP)) throw new Error(`missing ${DUMP}`);
  const rl = readline.createInterface({ input: fs.createReadStream(DUMP, { encoding: 'utf8' }), crlfDelay: Infinity });
  let seen = 0;
  for await (const line of rl) {
    if (!line) continue;
    let o: { word: string; pos: string; forms?: Array<{ form: string; tags?: string[]; source?: string }> };
    try { o = JSON.parse(line); } catch { continue; }
    const pos = POS[o.pos];
    if (!pos) continue;
    const st = (stats[pos] ??= blank());
    st.entries++;
    const rows: Row[] = (o.forms ?? []).filter((f) => f.source === 'declension' || f.source === 'conjugation').map((f) => ({ form: f.form, tags: f.tags ?? [] }));
    if (!rows.length) continue;
    if (++seen > LIMIT) break;
    st.withTables++;
    const lemma = o.word.normalize('NFC');
    if (/\s/.test(lemma)) st.multiword++;
    for (const r of rows) {
      const d = hiTableTagsDetail(r.tags, pos, r.form);
      for (const t of d.unknown) unknownTags[`${pos}:${t}`] = (unknownTags[`${pos}:${t}`] ?? 0) + 1;
      if (r.tags.includes('table-tags') || r.tags.includes('inflection-template') || r.tags.includes('class')) continue;
      st.rowsSeen++;
      if (d.skipped) st.skipped[d.skipped] = (st.skipped[d.skipped] ?? 0) + 1; else st.rowsPlaced++;
    }
    const g = hiAdapter.paradigm?.(lemma, pos);
    const p = hiParadigmFromTable(lemma, pos, rows, HI_PARADIGM_CONTEXT);
    const t = hiTableCells(rows, pos, g);
    if (g) st.generated++;
    if (g && t.cells.length) st.generatedAndTable++;
    if (!g && t.cells.length) st.tableOnly++;
    if (g && !t.cells.length) st.generatedOnly++;
    if (!p) continue;
    const sum = paradigmSummary(p);
    for (const k of Object.keys(sum) as Array<keyof typeof sum>) st.cells[k] += sum[k];
    if (!g) continue;
    if (sum.conflicted) st.lemmasWithConflict++;
    if (t.cells.length && !sum.conflicted && !sum.generated) st.lemmasAllVerified++;
    for (const c of p.cells) {
      const shape = `${pos}:${Object.keys(c.features).sort().map((k) => (k === 'Case' || k === 'Number' || k === 'VerbForm' || k === 'Mood' || k === 'Tense' || k === 'Aspect' || k === 'Polite' || k === 'Person' ? `${k}=${c.features[k]}` : k)).join('|')}`;
      if (c.status === 'conflicted') {
        conflictShapes[shape] = (conflictShapes[shape] ?? 0) + 1;
        if (conflicts.length < 4000) conflicts.push({ lemma, pos, features: c.features, dictionary: c.form, generated: c.alternatives ?? [] });
      } else if (c.status === 'supported') supportedShapes[shape] = (supportedShapes[shape] ?? 0) + 1;
      else if (c.status === 'generated' && t.cells.length) generatedShapes[shape] = (generatedShapes[shape] ?? 0) + 1;
    }
  }
  const byShape = new Map<string, number>();
  for (const c of conflicts) byShape.set(`${c.pos}|${featureKey(c.features)}|${c.dictionary}<->${c.generated.join('/')}`, (byShape.get(`${c.pos}|${featureKey(c.features)}|${c.dictionary}<->${c.generated.join('/')}`) ?? 0) + 1);
  const top = (m: Record<string, number>, n: number): Array<[string, number]> => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  const report = {
    probe: 'paradigm-hi', date: '2026-10-10', source: 'kaikki.org Hindi (Wiktionary)', limit: LIMIT,
    stats,
    unknownTags: top(unknownTags, 60),
    conflictShapes: top(conflictShapes, TOP),
    supportedShapes: top(supportedShapes, TOP),
    generatedOnlyShapesInEntriesWithTables: top(generatedShapes, TOP),
    topConflicts: conflicts.slice(0, TOP),
    conflictSample: conflicts.slice(TOP, TOP + 100),
  };
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify({ stats, unknownTags: report.unknownTags.slice(0, 15), conflictShapes: report.conflictShapes, supportedShapes: report.supportedShapes.slice(0, 10), generatedShapes: report.generatedOnlyShapesInEntriesWithTables.slice(0, 10) }, null, 1));
  console.log('top conflicts');
  for (const c of conflicts.slice(0, TOP)) console.log(`  ${c.pos} ${c.lemma} ${featureKey(c.features)}  dict ${c.dictionary}  rules ${c.generated.join(' / ')}`);
}

void main();
