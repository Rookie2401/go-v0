// Coverage of running Hindi text: every word of each line ("hi | text") is put through the card parser in its sentence.
// Words are found with the ADAPTER'S OWN tokeniser (Intl.Segmenter('hi')), so matras, nukta, virama, anusvara and chandrabindu stay inside the word.
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { hiAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hi';
registerAllAnalysers();
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const tot: Record<string, { n: number; none: number; name: number; unconf: number; noneList: string[]; nameList: string[]; unconfList: string[] }> = {};
const short = (m: string) => m.replace(/masculine/g, 'm').replace(/feminine/g, 'f').replace(/singular/g, 'sg').replace(/plural/g, 'pl').replace(/imperfective participle/g, 'IPFV').replace(/perfective participle/g, 'PFV').replace(/direct/g, 'dir').replace(/oblique/g, 'obl').replace(/bare stem \(before a second verb\)/g, 'STEM').replace(/third person/g, '3').replace(/first person/g, '1').replace(/second person/g, '2').replace(/subjunctive/g, 'SUBJ').replace(/infinitive/g, 'INF').replace(/does not change/g, 'inv').replace(/demonstrative/g, 'dem').replace(/possessive of the/g, 'poss');
for (const line of lines) {
  const bar = line.indexOf('|');
  const lang = line.slice(0, bar).trim();
  const text = line.slice(bar + 1).trim();
  const t = (tot[lang] ??= { n: 0, none: 0, name: 0, unconf: 0, noneList: [], nameList: [], unconfList: [] });
  // sentences: split on danda, . ! ? followed by space
  const sentences = text.match(/[^.!?।]+[.!?।]*\s*/g) ?? [text];
  let out = '';
  for (const s0 of sentences) {
    const s = s0.trim();
    if (!s) continue;
    for (const tk of (hiAdapter.tokenize(s) as any[]).filter((x) => x.isWord)) {
      const word: string = tk.surface;
      let c: any;
      try { c = parseSelection({ surface: word, languageId: lang, context: { kind: 'sentence', confidence: 0.9, sentence: s, selStart: tk.start, selEnd: tk.end } }); } catch { c = {}; }
      t.n++;
      if (!c.lemma) { t.none++; t.noneList.push(word); out += ` ${word}=∅`; }
      else if (c.pos === 'PROPN' && c.unconfirmed) { t.name++; t.nameList.push(word); out += ` ${word}=NAME?`; }
      else if (c.unconfirmed) { t.unconf++; t.unconfList.push(`${word}→${c.lemma}/${c.pos}`); out += ` ${word}=${c.lemma}?/${c.pos}`; }
      else out += ` ${word}=${c.lemma}/${c.pos}${c.morphology ? `[${short(String(c.morphology))}]` : ''}{${String(c.gloss ?? '').slice(0, 22)}}`;
    }
    out += '\n';
  }
  if (process.argv[3] === 'full') console.log(out);
}
for (const [lang, t] of Object.entries(tot)) {
  console.log(`\n== ${lang}: ${t.n} words; no reading ${t.none} (${(100 * t.none / t.n).toFixed(1)} %); called a name ${t.name} (${(100 * t.name / t.n).toFixed(1)} %); unconfirmed guess ${t.unconf} (${(100 * t.unconf / t.n).toFixed(1)} %); with a confirmed reading ${t.n - t.none - t.name - t.unconf} (${(100 * (t.n - t.none - t.name - t.unconf) / t.n).toFixed(1)} %)`);
  console.log('no reading: ' + [...new Set(t.noneList)].join(' '));
  console.log('called a name: ' + [...new Set(t.nameList)].join(' '));
  console.log('unconfirmed guess: ' + [...new Set(t.unconfList)].join(' '));
}
