// Rules-only cells (no second source) by part of speech, after the merge with the Wiktionary tables.
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
const key = (c: any) => Object.values(c.features).join('.');
const by: Record<string, any> = {}; const verbGen: string[] = []; const adjNone: string[] = []; const nounSup: string[] = [];
for (const e of esLexicon.entries as any[]) {
  if (!['VERB', 'AUX', 'NOUN', 'ADJ'].includes(e.pos)) continue;
  const pos = e.pos === 'AUX' ? 'VERB' : e.pos;
  let rec: any; try { const r: any = await (rt as any).entry(e.lemma, pos, [e.lemma]); rec = pickRecord(r?.records, pos); } catch { /* none */ }
  const p: any = buildParadigm(adapter as any, 'es', e.lemma, pos as any, rec);
  if (!p) continue;
  const b = (by[pos] ??= { lemmas: 0, cells: 0, verified: 0, generated: 0, conflicted: 0, supported: 0, lemmasNoVerified: 0 });
  b.lemmas++; let v = 0;
  for (const c of p.cells) { b.cells++; b[c.status]++; if (c.status === 'verified') v++; }
  if (!v) { b.lemmasNoVerified++; if (pos === 'ADJ') adjNone.push(e.lemma); }
  if (pos === 'VERB') { const g = p.cells.filter((c: any) => c.status === 'generated'); if (g.length) verbGen.push(`${e.lemma}: ` + g.map((c: any) => `${key(c)}=${c.form}`).join(' | ')); }
  if (pos === 'NOUN') { const s = p.cells.filter((c: any) => c.status === 'supported'); if (s.length) nounSup.push(`${e.lemma}: ` + s.map((c: any) => `${key(c)}=${c.form}`).join(' | ')); }
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/esaudit/out-merged-rulesonly.txt', JSON.stringify(by, null, 1) + '\n-- verbs, rules-only cells\n' + verbGen.join('\n') + '\n-- adjectives with no verified cell\n' + adjNone.join(' ') + '\n-- nouns, dictionary-only cells\n' + nounSup.join('\n'));
console.log(JSON.stringify(by));
