/// <reference types="node" />
/**
 * npx vite-node --config scripts/vite.config.ts scripts/fr-eval-foreign.mts [-- --lemmas]
 *
 * How much text that is NOT French does the French analyser recognise? GoLearn Active decides which language a block of Latin-script
 * text is in by the share of its words a pack's word list reads (packages/golearn-extension/src/active/pageLanguages.ts `wordListShare`:
 * a word counts when it has a reading that is not `unconfirmed`); a pack that reads 45 % of a block (COMPATIBLE_SHARE) may take it. So
 * the French pack must stay well below that on English, Spanish, German, Latin and Albanian prose, and well above it on French.
 *
 * Texts: the repository's own bundled course texts for Spanish, German, Latin and Albanian (data/corpus/<lang>), this repository's
 * English documentation prose (docs/*.md, code and tables left out), and for French the sentences of the UD French GSD dev file
 * (data/research/ud, evaluation only). Blocks are runs of consecutive sentences of about 40 words, the size of a paragraph.
 * Reads only; writes nothing. `--lemmas` loads the dictionary lemma list first, as the extension does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { frAdapter, loadFrenchLexicon } from '../src/adapters/fr';

const args = process.argv.slice(2).filter((a) => a !== '--');
if (args.includes('--lemmas')) { await loadFrenchLexicon(); console.log('(the dictionary lemma list is loaded)'); } else console.log('(the hand word list alone)');

const COMPATIBLE_SHARE = 0.45;
const share = (text: string): { hits: number; words: number } => {
  const toks = frAdapter.tokenize(text.normalize('NFC'));
  const an = frAdapter.analyze(toks);
  let hits = 0, words = 0;
  for (const a of an) {
    if (!a.token.isWord || !/\p{L}/u.test(a.token.surface)) continue;
    words++;
    if (a.candidates.some((c) => !c.unconfirmed)) hits++;
  }
  return { hits, words };
};

/** Group sentences into blocks of about `size` words. */
function blocks(sentences: string[], size = 40): string[] {
  const out: string[] = [];
  let cur: string[] = [], n = 0;
  for (const s of sentences) {
    cur.push(s); n += s.split(/\s+/).length;
    if (n >= size) { out.push(cur.join(' ')); cur = []; n = 0; }
  }
  return out;
}

function corpusSentences(lang: string): string[] {
  const dir = path.join('data', 'corpus', lang);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { sections?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text?: string }> }> }> };
    for (const sec of doc.sections ?? []) for (const par of sec.paragraphs ?? []) for (const s of par.sentences ?? []) if (typeof s.text === 'string' && s.text.trim()) out.push(s.text.trim());
  }
  return out;
}

function englishSentences(): string[] {
  const out: string[] = [];
  for (const f of ['docs/ARCHITECTURE.md', 'docs/READINESS.md', 'docs/IMPORT.md', 'docs/GOLISTEN.md', 'docs/STORAGE.md']) {
    if (!fs.existsSync(f)) continue;
    let code = false;
    for (const raw of fs.readFileSync(f, 'utf8').split('\n')) {
      if (raw.startsWith('```')) { code = !code; continue; }
      const line = raw.trim();
      if (code || !line || /^[#|>\-*`]/.test(line) || line.includes('`') || line.split(/\s+/).length < 8) continue;
      out.push(line);
    }
  }
  return out;
}

function udFrench(): string[] {
  const f = 'data/research/ud/UD_French-GSD/fr_gsd-ud-dev.conllu';
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('# text = ')).map((l) => l.slice(9));
}

const SETS: Array<[string, string[]]> = [
  ['French (UD GSD dev)', udFrench()], ['English (docs prose)', englishSentences()], ['Spanish (course texts)', corpusSentences('es')],
  ['German (course texts)', corpusSentences('de')], ['Latin (course texts)', corpusSentences('la')], ['Albanian (course texts)', corpusSentences('sq')],
];

console.log(`A block is about 40 words. "taken" = blocks where the French pack reads at least ${COMPATIBLE_SHARE * 100} % of the words (it could claim them when no other pack does).`);
for (const [name, sentences] of SETS) {
  const bl = blocks(sentences).slice(0, 600);
  if (!bl.length) { console.log(`${name}: no text found`); continue; }
  let hits = 0, words = 0, taken = 0, max = 0;
  const shares: number[] = [];
  for (const b of bl) {
    const r = share(b);
    if (!r.words) continue;
    hits += r.hits; words += r.words;
    const s = r.hits / r.words;
    shares.push(s);
    if (s >= COMPATIBLE_SHARE) taken++;
    if (s > max) max = s;
  }
  shares.sort((a, b) => a - b);
  const pct = (x: number) => `${(100 * x).toFixed(1)} %`;
  console.log(`${name.padEnd(26)} blocks ${String(shares.length).padStart(4)}  words ${String(words).padStart(6)}  read ${pct(hits / words).padStart(7)}  median ${pct(shares[Math.floor(shares.length / 2)]).padStart(7)}  5th-95th ${pct(shares[Math.floor(shares.length * 0.05)])}-${pct(shares[Math.floor(shares.length * 0.95)])}  max ${pct(max)}  taken ${taken} (${pct(taken / shares.length)})`);
}
