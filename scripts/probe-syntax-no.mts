/**
 * Probe of the Norwegian contextual-syntax rules (src/adapters/norwegian/syntax.ts), Bokmål and Nynorsk.
 *
 * Over each course corpus (data/corpus/<nb|nn>/*.json) and each hand-labelled gold file (data/gold/<nb|nn>/syntax-dev.json) it prints
 * the share of word tokens that got a relation, the relation distribution, the share of relations that keep alternatives, and for the
 * gold files UAS / LAS, plus the milliseconds per sentence of `syntax` alone and of `analyze` + `syntax`. If a Norwegian UD treebank
 * (CoNLL-U, no_bokmaal / no_nynorsk) is on disk under data/research or data/sources it is scored too; nothing is downloaded.
 *
 *   npx tsx scripts/probe-syntax-no.mts [--limit N] [--fails]
 */
import fs from 'node:fs';
import path from 'node:path';
import { nbAdapter } from '../src/adapters/nb';
import { nnAdapter } from '../src/adapters/nn';
import type { LanguageAdapter } from '../src/core';

const args = process.argv.slice(2);
const limIdx = args.indexOf('--limit');
const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : Infinity;
const showFails = args.includes('--fails');
const ADAPTERS: Record<'nb' | 'nn', LanguageAdapter> = { nb: nbAdapter, nn: nnAdapter };

interface GoldSentence { text: string; tokens: string[]; heads: number[]; relations: string[] }
interface Row { set: string; sentences: number; words: number; attached: number; ms: number; msFull: number; rels: Map<string, number>; withAlt: number; relCount: number; conflicted: number; uas?: number; las?: number; scored?: number; uasAtt?: number; fails: string[] }

function corpusSentences(std: 'nb' | 'nn'): string[] {
  const dir = path.join('data', 'corpus', std);
  const out: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const s of j.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? []) out.push(x.text);
  }
  return out;
}

function run(std: 'nb' | 'nn', set: string, texts: string[], gold?: GoldSentence[]): Row {
  const ad = ADAPTERS[std];
  const row: Row = { set, sentences: 0, words: 0, attached: 0, ms: 0, msFull: 0, rels: new Map(), withAlt: 0, relCount: 0, conflicted: 0, fails: [] };
  let goldWords = 0; let uasOk = 0; let lasOk = 0; let attachedGold = 0;
  const n = Math.min(texts.length, limit);
  // warm-up so the first sentence does not carry the JIT
  { const tk = ad.tokenize(texts[0] ?? ''); ad.syntax?.(tk, ad.analyze(tk)); }
  for (let k = 0; k < n; k++) {
    const t0 = performance.now();
    const tk = ad.tokenize(texts[k]);
    const an = ad.analyze(tk);
    const t1 = performance.now();
    const sx = ad.syntax!(tk, an)!;
    const t2 = performance.now();
    row.sentences++;
    row.ms += t2 - t1;
    row.msFull += t2 - t0;
    const wordIdx = tk.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
    row.words += wordIdx.length;
    row.attached += Math.round(sx.attached * wordIdx.length);
    for (const r of sx.relations) {
      if (!tk[r.dependent].isWord) continue;
      row.rels.set(r.relation, (row.rels.get(r.relation) ?? 0) + 1);
      row.relCount++;
      if (r.alternatives?.length) row.withAlt++;
      if (r.status === 'conflicted') row.conflicted++;
      if (!r.basis.length || r.basis.some((b) => !b)) row.fails.push(`EMPTY BASIS ${texts[k]}`);
    }
    if (gold) {
      const g = gold[k];
      const wordNo = new Map<number, number>(); wordIdx.forEach((ti, wi) => wordNo.set(ti, wi + 1));
      const byDep = new Map(sx.relations.map((r) => [r.dependent, r]));
      g.tokens.forEach((form, wi) => {
        goldWords++;
        const r = byDep.get(wordIdx[wi]);
        const head = r ? (r.head === undefined ? 0 : wordNo.get(r.head) ?? -1) : -2;
        if (r) attachedGold++;
        const hOk = head === g.heads[wi];
        const lOk = hOk && r?.relation === g.relations[wi];
        if (hOk) uasOk++;
        if (lOk) lasOk++;
        if (!lOk) row.fails.push(`${k} "${form}" gold ${g.heads[wi]}:${g.relations[wi]} got ${r ? `${head}:${r.relation}` : 'none'}   [${g.text}]`);
      });
    }
  }
  if (gold) { row.scored = goldWords; row.uas = uasOk / goldWords; row.las = lasOk / goldWords; row.uasAtt = attachedGold ? uasOk / attachedGold : 0; }
  return row;
}

/** A minimal CoNLL-U reader: sentences of (form, head, deprel, upos); multiword ranges and empty nodes skipped. */
function readConllu(file: string): Array<{ text: string; toks: Array<{ form: string; head: number; rel: string; upos: string }> }> {
  const out: Array<{ text: string; toks: Array<{ form: string; head: number; rel: string; upos: string }> }> = [];
  let text = ''; let toks: Array<{ form: string; head: number; rel: string; upos: string }> = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('# text = ')) text = line.slice(9);
    else if (line.startsWith('#')) continue;
    else if (!line.trim()) { if (toks.length) out.push({ text, toks }); text = ''; toks = []; }
    else { const c = line.split('\t'); if (/^\d+$/.test(c[0])) toks.push({ form: c[1], head: Number(c[6]), rel: c[7].split(':')[0], upos: c[3] }); }
  }
  if (toks.length) out.push({ text, toks });
  return out;
}

function findTreebanks(): string[] {
  const hits: string[] = [];
  const walk = (d: string, depth: number): void => {
    if (depth > 6 || !fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/^no_(bokmaal|nynorsk)[^/]*\.conllu$/i.test(e.name)) hits.push(p);
    }
  };
  walk(path.join('data', 'research'), 0);
  walk(path.join('data', 'sources'), 0);
  return hits;
}

const rows: Row[] = [];
for (const std of ['nb', 'nn'] as const) {
  rows.push(run(std, `${std} corpus (data/corpus/${std})`, corpusSentences(std)));
  for (const file of ['syntax-dev.json', 'syntax-heldout.json']) {
    const gp = path.join('data', 'gold', std, file);
    if (fs.existsSync(gp)) {
      const gold = JSON.parse(fs.readFileSync(gp, 'utf8')).sentences as GoldSentence[];
      rows.push(run(std, `${std} gold (${file})`, gold.map((g) => g.text), gold));
    } else console.log(`(no gold file ${gp})`);
  }
}

const treebanks = findTreebanks();
for (const tb of treebanks) {
  const std = /nynorsk/i.test(tb) ? 'nn' : 'nb';
  const ad = ADAPTERS[std];
  const sents = readConllu(tb).slice(0, Number.isFinite(limit) ? limit : 500);
  let words = 0; let uas = 0; let las = 0; let skipped = 0; let used = 0;
  for (const s of sents) {
    const tk = ad.tokenize(s.text);
    const an = ad.analyze(tk);
    const sx = ad.syntax!(tk, an)!;
    const wi = tk.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
    const gw = s.toks.map((t, i) => ({ ...t, no: i + 1 })).filter((t) => t.upos !== 'PUNCT');
    if (wi.length !== gw.length || wi.some((ti, k) => tk[ti].surface !== gw[k].form)) { skipped++; continue; }
    used++;
    const noOfTok = new Map<number, number>(); wi.forEach((ti, k) => noOfTok.set(ti, gw[k].no));
    const byDep = new Map(sx.relations.map((r) => [r.dependent, r]));
    gw.forEach((g, k) => {
      words++;
      const r = byDep.get(wi[k]);
      const head = r ? (r.head === undefined ? 0 : noOfTok.get(r.head) ?? -1) : -2;
      if (head === g.head) { uas++; if (r?.relation === g.rel) las++; }
    });
  }
  console.log(`\nUD treebank ${tb}: ${used} sentences scored (${skipped} skipped: tokenisation differs), ${words} words, UAS ${(100 * uas / Math.max(words, 1)).toFixed(1)} %, LAS ${(100 * las / Math.max(words, 1)).toFixed(1)} %`);
}
if (!treebanks.length) console.log('\nUD: no Norwegian CoNLL-U treebank (no_bokmaal / no_nynorsk) under data/research or data/sources; nothing was downloaded.');

const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '-');
console.log('\n| set | sentences | words | attached | with alternatives | conflicted | UAS | LAS | UAS (attached only) | ms/sentence (syntax) | ms/sentence (analyze+syntax) |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
  console.log(`| ${r.set} | ${r.sentences} | ${r.words} | ${pct(r.attached, r.words)} % | ${pct(r.withAlt, r.relCount)} % | ${pct(r.conflicted, r.relCount)} % | ${r.uas === undefined ? '-' : (100 * r.uas).toFixed(1) + ' %'} | ${r.las === undefined ? '-' : (100 * r.las).toFixed(1) + ' %'} | ${r.uasAtt === undefined ? '-' : (100 * r.uasAtt).toFixed(1) + ' %'} | ${(r.ms / Math.max(r.sentences, 1)).toFixed(3)} | ${(r.msFull / Math.max(r.sentences, 1)).toFixed(3)} |`);
}
console.log('\nRelation distribution (share of relations on word tokens)');
for (const r of rows) {
  const parts = [...r.rels.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, r.relCount)}`);
  console.log(`- ${r.set}: ${parts.join(', ')}`);
}
if (showFails) for (const r of rows) if (r.fails.length) { console.log(`\nMiss list ${r.set}`); for (const f of r.fails) console.log('  ' + f); }
