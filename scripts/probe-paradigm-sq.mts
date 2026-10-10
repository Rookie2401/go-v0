/**
 * Albanian paradigm probe (GoLearn Linguistic Engine V2, Stage 3; 2026-10-10).
 *
 * Streams the Wiktionary dump (kaikki.org, Albanian), takes every noun / name / adjective / verb entry with an inflection
 * table (`forms` rows whose `source` is "declension" or "conjugation"), maps the rows with the adapter's
 * `featuresFromTableTags`, generates the same lexeme's paradigm with the adapter's `paradigm()`, merges the two halves
 * with `mergeParadigm` (through `sqParadigmFromTable`) and reports how far they agree.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/probe-paradigm-sq.mts [--out docs/ecosystem/linguistics/paradigm-sq-2026-10-10.json] [--top 20]
 *
 * Reads data/dictionaries/kaikki.org-dictionary-Albanian.jsonl.gz (not committed). Prints the table; writes the JSON.
 * Agreement of the two halves is not correctness: Wiktionary's Albanian tables are template-generated and sometimes wrong
 * (docs/albanian/STATUS.md), and the word list is machine-drafted. A `conflicted` cell is a question for a reviewer.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import type { PartOfSpeech } from '../src/core';
import { featureKey, paradigmSummary } from '../src/core/paradigm';
import { sqAdapter } from '../src/adapters/sq';
import { sqParadigmFromTable } from '../src/adapters/albanian/paradigm';
import { sqTableTagsDetail } from '../src/adapters/albanian/table-tags';

const argv = process.argv.slice(2);
const arg = (name: string, dflt: string): string => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const OUT = arg('out', 'docs/ecosystem/linguistics/paradigm-sq-2026-10-10.json');
const TOP = Number(arg('top', '20'));
const DUMP = path.resolve('data/dictionaries/kaikki.org-dictionary-Albanian.jsonl.gz');

const POS: Record<string, PartOfSpeech> = { noun: 'NOUN', name: 'PROPN', adj: 'ADJ', verb: 'VERB' };
/** Table kinds the paradigm does not merge, only counted (a pronoun table has no person in its tags). */
const COUNTED_ONLY = new Set(['pron', 'det', 'prep', 'suffix']);

interface Row { form: string; tags: string[] }
interface Entry { lemma: string; pos: PartOfSpeech; rows: Row[]; gender?: 'Masc' | 'Fem' | 'Neut' }

/** lemma|pos → the dump entries with a table (homographs are separate entries: pres = to wait / to cut). */
const entries = new Map<string, Entry[]>();
let homographEntries = 0;
const countedOnly: Record<string, number> = {};
const unknownTags = new Map<string, number>();
const skipped: Record<string, Record<string, number>> = {};
const rowStats: Record<string, { rows: number; placed: number }> = {};
let totalEntries = 0;

async function readDump(): Promise<void> {
  const rl = readline.createInterface({ input: fs.createReadStream(DUMP).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    totalEntries++;
    const e = JSON.parse(line) as { word: string; pos: string; forms?: Array<{ form: string; tags?: string[]; source?: string }> };
    const table = (e.forms ?? []).filter((f) => f.source === 'declension' || f.source === 'conjugation');
    if (!table.length) continue;
    if (COUNTED_ONLY.has(e.pos)) { countedOnly[e.pos] = (countedOnly[e.pos] ?? 0) + 1; continue; }
    const pos = POS[e.pos];
    if (!pos) continue;
    const key = `${e.word}|${pos}`;
    const entry: Entry = { lemma: e.word, pos, rows: [] };
    const gtag = (e.forms ?? []).find((f) => !f.source && (f.tags ?? []).includes('canonical'));
    if (gtag?.tags?.includes('masculine')) entry.gender = 'Masc';
    else if (gtag?.tags?.includes('feminine')) entry.gender = 'Fem';
    const seen = new Set<string>();
    for (const f of table) {
      const tags = f.tags ?? [];
      // the header rows of the dump's table (the template name, the tag list) are not forms
      if (tags.includes('table-tags') || tags.includes('inflection-template')) continue;
      const id = `${f.form}|${tags.join(' ')}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entry.rows.push({ form: f.form, tags });
    }
    const list = entries.get(key) ?? [];
    if (list.length) homographEntries++;
    list.push(entry);
    entries.set(key, list);
  }
}

interface Conflict { lemma: string; pos: string; cell: string; dictionary: string; rules: string; alternatives: string[] }
interface PosReport {
  lemmasWithTables: number; lemmasGenerated: number; lemmasNotGenerated: number;
  cells: { verified: number; supported: number; generated: number; conflicted: number };
  cellsOfGenerable: { verified: number; supported: number; generated: number; conflicted: number };
  lemmasFullyVerified: number; lemmasWithConflict: number;
}

const zero = () => ({ verified: 0, supported: 0, generated: 0, conflicted: 0 });
const reports: Record<string, PosReport> = {};
const conflicts: Conflict[] = [];
const conflictShapes = new Map<string, number>();
const conflictByLemma = new Map<string, number>();

function run(): void {
  for (const list of entries.values()) {
    const posName = list[0].pos;
    const rep = (reports[posName] ??= {
      lemmasWithTables: 0, lemmasGenerated: 0, lemmasNotGenerated: 0, cells: zero(), cellsOfGenerable: zero(), lemmasFullyVerified: 0, lemmasWithConflict: 0,
    });
    const st = (rowStats[posName] ??= { rows: 0, placed: 0 });
    rep.lemmasWithTables++;
    for (const entry of list) for (const r of entry.rows) {
      st.rows++;
      const d = sqTableTagsDetail(r.tags, entry.pos);
      for (const u of d.unknown) unknownTags.set(`${posName}:${u}`, (unknownTags.get(`${posName}:${u}`) ?? 0) + 1);
      if (d.features) st.placed++;
      else {
        const why = d.skipped ?? 'not-a-form';
        const m = (skipped[posName] ??= {});
        m[why] = (m[why] ?? 0) + 1;
      }
    }
    const generable = !!sqAdapter.paradigm?.(list[0].lemma, list[0].pos);
    if (generable) rep.lemmasGenerated++; else rep.lemmasNotGenerated++;
    // the word list holds one lexeme per spelling: of several homograph entries the one that agrees best is merged
    const merged = list.map((en) => ({ en, p: sqParadigmFromTable(en.lemma, en.pos, en.rows, { ...(en.gender ? { gender: en.gender } : {}) }) })).filter((x) => x.p);
    if (!merged.length) continue;
    merged.sort((a, b) => { const sa = paradigmSummary(a.p!), sb = paradigmSummary(b.p!); return (sb.verified - sb.conflicted) - (sa.verified - sa.conflicted); });
    const entry = merged[0].en;
    const p = merged[0].p!;
    const sum = paradigmSummary(p);
    for (const k of Object.keys(sum) as Array<keyof typeof sum>) {
      rep.cells[k] += sum[k];
      if (generable) rep.cellsOfGenerable[k] += sum[k];
    }
    if (generable) {
      if (sum.conflicted > 0) rep.lemmasWithConflict++;
      if (sum.generated === 0 && sum.conflicted === 0 && sum.supported === 0 && sum.verified > 0) rep.lemmasFullyVerified++;
    }
    for (const c of p.cells) {
      if (c.status !== 'conflicted') continue;
      const f = c.features;
      const cell = featureKey(f);
      conflicts.push({ lemma: entry.lemma, pos: posName, cell, dictionary: c.form, rules: (c.alternatives ?? []).join(' / '), alternatives: c.alternatives ?? [] });
      const shape = posName === 'VERB'
        ? `${f.Voice ?? ''} ${f.Mood ?? ''} ${f.Tense ?? ''} ${f.Person ?? ''}${f.Number ?? ''}`.replace(/\s+/g, ' ').trim()
        : `${f.Definite ?? ''} ${f.Case ?? ''} ${f.Number ?? ''}${f.Gender ? ' ' + f.Gender : ''}`.replace(/\s+/g, ' ').trim();
      conflictShapes.set(`${posName}: ${shape}`, (conflictShapes.get(`${posName}: ${shape}`) ?? 0) + 1);
      conflictByLemma.set(`${entry.lemma}|${posName}`, (conflictByLemma.get(`${entry.lemma}|${posName}`) ?? 0) + 1);
    }
  }
}

function pct(a: number, b: number): string { return b ? `${((100 * a) / b).toFixed(1)}%` : '-'; }

async function main(): Promise<void> {
  if (!fs.existsSync(DUMP)) { console.error(`missing ${DUMP}`); process.exit(2); }
  await readDump();
  run();

  console.log(`Albanian paradigm probe: ${totalEntries} dump entries; ${entries.size} lemmas (noun/name/adj/verb) with an inflection table;  dump entries that are homographs of another table entry: ${homographEntries} (the best-agreeing one is merged); tables of other kinds (counted only): ${JSON.stringify(countedOnly)}\n`);
  const header = ['pos', 'lemmas w/ table', 'adapter generates', 'verified', 'supported', 'generated', 'conflicted', 'conflict rate*', 'lemmas w/ conflict', 'fully verified', 'rows placed'];
  const lines: string[][] = [header];
  const total = { l: 0, g: 0, v: 0, s: 0, ge: 0, c: 0, lc: 0, fv: 0, rows: 0, placed: 0 };
  for (const [pos, r] of Object.entries(reports)) {
    const cmp = r.cellsOfGenerable.verified + r.cellsOfGenerable.conflicted;
    lines.push([pos, String(r.lemmasWithTables), `${r.lemmasGenerated} (${pct(r.lemmasGenerated, r.lemmasWithTables)})`, String(r.cells.verified), String(r.cells.supported), String(r.cells.generated), String(r.cells.conflicted),
      pct(r.cellsOfGenerable.conflicted, cmp), String(r.lemmasWithConflict), String(r.lemmasFullyVerified), `${rowStats[pos].placed}/${rowStats[pos].rows}`]);
    total.l += r.lemmasWithTables; total.g += r.lemmasGenerated; total.v += r.cells.verified; total.s += r.cells.supported; total.ge += r.cells.generated; total.c += r.cells.conflicted;
    total.lc += r.lemmasWithConflict; total.fv += r.lemmasFullyVerified; total.rows += rowStats[pos].rows; total.placed += rowStats[pos].placed;
  }
  lines.push(['all', String(total.l), `${total.g} (${pct(total.g, total.l)})`, String(total.v), String(total.s), String(total.ge), String(total.c), '', String(total.lc), String(total.fv), `${total.placed}/${total.rows}`]);
  const widths = header.map((_, i) => Math.max(...lines.map((l) => l[i].length)));
  for (const l of lines) console.log(l.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log('* conflicted / (verified + conflicted) over the cells of lemmas the adapter generates: where both halves have a form, how often they differ.\n');

  console.log('Rows the mapper did not place (by reason):');
  for (const [pos, m] of Object.entries(skipped)) console.log(`  ${pos}: ${JSON.stringify(m)}`);

  const lemmaTop = [...conflictByLemma.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
  console.log(`\nTop ${TOP} conflicting lemmas (number of conflicted cells; the first conflicted cell shown, dictionary's form vs the rules'):`);
  for (const [k, n] of lemmaTop) {
    const [lemma, pos] = k.split('|');
    const first = conflicts.find((c) => c.lemma === lemma && c.pos === pos)!;
    console.log(`  ${lemma} (${pos}) ${n} cells: ${first.cell}  dictionary "${first.dictionary}"  rules "${first.rules}"`);
  }
  const shapeTop = [...conflictShapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('\nTop conflicting cell kinds:');
  for (const [k, n] of shapeTop) console.log(`  ${String(n).padStart(5)}  ${k}`);

  const unk = [...unknownTags.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\nTags the mapper did not understand (${unk.length} kinds):`);
  for (const [k, n] of unk.slice(0, 40)) console.log(`  ${String(n).padStart(6)}  ${k}`);

  const json = {
    generatedAt: '2026-10-10',
    source: { dump: 'kaikki.org-dictionary-Albanian.jsonl.gz', entriesInDump: totalEntries, licence: 'CC BY-SA 4.0 (Wiktionary)' },
    lemmasWithTables: entries.size,
    homographEntries,
    tablesCountedOnly: countedOnly,
    byPos: reports,
    rows: rowStats,
    rowsNotPlaced: skipped,
    topConflictingLemmas: lemmaTop.map(([k, n]) => {
      const [lemma, pos] = k.split('|');
      return { lemma, pos, conflictedCells: n, cells: conflicts.filter((c) => c.lemma === lemma && c.pos === pos).slice(0, 6) };
    }),
    topConflictKinds: shapeTop.map(([kind, n]) => ({ kind, n })),
    unknownTags: Object.fromEntries(unk),
    allConflicts: conflicts.length,
  };
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), `${JSON.stringify(json, null, 2)}\n`);
  console.log(`\nwrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
