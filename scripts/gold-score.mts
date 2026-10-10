/**
 * Gold scorer (GoLearn Linguistic Engine V2, Stage 8; 2026-10-10): scores the REAL parser (parseSelection with the real analysers)
 * and the REAL dictionary lookup (createPackRuntime over public/dict) against data/gold/<lang>/{selections-dev,hard,unseen}.json.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/gold-score.mts [--langs sq,es,de,hi,th,nb,nn] [--set dev|hard|unseen|all]
 *       [--limit N] [--out <json path>] [--md <markdown path>] [--report]
 *
 * `--report` writes docs/ecosystem/linguistics/GOLD-REPORT-2026-10-10.{md,json}. The Markdown table always goes to stdout.
 * The gold labels are AI-judged and unreviewed (no native speaker): every number here is agreement with an AI annotator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GOLD_LANGS, METRICS, ROOT, loadGold, paradigmRoundTrip, scoreSet, syntaxGoldScore } from './gold-lib.mts';
import type { GoldFile, GoldSet, RoundTrip, SetResult } from './gold-lib.mts';

const argv = process.argv.slice(2);
const arg = (name: string, dflt: string): string => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const has = (name: string): boolean => argv.includes(`--${name}`);
const LANGS = arg('langs', GOLD_LANGS.join(',')).split(',');
const SETSARG = arg('set', 'all');
const SETS: GoldSet[] = SETSARG === 'all' ? ['dev', 'hard', 'unseen'] : [SETSARG as GoldSet];
const LIMIT = Number(arg('limit', '0')) || undefined;

const pct = (x: number | null | undefined, d = 1): string => (x === null || x === undefined ? 'n/a' : `${(100 * x).toFixed(d)}%`);
const ms = (x: number): string => x.toFixed(2);

export function metricRow(name: (typeof METRICS)[number], r: SetResult, rt: RoundTrip | undefined): string {
  switch (name) {
    case 'lemma accuracy': return pct(r.scored ? r.lemma / r.scored : null);
    case 'POS accuracy': return pct(r.scored ? r.pos / r.scored : null);
    case 'feature precision': return pct(r.precision);
    case 'feature recall': return pct(r.recall);
    case 'feature F1': return pct(r.f1);
    case 'role / relation accuracy': {
      const parts: string[] = [];
      parts.push(r.relation.accuracy === null ? 'syntax n/a' : `syntax ${pct(r.relation.accuracy)} (n=${r.relation.n})`);
      parts.push(r.role.mappedN ? `role ${pct(r.role.accuracy)} (n=${r.role.mappedN}, given on ${pct(r.role.coverage, 0)})` : `role given on ${pct(r.role.coverage, 0)}, none mappable`);
      if (r.syntaxGold.n) parts.push(`UAS ${pct(r.syntaxGold.uas)} LAS ${pct(r.syntaxGold.las)} (n=${r.syntaxGold.n})`);
      return parts.join('; ');
    }
    case 'paradigm round-trip share': return rt ? (rt.share === null ? 'n/a' : `${pct(rt.share)} (${rt.withParadigm}/${rt.lemmas} lemmas, ${rt.cells} cells)`) : 'n/a';
    case 'dictionary hit rate': return pct(r.dictionary.hit);
    case 'definition availability': return pct(r.dictionary.definition);
    case 'etymology availability': return pct(r.dictionary.etymology);
    case 'IPA availability': return pct(r.dictionary.ipa);
    case 'alternatives-kept rate': return r.alternativesKept.n ? `${pct(r.alternativesKept.kept)} (n=${r.alternativesKept.n}; top reading right ${pct(r.alternativesKept.topOk)})` : 'n/a (no ambiguous items)';
    case 'conflict rate': return pct(r.conflictRate);
    case 'latency (ms)': return `${ms(r.latency.totalMs)} (parse ${ms(r.latency.parseMs)} + dict ${ms(r.latency.dictMs)})`;
  }
}

export function markdown(results: Record<string, Partial<Record<GoldSet, SetResult>>>, rts: Record<string, RoundTrip | undefined>, langs: string[], sets: GoldSet[]): string {
  const out: string[] = [];
  for (const set of sets) {
    const ls = langs.filter((l) => results[l]?.[set]);
    if (!ls.length) continue;
    out.push(`### ${set}\n`);
    out.push(`| metric | ${ls.join(' | ')} |`);
    out.push(`|---|${ls.map(() => '---').join('|')}|`);
    out.push(`| items scored (of file) | ${ls.map((l) => { const r = results[l]![set]!; return `${r.scored} (${r.n})`; }).join(' | ')} |`);
    for (const m of METRICS) out.push(`| ${m} | ${ls.map((l) => metricRow(m, results[l]![set]!, rts[l])).join(' | ')} |`);
    out.push(`| lemma+POS both right | ${ls.map((l) => { const r = results[l]![set]!; return pct(r.scored ? r.both / r.scored : null); }).join(' | ')} |`);
    out.push(`| gold word = one engine token | ${ls.map((l) => pct(results[l]![set]!.tokenAligned)).join(' | ')} |`);
    if (set === 'hard') {
      out.push(`| engine gave the naive wrong analysis | ${ls.map((l) => pct(results[l]![set]!.naiveWrongRate)).join(' | ')} |`);
      out.push(`| Thai segmentation exact | ${ls.map((l) => { const s = results[l]![set]!.segmentation; return s.n ? `${pct(s.exact)} (n=${s.n})` : 'n/a'; }).join(' | ')} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

async function main(): Promise<void> {
  const results: Record<string, Partial<Record<GoldSet, SetResult>>> = {};
  const rts: Record<string, RoundTrip | undefined> = {};
  for (const lang of LANGS) {
    results[lang] = {};
    const files: GoldFile[] = [];
    for (const set of SETS) {
      const f = loadGold(lang, set);
      if (!f) { console.error(`${lang} ${set}: no gold file`); continue; }
      files.push(f);
      const r = await scoreSet(lang, set, f, { limit: LIMIT });
      if (set === 'dev') r.syntaxGold = syntaxGoldScore(lang);
      results[lang][set] = r;
      console.error(`${lang} ${set}: ${r.scored}/${r.n} scored, lemma ${pct(r.lemma / Math.max(1, r.scored))}, pos ${pct(r.pos / Math.max(1, r.scored))}`);
    }
    if (files.length) rts[lang] = paradigmRoundTrip(lang, files);
  }
  const md = markdown(results, rts, LANGS, SETS);
  console.log(md);
  const json = { at: new Date().toISOString(), labelled_by: 'Claude (AI-judged, unreviewed; no native speaker)', limit: LIMIT ?? null, results, paradigmRoundTrip: rts };
  const outJson = has('report') ? path.join(ROOT, 'docs/ecosystem/linguistics/GOLD-REPORT-2026-10-10.json') : arg('out', '');
  if (outJson) { fs.mkdirSync(path.dirname(outJson), { recursive: true }); fs.writeFileSync(outJson, JSON.stringify(json, null, 1)); console.error(`written ${outJson}`); }
  const outMd = has('report') ? path.join(ROOT, 'docs/ecosystem/linguistics/GOLD-REPORT-2026-10-10.md') : arg('md', '');
  if (outMd) {
    const errBlocks = LANGS.flatMap((l) => SETS.map((s) => {
      const r = results[l]?.[s];
      if (!r || !r.errorClasses.length) return '';
      return `- **${l} ${s}**: ${r.errorClasses.slice(0, 5).map((c) => `${c.cls} ×${c.count} (e.g. ${c.examples[0]})`).join('; ')}`;
    })).filter(Boolean);
    const body = [
      '# Gold report (Linguistic Engine V2, Stage 8) — 2026-10-10',
      '',
      'Scorer: `scripts/gold-score.mts`. Gold files: `data/gold/<lang>/{selections-dev,hard,unseen}.json`. See `GOLD-SETS.md` for the definitions.',
      '**Every gold label was written by an AI model (Claude) and has not been checked by a native speaker: these figures are agreement with an AI annotator, not correctness.**',
      '',
      md,
      '### Biggest error classes (lemma / POS)',
      '',
      ...errBlocks,
      '',
    ].join('\n');
    fs.writeFileSync(outMd, body);
    console.error(`written ${outMd}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
