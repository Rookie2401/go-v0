// @vitest-environment node
import { expect, it } from 'vitest';
import type { GoEvent, LinguisticUnit } from '../../../packages/repository-contract/src';
import { provenanceOf } from '../../../packages/repository-contract/src';
import type { UnitFacts } from '../../../packages/goreview/src/types';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { openSqliteStore } from '../../../packages/repository-store/src';
import { createRepositoryApi } from '../../../packages/repository-service/src/api';
import { handle } from '../../../packages/repository-service/src/handler';
import type { ServiceDeps } from '../../../packages/repository-service/src/deps';
import { createFakeCrypto, createFakeLinguistics } from './fakes';
import { gatherCandidates } from '../../../packages/goreview/src/intake/fetch';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import { buildCardAdded } from '../../../packages/goreview/src/scheduler/deck';
import { audioOk, deckItem, facts, fakeScheduler, prefs } from '../../goreview/intake/fixtures';

const NOW = '2026-10-28T12:00:00.000Z';
const UNIT = 'lexeme:sq:punoj';

it('authenticated SQLite candidate feed reaches real intake and plans one missing listening objective', async () => {
  const store = openSqliteStore(':memory:', { now: () => NOW });
  const unit: LinguisticUnit = {
    unitId: UNIT, kind: 'lexeme', languageId: 'sq', label: 'punoj', packId: 'pack:sq', packVersion: '1',
    provenance: { source: 'dictionary', ref: 'test:dimension-admission', confidence: 1, validation: 'production-validated' },
    status: 'verified', createdAt: '2026-10-01T00:00:00.000Z',
  };
  await store.putUnits([unit]);
  const clock = () => NOW;
  const crypto = createFakeCrypto();
  const engine = createProjectionEngine({ store, now: clock });
  const deps: ServiceDeps = { store, engine, linguistics: createFakeLinguistics(store, clock), crypto, now: clock };
  const fetchLike = ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init), deps)) as typeof fetch;
  const api = createRepositoryApi({ baseUrl: 'https://repository.test', fetch: fetchLike });

  const created = await api.createAccount({ email: 'dimensions@example.test', password: 'correct horse battery', displayName: 'Learner' });
  expect(created.ok).toBe(true);
  const signedIn = await api.createSession({ email: 'dimensions@example.test', password: 'correct horse battery', deviceId: 'phone', platform: 'test' });
  expect(signedIn.ok).toBe(true);
  const enrolment = await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
  if (!created.ok || !signedIn.ok || !enrolment.ok) throw new Error('authenticated setup failed');
  const learnerId = created.data.learnerId;
  const enrolmentId = enrolment.data.enrolment.enrolmentId;

  const card = buildCardAdded({ learnerId, enrolmentId, languageId: 'sq', at: '2026-10-19T12:00:00.000Z', deviceId: 'phone',
    unitId: UNIT, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' });
  const reviews: GoEvent[] = ['2026-10-16T12:00:00.000Z', '2026-10-20T12:00:00.000Z', '2026-10-23T12:00:00.000Z', '2026-10-26T12:00:00.000Z'].map((at, index) => ({
    id: `read-success-${index}`, v: 3, learnerId, enrolmentId, languageId: 'sq', at,
    producer: { app: 'gopractice-review', version: 'test', deviceId: 'phone' }, kind: 'CardReviewed',
    subject: { cardId: card.subject.cardId, itemIds: [UNIT] },
    payload: { cardKind: 'recognition', grade: 'easy', family: 'written-recognition', assessmentDimension: 'written-recognition', rating: 4, correct: true, outcome: 'correct', hinted: false, retrievalAttempted: true },
    evidence: { quality: 'strong', sourceReliability: 1 },
  }));
  const appended = await api.appendEvents([card, ...reviews.slice(0, 2)]);
  if (!appended.ok) throw new Error(`append failed: ${JSON.stringify(appended)}`);
  expect((await store.getUnits([UNIT]))[0]).toMatchObject({ status: 'verified', provenance: { validation: 'production-validated' } });
  expect((await engine.knowledge(learnerId)).find((row) => row.unitId === UNIT)?.level).toBe('familiar');
  const familiarCandidates = await api.candidates(enrolmentId, 20, undefined, ['productiveRetrieval', 'grammaticalUnderstanding', 'contextualProduction']);
  expect(familiarCandidates.ok && familiarCandidates.data.candidates.find((candidate) => candidate.unitId === UNIT)).toMatchObject({ objectiveDimension: 'productiveRetrieval' });
  const remaining = await api.appendEvents(reviews.slice(2));
  if (!remaining.ok) throw new Error(`remaining review append failed: ${JSON.stringify(remaining)}`);
  expect((await engine.knowledge(learnerId)).find((row) => row.unitId === UNIT)?.level).toBe('known');

  const allEvents = await api.listEvents({ languageId: 'sq' });
  expect(allEvents.ok).toBe(true);
  if (!allEvents.ok) throw new Error('could not read authenticated review history');
  const factsForUnit = facts(UNIT, { unit, status: 'verified' }) as UnitFacts;
  const suppliedFacts: UnitFacts[] = [];
  const gather = (unitFacts: UnitFacts) => gatherCandidates({
    api: {
      candidates: async (id, limit, objectives) => {
        const result = await api.candidates(id, limit, undefined, objectives);
        if (!result.ok) throw new Error(`candidate feed failed: ${result.status}`);
        return result.data.candidates;
      },
      knowledge: async (ids) => {
        const result = await api.knowledge(ids);
        if (!result.ok) throw new Error(`knowledge feed failed: ${result.status}`);
        return result.data.knowledge;
      },
    },
    facts: { factsFor: async () => { suppliedFacts.push(unitFacts); return unitFacts; } }, audio: async () => audioOk,
    deck: [deckItem({ unitId: UNIT, family: 'written-recognition', schedule: { ...fakeScheduler.newState(NOW), due: '2026-11-02T12:00:00.000Z' } })], saved: new Set(),
    preferences: prefs({ languageId: 'sq', practiceGoals: ['recognition', 'retrieval', 'application'], maxNew: 4 }),
    now: NOW, enrolmentId, readingSignals: allEvents.data.events,
  });
  const intake = await gather(factsForUnit);
  expect(intake.find((item) => item.unitId === UNIT)).toMatchObject({ decision: 'test-now', proposed: { dimension: 'meaning-to-target-retrieval' } });
  expect(intake.filter((item) => item.unitId === UNIT)).toHaveLength(1);

  const unsupportedFacts = facts(UNIT, { unit: { ...unit, provenance: { ...unit.provenance, validation: 'unsupported' } }, status: 'provisional' }) as UnitFacts;
  expect(provenanceOf(unsupportedFacts.unit.provenance).validation).toBe('unsupported');
  const blocked = await gather(unsupportedFacts);
  expect(suppliedFacts.at(-1)?.unit.provenance.validation).toBe('unsupported');
  expect(blocked.find((item) => item.unitId === UNIT)?.decision).toBe('needs-validation');

  const planDeck = [deckItem({ unitId: UNIT, family: 'written-recognition', schedule: { ...fakeScheduler.newState(NOW), due: '2026-11-02T12:00:00.000Z' } })];
  const planned = planSession({ deck: planDeck, intake,
    preferences: prefs({ languageId: 'sq', practiceGoals: ['listening'], includeListening: true, maxNew: 4, cardsPerDeck: 10 }),
    audio: audioOk, scheduler: fakeScheduler, now: NOW, readingSignals: allEvents.data.events, learnerId, random: () => 0.5 });
  expect(planned.items.map((item) => item.family)).toContain(intake.find((item) => item.unitId === UNIT)?.proposed?.family);
  const noBudget = planSession({ deck: planDeck, intake,
    preferences: prefs({ languageId: 'sq', practiceGoals: ['listening'], includeListening: true, maxNew: 0, dailyNewLimit: 0, cardsPerDeck: 10 }),
    audio: audioOk, scheduler: fakeScheduler, now: NOW, readingSignals: allEvents.data.events, learnerId, random: () => 0.5 });
  expect(noBudget.items).toHaveLength(0);
  expect(noBudget.newCount).toBe(0);
  store.close();
});
