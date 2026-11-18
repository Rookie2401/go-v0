// Coverage of running text: every word of each line ("lang | text") is put through the card parser in its sentence.
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
registerAllAnalysers();
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const tot: Record<string, { n: number; none: number; name: number; unconf: number; noneList: string[]; nameList: string[]; unconfList: string[] }> = {};
for (const line of lines) {
  const bar = line.indexOf('|');
  const lang = line.slice(0, bar).trim();
  const text = line.slice(bar + 1).trim();
  const t = (tot[lang] ??= { n: 0, none: 0, name: 0, unconf: 0, noneList: [], nameList: [], unconfList: [] });
  // sentences: split on . ! ? followed by space
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  let out = '';
  for (const s0 of sentences) {
    const s = s0.trim();
    const re = /[\p{L}][\p{L}'’-]*/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const word = m[0];
      let c: any;
      try { c = parseSelection({ surface: word, languageId: lang, context: { kind: 'sentence', confidence: 0.9, sentence: s, selStart: m.index, selEnd: m.index + word.length } }); } catch { c = {}; }
      t.n++;
      if (!c.lemma) { t.none++; t.noneList.push(word); out += ` ${word}=∅`; }
      else if (c.pos === 'PROPN' && c.unconfirmed) { t.name++; t.nameList.push(word); out += ` ${word}=NAME?`; }
      else if (c.unconfirmed) { t.unconf++; t.unconfList.push(`${word}→${c.lemma}`); out += ` ${word}=${c.lemma}?/${c.pos}`; }
      else out += ` ${word}=${c.lemma}/${c.pos}${c.morphology ? `[${String(c.morphology).replace(/feminine or masculine or neuter/g, 'fmn').replace(/feminine or masculine/g, 'fm').replace(/singular/g, 'sg').replace(/plural/g, 'pl').replace(/indefinite/g, 'indef').replace(/definite/g, 'def').replace(/present tense/g, 'pres').replace(/past tense/g, 'past').replace(/perfect participle/g, 'ptcp').replace(/infinitive/g, 'inf')}]` : ''}`;
    }
    out += '\n';
  }
  if (process.argv[3] === 'full') console.log(out);
}
for (const [lang, t] of Object.entries(tot)) {
  console.log(`\n== ${lang}: ${t.n} words; no reading ${t.none} (${(100 * t.none / t.n).toFixed(1)} %); called a name ${t.name} (${(100 * t.name / t.n).toFixed(1)} %); compound guess ${t.unconf} (${(100 * t.unconf / t.n).toFixed(1)} %); with a confirmed reading ${(100 * (t.n - t.none - t.name - t.unconf) / t.n).toFixed(1)} %`);
  console.log('no reading: ' + [...new Set(t.noneList)].join(' '));
  console.log('called a name: ' + [...new Set(t.nameList)].join(' '));
  console.log('compound guess: ' + [...new Set(t.unconfList)].join(' '));
}
