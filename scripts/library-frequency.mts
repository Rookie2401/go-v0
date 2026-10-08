/// <reference types="node" />
/**
 * npm run library:frequency -- <lang|all> [--library public/library] [--dict public/dict] [--date YYYY-MM-DD] [--no-bundled] [--dry-run]
 *
 * R9 (docs/audits/COURSE-AUDIT-2026-10-07.md 4.6 item 16): corpus frequency for the dictionary, from the INSTALLED library. The dictionary
 * source (kaikki) carries none, so the lemma counts come from what the learner can read:
 *
 *   library   every profile (`public/library/<lang>/p/**`) the index lists: its `lemmas` are the lemma counts the importer already wrote
 *             (no analysis is re-run, so this is a read of the profiles, seconds even for Spanish)
 *   bundled   `data/corpus/<lang>/*.json` and the ladder units `data/ladder/<lang>/units/*.json`, imported with today's adapter (+ the
 *             installed dictionary when there is one) into a private memory store and measured: for a language without a library
 *             (Norwegian) these are the only source
 *
 * Writes `<dict>/<lang>/frequency.json` ({@link FrequencyFile}: lemmas met at least 3 times, per million words, most frequent first, the
 * rank being the position) and sets `hasFrequency: true` in the dictionary manifest when there is one (a language without a dictionary
 * gets the sidecar alone). Proper names and numerals are left out; parts of speech are merged. Records the sources and the date.
 * Reads and writes only local files. `public/dict` is git-ignored built data, so the sidecar is regenerated, never committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COURSES, LANGUAGES, ids, type LanguageCode, type TextProfile } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { createCourseCatalog } from '../src/course';
import { createFileLexiconSource } from '../src/dict/file';
import { buildFrequencyFile, writeFrequencySidecar } from '../src/dict/frequency-node';
import type { FrequencySource } from '../src/dict/frequency';
import { importDocuments } from '../src/ingest';
import type { CorpusDocument } from '../src/ingest';
import { groupedAnalysesOf, measureStoredText } from '../src/library/measure';
import { createAuditStore } from './audit-store';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k: string) => args.includes(`--${k}`);
const target = args.find((a) => !a.startsWith('--') && a !== opt('library') && a !== opt('dict') && a !== opt('date'));
if (!target || (target !== 'all' && !(LANGUAGES as readonly string[]).includes(target))) {
  console.error('usage: npm run library:frequency -- <lang|all> [--library public/library] [--dict public/dict] [--date YYYY-MM-DD] [--no-bundled] [--dry-run]');
  process.exit(1);
}
const libraryDir = path.resolve(opt('library') ?? 'public/library');
const dictDir = path.resolve(opt('dict') ?? 'public/dict');
const date = opt('date') ?? new Date().toLocaleDateString('sv');
const dry = flag('dry-run');

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
const LEMMA_ID = /^lemma:[^:]+:(.*?)(?::([A-Z]+))?$/;
const NAME_POS = new Set(['PROPN', 'NUM']);

/** Add a profile's lemma counts (names and numerals left out); returns the words of the profile. */
function addProfile(counts: Map<string, number>, p: Pick<TextProfile, 'lemmas' | 'words'>): number {
  for (const [id, n] of p.lemmas) {
    const m = LEMMA_ID.exec(id);
    if (!m || (m[2] !== undefined && NAME_POS.has(m[2]))) continue;
    counts.set(m[1], (counts.get(m[1]) ?? 0) + n);
  }
  return p.words;
}

const docsIn = (dir: string): CorpusDocument[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(path.join(dir, f)) as CorpusDocument) : [];

async function frequencyOf(lang: LanguageCode): Promise<void> {
  const t0 = Date.now();
  const counts = new Map<string, number>();
  const sources: FrequencySource[] = [];
  let words = 0;

  // 1. the installed library: the profiles' own lemma counts
  const root = path.join(libraryDir, lang);
  const manifestFile = path.join(root, 'manifest.json');
  if (fs.existsSync(manifestFile)) {
    const manifest = readJson(manifestFile) as { id: string; shards: Array<{ file: string }> };
    let texts = 0, w = 0;
    for (const s of manifest.shards) {
      const shard = readJson(path.join(root, s.file)) as { rows: Array<{ profilePath?: string }> };
      for (const r of shard.rows) {
        if (!r.profilePath) continue;
        const file = path.join(root, r.profilePath);
        if (!fs.existsSync(file)) continue;
        w += addProfile(counts, readJson(file) as TextProfile);
        texts++;
      }
    }
    sources.push({ id: manifest.id, kind: 'library', texts, words: w });
    words += w;
  }
  const tLibrary = Date.now() - t0;

  // 2. the bundled corpus and the ladder units, analysed now with the course adapter
  let tBundled = 0;
  if (!flag('no-bundled')) {
    const t1 = Date.now();
    const adapters = createAdapterRegistry();
    const hasDict = fs.existsSync(path.join(dictDir, lang, 'manifest.json'));
    const dict = hasDict ? createFileLexiconSource(dictDir, lang) : undefined;
    const lexicon = dict ? (l: LanguageCode) => (l === lang ? dict : undefined) : undefined;
    const course = COURSES.find((c) => c.lang === lang);
    const catStore = createAuditStore();
    if (course) await createCourseCatalog({ store: catStore }).install(course.id);
    const stageRows = await catStore.stages.all();
    const workRows = await catStore.works.all();
    const groups: Array<{ kind: 'bundled' | 'ladder'; id: string; docs: CorpusDocument[] }> = [
      { kind: 'bundled', id: `data/corpus/${lang}`, docs: docsIn(path.join('data', 'corpus', lang)) },
      { kind: 'ladder', id: `data/ladder/${lang}/units`, docs: docsIn(path.join('data', 'ladder', lang, 'units')) },
    ];
    for (const g of groups) {
      let texts = 0, w = 0, skipped = 0;
      for (const doc of g.docs) {
        if (doc.lang !== lang) { skipped++; continue; }
        const store = createAuditStore();
        await store.stages.bulkPut(stageRows.map((s) => structuredClone(s)));
        await store.works.bulkPut(workRows.map((x) => structuredClone(x)));
        try {
          const report = await importDocuments(store, adapters, [doc], { lexicon, clock: () => `${date}T00:00:00.000Z` });
          if (report.documents[0]?.action === 'rejected') { skipped++; continue; }
          const m = await measureStoredText(store, ids.text(lang, doc.id), { analysesOf: groupedAnalysesOf(store) });
          if (!m) { skipped++; continue; }
          w += addProfile(counts, m.profile);
          texts++;
        } catch { skipped++; }
      }
      if (texts) sources.push({ id: g.id, kind: g.kind, texts, words: w });
      words += w;
      if (skipped) console.log(`  (${g.id}: ${skipped} document(s) skipped: not importable here)`);
    }
    tBundled = Date.now() - t1;
  }

  if (words === 0) { console.log(`library:frequency ${lang} - nothing to count (no library, no bundled text)`); return; }
  const file = buildFrequencyFile({ lang, date, counts, words, sources });
  const top = file.lemmas.slice(0, 8).map(([l, f]) => `${l} ${f}`).join(', ');
  console.log(`library:frequency ${lang} - ${file.lemmas.length} lemmas (>= ${file.minCount} occurrences) of ${counts.size} distinct, over ${words} words`);
  for (const s of sources) console.log(`  source ${s.kind.padEnd(7)} ${s.id}: ${s.texts} texts, ${s.words} words`);
  console.log(`  top: ${top}`);
  if (dry) { console.log('  --dry-run: nothing written'); } else {
    const w = writeFrequencySidecar(dictDir, file);
    console.log(`  wrote ${path.relative(process.cwd(), w.file)} (${(w.bytes / 1024).toFixed(0)} kB); dictionary manifest ${w.manifestPatched ? 'hasFrequency set to true' : 'absent (no dictionary built: the sidecar stands alone)'}`);
  }
  console.log(`  time: library ${tLibrary} ms, bundled+ladder ${tBundled} ms, total ${Date.now() - t0} ms`);
}

for (const lang of target === 'all' ? LANGUAGES : [target as LanguageCode]) await frequencyOf(lang);
