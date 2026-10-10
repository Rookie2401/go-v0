/// <reference types="node" />
/**
 * vite-node --config scripts/vite.config.ts scripts/probe-thai-segmentation.mts [--max-wikt N]
 *
 * How often does a word-level selection in Thai text have more than one plausible cut (thSegmentations: the tokenizer's cut
 * plus alternative cuts into known words)? Read-only. Sources: the course corpus data/corpus/th/*.json, and (when present) the
 * Wiktionary usage examples of data/benchmarks/th/generated. Two word tests: the adapter's own lists, and the adapter's lists
 * plus the Wiktionary headwords (what the card lane would pass as `isWord`). Prints counts for single-token and
 * adjacent-pair selections, then 30 spot-checked selections with their alternatives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { thAdapter, thSegmentations } from '../src/adapters/th';
import { DEFAULT_KAIKKI_FILE, loadKaikkiBench } from '../src/bench/gold/kaikki-node';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const maxWikt = Number(argv[argv.indexOf('--max-wikt') + 1]) || Infinity;

const sentences: Array<{ src: string; text: string }> = [];
const corpusDir = 'data/corpus/th';
for (const f of fs.readdirSync(corpusDir).filter((x) => x.endsWith('.json')).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(corpusDir, f), 'utf8')) as { sections?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text?: string }> }> }> };
  for (const s of doc.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? []) if (x.text) sentences.push({ src: 'corpus', text: x.text });
}
const nCorpus = sentences.length;
const wiktFile = 'data/benchmarks/th/generated/wiktionary-examples.gold.jsonl';
if (fs.existsSync(wiktFile)) {
  let k = 0;
  for (const line of fs.readFileSync(wiktFile, 'utf8').split('\n')) {
    if (!line.trim() || k >= maxWikt) continue;
    const row = JSON.parse(line) as { text?: string };
    if (row.text) { sentences.push({ src: 'wiktionary', text: row.text }); k++; }
  }
}
let headwords = new Set<string>();
if (fs.existsSync(DEFAULT_KAIKKI_FILE)) headwords = (await loadKaikkiBench()).mmWords;
console.log(`sentences: ${nCorpus} corpus, ${sentences.length - nCorpus} Wiktionary examples; Wiktionary headwords for isWord: ${headwords.size}`);

const THAI = /^[ก-๛]+$/u;
const withDict = (w: string): boolean => headwords.has(w);
const cut = (s: { words: Array<{ text: string }> }): string => s.words.map((w) => w.text).join('-');

interface Stat { selections: number; withAlt: number; byAlt: number[]; allKnownChosen: number }
const mk = (): Stat => ({ selections: 0, withAlt: 0, byAlt: [0, 0, 0, 0], allKnownChosen: 0 });
const stats: Record<string, Stat> = {};
const stat = (key: string): Stat => (stats[key] ??= mk());
const examples = new Map<string, { kind: string; text: string; chosen: string; alts: string[]; src: string }>();
const seenType = new Map<string, number>();

for (const { src, text } of sentences) {
  const toks = thAdapter.tokenize(text).filter((t) => t.isWord && THAI.test(t.surface));
  const selections: Array<{ kind: string; text: string }> = [];
  for (const t of toks) if ([...t.surface].length >= 2) selections.push({ kind: 'word', text: t.surface });
  for (let i = 0; i + 1 < toks.length; i++) if (toks[i].end === toks[i + 1].start) selections.push({ kind: 'pair', text: toks[i].surface + toks[i + 1].surface });
  for (const sel of selections) {
    for (const [mode, isWord] of [['adapter lists', undefined], ['+ Wiktionary headwords', withDict]] as const) {
      const r = thSegmentations(sel.text, isWord ? { isWord } : {});
      const st = stat(`${src} / ${sel.kind} / ${mode}`);
      st.selections++;
      if (r.chosen.words.every((w) => w.known)) st.allKnownChosen++;
      if (r.alternatives.length) {
        st.withAlt++;
        st.byAlt[Math.min(3, r.alternatives.length)]++;
        if (mode !== 'adapter lists') {
          seenType.set(`${sel.kind}:${sel.text}`, (seenType.get(sel.text) ?? 0) + 1);
          if (!examples.has(`${sel.kind}:${sel.text}`)) examples.set(`${sel.kind}:${sel.text}`, { kind: sel.kind, text: sel.text, chosen: `${cut(r.chosen)} (${r.chosen.confidence})`, alts: r.alternatives.map((a) => `${cut(a)} (${a.confidence})`), src });
        }
      }
    }
  }
}

const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
console.log('\nselections with at least one plausible alternative cut');
console.log('| source / selection / word test | selections | with alternative | share | 1 alt | 2 alts | 3 alts | chosen cut all known words |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const [k, s] of Object.entries(stats)) {
  console.log(`| ${k} | ${s.selections} | ${s.withAlt} | ${pct(s.withAlt, s.selections)} | ${s.byAlt[1]} | ${s.byAlt[2]} | ${s.byAlt[3]} | ${pct(s.allKnownChosen, s.selections)} |`);
}

const list = [...examples.values()].sort((a, b) => a.text.localeCompare(b.text, 'th'));
console.log(`\ndistinct selections (word and pair) with an alternative (adapter lists + Wiktionary headwords): ${list.length}`);
const step = Math.max(1, Math.floor(list.length / 30));
const picked = list.filter((_, i) => i % step === 0).slice(0, 30);
console.log(`\nspot check: ${picked.length} of them, every ${step}th in Thai order`);
for (const e of picked) console.log(`  ${e.text}  [${e.src}, ${e.kind}, seen ${seenType.get(`${e.kind}:${e.text}`)}x]\n    chosen: ${e.chosen}\n    alt:    ${e.alts.join('  |  ')}`);
