// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { Recommendation, TextCompleted } from '../../src/core';
import { buildFixtureText } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;

const rec = (over: Partial<Recommendation>): Recommendation => ({ reason: 'next-input', reinforces: [], score: 1, explanation: 'because', ...over });
const rows = () => qa(mounted!.container, 'ul.list li');
const complete = (h: Harness, textId = STORY_ID) =>
  h.bus.emit<TextCompleted>({ type: 'TextCompleted', userId: 'u1', lang: 'es', surface: 'corpus', session: 's0', dedupeKey: `done:${textId}`, textId });

async function seedSecond(h: Harness) {
  await buildFixtureText(h.store, { lang: 'es', slug: 'story-02', title: 'Story 2', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola' }, { surface: '.', isWord: false }] }] });
}

describe('Home recommendations follow the learner\'s state', () => {
  it('a new learner is pointed at one first text', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    h.learn.recommend.mockImplementation(async () => [rec({ reason: 'first-text', textId: STORY_ID, explanation: 'The easiest published story.' })]);
    mounted = await h.mount(app());
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('A good first text');
    expect(rows()[0].textContent).toContain('Story 1');
    expect(rows()[0].querySelector('a')!.getAttribute('href')).toBe(`/read/${encodeURIComponent(STORY_ID)}`);
  });

  it('when nothing is published, the first-text note is shown as plain text (no link) and says what is awaited', async () => {
    const h = await makeHarness();
    h.learn.recommend.mockImplementation(async () => [rec({ reason: 'first-text', explanation: 'No story is published for Spanish yet: they are waiting for native-speaker review.' })]);
    mounted = await h.mount(app());
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector('a')).toBeNull();
    expect(rows()[0].textContent).toContain('waiting for native-speaker review');
  });

  it('after a completed text it offers the next input, a reread, and real listening, never "Open a story to begin"', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await seedSecond(h);
    await complete(h);
    h.learn.recommend.mockImplementation(async () => [
      rec({ reason: 'next-input', textId: 'text:es:story-02', explanation: 'A new story at a comfortable level.' }),
      rec({ reason: 'reread', textId: STORY_ID, explanation: 'You said you understood only some of it.' }),
      rec({ reason: 'listen-to-read-text', textId: STORY_ID, explanation: 'Reviewed real speech exists for this text.' }),
    ]);
    mounted = await h.mount(app());
    expect(rows().map((r) => r.getAttribute('data-reason'))).toEqual(['next-input', 'reread', 'listen-to-read-text']);
    expect(rows()[1].textContent).toContain('Read it again');
    expect(rows()[2].textContent).toContain('Listen to something you have read');
    expect(mounted.container.textContent).not.toContain('Open a story to begin');
  });

  it('after a completed text with nothing left to read, says so instead of "Open a story to begin"', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await complete(h);
    h.learn.recommend.mockImplementation(async () => []);
    mounted = await h.mount(app());
    const empty = q(mounted.container, '[data-testid="home-empty"]')!.textContent!;
    expect(empty).toContain('You have read everything currently available in Spanish');
    expect(mounted.container.textContent).not.toContain('Open a story to begin');
  });

  it('before anything is finished, with texts available, an empty list still invites the learner to open one', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    mounted = await h.mount(app());
    expect(q(mounted.container, '[data-testid="home-empty"]')!.textContent).toContain('Open a story to begin');
  });

  it('a completion in another language does not change this language\'s wording', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await h.bus.emit<TextCompleted>({ type: 'TextCompleted', userId: 'u1', lang: 'de', surface: 'corpus', session: 's0', dedupeKey: 'done:de', textId: 'text:de:x' });
    mounted = await h.mount(app());
    expect(q(mounted.container, '[data-testid="home-empty"]')!.textContent).toContain('Open a story to begin');
  });

  it('puts input before the testimony rehearsal even if the engine listed the rehearsal first', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await seedSecond(h);
    h.learn.recommend.mockImplementation(async () => [
      rec({ reason: 'rehearse-testimony', testimonyId: 'tst:u1:es', explanation: 'Read your latest version aloud.' }),
      rec({ reason: 'next-input', textId: 'text:es:story-02', explanation: 'Something new.' }),
    ]);
    mounted = await h.mount(app());
    expect(rows().map((r) => r.getAttribute('data-reason'))).toEqual(['next-input', 'rehearse-testimony']);
    expect(rows()[1].querySelector('a')!.getAttribute('href')).toBe('/testimony');
  });

  it('with nothing published, names what is awaited, lists the reasons, and points at preview mode', async () => {
    const h = await makeHarness();
    await buildFixtureText(h.store, { lang: 'es', slug: 'draft-story', title: 'Draft', reviewStatus: 'unreviewed', published: false, sentences: [{ tokens: [{ surface: 'Hola' }] }] });
    mounted = await h.mount(app());
    const empty = q(mounted.container, '[data-testid="home-empty"]')!;
    expect(empty.textContent).toContain('awaiting native-speaker review');
    expect(empty.textContent).toContain('fixture: marked unpublished');
    const link = q<HTMLAnchorElement>(empty, 'a')!;
    expect(link.getAttribute('href')).toBe('/settings');
    expect(link.textContent).toContain('Preview mode');
    expect(mounted.container.textContent).not.toContain('Open a story to begin');
  });
});
