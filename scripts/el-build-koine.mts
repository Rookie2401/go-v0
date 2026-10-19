/// <reference types="node" />
/**
 * npm run el:build-koine -- [--biblia C:/Users/CJWal/dev/biblia-v0] [--core-lemmas 400] [--core-min-form 3]
 *
 * Builds the Koine Greek form index of the Greek adapter from the Biblia app's shipped data: the SBL Greek New Testament
 * (CC BY 4.0) with MorphGNT's analysis of every word (CC BY-SA 3.0), and Biblia's Greek lexicon shards (Dodson, Abbott-Smith,
 * Strong's — public domain) for glosses, Strong's numbers and Septuagint counts. Nothing is downloaded or analysed here.
 *
 * Writes public/lexicon/el/koine-index.json (full, git-ignored), src/adapters/greek/generated/koine-core.ts (the compact core
 * compiled into the adapter) and docs/greek/KOINE-INDEX.md (the numbers of this build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { bare, elKey } from '../src/adapters/greek/text';
import { decodeMorphGnt } from '../src/adapters/greek/morphgnt';
import type { ElFormRow, ElLemmaRow, GreekFormIndex } from '../src/adapters/greek/index-store';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) { if (!args[i].startsWith('--') || args[i + 1] === undefined) { console.error(`bad argument ${args[i]}`); process.exit(1); } opt[args[i].slice(2)] = args[i + 1]; }
const biblia = opt.biblia ?? 'C:/Users/CJWal/dev/biblia-v0';
const CORE_LEMMAS = Number(opt['core-lemmas'] ?? 400);
const CORE_MIN_FORM = Number(opt['core-min-form'] ?? 3);
const grDir = path.join(biblia, 'public', 'data', 'gr');
const lexDir = path.join(biblia, 'public', 'data', 'lex');
if (!fs.existsSync(grDir) || !fs.existsSync(lexDir)) { console.error(`Biblia data not found under ${biblia}`); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const SOURCES = JSON.parse(fs.readFileSync(path.join(grDir, 'SOURCES.json'), 'utf8'));

// ── lexicon shards: lemma → [headword, gloss, pos, count, translit, labels, lxxN]
const lemmas: Record<string, ElLemmaRow> = {};
const manifest = JSON.parse(fs.readFileSync(path.join(lexDir, 'gr-manifest.json'), 'utf8')) as { shards: string[] };
for (const s of manifest.shards) {
  const shard = JSON.parse(fs.readFileSync(path.join(lexDir, `gr-${s}.json`), 'utf8')) as Record<string, { l: string; x?: string; g: string; n: number; lxxN?: number }>;
  for (const e of Object.values(shard)) {
    const row: ElLemmaRow = [e.l.normalize('NFC'), e.g, '', e.n, e.x ?? '', 'el-koi'];
    if (e.lxxN) row[6] = e.lxxN;
    lemmas[e.l.normalize('NFC')] = row;
  }
}

const PUNCT = /^[\s,.;·!?\u037E()«»"'“”‘’\[\]—–-]+|[\s,.;·!?\u037E()«»"'“”‘’\[\]—–-]+$/gu;
const forms = new Map<string, Map<string, number>>();
const lemmaCount = new Map<string, number>();
const lemmaPos = new Map<string, Map<string, number>>();
const stats = { books: 0, verses: 0, tokens: 0, lemmasWithoutEntry: 0 };
for (const f of fs.readdirSync(grDir).sort()) {
  if (!f.endsWith('.json') || f === 'SOURCES.json') continue;
  stats.books++;
  const book = JSON.parse(fs.readFileSync(path.join(grDir, f), 'utf8')) as { chapters: Array<{ verses: Array<{ w: Array<[string, string, string, string?]> }> }> };
  for (const ch of book.chapters) for (const v of ch.verses) {
    stats.verses++;
    for (const [text, lemmaRaw, pos, parse] of v.w) {
      stats.tokens++;
      const lemma = lemmaRaw.normalize('NFC');
      const key = elKey(text.replace(PUNCT, ''));
      if (!key) continue;
      const code = `${pos}|${parse ?? ''}`;
      const m = forms.get(key) ?? new Map<string, number>();
      const k = `${lemma}\t${code}`;
      m.set(k, (m.get(k) ?? 0) + 1);
      forms.set(key, m);
      lemmaCount.set(lemma, (lemmaCount.get(lemma) ?? 0) + 1);
      const upos = decodeMorphGnt(code, lemma).pos;
      const pm = lemmaPos.get(lemma) ?? new Map<string, number>();
      pm.set(upos, (pm.get(upos) ?? 0) + 1);
      lemmaPos.set(lemma, pm);
    }
  }
}
for (const [lemma, n] of lemmaCount) {
  const pos = [...lemmaPos.get(lemma)!].sort((a, b) => b[1] - a[1])[0][0];
  const row = lemmas[lemma];
  if (row) { row[2] = pos; row[3] = n; }
  else { stats.lemmasWithoutEntry++; lemmas[lemma] = [lemma, '', pos, n, '', 'el-koi']; }
}
for (const id of Object.keys(lemmas)) if (!lemmaCount.has(id)) delete lemmas[id];

const index: GreekFormIndex = {
  schema: 1, id: 'morphgnt-sblgnt', codes: 'morphgnt', period: 'el-koi',
  source: {
    label: 'MorphGNT over the SBL Greek New Testament (via the Biblia app)',
    licence: `morphology ${SOURCES.morphology.license}; text ${SOURCES.text.license}; glosses Dodson / Abbott-Smith / Strong\u2019s (public domain)`,
    url: SOURCES.morphology.url,
    note: 'Every row is the source\u2019s reading of that word in the New Testament, not an analysis made here. Keys keep the polytonic marks; a grave is folded to the acute.',
  },
  built: today, lemmas, forms: {}, bare: {},
};
let rows = 0; let ambiguous = 0;
for (const [key, m] of [...forms].sort((a, b) => a[0].localeCompare(b[0]))) {
  const list: ElFormRow[] = [...m].map(([k, n]) => { const [lemma, code] = k.split('\t'); return [lemma, code, n]; });
  list.sort((a, b) => b[2] - a[2]);
  index.forms[key] = list;
  rows += list.length;
  if (list.length > 1) ambiguous++;
  const b = bare(key);
  if (b !== key) (index.bare[b] ??= []).push(key);
}
index.stats = { books: stats.books, verses: stats.verses, tokens: stats.tokens, forms: forms.size, rows, formsWithSeveralReadings: ambiguous, lemmas: Object.keys(lemmas).length, lemmasWithoutGloss: stats.lemmasWithoutEntry };
fs.mkdirSync('public/lexicon/el', { recursive: true });
fs.writeFileSync('public/lexicon/el/koine-index.json', JSON.stringify(index));
const fullBytes = fs.statSync('public/lexicon/el/koine-index.json').size;

// ── the core
const CLOSED = new Set(['ADP', 'CONJ', 'SCONJ', 'PART', 'PRON', 'DET', 'INTJ']);
const byCount = [...lemmaCount].sort((a, b) => b[1] - a[1]);
const coreLemmas = new Set<string>();
for (const [l] of byCount) if (CLOSED.has(lemmas[l][2]) && lemmaCount.get(l)! >= 3) coreLemmas.add(l);
for (const [l] of byCount.slice(0, CORE_LEMMAS)) coreLemmas.add(l);
const core: GreekFormIndex = { ...index, id: 'morphgnt-sblgnt-core', lemmas: {}, forms: {}, bare: {}, stats: undefined };
let coreRows = 0; let coreTokens = 0;
for (const [key, list] of Object.entries(index.forms)) {
  const keep = list.filter((r) => coreLemmas.has(r[0]) && (r[2] >= CORE_MIN_FORM || CLOSED.has(lemmas[r[0]][2])));
  if (!keep.length) continue;
  core.forms[key] = keep;
  coreRows += keep.length;
  for (const r of keep) { coreTokens += r[2]; core.lemmas[r[0]] = lemmas[r[0]]; }
  const b = bare(key);
  if (b !== key) (core.bare[b] ??= []).push(key);
}
const coverage = coreTokens / stats.tokens;
core.stats = { lemmas: Object.keys(core.lemmas).length, forms: Object.keys(core.forms).length, rows: coreRows, tokenCoverage: Math.round(coverage * 10000) / 10000 };
fs.mkdirSync('src/adapters/greek/generated', { recursive: true });
fs.writeFileSync('src/adapters/greek/generated/koine-core.ts', `/* GENERATED by scripts/el-build-koine.mts on ${today} — do not edit. The compact core of the New Testament form index: the closed classes
 * (every attested form) and the ${CORE_LEMMAS} commonest lemmas (forms read at least ${CORE_MIN_FORM} times): ${core.stats.lemmas} lemmas, ${core.stats.forms} forms, ${coreRows} readings,
 * ${(coverage * 100).toFixed(1)} % of the New Testament's words. Full index: public/lexicon/el/koine-index.json (npm run el:build-koine).
 * Sources: ${index.source.label}; ${index.source.licence}. */
import type { GreekFormIndex } from '../index-store';

export const KOINE_CORE: GreekFormIndex = ${JSON.stringify(core)};
`);
const coreBytes = fs.statSync('src/adapters/greek/generated/koine-core.ts').size;
const posTotals: Record<string, number> = {};
for (const pm of lemmaPos.values()) for (const [p, n] of pm) posTotals[p] = (posTotals[p] ?? 0) + n;
const doc = `# Koine Greek form index — build of ${today}

Built by \`npm run el:build-koine\` from the Biblia app's shipped data (\`${biblia}\`): the SBL Greek New Testament (${SOURCES.text.license})
with MorphGNT (${SOURCES.morphology.license}); glosses, Strong's numbers and Septuagint counts from Biblia's Greek lexicon shards (Dodson, Abbott-Smith,
Strong's — public domain; lxx-morph counts). Every row is the source's reading of that word; nothing here was analysed by this repository.

| measure | value |
|---|---|
| books / verses / tokens | ${stats.books} / ${stats.verses.toLocaleString('en')} / ${stats.tokens.toLocaleString('en')} |
| distinct form keys (polytonic, grave folded to acute) | ${forms.size.toLocaleString('en')} |
| readings (form × lemma × code) | ${rows.toLocaleString('en')} |
| forms with more than one reading | ${ambiguous.toLocaleString('en')} |
| lemmas | ${Object.keys(lemmas).length.toLocaleString('en')} (${stats.lemmasWithoutEntry} without a lexicon entry) |
| full index size | ${(fullBytes / 1e6).toFixed(1)} MB (public/lexicon/el/koine-index.json, git-ignored) |
| core compiled into the adapter | ${core.stats.lemmas} lemmas, ${core.stats.forms.toLocaleString('en')} forms, ${coreRows.toLocaleString('en')} readings, ${(coverage * 100).toFixed(1)} % of tokens, ${(coreBytes / 1e3).toFixed(0)} kB |

Tokens by part of speech: ${Object.entries(posTotals).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n.toLocaleString('en')}`).join(', ')}.
`;
fs.mkdirSync('docs/greek', { recursive: true });
fs.writeFileSync('docs/greek/KOINE-INDEX.md', doc);
console.log(doc);
