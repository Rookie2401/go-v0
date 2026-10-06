/// <reference types="node" />
/**
 * npm run library:audit -- <lang> [--deep] [--read] [--limit N] [--offset K] [--only <slug-prefix>] [--dict <dir>] [--out <file>]
 *
 * Is every installed text IN ORDER, and is every text mapped COMPLETELY AND ACCURATELY to GoLearn?
 * Reads the built library of one language (public/library/<lang>) and the course catalogue, and checks, per text:
 *
 *  structure   the manifest, the index rows, the document and profile files agree; no row without its files, no file
 *              without its row, no id twice
 *  catalogue   the work a text names exists in the course catalogue; the row's rights, shelf and stream are the
 *              catalogue's; a shelf or stream the course does not have is reported
 *  order       inside a work the chapter numbers are unique, run without gaps and are the order the index lists them
 *              in; Scripture is checked against the canon (book order, every chapter present, none twice), together
 *              with the bundled texts of the same work
 *  --deep      the document is imported afresh with TODAY'S adapters and dictionary — exactly what a learner's device
 *              does when the text is opened — and measured; the stored profile and the row's features must equal the
 *              fresh ones (forms, lemmas, units, constructions, counts). Also: the stored text keeps the document's
 *              words exactly, every word has a form row, every analysis its lemma row, every unit and construction
 *              occurrence its catalogue row, and the text carries its work, chapter and publication decision
 *  --read      (with --deep) a learner reads the whole text through the real GoLearn: every sentence is counted as
 *              seen, and the learner's items are exactly the forms, lemmas, units and constructions of the profile
 *
 * Reports counts per check and the first examples of each failure; writes the full list as JSON with --out.
 * Changes nothing. Exit 1 when any check fails.
 */
import crypto from 'node:crypto';
import { createAuditStore as createMemoryStore } from './audit-store';
import fs from 'node:fs';
import path from 'node:path';
import { COURSES, StoreEventBus, ids, seedBasics } from '../src/core';
import type { CatalogText, LanguageCode, Stage, TextProfile, Work } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { createCourseCatalog } from '../src/course';
import { createFileLexiconSource } from '../src/dict/file';
import { createGoLearn } from '../src/golearn';
import { computePublished, importDocuments, loadBundledCorpus } from '../src/ingest';
import type { CorpusDocument } from '../src/ingest';
import { parseManifest, parseShard } from '../src/library/format';
import { groupedAnalysesOf, measureStoredText } from '../src/library/measure';
import { CANON, bookIndex, runningNumber } from './lib-canon.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const lang = args.find((a) => !a.startsWith('--')) as LanguageCode | undefined;
const flag = (k: string) => args.includes(`--${k}`);
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
if (!lang) { console.error('usage: npm run library:audit -- <lang> [--deep] [--read] [--limit N] [--offset K] [--only <slug-prefix>] [--dict <dir>] [--out <file>]'); process.exit(1); }
if (lang === ('all' as string)) {
  // every language that has a library, one after the other, same options; exit 1 when any fails
  const { spawnSync } = await import('node:child_process');
  let failed = 0;
  for (const l of ['es', 'de', 'hi', 'sq', 'th']) {
    if (!fs.existsSync(path.join(path.resolve(opt('library') ?? 'public/library'), l, 'manifest.json'))) { console.log(`library:audit ${l} — no library installed`); continue; }
    const r = spawnSync(process.execPath, [path.resolve('node_modules/vite-node/dist/cli.mjs'), '--config', path.resolve('scripts/vite.config.ts'), path.resolve('scripts/library-audit.mts'), l, ...args.filter((x) => x !== 'all')], { stdio: 'inherit' });
    if (r.status !== 0) failed++;
  }
  process.exit(failed ? 1 : 0);
}
const deep = flag('deep');
const read = flag('read');
const limit = Number(opt('limit') ?? Infinity);
const offset = Number(opt('offset') ?? 0);
const only = opt('only');
const root = path.resolve(opt('library') ?? 'public/library', lang);
const dictDir = opt('dict') ?? 'public/dict';

// ───────────────────────────── findings ─────────────────────────────

const findings = new Map<string, string[]>();
const checked = new Map<string, number>();
const fail = (check: string, detail: string) => { (findings.get(check) ?? findings.set(check, []).get(check)!).push(detail); };
const ok = (check: string) => checked.set(check, (checked.get(check) ?? 0) + 1);
/** Count one check; record a finding when it does not hold. */
const expect = (check: string, holds: boolean, detail: () => string) => { ok(check); if (!holds) fail(check, detail()); };

// ───────────────────────────── the canon ─────────────────────────────

// ───────────────────────────── load ─────────────────────────────

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = parseManifest(readJson(path.join(root, 'manifest.json')), lang);
if (!manifest) { console.error(`no readable library manifest at ${root}`); process.exit(1); }
const rows: CatalogText[] = [];
for (const s of manifest.shards) {
  const raw = readJson(path.join(root, s.file)) as { rows?: unknown[] };
  const parsed = parseShard(raw, lang);
  expect('structure: every row of an index shard is well formed', parsed.length === (raw.rows?.length ?? 0) && parsed.length === s.rows, () => `${s.file}: ${raw.rows?.length} rows in the file, ${parsed.length} well formed, manifest says ${s.rows}`);
  for (const r of parsed) {
    expect('structure: a row is listed under its own primary stream', r.stream === s.stream, () => `${r.id}: stream ${r.stream} in shard ${s.file}`);
    rows.push(r);
  }
}
expect('structure: the manifest counts the texts it lists', rows.length === manifest.texts, () => `manifest ${manifest.texts}, rows ${rows.length}`);
const seenIds = new Set<string>();
for (const r of rows) { expect('structure: no text id twice', !seenIds.has(r.id), () => r.id); seenIds.add(r.id); }
const walk = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
const rel = (f: string) => path.relative(root, f).split(path.sep).join('/');
const docFiles = new Set(walk(path.join(root, 't')).map(rel));
const profileFiles = new Set(walk(path.join(root, 'p')).map(rel));
for (const r of rows) {
  expect('structure: every row has its document file', !!r.documentPath && docFiles.has(r.documentPath), () => `${r.id}: ${r.documentPath}`);
  expect('structure: every row has its profile file', !!r.profilePath && profileFiles.has(r.profilePath), () => `${r.id}: ${r.profilePath}`);
}
const rowDocs = new Set(rows.map((r) => r.documentPath));
const rowProfiles = new Set(rows.map((r) => r.profilePath));
for (const f of docFiles) expect('structure: no document file without a row', rowDocs.has(f), () => f);
for (const f of profileFiles) expect('structure: no profile file without a row', rowProfiles.has(f), () => f);
expect('structure: the manifest word count is the sum of the rows', rows.reduce((n, r) => n + r.features.words, 0) === manifest.words, () => `manifest ${manifest.words}, rows ${rows.reduce((n, r) => n + r.features.words, 0)}`);

// ───────────────────────────── the catalogue ─────────────────────────────

const course = COURSES.find((c) => c.lang === lang)!;
const catStore = createMemoryStore();
const catalog = createCourseCatalog({ store: catStore });
await catalog.install(course.id);
const works = new Map<string, Work>((await catStore.works.where('courseId', course.id)).map((w) => [w.id, w]));
const stages = new Map<string, Stage>((await catalog.stages(course.id)).map((s) => [s.id, s]));
const streams = await catalog.streams(course.id);
const streamKeys = new Set(streams.map((s) => s.key));

const byWork = new Map<string, CatalogText[]>();
for (const r of rows) {
  expect('catalogue: every text names a work', !!r.workId, () => r.id);
  if (!r.workId) continue;
  (byWork.get(r.workId) ?? byWork.set(r.workId, []).get(r.workId)!).push(r);
}
for (const [workId, list] of byWork) {
  const w = works.get(workId);
  expect('catalogue: the work of a text is in the course catalogue', !!w, () => `${workId} (${list.length} texts, e.g. ${list[0].id})`);
  if (!w) continue;
  expect('catalogue: the rights of the texts are the rights of their work', list.every((r) => r.rights === w.rights.state), () => `${workId}: work ${w.rights.state}, texts ${[...new Set(list.map((r) => r.rights))].join(', ')}`);
  expect('catalogue: a work with texts in the library is recorded as bundlable', w.rights.canBundle === true && !w.rights.userImportOnly, () => `${workId}: canBundle ${w.rights.canBundle}, userImportOnly ${w.rights.userImportOnly}`);
  expect('catalogue: the shelf of the texts is the shelf of their work', list.every((r) => (r.stageId ?? w.stageId) === w.stageId), () => `${workId}: work on ${w.stageId}, texts on ${[...new Set(list.map((r) => r.stageId ?? '(none)'))].join(', ')}`);
  expect('catalogue: the shelf of a work exists in the course', stages.has(w.stageId), () => `${workId}: ${w.stageId}`);
  if (streamKeys.size) {
    expect('catalogue: the stream of the texts is a stream of the course', list.every((r) => streamKeys.has(r.stream)), () => `${workId}: ${[...new Set(list.map((r) => r.stream))].join(', ')} (course streams: ${[...streamKeys].join(', ')})`);
    expect('catalogue: the stream of the texts is a stream of their work', list.every((r) => (w.streams ?? []).includes(r.stream)), () => `${workId}: texts in ${[...new Set(list.map((r) => r.stream))].join(', ')}, work in ${(w.streams ?? []).join(', ') || '(none)'}`);
  }
  expect('catalogue: the work says its texts are in the library', w.ingestion === 'ingested' || w.ingestion === 'bundled', () => `${workId}: ingestion "${w.ingestion}"`);
}

// ───────────────────────────── order ─────────────────────────────

const bundled = loadBundledCorpus().filter((d) => d.lang === lang);
const bundledByWork = new Map<string, CorpusDocument[]>();
for (const d of bundled) {
  if (!d.work?.slug) continue;
  const id = ids.work(course.id, d.work.slug);
  (bundledByWork.get(id) ?? bundledByWork.set(id, []).get(id)!).push(d);
}
const docOf = (r: CatalogText): CorpusDocument => readJson(path.join(root, r.documentPath!)) as CorpusDocument;

// the other direction: a catalogue work that says its texts are installed must have them, in the library or bundled
const bundledIds = new Set(bundled.map((d) => ids.text(lang, d.id)));
for (const w of works.values()) {
  if (w.ingestion !== 'ingested') continue;
  expect('catalogue: a work recorded as installed has texts in the library', byWork.has(w.id), () => `${w.id}: ingestion "ingested", no library text`);
}
for (const r of rows) expect('structure: no library text has the id of a bundled text', !bundledIds.has(r.id), () => `${r.id} is also bundled: opening it would show the bundled text`);
// the same words twice: a text whose sentences are exactly those of another text of the language
{
  const seenBody = new Map<string, string>();
  for (const r of rows) {
    const d = docOf(r);
    const body = d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [(p as { text: string }).text]))).join('\n').normalize('NFC').replace(/\s+/g, ' ').trim();
    const key = crypto.createHash('sha256').update(body).digest('hex');
    const first = seenBody.get(key);
    expect('order: no text has exactly the words of another text', first === undefined || body.length < 40, () => `${r.id} has the same words as ${first}`);
    if (first === undefined) seenBody.set(key, r.id);
  }
}

for (const [workId, list] of byWork) {
  const numbers = list.map((r) => r.chapter);
  expect('order: every text of a work has a chapter number', numbers.every((n) => typeof n === 'number'), () => workId);
  const nums = numbers.filter((n): n is number => typeof n === 'number');
  expect('order: no chapter number twice in a work', new Set(nums).size === nums.length, () => `${workId}: ${nums.filter((n, i) => nums.indexOf(n) !== i).slice(0, 5).join(', ')}`);
  expect('order: the index lists the chapters of a work in chapter order', nums.every((n, i) => i === 0 || nums[i - 1] < n), () => `${workId}: ${nums.slice(0, 12).join(', ')}…`);
  const also = bundledByWork.get(workId) ?? [];
  const scripture = list.some((r) => r.stream === 'scripture');
  // A complete lazy Bible owns all 1,189 canonical chapter rows. Starter
  // passages remain bundled for reader continuity, but their chapter numbers
  // must not be counted a second time in the lazy canon's order check.
  const fullLazyScripture = scripture && list.length === CANON.reduce((n, [, count]) => n + count, 0);
  const all = [...nums, ...(fullLazyScripture ? [] : also.map((d) => d.work!.chapter?.index).filter((n): n is number => typeof n === 'number'))].sort((a, b) => a - b);
  expect('order: bundled and library chapters of one work do not share a number', new Set(all).size === all.length, () => `${workId}: ${all.filter((n, i) => all.indexOf(n) !== i).join(', ')} (bundled: ${also.map((d) => `${d.id}=${d.work!.chapter?.index}`).join(', ')})`);
  if (!scripture) {
    const first = all[0];
    expect('order: the chapters of a work start at 1 (or 0 for front matter)', first === 0 || first === 1, () => `${workId}: starts at ${first}`);
    expect('order: the chapters of a work run without gaps', all.every((n, i) => i === 0 || n === all[i - 1] + 1), () => `${workId}: ${all.filter((n, i) => i > 0 && n !== all[i - 1] + 1).slice(0, 6).map((n) => `…${n}`).join(' ')} (of ${all.length})`);
    continue;
  }
  // Scripture: the canon decides. A full lazy canon is checked independently;
  // bundled starter passages are still structurally validated below.
  const have = new Map<string, { number?: number; where: string }>();
  const note = (book: string | undefined, chapter: number | undefined, number: number | undefined, where: string) => {
    expect('order (Scripture): every chapter says its book and chapter', !!book && typeof chapter === 'number' && bookIndex.has(book ?? ''), () => `${where}: book ${String(book)}, chapter ${String(chapter)}`);
    if (!book || typeof chapter !== 'number') return;
    const key = `${book}.${chapter}`;
    expect('order (Scripture): no chapter twice', !have.has(key), () => `${key}: ${where} and ${have.get(key)?.where}`);
    have.set(key, { number, where });
    const want = runningNumber(book, chapter);
    expect('order (Scripture): a chapter is numbered by its place in the canon', number === want, () => `${where}: ${key} is numbered ${number}, its place is ${want}`);
  };
  for (const r of list) { const d = docOf(r); note(d.scripture?.book, d.scripture?.chapter, r.chapter, r.id); }
  for (const d of also) {
    const whole = d.sections.length === 1 && typeof d.scripture?.chapter === 'number' && (d.sections[0].chapter ?? d.scripture.chapter) === d.scripture.chapter;
    const verses = d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences : []))).flatMap((s) => s.verseRefs ?? []);
    const oneChapter = new Set(verses.map((v) => v.split('.').slice(0, 2).join('.'))).size === 1;
    if (fullLazyScripture) {
      const bundledSentences = d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences : [])));
      const validRefs = verses.every((v) => {
        const [book, chapter, verse] = v.split('.');
        const count = CANON.find(([b]) => b === book)?.[1];
        return !!count && Number.isInteger(Number(chapter)) && Number(chapter) >= 1 && Number(chapter) <= count && Number.isInteger(Number(verse)) && Number(verse) >= 1;
      });
      expect('order (Scripture): bundled starter has identified verse references', verses.length > 0 && validRefs, () => `bundled ${d.id}: starter references are incomplete or out of range`);
      expect('order (Scripture): bundled starter has non-empty verse text', bundledSentences.length > 0 && bundledSentences.every((s) => s.text.trim().length > 0), () => `bundled ${d.id}: empty starter verse`);
      if (whole && oneChapter) {
        expect('order (Scripture): bundled full chapter has canonical metadata', !!d.scripture?.book && typeof d.scripture.chapter === 'number' && bookIndex.has(d.scripture.book), () => `bundled ${d.id}: missing book/chapter metadata`);
        const expected = d.scripture?.book && typeof d.scripture.chapter === 'number' ? runningNumber(d.scripture.book, d.scripture.chapter) : undefined;
        expect('order (Scripture): bundled full chapter keeps canonical selection index', d.work?.chapter?.index === expected, () => `bundled ${d.id}: index ${String(d.work?.chapter?.index)}, expected ${String(expected)}`);
      } else {
        expect('order (Scripture): bundled starter selection is front matter', d.work?.chapter === undefined || d.work.chapter.index === 0, () => `bundled ${d.id}: verse selection filed as chapter ${String(d.work?.chapter?.index)}`);
      }
    } else if (whole && oneChapter) note(d.scripture?.book, d.scripture?.chapter, d.work!.chapter?.index, `bundled ${d.id}`);
    else expect('order (Scripture): a bundled selection of verses stands before chapter 1 (number 0), never as a chapter', d.work!.chapter === undefined || d.work!.chapter.index === 0, () => `bundled ${d.id}: verses of ${[...new Set(verses.map((v) => v.split('.').slice(0, 2).join('.')))].join(', ')} filed as chapter ${d.work!.chapter?.index}`);
  }
  for (const [book, count] of CANON) for (let c = 1; c <= count; c++) expect('order (Scripture): every chapter of the canon is present', have.has(`${book}.${c}`), () => `${workId}: ${book} ${c} is missing`);
}

// ───────────────────────────── deep: the mapping to GoLearn ─────────────────────────────

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const diffPairs = (a: Array<[string, number]>, b: Array<[string, number]>): string => {
  const A = new Map(a), B = new Map(b);
  const onlyA = [...A.keys()].filter((k) => !B.has(k));
  const onlyB = [...B.keys()].filter((k) => !A.has(k));
  const count = [...A.keys()].filter((k) => B.has(k) && A.get(k) !== B.get(k));
  return `${onlyA.length} only stored (${onlyA.slice(0, 3).join(', ')}), ${onlyB.length} only fresh (${onlyB.slice(0, 3).join(', ')}), ${count.length} with another count (${count.slice(0, 3).join(', ')})`;
};

let deepDone = 0, deepWords = 0;
const analyzerSets = new Map<string, number>();
const t0 = Date.now();
if (deep) {
  const adapters = createAdapterRegistry();
  const dict = fs.existsSync(path.join(dictDir, lang, 'manifest.json')) ? createFileLexiconSource(dictDir, lang) : undefined;
  const lexicon = dict ? (l: LanguageCode) => (l === lang ? dict : undefined) : undefined;
  console.log(`deep: importing each text afresh with adapter ${adapters.get(lang).version}${dict ? ` and the installed dictionary (${dictDir}/${lang})` : ' and NO dictionary (none installed)'}`);
  const stageRows = [...stages.values()];
  const workRows = [...works.values()];
  const chosen = rows.filter((r) => !only || r.id.replace(/^text:[a-z]+:/, '').startsWith(only)).slice(offset, offset + limit);
  for (const r of chosen) {
    const where = r.id;
    let doc: CorpusDocument;
    try { doc = docOf(r); } catch (e) { fail('deep: the document can be read', `${where}: ${e instanceof Error ? e.message : String(e)}`); continue; }
    let stored: TextProfile;
    try { stored = readJson(path.join(root, r.profilePath!)) as TextProfile; } catch (e) { fail('deep: the profile can be read', `${where}: ${e instanceof Error ? e.message : String(e)}`); continue; }
    expect('deep: the document is the text the row names', doc.lang === lang && ids.text(lang, doc.id) === r.id, () => `${where}: document ${doc.lang}/${doc.id}`);
    expect('deep: the document names the row\'s work and chapter', !!doc.work && ids.work(doc.work.courseId ?? course.id, doc.work.slug) === r.workId && doc.work.chapter?.index === r.chapter, () => `${where}: document work ${doc.work?.slug} chapter ${doc.work?.chapter?.index}, row ${r.workId} chapter ${r.chapter}`);
    expect('deep: the row\'s title is the document\'s', doc.title === r.title, () => `${where}: "${r.title}" / "${doc.title}"`);
    expect('deep: the row\'s publication decision is the document\'s', computePublished(doc).published === r.published, () => `${where}: row ${r.published}, document ${computePublished(doc).published} (${computePublished(doc).unpublishedReasons.join('; ')})`);

    const store = createMemoryStore();
    await store.stages.bulkPut(stageRows.map((s) => structuredClone(s)));
    await store.works.bulkPut(workRows.map((w) => structuredClone(w)));
    const clock = () => '2026-10-02T00:00:00.000Z';
    let report;
    try { report = await importDocuments(store, adapters, [doc], { lexicon, clock }); }
    catch (e) { fail('deep: the text imports', `${where}: ${e instanceof Error ? e.message : String(e)}`); continue; }
    const d0 = report.documents[0];
    expect('deep: the text imports', !!d0 && d0.action !== 'rejected' && d0.issues.every((i) => i.severity !== 'error'), () => `${where}: ${d0?.action}; ${d0?.issues.filter((i) => i.severity === 'error').slice(0, 2).map((i) => i.message).join('; ')}`);
    if (!d0 || d0.action === 'rejected') continue;
    expect('deep: the importer knows the work', d0.issues.every((i) => i.code !== 'unknown-work'), () => `${where}: ${d0.issues.filter((i) => i.code === 'unknown-work').map((i) => i.message).join('; ')}`);
    const text = (await store.texts.get(r.id))!;
    expect('deep: the stored text carries its work, chapter, stream and publication', !!text && text.workId === r.workId && text.chapter?.index === r.chapter && text.published === r.published && (text.streams ?? []).includes(r.stream),
      () => `${where}: stored work ${text?.workId} chapter ${text?.chapter?.index} published ${text?.published} streams ${(text?.streams ?? []).join(',')}; row ${r.workId} / ${r.chapter} / ${r.published} / ${r.stream}`);

    // the words of the document are the words of the stored text
    const sentences = (await store.sentences.where('textId', r.id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
    const docSentences = doc.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [])));
    const paragraphsOnly = doc.sections.some((s) => s.paragraphs.some((p) => !('sentences' in p)));
    if (!paragraphsOnly) expect('deep: the stored sentences are the document\'s sentences, in order', eq(sentences.map((s) => s.text), docSentences.map((x) => x.normalize('NFC'))) || eq(sentences.map((s) => s.text), docSentences), () => `${where}: ${sentences.length} stored, ${docSentences.length} in the document`);
    else {
      const paras = (await store.paragraphs.where('textId', r.id)).sort((a, b) => a.index - b.index).map((p) => p.originalText);
      const docParas = doc.sections.flatMap((s) => s.paragraphs.map((p) => ('sentences' in p ? p.sentences.map((x) => x.text).join(' ') : (p as { text: string }).text)));
      expect('deep: the stored paragraphs are the document\'s paragraphs, in order', paras.length === docParas.length && paras.every((p, i) => p !== undefined && (p === docParas[i] || p.normalize('NFC') === docParas[i]?.normalize('NFC'))), () => `${where}: ${paras.length} stored, ${docParas.length} in the document`);
    }
    expect('deep: the text has sentences', sentences.length > 0, () => where);
    const sentenceText = new Map(sentences.map((s) => [s.id, s.text]));

    // every word is an item GoLearn can credit
    const tokens = await store.tokens.where('textId', r.id);
    const words = tokens.filter((t) => t.isWord);
    // a form item is identified by the language and the normalized form: the token must carry exactly that id
    expect('deep: every word carries the id of its form item', words.every((t) => t.formId === ids.form(lang, t.normalized) && t.normalized.length > 0), () => `${where}: ${words.filter((t) => t.formId !== ids.form(lang, t.normalized)).length} of ${words.length} words`);
    expect('deep: every word is a slice of its sentence', words.every((t) => { const s = sentenceText.get(t.sentenceId); return s !== undefined && s.slice(t.start, t.end) === t.surface; }), () => where);
    const mine = await store.analyses.all(); // the store holds this one text
    const lemmaIds = [...new Set(mine.map((a) => a.lemmaId).filter((x): x is string => !!x))];
    const lemmaRows = new Set((await store.lemmas.getMany(lemmaIds)).filter(Boolean).map((l) => l!.id));
    expect('deep: every analysis names a lemma that exists', lemmaIds.every((id) => lemmaRows.has(id)), () => `${where}: ${lemmaIds.filter((id) => !lemmaRows.has(id)).slice(0, 3).join(', ')}`);
    const phraseOcc = await store.phraseOccurrences.where('textId', r.id);
    const phraseRows = new Set((await store.phrases.getMany([...new Set(phraseOcc.map((o) => o.phraseId))])).filter(Boolean).map((p) => p!.id));
    expect('deep: every unit found in the text has its row', phraseOcc.every((o) => phraseRows.has(o.phraseId)), () => where);
    const patternOcc = await store.patternOccurrences.where('textId', r.id);
    const patternRows = new Set((await store.patterns.getMany([...new Set(patternOcc.map((o) => o.patternId))])).filter(Boolean).map((p) => p!.id));
    expect('deep: every construction found in the text has its row', patternOcc.every((o) => patternRows.has(o.patternId)), () => where);

    // the stored profile is what a fresh import measures
    const m = await measureStoredText(store, r.id, { analysesOf: groupedAnalysesOf(store) });
    if (!m) { fail('deep: the text can be measured', where); continue; }
    const fresh = m.profile;
    analyzerSets.set(`stored ${stored.analyzers.join(' + ')} | today ${fresh.analyzers.join(' + ')}`, (analyzerSets.get(`stored ${stored.analyzers.join(' + ')} | today ${fresh.analyzers.join(' + ')}`) ?? 0) + 1);
    expect('deep: the profile was made by today\'s analyzer and dictionary', eq(stored.analyzers, fresh.analyzers), () => `${where}: stored ${stored.analyzers.join(' + ')}; today ${fresh.analyzers.join(' + ')}`);
    expect('deep: the profile counts the words of the text', stored.words === fresh.words && stored.words === words.length, () => `${where}: profile ${stored.words}, fresh ${fresh.words}, stored tokens ${words.length}`);
    expect('deep: the forms of the profile sum to its words', stored.forms.reduce((n, [, c]) => n + c, 0) === stored.words, () => where);
    expect('deep: the profile lists the forms of the text', eq(stored.forms, fresh.forms), () => `${where}: ${diffPairs(stored.forms, fresh.forms)}`);
    expect('deep: the profile lists the lemmas a fresh import finds', eq(stored.lemmas, fresh.lemmas), () => `${where}: ${diffPairs(stored.lemmas, fresh.lemmas)}`);
    expect('deep: the profile lists the units a fresh import finds', eq(stored.phrases, fresh.phrases), () => `${where}: ${diffPairs(stored.phrases, fresh.phrases)}`);
    expect('deep: the profile lists the constructions a fresh import finds', eq(stored.patterns, fresh.patterns), () => `${where}: ${diffPairs(stored.patterns, fresh.patterns)}`);
    expect('deep: the row\'s features are the profile\'s', eq(r.features, stored.features), () => where);
    expect('deep: the features are what a fresh import measures', eq(stored.features, m.features), () => `${where}: ${Object.keys(m.features).filter((k) => !eq((m.features as unknown as Record<string, unknown>)[k], (stored.features as unknown as Record<string, unknown>)[k])).join(', ')}`);

    if (read) {
      const bus = new StoreEventBus(store, clock);
      const golearn = createGoLearn({ store, bus, adapters, clock });
      golearn.attach();
      await seedBasics(store, 'audit', course.id);
      const surface = text.kind === 'scripture' ? 'scripture' : 'corpus';
      const byS = new Map<string, string[]>();
      for (const t of tokens) (byS.get(t.sentenceId) ?? byS.set(t.sentenceId, []).get(t.sentenceId)!).push(t.id);
      for (const s of sentences) {
        await bus.emit({ type: 'SentenceViewed', userId: 'audit', lang, surface, session: 'audit', dedupeKey: `view:audit:${s.id}`, textId: r.id, sentenceId: s.id, tokenIds: byS.get(s.id) ?? [], dwellMs: 2000, contentVersion: text.contentVersion } as never);
      }
      await golearn.settled();
      const items = await store.learnerItems.where('userId', 'audit');
      const got = new Set(items.map((i) => i.itemId));
      const wantForms = fresh.forms.map(([f]) => ids.form(lang, f));
      expect('read: every form of the text became a learner item', wantForms.every((id) => got.has(id)), () => `${where}: ${wantForms.filter((id) => !got.has(id)).length} of ${wantForms.length} missing, e.g. ${wantForms.filter((id) => !got.has(id)).slice(0, 3).join(', ')}`);
      expect('read: every lemma of the profile became a learner item', fresh.lemmas.every(([id]) => got.has(id)), () => `${where}: ${fresh.lemmas.filter(([id]) => !got.has(id)).slice(0, 3).map(([id]) => id).join(', ')}`);
      expect('read: every unit of the profile became a learner item', fresh.phrases.every(([id]) => got.has(id)), () => `${where}: ${fresh.phrases.filter(([id]) => !got.has(id)).slice(0, 3).map(([id]) => id).join(', ')}`);
      expect('read: every construction of the profile became a learner item', fresh.patterns.every(([id]) => got.has(id)), () => `${where}: ${fresh.patterns.filter(([id]) => !got.has(id)).slice(0, 3).map(([id]) => id).join(', ')}`);
      const extra = items.filter((i) => i.itemKind === 'form' && !wantForms.includes(i.itemId));
      expect('read: no form item that is not a form of the text', extra.length === 0, () => `${where}: ${extra.slice(0, 3).map((i) => i.itemId).join(', ')}`);
      const progress = await golearn.readingProgress('audit', r.id);
      expect('read: every sentence of the text is counted as seen', progress.sentencesTotal === sentences.length && progress.sentencesSeen === sentences.length, () => `${where}: seen ${progress.sentencesSeen} of ${progress.sentencesTotal} (${sentences.length} sentences)`);
      const score = await golearn.scoreProfile('audit', stored);
      expect('read: after reading, no word of the text is new to the learner', score.newShare === 0 && Math.abs(score.knownShare + score.familiarShare + score.metShare + score.newShare - 1) < 1e-6, () => `${where}: new ${score.newShare}`);
    }
    deepDone++; deepWords += stored.words;
    if (deepDone % 100 === 0) console.log(`  … ${deepDone} of ${chosen.length} texts, ${deepWords} words, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}

// ───────────────────────────── report ─────────────────────────────

const failed = [...findings.entries()];
console.log(`\nlibrary:audit ${lang} — ${manifest.id}: ${rows.length} texts in ${byWork.size} works, ${manifest.words} words${deep ? `; deep check of ${deepDone} texts (${deepWords} words)${read ? ', read through GoLearn' : ''} in ${((Date.now() - t0) / 1000).toFixed(0)} s` : ''}`);
for (const [k, n] of analyzerSets) console.log(`  analyzers: ${k} — ${n} texts`);
for (const [check, n] of [...checked.entries()].sort()) {
  const bad = findings.get(check)?.length ?? 0;
  console.log(`  ${bad ? 'FAIL' : 'ok  '} ${check}: ${n - bad} of ${n}${bad ? ` — ${bad} not` : ''}`);
  for (const d of (findings.get(check) ?? []).slice(0, 6)) console.log(`         ${d.slice(0, 400)}`);
  if (bad > 6) console.log(`         … and ${bad - 6} more`);
}
const outFile = opt('out');
if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ lang, library: manifest.id, texts: rows.length, deep: deep ? { texts: deepDone, words: deepWords, read } : null, checks: Object.fromEntries([...checked.entries()].sort().map(([k, n]) => [k, { checked: n, failed: findings.get(k)?.length ?? 0 }])), findings: Object.fromEntries(failed) }, null, 1));
}
console.log(failed.length ? `${failed.length} check(s) failed` : 'every check passed');
process.exit(failed.length ? 1 : 0);
