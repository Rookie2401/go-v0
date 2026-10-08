/// <reference types="node" />
// Authoring tool: per-unit new lemmas (from the authoring files), their forms, and what recycling still needs.
// Usage: npx vite-node data/ladder/de/authoring/inspect.mts -- <out.json>
import fs from 'node:fs';
import { analyse, authoringOrder, docOf, headDocs } from './lib';
const out = process.argv.slice(2).filter((a) => a !== '--')[0] ?? 'inspect.json';
const order = authoringOrder();
const seen = new Map<string, number>();
for (const h of headDocs()) for (const [l, i] of analyse(h).lem) seen.set(l, (seen.get(l) ?? 0) + i.count);
const stats = order.map((u) => (u.kind === 'authentic' || u.sections.length ? analyse(docOf(u)) : undefined));
const fresh: string[][] = [];
const sn = new Map(seen);
order.forEach((_, i) => {
  const a = stats[i]; const f: string[] = [];
  if (a) { for (const l of a.lem.keys()) if (!sn.has(l)) f.push(l); for (const [l, x] of a.lem) sn.set(l, (sn.get(l) ?? 0) + x.count); }
  fresh.push(f);
});
const res = order.map((u, i) => {
  const a = stats[i];
  const lemmas = fresh[i].map((l) => {
    const later: number[] = [];
    for (let j = i + 1; j < stats.length; j++) later.push(stats[j]?.lem.get(l)?.count ?? 0);
    const w6 = later.slice(0, 6).reduce((x, y) => x + y, 0);
    const info = a!.lem.get(l)!;
    return { lemma: l, own: info.count, forms: info.forms, w6, total: later.reduce((x, y) => x + y, 0), first: info.first };
  });
  return { id: u.id, stage: u.stage, kind: u.kind, words: a?.words ?? 0, lemmas };
});
fs.writeFileSync(out, JSON.stringify(res));
const judged = res.filter((r, i) => i + 6 < res.length && r.words > 0);
let fail = 0, orph = 0, tot = 0, warnU = 0, orU = 0;
for (const r of judged) { let f = 0, o = 0; for (const l of r.lemmas) { tot++; if (l.w6 < 3) { fail++; f++; } if (l.total === 0) { orph++; o++; } } if (r.lemmas.length && f / r.lemmas.length > 0.25) warnU++; if (r.lemmas.length && o / r.lemmas.length > 0.15) orU++; }
console.log(`units ${res.length}; judged ${judged.length}; new lemmas ${tot}; <3 in next 6: ${fail}; orphans: ${orph} (${(orph * 100 / tot).toFixed(1)} %); recycling-warning units: ${warnU}; orphan-warning units: ${orU}`);
