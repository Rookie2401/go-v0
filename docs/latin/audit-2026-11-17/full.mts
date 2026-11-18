// Does the built Latin dictionary hold a full record (inflection table) for a lemma, and which forms does it give for chosen cells?
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
registerAllAnalysers();
const rt: any = createPackRuntime(packFor('la')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
for (const arg of process.argv.slice(2)) {
  const [lemma, pos, ...want] = arg.split(':');
  const e = await rt.entry(lemma, pos, [lemma]);
  if (!e) { console.log(`${lemma} ${pos}: NO FULL RECORD`); continue; }
  for (const r of e.records.slice(0, 2)) {
    const forms: any[] = (r.f ?? []).map((x: any) => Array.isArray(x) ? { form: x[0], tags: x[1] ?? [] } : { form: x.f ?? x.form, tags: x.t ?? x.tags ?? [] });
    if (process.argv.includes("raw")) console.log(JSON.stringify(r.f).slice(0, 300));
    console.log(`${lemma} ${pos}: record keys ${Object.keys(r).join(',')}; forms ${forms.length}`);
    const hit = forms.filter((f: any) => want.length === 0 || want.every((w) => (f.tags ?? []).includes(w)));
    console.log('   ' + hit.slice(0, 14).map((f: any) => `${f.form}[${(f.tags ?? []).join(' ')}]`).join(' | '));
  }
}
