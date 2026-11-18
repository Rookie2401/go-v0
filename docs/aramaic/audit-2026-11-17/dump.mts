// Dump of the Aramaic seed: (1) every lexical entry (headword, gloss, POS as decoded, frequency, forms count), (2) every distinct
// reading (normalised surface, code, lemma chain) with its count and first reference, (3) forms with more than one reading.
import fs from 'node:fs';
import { ARAMAIC_SEED } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/aramaic/seed';
import { decodeOshb } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/oshb';
import { heNormalize, consonantal } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/text';
const OUT = 'C:/Users/CJWal/dev/tmp-mem/arcaudit/';
// 1 lexicon
const lex = new Map<string, { head: string; gloss: string; status: string; pos: Set<string>; n: number; forms: Set<string>; first: string; codes: Set<string> }>();
for (const r of ARAMAIC_SEED) {
  const id = r.lemmaId.split('/').pop()!;
  const d = decodeOshb(r.lemmaId, r.morph);
  const e = lex.get(id) ?? { head: r.lemma, gloss: r.gloss, status: r.glossStatus, pos: new Set(), n: 0, forms: new Set(), first: r.reference, codes: new Set() };
  e.pos.add(d.pos); e.n++; e.forms.add(heNormalize(r.surface)); e.codes.add(r.morph.slice(1).split('/')[d.mainIndex] ?? '');
  lex.set(id, e);
}
const lexLines = [...lex.entries()].sort((a, b) => a[1].head.localeCompare(b[1].head, 'he')).map(([id, e]) => `${id}\t${e.head}\t${[...e.pos].join(',')}\t${e.n}\t${e.gloss}\t${e.status}\t${e.first}`);
fs.writeFileSync(OUT + 'lexicon.tsv', lexLines.join('\n') + '\n', 'utf8');
// 2 distinct readings
const dist = new Map<string, { surface: string; code: string; chain: string; lemma: string; gloss: string; n: number; first: string; seg: string }>();
for (const r of ARAMAIC_SEED) {
  const k = `${heNormalize(r.surface)}|${r.morph}|${r.lemmaId}`;
  const e = dist.get(k) ?? { surface: heNormalize(r.surface), code: r.morph, chain: r.lemmaId, lemma: r.lemma, gloss: r.gloss, n: 0, first: r.reference, seg: r.seg };
  e.n++; dist.set(k, e);
}
fs.writeFileSync(OUT + 'distinct.tsv', [...dist.values()].map((e) => `${e.surface}\t${e.code}\t${e.chain}\t${e.lemma}\t${e.n}\t${e.first}\t${e.seg}\t${e.gloss.slice(0, 40)}`).join('\n') + '\n', 'utf8');
// 3 ambiguous pointed forms
const byForm = new Map<string, typeof dist extends Map<string, infer V> ? V[] : never>();
for (const e of dist.values()) { const a = byForm.get(e.surface) ?? []; a.push(e); byForm.set(e.surface, a); }
const amb = [...byForm.entries()].filter(([, a]) => a.length > 1);
fs.writeFileSync(OUT + 'ambiguous.tsv', amb.map(([f, a]) => `${f}\t` + a.map((e) => `${e.code} ${e.chain} ${e.lemma} ×${e.n} (${e.first})`).join('\t')).join('\n') + '\n', 'utf8');
// 4 verbs by lemma: stems and forms
const verbs = new Map<string, Map<string, Set<string>>>();
for (const r of ARAMAIC_SEED) {
  const d = decodeOshb(r.lemmaId, r.morph);
  if (d.pos !== 'VERB') continue;
  const id = `${r.lemma} (${r.lemmaId.split('/').pop()}) ${r.gloss.slice(0, 30)}`;
  const m = verbs.get(id) ?? new Map(); const main = r.morph.slice(1).split('/').slice(d.mainIndex).join('/');
  const s = m.get(main) ?? new Set(); s.add(heNormalize(r.surface)); m.set(main, s); verbs.set(id, m);
}
fs.writeFileSync(OUT + 'verbs.tsv', [...verbs.entries()].sort((a, b) => a[0].localeCompare(b[0], 'he')).map(([id, m]) => `${id}\n` + [...m.entries()].sort().map(([c, s]) => `   ${c}: ${[...s].join(' , ')}`).join('\n')).join('\n') + '\n', 'utf8');
const tokensDistinctForms = new Set(ARAMAIC_SEED.map((r) => heNormalize(r.surface))).size;
const skel = new Set(ARAMAIC_SEED.map((r) => consonantal(heNormalize(r.surface)))).size;
console.log({ lexemes: lex.size, distinctReadings: dist.size, distinctPointedForms: tokensDistinctForms, distinctSkeletons: skel, ambiguousForms: amb.length, verbLemmas: verbs.size });
const codeCount: Record<string, number> = {};
for (const r of ARAMAIC_SEED) { const d = decodeOshb(r.lemmaId, r.morph); const main = r.morph.slice(1).split('/')[d.mainIndex]; if (main[0] === 'V') { const k = main.slice(1, 3); codeCount[k] = (codeCount[k] ?? 0) + 1; } }
console.log('verb stem+type counts', JSON.stringify(codeCount));
const posCount: Record<string, number> = {};
for (const r of ARAMAIC_SEED) { const d = decodeOshb(r.lemmaId, r.morph); posCount[d.pos] = (posCount[d.pos] ?? 0) + 1; }
console.log('pos counts', JSON.stringify(posCount));
