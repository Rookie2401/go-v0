// @vitest-environment jsdom
/**
 * The engine's recommendations reach the learner: "Next for you" on the Reading page (golearn.recommend, Stage 0 first while it
 * is unfinished) (the "Your path" entry on Home: yourPathEntry.test.tsx).
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Recommendation } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { flush, makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

/** Retries an assertion while the page's async effects settle. */
async function waitFor(check: () => void, tries = 40): Promise<void> {
  for (let i = 0; ; i++) {
    try { check(); return; } catch (e) { if (i >= tries) throw e; await flush(); }
  }
}

const app = () => <Shell><AppRoutes /></Shell>;
let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

describe('Next for you on the Reading page', () => {
  it('lists the texts the engine recommends with their reasons, leaves out listening-only and testimony suggestions, and links Your path', async () => {
    const recs: Recommendation[] = [
      { reason: 'listen-to-read-text', textId: STORY_ID, reinforces: [], score: 0.95, explanation: 'Listen to it.' },
      { reason: 'next-input', textId: STORY_ID, reinforces: [], score: 0.9, explanation: 'Next on your path: a short story at your level.' },
      { reason: 'rehearse-testimony', testimonyId: 'tst:u1:es', reinforces: [], score: 0.5, explanation: 'Read your latest version aloud.' },
    ];
    const h = await makeHarness({ learn: { recommendations: recs } });
    await seedStory(h.store);
    mounted = await h.mount(app(), { router: '/read' });
    const m = mounted;
    await waitFor(() => expect(qa(m.container, '[data-testid="next-for-you"] li')).toHaveLength(1));
    const row = q(m.container, '[data-testid="next-for-you"] li')!;
    expect(row.getAttribute('data-reason')).toBe('next-input');
    expect(row.textContent).toContain('Story 1');
    expect(row.textContent).toContain('Next on your path: a short story at your level.');
    expect(qa<HTMLAnchorElement>(m.container, '[data-testid="next-for-you"] a').map((a) => a.getAttribute('href'))).toContain('/path');
  });

  it('says what the engine says when it has no text to offer', async () => {
    const recs: Recommendation[] = [{ reason: 'first-text', reinforces: [], score: 0, explanation: 'No Spanish text has been imported yet.' }];
    const h = await makeHarness({ learn: { recommendations: recs } });
    mounted = await h.mount(app(), { router: '/read' });
    const m = mounted;
    await waitFor(() => expect(q(m.container, '[data-testid="next-note"]')?.textContent).toBe('No Spanish text has been imported yet.'));
    expect(qa(m.container, '[data-testid="next-for-you"] li')).toHaveLength(0);
  });
});
