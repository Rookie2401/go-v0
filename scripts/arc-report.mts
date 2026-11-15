/** Full Biblical Aramaic source agreement and recurrence; never held-out accuracy. */
import fs from 'node:fs';
import { arcAdapter } from '../src/adapters/arc';
import { ARAMAIC_SEED } from '../src/adapters/aramaic/seed';
import type { CorpusDocument } from '../src/ingest/format';

const BOOK: Record<string, string> = { Dan: 'DAN', Daniel: 'DAN', Ezra: 'EZR', Ezr: 'EZR', Gen: 'GEN', Genesis: 'GEN', Jer: 'JER', Jeremiah: 'JER' };
const referenceKey = (ref: string) => ref.replace(/^(\w+) (\d+):(\d+)[a-z]?$/, (_, book: string, ch: string, v: string) => `${BOOK[book] ?? book}.${ch}.${v}`);
export function buildAramaicReport() {
  const byVerse = new Map<string, (typeof ARAMAIC_SEED)[number][]>();
  for (const row of ARAMAIC_SEED) {
    const key = referenceKey(row.reference), rows = byVerse.get(key) ?? [];
    rows.push(row); byVerse.set(key, rows);
  }
  const docs = fs.readdirSync('data/corpus/arc').filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(fs.readFileSync(`data/corpus/arc/${f}`, 'utf8')) as CorpusDocument);
  const encountered = new Map<string, { count: number; firstPassage: number; lastPassage: number; maxPassageGap: number }>();
  const seenVerses = new Set<string>(), seenWords = new Set<string>(), seenFeatures = new Set<string>();
  const stems: Record<string, number> = {}, conjugations: Record<string, number> = {}, states: Record<string, number> = {};
  const errors: string[] = [];
  const passages = docs.map((doc, passageIndex) => {
    const introduced = new Set<string>(), reinforced = new Set<string>(), newFeatures = new Set<string>();
    let tokens = 0, unresolved = 0, alternatives = 0, questioned = 0, agreement = 0, rankedFirst = 0;
    for (const section of doc.sections) for (const paragraph of section.paragraphs) {
      if (!('sentences' in paragraph)) { errors.push(`${doc.id}: expected explicit source verses`); continue; }
      for (const sentence of paragraph.sentences) {
        const ref = sentence.verseRefs?.[0] ?? '';
        if (!ref || seenVerses.has(ref)) errors.push(`${doc.id}: missing or duplicated verse ${ref}`);
        seenVerses.add(ref);
        const rows = byVerse.get(ref) ?? [];
        const analyses = arcAdapter.analyze(arcAdapter.tokenize(sentence.text), { varietyId: 'arc-bib' }).filter(a => a.token.isWord);
        if (rows.length !== analyses.length) errors.push(`${ref}: ${analyses.length} words, expected ${rows.length}`);
        for (const [index, analysis] of analyses.entries()) {
          tokens++;
          const row = rows[index];
          if (row) {
            if (seenWords.has(row.sourceWordId)) errors.push(`${ref}: duplicate word ${row.sourceWordId}`);
            seenWords.add(row.sourceWordId);
          }
          const agrees = (c: typeof analysis.candidates[number]) => !!row && (c.notes?.code === row.morph || (c.notes?.sourceCodes as string[] | undefined)?.includes(row.morph))
            && (c.notes?.sourceWordIds as string[] | undefined)?.includes(row.sourceWordId)
            && arcAdapter.normalize(row.surface) === analysis.token.normalized;
          if (analysis.candidates.some(agrees)) agreement++; else errors.push(`${ref}#${index}: source reading absent`);
          if (analysis.candidates[0] && agrees(analysis.candidates[0])) rankedFirst++;
          if (!analysis.candidates.length) { unresolved++; continue; }
          if (analysis.candidates.length > 1) alternatives++;
          const candidate = analysis.candidates.find(agrees) ?? analysis.candidates[0];
          if (candidate.notes?.reviewStatus === 'requires-review') questioned++;
          const id = `${candidate.lemma}:${candidate.pos}`, prior = encountered.get(id);
          if (prior) {
            if (prior.firstPassage < passageIndex) reinforced.add(id);
            prior.maxPassageGap = Math.max(prior.maxPassageGap, passageIndex - prior.lastPassage - 1);
            prior.lastPassage = passageIndex; prior.count++;
          } else {
            introduced.add(id);
            encountered.set(id, { count: 1, firstPassage: passageIndex, lastPassage: passageIndex, maxPassageGap: 0 });
          }
          for (const [key, value] of Object.entries(candidate.morph)) {
            const feature = `${key}=${value}`;
            if (!seenFeatures.has(feature)) newFeatures.add(feature);
          }
          for (const [key, tally] of [['Binyan', stems], ['Conj', conjugations], ['State', states]] as const) {
            const value = candidate.morph[key];
            if (value) tally[value] = (tally[value] ?? 0) + 1;
          }
        }
      }
    }
    for (const feature of newFeatures) seenFeatures.add(feature);
    return { id: doc.id, tokens, unresolved, alternatives, questioned, agreement, rankedFirst,
      introducedLemmas: introduced.size, reinforcedLemmas: reinforced.size, cumulativeLemmas: encountered.size,
      newMorphologicalFeatures: [...newFeatures].sort() };
  });
  if (seenWords.size !== ARAMAIC_SEED.length) errors.push(`Corpus accounts for ${seenWords.size}/${ARAMAIC_SEED.length} source words`);
  const sum = (key: 'tokens' | 'unresolved' | 'alternatives' | 'questioned' | 'agreement' | 'rankedFirst') => passages.reduce((n, p) => n + p[key], 0);
  return {
    scope: 'Daniel 2:4b–7:28; Ezra 4:8–6:18 and 7:12–26; Jeremiah 10:11; the Aramaic name in Genesis 31:47',
    method: 'Agreement with bundled OSHB annotations, plus recurrence in document filename order. This is a corpus audit, not a designed course sequence. Lexical coverage is not comprehension.',
    independentlyHeldOutAccuracy: null,
    summary: { documents: docs.length, verses: seenVerses.size, sourceWordAnnotations: ARAMAIC_SEED.length,
      sourceLemmaIdentifiers: new Set(ARAMAIC_SEED.map(r => r.lemmaId.split('/').pop())).size,
      lemmaPosIdentities: encountered.size, tokens: sum('tokens'), unresolved: sum('unresolved'),
      tokensWithAlternatives: sum('alternatives'), questionedTokens: sum('questioned'),
      sourceAgreement: sum('agreement'), sourceRankedFirst: sum('rankedFirst'),
      singletonLemmaPosIdentities: [...encountered.values()].filter(r => r.count === 1).length },
    attestedStems: stems, attestedConjugations: conjugations, attestedNominalStates: states,
    passages, recurrence: [...encountered].map(([lemma, facts]) => ({ lemma, ...facts })),
    limitations: ['Attested readings only; unseen productive paradigms are not inferred.', 'Lexical glosses are not verified occurrence translations.',
      'Questioned annotations need specialist adjudication.', 'Course progression and instructional bridges remain for Claude.',
      'Targumic Aramaic and Classical Syriac need separate licensed resources and validated dialect modules.'],
    errors,
  };
}
if (!process.env.VITEST) {
  const report = buildAramaicReport();
  process.stdout.write(JSON.stringify(process.argv.includes('--summary') ? { ...report.summary, attestedStems: report.attestedStems, errorCount: report.errors.length, errors: report.errors.slice(0, 20) } : report, null, 2) + '\n');
  if (report.errors.length) process.exitCode = 1;
}
