/// <reference types="node" />
/**
 * npm run he:build-modern -- [--in data/raw/kaikki-he/kaikki.org-dictionary-Hebrew.jsonl] [--retrieved YYYY-MM-DD] [--last-modified YYYY-MM-DD]
 *
 * Builds the Modern Hebrew form index of the Hebrew adapter from the Wiktionary extract of kaikki.org (CC BY-SA 4.0): every row
 * of every inflection table (conjugation / declension) and every "form of" entry becomes a reading of its written form —
 * the lemma it belongs to and the labels Wiktionary gives the row (kept verbatim, joined with "|"; tags.ts reads them).
 * Nothing is analysed here; a form the tables do not list is not in the index.
 *
 * Writes public/lexicon/he/modern-index.json (git-ignored) and docs/hebrew/MODERN-INDEX.md (the numbers of this build).
 *
 * Keys: a pointed table row under its `pointed()` key; an unpointed row (Wiktionary gives both for most verb cells, and the
 * unpointed one is the spelling Modern Hebrew is written in, often with a vowel letter the pointed form lacks: יכתוב / יִכְתֹּב)
 * under its own consonantal key. The headword (`word`, unpointed) is also a key of the lemma's own citation row.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { consonantal, pointed } from '../src/adapters/hebrew/text';
import { NON_MORPH_TAGS } from '../src/adapters/hebrew/tags';
import { heVarietiesFromTags } from '../src/adapters/hebrew/varieties';
import type { HeFormRow, HeLemmaRow, HebrewFormIndex } from '../src/adapters/hebrew/index-store';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) { if (!args[i].startsWith('--') || args[i + 1] === undefined) { console.error(`bad argument ${args[i]}`); process.exit(1); } opt[args[i].slice(2)] = args[i + 1]; }
const input = opt.in ?? 'data/raw/kaikki-he/kaikki.org-dictionary-Hebrew.jsonl';
if (!fs.existsSync(input)) { console.error(`cannot read ${input}`); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);

const POS: Record<string, string> = {
  noun: 'NOUN', name: 'PROPN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', pron: 'PRON', det: 'DET', prep: 'ADP', conj: 'CONJ', num: 'NUM', intj: 'INTJ',
  particle: 'PART', suffix: 'X', prefix: 'X', root: 'X', phrase: 'X',
};
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

const lemmas: Record<string, HeLemmaRow> = {};
const forms = new Map<string, Map<string, HeFormRow>>();
const stats = { lines: 0, entries: 0, withTable: 0, tableRows: 0, formOfLines: 0, rowsKept: 0, pointedKeys: 0, unpointedKeys: 0, skippedPos: 0, labelled: { 'he-bib': 0, 'he-mish': 0, 'he-med': 0, 'he-mod': 0, 'arc-bib': 0 } as Record<string, number> };

function addRow(key: string, lemmaId: string, tags: string[]): void {
  if (!key) return;
  const code = tags.filter((t) => !NON_MORPH_TAGS.has(t)).sort().join('|');
  const m = forms.get(key) ?? new Map<string, HeFormRow>();
  const k = `${lemmaId}\t${code}`;
  const row = m.get(k);
  if (row) row[2]++; else m.set(k, [lemmaId, code, 1]);
  forms.set(key, m);
}

const rl = readline.createInterface({ input: fs.createReadStream(input, 'utf8') });
for await (const line of rl) {
  if (!line.trim()) continue;
  stats.lines++;
  let e: Record<string, unknown>;
  try { e = JSON.parse(line); } catch { continue; }
  if (!isObj(e) || e.lang_code !== 'he') continue;
  const word = str(e.word);
  const posRaw = str(e.pos) ?? '';
  const pos = POS[posRaw];
  if (!word || !pos || pos === 'X') { stats.skippedPos++; continue; }
  stats.entries++;
  const formsOf = list(e.forms).filter(isObj);
  const canonical = formsOf.find((f) => list(f.tags).includes('canonical'));
  const headword = (str(canonical?.form) ?? word).normalize('NFC');
  const roman = str(formsOf.find((f) => list(f.tags).includes('romanization'))?.form);
  const senses = list(e.senses).filter(isObj);
  const formOfSenses = senses.filter((s) => list(s.form_of).length > 0);
  const glossSenses = senses.filter((s) => list(s.form_of).length === 0 && list(s.glosses).length > 0);
  const lemmaId = `${word}|${pos}`;
  // labels that hold for every sense of the entry name the period(s) the word belongs to
  const senseLabelLists = glossSenses.map((s) => [...list(s.tags), ...list(s.raw_tags)].map(str).filter((t): t is string => !!t));
  const everySense = senseLabelLists.length ? senseLabelLists.reduce((acc, l) => acc.filter((t) => l.includes(t))) : [];
  const periods = heVarietiesFromTags(everySense);
  for (const p of periods) stats.labelled[p] = (stats.labelled[p] ?? 0) + 1;

  if (glossSenses.length) {
    const gloss = str(list(glossSenses[0].glosses)[0]) ?? '';
    if (!lemmas[lemmaId]) lemmas[lemmaId] = [headword, gloss, pos, 0, ...(roman ? [roman] : [])] as HeLemmaRow;
    if (periods.length) (lemmas[lemmaId] as unknown as unknown[])[5] = periods.join(',');
    // the citation form itself, pointed and unpointed
    addRow(pointed(headword), lemmaId, ['citation-form']);
    if (consonantal(headword) !== pointed(headword)) addRow(consonantal(headword), lemmaId, ['citation-form']);
    if (word !== consonantal(headword)) addRow(word, lemmaId, ['citation-form']);
    // the table
    const table = formsOf.filter((f) => f.source === 'conjugation' || f.source === 'declension');
    if (table.length) stats.withTable++;
    for (const f of table) {
      const form = str(f.form);
      const tags = list(f.tags).map(str).filter((t): t is string => !!t);
      if (!form || tags.some((t) => t === 'table-tags' || t === 'inflection-template' || t === 'class' || t === 'error-unrecognized-form')) continue;
      stats.tableRows++;
      const key = /[ְ-ׇּׁׂ]/.test(form) ? pointed(form) : consonantal(form);
      addRow(key, lemmaId, tags);
    }
  }
  // a "form of" entry: its own written form is a reading of the lemma it names
  for (const s of formOfSenses) {
    stats.formOfLines++;
    const tags = [...list(s.tags), ...list(s.raw_tags)].map(str).filter((t): t is string => !!t);
    for (const fo of list(s.form_of).filter(isObj)) {
      const target = str(fo.word);
      if (!target) continue;
      const targetId = `${consonantal(target)}|${pos}`;
      addRow(pointed(headword), targetId, tags);
      if (word !== pointed(headword)) addRow(word, targetId, tags);
    }
  }
}

const index: HebrewFormIndex = {
  schema: 1, id: 'kaikki-he-tables', codes: 'kaikki-tags', period: 'he-mod',
  source: {
    label: 'Wiktionary Hebrew entries and their inflection tables, via kaikki.org', licence: 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)',
    url: 'https://kaikki.org/dictionary/Hebrew/', retrieved: opt.retrieved ?? today,
    note: `Extract last modified ${opt['last-modified'] ?? 'unknown'}. Every row is a table row or a "form of" entry of Wiktionary; the labels are kept as written.`,
  },
  built: today, lemmas, forms: {}, consonantal: {},
};
let rows = 0;
for (const [key, m] of [...forms].sort((a, b) => a[0].localeCompare(b[0]))) {
  const lst = [...m.values()].sort((a, b) => b[2] - a[2]);
  index.forms[key] = lst;
  rows += lst.length;
  const skel = consonantal(key);
  if (skel !== key) { (index.consonantal[skel] ??= []).push(key); stats.pointedKeys++; } else stats.unpointedKeys++;
}
// a lemma named only by form-of rows and never defined gets a bare row (no gloss), so the reading can still name it
for (const lst of Object.values(index.forms)) for (const r of lst) if (!index.lemmas[r[0]]) { const [w, pos] = r[0].split('|'); index.lemmas[r[0]] = [w, '', pos, 0]; }
index.stats = { entries: stats.entries, entriesWithTable: stats.withTable, tableRows: stats.tableRows, formOfEntries: stats.formOfLines, forms: Object.keys(index.forms).length, rows, pointedKeys: stats.pointedKeys, unpointedKeys: stats.unpointedKeys, lemmas: Object.keys(index.lemmas).length, ...Object.fromEntries(Object.entries(stats.labelled).map(([k, v]) => [`labelled:${k}`, v])) };

fs.mkdirSync('public/lexicon/he', { recursive: true });
fs.writeFileSync('public/lexicon/he/modern-index.json', JSON.stringify(index));
const bytes = fs.statSync('public/lexicon/he/modern-index.json').size;
const doc = `# Modern Hebrew form index — build of ${today}

Built by \`npm run he:build-modern\` from \`${input}\` (Wiktionary via kaikki.org, CC BY-SA 4.0; extract last modified ${opt['last-modified'] ?? 'unknown'}, retrieved ${opt.retrieved ?? today}).
Every row is a Wiktionary inflection-table row or a "form of" entry; its labels are kept as written. Nothing was analysed here.

| measure | value |
|---|---|
| input lines | ${stats.lines.toLocaleString('en')} |
| entries read (noun, verb, adjective, adverb, pronoun, determiner, preposition, conjunction, numeral, interjection) | ${stats.entries.toLocaleString('en')} (${stats.skippedPos.toLocaleString('en')} lines of other headings skipped: roots, suffixes, phrases, characters) |
| entries with an inflection table | ${stats.withTable.toLocaleString('en')} |
| table rows read | ${stats.tableRows.toLocaleString('en')} |
| "form of" entries | ${stats.formOfLines.toLocaleString('en')} |
| distinct form keys | ${Object.keys(index.forms).length.toLocaleString('en')} (${stats.pointedKeys.toLocaleString('en')} pointed, ${stats.unpointedKeys.toLocaleString('en')} unpointed) |
| readings | ${rows.toLocaleString('en')} |
| lemmas | ${Object.keys(index.lemmas).length.toLocaleString('en')} |
| entries whose every sense is labelled Biblical / Mishnaic / Medieval / Modern / Aramaic | ${stats.labelled['he-bib']} / ${stats.labelled['he-mish']} / ${stats.labelled['he-med']} / ${stats.labelled['he-mod']} / ${stats.labelled['arc-bib']} |
| index size | ${(bytes / 1e6).toFixed(1)} MB (public/lexicon/he/modern-index.json, git-ignored) |
`;
fs.mkdirSync('docs/hebrew', { recursive: true });
fs.writeFileSync('docs/hebrew/MODERN-INDEX.md', doc);
console.log(doc);
