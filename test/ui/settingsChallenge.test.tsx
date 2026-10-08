// @vitest-environment jsdom
/**
 * "How hard should suggestions be?" (Settings → Reading, R4): easy / steady / stretch, steady by default, kept on this device like the
 * highlight preference, and passed to `golearn.recommend` by "Next for you" - plus Stage 0's recall card when the engine asks for it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Recommendation } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { getPref, hasPref, setPref } from '../../src/ui/prefs';
import { USER, button, byLabel, click, flush, makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

const app = () => <Shell><AppRoutes /></Shell>;
let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

async function waitFor(check: () => void, tries = 40): Promise<void> {
  for (let i = 0; ; i++) {
    try { check(); return; } catch (e) { if (i >= tries) throw e; await flush(); }
  }
}
const pressed = (group: HTMLElement) => qa<HTMLButtonElement>(group, 'button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

describe('Settings → Reading → How hard should suggestions be?', () => {
  it('is a three-way control, steady by default, that stores the choice like the highlight preference', async () => {
    const h = await makeHarness();
    mounted = await h.mount(app(), { router: '/settings' });
    const reading = byLabel(mounted.container, 'Reading');
    const group = byLabel(reading, 'How hard should suggestions be?');
    expect(qa(group, 'button').map((b) => b.textContent)).toEqual(['easy', 'steady', 'stretch']);
    expect(pressed(group)).toEqual(['steady']);
    expect(getPref('challenge')).toBe('steady');
    expect(hasPref('challenge')).toBe(false); // the default is not a stored choice
    expect(q(reading, '[data-testid="challenge-hint"]')!.textContent).toContain('about 93 % known');

    await click(button(group, 'stretch'));
    expect(pressed(group)).toEqual(['stretch']);
    expect(getPref('challenge')).toBe('stretch');
    expect(hasPref('challenge')).toBe(true);
    expect(JSON.parse(localStorage.getItem('go-v0:prefs')!).challenge).toBe('stretch');
    expect(q(reading, '[data-testid="challenge-hint"]')!.textContent).toContain('about 88 % known');

    await click(button(group, 'easy'));
    expect(pressed(group)).toEqual(['easy']);
    expect(q(reading, '[data-testid="challenge-hint"]')!.textContent).toContain('about 97 % known');
  });

  it('keeps the choice when the page is opened again', async () => {
    const h = await makeHarness();
    setPref('challenge', 'stretch');
    mounted = await h.mount(app(), { router: '/settings' });
    expect(pressed(byLabel(byLabel(mounted.container, 'Reading'), 'How hard should suggestions be?'))).toEqual(['stretch']);
  });

  it('sits in the Reading section and leaves the highlight and theme controls where they were', async () => {
    const h = await makeHarness();
    mounted = await h.mount(app(), { router: '/settings' });
    const reading = byLabel(mounted.container, 'Reading');
    expect(byLabel(reading, 'Highlighting')).not.toBeNull();
    expect(qa(reading, 'input[type="range"]')).toHaveLength(1);
    expect(reading.textContent).toContain('Theme');
  });
});

describe('Next for you passes the setting on', () => {
  const recs: Recommendation[] = [{ reason: 'next-input', textId: STORY_ID, reinforces: [], score: 0.9, explanation: 'Next on your path.' }];

  it('asks the engine for the chosen difficulty (steady until the learner chooses)', async () => {
    const h = await makeHarness({ learn: { recommendations: recs } });
    await seedStory(h.store);
    mounted = await h.mount(app(), { router: '/read' });
    await waitFor(() => expect(h.learn.recommend).toHaveBeenCalled());
    expect(h.learn.recommend).toHaveBeenLastCalledWith(USER, expect.objectContaining({ challenge: 'steady' }));
    await mounted.unmount();

    setPref('challenge', 'stretch');
    mounted = await h.mount(app(), { router: '/read' });
    await waitFor(() => expect(h.learn.recommend).toHaveBeenLastCalledWith(USER, expect.objectContaining({ challenge: 'stretch' })));
  });

  it('shows Stage 0\'s recall card, with the engine\'s reason, when two ladder units in a row went badly', async () => {
    const recall: Recommendation = { reason: 'stage0-recall', reinforces: [], score: 0.945, explanation: 'The last two units were hard in a row: refresh the first words with the recall card in Stage 0.' };
    const h = await makeHarness({ learn: { recommendations: [recall, ...recs] } });
    await seedStory(h.store);
    h.services.stage0 = { available: () => true, overview: async () => ({ available: true, steps: [], meters: {}, after: [], ladder: { open: true } }) } as never;
    mounted = await h.mount(app(), { router: '/read' });
    const m = mounted;
    await waitFor(() => expect(q(m.container, '[data-testid="next-stage0"]')).not.toBeNull());
    const entry = q(m.container, '[data-testid="next-stage0"]')!;
    expect(entry.getAttribute('href')).toBe('/start');
    expect(entry.textContent).toContain('Refresh your first words');
    expect(entry.textContent).toContain('recall card in Stage 0');
    expect(qa(m.container, '[data-testid="next-for-you"] li[data-reason="next-input"]')).toHaveLength(1); // the text suggestion is still there
  });
});
