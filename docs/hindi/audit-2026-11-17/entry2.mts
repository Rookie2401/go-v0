// Raw full dictionary records (the project's own bundled Wiktionary extract) for words whose romanisation, gender or forms this audit questions.
import path from 'node:path';
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
registerAllAnalysers();
const rt = createPackRuntime(packFor('hi')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const words = fs.readFileSync(process.argv[2]!, 'utf8').split(/\s+/).filter(Boolean);
for (const w of words) {
  const e: any = await rt.entry(w);
  if (!e) { console.log(`${w}: NO RECORD`); continue; }
  const lines = e.records.slice(0, 3).map((r: any) => {
    const forms = (r.f ?? []).map((x: any) => (Array.isArray(x) ? `${x[0]}${x[3] ? `(${x[3]})` : ''}` : String(x))).slice(0, 9).join(' ');
    const ipa = (r.ipa ?? []).map((x: any) => x.i).slice(0, 3).join(' ');
    const head = JSON.stringify(r.h ?? r.head ?? r.g ?? '').slice(0, 80);
    return `[${r.p}] rom=${r.rom ?? ''} ipa=${ipa} tpl=${(r.tpl ?? []).join(',')} head=${head} forms=${forms} sense=${(r.s?.[0]?.g ?? '').slice(0, 40)}`;
  });
  console.log(`${w}: ${lines.join('  ||  ')}`);
}
