/**
 * Coverage probe for the German syntax rules (Linguistic Engine V2, Stage 4): over data/corpus/de and the hand-labelled gold files
 * data/gold/de/syntax-{dev,heldout,unseen}.json, report the attached share, the relation distribution, the share of relations that keep alternatives,
 * UAS / LAS against the gold labels and the time per sentence.
 *
 *   npx tsx scripts/probe-syntax-de.mts [--limit N] [--show K] [--gold-only] [--worst K] [--only SUBSTR] [--skip A,B] [--unattached K]
 *
 * --limit N   at most N corpus sentences (default all);  --show K  print the dependency table of K sample sentences (every 40th);
 * --gold-only skip the corpus;  --worst K  print the K gold sentences with the most wrong arcs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { deAdapter as de } from '../src/adapters/de';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const limit = Number(opt('--limit') ?? Infinity);
const show = Number(opt('--show') ?? 0);
const worst = Number(opt('--worst') ?? 6);
const goldOnly = args.includes('--gold-only');
const showUnattached = Number(opt('--unattached') ?? 0);

const root = path.resolve(import.meta.dirname, '..');
const corpusDir = path.join(root, 'data/corpus/de');
const goldFiles = ['syntax-dev.json', 'syntax-heldout.json', 'syntax-unseen.json'].map((f) => path.join(root, 'data/gold/de', f));

function collect(node: unknown, out: string[]): void {
  if (Array.isArray(node)) { for (const x of node) collect(x, out); return; }
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (Array.isArray(o.sentences)) for (const s of o.sentences) if (s && typeof (s as { text?: unknown }).text === 'string') out.push((s as { text: string }).text);
  for (const k of Object.keys(o)) if (k !== 'sentences') collect(o[k], out);
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) + ' %' : 'n/a');

const run = (text: string) => {
  const tokens = de.tokenize(text);
  const analyses = de.analyze(tokens);
  const t0 = performance.now();
  const syn = de.syntax!(tokens, analyses)!;
  return { tokens, analyses, syn, ms: performance.now() - t0 };
};

// ── corpus
if (!goldOnly) {
  const sentences: string[] = [];
  const only = opt('--only'); const skip = opt('--skip');
  for (const f of fs.readdirSync(corpusDir).filter((x) => x.endsWith('.json') && (!only || x.includes(only)) && (!skip || !skip.split(',').some((k) => x.includes(k)))).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(corpusDir, f), 'utf8'));
    collect(j, sentences);
    if (sentences.length >= limit) break;
  }
  const used = sentences.flatMap((t) => de.segmentSentences(t).map((x) => x.text.trim()).filter(Boolean)).slice(0, Number.isFinite(limit) ? limit : undefined);
  let words = 0, attached = 0, withAlt = 0, rels = 0, conflicted = 0, sentFull = 0, totalMs = 0, maxMs = 0, w20ms = 0, w20n = 0, lowConf = 0, noBasis = 0;
  const dist = new Map<string, number>();
  const unattached = new Map<string, number>();
  const samples: string[] = [];
  const unattachedSamples: string[] = [];
  used.forEach((text, k) => {
    const { tokens, syn, ms } = run(text);
    totalMs += ms; maxMs = Math.max(maxMs, ms);
    const nw = tokens.filter((t) => t.isWord).length;
    if (nw >= 14 && nw <= 26) { w20ms += ms; w20n++; }
    words += nw;
    const have = new Set(syn.relations.map((r) => r.dependent));
    let full = true;
    tokens.forEach((t, i) => {
      if (!t.isWord) return;
      if (have.has(i)) attached++; else { full = false; unattached.set(t.surface.toLowerCase(), (unattached.get(t.surface.toLowerCase()) ?? 0) + 1); }
    });
    if (full) sentFull++;
    else if (showUnattached) unattachedSamples.push(text + '   <- ' + tokens.filter((t, i) => t.isWord && !have.has(i)).map((t) => t.surface).join(', '));
    for (const r of syn.relations) {
      if (r.relation === 'punct') continue;
      rels++;
      dist.set(r.relation, (dist.get(r.relation) ?? 0) + 1);
      if (r.alternatives?.length) withAlt++;
      if (r.status === 'conflicted') conflicted++;
      if (r.confidence < 0.5) lowConf++;
      if (!r.basis.length || r.basis.some((b) => !b.trim())) noBasis++;
    }
    if (show && k % 40 === 0 && samples.length < show) {
      const lines = [`\n== ${text}   (attached ${syn.attached})`];
      tokens.forEach((t, i) => {
        if (!t.isWord) return;
        const r = syn.relations.find((x) => x.dependent === i);
        lines.push(`  ${pad(i, 3)}${pad(t.surface, 16)}${r ? `${pad(r.relation, 9)}-> ${r.head === undefined ? 'ROOT' : tokens[r.head].surface}${r.alternatives ? '  [alts: ' + r.alternatives.map((a) => a.relation).join(',') + ']' : ''}` : '--'}`);
      });
      samples.push(lines.join('\n'));
    }
  });
  console.log(`CORPUS data/corpus/de: ${used.length} sentences, ${words} word tokens`);
  console.log(pad('attached word share', 34) + pct(attached, words));
  console.log(pad('sentences fully attached', 34) + pct(sentFull, used.length));
  console.log(pad('relations with alternatives', 34) + pct(withAlt, rels) + `  (${withAlt} of ${rels})`);
  console.log(pad('relations marked conflicted', 34) + pct(conflicted, rels));
  console.log(pad('relations with confidence < 0.5', 34) + pct(lowConf, rels));
  console.log(pad('relations with an empty basis', 34) + String(noBasis));
  console.log(pad('time per sentence (mean / max)', 34) + `${(totalMs / Math.max(1, used.length)).toFixed(3)} ms / ${maxMs.toFixed(2)} ms`);
  console.log(pad('time, sentences of 14-26 words', 34) + `${(w20ms / Math.max(1, w20n)).toFixed(3)} ms mean over ${w20n}`);
  console.log('\nrelation distribution (words, punctuation excluded)');
  for (const [r, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + pad(r, 10) + pad(n, 7) + pct(n, rels));
  const top = [...unattached.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('\nmost frequent unattached words: ' + top.map(([w, n]) => `${w} (${n})`).join(', '));
  for (const s of samples) console.log(s);
  if (unattachedSamples.length) { const step = Math.max(1, Math.floor(unattachedSamples.length / showUnattached)); const picked = unattachedSamples.filter((_, i) => i % step === 0).slice(0, showUnattached); unattachedSamples.length = 0; unattachedSamples.push(...picked); }
  if (unattachedSamples.length) console.log('\nsentences with unattached words:\n' + unattachedSamples.join('\n'));
}

// ── gold
for (const goldFile of goldFiles) if (fs.existsSync(goldFile)) {
  const gold = JSON.parse(fs.readFileSync(goldFile, 'utf8')) as { sentences: Array<{ text: string; tokens: string[]; heads: number[]; relations: string[] }> };
  let total = 0, uasOk = 0, lasOk = 0, given = 0, givenUas = 0, givenLas = 0, altHit = 0, altWrong = 0, tokenMismatch = 0;
  const confusion = new Map<string, number>();
  const per: Array<{ text: string; wrong: number; lines: string[] }> = [];
  for (const g of gold.sentences) {
    const { tokens, syn } = run(g.text);
    const wordIdx = tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
    if (wordIdx.length !== g.tokens.length || wordIdx.some((ti, k) => tokens[ti].surface !== g.tokens[k])) { tokenMismatch++; per.push({ text: g.text, wrong: 99, lines: ['  TOKEN MISMATCH: ' + wordIdx.map((i) => tokens[i].surface).join(' ')] }); continue; }
    const pos = new Map<number, number>();
    wordIdx.forEach((ti, k) => pos.set(ti, k));
    const lines: string[] = [];
    let wrong = 0;
    wordIdx.forEach((ti, k) => {
      total++;
      const r = syn.relations.find((x) => x.dependent === ti);
      const gh = g.heads[k], gr = g.relations[k];
      const ph = r ? (r.head === undefined ? -1 : pos.get(r.head) ?? -2) : undefined;
      const hOk = r !== undefined && ph === gh;
      const lOk = hOk && r!.relation === gr;
      if (hOk) uasOk++;
      if (lOk) lasOk++;
      if (r) { given++; if (hOk) givenUas++; if (lOk) givenLas++; }
      if (r && !lOk && r.alternatives?.some((a) => (a.head === undefined ? -1 : pos.get(a.head)) === gh && a.relation === gr)) altHit++;
      if (!lOk && r?.alternatives?.length) altWrong++;
      if (!lOk) { wrong++; confusion.set(`${gr} <- ${r ? r.relation : 'none'}`, (confusion.get(`${gr} <- ${r ? r.relation : 'none'}`) ?? 0) + 1); lines.push(`  ${pad(k, 3)}${pad(g.tokens[k], 15)} gold ${pad(gr, 9)}-> ${gh < 0 ? 'ROOT' : g.tokens[gh]}   got ${r ? `${pad(r.relation, 9)}-> ${ph === -1 ? 'ROOT' : ph !== undefined && ph >= 0 ? g.tokens[ph] : '?'}` : 'none'}`); }
    });
    per.push({ text: g.text, wrong, lines });
  }
  console.log(`\nGOLD data/gold/de/${path.basename(goldFile)}: ${gold.sentences.length} sentences, ${total} word tokens (${tokenMismatch} sentences skipped: token mismatch)`);
  console.log(pad('UAS (all word tokens)', 34) + pct(uasOk, total));
  console.log(pad('LAS (all word tokens)', 34) + pct(lasOk, total));
  console.log(pad('relations given', 34) + pct(given, total));
  console.log(pad('UAS on the relations given', 34) + pct(givenUas, given));
  console.log(pad('LAS on the relations given', 34) + pct(givenLas, given));
  console.log(pad('gold reading kept as alternative', 34) + `${altHit} of ${altWrong} wrong with alternatives`);
  console.log('most frequent label errors (gold <- got): ' + [...confusion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} (${n})`).join('; '));
  for (const p of per.sort((a, b) => b.wrong - a.wrong).slice(0, worst)) console.log(`\n-- ${p.text}  [${p.wrong} wrong]\n${p.lines.join('\n')}`);
}
