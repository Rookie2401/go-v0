/// <reference types="node" />
/**
 * npm run he:build-biblical -- [--biblia C:/Users/CJWal/dev/biblia-v0] [--core-lemmas 700] [--core-min-form 2]
 *
 * Builds the Biblical Hebrew form index of the Hebrew adapter from the Biblia app's shipped data — the Miqra according to the
 * Masorah text (CC BY-SA 4.0, via Sefaria) aligned at Biblia's build time with the Open Scriptures Hebrew Bible morphology
 * (CC BY 4.0), plus Biblia's Hebrew lexicon shards (BDB / Strong's / Open Scriptures index glosses, all public domain). Nothing
 * is downloaded; nothing is analysed here: every row is a reading the source gives to that very word of the Bible.
 *
 * Writes
 *   public/lexicon/he/biblical-index.json              the full index (git-ignored; ~305k tokens → distinct pointed forms with their readings)
 *   src/adapters/hebrew/generated/biblical-core.ts     the compact core compiled into the adapter: the closed classes (every form)
 *                                                      and the commonest lemmas (forms read at least --core-min-form times)
 *   docs/hebrew/BIBLICAL-INDEX.md                      the measured numbers of this build
 *
 * Form key: text.ts `pointed()` (NFC, cantillation/meteg removed, vowels and dagesh kept). A word Biblia could not align (null)
 * is counted and skipped. Ketiv/qere: the text reads the qere; the index keys what is printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { consonantal, letterCount, pointed, splitByLetters } from '../src/adapters/hebrew/text';
import { posOfOshb } from '../src/adapters/hebrew/oshb';
import type { HeFormRow, HeLemmaRow, HebrewFormIndex } from '../src/adapters/hebrew/index-store';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) { if (!args[i].startsWith('--') || args[i + 1] === undefined) { console.error(`bad argument ${args[i]}`); process.exit(1); } opt[args[i].slice(2)] = args[i + 1]; }
const biblia = opt.biblia ?? 'C:/Users/CJWal/dev/biblia-v0';
const CORE_LEMMAS = Number(opt['core-lemmas'] ?? 700);
const CORE_MIN_FORM = Number(opt['core-min-form'] ?? 2);
const heDir = path.join(biblia, 'public', 'data', 'he');
const lexDir = path.join(biblia, 'public', 'data', 'lex');
if (!fs.existsSync(heDir) || !fs.existsSync(lexDir)) { console.error(`Biblia data not found under ${biblia}`); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
const SOURCES = JSON.parse(fs.readFileSync(path.join(heDir, 'SOURCES.json'), 'utf8'));

// Biblia's verse → maqaf-split content words (its text/hebrew.ts contentWords), so word i pairs with w[i]
const contentWords = (t: string): string[] =>
  t.replace(/\u05C0/g, '').split(/[\s\u00A0]+/).filter(Boolean).flatMap((w) => w.split('\u05BE')).map((w) => w.replace(/\u05C3/g, '')).filter(Boolean);

// ── lexicon: id → [headword, gloss, pos, count, translit] from Biblia's shards (pos is replaced below by the corpus majority)
const lemmas: Record<string, HeLemmaRow> = {};
const manifest = JSON.parse(fs.readFileSync(path.join(lexDir, 'he-manifest.json'), 'utf8')) as { shards: number[] };
for (const n of manifest.shards) {
  const shard = JSON.parse(fs.readFileSync(path.join(lexDir, `he-${n}.json`), 'utf8')) as Record<string, { id: string; w: string; x?: string; g: string; n: number }>;
  // headwords NFC-normalised (the shards mix mark orders), so a headword compares equal to a form key
  for (const e of Object.values(shard)) lemmas[e.id] = [e.w.normalize('NFC'), e.g, '', e.n, ...(e.x ? [e.x] : [])] as HeLemmaRow;
}

// ── the corpus
type Acc = Map<string, { count: number; seg?: string }>; // code key "lemma\tcode" → count
const forms = new Map<string, Acc>();
const lemmaCount = new Map<string, number>();
const lemmaPos = new Map<string, Map<string, number>>();
const stats = { verses: 0, tokens: 0, unaligned: 0, aramaic: 0, segMismatch: 0, books: 0 };
for (const f of fs.readdirSync(heDir).sort()) {
  if (!f.endsWith('.json') || f === 'SOURCES.json') continue;
  stats.books++;
  const book = JSON.parse(fs.readFileSync(path.join(heDir, f), 'utf8')) as { chapters: Array<{ verses: Array<{ t: string; w: Array<[string, string, string?] | null> }> }> };
  for (const ch of book.chapters) for (const v of ch.verses) {
    stats.verses++;
    const words = contentWords(v.t);
    v.w.forEach((tok, i) => {
      stats.tokens++;
      if (!tok) { stats.unaligned++; return; }
      const [lemma, code, seg] = tok;
      if (code[0] === 'A') stats.aramaic++;
      const printed = words[i] ?? '';
      const key = pointed(printed);
      if (!key) return;
      let segCounts: string | undefined;
      if (seg) {
        const counts = seg.split('/').map((p) => letterCount(p));
        if (splitByLetters(key, counts)) segCounts = counts.join('/'); else stats.segMismatch++;
      }
      const acc = forms.get(key) ?? new Map();
      const k = `${lemma}\t${code}`;
      const cur = acc.get(k) ?? { count: 0, seg: segCounts };
      cur.count++;
      if (!cur.seg && segCounts) cur.seg = segCounts;
      acc.set(k, cur);
      forms.set(key, acc);
      const stem = lemma.split('/').pop()!.replace(/\+$/, '');
      lemmaCount.set(stem, (lemmaCount.get(stem) ?? 0) + 1);
      const pos = posOfOshb(lemma, code).pos;
      const pm = lemmaPos.get(stem) ?? new Map();
      pm.set(pos, (pm.get(pos) ?? 0) + 1);
      lemmaPos.set(stem, pm);
    });
  }
}

// the corpus majority part of speech of each lemma; a lemma the lexicon lacks gets a row with no gloss (said so)
let lemmasWithoutEntry = 0;
for (const [stem, n] of lemmaCount) {
  const pm = lemmaPos.get(stem)!;
  const pos = [...pm].sort((a, b) => b[1] - a[1])[0][0];
  const row = lemmas[stem];
  if (row) { row[2] = pos; row[3] = n; }
  else { lemmasWithoutEntry++; lemmas[stem] = [stem, '', pos, n]; }
}
for (const id of Object.keys(lemmas)) if (!lemmaCount.has(id)) delete lemmas[id]; // lexicon entries never read in the text

const index: HebrewFormIndex = {
  schema: 1, id: 'oshb-tanakh', codes: 'oshb', period: 'he-bib',
  source: {
    label: 'Open Scriptures Hebrew Bible morphology, aligned to the Miqra according to the Masorah (via the Biblia app)',
    licence: `morphology ${SOURCES.morphology.license}; text ${SOURCES.text.license}; glosses BDB / Strong\u2019s / Open Scriptures index (public domain)`,
    url: SOURCES.morphology.url, retrieved: SOURCES.text.fetched,
    note: 'Every row is the source\u2019s reading of that word in the Bible, not an analysis made here. Keys are pointed forms with cantillation removed.',
  },
  built: today, lemmas, forms: {}, consonantal: {},
};
let rows = 0;
let ambiguous = 0;
for (const [key, acc] of [...forms].sort((a, b) => a[0].localeCompare(b[0]))) {
  const list: HeFormRow[] = [...acc].map(([k, v]) => { const [lemma, code] = k.split('\t'); return v.seg ? [lemma, code, v.count, v.seg] : [lemma, code, v.count]; });
  list.sort((a, b) => b[2] - a[2]);
  index.forms[key] = list;
  rows += list.length;
  if (list.length > 1) ambiguous++;
  const skel = consonantal(key);
  if (skel !== key) (index.consonantal[skel] ??= []).push(key);
}
index.stats = { verses: stats.verses, tokens: stats.tokens, unaligned: stats.unaligned, aramaicTokens: stats.aramaic, forms: forms.size, rows, formsWithSeveralReadings: ambiguous, lemmas: Object.keys(lemmas).length, lemmasWithoutGloss: lemmasWithoutEntry, segMismatch: stats.segMismatch };

const outDir = path.join('public', 'lexicon', 'he');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'biblical-index.json'), JSON.stringify(index));
const fullBytes = fs.statSync(path.join(outDir, 'biblical-index.json')).size;

// ── the core: closed classes (every form) + the commonest lemmas (forms read ≥ CORE_MIN_FORM times)
const CLOSED = new Set(['ADP', 'CONJ', 'SCONJ', 'PART', 'PRON', 'DET', 'INTJ']);
const byCount = [...lemmaCount].sort((a, b) => b[1] - a[1]);
const coreLemmas = new Set<string>();
for (const [stem] of byCount) if (CLOSED.has(lemmas[stem][2]) && lemmaCount.get(stem)! >= 3) coreLemmas.add(stem);
for (const [stem] of byCount.slice(0, CORE_LEMMAS)) coreLemmas.add(stem);
const core: HebrewFormIndex = { ...index, id: 'oshb-tanakh-core', lemmas: {}, forms: {}, consonantal: {}, stats: undefined };
let coreRows = 0;
let coreTokens = 0;
for (const [key, list] of Object.entries(index.forms)) {
  const keep = list.filter((r) => { const stem = r[0].split('/').pop()!.replace(/\+$/, ''); return coreLemmas.has(stem) && (r[2] >= CORE_MIN_FORM || CLOSED.has(lemmas[stem][2])); });
  if (!keep.length) continue;
  core.forms[key] = keep;
  coreRows += keep.length;
  for (const r of keep) { coreTokens += r[2]; core.lemmas[r[0].split('/').pop()!.replace(/\+$/, '')] = lemmas[r[0].split('/').pop()!.replace(/\+$/, '')]; }
  const skel = consonantal(key);
  if (skel !== key) (core.consonantal[skel] ??= []).push(key);
}
const coreCoverage = coreTokens / (stats.tokens - stats.unaligned);
core.stats = { lemmas: Object.keys(core.lemmas).length, forms: Object.keys(core.forms).length, rows: coreRows, tokenCoverage: Math.round(coreCoverage * 10000) / 10000 };
const genDir = path.join('src', 'adapters', 'hebrew', 'generated');
fs.mkdirSync(genDir, { recursive: true });
const coreTs = `/* GENERATED by scripts/he-build-biblical.mts on ${today} — do not edit. The compact core of the Tanakh form index: the closed classes
 * (every attested form) and the ${CORE_LEMMAS} commonest lemmas (forms read at least ${CORE_MIN_FORM} times), ${core.stats.lemmas} lemmas, ${core.stats.forms} forms, ${coreRows} readings,
 * covering ${(coreCoverage * 100).toFixed(1)} % of the aligned tokens of the Tanakh. Full index: public/lexicon/he/biblical-index.json (npm run he:build-biblical).
 * Sources: ${index.source.label}; ${index.source.licence}. */
import type { HebrewFormIndex } from '../index-store';

export const BIBLICAL_CORE: HebrewFormIndex = ${JSON.stringify(core)};
`;
fs.writeFileSync(path.join(genDir, 'biblical-core.ts'), coreTs);
const coreBytes = fs.statSync(path.join(genDir, 'biblical-core.ts')).size;

const topPos = [...lemmaPos.values()].flatMap((m) => [...m]).reduce<Record<string, number>>((acc, [p, n]) => { acc[p] = (acc[p] ?? 0) + n; return acc; }, {});
const doc = `# Biblical Hebrew form index — build of ${today}

Built by \`npm run he:build-biblical\` from the Biblia app's shipped data (\`${biblia}\`): the Miqra according to the Masorah text
(${SOURCES.text.license}, via Sefaria, fetched ${SOURCES.text.fetched}) aligned with the Open Scriptures Hebrew Bible morphology
(${SOURCES.morphology.license}); glosses from Biblia's lexicon shards (BDB, Strong's, Open Scriptures index — public domain). Every row is the
source's reading of that word in the Bible; nothing here was analysed by this repository.

| measure | value |
|---|---|
| books / verses / tokens | ${stats.books} / ${stats.verses.toLocaleString('en')} / ${stats.tokens.toLocaleString('en')} |
| tokens Biblia could not align (skipped) | ${stats.unaligned} |
| Aramaic tokens (tagged arc-bib) | ${stats.aramaic.toLocaleString('en')} |
| distinct pointed forms (cantillation removed) | ${forms.size.toLocaleString('en')} |
| readings (form × lemma × code) | ${rows.toLocaleString('en')} |
| forms with more than one reading | ${ambiguous.toLocaleString('en')} |
| lemmas read in the text | ${Object.keys(lemmas).length.toLocaleString('en')} (${lemmasWithoutEntry} without a lexicon entry, so without a gloss) |
| segmentation strings that did not fit the pointed form | ${stats.segMismatch} |
| full index size | ${(fullBytes / 1e6).toFixed(1)} MB (public/lexicon/he/biblical-index.json, git-ignored) |
| core compiled into the adapter | ${core.stats.lemmas} lemmas, ${core.stats.forms.toLocaleString('en')} forms, ${coreRows.toLocaleString('en')} readings, ${(coreCoverage * 100).toFixed(1)} % of aligned tokens, ${(coreBytes / 1e3).toFixed(0)} kB |

Tokens by part of speech (corpus majority per lemma mapped from the OSHB code): ${Object.entries(topPos).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n.toLocaleString('en')}`).join(', ')}.
`;
fs.mkdirSync(path.join('docs', 'hebrew'), { recursive: true });
fs.writeFileSync(path.join('docs', 'hebrew', 'BIBLICAL-INDEX.md'), doc);
console.log(doc);
