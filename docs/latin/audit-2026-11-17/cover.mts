// Coverage of running text: every word of each line ("la/label | text") is put through the card parser in its sentence. Totals per label.
// Adapted from audit-examples/cover.mts: awaits the full Latin lexicon (as the extension chunk does), abbreviates the Latin form line.
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { loadLatinLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/lexicon-load';
registerAllAnalysers();
if (!process.argv.includes('seed')) await loadLatinLexicon();
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
type T = { n: number; none: number; name: number; unconf: number; alt: number; union: number; noneList: string[]; nameList: string[]; unconfList: string[] };
const tot: Record<string, T> = {};
const ab = (s: string) => s.replace(/feminine or masculine or neuter/g, 'fmn').replace(/masculine or neuter/g, 'mn').replace(/feminine or masculine/g, 'fm').replace(/nominative/g, 'N').replace(/accusative/g, 'A').replace(/genitive/g, 'G').replace(/dative/g, 'D').replace(/ablative/g, 'Ab').replace(/vocative/g, 'V').replace(/locative/g, 'L').replace(/singular/g, 'sg').replace(/plural/g, 'pl').replace(/masculine/g, 'm').replace(/feminine/g, 'f').replace(/neuter/g, 'n').replace(/third person/g, '3').replace(/second person/g, '2').replace(/first person/g, '1').replace(/indicative/g, 'ind').replace(/subjunctive/g, 'sub').replace(/imperative/g, 'imp').replace(/present/g, 'pres').replace(/imperfect/g, 'impf').replace(/pluperfect/g, 'plup').replace(/perfect/g, 'perf').replace(/future/g, 'fut').replace(/active/g, 'act').replace(/passive/g, 'pass').replace(/participle/g, 'ptc').replace(/infinitive/g, 'inf').replace(/; deponent verb \(pass form, act meaning\)/g, ' DEP').replace(/gerundive \(verbal adjective of obligation: "to be \.\.\.ed"\)/g, 'gdv').replace(/comparative/g, 'CMP').replace(/superlative/g, 'SUP').replace(/ or /g, '/');
for (const line of lines) {
  const bar = line.indexOf('|');
  const [lang, label = 'all'] = line.slice(0, bar).trim().split('/');
  const text = line.slice(bar + 1).trim();
  const t = (tot[label] ??= { n: 0, none: 0, name: 0, unconf: 0, alt: 0, union: 0, noneList: [], nameList: [], unconfList: [] });
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  let out = `--- ${label}\n`;
  for (const s0 of sentences) {
    const s = s0.trim();
    const re = /[\p{L}][\p{L}\p{M}'’-]*/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const word = m[0];
      let c: any;
      try { c = parseSelection({ surface: word, languageId: lang, context: { kind: 'sentence', confidence: 0.9, sentence: s, selStart: m.index, selEnd: m.index + word.length } }); } catch { c = {}; }
      t.n++;
      if (!c.lemma) { t.none++; t.noneList.push(word); out += ` ${word}=∅`; }
      else if (c.pos === 'PROPN' && c.unconfirmed) { t.name++; t.nameList.push(word); out += ` ${word}=NAME?`; }
      else if (c.unconfirmed) { t.unconf++; t.unconfList.push(`${word}→${c.lemma}`); out += ` ${word}=${c.lemma}?/${c.pos}`; }
      else {
        if ((c.alternatives ?? []).length) t.alt++;
        if (/ or /.test(String(c.morphology ?? ''))) t.union++;
        out += ` ${word}=${c.lemma}/${c.pos}${c.morphology ? `[${ab(String(c.morphology))}]` : ''}${c.confidence < 0.7 ? `(${c.confidence})` : ''}`;
      }
    }
    out += '\n';
  }
  if (process.argv.includes('full')) console.log(out);
}
for (const [label, t] of Object.entries(tot)) {
  const ok = t.n - t.none - t.name - t.unconf;
  console.log(`\n== ${label}: ${t.n} words; no reading ${t.none} (${(100 * t.none / t.n).toFixed(1)} %); unconfirmed name guess ${t.name} (${(100 * t.name / t.n).toFixed(1)} %); other unconfirmed guess ${t.unconf} (${(100 * t.unconf / t.n).toFixed(1)} %); confirmed reading ${ok} (${(100 * ok / t.n).toFixed(1)} %); of the confirmed: form line is a union ("X or Y") ${t.union} (${(100 * t.union / ok).toFixed(1)} %), other readings listed ${t.alt} (${(100 * t.alt / ok).toFixed(1)} %)`);
  console.log('no reading: ' + [...new Set(t.noneList)].join(' '));
  console.log('name guess: ' + [...new Set(t.nameList)].join(' '));
  console.log('other guess: ' + [...new Set(t.unconfList)].join(' '));
}
