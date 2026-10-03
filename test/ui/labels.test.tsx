// @vitest-environment jsdom
/**
 * Progress labels everywhere: "Seen x of y sentences" (exposure), "Finished" only after the explicit button,
 * "Understood x of y (your report)", the vocabulary line unchanged. The word "Read" is never used for an exposure count.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ComprehensionReported, Recommendation, SentenceViewed, TextCompleted, TextViewed } from '../../src/core';
import { ids } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { Reader } from '../../src/ui/reader/Reader';
import { progressSummary, seenText, understoodText } from '../../src/ui/coverage';
import { flush, makeHarness, q, qa, sleep } from './harness';
import type { Harness, Mounted } from './harness';
import { JOHN_ID, STORY_ID, seedJohn, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;
const S = (i: number) => ids.sentence(STORY_ID, i);
const NO_READ_COUNT = /\bRead:? \d+ of \d+|\bRead \d+/;

const base = { userId: 'u1', lang: 'es' as const, surface: 'corpus' as const, session: 's0' };
const seen = (h: Harness, i: number) => h.bus.emit<SentenceViewed>({ ...base, type: 'SentenceViewed', dedupeKey: `sv:${i}`, textId: STORY_ID, sentenceId: S(i), tokenIds: [], dwellMs: 2000, contentVersion: 1 });
const understood = (h: Harness, i: number) => h.bus.emit<ComprehensionReported>({ ...base, type: 'ComprehensionReported', dedupeKey: `cr:${i}`, textId: STORY_ID, sentenceIds: [S(i)], modality: 'reading', scope: 'sentence', degree: 'all', contentVersion: 1 });
const finished = (h: Harness) => h.bus.emit<TextCompleted>({ ...base, type: 'TextCompleted', dedupeKey: 'done', textId: STORY_ID, contentVersion: 1 });
const rec = (over: Partial<Recommendation>): Recommendation => ({ reason: 'next-input', reinforces: [], score: 1, explanation: 'because', ...over });

describe('the wording helpers', () => {
  const p = { userId: 'u1', lang: 'es' as const, textId: 't', contentVersion: 1, sentencesTotal: 4, sentencesSeen: 3, sentencesUnderstood: 0, sittings: 1, listenedSentences: 0 };
  it('say Seen / Understood (your report) / Finished, and nothing says Read', () => {
    expect(seenText(p)).toBe('Seen 3 of 4 sentences');
    expect(understoodText({ ...p, sentencesUnderstood: 2 })).toBe('Understood 2 of 4 (your report)');
    expect(progressSummary(p)).toBe('Seen 3 of 4 sentences'); // all seen is not finished
    expect(progressSummary({ ...p, sentencesUnderstood: 2, finishedAt: '2026-09-30T10:00:00.000Z' })).toBe('Seen 3 of 4 sentences · Understood 2 of 4 (your report) · Finished (your mark)');
    expect(progressSummary({ ...p, sentencesSeen: 4, sentencesUnderstood: 0 })).not.toContain('Finished');
  });
});

describe('Reader progress block', () => {
  it('shows Seen, Understood (your report) and Finished apart, and keeps the vocabulary line', async () => {
    const h = await makeHarness({ learn: { known: 0.62, estimated: 0.05 } });
    await seedStory(h.store);
    await seen(h, 0); await seen(h, 1); await seen(h, 2); // every sentence seen...
    await understood(h, 0);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const line = () => q(mounted!.container, '[data-testid="reading-progress"]')!.textContent;
    expect(line()).toBe('Seen 3 of 3 sentences · Understood 1 of 3 (your report)'); // ...but not finished: nobody pressed the button
    expect(line()).not.toContain('Finished');
    await finished(h);
    await flush();
    expect(line()).toBe('Seen 3 of 3 sentences · Understood 1 of 3 (your report) · Finished');
    expect(q(mounted.container, '[data-testid="vocabulary-coverage"]')!.textContent).toContain('shown 62% · likely familiar 5% (estimate) · met 15% · new 18%');
    expect(mounted.container.textContent).not.toMatch(NO_READ_COUNT);
  });

  it('a text finished earlier shows as finished instead of offering the button again', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await finished(h);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(q(mounted.container, '.reader__end [role="status"]')!.textContent).toContain('finished');
    expect(qa(mounted.container, 'button').some((b) => /finished reading/.test(b.textContent ?? ''))).toBe(false);
  });
});

describe('Library rows', () => {
  it('say Seen x of y sentences, add Understood and Finished only when they are true, and never "Read x of y"', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await seedJohn(h.store);
    mounted = await h.mount(app(), { router: '/read' });
    // the Read page is shelf → book → chapters; the story is the single row of the open first shelf and book (it was `ul.list li`)
    const row = () => q(mounted!.container, '.entrylist [role="listitem"]')!.textContent!;
    expect(row()).toContain('Seen 0 of 3 sentences');
    expect(row()).not.toContain('Finished');
    await mounted.unmount();

    await seen(h, 0); await seen(h, 1); await seen(h, 2); await understood(h, 1);
    mounted = await h.mount(app(), { router: '/read' });
    expect(row()).toContain('Seen 3 of 3 sentences · Understood 1 of 3 (your report)');
    expect(row()).not.toContain('Finished'); // all seen, not finished
    await mounted.unmount();

    await finished(h);
    mounted = await h.mount(app(), { router: '/read' });
    expect(row()).toContain('Seen 3 of 3 sentences · Understood 1 of 3 (your report) · Finished');
    expect(mounted.container.textContent).not.toMatch(NO_READ_COUNT);
  });
});

describe('Home', () => {
  it('the Continue card says where you are, as Seen x of y sentences', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await h.bus.emit<TextViewed>({ ...base, type: 'TextViewed', dedupeKey: 'tv', textId: STORY_ID, mode: 'open', contentVersion: 1 });
    await seen(h, 0);
    mounted = await h.mount(app());
    expect(q(mounted.container, '.home__continue')!.textContent).toContain('Continue reading');
    expect(q(mounted.container, '[data-testid="continue-progress"]')!.textContent).toBe('Seen 1 of 3 sentences');
    expect(mounted.container.textContent).not.toMatch(NO_READ_COUNT);
  });

  it('a recommended text shows Seen x of y, and Finished only after the explicit button', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await seen(h, 0); await seen(h, 1); await seen(h, 2);
    h.learn.recommend.mockImplementation(async () => [rec({ reason: 'reread', textId: STORY_ID, explanation: 'You have seen every sentence of "Story 1" but have not marked it finished.' })]);
    mounted = await h.mount(app());
    const item = () => q(mounted!.container, '[data-testid="item-progress"]')!.textContent;
    expect(item()).toBe('Seen 3 of 3 sentences');
    expect(mounted.container.textContent).toContain('have not marked it finished'); // the engine's wording is shown as given
    await mounted.unmount();
    await finished(h);
    mounted = await h.mount(app());
    expect(item()).toBe('Seen 3 of 3 sentences · Finished');
  });
});

describe('the preparation panel', () => {
  it('shows the passage\'s Seen x of y beside the vocabulary line', async () => {
    const h = await makeHarness();
    await seedJohn(h.store);
    await h.bus.emit<SentenceViewed>({ ...base, surface: 'scripture', type: 'SentenceViewed', dedupeKey: 'j0', textId: JOHN_ID, sentenceId: ids.sentence(JOHN_ID, 0), tokenIds: [], dwellMs: 2000, contentVersion: 1 });
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    const prepare = qa(mounted.container, 'button').find((b) => b.textContent === 'Prepare this passage')!;
    prepare.click();
    await sleep(50);
    expect(q(mounted.container, '[data-testid="prepare-progress"]')!.textContent).toBe('Seen 1 of 3 sentences');
    expect(q(mounted.container, '.prepare [data-testid="vocabulary-coverage"]')).not.toBeNull();
    expect(mounted.container.textContent).not.toMatch(NO_READ_COUNT);
  });
});
