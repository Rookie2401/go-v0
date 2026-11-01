import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, type GoEvent, type ReviewCandidate, type UnitKnowledge } from '../../packages/repository-contract/src';
import { foldEvents } from '../../packages/repository-engine/src';
import type { RepositoryApi, VocabularyItem } from '../../packages/repository-service/src/api';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { DEFAULT_PREFERENCES } from '../../packages/goreview/app/state';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import { formUnitId } from '../../packages/biblia/src/levels';
import { gzipHebrewFormFrequency } from '../../packages/goreview/app/hebrewFrequencyAssets';
import type { WordAnalysis } from '../../src/core/word-analysis';

const NOW = '2026-10-31T10:00:00.000Z';
const LEARNER = 'he-event-learner';
const ENROLMENT = 'he-event-enrolment';
const DEVICE = 'biblia-device';
const files = (async (input: RequestInfo | URL) => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const pathname = decodeURIComponent(new URL(String(input), 'http://assets.local/').pathname);
  const file = path.join(path.resolve(__dirname, '../../public'), pathname);
  if (pathname === '/lexicon/he/biblical/form-frequency.json.gz') {
    const indexPath = path.join(path.resolve(__dirname, '../../public'), 'lexicon/he/biblical-index.json');
    return new Response(gzipHebrewFormFrequency(JSON.parse(fs.readFileSync(indexPath, 'utf8'))) as unknown as BodyInit);
  }
  return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as unknown as typeof fetch;

const bibliaEvent = (id: string, kind: 'SelectionLookedUp' | 'EncounterRecorded'): GoEvent => ({
  id: `biblia-${kind}-${id}`, v: CONTRACT_VERSION, learnerId: LEARNER, enrolmentId: ENROLMENT,
  languageId: 'he', at: NOW,
  producer: { app: 'golearn-ext', version: '0.1.0', deviceId: DEVICE, ...(kind === 'EncounterRecorded' ? { surface: 'biblia-reading' } : {}) },
  kind, subject: { itemIds: [id] },
  payload: { ...(kind === 'SelectionLookedUp' ? { surface: 'חֹשֶׁךְ' } : {}), tokenCount: 5,
    contextKind: 'sentence', contextConfidence: 1, readerId: 'biblia', ...(kind === 'SelectionLookedUp' ? { helpShown: ['surface', 'lemma', 'gloss'] } : {}),
    language: { languageId: 'he', varietyId: 'he-bib', basis: 'override', confidence: 1, source: 'biblia:Gen.1.2', override: true } },
  dedupeKey: `biblia:${kind}:${id}`,
});

const unknownCandidate = (unitId: string): ReviewCandidate => ({
  unitId, kind: 'unknown', score: 0, reasons: [], targetDimension: 'readingRecognition',
  eligibility: { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' }, cost: 0.2,
});

const apiWithoutCatalogue = (): RepositoryApi => ({
  async units(unitIds: string[]) { return { ok: true, status: 200, data: { units: {}, missing: unitIds } }; },
  async unit() { return { ok: false, status: 404, error: 'not-found', message: 'Unit not found', body: {} }; },
  async listEnrolments() { return { ok: true, status: 200, data: { enrolments: [{ enrolmentId: ENROLMENT, learnerId: LEARNER, languageId: 'he', varietyId: 'he-bib', packId: 'pack:he', packVersion: '1', goals: [{ kind: 'reading' }], startedAt: NOW }] } }; },
} as unknown as RepositoryApi);

describe('event-only Biblical Hebrew recovery', () => {
  it('ranks and builds a Seen OSHB citation noun from Biblia events without a catalogue unit', async () => {
    const api = apiWithoutCatalogue();
    const darkness = formUnitId('he', 'חֹשֶׁךְ');
    const events = [bibliaEvent(darkness, 'EncounterRecorded')];
    const knowledge: UnitKnowledge[] = foldEvents(events, { modelVersion: 'projection@7' });
    expect(knowledge[0]).toMatchObject({ unitId: darkness, level: 'seen', encounters: 1 });
    const unresolvedVocabulary: VocabularyItem[] = [{ knowledge: knowledge[0]!, surfaceForms: ['חֹשֶׁךְ'], sources: [] }];
    const serverCandidates = [unknownCandidate(darkness)];
    const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, now: () => NOW, random: () => 0.5,
      factsFor: packFactsFor({ fetch: files, baseUrl: 'http://assets.local/' }) });
    const prefs = { ...DEFAULT_PREFERENCES('he'), varietyId: 'he-bib' };

    const recovered = await engine.recoverCandidates!({ api, enrolmentId: ENROLMENT, languageId: 'he', varietyId: 'he-bib',
      prefs, events, deck: [], knowledge, unresolvedVocabulary, existingCandidates: serverCandidates, now: NOW });
    expect(recovered.complete).toBe(true);
    const candidate = recovered.candidates.find(row => row.unitId === darkness);
    expect(candidate).toMatchObject({ kind: 'form', eligibility: { eligible: true, status: 'provisional' }, targetDimension: 'readingRecognition' });
    expect(candidate?.reasons).toContainEqual(expect.objectContaining({ rule: 'wordFrequency', detail: 'frequency rank 739' }));
    const facts = await engine.factsFor!(darkness, 'he', api);
    expect(facts?.glosses.length).toBeGreaterThan(0);
    const wordAnalysis = (facts as typeof facts & { wordAnalysis?: WordAnalysis })?.wordAnalysis;
    expect(wordAnalysis?.lexicalMeaning?.text).toBeTruthy();
    expect(wordAnalysis?.inflectedMeaning).toBeNull();

    const outcomes = await engine.intake({ api, candidates: [candidate!], knowledge, deck: [], saved: new Set(), prefs,
      audio: { available: false, eligibleForEvidence: false, reason: 'no audio' }, now: NOW, events });
    expect(outcomes[0]?.proposed).toMatchObject({ family: 'written-recognition' });
    expect(outcomes[0]?.decision).toBe('test-now');
    const buildable = await engine.exerciseAvailable!({ unitId: darkness, unitKind: 'form', languageId: 'he', varietyId: 'he-bib',
      dimension: 'written-recognition', family: 'written-recognition', api, now: NOW });
    expect(buildable).toBe(true);
    const plan = engine.plan({ deck: [], intake: outcomes, prefs, audio: { available: false, eligibleForEvidence: false, reason: 'no audio' }, now: NOW, knowledge, readingSignals: events });
    expect(plan.items.some(item => item.item.unitId === darkness && item.isNew)).toBe(true);
  });

  it('does not use a lemma meaning for plural, construct, prefixed, or verbal forms', async () => {
    const api = apiWithoutCatalogue();
    const provider = packFactsFor({ fetch: files, baseUrl: 'http://assets.local/' })('he', api)!;
    const cases = [
      ['form:he:אֱלֹהִים', 'plural noun'],
      ['form:he:פְּנֵי', 'construct noun'],
      ['form:he:הַשָּׁמַיִם', 'prefixed definite noun'],
      ['form:he:אָבִיו', 'possessive suffix'],
      ['form:he:בֵּית', 'construct noun with a citation lemma'],
      ['form:he:וַיֹּאמֶר', 'inflected verb'],
    ] as const;
    for (const [unitId, label] of cases) {
      const facts = await provider.factsFor(unitId, 'he', 'he-bib');
      expect(facts?.glosses, label).toEqual([]);
    }
  });
});
