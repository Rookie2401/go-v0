/** predictDifficulty also returns the text's generic features and the personal estimate built from its stored profile (the library package). */
import { describe, expect, it, vi } from 'vitest';
import { ids } from '../../src/core';
import type { TextProfile } from '../../src/core';

const profileOf = vi.fn();
const featuresOf = vi.fn();
vi.mock('../../src/library', () => ({
  profileOfStoredText: (...a: unknown[]) => profileOf(...a),
  featuresOfStoredText: (...a: unknown[]) => featuresOf(...a),
}));

const { createHarness } = await import('./harness');
const { buildChapter, t } = await import('./courseFixtures');
const { profile, feat } = await import('./profiles');

const U = 'u1';
const BASE = ids.text('es', 'pp');

async function world() {
  const h = createHarness();
  await buildChapter(h.store, { slug: 'pp', sentences: [{ tokens: [t('sol', 'sol', 'NOUN'), t('rio', 'rio', 'NOUN')] }, { tokens: [t('sol', 'sol', 'NOUN')] }] });
  await h.understood(U, 'es', BASE, [0, 1], 'a');
  await h.understood(U, 'es', BASE, [0, 1], 'b');
  return h;
}

describe('predictDifficulty: features and personal', () => {
  it('carries the features of the stored text and a personal estimate from its profile', async () => {
    const h = await world();
    const p: TextProfile = profile(BASE, [['sol', 90], ['nuevo', 10]], { features: feat({ meanSentenceWords: 24 }) });
    featuresOf.mockResolvedValueOnce(feat({ meanSentenceWords: 24 }));
    profileOf.mockResolvedValueOnce(p);
    const f = await h.golearn.predictDifficulty(U, BASE);
    expect(f.features).toMatchObject({ meanSentenceWords: 24 });
    expect(f.personal).toMatchObject({ label: 'manageable', lexicalCoverage: 0.9 });
    expect(f.personal!.factors.find((x) => x.key === 'sentence-length')!.level).toBe('high');
    // it is the same function as scoreProfile
    expect(f.personal).toEqual((await h.golearn.scoreProfile(U, p)).personal);
    // the rest of the forecast is unchanged
    expect(f.summary).toMatch(/^Predicted coverage/);
  });

  it('the profile alone can supply the features; a scoped forecast describes part of a text and so has neither', async () => {
    const h = await world();
    featuresOf.mockResolvedValueOnce(undefined);
    profileOf.mockResolvedValueOnce(profile(BASE, [['sol', 10]], { features: feat({ meanSentenceWords: 7 }) }));
    expect((await h.golearn.predictDifficulty(U, BASE)).features).toMatchObject({ meanSentenceWords: 7 });
    profileOf.mockClear();
    const scoped = await h.golearn.predictDifficulty(U, BASE, { sentenceIds: [`${BASE}/s0`] });
    expect(scoped.features).toBeUndefined();
    expect(scoped.personal).toBeUndefined();
    expect(profileOf).not.toHaveBeenCalled();
  });

  it('when the library cannot profile the text the forecast simply has no features or personal part', async () => {
    const h = await world();
    featuresOf.mockRejectedValueOnce(new Error('not implemented yet'));
    const f = await h.golearn.predictDifficulty(U, BASE);
    expect(f.features).toBeUndefined();
    expect(f.personal).toBeUndefined();
    expect(f.coverage.wordTokens).toBe(3);
    featuresOf.mockResolvedValueOnce(undefined);
    profileOf.mockResolvedValueOnce(undefined);
    expect((await h.golearn.predictDifficulty(U, BASE)).personal).toBeUndefined();
  });
});
