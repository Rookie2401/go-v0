// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { DimensionState, ItemMarked, TextViewed, LearnerItemState, LearnerLevel, Recommendation } from '../../src/core';
import { ids } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { button, byLabel, choose, click, createTestimonyText, installMediaStubs, makeHarness, q, qa, seedAudio, type as typeInto } from './harness';
import type { Mounted } from './harness';
import { JOHN_ID, STORY_ID, seedJohn, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const dim = (level: LearnerLevel, evidence = 1): DimensionState => ({ level, confidence: 0.5, evidence, exposures: 1, estimatedFamiliar: false, unassisted: 1, assisted: 0 });
const item = (surface: string, reading: LearnerLevel, over: Partial<LearnerItemState> = {}): LearnerItemState => ({
  id: `u1|form:es:${surface}`, userId: 'u1', lang: 'es', itemId: `form:es:${surface}`, itemKind: 'form',
  reading: dim(reading), listening: dim('unseen', 0), writing: dim('unseen', 0), speaking: dim('unseen', 0),
  encounterCount: 2, textIds: [STORY_ID], ...over,
});

const app = () => <Shell><AppRoutes /></Shell>;

describe('Library and routes', () => {
  it('lists texts by corpus with pathway tags and a personalised band badge; scripture has its own list', async () => {
    const h = await makeHarness({ learn: { band: 'productive-challenge', known: 0.91 } });
    await seedStory(h.store);
    await seedJohn(h.store);
    mounted = await h.mount(app(), { router: '/read' });
    const links = qa<HTMLAnchorElement>(mounted.container, 'ul.list a');
    expect(links).toHaveLength(1); // the scripture text is not in the Read list
    expect(links[0].textContent).toContain('Story 1');
    expect(links[0].textContent).toContain('good challenge · shown 91%'); // demonstrated, not merely seen
    expect(links[0].textContent).toContain('Seen 0 of 3 sentences'); // exposure is its own statement (never "Read")
    expect(links[0].textContent).not.toMatch(/Read d/);
    expect(links[0].getAttribute('href')).toBe(`/read/${encodeURIComponent(STORY_ID)}`);
    expect(mounted.container.textContent).toContain('ci-es'); // shelf named by corpus

    // tags act as pathways
    const tags = qa(mounted.container, '.lib__tags button').map((b) => b.textContent);
    expect(tags).toEqual(['all', 'daily-life', 'mission']);
    await click(button(mounted.container, 'mission'));
    expect(qa(mounted.container, 'ul.list a')).toHaveLength(1);
    await mounted.unmount();

    mounted = await h.mount(app(), { router: '/scripture' });
    const sc = qa<HTMLAnchorElement>(mounted.container, 'ul.list a');
    expect(sc).toHaveLength(1);
    expect(sc[0].textContent).toContain('Juan 3');
    expect(sc[0].getAttribute('href')).toBe(`/scripture/${encodeURIComponent(JOHN_ID)}`);
  });

  it('opens a text in the shared Reader with the Player above it', async () => {
    installMediaStubs();
    const h = await makeHarness();
    await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    mounted = await h.mount(app(), { router: `/read/${encodeURIComponent(STORY_ID)}` });
    expect(q(mounted.container, 'article.reader')!.getAttribute('data-mode')).toBe('corpus');
    expect(q(mounted.container, '[data-testid="fixture-badge"]')).not.toBeNull();
    expect(qa(mounted.container, 'button.tok').length).toBeGreaterThan(5);
    expect(q(mounted.container, '.prepare')).toBeNull(); // preparation is for scripture
  });

  it('scripture pages offer "Prepare this passage" with prerequisites and preparatory texts', async () => {
    const h = await makeHarness({ learn: { band: 'difficult', known: 0.5 } });
    await seedStory(h.store);
    await seedJohn(h.store);
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    expect(q(mounted.container, 'article.reader')!.getAttribute('data-mode')).toBe('scripture');
    expect(mounted.container.textContent).not.toContain('Worth learning first'); // closed until asked
    await click(button(mounted.container, 'Prepare this passage'));
    const panel = q(mounted.container, '.prepare-body')!;
    expect(panel.textContent).toContain('difficult');
    expect(panel.textContent).toContain('50%');
    expect(panel.textContent).toContain('pecado');
    const prep = qa<HTMLAnchorElement>(panel, 'a');
    expect(prep).toHaveLength(1);
    expect(prep[0].textContent).toContain('Story 1');
    expect(prep[0].getAttribute('href')).toBe(`/read/${encodeURIComponent(STORY_ID)}`);
  });

  it('Home shows GoLearn recommendations with coverage and routes the testimony rehearsal', async () => {
    const recs: Recommendation[] = [
      { reason: 'easy-story', textId: STORY_ID, band: 'comfortable', reinforces: [], score: 0.9, explanation: 'Mostly words you already know.' },
      { reason: 'rehearse-testimony', testimonyId: 'tst:u1:es', reinforces: [], score: 0.5, explanation: 'Read your latest version aloud.' },
    ];
    const h = await makeHarness({ learn: { recommendations: recs, known: 0.97, band: 'comfortable' } });
    await seedStory(h.store);
    mounted = await h.mount(app(), { router: '/' });
    expect(mounted.container.textContent).toContain('Welcome, Test learner');
    const rows = qa<HTMLAnchorElement>(mounted.container, 'ul.list a');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Story 1');
    expect(rows[0].textContent).toContain('shown 97%');
    expect(rows[0].textContent).toContain('Mostly words you already know.');
    expect(rows[1].getAttribute('href')).toBe('/testimony');
    // no persistent nav strip: the doorway entries, then the quiet links
    expect(qa(mounted.container, 'nav[aria-label="Start here"] .home__entry-name').map((a) => a.textContent)).toEqual(['Read', 'Scripture', 'My Testimony']);
    expect(qa(mounted.container, '.home__links a').map((a) => a.textContent)).toEqual(['Settings', 'Vocabulary']);
    expect(q(mounted.container, 'nav[aria-label="Main"]')).toBeNull();
  });
});

describe('Testimony privacy', () => {
  async function withPrivateText(h: Awaited<ReturnType<typeof makeHarness>>) {
    await seedStory(h.store);
    await seedJohn(h.store);
    const id = await createTestimonyText(h.store, h.voice, {
      id: 'tst:u1:es/r1', testimonyId: 'tst:u1:es', userId: 'u1', lang: 'es', number: 1, createdAt: '', fullText: 'Yo creo en Dios.',
      sentences: [{ index: 0, text: 'Yo creo en Dios.', textHash: 'h' }], acceptedSuggestionIds: [],
    });
    return id;
  }

  it('never lists testimony texts in Read or Scripture, and never badges them', async () => {
    const h = await makeHarness();
    const privateId = await withPrivateText(h);
    mounted = await h.mount(app(), { router: '/read' });
    expect(qa(mounted.container, 'ul.list a').map((a) => a.textContent)).toEqual([expect.stringContaining('Story 1')]);
    expect(mounted.container.textContent).not.toContain('Testimony v1');
    expect(h.learn.coverage).not.toHaveBeenCalledWith('u1', privateId);
    await mounted.unmount();
    mounted = await h.mount(app(), { router: '/scripture' });
    expect(qa(mounted.container, 'ul.list a')).toHaveLength(1);
    expect(mounted.container.textContent).not.toContain('Testimony v1');
  });

  it('filters by corpus kind too, even if a text claims another kind', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await h.store.corpora.put({ id: 'testimony-es', lang: 'es', kind: 'testimony', title: 'Testimonies' });
    const t = (await h.store.texts.get(STORY_ID))!;
    await h.store.texts.put({ ...t, id: 'text:es:sneaky', title: 'Sneaky', corpusId: 'testimony-es', kind: 'story' });
    mounted = await h.mount(app(), { router: '/read' });
    expect(mounted.container.textContent).not.toContain('Sneaky');
  });

  it('drops recommendations that point at a testimony text, keeping the generic rehearsal card', async () => {
    const h = await makeHarness({ learn: { recommendations: [] } });
    const privateId = await withPrivateText(h);
    const recs: Recommendation[] = [
      { reason: 'easy-story', textId: privateId, reinforces: [], score: 1, explanation: 'private leak?' },
      { reason: 'rehearse-testimony', textId: privateId, testimonyId: 'tst:u1:es', reinforces: [], score: 0.8, explanation: 'Read your latest version aloud.' },
      { reason: 'easy-story', textId: STORY_ID, reinforces: [], score: 0.5, explanation: 'Mostly known words.' },
    ];
    h.learn.recommend.mockImplementation(async () => recs);
    mounted = await h.mount(app(), { router: '/' });
    const rows = qa(mounted.container, 'ul.list li');
    expect(rows).toHaveLength(2);
    expect(mounted.container.textContent).not.toContain('Testimony v1');
    expect(mounted.container.textContent).not.toContain('private leak?');
    // input comes before the testimony rehearsal, whatever order the engine returned
    expect(rows[0].textContent).toContain('Story 1');
    expect(rows[1].querySelector('a')!.getAttribute('href')).toBe('/testimony');
    expect(rows[1].textContent).toContain('Rehearse your testimony');
    expect(h.learn.coverage).not.toHaveBeenCalledWith('u1', privateId);
  });

  it('will not open a testimony text through the Read route, and hides it from passage preparation', async () => {
    const h = await makeHarness({ learn: { readiness: { preparatoryTexts: [] } } });
    const privateId = await withPrivateText(h);
    mounted = await h.mount(app(), { router: `/read/${encodeURIComponent(privateId)}` });
    expect(mounted.container.textContent).toContain('not in your library');
    expect(q(mounted.container, 'article.reader')).toBeNull();
    expect(await h.events('TextViewed')).toHaveLength(0);
    await mounted.unmount();

    h.learn.scriptureReadiness.mockImplementation(async (_u: string, textId: string) => ({
      textId, sentenceIds: [], coverage: await h.learn.coverage('u1', textId), familiarItems: [], unfamiliarForms: [], knownPhrases: [], difficultPatterns: [], prerequisites: [],
      preparatoryTexts: [{ textId: privateId, covers: ['x'], band: 'comfortable', generated: false }, { textId: STORY_ID, covers: ['y'], band: 'comfortable', generated: false }],
      gaps: [], corpusCanPrepare: true,
    }));
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    await click(button(mounted.container, 'Prepare this passage'));
    const links = qa<HTMLAnchorElement>(q(mounted.container, '.prepare-body')!, 'a');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain('Story 1');
  });
});

describe('Settings', () => {
  it('lists vocabulary from learner state, filters it, and marks items through ItemMarked', async () => {
    const h = await makeHarness();
    await h.store.learnerItems.bulkPut([item('creo', 'recognized'), item('perdón', 'encountered'), item('pecado', 'rapid'), item('ein', 'recognized', { id: 'u1|form:de:ein', lang: 'de', itemId: 'form:de:ein' })]);
    mounted = await h.mount(app(), { router: '/settings' });
    const rowsOf = () => qa(mounted!.container, 'table.vocab:not(.diag) tbody tr').map((r) => r.querySelector('th')!.textContent);
    expect(rowsOf()).toEqual(['pecado', 'creo', 'perdón']); // by level, then encounters; other languages excluded

    await typeInto(byLabel<HTMLInputElement>(mounted.container, 'Search vocabulary'), 'per');
    expect(rowsOf()).toEqual(['perdón']);

    await choose(byLabel<HTMLSelectElement>(mounted.container, 'Mark perdón'), 'known');
    const marks = (await h.events('ItemMarked')) as ItemMarked[];
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ itemId: 'form:es:perdón', mark: 'known', itemKind: 'form' });
  });

  it('shows the voice (requested vs delivered locale, fixture badge) and audio diagnostics, and runs jobs', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, [ids.sentence(STORY_ID, 0)]);
    mounted = await h.mount(app(), { router: '/settings' });
    const voice = q(mounted.container, '[data-testid="voice-card"]')!;
    expect(voice.textContent).toContain('fixture');
    expect(voice.textContent).toContain('es-HN');
    expect(voice.textContent).toContain('es-419');
    expect(voice.textContent).toContain('fallback accent');
    expect(voice.textContent).toContain('fixture audio — not speech');
    expect(voice.textContent).toContain('not reviewed'); // nobody has auditioned this voice

    // the audio diagnostics and the rebuild control live under Advanced (collapsed by default)
    expect(q(mounted.container, '[data-testid="job-counts"]')).toBeNull();
    await click(button(byLabel(mounted.container, 'Advanced'), 'Advanced'));
    expect(q(mounted.container, '[data-testid="job-counts"]')!.textContent).toContain('1 segment(s) · 1 failed job(s) · 0 dead job(s)');
    expect(q(mounted.container, 'table.diag tbody')!.textContent).toContain('by-construction');
    await click(button(mounted.container, 'Run pending audio jobs'));
    expect(h.listen.runJobs).toHaveBeenCalled();
    expect(mounted.container.textContent).toContain('Processed 2 job(s).');
    await click(button(mounted.container, 'Rebuild learning state'));
    expect(h.learn.rebuild).toHaveBeenCalledWith('u1');
  });

  it('switches learner and course, and adds a learner', async () => {
    const h = await makeHarness();
    await h.store.users.put({ id: 'u2', displayName: 'Second', courseId: 'thailand-th', createdAt: '2026-02-01T00:00:00.000Z' });
    mounted = await h.mount(app(), { router: '/settings' });
    expect(q(mounted.container, '.who')!.textContent).toContain('Test learner · ES');

    await choose(byLabel<HTMLSelectElement>(mounted.container, 'Learner'), 'u2');
    expect(q(mounted.container, '.who')!.textContent).toContain('Second · TH');
    expect(byLabel<HTMLSelectElement>(mounted.container, 'Team').value).toBe('thailand-th');

    await choose(byLabel<HTMLSelectElement>(mounted.container, 'Team'), 'india-hi');
    expect((await h.store.users.get('u2'))!.courseId).toBe('india-hi');
    expect(q(mounted.container, '.who')!.textContent).toContain('Second · HI');

    await typeInto(byLabel<HTMLInputElement>(mounted.container, 'New learner name'), 'Third');
    await choose(byLabel<HTMLSelectElement>(mounted.container, 'New learner course'), 'germany-de');
    await click(button(mounted.container, 'Add learner'));
    const added = (await h.store.users.all()).find((u) => u.displayName === 'Third')!;
    expect(added.courseId).toBe('germany-de');
    expect(q(mounted.container, '.who')!.textContent).toContain('Third · DE'); // switched to the new learner
  });
});

describe('Home — continue card', () => {
  it('offers the last text read, and never a private testimony text', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    const privateId = await createTestimonyText(h.store, h.voice, {
      id: 'tst:u1:es/r1', testimonyId: 'tst:u1:es', userId: 'u1', lang: 'es', number: 1, createdAt: '', fullText: 'Yo creo en Dios.',
      sentences: [{ index: 0, text: 'Yo creo en Dios.', textHash: 'h' }], acceptedSuggestionIds: [],
    });
    const view = (textId: string, at: string) => h.bus.emit<TextViewed>({ type: 'TextViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 'ses-test', dedupeKey: `tv:${textId}`, textId, at });
    await view(STORY_ID, '2026-02-01T10:00:00.000Z');
    await view(privateId, '2026-02-02T10:00:00.000Z'); // more recent, but private
    mounted = await h.mount(app(), { router: '/' });
    const card = q<HTMLAnchorElement>(mounted.container, 'a.home__continue')!;
    expect(card.textContent).toContain('Continue reading');
    expect(card.textContent).toContain('Story 1');
    expect(card.textContent).not.toContain('Testimony v1');
    expect(card.getAttribute('href')).toBe(`/read/${encodeURIComponent(STORY_ID)}`);
  });

  it('has no continue card before anything has been read', async () => {
    const h = await makeHarness();
    mounted = await h.mount(app(), { router: '/' });
    expect(q(mounted.container, 'a.home__continue')).toBeNull();
  });
});

describe('Reader — previous / next text', () => {
  it('links to the neighbouring texts of the same corpus, by title', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    const story = (await h.store.texts.get(STORY_ID))!;
    await h.store.texts.put({ ...story, id: 'text:es:story-02', title: 'Story 2' });
    mounted = await h.mount(app(), { router: `/read/${encodeURIComponent(STORY_ID)}` });
    const nav = q(mounted.container, 'nav.reader__nav[aria-label="Texts"]')!;
    const links = qa<HTMLAnchorElement>(nav, 'a');
    expect(links).toHaveLength(1); // first in its corpus: nothing before it
    expect(links[0].textContent).toContain('Next');
    expect(links[0].textContent).toContain('Story 2');
    expect(links[0].getAttribute('href')).toBe('/read/text%3Aes%3Astory-02');
  });
});
