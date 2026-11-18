import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { buildParadigm, pickRecord } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/content/enrich';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
registerAllAnalysers();
const rt: any = createPackRuntime(packFor('sq')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const adapter: any = parserAdapter('sq');
for (const arg of process.argv.slice(2)) {
  const [lemma, pos] = arg.split('/');
  const e = await rt.entry(lemma, pos, [lemma.replace(/^i /, '')]);
  const record: any = pickRecord(e?.records, pos);
  const p: any = buildParadigm(adapter, 'sq', lemma, pos as any, record);
  console.log(`\n== ${lemma} ${pos}: record ${record ? `${record.w ?? ''} ${record.p} rows ${(record.f ?? []).length}` : 'NONE'}; status ${p?.status}; sources ${(p?.sources ?? []).map((s: any) => s.id).join(', ')}`);
  if (!p) continue;
  const want = process.env.FILTER ? new RegExp(process.env.FILTER) : null;
  console.log(p.cells.filter((c: any) => !want || want.test(Object.values(c.features).join('.'))).map((c: any) => `${Object.values(c.features).join('.').replace('.Fin', '')}=${c.form}${c.alternatives ? `(alt ${c.alternatives.join('/')})` : ''}[${c.status[0]}]`).join(' | ').slice(0, 3000));
}
