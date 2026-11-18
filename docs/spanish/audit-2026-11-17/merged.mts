// The card's "All forms" table as the popup builds it: the adapter's generated cells merged with the Wiktionary (kaikki) table of dict/es/full.
// Part 1: chosen lemmas, every conflicted or rules-only cell. Part 2: every verb, noun and adjective of the word list, conflicts counted and listed.
import fs from 'node:fs';
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { buildParadigm, pickRecord } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/content/enrich';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
import { esLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/es';
registerAllAnalysers();
const rt = createPackRuntime(packFor('es')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const adapter = parserAdapter('es')!;
const key = (c: any) => Object.entries(c.features).map(([k, v]) => `${v}`).join('.');
async function table(lemma: string, pos: string) {
  let rec: any; let found = false;
  try { const e: any = await (rt as any).entry(lemma, pos, [lemma]); rec = pickRecord(e?.records, pos); found = !!rec; } catch { /* none */ }
  const p: any = buildParadigm(adapter as any, 'es', lemma, pos as any, rec);
  return { p, found, hasTable: !!rec?.f?.length };
}
const want: Array<[string, string]> = [['dar', 'VERB'], ['ir', 'VERB'], ['ver', 'VERB'], ['reír', 'VERB'], ['sonreír', 'VERB'], ['freír', 'VERB'], ['huir', 'VERB'], ['oír', 'VERB'], ['soler', 'VERB'], ['llover', 'VERB'], ['colar', 'VERB'], ['erguir', 'VERB'], ['rehacer', 'VERB'], ['hablar', 'VERB'], ['marrón', 'ADJ'], ['cortés', 'ADJ'], ['guay', 'ADJ'], ['taxi', 'NOUN'], ['espíritu', 'NOUN'], ['régimen', 'NOUN'], ['carácter', 'NOUN'], ['club', 'NOUN'], ['estudiante', 'NOUN']];
const out: string[] = [];
for (const [lemma, pos] of want) {
  const { p, found, hasTable } = await table(lemma, pos);
  if (!p) { out.push(`== ${lemma} ${pos}: NO TABLE (record ${found})`); continue; }
  const n: Record<string, number> = {}; for (const c of p.cells) n[c.status] = (n[c.status] ?? 0) + 1;
  out.push(`== ${lemma} ${pos}: record ${found}, dictionary table ${hasTable}; cells ${p.cells.length} ${JSON.stringify(n)}; sources ${p.sources.map((s: any) => s.label).join(' + ')}`);
  for (const c of p.cells) if (c.status === 'conflicted') out.push(`   CONFLICT ${key(c)}: shown ${c.form}; also ${(c.alternatives ?? []).join(', ')}`);
  const gen = p.cells.filter((c: any) => c.status === 'generated'); if (gen.length) out.push(`   rules only (${gen.length}): ` + gen.slice(0, 40).map((c: any) => `${key(c)}=${c.form}`).join(' | '));
  const sup = p.cells.filter((c: any) => c.status === 'supported'); if (sup.length) out.push(`   dictionary only (${sup.length}): ` + sup.slice(0, 25).map((c: any) => `${key(c)}=${c.form}`).join(' | '));
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/esaudit/out-merged-chosen.txt', out.join('\n'));
// part 2
const all: string[] = []; const tot = { lemmas: 0, noRecord: 0, noTable: 0, cells: 0, verified: 0, generated: 0, conflicted: 0, supported: 0 };
for (const e of esLexicon.entries as any[]) {
  if (!['VERB', 'AUX', 'NOUN', 'ADJ'].includes(e.pos)) continue;
  const pos = e.pos === 'AUX' ? 'VERB' : e.pos;
  const { p, found, hasTable } = await table(e.lemma, pos);
  tot.lemmas++; if (!found) tot.noRecord++; else if (!hasTable) tot.noTable++;
  if (!p) continue;
  for (const c of p.cells) { tot.cells++; (tot as any)[c.status]++; }
  const conf = p.cells.filter((c: any) => c.status === 'conflicted');
  if (conf.length) all.push(`${e.pos} ${e.lemma}: ` + conf.map((c: any) => `${key(c)} dict ${c.form} / rules ${(c.alternatives ?? []).join(',')}`).join(' ; '));
  if (!found) all.push(`${e.pos} ${e.lemma}: NO DICTIONARY RECORD`); else if (!hasTable && pos === 'VERB') all.push(`${e.pos} ${e.lemma}: record without a table`);
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/esaudit/out-merged-all.txt', JSON.stringify(tot) + '\n' + all.join('\n'));
console.log(JSON.stringify(tot));
