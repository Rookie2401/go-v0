/// <reference types="node" />
/**
 * vite-node scripts/probe-syntax-sq.mts [--limit N] [--no-ud] [--errors N]
 *
 * What the Albanian syntax rules (src/adapters/albanian/syntax.ts) make of the course texts and of the gold set:
 *   - the course texts (data/corpus/sq): share of word tokens that get a relation, the relations by name, the share of relations
 *     that keep an alternative or are 'conflicted', words left unattached, time per sentence;
 *   - the gold set (data/gold/sq/syntax-dev.json, hand-labelled by Claude, unreviewed): UAS / LAS on word tokens;
 *   - the Universal Dependencies Albanian treebanks on disk (data/research/ud/UD_Albanian-STAF, UD_Albanian-TSA; read only, never
 *     bundled): UAS / LAS on the sentences whose word tokens line up one for one with ours (a sentence with a fused clitic written
 *     as two words, or tokenized differently, is skipped and counted). Subtypes are dropped (nmod:poss -> nmod), `parataxis` is read
 *     as `dep`, `nsubj:pass` as `nsubj`.
 * `--limit N` caps the course sentences, the gold sentences and the treebank sentences at N each. `--errors N` prints N wrong
 * relations of the gold set and of the treebank. A measurement, not a verdict: the gold set was written for these rules' own texts
 * and the rules were developed while reading them; the treebanks are the independent number.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import { loadBundledCorpus } from '../src/ingest';
import type { SyntaxAnalysis } from '../src/core';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const limit = Number(arg('--limit') ?? Infinity);
const showErrors = Number(arg('--errors') ?? 0);
const useUd = !args.includes('--no-ud');
const sq = createAdapterRegistry().get('sq');
if (!sq.syntax) throw new Error('the sq adapter has no syntax()');

const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(1)} %` : 'n/a');
const run = (text: string): { tokens: ReturnType<typeof sq.tokenize>; syn: SyntaxAnalysis } => {
  const tokens = sq.tokenize(text);
  const syn = sq.syntax!(tokens, sq.analyze(tokens))!;
  return { tokens, syn };
};

// ── 1. the course texts ──
const sentences: string[] = [];
for (const d of loadBundledCorpus().filter((x) => x.lang === 'sq')) for (const s of d.sections) for (const p of s.paragraphs) {
  if ('sentences' in p) for (const x of p.sentences) sentences.push(x.text);
  else for (const sp of sq.segmentSentences(p.text)) sentences.push(sp.text);
}
const course = sentences.slice(0, Math.min(sentences.length, limit));
let words = 0, attachedWords = 0, relations = 0, withAlt = 0, conflicted = 0, notes = 0, sentWithNote = 0;
const byRel = new Map<string, number>();
const prepared = course.map((t) => { const tokens = sq.tokenize(t); return { tokens, an: sq.analyze(tokens) }; });
const runOnce = (): number => { const t0 = performance.now(); for (const p of prepared) sq.syntax!(p.tokens, p.an); return performance.now() - t0; };
runOnce();
const warm = Math.min(runOnce(), runOnce(), runOnce());
for (const p of prepared) {
  const syn = sq.syntax!(p.tokens, p.an)!;
  const w = p.tokens.filter((t) => t.isWord).length;
  words += w;
  attachedWords += Math.round(syn.attached * w);
  for (const r of syn.relations) {
    if (!p.tokens[r.dependent].isWord) continue;
    relations++;
    byRel.set(r.relation, (byRel.get(r.relation) ?? 0) + 1);
    if (r.alternatives?.length) withAlt++;
    if (r.status === 'conflicted') conflicted++;
    if (!r.basis.length) throw new Error(`empty basis on ${r.relation} of token ${r.dependent}`);
  }
  notes += syn.notes.length;
  if (syn.notes.length) sentWithNote++;
}
console.log('\n=== Albanian syntax probe ===');
console.log(`course texts            ${course.length} sentences, ${words} word tokens`);
console.log(`attached (word tokens)  ${pct(attachedWords, words)}`);
console.log(`with an alternative     ${pct(withAlt, relations)} of ${relations} relations   (conflicted: ${pct(conflicted, relations)})`);
console.log(`sentences with a note   ${sentWithNote} (${notes} notes: words left without a relation)`);
console.log(`syntax() time           ${(warm / course.length).toFixed(3)} ms per sentence, ${(warm / words * 20).toFixed(3)} ms per 20 words (warm, analysis excluded)`);
console.log('relations               ' + [...byRel].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${pct(v, relations)})`).join(', '));

// ── scoring ──
interface Gold { id: string; text: string; tokens: string[]; heads: number[]; relations: string[] }
interface Score { sents: number; unattached: number; words: number; uas: number; las: number; rootOk: number; relCorrectLabelled: Map<string, [number, number]>; errors: string[] }
const newScore = (): Score => ({ sents: 0, unattached: 0, words: 0, uas: 0, las: 0, rootOk: 0, relCorrectLabelled: new Map(), errors: [] });
const wordIndexes = (tokens: ReturnType<typeof sq.tokenize>): number[] => tokens.flatMap((t, i) => (t.isWord ? [i] : []));
function scoreOne(sc: Score, label: string, tokens: ReturnType<typeof sq.tokenize>, syn: SyntaxAnalysis, goldHeads: number[], goldRels: string[]): void {
  const wi = wordIndexes(tokens);
  const pos = new Map(wi.map((t, k) => [t, k]));
  sc.sents++;
  wi.forEach((tokIdx, k) => {
    sc.words++;
    const r = syn.relations.find((x) => x.dependent === tokIdx);
    if (!r) sc.unattached++;
    const predHead = r ? (r.head === undefined ? -1 : pos.get(r.head) ?? -2) : -3;
    const headOk = predHead === goldHeads[k];
    const labelOk = headOk && r?.relation === goldRels[k];
    if (headOk) sc.uas++;
    if (labelOk) sc.las++;
    if (goldHeads[k] === -1 && predHead === -1) sc.rootOk++;
    const e = sc.relCorrectLabelled.get(goldRels[k]) ?? [0, 0];
    e[1]++; if (labelOk) e[0]++;
    sc.relCorrectLabelled.set(goldRels[k], e);
    if (!labelOk && sc.errors.length < 400) sc.errors.push(`${label}  ${tokens[tokIdx].surface}: gold ${goldRels[k]}>${goldHeads[k] < 0 ? 'ROOT' : tokens[wi[goldHeads[k]]]?.surface}  rules ${r ? r.relation + '>' + (r.head === undefined ? 'ROOT' : tokens[r.head].surface) : 'none'}${r?.alternatives?.length ? ' [alt ' + r.alternatives.map((a) => a.relation).join(',') + ']' : ''}`);
  });
}
function report(name: string, sc: Score): void {
  console.log(`${name.padEnd(24)}${sc.sents} sentences, ${sc.words} words: UAS ${pct(sc.uas, sc.words)}, LAS ${pct(sc.las, sc.words)}, root ${pct(sc.rootOk, sc.sents)}, no relation for ${pct(sc.unattached, sc.words)}`);
}

// ── 2. the gold set ──
const goldFile = path.resolve('data/gold/sq/syntax-dev.json');
const goldSc = newScore();
if (fs.existsSync(goldFile)) {
  const gold = JSON.parse(fs.readFileSync(goldFile, 'utf8')) as { sentences: Gold[] };
  for (const g of gold.sentences.slice(0, Math.min(limit, gold.sentences.length))) {
    const { tokens, syn } = run(g.text);
    const wi = wordIndexes(tokens);
    if (wi.length !== g.tokens.length) { console.log(`  gold ${g.id}: ${wi.length} word tokens, expected ${g.tokens.length}: skipped`); continue; }
    scoreOne(goldSc, g.id, tokens, syn, g.heads, g.relations);
  }
  report('gold set (dev, own texts)', goldSc);
} else console.log('gold set not found');

// ── 3. Universal Dependencies treebanks on disk ──
const udSc = newScore();
const perRelUd = udSc.relCorrectLabelled;
if (useUd) {
  const dirs = [['data/research/ud/UD_Albanian-STAF', /^sq_staf-ud-(dev|test|train)\.conllu$/], ['data/research/ud/UD_Albanian-TSA', /^sq_tsa-ud-test\.conllu$/]] as const;
  let total = 0, skipped = 0;
  const perTb: Array<[string, Score]> = [];
  for (const [dir, re] of dirs) {
    const tb = newScore();
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => re.test(x)).sort()) {
      const blocks = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '').split(/\n\n+/).filter((b) => b.trim());
      for (const b of blocks) {
        if (total >= limit) break;
        total++;
        const lines = b.split('\n');
        const text = (lines.find((l) => l.startsWith('# text = ')) ?? '').slice(9);
        const rows = lines.filter((l) => /^\d+(-\d+)?\t/.test(l)).map((l) => l.split('\t'));
        if (rows.some((r) => r[0].includes('-'))) { skipped++; continue; }
        const words = rows.filter((r) => r[3] !== 'PUNCT');
        const { tokens, syn } = run(text);
        const wi = wordIndexes(tokens);
        const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase('sq');
        if (wi.length !== words.length || !wi.every((t, k) => norm(tokens[t].surface) === norm(words[k][1]))) { skipped++; continue; }
        const idToK = new Map(words.map((r, k) => [r[0], k]));
        const heads = words.map((r) => (r[6] === '0' ? -1 : idToK.get(r[6]) ?? -9));
        if (heads.some((h) => h === -9)) { skipped++; continue; }
        const rels = words.map((r) => { const base = r[7].split(':')[0]; return base === 'parataxis' ? 'dep' : base; });
        scoreOne(tb, `${path.basename(f)} ${rows[0]?.[0] ? '' : ''}${b.split('\n').find((l) => l.startsWith('# sent_id'))?.slice(12) ?? ''}`, tokens, syn, heads, rels);
        scoreOne(udSc, `${path.basename(f)}`, tokens, syn, heads, rels);
      }
    }
    perTb.push([dir.split('/').pop()!, tb]);
  }
  for (const [n, s] of perTb) report(`UD ${n.replace('UD_Albanian-', '')}`, s);
  report('UD all aligned', udSc);
  console.log(`  (${skipped} of ${total} treebank sentences skipped: a fused clitic written as two words, or tokenized differently from the adapter)`);
  if (showErrors > 0) {
    console.log('\nwrong relations, treebank (first ' + showErrors + '):');
    for (const e of udSc.errors.slice(0, showErrors)) console.log('  ' + e);
  }
  const rows = [...perRelUd].filter(([, v]) => v[1] >= 15).sort((a, b) => b[1][1] - a[1][1]);
  console.log('\nLAS by gold relation, treebank (relations with >= 15 words):');
  for (const [k, [ok, n]] of rows) console.log(`  ${k.padEnd(10)} ${String(n).padStart(5)} words, ${pct(ok, n)} labelled right`);
}
if (showErrors > 0) {
  console.log('\nwrong relations, gold set (first ' + showErrors + '):');
  for (const e of goldSc.errors.slice(0, showErrors)) console.log('  ' + e);
}
const goldRows = [...goldSc.relCorrectLabelled].sort((a, b) => b[1][1] - a[1][1]);
console.log('\nLAS by gold relation, gold set:');
for (const [k, [ok, n]] of goldRows) console.log(`  ${k.padEnd(10)} ${String(n).padStart(5)} words, ${pct(ok, n)} labelled right`);
