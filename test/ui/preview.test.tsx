// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { Recommendation } from '../../src/core';
import { buildFixtureText } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { button, byLabel, check, click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { JOHN_ID, STORY_ID, seedJohn, seedStory, seedThai } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;

/** A story and a chapter that exist but have not been reviewed / verified. */
async function seedUnpublished(h: Harness) {
  await buildFixtureText(h.store, {
    lang: 'es', slug: 'story-01', title: 'Story 1', tags: ['mission'], reviewStatus: 'unreviewed', published: false,
    sentences: [{ tokens: [{ surface: 'Yo', lemma: 'yo', gloss: 'I' }, { surface: 'creo', lemma: 'creer', gloss: 'believe' }, { surface: '.', isWord: false }], english: 'I believe.' }],
  });
  const t = (await h.store.texts.get(STORY_ID))!;
  await h.store.texts.put({ ...t, unpublishedReasons: ['Awaiting native-speaker review (review status: unreviewed).'] });
  await buildFixtureText(h.store, {
    lang: 'es', slug: 'john-3', title: 'Juan 3', kind: 'scripture', version: 'Reina-Valera 1909', scripture: { book: 'JHN', chapter: 3 },
    reviewStatus: 'unreviewed', published: false,
    sentences: [{ tokens: [{ surface: 'Porque', lemma: 'porque' }, { surface: '.', isWord: false }], verseRefs: ['JHN.3.16'] }],
  });
  const j = (await h.store.texts.get(JOHN_ID))!;
  await h.store.texts.put({ ...j, unpublishedReasons: ['The wording has not been verified against a named source.'] });
}

describe('Preview mode is off by default and gates what is shown', () => {
  it('lists only published texts; with nothing published it says exactly what is awaited', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    mounted = await h.mount(app(), { router: '/read' });
    expect(qa(mounted.container, 'ul.list a')).toHaveLength(0);
    const awaited = q(mounted.container, '[data-testid="awaited"]')!;
    expect(awaited.textContent).toContain('No stories or dialogues in Spanish are published yet');
    expect(awaited.textContent).toContain('1 text is imported but awaiting native-speaker review');
    expect(awaited.textContent).toContain('Awaiting native-speaker review (review status: unreviewed).'); // the reason itself
    expect(q(mounted.container, '[data-testid="preview-banner"]')).toBeNull();
  });

  it('says so when nothing has been imported at all', async () => {
    const h = await makeHarness();
    mounted = await h.mount(app(), { router: '/read' });
    expect(q(mounted.container, '[data-testid="awaited"]')!.textContent).toContain('No stories or dialogues in Spanish have been imported yet');
  });

  it('never shows Scripture whose wording is unverified, and names what is awaited', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    mounted = await h.mount(app(), { router: '/scripture' });
    expect(qa(mounted.container, 'ul.list a')).toHaveLength(0);
    const awaited = q(mounted.container, '[data-testid="awaited"]')!.textContent!;
    expect(awaited).toContain('No Scripture in Spanish is published yet');
    expect(awaited).toContain('review and verification of the wording against a named source');
    expect(awaited).toContain('The wording has not been verified against a named source.');
  });

  it('refuses a deep link to an unpublished text, and to unverified Scripture, with the reasons', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    mounted = await h.mount(app(), { router: `/read/${encodeURIComponent(STORY_ID)}` });
    const gate = q(mounted.container, '[data-testid="unpublished-gate"]')!;
    expect(gate.textContent).toContain('not published yet');
    expect(gate.textContent).toContain('Awaiting native-speaker review');
    expect(q(mounted.container, 'article.reader')).toBeNull();
    expect(await h.events('TextViewed')).toHaveLength(0); // opening it would have been recorded
    await mounted.unmount();

    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    expect(q(mounted.container, '[data-testid="unpublished-gate"]')!.textContent).toContain('not been verified');
    expect(q(mounted.container, 'article.reader')).toBeNull();
  });

  it('asks GoLearn for published texts only, in the learner\'s language, and drops an unpublished text it is offered anyway', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    const recs: Recommendation[] = [{ reason: 'first-text', textId: STORY_ID, reinforces: [], score: 1, explanation: 'Leaked?' }];
    h.learn.recommend.mockImplementation(async () => recs);
    mounted = await h.mount(app(), { router: '/' });
    expect(h.learn.recommend).toHaveBeenCalledWith('u1', { limit: 5, includeUnpublished: false, lang: 'es' });
    expect(mounted.container.textContent).not.toContain('Leaked?');
    // the empty state names what is awaited rather than "Open a story to begin"
    expect(q(mounted.container, '[data-testid="home-empty"]')!.textContent).toContain('awaiting native-speaker review');
  });

  it('does not offer an unpublished text as passage preparation', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await seedJohn(h.store);
    const story = (await h.store.texts.get(STORY_ID))!;
    await h.store.texts.put({ ...story, published: false, unpublishedReasons: ['x'] });
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    await click(button(mounted.container, 'Prepare this passage'));
    expect(h.learn.scriptureReadiness).toHaveBeenCalledWith('u1', JOHN_ID, undefined, { includeUnpublished: false });
    expect(qa(q(mounted.container, '.prepare-body')!, 'a')).toHaveLength(0);
  });

  it('keeps languages apart: another language\'s texts are not listed and do not open', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await seedThai(h.store);
    mounted = await h.mount(app(), { router: '/read' });
    expect(qa(mounted.container, 'ul.list a').map((a) => a.textContent)).toEqual([expect.stringContaining('Story 1')]);
    await mounted.unmount();
    mounted = await h.mount(app(), { router: `/read/${encodeURIComponent('text:th:th-1')}` });
    expect(mounted.container.textContent).toContain('This text is in Thai, not the language you are learning');
    expect(q(mounted.container, 'article.reader')).toBeNull();
  });
});

describe('Preview mode on', () => {
  async function turnOn(h: Harness) {
    mounted = await h.mount(app(), { router: '/settings' });
    await check(byLabel<HTMLInputElement>(mounted.container, 'Preview unreviewed content'));
  }

  it('is persisted on this device, off until chosen, and shows an unmistakable banner on every screen', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    expect(localStorage.getItem('go-v0:prefs')).toBeNull();
    await turnOn(h);
    expect(JSON.parse(localStorage.getItem('go-v0:prefs')!).preview).toBe(true);
    const banner = q(mounted!.container, '[data-testid="preview-banner"]')!;
    expect(banner.textContent).toContain('Preview mode');
    expect(banner.textContent).toContain('not been reviewed or verified');
    await mounted!.unmount();
    // the same banner on other screens (the preference outlives the screen)
    for (const route of ['/', '/read', '/scripture', '/testimony', '/vocabulary', `/read/${encodeURIComponent(STORY_ID)}`]) {
      mounted = await h.mount(app(), { router: route });
      expect(q(mounted.container, '[data-testid="preview-banner"]'), route).not.toBeNull();
      await mounted.unmount();
      mounted = undefined;
    }
  });

  it('lists unpublished texts with their reasons, badged, and opens them', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    await turnOn(h);
    await mounted!.unmount();
    mounted = await h.mount(app(), { router: '/read' });
    const links = qa<HTMLAnchorElement>(mounted.container, 'ul.list a');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain('Story 1');
    expect(links[0].textContent).toContain('unpublished · not reviewed');
    expect(byLabel(mounted.container, 'Why Story 1 is not published').textContent).toContain('Awaiting native-speaker review');
    expect(q(mounted.container, '[data-testid="awaited"]')).toBeNull();
    await mounted.unmount();

    mounted = await h.mount(app(), { router: '/scripture' });
    expect(qa(mounted.container, 'ul.list a')).toHaveLength(1);
    expect(byLabel(mounted.container, 'Why Juan 3 is not published').textContent).toContain('not been verified');
    await mounted.unmount();

    mounted = await h.mount(app(), { router: `/read/${encodeURIComponent(STORY_ID)}` });
    expect(q(mounted.container, 'article.reader')).not.toBeNull();
    expect(qa(mounted.container, '.reader__meta .chip').map((c) => c.textContent)).toContain('unpublished · not reviewed');
    expect(byLabel(mounted.container, 'Why Story 1 is not published')).not.toBeNull();
  });

  it('asks GoLearn to include unpublished texts and Home shows them marked', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    await turnOn(h);
    await mounted!.unmount();
    h.learn.recommend.mockImplementation(async () => [{ reason: 'first-text', textId: STORY_ID, reinforces: [], score: 1, explanation: 'Start with this one.' }] as Recommendation[]);
    mounted = await h.mount(app(), { router: '/' });
    expect(h.learn.recommend).toHaveBeenCalledWith('u1', { limit: 5, includeUnpublished: true, lang: 'es' });
    const row = q(mounted.container, 'li[data-reason="first-text"]')!;
    expect(row.textContent).toContain('Story 1');
    expect(row.textContent).toContain('unpublished');
  });

  it('the banner turns preview off, and everything returns to the gated view', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    await turnOn(h);
    await click(button(mounted!.container, 'Turn off preview'));
    expect(q(mounted!.container, '[data-testid="preview-banner"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('go-v0:prefs')!).preview).toBe(false);
    expect(byLabel<HTMLInputElement>(mounted!.container, 'Preview unreviewed content').checked).toBe(false);
  });

  it('passes the preview flag to GoListen\'s audio status', async () => {
    const h = await makeHarness();
    await seedUnpublished(h);
    await turnOn(h);
    await mounted!.unmount();
    mounted = await h.mount(app(), { router: `/read/${encodeURIComponent(STORY_ID)}` });
    expect(h.listen.audioStatus).toHaveBeenCalledWith(STORY_ID, { preview: true });
  });
});
