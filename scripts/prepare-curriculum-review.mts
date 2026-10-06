/// <reference types="node" />
/** Reproducible reviewer packets; never modifies curriculum wording, stages, approvals, or publication. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createAdapterRegistry } from '../src/adapters';
import { courseForLang, ids, type LanguageCode, type Stage, type Work } from '../src/core';
import { GERMAN_SHELVES, GERMAN_WORKS, SPANISH_SHELVES, SPANISH_WORKS, HINDI_SHELVES, HINDI_WORKS,
  ALBANIAN_STAGES, ALBANIAN_WORKS, THAI_STAGES, THAI_WORKS } from '../src/course';
import { computePublished, contentSignatureOf, type CorpusDocument } from '../src/ingest';

const output = 'data/review/curriculum-remediation';
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const registry = createAdapterRegistry();
const courses: { stages: Stage[]; works: Work[] }[] = [
  { stages: GERMAN_SHELVES, works: GERMAN_WORKS }, { stages: SPANISH_SHELVES, works: SPANISH_WORKS },
  { stages: HINDI_SHELVES, works: HINDI_WORKS }, { stages: ALBANIAN_STAGES, works: ALBANIAN_WORKS },
  { stages: THAI_STAGES, works: THAI_WORKS },
];
const workMap = new Map(courses.flatMap(c => c.works).map(w => [w.id, w]));
const stageMap = new Map(courses.flatMap(c => c.stages).map(s => [s.id, s]));
const readDocument = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument;
function measure(doc: CorpusDocument) {
  const adapter = registry.get(doc.lang);
  const paragraphs = doc.sections.flatMap(s => s.paragraphs.flatMap(p => 'sentences' in p && p.sentences
    ? p.sentences.map(s => s.text) : [(p as { text?: string }).text ?? '']));
  const units = paragraphs.flatMap(p => adapter.segmentSentences(p).map(s => s.text));
  const tokens = units.flatMap(unit => adapter.tokenize(unit)).filter(t => t.isWord);
  const forms = new Set(tokens.map(t => t.normalized));
  return { adapter, paragraphs, units, tokens, forms, metrics: {
    adapterVersion: adapter.version, wordTokens: tokens.length, normalizedTypes: forms.size,
    readingUnits: units.length, meanUnitWords: units.length ? tokens.length / units.length : 0,
    unitDefinition: doc.lang === 'th' ? 'Adapter Thai reading units, not certified grammatical sentences' : 'Adapter sentence boundaries',
  } };
}
function identity(doc: CorpusDocument, file: string) {
  const workId = doc.work ? ids.work(doc.work.courseId ?? courseForLang(doc.lang).id, doc.work.slug) : null;
  const work = workId ? workMap.get(workId) : undefined;
  const stage = work ? stageMap.get(work.stageId) : undefined;
  return { textId: ids.text(doc.lang, doc.id), sourceDocumentId: doc.id, lang: doc.lang, title: doc.title,
    sourceFile: file.replaceAll('\\', '/'), sourceFileSha256: sha(fs.readFileSync(file, 'utf8')),
    contentSignature: contentSignatureOf(doc), sourceId: doc.source.id, sourceUrl: doc.source.url ?? null,
    sourceEdition: doc.source.edition ?? null, sourceRights: doc.source.rights,
    currentWorkId: workId, currentStageId: work?.stageId ?? null, currentStageLabel: stage?.label ?? null,
    currentStageIndex: stage?.index ?? null, chapterIndex: doc.work?.chapter?.index ?? null,
    sourceReview: doc.review ?? null };
}

const drafts: { doc: CorpusDocument; file: string }[] = [];
for (const lang of ['de', 'es', 'hi', 'sq', 'th'] as LanguageCode[]) {
  const directory = path.join('data/corpus', lang);
  for (const name of fs.readdirSync(directory).filter(n => n.endsWith('.json')).sort()) {
    const file = path.join(directory, name), doc = readDocument(file);
    if (doc.generated) drafts.push({ doc, file });
  }
}
if (drafts.length !== 126) throw new Error(`Expected 126 actual generated drafts; found ${drafts.length}; inspect inventory before regenerating`);
const tasks = drafts.map(({ doc, file }) => {
  const measured = measure(doc), publication = computePublished(doc);
  if (publication.published) throw new Error(`Generated draft unexpectedly published: ${doc.lang}:${doc.id}`);
  return { ...identity(doc, file), ...measured.metrics, generated: true, publicationState: 'unpublished',
    exactBlockingReasons: publication.unpublishedReasons, nativeReviewStatus: 'unresolved', nativeReviewer: null,
    reviewerSignoff: { reviewerName: null, reviewerVariety: null, reviewedAt: null, coveredContentSignature: null,
      naturalness: null, grammar: null, spelling: null, meaningAndEnglishAlignment: null, controlledVocabulary: null,
      scriptDifficulty: null, beginnerSuitability: null, proposedStage: null, decision: null },
    reviewInstructions: ['Read complete source document, including English lines where present.',
      'Check naturalness, grammar, spelling, meaning alignment, controlled repetition and locale.',
      'Check authentic beginner script load and instructional sequence; do not infer level from length.',
      'Sign against this content signature and source hash; any wording change requires a fresh review binding.'],
    firstReadingUnits: measured.units.slice(0, 3),
  };
});
if (new Set(tasks.map(t => t.textId)).size !== tasks.length || tasks.some(t => !t.exactBlockingReasons.length)) throw new Error('Invalid draft review queue');

const scriptPackets = (['hi', 'th'] as LanguageCode[]).map(lang => {
  const selected = drafts.filter(d => d.doc.lang === lang).sort((a, b) => {
    const ai = identity(a.doc, a.file), bi = identity(b.doc, b.file);
    return (ai.currentStageIndex ?? 999) - (bi.currentStageIndex ?? 999) || a.doc.id.localeCompare(b.doc.id);
  }).slice(0, 3);
  return { lang, status: 'native signoff unresolved', canonicalRepresentation: 'original script',
    pronunciationEvidence: 'Existing adapter decoding only; uncertain/absent outputs remain unresolved. No new sound map.',
    audioStatus: 'No new audio recorded or certified',
    sequence: selected.map(({ doc, file }) => {
      const m = measure(doc); const unique = [...new Map(m.tokens.map(t => [t.surface, t])).values()].slice(0, 12);
      return { ...identity(doc, file), ...m.metrics, meaningfulSentences: m.units.slice(0, 3),
        words: unique.map(t => ({ canonicalScript: t.surface, normalizedForm: t.normalized,
          decoding: m.adapter.decode?.(t.surface) ?? [],
          orthographicFeatures: m.adapter.orthFeatures?.(m.adapter.decode?.(t.surface) ?? []) ?? [],
          sourceOccurrence: { text: m.units.find(s => s.includes(t.surface)) ?? null },
          reviewerSoundSignoff: null })),
        requiredNativeChecks: ['Confirm word meanings in sentence context.', 'Confirm sound/script correspondence and any uncertain vowel/tone decoding.',
          'Confirm this sequence is teachable for learners new to the script.', 'Record or verify source-aligned native audio before listening certification.'] };
    }) };
});

function placements(lang: LanguageCode, file: string, expected: number) {
  const docs = JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument[];
  if (docs.length !== expected) throw new Error(`${file}: expected ${expected}, got ${docs.length}`);
  const measured = docs.map(doc => ({ doc, m: measure(doc) })).sort((a, b) => a.m.tokens.length - b.m.tokens.length || a.doc.id.localeCompare(b.doc.id));
  const cumulative = new Set<string>();
  return measured.map(({ doc, m }, i) => {
    const earlier = i ? measured[i - 1] : undefined;
    const priorTokens = m.tokens.filter(t => earlier?.m.forms.has(t.normalized)).length;
    const cumulativeTokens = m.tokens.filter(t => cumulative.has(t.normalized)).length;
    const newTypes = [...m.forms].filter(f => !cumulative.has(f)).length;
    const result = { ...identity(doc, file), ...m.metrics, proposalOrder: i + 1,
      proposedReviewStratum: i < measured.length / 3 ? 'shorter length review group' : i < 2 * measured.length / 3 ? 'middle length review group' : 'longer length review group',
      previousTextId: earlier ? ids.text(lang, earlier.doc.id) : null,
      tokenOverlapWithPrevious: earlier && m.tokens.length ? priorTokens / m.tokens.length : null,
      tokenOverlapWithEarlierSequence: i && m.tokens.length ? cumulativeTokens / m.tokens.length : null,
      newNormalizedTypesAgainstEarlierSequence: newTypes, sequenceBasis: 'word-token length ascending, document id tie-break; surface overlap only',
      placementStatus: 'held pending native pedagogical validation', canonicalStageChange: false,
      unresolvedControls: ['Native CEFR/learner suitability judgement absent.', 'Length groups do not establish beginner or intermediate level.',
        'Surface overlap does not prove lexical knowledge, contextual correctness or comprehensibility.',
        'Vocabulary introductions, morphology, construction load and language variety need native review.',
        'Script load, authentic repetition, learner comprehension and audio evidence need independent validation.'],
      nativePlacementSignoff: { reviewer: null, coveredContentSignature: null, targetStage: null, suitability: null, decision: null } };
    for (const form of m.forms) cumulative.add(form);
    return result;
  });
}
const proposalGroups = [
  { lang: 'hi', sourceCollection: 'GDL Hindi CC BY collection', texts: placements('hi', 'data/sources/hi/gdl/gdl-library-documents.json', 92) },
  { lang: 'th', sourceCollection: 'Thai 1956 Aesop transcription', texts: placements('th', 'data/sources/th-gap-recovery/documents.json', 45) },
];
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'foundation-review.json'), JSON.stringify({ schema: 1, generatedBy: 'scripts/prepare-curriculum-review.mts',
  publicationApprovalsCreated: 0, taskCount: tasks.length, countsByLanguage: Object.fromEntries(['de', 'es', 'hi', 'sq', 'th'].map(l => [l, tasks.filter(t => t.lang === l).length])),
  tasks, scriptToLanguagePackets: scriptPackets }, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'held-placement-proposals.json'), JSON.stringify({ schema: 1, generatedBy: 'scripts/prepare-curriculum-review.mts',
  canonicalStageAssignmentsChanged: 0, publicationApprovalsCreated: 0, measuredTextCount: 137, groups: proposalGroups }, null, 2) + '\n');
console.log(`Prepared ${tasks.length} unpublished generated-draft tasks, ${scriptPackets.length} script packets and 137 held placement proposals; no source, stage or approval changes.`);
