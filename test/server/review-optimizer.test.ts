// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FSRSBinding, FSRSBindingItem, FSRSBindingReview } from '@open-spaced-repetition/binding';
import { default_w } from 'ts-fsrs';
import { optimizeReviewProfile, prepareOptimization, type ReliableReview } from '../../server/review/optimizer';

const sample = (overrides: Partial<ReliableReview> = {}): ReliableReview => ({ eventId: 'r1', targetId: 'word', languageId: 'hi', objective: 'written-recognition', at: '2026-01-01T10:00:00Z', rating: 3, independent: true, ...overrides });

describe('official FSRS personalization boundary', () => {
  it('excludes assistance, corrected grades, duplicate ids, other languages and other objectives', () => {
    const p = prepareOptimization([sample(), sample(), sample({ eventId: 'hint', independent: false }), sample({ eventId: 'undo', corrected: true }),
      sample({ eventId: 'es', languageId: 'es' }), sample({ eventId: 'production', objective: 'productive-recall' }), sample({ eventId: 'clock', at: 'invalid' })], 'hi', 'written-recognition');
    expect(p.rows.map((r) => r.eventId)).toEqual(['r1']);
    expect(p.delayed).toBe(0);
  });

  it('does not fit or activate a profile from a burst of same-day successful clicks', async () => {
    const history = Array.from({ length: 1000 }, (_, i) => sample({ eventId: `r${i}`, at: new Date(Date.UTC(2026, 0, 1, 10, 0, i)).toISOString() }));
    expect(await optimizeReviewProfile(history, { languageId: 'hi', objective: 'written-recognition' })).toMatchObject({ status: 'insufficient-history', reviews: 0, automaticallyActivated: false });
  });

  it('loads the installed official WASI implementation and evaluates genuine delayed histories', () => {
    const item = new FSRSBindingItem([new FSRSBindingReview(3, 0), new FSRSBindingReview(1, 10), new FSRSBindingReview(3, 5)]);
    const evaluation = new FSRSBinding([...default_w]).evaluate([item]);
    expect(Number.isFinite(evaluation.logLoss)).toBe(true);
    expect(Number.isFinite(evaluation.rmseBins)).toBe(true);
  });

  it('fits with the official optimizer and evaluates a chronological holdout without activating it', async () => {
    const history = Array.from({ length: 80 }, (_, target) => Array.from({ length: 8 }, (_, review) => sample({
      eventId: `${target}:${review}`, targetId: `target:${target}`,
      at: new Date(Date.UTC(2026, 0, 1 + review * 20)).toISOString(),
      rating: (target + review) % 5 === 0 ? 1 : 3,
    }))).flat();
    const result = await optimizeReviewProfile(history, { languageId: 'hi', objective: 'written-recognition' });
    expect(['candidate', 'not-improved']).toContain(result.status);
    expect(result.automaticallyActivated).toBe(false);
    expect(Number.isFinite(result.baseline?.logLoss)).toBe(true);
    expect(Number.isFinite(result.candidate?.logLoss)).toBe(true);
  }, 45_000);
});
