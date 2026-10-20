import { describe, expect, it } from 'vitest';
import type { GoEvent, KnowledgeLevel } from '../../../packages/repository-contract/src';
import {
  DEFAULT_KNOWABILITY_WEIGHTS, KNOWABILITY_PRIORITY_POLICY_VERSION, eligibleByKnowability,
  explainReviewPriority, hasConfirmedAutomaticFailure, scoreReviewPriority, seenEligibility,
} from '../../../packages/goreview/src/planner/priority-policy';
import { knowledge } from '../intake/fixtures';

const base = (level: KnowledgeLevel) => ({ level, retrievability: 0.5, due: true, evidenceQuality: 0.8 });
const failure = (over: Partial<GoEvent> = {}): GoEvent => ({
  id: 'r1', v: 2, learnerId: 'L', enrolmentId: 'E', languageId: 'sq', at: '2026-10-01T00:00:00.000Z',
  producer: { app: 'gopractice-review', version: '1', deviceId: 'd' }, kind: 'CardReviewed',
  subject: { cardId: 'card:written-recognition:lemma:sq:libër', itemIds: ['lemma:sq:libër'] },
  payload: { correct: false, hinted: false, answerShownBefore: false, rating: 1 }, evidence: { quality: 'moderate', assisted: false }, ...over,
});

describe('versioned Knowability policy and transparent priority', () => {
  it('publishes the experimental defaults separately from FSRS', () => {
    expect(KNOWABILITY_PRIORITY_POLICY_VERSION).toBe('knowability-priority@1');
    expect(DEFAULT_KNOWABILITY_WEIGHTS).toEqual({ new: 0, seen: 0.3, recognized: 1.5, familiar: 1.5, known: 0.25, automatic: 0.03 });
  });

  it('excludes New and ordinary Automatic, while allowing an explicit practice request', () => {
    expect(eligibleByKnowability(base('new'))).toBe(false);
    expect(eligibleByKnowability({ ...base('new'), explicitRequest: true })).toBe(true);
    expect(eligibleByKnowability(base('automatic'))).toBe(false);
    expect(eligibleByKnowability({ ...base('automatic'), automaticFailure: true })).toBe(true);
    expect(eligibleByKnowability({ ...base('automatic'), explicitRequest: true })).toBe(true);
  });

  it('allows an encountered Seen word while retaining stronger priority triggers', () => {
    const seen = { ...knowledge('lemma:sq:libër'), level: 'seen' as const, encounters: 3, firstSeenAt: '2026-10-01T00:00:00.000Z', lastSeenAt: '2026-10-01T01:00:00.000Z' };
    expect(seenEligibility({ knowledge: seen })).toBe(true);
    expect(seenEligibility({ knowledge: { ...seen, lastSeenAt: '2026-10-02T00:00:00.000Z' } })).toBe(true);
    expect(seenEligibility({ assistanceRequests: 2 })).toBe(true);
    expect(seenEligibility({ explicitRequest: true })).toBe(true);
    expect(seenEligibility({ readingRelevance: 0.65 })).toBe(false);
    expect(seenEligibility({ readingRelevance: 1 })).toBe(true);
  });

  it('requires explicit unassisted failure and excludes a validly corrected or assisted failure', () => {
    expect(hasConfirmedAutomaticFailure([failure()], 'lemma:sq:libër')).toBe(true);
    expect(hasConfirmedAutomaticFailure([failure({ evidence: { quality: 'none', assisted: true } })], 'lemma:sq:libër')).toBe(false);
    const corrected = { ...failure({ id: 'undo', at: '2026-10-02T00:00:00.000Z', correctionOf: 'r1', payload: { rating: null, challenged: true }, evidence: { quality: 'none' } }) };
    expect(hasConfirmedAutomaticFailure([failure(), corrected], 'lemma:sq:libër')).toBe(false);
  });

  it('exposes weighted contributors, favors Recognized over Seen, and handles missing factors conservatively', () => {
    const recognized = explainReviewPriority(base('recognized'));
    const seen = scoreReviewPriority({ ...base('seen'), seenEligible: true });
    expect(recognized.forgettingRisk).toBe(0.5);
    expect(recognized.evidenceQuality).toBe(0.8);
    expect(recognized.score).toBeGreaterThan(seen);
    expect(scoreReviewPriority({ ...base('recognized'), evidenceQuality: Number.NaN })).toBeLessThan(recognized.score);
    expect(Number.isFinite(scoreReviewPriority({ ...base('recognized'), readingRelevance: Number.NaN, recentFailures: Number.NaN, cost: Number.NaN }))).toBe(true);
  });

  it('refuses a nonzero New weight and unknown policy versions', () => {
    expect(() => explainReviewPriority(base('known'), { weights: { new: 0.1 } })).toThrow(/new/i);
    expect(() => explainReviewPriority(base('known'), { version: 'future' })).toThrow(/version/);
  });

  it('overdue urgency grows with elapsed time instead of treating every due card equally', () => {
    const atDue = explainReviewPriority({ ...base('known'), due: true, overdueDays: 0 });
    const oneWeek = explainReviewPriority({ ...base('known'), due: true, overdueDays: 7 });
    const overdue = explainReviewPriority({ ...base('known'), due: true, overdueDays: 14 });
    expect(atDue.urgency).toBe(0);
    expect(oneWeek.urgency).toBeGreaterThan(atDue.urgency);
    expect(overdue.urgency).toBe(1);
  });
});
