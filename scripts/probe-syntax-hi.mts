/// <reference types="node" />
/**
 * vite-node scripts/probe-syntax-hi.mts [--limit N] [--show] [--corpus-only | --gold-only]
 *
 * What the Hindi contextual-syntax rules (src/adapters/hindi/syntax.ts) do over the shipped Hindi corpus and over the
 * hand-labelled gold sentences (data/gold/hi/syntax-dev.json and syntax-dev2.json): the share of words that got a relation, the relation
 * distribution, the share of relations that keep alternatives, the milliseconds per sentence, and unlabelled / labelled
 * attachment scores (UAS / LAS) against the gold sentences. Gold labels are AI-judged and unreviewed, so the scores
 * measure agreement with the labeller, not correctness. `--show` lists every gold word the rules got wrong.
 * Never downloads anything; scores a Hindi UD treebank too when a CoNLL-U file of one is already on disk.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { hiAdapter } from '../src/adapters/hi';

const args = process.argv.slice(2).filter((a) => a !== '--');
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const show = args.includes('--show');
const goldOnly = args.includes('--gold-only');
const corpusOnly = args.includes('--corpus-only');

const hi = hiAdapter;
const round = (x: number, d = 3): number => Math.round(x * 10 ** d) / 10 ** d;
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

// ───────── corpus sentences ─────────
function corpusSentences(): string[] {
  const out: string[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (Array.isArray(r.sentences)) for (const s of r.sentences as Array<{ text?: string }>) if (s?.text) out.push(s.text);
      for (const k of Object.keys(r)) if (k !== 'sentences') walk(r[k]);
    }
  };
  const dir = 'data/corpus/hi';
  for (const f of readdirSync(dir).sort()) if (f.endsWith('.json')) walk(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
  return out;
}

if (!goldOnly) {
  const sentences = corpusSentences().slice(0, limit);
  const dist = new Map<string, number>();
  let words = 0;
  let attached = 0;
  let withAlt = 0;
  let relTotal = 0;
  let noRoot = 0;
  let allAttached = 0;
  const ms: number[] = [];
  const per20: number[] = [];
  const unattachedCount = new Map<string, number>();
  for (const text of sentences) {
    const t = hi.tokenize(text.normalize('NFC'));
    const a = hi.analyze(t);
    const t0 = performance.now();
    const s = hi.syntax!(t, a)!;
    const dt = performance.now() - t0;
    const w = t.filter((x) => x.isWord).length;
    ms.push(dt);
    if (w > 0) per20.push((dt * 20) / w);
    words += w;
    const got = t.filter((x, i) => x.isWord && s.relations.some((r) => r.dependent === i)).length;
    attached += got;
    if (got === w) allAttached++;
    if (!s.relations.some((r) => r.relation === 'root')) noRoot++;
    for (const r of s.relations) {
      if (!t[r.dependent].isWord) continue;
      relTotal++;
      dist.set(r.relation, (dist.get(r.relation) ?? 0) + 1);
      if (r.alternatives && r.alternatives.length > 0) withAlt++;
    }
    t.forEach((x, i) => { if (x.isWord && !s.relations.some((r) => r.dependent === i)) unattachedCount.set(x.normalized, (unattachedCount.get(x.normalized) ?? 0) + 1); });
  }
  ms.sort((x, y) => x - y);
  const mean = ms.reduce((x, y) => x + y, 0) / Math.max(1, ms.length);
  console.log(`\nCORPUS data/corpus/hi: ${sentences.length} sentences, ${words} words`);
  console.log(`  attached (words with a relation)   ${pct(attached / words)}  (${attached}/${words})`);
  console.log(`  sentences with every word attached ${pct(allAttached / sentences.length)}`);
  console.log(`  sentences without a root           ${noRoot}`);
  console.log(`  relations with alternatives        ${pct(withAlt / relTotal)}  (${withAlt}/${relTotal})`);
  console.log(`  ms per sentence: mean ${round(mean, 3)}  p95 ${round(ms[Math.floor(ms.length * 0.95)] ?? 0, 3)}  max ${round(ms[ms.length - 1] ?? 0, 3)}; mean per 20 words ${round(per20.reduce((x, y) => x + y, 0) / Math.max(1, per20.length), 3)}`);
  console.log('  relation distribution:');
  for (const [r, n] of [...dist].sort((x, y) => y[1] - x[1])) console.log(`    ${r.padEnd(10)} ${String(n).padStart(5)}  ${pct(n / relTotal)}`);
  const un = [...unattachedCount].sort((x, y) => y[1] - x[1]).slice(0, 12);
  if (un.length) console.log(`  most frequent unattached words: ${un.map(([w, n]) => `${w}×${n}`).join('  ')}`);
}

// ───────── gold ─────────
interface GoldSentence { text: string; tokens: string[]; heads: number[]; relations: string[] }
function scoreSet(label: string, sents: GoldSentence[]): void {
  let words = 0;
  let uas = 0;
  let las = 0;
  let unattached = 0;
  let alt = 0;
  let altRescue = 0;
  let skipped = 0;
  const confusion = new Map<string, number>();
  const perRel = new Map<string, { n: number; ok: number }>();
  const wrong: string[] = [];
  for (const g of sents) {
    const t = hi.tokenize(g.text.normalize('NFC'));
    const a = hi.analyze(t);
    const s = hi.syntax!(t, a)!;
    const wi = t.map((x, i) => (x.isWord ? i : -1)).filter((i) => i >= 0);
    if (wi.length !== g.tokens.length || wi.some((i, k) => t[i].surface.normalize('NFC') !== g.tokens[k].normalize('NFC'))) { skipped++; wrong.push(`TOKEN MISMATCH: ${g.text} -> ${wi.map((i) => t[i].surface).join(' ')}`); continue; }
    const idxToGold = new Map<number, number>();
    wi.forEach((i, k) => idxToGold.set(i, k + 1));
    g.tokens.forEach((tok, k) => {
      words++;
      const r = s.relations.find((x) => x.dependent === wi[k]);
      const goldHead = g.heads[k];
      const goldRel = g.relations[k];
      const pr = perRel.get(goldRel) ?? { n: 0, ok: 0 };
      pr.n++;
      if (!r) { unattached++; confusion.set(`${goldRel} <- (none)`, (confusion.get(`${goldRel} <- (none)`) ?? 0) + 1); perRel.set(goldRel, pr); wrong.push(`${g.text}\n    ${tok}: gold ${goldRel}->${goldHead === 0 ? 'ROOT' : g.tokens[goldHead - 1]}; none`); return; }
      const predHead = r.head === undefined ? 0 : (idxToGold.get(r.head) ?? -1);
      const uOk = predHead === goldHead;
      const lOk = uOk && r.relation === goldRel;
      if (uOk) uas++;
      if (lOk) { las++; pr.ok++; }
      else {
        confusion.set(`${goldRel} <- ${r.relation}${uOk ? '' : ' (head)'}`, (confusion.get(`${goldRel} <- ${r.relation}${uOk ? '' : ' (head)'}`) ?? 0) + 1);
        wrong.push(`${g.text}\n    ${tok}: gold ${goldRel}->${goldHead === 0 ? 'ROOT' : g.tokens[goldHead - 1]}; got ${r.relation}->${r.head === undefined ? 'ROOT' : s.tokens[r.head]}${r.alternatives ? ` [alt ${r.alternatives.map((x) => `${x.relation}->${x.head === undefined ? 'ROOT' : s.tokens[x.head]}`).join('|')}]` : ''}`);
      }
      if (r.alternatives && r.alternatives.length > 0) {
        alt++;
        if (!lOk && r.alternatives.some((x) => (x.head === undefined ? 0 : (idxToGold.get(x.head) ?? -1)) === goldHead && x.relation === goldRel)) altRescue++;
      }
      perRel.set(goldRel, pr);
    });
  }
  console.log(`\nGOLD ${label}: ${sents.length - skipped} sentences scored (${skipped} skipped for token mismatch), ${words} words`);
  console.log(`  UAS ${pct(uas / words)}   LAS ${pct(las / words)}   no relation ${pct(unattached / words)}   words with alternatives ${pct(alt / words)}; the right answer sat in the alternatives for ${altRescue} wrong words`);
  console.log('  per gold relation (n, labelled correct):');
  for (const [r, v] of [...perRel].sort((x, y) => y[1].n - x[1].n)) console.log(`    ${r.padEnd(10)} ${String(v.n).padStart(4)}  ${pct(v.ok / v.n)}`);
  console.log('  most frequent confusions (gold <- got):');
  for (const [k, n] of [...confusion].sort((x, y) => y[1] - x[1]).slice(0, 12)) console.log(`    ${String(n).padStart(3)}  ${k}`);
  if (show) { console.log('  wrong words:'); for (const w of wrong) console.log(`  ${w}`); }
}

if (!corpusOnly) {
  for (const [goldPath, label] of [['data/gold/hi/syntax-dev.json', 'DEV (rules were tuned on these)'], ['data/gold/hi/syntax-dev2.json', 'SECOND DEV (labelled before the rules ran on it, then used to fix rules)'], ['data/gold/hi/syntax-fresh.json', 'FRESH (labelled blind; first run scored UAS 94.1 / LAS 92.0, then rules were fixed for what it showed)']]) {
    if (existsSync(goldPath)) {
      const gold = JSON.parse(readFileSync(goldPath, 'utf8')) as { sentences: GoldSentence[] };
      scoreSet(`${goldPath} ${label}, AI-judged and unreviewed`, gold.sentences.slice(0, limit));
    } else console.log(`
no gold file at ${goldPath}`);
  }

  // a Hindi UD treebank already on disk (never downloaded)
  const found: string[] = [];
  const scan = (dir: string, depth: number): void => {
    if (depth > 4 || !existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      const p = `${dir}/${f}`;
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) scan(p, depth + 1);
      else if (/^hi[_-].*\.conllu$/iu.test(f) || /HDTB|Hindi.*\.conllu$/iu.test(f)) found.push(p);
    }
  };
  scan('data/research', 0);
  scan('data/sources', 0);
  if (found.length === 0) console.log('\nno Hindi UD treebank (HDTB CoNLL-U) on disk under data/research or data/sources: nothing scored against one');
  else {
    for (const p of found) {
      const sents: GoldSentence[] = [];
      let cur: { words: Array<{ form: string; head: number; rel: string }>; text: string } = { words: [], text: '' };
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        if (line.startsWith('# text = ')) cur.text = line.slice(9);
        else if (line.trim() === '') { if (cur.words.length) sents.push({ text: cur.text, tokens: cur.words.map((w) => w.form), heads: cur.words.map((w) => w.head), relations: cur.words.map((w) => w.rel.split(':')[0]) }); cur = { words: [], text: '' }; }
        else if (!line.startsWith('#')) { const c = line.split('\t'); if (/^\d+$/.test(c[0]) && c[3] !== 'PUNCT') cur.words.push({ form: c[1], head: Number(c[6]), rel: c[7] }); }
      }
      // heads are indexed over all CoNLL-U words incl. punctuation; skip sentences with punctuation to keep the mapping exact
      scoreSet(p, sents.filter((s) => s.heads.every((h) => h <= s.tokens.length)).slice(0, limit));
    }
  }
}
