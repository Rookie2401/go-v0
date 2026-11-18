// The English the card writes for a verb in a derived stem (its "own meaning" line): for every (lemma, stem) pair of the Tanakh outside the
// Qal, the commonest token, read with the source's own reading put first (as Biblia does), so that only the English is under test.
// Usage: stems.mts <out file> [top N]
import fs from 'node:fs';
import { adapter, bare, BIBLIA, card, loadFull, words } from './lib.mts';
import { decodeOshb, BINYAN_HEBREW } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/oshb';
import { lemmaStem, lookupHebrewLemma } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/index-store';
await loadFull();
const N = Number(process.argv[3] ?? 200);
type G = { n: number; forms: Map<string, { n: number; verse: string; k: number; lemma: string; code: string }> };
const groups = new Map<string, G>();
for (const f of fs.readdirSync(BIBLIA).filter((x) => x.endsWith('.json') && x !== 'SOURCES.json')) {
  const b = JSON.parse(fs.readFileSync(`${BIBLIA}/${f}`, 'utf8'));
  for (const ch of b.chapters) for (const v of ch.verses) {
    const text = String(v.t).normalize('NFC');
    v.w.forEach((tok: any, k: number) => {
      if (!tok || tok[1][0] !== 'H') return;
      const d = decodeOshb(tok[0], tok[1]);
      if (d.pos !== 'VERB' || !d.morph.Binyan || d.morph.Binyan === 'Qal') return;
      const key = `${lemmaStem(tok[0])}|${d.morph.Binyan}`;
      const g = groups.get(key) ?? { n: 0, forms: new Map() };
      g.n++;
      const fk = `${tok[1]}`;
      const e = g.forms.get(fk) ?? { n: 0, verse: text, k, lemma: tok[0], code: tok[1] };
      e.n++; g.forms.set(fk, e);
      groups.set(key, g);
    });
  }
}
const top = [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, N);
const out: string[] = [];
let tokens = 0;
for (const [key, g] of top) {
  tokens += g.n;
  const [id, binyan] = key.split('|');
  const row = lookupHebrewLemma(id);
  const best = [...g.forms.values()].sort((a, b) => b.n - a.n)[0];
  const ws = words(best.verse);
  const w = ws[best.k];
  let english = '?';
  let lim = '';
  if (w) {
    const c = card(best.verse, w.surface, w.start, { gold: { lemmaId: id, code: best.code } });
    const wa = c.wordAnalysis;
    english = wa?.contextualMeaning?.text ? `CTX ${wa.contextualMeaning.text}` : wa?.inflectedMeaning?.text ?? `(no English of its own; lemma meaning: ${String(wa?.lexicalMeaning?.text ?? '').slice(0, 40)})`;
    lim = c.lemma !== row?.[0] ? `  [card lemma ${c.lemma}]` : '';
  }
  out.push(`${g.n}\t${row?.[0] ?? id}\t${binyan}\t${w?.surface ?? ''}\t${best.code}\t${english}\t|| citation: ${String(row?.[1] ?? '').slice(0, 60)}${lim}`);
}
const allTokens = [...groups.values()].reduce((s, g) => s + g.n, 0);
fs.writeFileSync(process.argv[2]!, [`${groups.size} (lemma, stem) pairs outside the Qal, ${allTokens} tokens; the ${top.length} commonest pairs below cover ${tokens} tokens (${(100 * tokens / allTokens).toFixed(1)} %)`, 'tokens\tlemma\tstem\tcommonest form\tcode\tthe card\'s English\tcitation gloss', ...out].join('\n'));
console.log(out.length, 'pairs written');
void adapter; void bare; void BINYAN_HEBREW;
