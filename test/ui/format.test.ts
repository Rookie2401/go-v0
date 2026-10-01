import { describe, expect, it } from 'vitest';
import { plainReason, plainReasons, splitCoverage } from '../../src/ui/format';

describe('plainReason', () => {
  it('maps the importer\'s reasons to short plain forms', () => {
    expect(plainReason('review status is "unreviewed" — machine-drafted text needs a native-speaker review (set review.status to "reviewed" with reviewedBy and reviewedAt)'))
      .toBe('awaiting native-speaker review');
    expect(plainReason('review status is "in-review" — needs a review (set review.status to "reviewed" with reviewedBy and reviewedAt)')).toBe('awaiting review');
    expect(plainReason('the wording is not verified against a published source — run scripts/verify-scripture.mjs (or proofread and record scripture.verification)'))
      .toBe('wording not yet verified against a published source');
    expect(plainReason('rights are unverified — replace the text with a licensed or public-domain one, or establish the rights and update source.rights')).toBe('rights not yet established');
    expect(plainReason('the translation is not identified — set scripture.translationId to the exact translation')).toBe('translation not yet identified');
    expect(plainReason('the review names no reviewer — set review.reviewedBy')).toBe('the review does not name a reviewer');
  });

  it('strips a trailing "(set …)", "(run …)" or "(or …)" hint from any other string', () => {
    expect(plainReason('something is missing (set foo.bar to a value)')).toBe('something is missing');
    expect(plainReason('stale index (run npm run build)')).toBe('stale index');
    expect(plainReason('no voice (or add one in Settings)')).toBe('no voice');
    expect(plainReason('Review in progress (review status: in-review).')).toBe('Review in progress (review status: in-review).'); // not a hint
  });

  it('cleans reasons embedded in a longer sentence (GoLearn\'s note text)', () => {
    const note = 'No Spanish text is published yet: 2 imported texts are waiting (review status is "unreviewed" — machine-drafted text needs a native-speaker review (set review.status to "reviewed" with reviewedBy and reviewedAt); rights are unverified — replace the text with a licensed or public-domain one, or establish the rights and update source.rights). You can still use preview mode to see them.';
    expect(plainReason(note)).toBe('No Spanish text is published yet: 2 imported texts are waiting (awaiting native-speaker review; rights not yet established). You can still use preview mode to see them.');
  });

  it('plainReasons removes duplicates', () => {
    const a = 'review status is "unreviewed" — needs a review (set review.status to "reviewed" with reviewedBy and reviewedAt)';
    const b = 'review status is "missing" — needs a review (set review.status to "reviewed" with reviewedBy and reviewedAt)';
    expect(plainReasons([a, b, 'x'])).toEqual(['awaiting review', 'x']);
  });
});

describe('splitCoverage', () => {
  it('keeps one sentence whole', () => {
    expect(splitCoverage('It cannot judge meaning.')).toEqual({ lead: 'It cannot judge meaning.', rest: '' });
  });
  it('leads with the sentence that says accepting is not proof of correctness, and hides the rest', () => {
    const r = splitCoverage('A checker has limited coverage. Accepting this does not mean the sentence is correct. Known limits: one. Two.');
    expect(r.lead).toBe('A checker has limited coverage. Accepting this does not mean the sentence is correct.');
    expect(r.rest).toBe('Known limits: one. Two.');
  });
});
