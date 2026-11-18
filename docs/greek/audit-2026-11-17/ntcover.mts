// Every word form of the New Testament (the full MorphGNT index: 18,056 forms, 137,554 tokens) read context-free in the EXTENSION state:
// compiled Koine core + the whole Ancient and Modern indexes (every shard at once) and NOT the full Koine index. The reading taken is the card's
// (highest confidence, ties in the analyser's order). Compared with MorphGNT's own commonest reading of that form. Token-weighted by MorphGNT's counts.
// run with NODE_OPTIONS=--max-old-space-size=9000
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { installGreekIndex } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/index-store';
import { elCandidates } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/analyze';
import { decodeMorphGnt } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/morphgnt';
import { describeElMorph } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/describe';
registerAllAnalysers();
const P = 'C:/Users/CJWal/dev/go-v0/public/lexicon/el/';
const koine = JSON.parse(fs.readFileSync(P + 'koine-index.json', 'utf8'));
installGreekIndex(JSON.parse(fs.readFileSync(P + 'ancient-index.json', 'utf8')));
installGreekIndex(JSON.parse(fs.readFileSync(P + 'modern-index.json', 'utf8')));
const bareLen = (s: string) => s.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');
const T = { forms: 0, tokens: 0, none: [0, 0], core: [0, 0], coreOtherReading: [0, 0], otherSame: [0, 0], otherDiff: [0, 0], low: [0, 0] } as any;
const add = (k: string, n: number) => { T[k][0]++; T[k][1] += n; };
const diff: Array<[number, string]> = []; const none: Array<[number, string]> = []; const sameMorphDiff: Array<[number, string]> = [];
for (const [form, rows] of Object.entries(koine.forms) as Array<[string, Array<[string, string, number]>]>) {
  const n = rows.reduce((s, r) => s + r[2], 0);
  const top = [...rows].sort((a, b) => b[2] - a[2])[0];
  const goldLemma = koine.lemmas[top[0]]?.[0] ?? top[0];
  const gold = decodeMorphGnt(top[1], top[0]);
  T.forms++; T.tokens += n;
  const cs = elCandidates({ surface: form, start: 0, end: form.length, isWord: true, normalized: form } as any);
  if (!cs.length) { add('none', n); none.push([n, `${form} (${goldLemma})`]); continue; }
  const best = cs.reduce((m, c) => (c.confidence > m.confidence ? c : m), cs[0]);
  if (best.confidence < 0.5) add('low', n);
  if (best.sourceId === 'morphgnt-sblgnt') { add('core', n); if (best.notes?.code !== top[1] || best.notes?.lemmaId !== top[0]) add('coreOtherReading', n); continue; }
  if (bareLen(best.lemma ?? '') === goldLemma) {
    add('otherSame', n);
    const a = describeElMorph(best.morph ?? {}, best.pos); const b = describeElMorph(gold.morph, gold.pos);
    if (a !== b) sameMorphDiff.push([n, `${form}: card "${a}" / MorphGNT "${b}"`]);
  } else { add('otherDiff', n); diff.push([n, `${form}: card ${best.lemma}/${best.pos} “${(best.gloss ?? '').slice(0, 30)}” [${best.notes?.source}] / MorphGNT ${goldLemma} “${(koine.lemmas[top[0]]?.[1] ?? '').slice(0, 30)}”`]); }
}
const pct = (x: number, d: number) => `${x} (${(100 * x / d).toFixed(1)} %)`;
console.log(`New Testament forms ${T.forms}, tokens ${T.tokens}`);
for (const [k, label] of [['core', 'read from the compiled core (MorphGNT)'], ['coreOtherReading', '  … of these, the reading shown is not MorphGNT’s commonest reading of the form (context-free)'], ['none', 'no reading at all (blank card)'], ['otherSame', 'read from the Wiktionary tables, same lemma as MorphGNT'], ['otherDiff', 'read from the Wiktionary tables with ANOTHER lemma than MorphGNT’s'], ['low', 'reading shown has confidence under 0.5 (no lemma credit)']] as const) console.log(`  ${label}: forms ${pct(T[k][0], T.forms)}, tokens ${pct(T[k][1], T.tokens)}`);
console.log(`  same lemma but a different form line: ${sameMorphDiff.length} forms, ${sameMorphDiff.reduce((s, x) => s + x[0], 0)} tokens`);
const w = (name: string, list: Array<[number, string]>) => fs.writeFileSync(`C:/Users/CJWal/dev/tmp-mem/elaudit/${name}`, list.sort((a, b) => b[0] - a[0]).map(([n, s]) => `${n}\t${s}`).join('\n'));
w('ntcover-blank.txt', none); w('ntcover-other-lemma.txt', diff); w('ntcover-other-formline.txt', sameMorphDiff);
