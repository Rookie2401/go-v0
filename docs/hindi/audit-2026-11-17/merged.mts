// The "All forms" table AS THE CARD BUILDS IT for Hindi: the adapter's generated cells merged with the bundled dictionary's
// table (Wiktionary, via kaikki) by the extension's own buildParadigm. Prints every cell on which the two sources disagree,
// and the totals per status. argv[2] = 'all' (whole word list) or a file of "lemma POS" lines.
import path from 'node:path';
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
import { buildParadigm, pickRecord } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/content/enrich';
import { hiAdapter, hiLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hi';
registerAllAnalysers();
const rt = createPackRuntime(packFor('hi')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const arg = process.argv[2] ?? 'all';
let list: Array<[string, string]>;
if (arg === 'all') { const seen = new Set<string>(); list = []; for (const e of hiLexicon.entries as any[]) { const k = `${e.lemma}|${e.pos}`; if (seen.has(k) || !['NOUN', 'VERB', 'AUX', 'ADJ'].includes(e.pos)) continue; seen.add(k); list.push([e.lemma, e.pos]); } }
else list = fs.readFileSync(arg, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).filter((x) => x.length === 2) as Array<[string, string]>;
const tot = { lemmas: 0, noRecord: 0, noTable: 0, verified: 0, supported: 0, generated: 0, conflicted: 0 };
const conflicts: string[] = [], genderConflicts: string[] = [], noTableList: string[] = [];
for (const [lemma, pos] of list) {
  tot.lemmas++;
  const e: any = await rt.entry(lemma, pos === 'AUX' ? 'VERB' : pos);
  const rec: any = e ? pickRecord(e.records, pos === 'AUX' ? 'VERB' : pos) : undefined;
  if (!rec) tot.noRecord++;
  let p: any;
  try { p = buildParadigm(hiAdapter as any, 'hi', lemma, pos as any, rec && rec.p === (pos === 'AUX' ? 'VERB' : pos) ? rec : undefined); } catch (err) { console.log(`${lemma} THROW ${(err as Error).message}`); continue; }
  if (!p) continue;
  const hasTable = p.cells.some((c: any) => c.sources.includes('wiktionary'));
  if (rec && !hasTable) { tot.noTable++; noTableList.push(lemma); }
  const bad: string[] = [];
  for (const c of p.cells) {
    (tot as any)[c.status]++;
    if (c.status === 'conflicted') bad.push(`${Object.values(c.features).join('.')}: dictionary ${c.form} / rules ${(c.alternatives ?? []).join(',')}`);
  }
  if (bad.length) conflicts.push(`${lemma} ${pos} :: ${bad.join(' ; ')}`);
  if (arg !== 'all') console.log(`== ${lemma} ${pos} (${p.status}; record ${rec ? 'yes' : 'no'}; dictionary table ${hasTable ? 'yes' : 'no'})\n   ${p.cells.map((c: any) => `${Object.values(c.features).join('.')}=${c.form}${c.alternatives?.length ? `{also ${c.alternatives.join(',')}}` : ''}[${c.status[0]}]`).join(' | ').slice(0, 1800)}`);
}
console.log(JSON.stringify(tot));
console.log(`lemmas with a conflict: ${conflicts.length}`);
console.log(conflicts.join('\n'));
if (arg === 'all') console.log('RECORD BUT NO TABLE CELLS MERGED: ' + noTableList.join(' '));
