/// <reference types="node" />
// Authoring tool: words of the ladder (all units, authored text + bridge library texts) whose first reading is unconfirmed / absent, by frequency.
import { authoringOrder, adapter, docOf, documentSentences } from './lib';
import { isNameGuess } from '../../../../src/ladder/analyse';
const only = process.argv.slice(2).filter((a) => a !== '--');
const order = authoringOrder();
const cnt = new Map<string, { n: number; units: Set<string>; lemma: string; ex: string; pos?: string; unconf: boolean }>();
for (const u of order) {
  if (only.length && !only.includes(u.kind)) continue;
  if (u.kind === 'controlled' && !u.sections.length) continue;
  const doc = docOf(u);
  for (const s of documentSentences(adapter, doc)) {
    for (const x of adapter.analyze(adapter.tokenize(s))) {
      if (!x.token.isWord) continue;
      const c: any = x.candidates[0];
      const unconf = !c || c.unconfirmed === true;
      if (!unconf) continue;
      if (c?.pos === 'PROPN' && !isNameGuess(c)) continue;
      const k = x.token.normalized.toLowerCase();
      const e = cnt.get(k) ?? { n: 0, units: new Set(), lemma: c?.lemma ?? '(none)', ex: s, pos: c?.pos, unconf };
      e.n++; e.units.add(u.id); cnt.set(k, e);
    }
  }
}
const rows = [...cnt.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(rows.length, 'distinct unconfirmed forms');
for (const [k, e] of rows.slice(0, 400)) console.log(`${e.n}\t${k}\t->${e.lemma}/${e.pos ?? '-'}\t${[...e.units].slice(0, 3).join(',')}`);
