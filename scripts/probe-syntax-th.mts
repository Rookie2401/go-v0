/// <reference types="node" />
/**
 * vite-node --config scripts/vite.config.ts scripts/probe-syntax-th.mts [--limit N]
 *
 * Thai contextual syntax (src/adapters/thai/syntax.ts) on (1) every sentence of data/corpus/th: how many word tokens get a
 * relation, the relation distribution, the share of relations that keep alternatives, speed; and (2) the hand-labelled gold set
 * data/gold/th/syntax-dev.json (AI-judged, unreviewed): UAS (head right) and LAS (head and relation right) over ALL gold
 * word tokens (an unattached word counts as wrong), the same over the tokens the rules did attach (precision), and how often
 * the gold answer is among the alternatives. Read-only. `--limit N` keeps the first N corpus sentences.
 */
import fs from 'node:fs';
import path from 'node:path';
import { thAdapter } from '../src/adapters/th';
import type { SyntaxAnalysis } from '../src/core/syntax';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const limit = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) || Infinity : Infinity;

interface GoldSentence { text: string; tokens: string[]; heads: Array<number | null>; relations: Array<string | null> }

const sentences: string[] = [];
const corpusDir = 'data/corpus/th';
for (const f of fs.readdirSync(corpusDir).filter((x) => x.endsWith('.json')).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(corpusDir, f), 'utf8')) as { sections?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text?: string }> }> }> };
  for (const s of doc.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? []) if (x.text) sentences.push(x.text);
}
const corpus = sentences.slice(0, limit);

const syntax = thAdapter.syntax!;
const prepared = corpus.map((text) => { const tokens = thAdapter.tokenize(text); return { text, tokens, analyses: thAdapter.analyze(tokens) }; });

// ── corpus
let words = 0, attached = 0, rels = 0, withAlts = 0, sentencesWithRoot = 0, conflicted = 0;
const dist = new Map<string, number>();
const unknownLoose = new Map<string, number>();
for (const p of prepared) {
  const sx: SyntaxAnalysis = syntax(p.tokens, p.analyses)!;
  const w = p.tokens.filter((t) => t.isWord).length;
  words += w;
  for (const r of sx.relations) {
    if (r.relation === 'punct') continue;
    rels++;
    dist.set(r.relation, (dist.get(r.relation) ?? 0) + 1);
    if (r.alternatives?.length) withAlts++;
    if (r.status === 'conflicted') conflicted++;
    if (!r.basis.length) throw new Error('empty basis: ' + p.text);
  }
  attached += Math.round(sx.attached * w);
  if (sx.relations.some((r) => r.relation === 'root')) sentencesWithRoot++;
  const hit = new Set(sx.relations.map((r) => r.dependent));
  p.tokens.forEach((t, i) => { if (t.isWord && !hit.has(i)) unknownLoose.set(t.surface, (unknownLoose.get(t.surface) ?? 0) + 1); });
}
// speed: the whole corpus, several rounds
const rounds = 20;
const t0 = performance.now();
for (let r = 0; r < rounds; r++) for (const p of prepared) syntax(p.tokens, p.analyses);
const ms = (performance.now() - t0) / (rounds * prepared.length);
const msPer20 = ms * 20 / Math.max(1, words / prepared.length);

console.log(`corpus: ${prepared.length} sentences, ${words} word tokens`);
console.log(`attached share (word tokens with a relation): ${(attached / words * 100).toFixed(1)} %   sentences with a root: ${sentencesWithRoot}/${prepared.length}`);
console.log(`relations: ${rels}   with alternatives: ${withAlts} (${(withAlts / rels * 100).toFixed(1)} %)   status conflicted: ${conflicted}`);
console.log('distribution: ' + [...dist.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${(v / rels * 100).toFixed(1)} %)`).join(', '));
console.log(`speed: ${ms.toFixed(3)} ms per sentence (average ${(words / prepared.length).toFixed(1)} words); ${msPer20.toFixed(3)} ms per 20 words`);
console.log('most frequent unattached words: ' + [...unknownLoose.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}×${v}`).join(' '));

// ── out-of-domain load check: Wiktionary usage examples (many words the list does not have; no gold, so no accuracy)
const wiktFile = 'data/benchmarks/th/generated/wiktionary-examples.gold.jsonl';
if (fs.existsSync(wiktFile)) {
  const rows = fs.readFileSync(wiktFile, 'utf8').split(String.fromCharCode(10)).filter(Boolean).slice(0, Number.isFinite(limit) ? limit : 2000).map((l) => (JSON.parse(l) as { text?: string }).text ?? '').filter(Boolean);
  let w = 0, a = 0, total = 0, worst = 0, bad = 0;
  for (const text of rows) {
    const tokens = thAdapter.tokenize(text);
    const analyses = thAdapter.analyze(tokens);
    const t0 = performance.now();
    const sx = syntax(tokens, analyses)!;
    const d = performance.now() - t0;
    total += d; worst = Math.max(worst, d);
    const nw = tokens.filter((t) => t.isWord).length;
    w += nw; a += Math.round(sx.attached * nw);
    const head = new Map(sx.relations.map((r) => [r.dependent, r.head]));
    for (const [dep] of head) { let cur: number | undefined = dep; let steps = 0; while (cur !== undefined && steps < 200) { cur = head.get(cur); steps++; } if (steps >= 200 || head.get(dep) === dep) { bad++; break; } }
  }
  console.log(`
Wiktionary examples (load check, no gold): ${rows.length} sentences, ${w} words, attached ${(a / w * 100).toFixed(1)} %, ${(total / w * 20).toFixed(3)} ms per 20 words, slowest sentence ${worst.toFixed(2)} ms, sentences with a head cycle: ${bad}`);
}

// ── gold
const goldFile = 'data/gold/th/syntax-dev.json';
function scoreGold(sentencesOf: GoldSentence[], name: string, detail: boolean): void {
  let n = 0, uas = 0, las = 0, att = 0, attUas = 0, attLas = 0, altHead = 0, altLas = 0, exact = 0;
  const perRel = new Map<string, { n: number; uas: number; las: number }>();
  const confusions = new Map<string, number>();
  for (const g of sentencesOf) {
    const tokens = thAdapter.tokenize(g.text);
    if (tokens.map((t) => t.surface).join('|') !== g.tokens.join('|')) throw new Error('gold tokens differ from the tokenizer: ' + g.text);
    const sx = syntax(tokens, thAdapter.analyze(tokens))!;
    let sentenceOk = true;
    g.tokens.forEach((_, i) => {
      const gh = g.heads[i], gr = g.relations[i];
      if (gh === null || gr === null || !tokens[i].isWord) return;
      n++;
      const r = sx.relations.find((x) => x.dependent === i);
      const slot = perRel.get(gr) ?? { n: 0, uas: 0, las: 0 };
      slot.n++;
      if (r) {
        att++;
        const ph = r.head ?? -1;
        const hOk = ph === gh;
        const lOk = hOk && r.relation === gr;
        if (hOk) { uas++; attUas++; slot.uas++; }
        if (lOk) { las++; attLas++; slot.las++; } else sentenceOk = false;
        if (!lOk && r.alternatives?.some((a) => (a.head ?? -1) === gh && a.relation === gr)) altLas++;
        if (!hOk && r.alternatives?.some((a) => (a.head ?? -1) === gh)) altHead++;
        if (hOk && r.relation !== gr) confusions.set(`${gr}→${r.relation}`, (confusions.get(`${gr}→${r.relation}`) ?? 0) + 1);
      } else sentenceOk = false;
      perRel.set(gr, slot);
    });
    if (sentenceOk) exact++;
  }
  const pct = (a: number, b: number) => (b ? (a / b * 100).toFixed(1) : '-') + ' %';
  console.log(`
gold ${name}: ${sentencesOf.length} sentences, ${n} word tokens (AI-judged, unreviewed)`);
  console.log(`attached: ${att}/${n} (${pct(att, n)})   sentences fully right: ${exact}/${sentencesOf.length}`);
  console.log(`UAS over all gold words: ${pct(uas, n)}   LAS over all gold words: ${pct(las, n)}`);
  console.log(`UAS over attached words: ${pct(attUas, att)}   LAS over attached words: ${pct(attLas, att)}`);
  console.log(`wrong, but the gold reading is among the alternatives: head ${altHead}, head+relation ${altLas}`);
  if (!detail) return;
  console.log('per gold relation (n, head right, head+relation right):');
  for (const [k, v] of [...perRel.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(10)} ${String(v.n).padStart(3)}  UAS ${pct(v.uas, v.n).padStart(8)}  LAS ${pct(v.las, v.n).padStart(8)}`);
  console.log('relation confusions (head right, relation differs): ' + ([...confusions.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ') || 'none'));
}
if (fs.existsSync(goldFile)) {
  const gold = JSON.parse(fs.readFileSync(goldFile, 'utf8')) as { sentences: Array<GoldSentence & { split?: string }> };
  scoreGold(gold.sentences, 'all', false);
  scoreGold(gold.sentences.filter((g) => g.split !== 'heldout'), 'dev (the rules were tuned on these)', true);
  scoreGold(gold.sentences.filter((g) => g.split === 'heldout'), 'held-out (labelled after the rules were written; see the doc: first-run score was lower)', true);
}
