/// <reference types="node" />
/**
 * npm run norway:audit
 *
 * The reproducible Norwegian corpus audit (docs/norway/SPEC.md sections 4, 8 and 11). Prints, as plain text, one row for every
 *   - catalogue work           (data/sources/course-library/nb.json, matched to NORWEGIAN_WORKS by slug; a mismatch is reported),
 *   - bundled document         (data/corpus/nb and data/corpus/nn),
 *   - ladder unit              (data/ladder/nb),
 * with: id, standard (nb | nn), variety, an orthography-era GUESS, the rights state, the number of evidence records, the bundle
 * decision of the real rights gate (src/ingest/rights.ts `bundleDecision`) and the review status; then totals.
 *
 * THE ERA IS A GUESS. It is read from marker words (docs/norway/recon/linguistics-policy.md A3: aa, efter, nu, sprog, bog, gade, hvad,
 * capitalised common nouns, hard versus soft consonants; 'hvem' is on that list but is ordinary modern Bokmal, so it is not counted) in the text when the repository holds one, otherwise from the
 * publication year of the catalogue entry. A person confirms it; nothing here is written back anywhere.
 *
 * "Gate" for a catalogue work with no text: the verdict the gate gives a document that CLAIMS public-domain status and names that
 * work - i.e. whether the catalogue would let such a text ship. Reads files only; downloads nothing; always exits 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import * as course from '../src/course';
import { NORWEGIAN_WORKS } from '../src/course';
import { bundleDecision } from '../src/ingest/rights';
import { rightsContext } from '../src/ingest/rightsCatalogue';
import { documentSentences, loadLadder } from '../src/ladder';
import type { LanguageAdapter, LanguageCode } from '../src/core';

const root = path.resolve('.');
const registry = createAdapterRegistry();
const ctx = rightsContext(course as Record<string, unknown>);

// ───────────────────────────── era guess ─────────────────────────────

interface EraGuess { label: string; markers: string }

const MIN_CAPITALISED_NOUNS = 3;

/**
 * Marker counts in a text. A capitalised common noun is a word that is capitalised inside a sentence AND whose lower-case form the
 * adapter reads as a known noun (names such as Anna or Oslo are not common nouns, so they do not count); the share of such words
 * among all mid-sentence known nouns says whether the text capitalises nouns (Dano-Norwegian) or not (after 1907).
 */
function markersOf(adapter: LanguageAdapter, sentences: string[]): { counts: Record<string, number>; capNounShare: number; capNouns: number } {
  const counts: Record<string, number> = {};
  const bump = (k: string): void => { counts[k] = (counts[k] ?? 0) + 1; };
  const isNoun = (lw: string): boolean => {
    const c = adapter.analyze([{ surface: lw, start: 0, end: lw.length, isWord: true, normalized: lw }])[0]?.candidates[0];
    return c?.pos === 'NOUN' && c.confidence >= 0.5;
  };
  let capNouns = 0, lowNouns = 0;
  for (const s of sentences) {
    const words = s.match(/\p{L}+/gu) ?? [];
    words.forEach((w, i) => {
      const lw = w.toLowerCase();
      if (/aa/.test(lw)) bump('aa');
      if (lw === 'efter') bump('efter');
      if (lw === 'nu') bump('nu');
      if (lw === 'sprog' || lw === 'sproget') bump('sprog');
      if (/^bog(en)?$/.test(lw)) bump('bog');
      if (/^gad(e|en|er)$/.test(lw)) bump('gade');
      if (lw === 'hvad') bump('hvad');
      if (/^(bok|boka|boken|gate|gata|gaten|kake|kaken)$/.test(lw)) bump('hard-cons');
      if (/^(kage|kagen)$/.test(lw)) bump('kage');
      if (i > 0 && !/^\p{Lu}+$/u.test(w) && isNoun(lw)) { if (/^\p{Lu}/u.test(w)) capNouns++; else lowNouns++; }
    });
  }
  return { counts, capNouns, capNounShare: capNouns + lowNouns ? capNouns / (capNouns + lowNouns) : 0 };
}

function guessFromText(adapter: LanguageAdapter, lang: string, sentences: string[]): EraGuess {
  const { counts, capNouns, capNounShare } = markersOf(adapter, sentences);
  const n = (k: string): number => counts[k] ?? 0;
  const soft = n('bog') + n('gade') + n('kage') + n('hvad');
  const caps = capNouns >= MIN_CAPITALISED_NOUNS && capNounShare >= 0.5;
  const riks = n('efter') + n('nu') + n('sprog');
  const markers = Object.entries(counts).map(([k, v]) => `${k}:${v}`).concat(capNouns > 0 ? [`capitalised-nouns:${capNouns} (${(capNounShare * 100).toFixed(0)}%)`] : []).join(' ') || 'none found';
  if (sentences.length === 0) return { label: 'no text', markers: '-' };
  if (lang === 'nn') {
    if (n('aa') + riks + soft > 0 || caps) return { label: 'pre-1917? (older nn spelling, weak guess)', markers };
    return { label: 'no older marker (2012 norm presumed)', markers };
  }
  if (soft > 0 || caps) return { label: 'pre-1907 (Dano-Norwegian?)', markers };
  if (n('aa') > 0) return { label: '1907-1916 (aa, hard consonants?)', markers };
  if (riks > 0) return { label: 'Riksmal-type (efter/nu/sprog; 1917+?)', markers };
  if (n('hard-cons') > 0) return { label: '1907 or later (hard consonants only)', markers };
  return { label: 'no older marker (2005+ presumed)', markers };
}

function guessFromYear(lang: string, year: number | undefined): EraGuess {
  if (year === undefined) return { label: 'unknown (no text, no year)', markers: '-' };
  const nn = lang === 'nn';
  const label = nn
    ? year < 1901 ? 'pre-1901 (Landsmal)' : year < 1917 ? 'nn-1901' : year < 1938 ? 'nn-1917' : year < 1959 ? 'nn-1938' : year < 2012 ? 'nn-1959' : 'nn-2012'
    : year < 1907 ? 'pre-1907 (Dano-Norwegian)' : year < 1917 ? 'nb-1907' : year < 1938 ? 'nb-1917' : year < 1959 ? 'nb-1938' : year < 1981 ? 'nb-1959' : year < 2005 ? 'nb-1981' : 'nb-2005+';
  return { label: `${label} (from year ${year})`, markers: 'no text in the repository' };
}

// ───────────────────────────── rows ─────────────────────────────

interface Row { kind: 'work' | 'document' | 'unit'; id: string; standard: string; variety: string; era: EraGuess; rights: string; evidence: string; gate: string; review: string; note?: string }
const rows: Row[] = [];
const problems: string[] = [];

const readJson = <T,>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

// 1. catalogue: nb.json entries against NORWEGIAN_WORKS
interface ManifestEntry { slug: string; lang?: string; variety?: string; publicationYear?: number; rights?: { state?: string; evidenceRecords?: unknown[] } }
const manifestFile = path.join(root, 'data', 'sources', 'course-library', 'nb.json');
const manifestEntries: ManifestEntry[] = fs.existsSync(manifestFile) ? readJson<{ entries: ManifestEntry[] }>(manifestFile).entries : [];
if (!manifestEntries.length) problems.push('data/sources/course-library/nb.json: not found or has no entries');
const slugOf = (id: string): string => id.split(':').pop() ?? id;

for (const w of NORWEGIAN_WORKS) {
  const slug = slugOf(w.id);
  const entry = manifestEntries.find((e) => e.slug === slug);
  if (!entry) problems.push(`work ${w.id}: no entry in nb.json`);
  else if (entry.rights?.state !== w.rights.state) problems.push(`work ${w.id}: nb.json says "${entry.rights?.state}", NORWEGIAN_WORKS says "${w.rights.state}"`);
  const lang = String(w.lang);
  const decision = bundleDecision({ id: `audit-${slug}`, lang, contentType: 'story', source: { rights: 'public-domain' }, work: { slug } }, ctx);
  rows.push({
    kind: 'work', id: w.id, standard: lang, variety: w.variety ?? '-', era: guessFromYear(lang, w.publicationYear),
    rights: w.rights.state ?? '(none)', evidence: String(w.rights.evidenceRecords?.length ?? 0), gate: decision.verdict,
    review: `${w.ingestion ?? 'catalogued'} / ${w.readiness ?? '-'}`,
  });
}
for (const e of manifestEntries) {
  if (!NORWEGIAN_WORKS.some((w) => slugOf(w.id) === e.slug)) problems.push(`nb.json entry ${e.slug}: not in NORWEGIAN_WORKS`);
}

// 2. documents in data/corpus/nb and data/corpus/nn
interface Doc { id?: string; lang?: string; title?: string; variety?: string; source?: { rights?: string }; review?: { status?: string }; work?: { slug?: string } }
for (const lang of ['nb', 'nn'] as const) {
  const dir = path.join(root, 'data', 'corpus', lang);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    let doc: Doc;
    try { doc = readJson<Doc>(file); } catch (e) { problems.push(`${lang}/${name}: ${(e as Error).message}`); continue; }
    const sentences = documentSentences(registry.get(lang as LanguageCode), doc as never);
    const slug = doc.work?.slug;
    const work = slug ? NORWEGIAN_WORKS.find((w) => w.lang === lang && slugOf(w.id) === slug) : undefined;
    const decision = bundleDecision(doc, ctx);
    rows.push({
      kind: 'document', id: `corpus/${lang}/${doc.id ?? name}`, standard: String(doc.lang ?? lang), variety: doc.variety ?? work?.variety ?? '-',
      era: guessFromText(registry.get(lang as LanguageCode), lang, sentences), rights: (doc.source?.rights ?? '(none)') + (work ? ` + work ${work.rights.state}` : ''),
      evidence: work ? String(work.rights.evidenceRecords?.length ?? 0) : '-', gate: decision.verdict, review: doc.review?.status ?? '(none)',
    });
  }
}

// 3. ladder units (data/ladder/nb)
const ladderFile = path.join(root, 'data', 'ladder', 'nb', 'ladder.json');
if (fs.existsSync(ladderFile)) {
  try {
    const loaded = loadLadder('nb', root);
    for (const lu of loaded.units) {
      const doc = lu.doc as unknown as Doc | undefined;
      const sentences = lu.doc ? documentSentences(registry.get('nb'), lu.doc) : [];
      const decision = doc ? bundleDecision(doc, ctx) : undefined;
      rows.push({
        kind: 'unit', id: `ladder/${lu.unit.id}`, standard: String(doc?.lang ?? 'nb'), variety: doc?.variety ?? '-',
        era: lu.doc ? guessFromText(registry.get('nb'), 'nb', sentences) : { label: `no text (${lu.status})`, markers: '-' },
        rights: doc?.source?.rights ?? (lu.unit.textId ? `by text id ${lu.unit.textId}` : '(none)'), evidence: '-',
        gate: decision?.verdict ?? 'n/a', review: doc?.review?.status ?? (lu.status === 'ok' ? '(none)' : lu.status),
      });
    }
  } catch (e) { problems.push(`data/ladder/nb: ${(e as Error).message}`); }
}

// ───────────────────────────── print ─────────────────────────────

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '~' : s);
const col = (s: string, n: number): string => clip(s, n).padEnd(n);
const widths = { id: 46, std: 3, variety: 12, era: 44, rights: 34, ev: 3, gate: 8, review: 26 };
const header = `${col('id', widths.id)} ${col('std', widths.std)} ${col('variety', widths.variety)} ${col('era (a GUESS)', widths.era)} ${col('rights state', widths.rights)} ${col('ev', widths.ev)} ${col('gate', widths.gate)} ${col('review / status', widths.review)}`;
const line = (r: Row): string => `${col(r.id, widths.id)} ${col(r.standard, widths.std)} ${col(r.variety, widths.variety)} ${col(r.era.label, widths.era)} ${col(r.rights, widths.rights)} ${col(r.evidence, widths.ev)} ${col(r.gate, widths.gate)} ${col(r.review, widths.review)}`;

console.log('norway:audit - Norwegian catalogue, documents and ladder units (read-only; the era column is a GUESS for a person to confirm)');
for (const [kind, title] of [['work', 'CATALOGUE WORKS (data/sources/course-library/nb.json = NORWEGIAN_WORKS; gate = verdict for a document that claims public domain and names the work)'],
  ['document', 'BUNDLED DOCUMENTS (data/corpus/nb, data/corpus/nn; gate = the real verdict on the document)'],
  ['unit', 'LADDER UNITS (data/ladder/nb; gate = the real verdict on the unit document)']] as const) {
  const part = rows.filter((r) => r.kind === kind);
  console.log(`\n${title}: ${part.length}`);
  if (!part.length) continue;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of part) console.log(line(r));
  const withMarkers = part.filter((r) => r.era.markers !== '-' && r.era.markers !== 'none found' && r.era.markers !== 'no text in the repository');
  if (withMarkers.length) {
    console.log('  era markers found (word-level counts in the text):');
    for (const r of withMarkers) console.log(`    ${r.id}: ${r.era.markers}`);
  }
}

const tally = (xs: string[]): string => Object.entries(xs.reduce<Record<string, number>>((m, x) => { m[x] = (m[x] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
console.log('\nTOTALS');
console.log(`  rows: ${rows.length} (${rows.filter((r) => r.kind === 'work').length} works, ${rows.filter((r) => r.kind === 'document').length} documents, ${rows.filter((r) => r.kind === 'unit').length} ladder units)`);
console.log(`  by standard:        ${tally(rows.map((r) => r.standard))}`);
console.log(`  rights state:       ${tally(rows.map((r) => r.rights))}`);
console.log(`  gate verdict:       ${tally(rows.map((r) => r.gate))}`);
console.log(`  review / status:    ${tally(rows.map((r) => r.review))}`);
const works = rows.filter((r) => r.kind === 'work');
console.log(`  works: ${works.filter((r) => r.rights === 'rights-unverified').length} of ${works.length} rights-unverified; evidence records in total ${works.reduce((n, r) => n + Number(r.evidence), 0)}; works with none ${works.filter((r) => r.evidence === '0').length}; works the gate would bundle ${works.filter((r) => r.gate === 'bundle').length}`);
console.log(`  era guesses:        ${tally(rows.map((r) => r.era.label.replace(/ \(from year \d+\)/, '')))}`);
if (problems.length) {
  console.log('\nPROBLEMS FOUND (reported, not fatal)');
  for (const p of problems) console.log(`  - ${p}`);
}
console.log('\nnorway:audit done (exit 0). Nothing was written; nothing was downloaded; no rights state was changed.');
process.exitCode = 0;
