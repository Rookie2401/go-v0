/**
 * The CHALLENGE setting (R4, docs/audits/COURSE-AUDIT-2026-10-07.md 4.3 item 8): "How hard should suggestions be?" (Settings → Reading)
 * is easy / steady / stretch, passed to `recommend()` and on to the ranking, whose comprehensibility part PEAKS at 97 % / 93 % / 88 %
 * of the words known. The default is steady, and a recommendation without the option is exactly what it was.
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText } from '../../src/core';
import { RANKING } from '../../src/golearn/policy';
import { comprehensibility } from '../../src/golearn/rank';
import { DEFAULT_PREFS } from '../../src/ui/prefs';
import { routeWorld, U } from './routeWorld';
import { t } from './courseFixtures';

describe('the peak follows the setting', () => {
  it('the targets are 97 / 93 / 88 % and the comprehensibility part is 1 exactly there', () => {
    expect(RANKING.targetCoverage).toEqual({ easy: 0.97, steady: 0.93, stretch: 0.88 });
    for (const target of Object.values(RANKING.targetCoverage)) expect(comprehensibility(target, target)).toBe(1);
    expect(comprehensibility(0.88, RANKING.targetCoverage.stretch)).toBeGreaterThan(comprehensibility(0.88, RANKING.targetCoverage.easy));
    expect(comprehensibility(0.97, RANKING.targetCoverage.easy)).toBeGreaterThan(comprehensibility(0.97, RANKING.targetCoverage.stretch));
  });

  it('is steady by default (the stored preference too)', () => {
    expect(DEFAULT_PREFS.challenge).toBe('steady');
  });

  it.each(['es', 'de'] as const)('%s: the text at 97 % leads on easy, the text at 88 % on stretch; with no setting it is the steady order', async (lang) => {
    const w = await routeWorld(lang);
    const deps = await w.catalogue([w.entry('a-97', 97), w.entry('b-88', 88), w.entry('c-93', 93), w.entry('d-92', 92)]);
    const order = async (challenge?: 'easy' | 'steady' | 'stretch') =>
      (await w.h.golearn.recommend(U, { limit: 12, wholeLibrary: deps, ...(challenge ? { challenge } : {}) } as never))
        .filter((r) => r.reason === 'next-input' && r.textId).map((r) => r.textId!);
    const easy = await order('easy');
    const stretch = await order('stretch');
    const steady = await order('steady');
    expect(easy[0]).toBe(w.idOf('a-97'));
    expect(stretch[0]).toBe(w.idOf('b-88'));
    expect(steady[0]).not.toBe(w.idOf('b-88'));
    expect(await order()).toEqual(steady); // the default is steady
    expect(easy.indexOf(w.idOf('a-97'))).toBeLessThan(easy.indexOf(w.idOf('b-88')));
    expect(stretch.indexOf(w.idOf('b-88'))).toBeLessThan(stretch.indexOf(w.idOf('a-97')));
  });

  it('the setting never removes a text that is in reach: all of them are still offered', async () => {
    const w = await routeWorld('es');
    const deps = await w.catalogue([w.entry('a-97', 97), w.entry('b-88', 88), w.entry('c-90', 90)]);
    for (const challenge of ['easy', 'steady', 'stretch'] as const) {
      const ids = (await w.h.golearn.recommend(U, { limit: 12, wholeLibrary: deps, challenge } as never)).filter((r) => r.reason === 'next-input').map((r) => r.textId);
      expect(ids).toEqual(expect.arrayContaining([w.idOf('a-97'), w.idOf('b-88'), w.idOf('c-90')]));
    }
  });
});

describe('the empty-state copy names the real setting', () => {
  async function exhausted(challenge?: 'easy' | 'steady' | 'stretch') {
    const w = await routeWorld('es', { base: false });
    await buildFixtureText(w.h.store, { lang: 'es', slug: 'only', kind: 'story', title: 'only', sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
    await w.h.complete(U, 'es', w.idOf('only'), 'b');
    return (await w.h.golearn.recommend(U, { limit: 5, ...(challenge ? { challenge } : {}) }))[0].explanation;
  }

  it('points at Settings → Reading → "How hard should suggestions be?" and the stretch choice, not at a setting that does not exist', async () => {
    const copy = await exhausted();
    expect(copy).toMatch(/harder shelf/);
    expect(copy).toContain('Settings, Reading, How hard should suggestions be?');
    expect(copy).toContain('"stretch"');
    expect(copy).not.toMatch(/the stretch setting/);
  });

  it('a learner already on stretch is not told to choose it', async () => {
    const copy = await exhausted('stretch');
    expect(copy).toMatch(/harder shelf \(Explore\)/);
    expect(copy).not.toContain('How hard should suggestions be?');
  });
});
