/// <reference types="node" />
/**
 * npm run el:build-ancient -- [--in data/raw/kaikki-grc/kaikki.org-dictionary-AncientGreek.jsonl] [--last-modified YYYY-MM-DD] [--retrieved YYYY-MM-DD]
 * npm run el:build-modern  -- [--in data/raw/kaikki-el/kaikki.org-dictionary-Greek.jsonl] …
 * (this one script, with --lang grc | el)
 *
 * Builds a Greek form index from a Wiktionary extract of kaikki.org (CC BY-SA 4.0): every inflection-table row and every alternative
 * form of every entry becomes a reading of its written form — the lemma it belongs to and the labels Wiktionary gives the row, kept
 * verbatim and joined with "|". The TABLE HEADER a row stands under ("present", "Epic aorist", "Attic declension-2", "Ionic
 * declension-3") is carried on the row as "table:<header>", because in Ancient Greek it names the tense of a verb row and the DIALECT
 * of the whole table; varieties.ts reads the dialect, tags.ts the tense. Nothing is analysed here.
 *
 * Also recorded: lemma-level period labels (a label on every sense: Epic, Koine, Byzantine, Katharevousa …), and the cross-period
 * links the source states — an Ancient entry's Modern Greek descendants, a Modern entry's Ancient Greek ancestor.
 *
 * Writes public/lexicon/el/<ancient|modern>-index.json (git-ignored) and docs/greek/<ANCIENT|MODERN>-INDEX.md.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { bare, elKey } from '../src/adapters/greek/text';
import { NON_MORPH_TAGS } from '../src/adapters/greek/tags';
import { elVarietiesFromTags } from '../src/adapters/greek/varieties';
import type { ElFormRow, ElLemmaRow, GreekFormIndex } from '../src/adapters/greek/index-store';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) { if (!args[i].startsWith('--') || args[i + 1] === undefined) { console.error(`bad argument ${args[i]}`); process.exit(1); } opt[args[i].slice(2)] = args[i + 1]; }
const lang = opt.lang === 'el' ? 'el' : 'grc';
const input = opt.in ?? (lang === 'el' ? 'data/raw/kaikki-el/kaikki.org-dictionary-Greek.jsonl' : 'data/raw/kaikki-grc/kaikki.org-dictionary-AncientGreek.jsonl');
if (!fs.existsSync(input)) { console.error(`cannot read ${input}`); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const outName = lang === 'el' ? 'modern' : 'ancient';

const POS: Record<string, string> = { noun: 'NOUN', name: 'PROPN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', pron: 'PRON', det: 'DET', article: 'DET', prep: 'ADP', conj: 'CONJ', num: 'NUM', intj: 'INTJ', particle: 'PART' };
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const HEADER_SKIP = new Set(['inflection-template', 'class', 'error-unrecognized-form']);

const lemmas: Record<string, ElLemmaRow> = {};
const links: Record<string, string[]> = {};
const forms = new Map<string, Map<string, ElFormRow>>();
const stats = { lines: 0, entries: 0, withTable: 0, tableRows: 0, alternatives: 0, formOfLines: 0, skippedPos: 0, headers: {} as Record<string, number>, labelled: {} as Record<string, number>, linked: 0 };

function addRow(key: string, lemmaId: string, tags: string[]): void {
  if (!key) return;
  const code = tags.filter((t) => !NON_MORPH_TAGS.has(t) || /^(Epic|Attic|Ionic|Doric|Aeolic|Koine|Byzantine|Laconian|Boeotian|Old-Attic|Cretan|Arcadocypriot|Cypriot|Thessalian|Lesbian|Elean|Locrian|Corinthian|Katharevousa)$/.test(t)).sort().join('|');
  const m = forms.get(key) ?? new Map<string, ElFormRow>();
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
  if (!isObj(e) || e.lang_code !== lang) continue;
  // the headword without the vowel-length marks (ῡ, ῐ) Wiktionary writes: no text carries them
  const word = str(e.word)?.normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC');
  const pos = POS[str(e.pos) ?? ''];
  if (!word || !pos) { stats.skippedPos++; continue; }
  stats.entries++;
  const formsOf = list(e.forms).filter(isObj);
  const roman = str(formsOf.find((f) => list(f.tags).includes('romanization'))?.form);
  const senses = list(e.senses).filter(isObj);
  const formOfSenses = senses.filter((s) => list(s.form_of).length > 0);
  const glossSenses = senses.filter((s) => list(s.form_of).length === 0 && list(s.glosses).length > 0);
  // a participle or other inflected headword with its own table but no meaning of its own (ὤν "present participle of εἰμί") files its
  // table rows under the lemma it is a form of, so a reader sees εἰμί, not ὤν, as the word
  const formOfTarget = !glossSenses.length && formOfSenses.length === 1 ? str((list(formOfSenses[0].form_of).filter(isObj)[0] ?? {}).word)?.normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC') : undefined;
  const lemmaId = formOfTarget ? `${formOfTarget}|${pos}` : `${word}|${pos}`;
  const senseLabelLists = glossSenses.map((s) => [...list(s.tags), ...list(s.raw_tags)].map(str).filter((t): t is string => !!t));
  const everySense = senseLabelLists.length ? senseLabelLists.reduce((acc, l) => acc.filter((t) => l.includes(t))) : [];
  const periods = elVarietiesFromTags(everySense);
  for (const p of periods) stats.labelled[p] = (stats.labelled[p] ?? 0) + 1;

  if (glossSenses.length || formOfTarget) {
    const gloss = str(list(glossSenses[0]?.glosses)[0]) ?? '';
    if (!lemmas[lemmaId] && !formOfTarget) lemmas[lemmaId] = [word, gloss, pos, 0, roman ?? '', periods.join(',')];
    if (!formOfTarget) addRow(elKey(word), lemmaId, ['citation-form']);
    // the table(s): a header row ("table-tags") opens a section every following row belongs to
    let header = '';
    let any = false;
    for (const f of formsOf) {
      const form = str(f.form)?.normalize('NFC');
      const tags = list(f.tags).map(str).filter((t): t is string => !!t);
      if (!form) continue;
      if (tags.includes('table-tags')) { header = form === 'no-table-tags' ? '' : form; stats.headers[header] = (stats.headers[header] ?? 0) + 1; continue; }
      if (tags.some((t) => HEADER_SKIP.has(t))) continue;
      if (f.source === 'conjugation' || f.source === 'declension') {
        stats.tableRows++; any = true;
        addRow(elKey(form), lemmaId, header ? [...tags, `table:${header}`] : tags);
      } else if (tags.includes('alternative') || tags.some((t) => /^(Epic|Attic|Ionic|Doric|Aeolic|Koine|Byzantine|Laconian|Boeotian|Old-Attic|Cretan|Arcadocypriot|Cypriot|Thessalian|Lesbian|Elean|Locrian|Corinthian|Katharevousa)$/.test(t))) {
        stats.alternatives++;
        addRow(elKey(form), lemmaId, ['alternative', ...tags.filter((t) => t !== 'alternative' && t !== 'canonical' && t !== 'romanization')]);
      }
    }
    if (any) stats.withTable++;
    // cross-period links
    if (lang === 'grc') {
      const desc = list(e.descendants).filter(isObj).filter((d) => d.lang_code === 'el').map((d) => str(d.word)?.normalize('NFC')).filter((w): w is string => !!w);
      if (desc.length) { links[lemmaId] = [...new Set([...(links[lemmaId] ?? []), ...desc])]; stats.linked++; }
    } else {
      const inh = list(e.etymology_templates).filter(isObj).filter((t) => (t.name === 'inh' || t.name === 'der' || t.name === 'bor') && isObj(t.args) && (t.args as Record<string, unknown>)['2'] === 'grc').map((t) => str((t.args as Record<string, unknown>)['3'])?.normalize('NFC')).filter((w): w is string => !!w && !w.startsWith('-'));
      if (inh.length) { links[lemmaId] = [...new Set([...(links[lemmaId] ?? []), ...inh])]; stats.linked++; }
    }
  }
  for (const s of formOfSenses) {
    stats.formOfLines++;
    const tags = [...list(s.tags), ...list(s.raw_tags)].map(str).filter((t): t is string => !!t);
    for (const fo of list(s.form_of).filter(isObj)) {
      const target = str(fo.word)?.normalize('NFC');
      if (target) addRow(elKey(word), `${target}|${pos}`, tags);
    }
  }
}

const index: GreekFormIndex = {
  schema: 1, id: lang === 'el' ? 'kaikki-el-tables' : 'kaikki-grc-tables', codes: 'kaikki-tags', period: lang === 'el' ? 'el-mod' : 'el-att',
  source: {
    label: lang === 'el' ? 'Wiktionary Modern Greek entries and their inflection tables, via kaikki.org' : 'Wiktionary Ancient Greek entries, their inflection tables (Attic by default; Epic, Ionic, Doric, Koine … where the table says so) and dialectal alternative forms, via kaikki.org',
    licence: 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)', url: lang === 'el' ? 'https://kaikki.org/dictionary/Greek/' : 'https://kaikki.org/dictionary/Ancient%20Greek/', retrieved: opt.retrieved ?? today,
    note: `Extract last modified ${opt['last-modified'] ?? 'unknown'}. Every row is a table row, an alternative form or a "form of" entry of Wiktionary; the labels and the table header are kept as written.`,
  },
  built: today, lemmas, forms: {}, bare: {}, links,
};
let rows = 0;
for (const [key, m] of [...forms].sort((a, b) => a[0].localeCompare(b[0]))) {
  const lst = [...m.values()].sort((a, b) => b[2] - a[2]);
  index.forms[key] = lst;
  rows += lst.length;
  const b = bare(key);
  if (b !== key) (index.bare[b] ??= []).push(key);
}
for (const lst of Object.values(index.forms)) for (const r of lst) if (!index.lemmas[r[0]]) { const [w, pos] = r[0].split('|'); index.lemmas[r[0]] = [w, '', pos, 0, '', '']; }
index.stats = { entries: stats.entries, entriesWithTable: stats.withTable, tableRows: stats.tableRows, alternativeForms: stats.alternatives, formOfEntries: stats.formOfLines, forms: Object.keys(index.forms).length, rows, lemmas: Object.keys(index.lemmas).length, linked: stats.linked, ...Object.fromEntries(Object.entries(stats.labelled).map(([k, v]) => [`labelled:${k}`, v])) };

fs.mkdirSync('public/lexicon/el', { recursive: true });
fs.writeFileSync(`public/lexicon/el/${outName}-index.json`, JSON.stringify(index));
const bytes = fs.statSync(`public/lexicon/el/${outName}-index.json`).size;
const headerLines = Object.entries(stats.headers).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([h, n]) => `${h || '(none)'} ${n.toLocaleString('en')}`).join(', ');
const doc = `# ${lang === 'el' ? 'Modern' : 'Ancient'} Greek form index — build of ${today}

Built by \`npm run el:build-${outName}\` from \`${input}\` (Wiktionary via kaikki.org, CC BY-SA 4.0; extract last modified ${opt['last-modified'] ?? 'unknown'}, retrieved ${opt.retrieved ?? today}).
Every row is a Wiktionary table row (with its table header), an alternative form or a "form of" entry; labels are kept as written. Nothing was analysed here.

| measure | value |
|---|---|
| input lines | ${stats.lines.toLocaleString('en')} |
| entries read | ${stats.entries.toLocaleString('en')} (${stats.skippedPos.toLocaleString('en')} lines of other headings skipped) |
| entries with an inflection table | ${stats.withTable.toLocaleString('en')} |
| table rows / alternative forms / "form of" entries | ${stats.tableRows.toLocaleString('en')} / ${stats.alternatives.toLocaleString('en')} / ${stats.formOfLines.toLocaleString('en')} |
| distinct form keys | ${Object.keys(index.forms).length.toLocaleString('en')} |
| readings | ${rows.toLocaleString('en')} |
| lemmas | ${Object.keys(index.lemmas).length.toLocaleString('en')} |
| entries with a cross-period link (${lang === 'grc' ? 'Modern Greek descendant' : 'Ancient Greek ancestor'}) | ${stats.linked.toLocaleString('en')} |
| entries whose every sense carries a period label | ${Object.entries(stats.labelled).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} |
| index size | ${(bytes / 1e6).toFixed(1)} MB (public/lexicon/el/${outName}-index.json, git-ignored) |

Table headers seen (top 30): ${headerLines}.
`;
fs.mkdirSync('docs/greek', { recursive: true });
fs.writeFileSync(`docs/greek/${outName.toUpperCase()}-INDEX.md`, doc);
console.log(doc);
