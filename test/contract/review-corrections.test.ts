import { describe, expect, it } from 'vitest';
import { effectiveReviewEvents, retractedReviewIds } from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import { ev, L1 } from '../repository/store/fixtures';

const grade = (id: string, at: string): GoEvent => ev(id, {
  learnerId: L1, kind: 'CardReviewed', at, subject: { itemIds: ['lemma:sq:test:NOUN'], cardId: 'card:test' },
  payload: { cardKind: 'recall', grade: 'good', correct: true, hinted: false, rating: 3 }, evidence: { quality: 'strong' },
});
const correction = (id: string, at: string, correctionOf: string, patch: Partial<GoEvent> = {}): GoEvent => ev(id, {
  ...grade(id, at), kind: 'CardReviewed', correctionOf, payload: { cardKind: 'recall', grade: 'good', correct: true, hinted: false, rating: null, challenged: true },
  evidence: { quality: 'none' }, ...patch,
});

describe('shared review correction validity', () => {
  it('retracts only the original grade and makes the earliest valid correction canonical', () => {
    const first = grade('grade-1', '2026-10-08T10:00:00.000Z');
    const second = grade('grade-2', '2026-10-08T10:01:00.000Z');
    const c1 = correction('correction-1', '2026-10-08T10:02:00.000Z', second.id);
    const duplicate = correction('correction-2', '2026-10-08T10:03:00.000Z', second.id);
    expect(effectiveReviewEvents([first, second, duplicate, c1]).map((e) => e.id)).toEqual([first.id]);
    expect(retractedReviewIds([first, second, duplicate, c1])).toEqual([second.id]);
  });

  it('ignores later-than-invalid, chained, mismatched and non-none corrections', () => {
    const original = grade('grade-1', '2026-10-08T10:00:00.000Z');
    const valid = correction('correction-1', '2026-10-08T10:02:00.000Z', original.id);
    const early = correction('correction-early', '2026-10-08T09:59:00.000Z', original.id);
    const chained = correction('correction-chain', '2026-10-08T10:03:00.000Z', valid.id);
    const wrongLanguage = correction('correction-language', '2026-10-08T10:04:00.000Z', original.id, { languageId: 'es' });
    const wrongQuality = correction('correction-quality', '2026-10-08T10:05:00.000Z', original.id, { evidence: { quality: 'weak' } });
    const wrongLearner = correction('correction-learner', '2026-10-08T10:06:00.000Z', original.id, { learnerId: 'learner-other' });
    const wrongVariety = correction('correction-variety', '2026-10-08T10:07:00.000Z', original.id, { varietyId: 'sq:gheg' });
    const invalidDate = correction('correction-date', 'invalid', original.id);
    const invalidRating = correction('correction-rating', '2026-10-08T10:08:00.000Z', original.id, { payload: { cardKind: 'recall', grade: 'good', correct: true, hinted: false, rating: 9, challenged: true } });
    expect(retractedReviewIds([original, early, chained, wrongLanguage, wrongQuality, wrongLearner, wrongVariety, invalidDate, invalidRating, valid])).toEqual([original.id]);
  });
});
