/**
 * Probe: Spanish contextual syntax (Linguistic Engine V2, Stage 4). Runs spanishSyntax over the bundled Spanish corpus and the
 * hand-labelled gold file (data/gold/es/syntax-dev.json) and prints: attached share, relation distribution, share of relations
 * that keep alternatives, speed, and UAS / LAS against the gold (and against a Spanish UD treebank if one is on disk; none is downloaded).
 *   npx vite-node scripts/probe-syntax-es.mts [--limit N] [--show]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import { loadBundledCorpus } from '../src/ingest';
import type { SyntaxAnalysis } from '../src/core/syntax';

const argv = process.argv.slice(2);
const limIdx = argv.indexOf('--limit');
const limit = limIdx >= 0 ? Number(argv[limIdx + 1]) : Infinity;
const show = argv.includes('--show');

const es = createAdapterRegistry().get('es');
if (!es.syntax) throw new Error('the Spanish adapter has no syntax()');
const syntax = es.syntax.bind(es);

/* ---------------------------------------------------------------- corpus */
const sentences: string[] = [];
for (const d of loadBundledCorpus().filter((x) => x.lang === 'es')) for (const s of d.sections) for (const p of s.paragraphs) {
  if ('sentences' in p) for (const x of p.sentences) sentences.push(x.text);
  else for (const sp of es.segmentSentences(p.text)) sentences.push(sp.text);
}
const sample = sentences.slice(0, Number.isFinite(limit) ? limit : sentences.length);

const rel = new Map<string, number>();
let words = 0, attached = 0, relations = 0, withAlt = 0, sentWithAlt = 0, sentFull = 0, rootless = 0, conf = 0, noteSents = 0;
const times: number[] = [];
const perSent: { ms: number; n: number }[] = [];
const prepared = sample.map((text) => { const toks = es.tokenize(text); return { text, toks, an: es.analyze(toks) }; });
const run = (): SyntaxAnalysis[] => prepared.map((p) => syntax(p.toks, p.an)!);
run(); // warm-up
const t00 = performance.now();
const results = prepared.map((p) => { const t0 = performance.now(); const r = syntax(p.toks, p.an)!; const ms = performance.now() - t0; times.push(ms); perSent.push({ ms, n: p.toks.filter((t) => t.isWord).length }); return r; });
const totalMs = performance.now() - t00;
results.forEach((r, i) => {
  const toks = prepared[i]!.toks;
  const wi = toks.map((t, k) => (t.isWord ? k : -1)).filter((k) => k >= 0);
  words += wi.length;
  let got = 0, any = false, hasRoot = false;
  for (const k of wi) {
    const x = r.relations.find((z) => z.dependent === k);
    if (x) { got++; if (x.relation === 'root') hasRoot = true; }
  }
  attached += got;
  if (got === wi.length) sentFull++;
  if (!hasRoot && wi.length) rootless++;
  if (r.notes.some((n) => !/Spanish leaves the subject|is an order/.test(n))) noteSents++;
  for (const x of r.relations) {
    if (x.relation === 'punct') continue;
    relations++; conf += x.confidence;
    rel.set(x.relation, (rel.get(x.relation) ?? 0) + 1);
    if (x.alternatives?.length) { withAlt++; any = true; }
    if (!x.basis.length || x.basis.some((b) => !b.trim())) throw new Error('empty basis: ' + prepared[i]!.text);
  }
  if (any) sentWithAlt++;
});
const sorted = [...times].sort((a, b) => a - b);
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + ' %' : 'n/a');
const per20 = perSent.reduce((s, x) => s + x.ms, 0) / perSent.reduce((s, x) => s + x.n, 0) * 20;

console.log(`corpus: ${sample.length} sentences, ${words} word tokens`);
console.log(`attached (word tokens with a relation): ${attached} / ${words} = ${pct(attached, words)}; sentences fully attached ${pct(sentFull, sample.length)}; sentences without a root ${rootless}`);
console.log(`relations: ${relations} (mean confidence ${(conf / Math.max(1, relations)).toFixed(2)}); with alternatives ${withAlt} = ${pct(withAlt, relations)}; sentences with at least one ${pct(sentWithAlt, sample.length)}; sentences with an honest note ${pct(noteSents, sample.length)}`);
console.log(`speed: mean ${(totalMs / sample.length).toFixed(3)} ms per sentence, median ${sorted[Math.floor(sorted.length / 2)]!.toFixed(3)}, p95 ${sorted[Math.floor(sorted.length * 0.95)]!.toFixed(3)}, max ${sorted[sorted.length - 1]!.toFixed(2)}; ${per20.toFixed(3)} ms per 20 words`);
console.log('relation distribution:');
for (const [k, v] of [...rel.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(9)} ${String(v).padStart(5)}  ${pct(v, relations).padStart(7)}`);

/* ---------------------------------------------------------------- gold */
interface GoldSentence { text: string; tokens: string[]; heads: number[]; relations: string[] }
function score(sents: GoldSentence[], label: string): void {
  let n = 0, uas = 0, las = 0, unatt = 0;
  const byRel = new Map<string, { gold: number; ok: number; sys: number }>();
  const bad: string[] = [];
  for (const g of sents) {
    const toks = es.tokenize(g.text);
    const an = es.analyze(toks);
    const r = syntax(toks, an)!;
    const wi = toks.map((t, k) => (t.isWord ? k : -1)).filter((k) => k >= 0);
    if (wi.length !== g.tokens.length) { console.log('  token count differs, skipped:', g.text); continue; }
    const pos = new Map<number, number>(); wi.forEach((t, j) => pos.set(t, j));
    wi.forEach((t, j) => {
      n++;
      const x = r.relations.find((z) => z.dependent === t);
      const sysHead = !x ? -2 : x.head === undefined ? -1 : (pos.get(x.head) ?? -3);
      const sysRel = x?.relation ?? '?';
      const goldRel = g.relations[j]!;
      const e = byRel.get(goldRel) ?? { gold: 0, ok: 0, sys: 0 };
      e.gold++;
      const okH = sysHead === g.heads[j];
      const okR = sysRel === goldRel;
      if (!x) unatt++;
      if (okH) uas++;
      if (okH && okR) { las++; e.ok++; }
      byRel.set(goldRel, e);
      if (x) { const s2 = byRel.get(sysRel) ?? { gold: 0, ok: 0, sys: 0 }; s2.sys++; byRel.set(sysRel, s2); }
      if (!(okH && okR)) bad.push(`  ${g.text}\n     ${g.tokens[j]}[${j + 1}]: gold ${g.heads[j]! + 1}:${goldRel}  system ${sysHead + 1}:${sysRel}${x?.alternatives?.length ? ' (kept alternatives)' : ''}`);
    });
  }
  console.log(`\n${label}: ${sents.length} sentences, ${n} word tokens; UAS ${pct(uas, n)}, LAS ${pct(las, n)}, no relation ${pct(unatt, n)}`);
  console.log('  relation       gold   correct  recall  system-given');
  for (const [k, v] of [...byRel.entries()].sort((a, b) => b[1].gold - a[1].gold)) if (v.gold || v.sys) console.log(`  ${k.padEnd(10)} ${String(v.gold).padStart(6)} ${String(v.ok).padStart(8)} ${pct(v.ok, v.gold).padStart(7)} ${String(v.sys).padStart(10)}`);
  if (show) console.log(bad.join('\n'));
}
for (const [path, label] of [
  ['data/gold/es/syntax-dev.json', 'gold dev (data/gold/es/syntax-dev.json, corpus sentences, AI-labelled, unreviewed; the rules were developed against it)'],
  ['data/gold/es/syntax-heldout.json', 'gold held-out (data/gold/es/syntax-heldout.json, sentences written after the rules were frozen, AI-labelled, unreviewed)'],
] as const) {
  if (existsSync(path)) score((JSON.parse(readFileSync(path, 'utf8')) as { sentences: GoldSentence[] }).sentences, label);
  else console.log('no gold file at ' + path);
}

/* ---------------------------------------------------------------- Spanish UD treebank, if one is already on disk */
function findConllu(dir: string, depth = 0): string[] {
  if (depth > 4 || !existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findConllu(p, depth + 1));
    else if (/^es[_-].*\.conllu$/i.test(e.name) || (/\.conllu$/i.test(e.name) && /spanish/i.test(dir))) out.push(p);
  }
  return out;
}
const ud = [...findConllu('data/research'), ...findConllu('data/sources')];
if (!ud.length) console.log('\nSpanish UD treebank: none on disk under data/research or data/sources (nothing downloaded).');
else {
  for (const f of ud) {
    const sents: GoldSentence[] = [];
    let cur: { id: number; form: string; head: number; rel: string; punct: boolean }[] = [], text = '';
    const flush = (): void => {
      if (cur.length && text) {
        const kept = cur.filter((c) => !c.punct);
        const idx = new Map<number, number>(); kept.forEach((c, j) => idx.set(c.id, j));
        sents.push({ text, tokens: kept.map((c) => c.form), heads: kept.map((c) => (c.head === 0 ? -1 : (idx.get(c.head) ?? -3))), relations: kept.map((c) => c.rel.split(':')[0]!) });
      }
      cur = []; text = '';
    };
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (line.startsWith('# text = ')) text = line.slice(9);
      else if (!line.trim()) flush();
      else if (!line.startsWith('#')) { const c = line.split('\t'); if (/^\d+$/.test(c[0]!)) cur.push({ id: Number(c[0]), form: c[1]!, head: Number(c[6]), rel: c[7]!, punct: c[3] === 'PUNCT' }); }
    }
    flush();
    score(sents.slice(0, Number.isFinite(limit) ? limit : 500).filter((s) => s.tokens.length <= 30), 'UD ' + f);
  }
}
