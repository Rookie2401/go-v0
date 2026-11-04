// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import type { VocabularyItem } from '../../packages/repository-service/src/api';
import { foldEvents } from '../../packages/repository-engine/src';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import { destroyRigs, FakeService, makeRig, seed, cardAdded, reviewed, ids } from './helpers';

const NOW = '2026-10-31T10:00:00.000Z';
const L = 'L1';
const ENROLMENT = `${L}-e1`;
const DARKNESS = 'form:he:חֹשֶׁךְ';
const files = (async (input: RequestInfo | URL) => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const pathname = decodeURIComponent(new URL(String(input), 'http://assets.local/').pathname);
  if (pathname === '/lexicon/he/biblical/form-frequency.json.gz') {
    const { gzipHebrewFormFrequency } = await import('../../packages/goreview/app/hebrewFrequencyAssets');
    const indexPath = path.join(path.resolve(__dirname, '../../public'), 'lexicon/he/biblical-index.json');
    return new Response(gzipHebrewFormFrequency(JSON.parse(fs.readFileSync(indexPath, 'utf8'))) as unknown as BodyInit);
  }
  const file = path.join(path.resolve(__dirname, '../../public'), pathname);
  return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as unknown as typeof fetch;

const coveredCandidate: ReviewCandidate = { unitId: 'lemma:he:reviewed-word:NOUN', kind: 'lemma', score: 0.8, reasons: [], targetDimension: 'readingRecognition',
  eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: 0.2 };

const encounter = (): GoEvent => ({
  id: 'biblia-encounter-darkness', v: CONTRACT_VERSION, learnerId: L, enrolmentId: ENROLMENT, languageId: 'he', at: '2026-10-30T12:00:00.000Z',
  producer: { app: 'golearn-ext', version: '0.1.0', deviceId: 'biblia-device', surface: 'biblia-reading' }, kind: 'EncounterRecorded',
  subject: { itemIds: [DARKNESS] }, payload: { tokenCount: 5, contextKind: 'sentence', contextConfidence: 1, readerId: 'biblia',
    language: { languageId: 'he', varietyId: 'he-bib', basis: 'override', confidence: 1, source: 'biblia:Gen.1.2', override: true } },
  dedupeKey: 'biblia:encounter:darkness',
});

afterEach(() => { destroyRigs(); });

describe('event-only Hebrew Current Deck recovery', () => {
  it.each([
    ['an empty candidate response', []],
    ['only a valid candidate already covered by Review', [coveredCandidate]],
  ] as const)('uses one real Biblia encounter and OSHB exact-form frequency with %s while preserving the existing review card', async (_label, apiCandidates) => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', L, [{ languageId: 'he', varietyId: 'he-bib', goals: [{ kind: 'reading' }] }]);
    const rig = await makeRig({ service, signedIn: true });
    const api = (await rig.app.ctx.api()).api;
    const events = [encounter()];
    const knowledge: UnitKnowledge[] = foldEvents(events, { modelVersion: 'projection@7' });
    const vocabulary: VocabularyItem[] = [{ knowledge: knowledge[0]!, surfaceForms: ['חֹשֶׁךְ'], sources: [] }];
    Object.assign(api, {
      async candidates() { return { ok: true, status: 200, data: { candidates: [...apiCandidates] } }; },
      async knowledge(unitIds?: string[]) { return { ok: true, status: 200, data: { knowledge: unitIds ? knowledge.filter(row => unitIds.includes(row.unitId)) : knowledge } }; },
      async vocabulary() { return { ok: true, status: 200, data: { items: vocabulary } }; },
      async units(unitIds: string[]) { return { ok: true, status: 200, data: { units: {}, missing: unitIds } }; },
      async unit() { return { ok: false, status: 404, error: 'not-found', message: 'Unit not found', body: {} }; },
    });
    rig.app.ctx.engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, now: () => NOW, random: () => 0.5,
      factsFor: packFactsFor({ fetch: files, baseUrl: 'http://assets.local/' }) });
    const who = await rig.app.ctx.identity();
    expect(who?.enrolmentId).toBe(ENROLMENT);
    await seed(rig, [
      ...events,
      cardAdded(ids(L, 'he'), 'reviewed-word', 'written-recognition', '2026-09-01T09:00:00.000Z'),
      reviewed(ids(L, 'he'), 'reviewed-word', 'written-recognition', 4, '2026-09-01T10:00:00.000Z'),
    ]);
    forgetPaintedHome(rig.app.ctx);
    await rig.go('settings');
    await rig.go('review');

    const model = await loadReviewModel(rig.app.ctx);
    expect(model?.candidateRecoveryIncomplete).toBeUndefined();
    expect(model?.knowledge.find(row => row.unitId === DARKNESS)).toMatchObject({ level: 'seen', encounters: 1 });
    expect(model?.outcomes.find(row => row.unitId === DARKNESS)).toMatchObject({ decision: 'test-now', proposed: { family: 'written-recognition' } });
    const current = await planCurrentDeck(rig.app.ctx, model!, new Set(), undefined, 'current');
    const review = await planCurrentDeck(rig.app.ctx, model!, new Set(), undefined, 'review');
    expect(current.entries.some(row => row.unitId === DARKNESS)).toBe(true);
    expect(review.entries).toHaveLength(1);
  });
});
