/// <reference types="node" />
/**
 * npm run scripture:audit-first-reading -- [--biblia C:/Users/CJWal/dev/biblia-v0] [--he Gen,Exod,Ps,Isa,Dan,Ezra] [--el John,Rom,Matt,Rev]
 *
 * Audits the Hebrew and Greek analysers on the Scriptures THEMSELVES, honestly: the full indexes were built from these very texts, so
 * "coverage" is near-total by construction. What is measured instead is what a reader actually meets:
 *   - first reading = the source's reading of that very token (how often the commonest-attested reading of a written form is the right one
 *     for this occurrence; the gap is what a parser would have to decide);
 *   - how many tokens have more than one reading in the text's period;
 *   - the period decision per verse (the Tanakh verses should be he-bib, the Aramaic verses of Daniel/Ezra arc-bib, the NT el-koi);
 *   - the commonest wrong-first forms.
 * Writes docs/hebrew/SCRIPTURE-AUDIT.md and docs/greek/SCRIPTURE-AUDIT.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { heAdapter } from '../src/adapters/he';
import { elAdapter } from '../src/adapters/el';
import { installHebrewIndex, type HebrewFormIndex } from '../src/adapters/hebrew/index-store';
import { installGreekIndex, type GreekFormIndex } from '../src/adapters/greek/index-store';
import { lemmaStem } from '../src/adapters/hebrew/index-store';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) { if (args[i].startsWith('--') && args[i + 1] !== undefined) opt[args[i].slice(2)] = args[i + 1]; }
const biblia = opt.biblia ?? 'C:/Users/CJWal/dev/biblia-v0';
const HE_BOOKS = (opt.he ?? 'Gen,Exod,Ps,Isa,Prov,Dan,Ezra').split(',');
const EL_BOOKS = (opt.el ?? 'Matt,John,Rom,Heb,Rev').split(',');
installHebrewIndex(JSON.parse(fs.readFileSync('public/lexicon/he/biblical-index.json', 'utf8')) as HebrewFormIndex);
installHebrewIndex(JSON.parse(fs.readFileSync('public/lexicon/he/modern-index.json', 'utf8')) as HebrewFormIndex);
installGreekIndex(JSON.parse(fs.readFileSync('public/lexicon/el/koine-index.json', 'utf8')) as GreekFormIndex);
installGreekIndex(JSON.parse(fs.readFileSync('public/lexicon/el/ancient-index.json', 'utf8')) as GreekFormIndex);
installGreekIndex(JSON.parse(fs.readFileSync('public/lexicon/el/modern-index.json', 'utf8')) as GreekFormIndex);

const contentWords = (t: string): string[] => t.replace(/\u05C0/g, '').split(/[\s\u00A0]+/).filter(Boolean).flatMap((w) => w.split('\u05BE')).map((w) => w.replace(/\u05C3/g, '')).filter(Boolean);
interface Row { book: string; verses: number; tokens: number; noReading: number; firstRight: number; several: number; periods: Record<string, number>; wrong: Array<[string, number]> }
const pct = (a: number, b: number): string => `${(100 * a / Math.max(1, b)).toFixed(1)} %`;

const heRows: Row[] = [];
for (const id of HE_BOOKS) {
  const book = JSON.parse(fs.readFileSync(path.join(biblia, 'public', 'data', 'he', `${id}.json`), 'utf8')) as { chapters: Array<{ verses: Array<{ t: string; w: Array<[string, string, string?] | null> }> }> };
  const row: Row = { book: id, verses: 0, tokens: 0, noReading: 0, firstRight: 0, several: 0, periods: {}, wrong: [] };
  const wrong = new Map<string, number>();
  for (const ch of book.chapters) for (const v of ch.verses) {
    row.verses++;
    const tokens = heAdapter.tokenize(v.t);
    const analysed = heAdapter.analyze(tokens);
    const words = tokens.map((t, i) => [t, analysed[i]] as const).filter(([t]) => t.isWord);
    const period = words.find(([, a]) => a.candidates.length)?.[1].candidates[0]?.notes?.period;
    if (typeof period === 'string') row.periods[period] = (row.periods[period] ?? 0) + 1;
    const printed = contentWords(v.t);
    if (printed.length !== words.length || printed.length !== v.w.length) continue; // alignment the reader cannot make: not counted
    v.w.forEach((gold, i) => {
      if (!gold) return;
      row.tokens++;
      const cands = words[i][1].candidates;
      if (!cands.length) { row.noReading++; return; }
      const samePeriod = cands.filter((c) => (c.varieties ?? []).includes(cands[0].varieties?.[0] ?? ''));
      if (samePeriod.length > 1) row.several++;
      const top = cands[0];
      const ok = top.notes?.lemmaId === lemmaStem(gold[0]) && top.notes?.code === gold[1];
      if (ok) row.firstRight++;
      else { const k = `${words[i][0].surface}: first ${top.lemma} ${top.notes?.code}, this token ${lemmaStem(gold[0])} ${gold[1]}`; wrong.set(k, (wrong.get(k) ?? 0) + 1); }
    });
  }
  row.wrong = [...wrong].sort((a, b) => b[1] - a[1]).slice(0, 10);
  heRows.push(row);
  console.log(`he ${id}: ${row.tokens} tokens, no reading ${pct(row.noReading, row.tokens)}, first right ${pct(row.firstRight, row.tokens)}, several ${pct(row.several, row.tokens)}, periods ${JSON.stringify(row.periods)}`);
}

const PUNCT = /^[\s,.;·!?\u037E()«»"'“”‘’\[\]—–-]+|[\s,.;·!?\u037E()«»"'“”‘’\[\]—–-]+$/gu;
const elRows: Row[] = [];
for (const id of EL_BOOKS) {
  const book = JSON.parse(fs.readFileSync(path.join(biblia, 'public', 'data', 'gr', `${id}.json`), 'utf8')) as { chapters: Array<{ verses: Array<{ w: Array<[string, string, string, string?]> }> }> };
  const row: Row = { book: id, verses: 0, tokens: 0, noReading: 0, firstRight: 0, several: 0, periods: {}, wrong: [] };
  const wrong = new Map<string, number>();
  for (const ch of book.chapters) for (const v of ch.verses) {
    row.verses++;
    const text = v.w.map((t) => t[0]).join(' ');
    const tokens = elAdapter.tokenize(text);
    const analysed = elAdapter.analyze(tokens);
    const words = tokens.map((t, i) => [t, analysed[i]] as const).filter(([t]) => t.isWord);
    const gold = v.w.filter((t) => t[0].replace(PUNCT, '').length > 0);
    const period = words.find(([, a]) => a.candidates.length)?.[1].candidates[0]?.notes?.period;
    if (typeof period === 'string') row.periods[period] = (row.periods[period] ?? 0) + 1;
    if (gold.length !== words.length) continue;
    gold.forEach((g, i) => {
      row.tokens++;
      const cands = words[i][1].candidates;
      if (!cands.length) { row.noReading++; return; }
      const samePeriod = cands.filter((c) => (c.varieties ?? []).includes(cands[0].varieties?.[0] ?? ''));
      if (samePeriod.length > 1) row.several++;
      const top = cands[0];
      const ok = top.notes?.lemmaId === g[1].normalize('NFC') && top.notes?.code === `${g[2]}|${g[3] ?? ''}`;
      if (ok) row.firstRight++;
      else { const k = `${words[i][0].surface}: first ${top.lemma} ${top.notes?.code ?? top.notes?.tags}, this token ${g[1]} ${g[2]}|${g[3] ?? ''}`; wrong.set(k, (wrong.get(k) ?? 0) + 1); }
    });
  }
  row.wrong = [...wrong].sort((a, b) => b[1] - a[1]).slice(0, 10);
  elRows.push(row);
  console.log(`el ${id}: ${row.tokens} tokens, no reading ${pct(row.noReading, row.tokens)}, first right ${pct(row.firstRight, row.tokens)}, several ${pct(row.several, row.tokens)}, periods ${JSON.stringify(row.periods)}`);
}

const table = (rows: Row[]): string => `| book | verses | tokens | no reading | first reading = this token | tokens with several readings in the period | verses read as |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.book} | ${r.verses} | ${r.tokens} | ${pct(r.noReading, r.tokens)} | ${pct(r.firstRight, r.tokens)} | ${pct(r.several, r.tokens)} | ${Object.entries(r.periods).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ')} |`).join('\n')}`;
const wrongs = (rows: Row[]): string => rows.map((r) => `### ${r.book}\n${r.wrong.map(([k, n]) => `- ${n}× ${k}`).join('\n')}`).join('\n\n');
const date = new Date().toISOString().slice(0, 10);
const heDoc = `# Hebrew: the Tanakh read back through adapter-he — ${date}

The Biblical index was built from these very texts (Open Scriptures morphology aligned to the MAM text), so a word is "covered" by
construction; what this audit measures is the reader's experience: whether the FIRST reading shown (the commonest-attested reading of the
written form, within the period the verse was read in) is the source's reading of this very token, how often a form has several readings
in its period (the parser's missing work), and whether each verse was read in the right period (Tanakh → he-bib; the Aramaic verses of Daniel
2:4b–7:28 and Ezra 4:8–6:18, 7:12–26 → arc-bib). Both indexes (Biblical + Modern) were installed, as a reader would have them.

${table(heRows)}

## Commonest wrong-first forms

${wrongs(heRows)}
`;
const elDoc = `# Greek: the New Testament read back through adapter-el — ${date}

The Koine index was built from these very texts (MorphGNT over the SBLGNT), so a word is "covered" by construction; what this audit
measures is the reader's experience: whether the FIRST reading shown (the commonest-attested reading of the written form, within the period
the verse was read in) is MorphGNT's reading of this very token, how often a form has several readings in its period, and whether each verse
was read as Koine. All three Greek indexes (Koine, Ancient, Modern) were installed, as a reader would have them — so the Ancient tables' Attic
readings of the same forms compete, which is the realistic case.

${table(elRows)}

## Commonest wrong-first forms

${wrongs(elRows)}
`;
fs.writeFileSync('docs/hebrew/SCRIPTURE-AUDIT.md', heDoc);
fs.writeFileSync('docs/greek/SCRIPTURE-AUDIT.md', elDoc);
console.log('wrote docs/hebrew/SCRIPTURE-AUDIT.md and docs/greek/SCRIPTURE-AUDIT.md');
