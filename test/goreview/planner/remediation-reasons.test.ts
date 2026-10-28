import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { remediationBacklog } from '../../../packages/goreview/src/planner/remediation';
import type { ExerciseFamily } from '../../../packages/goreview/src/types';
import { deckItem, NOW } from '../intake/fixtures';

const unitId = 'lemma:sq:test';
const itemId = `card:${unitId}`;
const review = (id: string, family: ExerciseFamily, at = '2026-10-07T08:00:00Z'): GoEvent => ({
  id, at, v: 2, learnerId: 'learner', enrolmentId: 'enrolment', languageId: 'sq',
  producer: { app: 'gopractice-review', version: '1', deviceId: 'device' },
  kind: 'CardReviewed', subject: { cardId: itemId, itemIds: [unitId] },
  payload: { rating: 1, correct: false, outcome: 'incorrect', family, retrievalAttempted: true, hinted: false },
  evidence: { quality: 'moderate', assisted: false },
});

describe('remediation reason labels', () => {
  it.each([
    ['meaning-to-form', 'productive-retrieval-difficulty'],
    ['sentence-completion', 'productive-retrieval-difficulty'],
    ['morphological-identification', 'morphological-difficulty'],
    ['phrase-comprehension', 'contextual-difficulty'],
    ['audio-to-meaning', 'listening-difficulty'],
    ['written-recognition', 'failed-retrieval'],
  ] as const)('uses the recorded %s target, without diagnosing the learner', (family, reason) => {
    const result = remediationBacklog([deckItem({ unitId, itemId })], [review('failure', family)], NOW);
    expect(result).toMatchObject([{ failureEventId: 'failure', reasons: [reason] }]);
  });

  it('labels repeated failures from repeated recorded Again outcomes, not inferred confusion', () => {
    const events = [review('failure-1', 'meaning-to-form'), review('failure-2', 'meaning-to-form', '2026-10-07T09:00:00Z')];
    const result = remediationBacklog([deckItem({ unitId, itemId })], events, NOW);
    expect(result).toMatchObject([{ failures: 2, reasons: ['productive-retrieval-difficulty', 'repeated-failure'] }]);
    expect(result[0].reasons).not.toContain('repeated-confusion');
  });

  it('does not create labels for invalidated questions, withdrawn reviews, or assisted/audio failures', () => {
    const failure = review('failure', 'audio-to-meaning');
    const assisted = { ...failure, id: 'assisted', at: '2026-10-07T09:00:00Z', evidence: { quality: 'none' as const, assisted: true } };
    const invalidated = { ...deckItem({ unitId, itemId }), invalidatedAt: '2026-10-07T10:00:00Z' };
    expect(remediationBacklog([invalidated], [failure], NOW)).toEqual([]);
    expect(remediationBacklog([deckItem({ unitId, itemId })], [{ ...failure, payload: { ...failure.payload, challenged: true } }], NOW)).toEqual([]);
    const withdrawn: GoEvent = { ...failure, id: 'withdrawal', at: '2026-10-07T09:00:00Z', correctionOf: failure.id, payload: { ...failure.payload, rating: null, challenged: true }, evidence: { quality: 'none' } };
    expect(remediationBacklog([deckItem({ unitId, itemId })], [failure, withdrawn], NOW)).toEqual([]);
    expect(remediationBacklog([deckItem({ unitId, itemId })], [assisted], NOW)).toEqual([]);
    expect(remediationBacklog([deckItem({ unitId, itemId })], [{ ...failure, payload: { ...failure.payload, audioFailed: true } }], NOW)).toEqual([]);
  });

  it('rebases a valid failed child through its withdrawn predecessor', () => {
    const parent = review('parent', 'written-recognition');
    parent.payload.expectedPreviousReviewId = null;
    parent.payload.rating = 3; parent.payload.correct = true; parent.payload.outcome = 'correct';
    const child = review('failed-child', 'meaning-to-form', '2026-10-07T09:00:00Z');
    child.payload.expectedPreviousReviewId = parent.id;
    const correction: GoEvent = { ...parent, id: 'parent-withdrawal', at: '2026-10-07T10:00:00Z', correctionOf: parent.id,
      payload: { ...parent.payload, rating: null, challenged: true }, evidence: { quality: 'none' } };
    expect(remediationBacklog([deckItem({ unitId, itemId })], [parent, child, correction], NOW)).toMatchObject([
      { failureEventId: 'failed-child', reasons: ['productive-retrieval-difficulty'] },
    ]);
  });

  it('accepts a real cross-device sibling failure even when the scheduler history marks that sibling excluded', () => {
    const parent = review('parent', 'written-recognition');
    parent.payload.expectedPreviousReviewId = null;
    parent.payload.rating = 3; parent.payload.correct = true; parent.payload.outcome = 'correct';
    const winner = review('sibling-a', 'meaning-to-form', '2026-10-07T09:00:00Z');
    winner.payload.expectedPreviousReviewId = parent.id;
    winner.producer = { ...winner.producer!, deviceId: 'device-a' };
    const sibling = review('sibling-b', 'meaning-to-form', '2026-10-07T09:00:00Z');
    sibling.payload.expectedPreviousReviewId = parent.id;
    sibling.producer = { ...sibling.producer!, deviceId: 'device-b' };
    const row = { ...deckItem({ unitId, itemId }), history: [{ at: sibling.at, rating: 1 as const, outcome: 'incorrect' as const,
      deviceId: 'device-b', exerciseId: sibling.id, family: 'meaning-to-form' as const, elapsedDays: 0, eventId: sibling.id,
      scheduleExcluded: 'concurrent sibling', conflict: true }] };
    expect(remediationBacklog([row], [parent, winner, sibling], NOW)).toMatchObject([
      { failures: 2, reasons: ['productive-retrieval-difficulty', 'repeated-failure'] },
    ]);
  });

  it('does not let a legacy review with a conflicting event identity enter remediation', () => {
    const failure = review('duplicate-id', 'meaning-to-form');
    const other = { ...failure, payload: { ...failure.payload, rating: 3, correct: true, outcome: 'correct' } };
    expect(remediationBacklog([deckItem({ unitId, itemId })], [failure, other], NOW)).toEqual([]);
  });
});
