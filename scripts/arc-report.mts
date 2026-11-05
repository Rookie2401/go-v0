/**
 * Reproducible source-fixture and recurrence report, never presented as held-out accuracy.
 * npx vite-node --config scripts/vite.config.ts scripts/arc-report.mts
 */
import fs from 'node:fs';
import { arcAdapter } from '../src/adapters/arc';
import { ARAMAIC_SEED } from '../src/adapters/aramaic/seed';
import { analyzeStageTransition } from '../src/course/transitionAnalysis';
import type { StageExposure } from '../src/course/transitionAnalysis';
import type { CorpusDocument } from '../src/ingest/format';

const docs = ['daniel-2-4b', 'daniel-2-20'].map(id => JSON.parse(fs.readFileSync(`data/corpus/arc/${id}.json`, 'utf8')) as CorpusDocument);
const encountered = new Map<string, { count: number; first: number; last: number; maxGap: number }>();
let at = 0;
const previousPatterns = new Set<string>();
let cumulativeTokens = 0;
const passages = docs.map(doc => {
  const texts = doc.sections.flatMap(s => s.paragraphs.flatMap(p => 'sentences' in p ? p.sentences.map(x => x.text) : [p.text]));
  const analysed = texts.flatMap(text => arcAdapter.analyze(arcAdapter.tokenize(text)).filter(a => a.token.isWord));
  const counts: Record<string, number> = {};
  const patterns: Record<string, number> = {};
  const newLemmas = new Set<string>();
  const reinforced = new Set<string>();
  const newFeatures = new Set<string>();
  let unresolved = 0, alternativeTokens = 0, sourceAgreements = 0, sourceDisagreements = 0;
  for (const a of analysed) {
    at++;
    const c = a.candidates[0];
    if (!c?.lemma) { unresolved++; continue; }
    if (a.candidates.length > 1) alternativeTokens++;
    const id = `${c.lemma}:${c.pos}`;
    counts[id] = (counts[id] ?? 0) + 1;
    const prior = encountered.get(id);
    if (prior) { reinforced.add(id); prior.maxGap = Math.max(prior.maxGap, at - prior.last - 1); prior.last = at; prior.count++; }
    else { newLemmas.add(id); encountered.set(id, { count: 1, first: at, last: at, maxGap: 0 }); }
    for (const [key, value] of Object.entries(c.morph)) {
      const feature = `${key}=${value}`; patterns[feature] = (patterns[feature] ?? 0) + 1;
      if (!previousPatterns.has(feature)) newFeatures.add(feature);
    }
    const reference = doc.id === 'daniel-2-4b' ? 'Dan 2:4b' : 'Dan 2:20';
    const source = ARAMAIC_SEED.filter(row => row.reference === reference && arcAdapter.normalize(row.surface) === a.token.normalized);
    if (source.some(row => row.morph === c.notes?.code)) sourceAgreements++; else sourceDisagreements++;
  }
  for (const key of Object.keys(patterns)) previousPatterns.add(key);
  cumulativeTokens += analysed.length;
  const profile: StageExposure = {
    stageId: doc.id, lang: 'arc', publishedTexts: 1, publishedWorks: 1, tokens: analysed.length, medianWorkLength: analysed.length,
    forms: {}, lemmas: counts, patterns: {}, genres: ['Biblical source excerpt'], registers: [], orthographies: ['Hebr, WLC pointed'],
    analysedTokenShare: analysed.length ? (analysed.length - unresolved) / analysed.length : 0,
  };
  return { id: doc.id, tokens: analysed.length, resolved: analysed.length - unresolved, unresolved, alternativeTokens,
    sourceFixtureAgreement: { correct: sourceAgreements, incorrect: sourceDisagreements, independentlyHeldOut: false },
    newLemmas: [...newLemmas], reinforced: [...reinforced], newMorphologicalFeatures: [...newFeatures],
    cumulativeTokens, cumulativeLemmaIdentities: encountered.size, profile };
});
const result = {
  scope: 'Daniel 2:4b (qere path) and 2:20 only',
  method: 'Source-fixture agreement and corpus-exposure proxies; lexical coverage is not comprehension or held-out accuracy.',
  sourceWordAnnotations: ARAMAIC_SEED.length, sourceLemmaIdentifiers: new Set(ARAMAIC_SEED.map(r => r.lemmaId.split('/').pop())).size,
  passages,
  transition: analyzeStageTransition(passages[0].profile, passages[1].profile),
  recurrence: [...encountered].map(([lemma, facts]) => ({ lemma, ...facts })),
  orphanLemmas: [...encountered].filter(([, facts]) => facts.count === 1).map(([lemma]) => lemma),
  unsupported: ['productive paradigms', 'verified roots', 'complete Biblical corpus', 'Targumic Aramaic', 'Classical Syriac'],
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (passages.some(p => p.unresolved || p.sourceFixtureAgreement.incorrect)) process.exitCode = 1;
