// The full dictionary record (Wiktionary, via kaikki) the pack runtime returns for a lemma: its forms table, romanisation and IPA.
// argv[2] = 'sample' prints chosen lemmas; 'count' counts how many lemmas of the word list have a record with a table / an IPA.
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';
import { hiLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hi';
registerAllAnalysers();
const rt = createPackRuntime(packFor('hi')!, { fetch: diskFetch(path.resolve('C:/Users/CJWal/dev/go-v0/public')), baseUrl: BASE });
const mode = process.argv[2] ?? 'sample';
if (mode === 'sample') {
  const want: Array<[string, string]> = [['क्रिया', 'NOUN'], ['दुनिया', 'NOUN'], ['चंद्रमा', 'NOUN'], ['ख़ुदा', 'NOUN'], ['सिनेमा', 'NOUN'], ['भाई', 'NOUN'], ['मिठाई', 'NOUN'], ['माँ', 'NOUN'], ['हार', 'NOUN'], ['ससुराल', 'NOUN'], ['मक्का', 'NOUN'], ['मई', 'NOUN'], ['गौरैया', 'NOUN'],
    ['करना', 'VERB'], ['जीना', 'VERB'], ['सकना', 'VERB'], ['हँसना', 'VERB'], ['फेंकना', 'VERB'], ['इकट्ठा', 'ADJ'], ['बढ़ई', 'NOUN'], ['यह', 'PRON'], ['वह', 'PRON'], ['ज्ञान', 'NOUN'], ['पहला', 'ADJ'], ['बहन', 'NOUN'], ['नींद', 'NOUN'], ['दुश्मनी', 'NOUN'], ['पत्र', 'NOUN'], ['कृपा', 'NOUN'], ['संतरा', 'NOUN'], ['वाक़ई', 'ADV'], ['असफल', 'ADJ']];
  for (const [lemma, pos] of want) {
    const e: any = await rt.entry(lemma, pos);
    if (!e) { console.log(`${lemma} ${pos}: NO RECORD`); continue; }
    for (const r of e.records.slice(0, 2)) {
      const keys = Object.keys(r);
      const forms = (r.forms ?? r.table ?? []) as any[];
      console.log(`${lemma} ${pos}: record pos=${r.pos} keys=${keys.join(',')}`);
      console.log('   rom/ipa: ' + JSON.stringify({ rom: r.romanization ?? r.rom, ipa: r.ipa ?? r.pronunciations }).slice(0, 300));
      console.log('   forms: ' + JSON.stringify(forms).slice(0, 700));
    }
  }
} else {
  let n = 0, rec = 0, tab = 0, ipa = 0; const noRec: string[] = [];
  const seen = new Set<string>();
  for (const en of hiLexicon.entries as any[]) {
    if (!['NOUN', 'VERB', 'ADJ'].includes(en.pos) || seen.has(en.lemma + en.pos)) continue; seen.add(en.lemma + en.pos);
    n++;
    const e: any = await rt.entry(en.lemma, en.pos);
    const r = e?.records?.[0];
    if (!r) { noRec.push(en.lemma); continue; }
    rec++;
    if ((r.forms ?? []).length > 1) tab++;
    if ((r.ipa ?? r.pronunciations ?? []).length) ipa++;
  }
  console.log(`nouns, verbs and adjectives of the word list: ${n}; with a dictionary record ${rec}; with a forms table ${tab}; with an IPA ${ipa}`);
  console.log('no record: ' + noRec.join(' '));
}
