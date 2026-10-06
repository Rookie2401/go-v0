/// <reference types="node" />
/** Auditable snapshot of every declared stage, resident/public text and source-manifest candidate. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createAdapterRegistry } from '../src/adapters';
import { courseForLang, ids, type CatalogText, type Stage, type TextProfile, type Work } from '../src/core';
import { GERMAN_SHELVES, GERMAN_WORKS, SPANISH_SHELVES, SPANISH_WORKS, HINDI_SHELVES, HINDI_WORKS,
  ALBANIAN_STAGES, ALBANIAN_WORKS, THAI_STAGES, THAI_WORKS } from '../src/course';
import { computePublished, contentSignatureOf, type CorpusDocument } from '../src/ingest';
import { getStageContract } from '../src/course/curriculumPolicy';
import { parseManifest, parseShard } from '../src/library/format';
import { analyzeStageTransition, mergeProfileCounts, type StageExposure } from '../src/course/transitionAnalysis';

const output = process.argv[2];
if (!output) throw new Error('usage: curriculum-inventory.mts <output directory>');
fs.mkdirSync(output, { recursive: true });
const adapters = createAdapterRegistry();
const courses: { stages: Stage[]; works: Work[] }[] = [
  { stages: GERMAN_SHELVES, works: GERMAN_WORKS }, { stages: SPANISH_SHELVES, works: SPANISH_WORKS },
  { stages: HINDI_SHELVES, works: HINDI_WORKS }, { stages: ALBANIAN_STAGES, works: ALBANIAN_WORKS }, { stages: THAI_STAGES, works: THAI_WORKS },
];
const works = new Map(courses.flatMap(c => c.works).map(w => [w.id, w]));
const sha = (body: string) => crypto.createHash('sha256').update(body).digest('hex');
const read = <T = Record<string, unknown>,>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
const median = (values: number[]) => { const v = [...values].sort((a, b) => a - b); return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2 : 0; };
const dist = (values: string[]) => { const out: Record<string, number> = {}; for (const v of values) out[v] = (out[v] ?? 0) + 1; return out; };
const profiles = new Map<string, TextProfile>();
interface InventoryText { id: string; title: string; lang: string; location: string; file: string; workId?: string; stageId?: string;
  indexedStageId?: string; published: boolean; assessment: boolean; scripture: boolean; tokens: number; typeCount: number;
  lemmaCount: number | null; contentSignature: string; documentHash: string; sourceHash: string | null; bodyHash: string; lifecycle: string; source: CorpusDocument['source']; review: CorpusDocument['review'];
  rightsEvidence?: Work['rights']; generated: boolean; registers: string[]; genre: string; orthography: string; role: string; audioReadiness: string; reasons: string[]; }
const texts: InventoryText[] = [];
const bodies = new Map<string, string[]>();
function addDocument(doc: CorpusDocument, location: string, file: string, row?: CatalogText) {
  const workId = row?.workId ?? (doc.work ? ids.work(doc.work.courseId ?? courseForLang(doc.lang).id, doc.work.slug) : undefined);
  const work = workId ? works.get(workId) : undefined;
  const id = ids.text(doc.lang, doc.id);
  const body = doc.sections.flatMap(s => s.paragraphs.flatMap(p => 'sentences' in p && p.sentences ? p.sentences.map(s => s.text) : [(p as { text?: string }).text ?? ''])).join('\n');
  const profile = row?.profilePath ? read<TextProfile>(path.join('public/library', doc.lang, row.profilePath)) : undefined;
  if (profile) profiles.set(id, profile);
  const rawTokens = !profile ? adapters.get(doc.lang).tokenize(body).filter(t => t.isWord) : [];
  const publication = computePublished(doc);
  const assessment = !!(doc as CorpusDocument & { readingAssessmentId?: string; listeningAssessmentId?: string }).readingAssessmentId
    || !!(doc as CorpusDocument & { listeningAssessmentId?: string }).listeningAssessmentId;
  const scripture = doc.contentType === 'scripture';
  const key = `${doc.lang}:${sha(body.normalize('NFC').replace(/\s+/g, ' ').trim())}`;
  if (body.length > 40) (bodies.get(key) ?? bodies.set(key, []).get(key)!).push(id);
  texts.push({ id, title: doc.title, lang: doc.lang, location, file, workId, stageId: work?.stageId, indexedStageId: row?.stageId,
    published: publication.published && (!row || row.published), assessment, scripture,
    tokens: profile?.words ?? rawTokens.length, typeCount: profile?.forms.length ?? new Set(rawTokens.map(t => t.normalized)).size,
    lemmaCount: profile?.lemmas.length ?? null, contentSignature: contentSignatureOf(doc), documentHash: sha(fs.readFileSync(file, 'utf8')), sourceHash: doc.source.sourceHash ?? null, bodyHash: key, lifecycle: doc.curriculum?.lifecycle ?? (publication.published ? 'published' : 'held-legacy'),
    source: doc.source, review: doc.review, rightsEvidence: work?.rights, generated: doc.generated,
    registers: work?.registers?.length ? work.registers : [work?.era && /19th|medieval|historical|early.modern/i.test(work.era) ? 'historical_unclassified' : 'unclassified'],
    genre: work?.genre ?? row?.genre ?? doc.contentType, orthography: work?.orthography ?? (work?.modernization === 'original' && work?.registers?.some(r => /histor|archaic/.test(r)) ? 'historical_original' : 'unclassified'),
    role: doc.curriculum?.role ?? (scripture ? 'scripture' : doc.generated ? 'controlled' : work?.registers?.some(r => /archaic|historical|literary/.test(r)) ? 'heritage' : work?.streams?.includes('acquisition') ? 'bridge' : 'authentic'),
    audioReadiness: 'none', reasons: publication.unpublishedReasons });
}
for (const course of courses) {
  const lang = course.stages[0].lang;
  const dir = path.join('data/corpus', lang);
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) addDocument(read<CorpusDocument>(path.join(dir, file)), 'bundled', path.join(dir, file));
  const root = path.join('public/library', lang);
  const manifest = parseManifest(read(path.join(root, 'manifest.json')), lang);
  if (!manifest) throw new Error(`Invalid ${lang} library manifest`);
  for (const shard of manifest.shards) for (const row of parseShard(read(path.join(root, shard.file)), lang)) {
    if (!row.documentPath) throw new Error(`Missing document ${row.id}`);
    addDocument(read<CorpusDocument>(path.join(root, row.documentPath)), 'library', path.join(root, row.documentPath), row);
  }
  console.log(`${lang}: inventoried resident and public documents`);
}
const stageRows = courses.flatMap(course => course.stages.map(stage => {
  const matching = texts.filter(t => t.stageId === stage.id && !t.scripture && !t.assessment);
  const accessible = matching.filter(t => t.published);
  const byWork = new Map<string, number>();
  for (const t of accessible) byWork.set(t.workId ?? t.id, (byWork.get(t.workId ?? t.id) ?? 0) + t.tokens);
  const ps = accessible.flatMap(t => profiles.has(t.id) ? [profiles.get(t.id)!] : []);
  const forms = mergeProfileCounts(ps, 'forms'), lemmas = mergeProfileCounts(ps, 'lemmas'), patterns = mergeProfileCounts(ps, 'patterns');
  const tokens = accessible.reduce((n, t) => n + t.tokens, 0);
  const exposure: StageExposure = { stageId: stage.id, lang: stage.lang, publishedTexts: accessible.length, publishedWorks: byWork.size, tokens,
    medianWorkLength: median([...byWork.values()]), forms, lemmas, patterns, genres: Object.keys(dist(accessible.map(t => t.genre))),
    registers: Object.keys(dist(accessible.flatMap(t => t.registers))), orthographies: Object.keys(dist(accessible.map(t => t.orthography))),
    analysedTokenShare: tokens ? Object.values(lemmas).reduce((a, b) => a + b, 0) / tokens : 0 };
  return { id: stage.id, language: stage.lang, key: stage.key, label: stage.label, index: stage.index, purpose: stage.purpose,
    contract: stage.contract ?? getStageContract(stage), uniquePublishedBodies: new Set(accessible.map(t => t.bodyHash)).size, uniqueBodyTokens: [...new Map(accessible.map(t => [t.bodyHash, t.tokens])).values()].reduce((a,b) => a+b,0), publishedWorks: byWork.size, publishedTexts: accessible.length, unavailableTexts: matching.length - accessible.length, totalTokens: tokens,
    medianWorkLength: exposure.medianWorkLength, medianTextLength: median(accessible.map(t => t.tokens)), lexicalDiversity: tokens ? Object.keys(forms).length / tokens : null,
    distinctLemmas: Object.keys(lemmas).length, analysedTokenShare: exposure.analysedTokenShare,
    vocabularyProgression: { kind: 'corpus-exposure-proxy', distinctAnalysedLemmas: Object.keys(lemmas).length },
    genres: dist(accessible.map(t => t.genre)), registers: dist(accessible.flatMap(t => t.registers)),
    rights: dist(accessible.map(t => t.source.rights)), nativeReview: dist(accessible.map(t => t.review.level === 'native' ? 'explicit-native' : 'not-established')),
    audioCoverage: { reviewedHuman: 0, reviewedSynthetic: 0, none: accessible.length, note: 'No bundled recording accompanies these documents; provider configuration is separate.' },
    availability: accessible.length ? 'published-material-present-continuity-unproven' : 'unavailable',
    densityWarning: byWork.size < 5 ? 'Fewer than five distinct connected works; repeated exposure not established.' : 'Exposure adequacy requires target recurrence and learner validation.',
    exposure };
}));
const transitions = courses.flatMap(c => c.stages.slice(1).map((stage, i) => analyzeStageTransition(stageRows.find(s => s.id === c.stages[i].id)!.exposure, stageRows.find(s => s.id === stage.id)!.exposure)));
const sources: { file: string; hash: string; entries: unknown[] }[] = [];
const visit = (directory: string) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.json') && /manifest|provenance|catalog|rights|review/i.test(entry.name)) {
      try { const object = read<Record<string, unknown>>(file); const rows = Array.isArray(object) ? object : object.entries ?? object.works ?? object.items ?? [object];
        sources.push({ file, hash: sha(fs.readFileSync(file, 'utf8')), entries: Array.isArray(rows) ? rows : [rows] });
      } catch { sources.push({ file, hash: sha(fs.readFileSync(file, 'utf8')), entries: [{ error: 'unparseable' }] }); }
    }
  }
};
visit('data/sources');
const report = { schema: 1, checkedAt: new Date().toISOString(), methodology: {
  authority: 'Canonical course exports + actual documents and public shards, published decisions checked independently. Scripture and protected assessment material excluded from stage density.',
  metrics: 'Public profiles use existing adapter/dictionary/GoLearn creditable lemma analysis; resident token counts use language adapters including Thai segmentation. Unprofiled resident lemma counts are absent.',
  limits: 'Prior-stage vocabulary overlap is exposure, not demonstrated knowledge. Missing frequency norms, comprehension validation and native review remain unresolved. No CEFR certification. Corpus-wide token-type ratio depends on length.' },
  stages: stageRows.map(({ exposure: _exposure, ...s }) => ({ ...s, transitionFromPrior: transitions.find(t => t.to === s.id), transitionToNext: transitions.find(t => t.from === s.id) })),
  transitions, texts, catalogueWorks: [...works.values()], sourceManifests: sources,
  duplicateBodies: [...bodies.entries()].filter(([, ids]) => new Set(ids).size > 1).map(([signature, ids]) => ({ signature, ids })),
  placementMismatches: texts.filter(t => t.stageId && t.indexedStageId && t.stageId !== t.indexedStageId).map(t => ({ id: t.id, canonical: t.stageId, indexed: t.indexedStageId })) };
fs.writeFileSync(path.join(output, 'curriculum-inventory.json'), JSON.stringify(report, null, 2));
const csv = (row: unknown[]) => row.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',');
fs.writeFileSync(path.join(output, 'stage-inventory.csv'), [csv(['language','stage','label','published_works','published_texts','tokens','median_work_tokens','distinct_lemmas','native_reviewed_texts','availability','transition_from','transition_to']),
  ...report.stages.map(s => csv([s.language,s.key,s.label,s.publishedWorks,s.publishedTexts,s.totalTokens,s.medianWorkLength,s.distinctLemmas,s.nativeReview['explicit-native'] ?? 0,s.availability,s.transitionFromPrior?.risk,s.transitionToNext?.risk]))].join('\n'));
fs.writeFileSync(path.join(output, 'public-inventory.csv'), [csv(['language','stage','work_id','text_id','title','tokens','rights','review','source_url']),
  ...texts.filter(t => t.published && !t.scripture && !t.assessment).map(t => csv([t.lang,t.stageId,t.workId,t.id,t.title,t.tokens,t.source.rights,t.review.level ?? 'source/tool review',t.source.url]))].join('\n'));
console.log(`${report.stages.length} stages; ${texts.length} documents; ${transitions.length} transitions; ${report.duplicateBodies.length} duplicate body groups`);


