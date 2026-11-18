// (1) What the card shows for the tokens of the Tanakh that the repository's alignment left without a source reading (gold = null).
// (2) Tokens that get an unconfirmed reading once the cantillation is removed although the printed token had a source reading.
import fs from 'node:fs';
import { adapter, BIBLIA, loadFull, strip } from './lib.mts';
await loadFull();
const pick = (cands: any[]): any => (cands.length ? cands.reduce((m, c) => (c.confidence > m.confidence ? c : m), cands[0]) : undefined);
const out: string[] = []; const out2: string[] = [];
let nulls = 0, blank = 0, unconf = 0, byIndex = 0, kaikki = 0;
for (const f of fs.readdirSync(BIBLIA).filter((x) => x.endsWith('.json') && x !== 'SOURCES.json')) {
  const b = JSON.parse(fs.readFileSync(`${BIBLIA}/${f}`, 'utf8'));
  b.chapters.forEach((ch: any, ci: number) => {
    for (const v of ch.verses) {
      const text = String(v.t).normalize('NFC');
      const tokens = adapter.tokenize(text);
      const idx = tokens.map((x: any, i: number) => (x.isWord ? i : -1)).filter((i: number) => i >= 0);
      if (idx.length !== v.w.length) continue;
      const an = adapter.analyze(tokens);
      const text2 = strip(text);
      const tokens2 = adapter.tokenize(text2);
      const idx2 = tokens2.map((x: any, i: number) => (x.isWord ? i : -1)).filter((i: number) => i >= 0);
      const an2 = idx2.length === idx.length ? adapter.analyze(tokens2) : undefined;
      idx.forEach((ti: number, k: number) => {
        const c = pick(an[ti].candidates);
        if (!v.w[k]) {
          nulls++;
          if (!c) blank++; else if (c.unconfirmed) unconf++; else if (c.notes?.source === 'oshb') byIndex++; else kaikki++;
          out.push(`${f.replace('.json', '')} ${ci + 1}:${v.n}\t${tokens[ti].surface}\t${c ? `${c.lemma}/${c.pos} "${String(c.gloss ?? '').slice(0, 30)}" ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''} src=${c.notes?.source}${c.notes?.rule ? ' rule=' + c.notes.rule : ''}` : '∅ BLANK'}`);
        } else if (an2) {
          const c2 = pick(an2[idx2[k]].candidates);
          if (c2?.unconfirmed && !c?.unconfirmed) out2.push(`${f.replace('.json', '')} ${ci + 1}:${v.n}\t${tokens[ti].surface} [${[...tokens[ti].surface].map((x) => x.codePointAt(0)!.toString(16)).join(' ')}] key=${tokens[ti].normalized}\t→ stripped ${tokens2[idx2[k]].surface} key=${tokens2[idx2[k]].normalized}\t${c2.lemma} ${c2.notes?.rule ?? ''} ${c2.notes?.pointing ?? ''}`);
        }
      });
    }
  });
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/unaligned-out.txt', [`tokens with no source reading in the alignment: ${nulls}; card blank ${blank}; card unconfirmed guess ${unconf}; card reads it from the Tanakh index (the form occurs elsewhere) ${byIndex}; card reads it from Wiktionary / a rule ${kaikki}`, '', ...out].join('\n'));
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/accent-strip-out.txt', [`${out2.length} tokens`, ...out2].join('\n'));
console.log(`nulls ${nulls} blank ${blank} unconf ${unconf} index ${byIndex} other ${kaikki}; stripped-unconfirmed ${out2.length}`);
