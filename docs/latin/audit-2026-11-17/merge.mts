// The "All forms" table as the card builds it: the adapter's generated cells merged with the Wiktionary table of the built dictionary
// (packages/golearn-extension/src/content/enrich.ts buildParadigm). Prints the count per status and every conflicted cell.
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
import { buildParadigm, pickRecord } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/content/enrich';
import { paradigmSummary } from 'C:/Users/CJWal/dev/go-v0-rc/src/core/paradigm';
import { loadLatinLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/lexicon-load';
registerAllAnalysers();
await loadLatinLexicon();
const rt: any = createPackRuntime(packFor('la')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const adapter = parserAdapter('la')!;
const tot = { verified: 0, supported: 0, generated: 0, conflicted: 0 } as Record<string, number>;
let withRecord = 0, n = 0;
for (const arg of process.argv.slice(2)) {
  const [lemma, pos] = arg.split(':');
  n++;
  const e = await rt.entry(lemma, pos, [lemma]);
  const rec = pickRecord(e?.records, pos);
  if (rec) withRecord++;
  const p: any = buildParadigm(adapter as any, 'la', lemma, pos as any, rec as any);
  if (!p) { console.log(`${lemma} ${pos}: NO TABLE (record ${rec ? 'yes' : 'no'})`); continue; }
  const s = paradigmSummary(p);
  for (const k of Object.keys(tot)) tot[k] += (s as any)[k] ?? 0;
  const conf = p.cells.filter((c: any) => c.status === 'conflicted').map((c: any) => `${Object.values(c.features).join('.')}: shown ${c.form}, rules gave ${(c.alternatives ?? []).join('/')}`);
  const gen = p.cells.filter((c: any) => c.status === 'generated').map((c: any) => c.form);
  console.log(`${lemma} ${pos}: record ${rec ? 'yes' : 'NO'}; ${JSON.stringify(s)}\n   conflicted: ${conf.slice(0, 12).join(' | ')}${conf.length > 12 ? ` … (+${conf.length - 12})` : ''}\n   rules only (no dictionary cell): ${gen.slice(0, 24).join(' ')}${gen.length > 24 ? ` … (+${gen.length - 24})` : ''}`);
}
console.log(`\nTOTAL over ${n} lemmas (${withRecord} with a dictionary record): ${JSON.stringify(tot)}`);
