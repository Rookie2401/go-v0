/// <reference types="node" />
/**
 * npm run texts:audit-plain -- [--tokens 4000] [--only aristotle-ne,avot,…]
 *
 * Audits adapter-el and adapter-he on PLAIN texts with no independent gold (unlike el:audit-treebank): Aristotle, Plato's Republic,
 * Marcus Aurelius, Euclid, Archimedes (Perseus / First1KGreek TEI, CC BY-SA 4.0) and two rabbinic texts (Mishnah Berakhot, Pirkei Avot;
 * Sefaria's Torat Emet 357 edition, public domain). The full Koine, Ancient and Modern Greek indexes and the Biblical and Modern Hebrew
 * indexes are installed. What is measured, per text, over the first N word tokens read sentence by sentence:
 *   - covered: the share of word tokens with at least one reading (a form the indexes hold);
 *   - confident: covered tokens whose first reading is NOT marked unconfirmed (peeled prefix, inferred vowels, bare-letter fallback);
 *   - ambiguous: covered tokens with more than one reading in the sentence's period (what a parser would have to decide);
 *   - the period decision per sentence against what a philologist expects (Attic prose, literary Koine, Doric, Mishnaic Hebrew), with a
 *     second Hebrew pass where the reader DECLARES Mishnaic, since the analyser recognises that period from dictionary labels only;
 *   - the commonest uncovered forms (what a learner would meet without a card).
 * No lemma or POS agreement can be stated here: there is no gold. Nothing is tuned on these texts.
 *
 * Writes docs/greek/TEXTS-AUDIT.md and docs/hebrew/RABBINIC-AUDIT.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { elAdapter } from '../src/adapters/el';
import { heAdapter } from '../src/adapters/he';
import { installGreekIndex, type GreekFormIndex } from '../src/adapters/greek/index-store';
import { installHebrewIndex, type HebrewFormIndex } from '../src/adapters/hebrew/index-store';
import type { AnalyzedToken, LanguageAdapter, RawToken } from '../src/core';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) { if (args[i].startsWith('--') && args[i + 1] !== undefined) opt[args[i].slice(2)] = args[i + 1]; }
const MAX = Number(opt.tokens ?? 4000);
const SHOW = new Set((opt.show ?? '').split(',').filter(Boolean));
const RAW = 'data/raw/audit-texts';

for (const f of ['koine-index.json', 'ancient-index.json', 'modern-index.json']) {
  const p = path.join('public', 'lexicon', 'el', f);
  if (!fs.existsSync(p)) { console.error(`missing ${p}: build it first`); process.exit(1); }
  installGreekIndex(JSON.parse(fs.readFileSync(p, 'utf8')) as GreekFormIndex);
}
for (const f of ['biblical-index.json', 'modern-index.json']) {
  const p = path.join('public', 'lexicon', 'he', f);
  if (!fs.existsSync(p)) { console.error(`missing ${p}: build it first`); process.exit(1); }
  installHebrewIndex(JSON.parse(fs.readFileSync(p, 'utf8')) as HebrewFormIndex);
}

/** The running text of a TEI body: notes, apparatus, bibliography and tags dropped; entities resolved; whitespace folded. */
function teiText(xml: string): string {
  const start = xml.search(/<body[\s>]/);
  let s = start >= 0 ? xml.slice(start) : xml;
  s = s.replace(/<teiHeader[\s\S]*?<\/teiHeader>/g, '');
  s = s.replace(/<(note|bibl|app|rdg|label|ref|foreign)\b[^>]*>[\s\S]*?<\/\1>/g, ' ');
  s = s.replace(/<(head|pb|lb|milestone|cb|gap|space)\b[^>]*\/?>/g, ' ');
  s = s.replace(/<\/?(p|div|l|lg|quote|q|said|sp|speaker|seg|hi|title|add|del|corr|sic|choice|supplied|unclear|body|text|TEI|num|date|name|persName|placeName)\b[^>]*>/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  return s.replace(/\s+/g, ' ').trim();
}

/** Sefaria's v3 text: chapters × paragraphs of strings (HTML tags stripped). */
function sefariaText(file: string): string {
  const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { versions: Array<{ text: unknown }> };
  const flat: string[] = [];
  const walk = (x: unknown): void => { if (typeof x === 'string') flat.push(x.replace(/<[^>]+>/g, ' ')); else if (Array.isArray(x)) x.forEach(walk); };
  walk(j.versions[0].text);
  return flat.join(' ').replace(/\s+/g, ' ').trim();
}

interface Row {
  id: string; title: string; expect: string; language: 'el' | 'he'; declared?: string;
  tokens: number; covered: number; confident: number; ambiguous: number; sentences: number; periods: Record<string, number>;
  uncovered: Array<[string, number]>; topLemmas: Array<[string, number]>;
}

function audit(adapter: LanguageAdapter, text: string, row: Row, declared?: string): void {
  const miss = new Map<string, number>();
  const lemmas = new Map<string, number>();
  for (const span of adapter.segmentSentences(text)) {
    if (row.tokens >= MAX) break;
    const tokens: RawToken[] = adapter.tokenize(span.text);
    if (!tokens.some((t) => t.isWord)) continue;
    const analysed: AnalyzedToken[] = adapter.analyze(tokens, declared ? { varietyId: declared } : undefined);
    row.sentences++;
    const first = analysed.find((a) => a.candidates.length)?.candidates[0];
    const period = typeof first?.notes?.period === 'string' ? first.notes.period : '(none)';
    row.periods[period] = (row.periods[period] ?? 0) + 1;
    // --show el-hom,el-mod prints the sentences decided as those periods, with the analyser's stated basis, for inspection
    if (SHOW.has(period)) console.log(`  [${row.id} ${period}] ${String(first?.notes?.periodBasis ?? '')} :: ${span.text.slice(0, 110)}`);
    tokens.forEach((tk, i) => {
      if (!tk.isWord) return;
      row.tokens++;
      const cs = analysed[i].candidates;
      if (!cs.length) { miss.set(tk.surface, (miss.get(tk.surface) ?? 0) + 1); return; }
      row.covered++;
      if (!cs[0].unconfirmed) row.confident++;
      const inPeriod = period === '(none)' ? cs : cs.filter((c) => !c.varieties?.length || c.varieties.includes(period));
      if ((inPeriod.length || cs.length) > 1) row.ambiguous++;
      const l = cs[0].lemma ?? '?';
      lemmas.set(l, (lemmas.get(l) ?? 0) + 1);
    });
  }
  row.uncovered = [...miss].sort((a, b) => b[1] - a[1]).slice(0, 15);
  row.topLemmas = [...lemmas].sort((a, b) => b[1] - a[1]).slice(0, 12);
}

const GREEK: Array<{ id: string; file: string; title: string; expect: string }> = [
  { id: 'aristotle-ne', file: 'perseus/tlg0086.tlg010.perseus-grc2.xml', title: 'Aristotle, Nicomachean Ethics', expect: 'el-att (Attic prose)' },
  { id: 'aristotle-met', file: 'perseus/tlg0086.tlg025.perseus-grc2.xml', title: 'Aristotle, Metaphysics', expect: 'el-att (Attic prose)' },
  { id: 'plato-rep', file: 'perseus/tlg0059.tlg030.perseus-grc2.xml', title: 'Plato, Republic', expect: 'el-att (Attic prose)' },
  { id: 'marcus', file: 'perseus/tlg0562.tlg001.perseus-grc2.xml', title: 'Marcus Aurelius, Meditations', expect: 'el-koi (literary Koine; not told from Attic by vocabulary)' },
  { id: 'euclid', file: 'perseus/tlg1799.tlg001.perseus-grc2.xml', title: 'Euclid, Elements', expect: 'el-att / el-koi (Hellenistic technical prose)' },
  { id: 'archimedes', file: 'first1k/tlg0552.tlg001.1st1K-grc1.xml', title: 'Archimedes, On the Sphere and Cylinder', expect: 'el-dor forms inside el-att / el-koi prose (Doric)' },
];
const HEBREW: Array<{ id: string; file: string; title: string; expect: string }> = [
  { id: 'berakhot', file: 'sefaria/Mishnah_Berakhot.json', title: 'Mishnah Berakhot (Torat Emet 357, pointed)', expect: 'he-mish (Mishnaic Hebrew)' },
  { id: 'avot', file: 'sefaria/Pirkei_Avot.json', title: 'Pirkei Avot (Torat Emet 357, pointed)', expect: 'he-mish (Mishnaic Hebrew)' },
];
const only = opt.only ? new Set(opt.only.split(',')) : undefined;
const rows: Row[] = [];
const blank = (t: { id: string; title: string; expect: string }, language: 'el' | 'he', declared?: string): Row =>
  ({ ...t, language, declared, tokens: 0, covered: 0, confident: 0, ambiguous: 0, sentences: 0, periods: {}, uncovered: [], topLemmas: [] });

for (const t of GREEK) {
  if (only && !only.has(t.id)) continue;
  const text = teiText(fs.readFileSync(path.join(RAW, t.file), 'utf8'));
  const row = blank(t, 'el'); audit(elAdapter, text, row); rows.push(row);
  console.log(`${t.title}: ${row.tokens} tokens, covered ${pct(row.covered, row.tokens)}, confident ${pct(row.confident, row.tokens)}, ambiguous ${pct(row.ambiguous, row.covered)}, periods ${JSON.stringify(row.periods)}`);
}
for (const t of HEBREW) {
  if (only && !only.has(t.id)) continue;
  const text = sefariaText(path.join(RAW, t.file));
  for (const declared of [undefined, 'he-mish']) {
    const row = blank(t, 'he', declared); audit(heAdapter, text, row, declared); rows.push(row);
    console.log(`${t.title}${declared ? ` [declared ${declared}]` : ''}: ${row.tokens} tokens, covered ${pct(row.covered, row.tokens)}, confident ${pct(row.confident, row.tokens)}, ambiguous ${pct(row.ambiguous, row.covered)}, periods ${JSON.stringify(row.periods)}`);
  }
}

function pct(a: number, b: number): string { return `${(100 * a / Math.max(1, b)).toFixed(1)} %`; }
const periodsOf = (r: Row): string => Object.entries(r.periods).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ');
const table = (rs: Row[]): string => `| text | declared | word tokens | sentences | covered | confident first reading | ambiguous (of covered) | sentences read as (expected) |
|---|---|---|---|---|---|---|---|
${rs.map((r) => `| ${r.title} | ${r.declared ?? '—'} | ${r.tokens} | ${r.sentences} | ${pct(r.covered, r.tokens)} | ${pct(r.confident, r.tokens)} | ${pct(r.ambiguous, r.covered)} | ${periodsOf(r)} (${r.expect}) |`).join('\n')}`;
const lists = (rs: Row[]): string => rs.map((r) => `### ${r.title}${r.declared ? ` — declared ${r.declared}` : ''}
- uncovered forms: ${r.uncovered.map(([f, n]) => `${f} ×${n}`).join(', ') || 'none'}
- commonest first-reading lemmas: ${r.topLemmas.map(([l, n]) => `${l} ×${n}`).join(', ')}`).join('\n\n');
const date = new Date().toISOString().slice(0, 10);

const el = rows.filter((r) => r.language === 'el');
if (el.length) fs.writeFileSync('docs/greek/TEXTS-AUDIT.md', `# Greek: audit on plain texts (no gold) — ${date}

Texts: Perseus canonical-greekLit (CC BY-SA 4.0) and First1KGreek (CC BY-SA 4.0), \`data/raw/audit-texts\`; the first ${MAX} word tokens of each,
read sentence by sentence by adapter-el@${elAdapter.version} with the full Koine, Ancient and Modern indexes installed. There is no independent gold
for these texts (the treebank audit, docs/greek/TREEBANK-AUDIT.md, has it for Homer, Plato's Euthyphro, Thucydides, Herodotus, Sophocles,
Polybius, Plutarch), so lemma and part-of-speech agreement are NOT stated here. "Covered" is a reading at all; "confident" a first reading not
marked unconfirmed (an elision restored by rule, a bare-letter fallback); "ambiguous" the covered tokens with several readings in the sentence's
period, which is the parser's missing work. Nothing was tuned on these texts.

${table(el)}

## Uncovered forms and commonest lemmas, per text

${lists(el)}

Reading the numbers: Attic prose (Aristotle, Plato) and literary Koine (Marcus Aurelius) are told apart by nothing in the vocabulary, so
Marcus reads as Attic unless the reader or the learner's target declares Koine (the card's period line says so). Euclid's technical prose
is read as Attic for the same reason. Archimedes writes Doric: the Doric forms (τᾶς, ἁ, ποτί, -ᾶν genitives) are either uncovered or
reached through an Attic reading; the period decision has no Doric vote (el-dor is a regional variety recognised on cards, not a period).
`);
const he = rows.filter((r) => r.language === 'he');
if (he.length) fs.writeFileSync('docs/hebrew/RABBINIC-AUDIT.md', `# Hebrew: audit on rabbinic texts (no gold) — ${date}

Texts: Mishnah Berakhot and Pirkei Avot, Sefaria's Torat Emet 357 edition (public domain, pointed), \`data/raw/audit-texts/sefaria\`; the first
${MAX} word tokens of each, read sentence by sentence by adapter-he@${heAdapter.version} with the Biblical and Modern indexes installed. No Mishnaic
index exists: the analyser knows Mishnaic Hebrew from dictionary labels only, so each text is read twice, once as a reader would meet it
(nothing declared) and once with Mishnaic declared, to show what the declaration changes. There is no gold, so lemma agreement is not stated.

${table(he)}

## Uncovered forms and commonest lemmas, per pass

${lists(he)}

Reading the numbers: the Torat Emet text is fully pointed, so with nothing declared the period rule's last resort (pointed → Biblical) applies,
and the Biblical index (built from the Tanakh) covers the shared vocabulary; what it cannot cover is Mishnaic morphology and lexis
(the -ִין plural, the שֶׁ- relative, קוֹרִין / אוֹמְרִים participial syntax, Aramaic loans), which appear in the uncovered lists. Declaring
Mishnaic changes the period line but adds no readings: a Mishnaic index (from a tagged rabbinic corpus) is what would.
`);
console.log('wrote docs/greek/TEXTS-AUDIT.md and docs/hebrew/RABBINIC-AUDIT.md');
