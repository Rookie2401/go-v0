// @vitest-environment node
import { expect, it, vi } from 'vitest';

const selectionCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../../packages/repository-contract/src', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../packages/repository-contract/src')>();
  return { ...actual, selectReviewEvidenceEvents: (events: Parameters<typeof actual.selectReviewEvidenceEvents>[0]) => {
    selectionCalls.count += 1;
    return actual.selectReviewEvidenceEvents(events);
  } };
});

import type { GoEvent } from '../../../packages/repository-contract/src';
import { gatherCandidates } from '../../../packages/goreview/src/intake/fetch';
import { candidate, facts, knowledge, prefs } from './fixtures';

const languageId = 'sq';
const candidates = Array.from({ length: 20 }, (_, index) => candidate({
  unitId: `form:sq:batch-${index}`, kind: 'form', score: 0.8,
  targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'verified', caveats: [] },
}));
const histories = (copy: number): GoEvent[] => Array.from({ length: 1200 }, (_, index) => {
  const unitId = candidates[index % candidates.length].unitId;
  return {
    id: `batch-${copy}-${index}`, v: 3, learnerId: 'L1', enrolmentId: 'E1', languageId,
    at: new Date(Date.parse('2026-09-01T00:00:00.000Z') + index * 60_000).toISOString(),
    producer: { app: 'gopractice-review', version: 'test', deviceId: 'D1' }, kind: 'CardReviewed',
    subject: { cardId: `card:written-recognition:${unitId}`, itemIds: [unitId] },
    payload: { family: 'written-recognition', assessmentDimension: 'readingRecognition', rating: 3, correct: true, outcome: 'correct', retrievalAttempted: true },
    evidence: { quality: 'strong', sourceReliability: 1, assisted: false },
  };
});

it('selects global review evidence once per candidate batch and refreshes it on the next snapshot', async () => {
  const run = async (events: GoEvent[]) => gatherCandidates({
    api: {
      candidates: async () => candidates,
      knowledge: async (ids) => ids.map(id => ({ ...knowledge(id), level: 'familiar' as const })),
    },
    facts: { factsFor: async (id) => facts(id) },
    audio: async () => ({ available: false, eligibleForEvidence: false, reason: 'not needed' }),
    deck: [], saved: new Set(), preferences: prefs({ practiceGoals: ['recognition'] }), now: '2026-10-28T12:00:00.000Z',
    enrolmentId: 'E1', readingSignals: events,
  });
  selectionCalls.count = 0;
  const start = performance.now();
  const first = await run(histories(1));
  const firstMs = performance.now() - start;
  expect(first).toHaveLength(candidates.length);
  expect(selectionCalls.count).toBe(1);
  expect(firstMs).toBeLessThan(10_000);

  const second = await run(histories(2));
  expect(second).toHaveLength(candidates.length);
  expect(selectionCalls.count).toBe(2);
});
