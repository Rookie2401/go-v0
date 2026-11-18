// The card's "All forms" table for every word-list lexeme: the adapter's cells merged with Wiktionary's table (dict/sq/full),
// exactly as packages/golearn-extension/src/content/enrich.ts does it. Lists every cell where the two disagree.
import fs from 'node:fs';
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { buildParadigm, pickRecord } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/content/enrich';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
import { SQ_LEXEMES } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/albanian/morphology';
registerAllAnalysers();
const rt: any = createPackRuntime(packFor('sq')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const adapter: any = parserAdapter('sq');
const tot = { lex: 0, withRecord: 0, withTable: 0, verified: 0, conflicted: 0, generated: 0, supported: 0 };
const out: string[] = [];
const seen = new Set<string>();
for (const lex of SQ_LEXEMES) {
  if (!['NOUN', 'PROPN', 'VERB', 'ADJ'].includes(lex.pos)) continue;
  const k = `${lex.lemma}|${lex.pos}`; if (seen.has(k)) continue; seen.add(k);
  tot.lex++;
  const cite = lex.pos === 'ADJ' && lex.articulated ? `i ${lex.lemma}` : lex.lemma;
  let record: any;
  try { const e = await rt.entry(cite, lex.pos, [lex.lemma]); record = pickRecord(e?.records, lex.pos); } catch { /* none */ }
  if (record) tot.withRecord++;
  const p: any = buildParadigm(adapter, 'sq', cite, lex.pos as any, record);
  if (!p) continue;
  const hasTable = p.cells.some((c: any) => c.sources.includes('wiktionary'));
  if (hasTable) tot.withTable++;
  const conf: string[] = [];
  for (const c of p.cells) {
    (tot as any)[c.status]++;
    if (c.status === 'conflicted') conf.push(`${Object.values(c.features).join('.')}: rules ${(c.alternatives ?? []).join('/')} ≠ Wiktionary ${c.form}`);
  }
  if (conf.length) out.push(`${cite} (${lex.pos}${record?.p && record.p !== lex.pos ? `, record is ${record.p}` : ''}): ${conf.join(' | ')}`);
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/sqaudit/merge-conflicts.txt', out.join('\n'));
console.log(JSON.stringify(tot), 'lexemes with a conflict:', out.length);
