/// <reference types="node" />
/**
 * Read-only, isolated deep/read audit of every bundled corpus document. Writes only the requested evidence JSON.
 * Unpublished documents are read as preview scenarios for projection coverage; this does not alter their publication
 * state or write learner data to the application database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COURSES, StoreEventBus, ids, seedBasics, type LanguageCode } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { createCourseCatalog } from '../src/course';
import { createFileLexiconSource } from '../src/dict/file';
import { createGoLearn } from '../src/golearn';
import { computePublished, importDocuments, loadBundledCorpus, type CorpusDocument } from '../src/ingest';
import { groupedAnalysesOf, measureStoredText } from '../src/library/measure';
import { createAuditStore } from './audit-store';

const output = process.argv[2] ?? 'work/content-integration-audit/bundled-final.json';
const docs = loadBundledCorpus();
const adapters = createAdapterRegistry();
const store = createAuditStore();
const courseByLang = new Map<LanguageCode, typeof COURSES[number]>(COURSES.map((course) => [course.lang, course]));
const catalog = createCourseCatalog({ store });
const lexicons = new Map<LanguageCode, ReturnType<typeof createFileLexiconSource> | undefined>();
const findings: Array<{ id: string; check: string; detail: string }> = [];
const checks: Record<string, { checked: number; failed: number }> = {};
const rows: Array<Record<string, unknown>> = [];
const totals = { documents: docs.length, imported: 0, rejected: 0, sentences: 0, tokens: 0, words: 0, readingEvents: 0, previewDocuments: 0, privateExcluded: 0, protectedExcluded: 0 };
const clock = () => '2026-10-04T00:00:00.000Z';
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const record = (docId: string, name: string, ok: boolean, detail = ''): void => {
  const row = checks[name] ??= { checked: 0, failed: 0 };
  row.checked++;
  if (!ok) { row.failed++; findings.push({ id: docId, check: name, detail }); }
};
const docParagraphs = (doc: CorpusDocument): string[] => doc.sections.flatMap((section) => section.paragraphs.map((p) =>
  'sentences' in p ? p.sentences.map((s) => s.text).join(' ') : (p as { text: string }).text));

for (const course of COURSES) await catalog.install(course.id);
for (const doc of docs) {
  if (!lexicons.has(doc.lang)) {
    const root = path.join('public/dict', doc.lang);
    lexicons.set(doc.lang, fs.existsSync(path.join(root, 'manifest.json')) ? createFileLexiconSource('public/dict', doc.lang) : undefined);
  }
}
const corpusOf = new Map((await store.corpora.all()).map((c) => [c.id, c]));
const bus = new StoreEventBus(store, clock);
const golearn = createGoLearn({ store, bus, adapters, clock });
golearn.attach();

console.log(`Bundled deep/read audit: ${docs.length} documents; isolated indexed store; adapters/dictionaries loaded locally.`);
for (let i = 0; i < docs.length; i++) {
  const doc = docs[i];
  const id = ids.text(doc.lang, doc.id);
  const course = courseByLang.get(doc.lang);
  if (!course) { record(doc.id, 'document has supported course', false, `no course for ${doc.lang}`); continue; }
  const userId = `bundle-audit-${String(i + 1).padStart(3, '0')}`;
  const lexicon = lexicons.get(doc.lang);
  let report;
  try {
    report = await importDocuments(store, adapters, [doc], { lexicon: lexicon ? (lang) => lang === doc.lang ? lexicon : undefined : undefined, clock });
  } catch (error) {
    totals.rejected++;
    record(doc.id, 'document imports separately', false, error instanceof Error ? error.message : String(error));
    rows.push({ id, lang: doc.lang, import: 'threw' });
    continue;
  }
  const imported = report.documents[0];
  const errors = imported?.issues.filter((issue) => issue.severity === 'error') ?? [];
  record(doc.id, 'document imports separately', !!imported && imported.action !== 'rejected' && errors.length === 0,
    `${imported?.action ?? 'missing'}: ${errors.slice(0, 3).map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
  if (!imported || imported.action === 'rejected') {
    totals.rejected++;
    rows.push({ id, lang: doc.lang, import: imported?.action ?? 'missing', errors });
    continue;
  }
  totals.imported++;
  const text = await store.texts.get(id);
  if (!text) { record(doc.id, 'imported text is present', false, id); continue; }
  const sentences = (await store.sentences.where('textId', id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const sourceSentenceLines = doc.sections.flatMap((section) => section.paragraphs.flatMap((p) => 'sentences' in p ? p.sentences.map((s) => s.text) : []));
  if (sourceSentenceLines.length) {
    record(doc.id, 'explicit source sentences preserved in order', equal(sentences.map((s) => s.text), sourceSentenceLines.map((s) => s.normalize('NFC'))) || equal(sentences.map((s) => s.text), sourceSentenceLines), `${sentences.length} stored, ${sourceSentenceLines.length} declared`);
  }
  const paragraphs = (await store.paragraphs.where('textId', id)).sort((a, b) => a.index - b.index);
  const expectedParagraphs = docParagraphs(doc);
  record(doc.id, 'source paragraphs preserved in order', paragraphs.length === expectedParagraphs.length
    && paragraphs.every((p, index) => typeof p.originalText === 'string' && (p.originalText === expectedParagraphs[index] || p.originalText.normalize('NFC') === expectedParagraphs[index]?.normalize('NFC'))),
  `${paragraphs.length} stored, ${expectedParagraphs.length} declared`);
  const sentenceById = new Map(sentences.map((s) => [s.id, s]));
  const tokens = (await store.tokens.where('textId', id)).sort((a, b) => a.sentenceId.localeCompare(b.sentenceId) || a.index - b.index);
  totals.sentences += sentences.length;
  totals.tokens += tokens.length;
  const words = tokens.filter((token) => token.isWord);
  totals.words += words.length;
  record(doc.id, 'every token has exact in-bounds source offsets', tokens.every((token) => {
    const sentence = sentenceById.get(token.sentenceId);
    return !!sentence && Number.isInteger(token.start) && Number.isInteger(token.end) && token.start >= 0 && token.end > token.start
      && token.end <= sentence.text.length && sentence.text.slice(token.start, token.end) === token.surface;
  }), `${tokens.filter((token) => { const s = sentenceById.get(token.sentenceId); return !s || s.text.slice(token.start, token.end) !== token.surface; }).length} of ${tokens.length} token slices differ`);
  record(doc.id, 'word tokens identify the normalized form row', words.every((token) => token.formId === ids.form(doc.lang, token.normalized) && token.normalized.length > 0), `${words.length} word tokens`);

  const analysesByToken = await Promise.all(tokens.map((token) => store.analyses.where('tokenId', token.id)));
  const analyses = analysesByToken.flat();
  const lemmaIds = [...new Set(analyses.map((analysis) => analysis.lemmaId).filter((lemmaId): lemmaId is string => !!lemmaId))];
  const lemmaRows = new Set((await store.lemmas.getMany(lemmaIds)).filter(Boolean).map((lemma) => lemma!.id));
  record(doc.id, 'analysis lemma references resolve', lemmaIds.every((lemmaId) => lemmaRows.has(lemmaId)), `${lemmaIds.filter((lemmaId) => !lemmaRows.has(lemmaId)).length} missing of ${lemmaIds.length}`);
  const phraseOccurrences = await store.phraseOccurrences.where('textId', id);
  const phraseRows = new Set((await store.phrases.getMany([...new Set(phraseOccurrences.map((o) => o.phraseId))])).filter(Boolean).map((row) => row!.id));
  record(doc.id, 'unit occurrences resolve to phrase rows', phraseOccurrences.every((o) => phraseRows.has(o.phraseId)), `${phraseOccurrences.filter((o) => !phraseRows.has(o.phraseId)).length} missing of ${phraseOccurrences.length}`);
  const patternOccurrences = await store.patternOccurrences.where('textId', id);
  const patternRows = new Set((await store.patterns.getMany([...new Set(patternOccurrences.map((o) => o.patternId))])).filter(Boolean).map((row) => row!.id));
  record(doc.id, 'construction occurrences resolve to pattern rows', patternOccurrences.every((o) => patternRows.has(o.patternId)), `${patternOccurrences.filter((o) => !patternRows.has(o.patternId)).length} missing of ${patternOccurrences.length}`);
  const measured = await measureStoredText(store, id, { analysesOf: groupedAnalysesOf(store) });
  record(doc.id, 'fresh text profile is measurable', !!measured, id);

  const corpus = text.corpusId ? corpusOf.get(text.corpusId) ?? await store.corpora.get(text.corpusId) : undefined;
  const privateText = text.kind === 'testimony' || corpus?.kind === 'testimony';
  const protectedText = text.listeningAssessmentId !== undefined;
  const shouldRead = !privateText && !protectedText;
  const visibility = computePublished(doc).published ? 'published' : 'unpublished-preview-simulation';
  let learnerCheck: Record<string, unknown>;
  if (!shouldRead) {
    if (privateText) totals.privateExcluded++;
    if (protectedText) totals.protectedExcluded++;
    record(doc.id, 'private/protected text excluded from synthetic reader events', true, privateText ? 'private testimony' : 'protected assessment');
    learnerCheck = { state: 'excluded', privateText, protectedText, events: 0 };
  } else {
    await seedBasics(store, userId, course.id);
    const bySentence = new Map<string, string[]>();
    for (const token of tokens) (bySentence.get(token.sentenceId) ?? bySentence.set(token.sentenceId, []).get(token.sentenceId)!).push(token.id);
    const surface = text.kind === 'scripture' ? 'scripture' : 'corpus';
    for (const sentence of sentences) {
      await bus.emit({ type: 'SentenceViewed', userId, lang: doc.lang, surface, session: `bundle-audit:${i}`, dedupeKey: `bundle-audit:${sentence.id}`, textId: id,
        sentenceId: sentence.id, tokenIds: bySentence.get(sentence.id) ?? [], dwellMs: 2000, contentVersion: text.contentVersion } as never);
    }
    await golearn.settled();
    totals.readingEvents += sentences.length;
    const items = await store.learnerItems.where('userId', userId);
    const gotByKind = new Map<string, Set<string>>();
    for (const item of items) (gotByKind.get(item.itemKind) ?? gotByKind.set(item.itemKind, new Set()).get(item.itemKind)!).add(item.itemId);
    if (measured) {
      const expectedByKind = new Map<string, Set<string>>([
        ['form', new Set(measured.profile.forms.map(([form]) => ids.form(doc.lang, form)))],
        ['lemma', new Set(measured.profile.lemmas.map(([lemmaId]) => lemmaId))],
        ['phrase', new Set(measured.profile.phrases.map(([phraseId]) => phraseId))],
        ['pattern', new Set(measured.profile.patterns.map(([patternId]) => patternId))],
      ]);
      for (const [kind, expected] of expectedByKind) {
        const got = gotByKind.get(kind) ?? new Set<string>();
        const missing = [...expected].filter((itemId) => !got.has(itemId));
        const extra = [...got].filter((itemId) => !expected.has(itemId));
        record(doc.id, `GoLearn projects exact ${kind} items`, missing.length === 0 && extra.length === 0, `${missing.length} missing; ${extra.length} extra`);
      }
    }
    const progress = await golearn.readingProgress(userId, id);
    record(doc.id, 'GoLearn counts every live sentence as seen', progress.sentencesTotal === sentences.length && progress.sentencesSeen === sentences.length,
      `seen ${progress.sentencesSeen}/${progress.sentencesTotal}, live ${sentences.length}`);
    learnerCheck = { state: 'read-simulation', visibility, sentenceEvents: sentences.length,
      items: Object.fromEntries([...gotByKind].map(([kind, values]) => [kind, values.size])), progress: { seen: progress.sentencesSeen, total: progress.sentencesTotal } };
    if (visibility === 'unpublished-preview-simulation') totals.previewDocuments++;
  }
  rows.push({ id, lang: doc.lang, title: doc.title, imported: imported.action, published: text.published, contentVersion: text.contentVersion,
    sentences: sentences.length, tokens: tokens.length, wordTokens: words.length, analyses: analyses.length,
    unitOccurrences: phraseOccurrences.length, constructionOccurrences: patternOccurrences.length, privateText, protectedText, learnerCheck });
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${docs.length} documents; ${totals.readingEvents} synthetic sentence exposures`);
}

const failed = findings.length;
const evidence = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), purpose: 'isolated bundled content import, analysis linkage, exact offsets, and GoLearn read projection audit',
  storage: 'fresh in-memory indexed audit store; no application database opened or modified',
  readers: 'synthetic SentenceViewed events used only to exercise projection; unpublished documents are labeled preview simulations',
  adapters: Object.fromEntries(COURSES.map((course) => [course.lang, { version: adapters.get(course.lang).version, dictionary: lexicons.get(course.lang) ? `public/dict/${course.lang}` : null }])),
  totals, checks, failures: failed, findings,
  documents: rows,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(evidence, null, 2), 'utf8');
console.log(`Bundled audit: ${totals.imported}/${totals.documents} imported; ${totals.sentences} sentences, ${totals.words} word tokens, ${totals.readingEvents} sentence exposures; ${failed} failed checks. Evidence: ${output}`);
process.exit(failed ? 1 : 0);
