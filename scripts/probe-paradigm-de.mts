/**
 * German paradigm probe (GoLearn Linguistic Engine V2, Stage 3; 2026-10-10).
 *
 * Streams the Wiktionary dump (kaikki.org, German; ~1 GB, line by line), takes every noun / adjective / verb / determiner
 * entry with an inflection table (`forms` rows whose `source` is "declension" or "conjugation"), maps the rows with the
 * adapter's table-tag mapper, generates the same lexeme's paradigm with the adapter's `paradigm()`, merges the two halves with
 * `mergeParadigm` (through `deParadigmFromTable`) and reports how far they agree.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/probe-paradigm-de.mts [--limit N] [--out docs/ecosystem/linguistics/paradigm-de-2026-10-10.json] [--top 20]
 *
 * `--limit N` reads only the first N lines of the dump (default: all). Reads data/dictionaries/kaikki.org-dictionary-German.jsonl
 * (not committed). Agreement of the two halves is not correctness: Wiktionary German tables are template-generated and
 * sometimes wrong, and the word list is machine-drafted. A `conflicted` cell is a question for a reviewer.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { PartOfSpeech } from '../src/core';
import { featureKey, paradigmSummary } from '../src/core/paradigm';
import { deAdapter } from '../src/adapters/de';
import { deParadigmFromTable, deTableRowDetail } from '../src/adapters/german/paradigm';

const argv = process.argv.slice(2);
const arg = (name: string, dflt: string): string => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const OUT = arg('out', 'docs/ecosystem/linguistics/paradigm-de-2026-10-10.json');
const TOP = Number(arg('top', '20'));
const LIMIT = Number(arg('limit', '0')) || Infinity;
const DUMP = path.resolve('data/dictionaries/kaikki.org-dictionary-German.jsonl');

const POS: Record<string, PartOfSpeech> = { noun: 'NOUN', adj: 'ADJ', verb: 'VERB', article: 'DET', det: 'DET' };

interface Row { form: string; tags: string[] }
interface Entry { lemma: string; pos: PartOfSpeech; rows: Row[]; hint: { features: Record<string, string> } }

const entries = new Map<string, Entry[]>();
let homographEntries = 0;
let linesRead = 0;
let namesWithTable = 0;
const unknownTags = new Map<string, number>();
const skipped: Record<string, Record<string, number>> = {};
const rowStats: Record<string, { rows: number; placed: number }> = {};

async function readDump(): Promise<void> {
  const rl = readline.createInterface({ input: fs.createReadStream(DUMP, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (linesRead >= LIMIT) { rl.close(); break; }
    linesRead++;
    if (!line) continue;
    // cheap pre-filter before the JSON parse: only entries that carry a table
    if (!line.includes('"declension"') && !line.includes('"conjugation"')) continue;
    const e = JSON.parse(line) as { word: string; pos: string; head_templates?: Array<{ name?: string; args?: Record<string, string> }>; forms?: Array<{ form: string; tags?: string[]; source?: string }> };
    const table = (e.forms ?? []).filter((f) => f.source === 'declension' || f.source === 'conjugation');
    if (!table.length) continue;
    if (e.pos === 'name') { namesWithTable++; continue; }
    const pos = POS[e.pos];
    if (!pos) continue;
    const head = (e.head_templates ?? []).find((h) => h.name === 'de-noun' || h.name === 'de-verb' || h.name === 'de-adj');
    const a1 = head?.args?.['1'] ?? '';
    const features: Record<string, string> = {};
    if (pos === 'NOUN') { const g = /^([mfn])\b/.exec(a1)?.[1]; if (g) features.Gender = { m: 'Masc', f: 'Fem', n: 'Neut' }[g]!; }
    if (pos === 'VERB' && head?.name === 'de-verb') features.Separable = /^[^<]*\./.test(a1) ? 'Yes' : 'No';
    const entry: Entry = { lemma: e.word, pos, rows: [], hint: { features } };
    const seen = new Set<string>();
    for (const f of table) {
      const tags = f.tags ?? [];
      const id = `${f.form}|${tags.join(' ')}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entry.rows.push({ form: f.form, tags });
    }
    const key = `${e.word}|${pos}`;
    const list = entries.get(key) ?? [];
    if (list.length) homographEntries++;
    list.push(entry);
    entries.set(key, list);
  }
}

interface Conflict { lemma: string; pos: string; cell: string; dictionary: string; rules: string }
interface PosReport {
  lemmasWithTables: number; lemmasGenerated: number; lemmasNotGenerated: number;
  cells: { verified: number; supported: number; generated: number; conflicted: number };
  cellsOfGenerable: { verified: number; supported: number; generated: number; conflicted: number };
  lemmasFullyVerified: number; lemmasWithConflict: number;
  /** Of the lemmas the adapter generates: the word list ones, and the ones guessed (a verb the list does not hold). */
  listed: { lemmas: number; cells: { verified: number; supported: number; generated: number; conflicted: number } };
  guessed: { lemmas: number; cells: { verified: number; supported: number; generated: number; conflicted: number } };
}
const zero = () => ({ verified: 0, supported: 0, generated: 0, conflicted: 0 });
const reports: Record<string, PosReport> = {};
const conflicts: Conflict[] = [];
const conflictShapes = new Map<string, number>();
const conflictByLemma = new Map<string, number>();

function run(): void {
  for (const list of entries.values()) {
    const posName = list[0].pos;
    const rep = (reports[posName] ??= { lemmasWithTables: 0, lemmasGenerated: 0, lemmasNotGenerated: 0, cells: zero(), cellsOfGenerable: zero(), lemmasFullyVerified: 0, lemmasWithConflict: 0, listed: { lemmas: 0, cells: zero() }, guessed: { lemmas: 0, cells: zero() } });
    const st = (rowStats[posName] ??= { rows: 0, placed: 0 });
    rep.lemmasWithTables++;
    for (const entry of list) for (const r of entry.rows) {
      st.rows++;
      const d = deTableRowDetail(r.tags, entry.pos);
      for (const u of d.unknown) unknownTags.set(`${posName}:${u}`, (unknownTags.get(`${posName}:${u}`) ?? 0) + 1);
      if (d.features) st.placed++;
      else { const m = (skipped[posName] ??= {}); const why = d.skipped ?? 'not-a-form'; m[why] = (m[why] ?? 0) + 1; }
    }
    const generable = list.some((en) => !!deAdapter.paradigm?.(en.lemma, en.pos, en.hint));
    if (generable) rep.lemmasGenerated++; else rep.lemmasNotGenerated++;
    // homograph entries (Band, umfahren): the one that agrees best is the one counted
    const merged = list.map((en) => ({ en, p: deParadigmFromTable(en.lemma, en.pos, en.rows, { hint: en.hint }) })).filter((x) => x.p);
    if (!merged.length) continue;
    merged.sort((a, b) => { const sa = paradigmSummary(a.p!), sb = paradigmSummary(b.p!); return (sb.verified - sb.conflicted) - (sa.verified - sa.conflicted); });
    const entry = merged[0].en;
    const p = merged[0].p!;
    const sum = paradigmSummary(p);
    for (const k of Object.keys(sum) as Array<keyof typeof sum>) { rep.cells[k] += sum[k]; if (generable) rep.cellsOfGenerable[k] += sum[k]; }
    if (generable) {
      const bucket = p.notes.some((n) => n.startsWith('Guessed')) ? rep.guessed : rep.listed;
      bucket.lemmas++;
      for (const k of Object.keys(sum) as Array<keyof typeof sum>) bucket.cells[k] += sum[k];
      if (sum.conflicted > 0) rep.lemmasWithConflict++;
      if (sum.generated === 0 && sum.conflicted === 0 && sum.supported === 0 && sum.verified > 0) rep.lemmasFullyVerified++;
    }
    for (const c of p.cells) {
      if (c.status !== 'conflicted') continue;
      const f = c.features;
      const cell = featureKey(f);
      conflicts.push({ lemma: entry.lemma, pos: posName, cell, dictionary: c.form, rules: (c.alternatives ?? []).join(' / ') });
      const shape = posName === 'VERB'
        ? `${f.VerbForm ?? ''} ${f.Clause ? 'sub-clause ' : ''}${f.Mood ?? ''} ${f.Tense ?? ''} ${f.Person ?? ''}${f.Number ?? ''}${f.Variant ?? ''}`.replace(/\s+/g, ' ').trim()
        : `${f.Degree ?? ''} ${f.Decl ?? ''} ${f.Position ?? ''} ${f.Case ?? ''} ${f.Number ?? ''}${f.Gender ? ' ' + f.Gender : ''}`.replace(/\s+/g, ' ').trim();
      conflictShapes.set(`${posName}: ${shape}`, (conflictShapes.get(`${posName}: ${shape}`) ?? 0) + 1);
      conflictByLemma.set(`${entry.lemma}|${posName}`, (conflictByLemma.get(`${entry.lemma}|${posName}`) ?? 0) + 1);
    }
  }
}

const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');

async function main(): Promise<void> {
  if (!fs.existsSync(DUMP)) { console.error(`missing ${DUMP}`); process.exit(2); }
  await readDump();
  run();

  console.log(`German paradigm probe: ${linesRead} dump lines read${Number.isFinite(LIMIT) ? ` (--limit ${LIMIT})` : ''}; ${entries.size} lemmas (noun/adj/verb/determiner) with an inflection table; homograph entries: ${homographEntries} (the best-agreeing one is counted); name tables not merged: ${namesWithTable}\n`);
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
  for (const [pos, r] of Object.entries(reports)) {
    if (!r.guessed.lemmas) continue;
    const rate = (c: { verified: number; conflicted: number }): string => pct(c.conflicted, c.verified + c.conflicted);
    console.log(`${pos}: word-list lemmas ${r.listed.lemmas}, cells verified ${r.listed.cells.verified}, conflicted ${r.listed.cells.conflicted} (${rate(r.listed.cells)}); guessed lemmas ${r.guessed.lemmas}, cells verified ${r.guessed.cells.verified}, conflicted ${r.guessed.cells.conflicted} (${rate(r.guessed.cells)})`);
  }
  console.log('* conflicted / (verified + conflicted) over the cells of lemmas the adapter generates: where both halves have a form, how often they differ.\n');

  console.log('Rows the mapper did not place (by reason):');
  for (const [pos, m] of Object.entries(skipped)) console.log(`  ${pos}: ${JSON.stringify(m)}`);

  const lemmaTop = [...conflictByLemma.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
  console.log(`\nTop ${TOP} conflicting lemmas (number of conflicted cells; the first conflicted cell shown, dictionary form vs the rules form):`);
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
    source: { dump: 'kaikki.org-dictionary-German.jsonl', linesRead, limit: Number.isFinite(LIMIT) ? LIMIT : null, licence: 'CC BY-SA 4.0 (Wiktionary)' },
    lemmasWithTables: entries.size,
    homographEntries,
    nameTablesNotMerged: namesWithTable,
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
