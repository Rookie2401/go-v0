// Every lexicon noun, verb and adjective: the card's merged "All forms" table (generated cells + the dictionary's table), and where the two disagree.
import path from 'node:path';
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { buildParadigm, pickRecord } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/content/enrich';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
import { lexiconFor } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/norwegian/lexicon';
registerAllAnalysers();
const out: string[] = [];
for (const std of ['nb', 'nn'] as const) {
  const rt = createPackRuntime(packFor(std)!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
  const adapter: any = parserAdapter(std)!;
  const lex = lexiconFor(std);
  const groups: Array<[string, string[]]> = [['VERB', lex.verbs.map((v: any) => v.lemma)], ['NOUN', lex.nouns.filter((n: any) => !n.proper).map((n: any) => n.lemma)], ['ADJ', lex.adjectives.map((a: any) => a.lemma)]];
  for (const [pos, lemmas] of groups) {
    let noRecord = 0, noTable = 0, withTable = 0, cells = 0, verified = 0, conflicted = 0, generatedOnly = 0, supported = 0, lemmasWithConflict = 0;
    for (const lemma of [...new Set(lemmas)]) {
      let reply: any;
      try { reply = await rt.entry(lemma, pos, [lemma]); } catch { reply = undefined; }
      const record: any = pickRecord(reply?.records ?? [], pos);
      if (!record) { noRecord++; continue; }
      if (!record.f?.length) { noTable++; continue; }
      const p: any = buildParadigm(adapter, std, lemma, pos as any, record);
      if (!p) { noTable++; continue; }
      withTable++;
      const bad: string[] = [];
      for (const c of p.cells) {
        cells++;
        if (c.status === 'verified') verified++;
        else if (c.status === 'conflicted') { conflicted++; bad.push(`${Object.values(c.features).join('.')}: rules «${(c.alternatives ?? []).join(' / ')}» vs dictionary «${c.form}»`); }
        else if (c.status === 'generated') generatedOnly++;
        else supported++;
      }
      if (bad.length) { lemmasWithConflict++; out.push(`${std} ${pos} ${lemma} (record pos ${record.p}): ${bad.join(' ; ')}`); }
    }
    console.log(`${std} ${pos}: ${new Set(lemmas).size} lemmas; no dictionary record ${noRecord}; record without a table ${noTable}; merged ${withTable}; cells ${cells}: verified ${verified}, CONFLICT ${conflicted} (in ${lemmasWithConflict} lemmas), rules only ${generatedOnly}, dictionary only ${supported}`);
  }
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/nbaudit/conflicts.txt', out.join('\n'));
