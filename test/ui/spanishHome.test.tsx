// @vitest-environment jsdom
// Uses fakes: the library (h.library: a small in-memory index), GoLearn.rankLibrary (scripted), and the catalogue's streams (SPANISH_STREAMS passed
// to the harness; the paged work search is the real catalogue's over the works in the memory store, or a scripted one where a test says so).
import { afterEach, describe, expect, it } from 'vitest';
import type { RankedText } from '../../src/core';
import { SPANISH_COURSE_ID, SPANISH_DOORS, SPANISH_STREAMS } from '../../src/course/spanish';
import { AppRoutes, Shell } from '../../src/ui/App';
import { buildFixtureText } from '../../src/core';
import { setPref } from '../../src/ui/prefs';
import { button, byLabel, click, flush, makeHarness, q, qa, catalogText } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;
const spanish = (o: Parameters<typeof makeHarness>[0] = {}) => makeHarness({ streams: SPANISH_STREAMS, ...o });
const noWorks = async () => ({ total: 0, items: [] });

const ranked = (textId: string, label: RankedText['profile']['personal']['label'], reasons: string[]): RankedText => ({
  textId, score: 0.71, reasons,
  parts: { comprehensibility: 0.7, interest: 0.5, reinforcement: 0.4, regional: 0.3, novelty: 0.2, challenge: 0.5, quality: 0.6 },
  profile: { textId, knownShare: 0.9, familiarShare: 0.04, metShare: 0.04, newShare: 0.02, newForms: 12, weakItems: [], newPatterns: [], newPhrases: [], personal: { label, factors: [], caveats: [] } },
});

const LIB = [
  catalogText({ id: 'text:es:cuento-1', title: 'El cuento del lobo', author: 'Ana Rivas', stream: 'library' }),
  catalogText({ id: 'text:es:honduras-1', title: 'Mercado en Tegucigalpa', stream: 'honduras', streams: ['honduras'] }),
  catalogText({ id: 'text:es:honduras-2', title: 'La lluvia de mayo', stream: 'honduras', streams: ['honduras'] }),
  catalogText({ id: 'text:es:historia-1', title: 'Una historia breve', stream: 'knowledge', domains: ['history'] }),
];

describe('Home for a course with streams (Spanish)', () => {
  it('shows Best next reads from the ranking: title, personal difficulty in words, the one-line reason, and no bare number', async () => {
    const h = await spanish({ library: LIB });
    h.learn.rankLibrary.mockImplementation(async () => [
      ranked('text:es:honduras-1', 'comfortable', ['Almost all of its words are ones you already know.']),
      ranked('text:es:cuento-1', 'challenging', ['A good stretch: some new words, familiar grammar.']),
      ranked('text:es:historia-1', 'unknown', ['Matches your interest in history.']),
    ]);
    mounted = await h.mount(app());
    await flush(8);
    const section = byLabel(mounted.container, 'Best next reads');
    const rows = qa(section, 'li[data-text-id]');
    expect(rows.map((r) => r.getAttribute('data-text-id'))).toEqual(['text:es:honduras-1', 'text:es:cuento-1', 'text:es:historia-1']);
    expect(rows[0].textContent).toContain('Mercado en Tegucigalpa');
    expect(rows[0].textContent).toContain('Should feel comfortable');
    expect(q(rows[0], '[data-testid="best-reason"]')!.textContent).toBe('Almost all of its words are ones you already know.');
    expect(rows[1].textContent).toContain('Ana Rivas');
    expect(rows[1].textContent).toContain('A stretch');
    expect(rows[2].textContent).toContain('Not enough history to estimate');
    expect(section.textContent).not.toMatch(/\b\d+(\.\d+)?\s?%|\b0\.\d+\b/); // never a number without its words
    expect(section.textContent).toContain('estimates');
    // it was ranked from profiles of the library, with the learner's own settings
    const [uid, candidates, opts] = h.learn.rankLibrary.mock.calls[0] as unknown as [string, Array<{ profile: { textId: string } }>, { limit: number }];
    expect(uid).toBe('u1');
    expect(candidates.map((c) => c.profile.textId).sort()).toEqual(LIB.map((t) => t.id).sort());
    expect(opts.limit).toBe(5);
    // and it replaces the plain recommendation list, not the entries
    expect(mounted.container.textContent).not.toContain('For you today');
    expect(qa(mounted.container, 'a.home__entry').map((a) => a.getAttribute('href'))).toEqual(expect.arrayContaining(['/read', '/scripture', '/testimony']));
  });

  it('opens a best read through the library (import on open) and nowhere else', async () => {
    const h = await spanish({ library: LIB });
    h.learn.rankLibrary.mockImplementation(async () => [ranked('text:es:cuento-1', 'manageable', ['Easy to follow.'])]);
    mounted = await h.mount(app());
    await flush(8);
    await click(q(mounted.container, 'li[data-text-id="text:es:cuento-1"] button')!);
    expect(h.library.opened).toEqual(['text:es:cuento-1']);
  });

  it('without anything to rank, keeps the ordinary recommendation list when GoLearn has recommendations', async () => {
    const h = await spanish({ library: LIB });
    await buildFixtureText(h.store, { lang: 'es', slug: 'story-1', title: 'Story', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola' }] }] });
    h.learn.recommend.mockImplementation(async () => [{ reason: 'next-input' as const, reinforces: [], score: 1, explanation: 'A new story.', textId: 'text:es:story-1' }]);
    mounted = await h.mount(app()); // rankLibrary answers []
    await flush(8);
    expect(q(mounted.container, '[data-testid="best-next"]')).toBeNull();
    expect(mounted.container.textContent).toContain('For you today');
    expect(qa(mounted.container, 'ul.list li[data-reason]')).toHaveLength(1);
  });

  it('offers the doors of SPANISH_DOORS that are available, says honestly when one is empty, and never shows Listen', async () => {
    const h = await spanish({ library: LIB });
    h.services.catalog = { ...h.services.catalog, findWorks: noWorks }; // only the library's own texts count here
    mounted = await h.mount(app());
    await flush(8);
    const doors = qa(mounted.container, 'a.door');
    const keys = doors.map((d) => d.getAttribute('data-door'));
    expect(keys).toEqual(SPANISH_DOORS.map((d) => d.key).filter((k) => k !== 'bible')); // Bible is the Scripture entry above
    expect(keys).not.toContain('listening');
    expect(mounted.container.textContent).not.toMatch(/\bListen\b/);
    expect(q(mounted.container, '[data-testid="door-sub-honduras"]')!.textContent).toBe('2 texts');
    expect(q(mounted.container, '[data-testid="door-sub-history"]')!.textContent).toBe('1 text');
    expect(q(mounted.container, '[data-testid="door-sub-theology"]')!.textContent).toBe('Nothing here yet');
    expect(doors.find((d) => d.getAttribute('data-door') === 'honduras')!.getAttribute('href')).toBe('/explore/honduras');
    expect(doors.find((d) => d.getAttribute('data-door') === 'your-books')!.getAttribute('href')).toBe('/books');
    expect(doors.find((d) => d.getAttribute('data-door') === 'your-books')!.textContent).toContain('on this device');
  });
});

describe('Best next reads: candidates come from bounded library pages', () => {
  const many = Array.from({ length: 120 }, (_, i) => catalogText({ id: `text:es:m-${i}`, title: `Texto ${i}`, stream: i % 3 === 0 ? 'honduras' : 'library', workId: `work:honduras-es:w${i % 7}`, variety: 'es-HN', domains: ['history'], published: i % 5 !== 0 }));
  const echo = async (_u: string, cands: unknown[]) => (cands as Array<{ profile: { textId: string } }>).slice(0, 2).map((c) => ranked(c.profile.textId, 'manageable', ['Fits what you know.']));

  it('passes the catalogue facts and the course variety, at most a few dozen profiles, and never an unpublished text outside preview', async () => {
    const h = await spanish({ library: [...many, catalogText({ id: 'text:es:bible-1', title: 'Juan 3', stream: 'scripture' }), catalogText({ id: 'text:es:camino-1', title: 'Camino', stream: 'acquisition', rights: 'course-authored' })] });
    h.learn.rankLibrary.mockImplementation(echo);
    mounted = await h.mount(app());
    await flush(8);
    const [, candidates, opts] = h.learn.rankLibrary.mock.calls[0] as unknown as [string, Array<{ profile: { textId: string }; workId?: string; stream?: string; variety?: string; domains?: string[]; published?: boolean; controlled?: boolean }>, { targetVariety?: string }];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(40);
    expect(h.library.profile.mock.calls.length).toBeLessThanOrEqual(40);
    expect(candidates.every((c) => c.published === true)).toBe(true);
    expect(candidates.map((c) => c.profile.textId)).not.toContain('text:es:bible-1'); // the Bible has its own door
    const honduras = candidates.find((c) => c.stream === 'honduras')!;
    expect(honduras).toMatchObject({ variety: 'es-HN', domains: ['history'], controlled: false });
    expect(honduras.workId).toMatch(/^work:honduras-es:w/);
    expect(candidates.find((c) => c.stream === 'acquisition')?.controlled ?? true).toBe(true);
    expect(opts.targetVariety).toBe('es-HN');
    expect(h.library.search.mock.calls.every((c) => ((c[0] as { limit?: number }).limit ?? 0) <= 40 && (c[0] as { publishedOnly?: boolean }).publishedOnly === true)).toBe(true);
  });

  it('in preview mode the unpublished texts are offered too', async () => {
    const h = await spanish({ library: many });
    h.learn.rankLibrary.mockImplementation(echo);
    setPref('preview', true);
    mounted = await h.mount(app());
    await flush(8);
    const candidates = h.learn.rankLibrary.mock.calls[0][1] as unknown as Array<{ published?: boolean }>;
    expect(candidates.some((c) => c.published === false)).toBe(true);
    expect(candidates.length).toBeLessThanOrEqual(40);
    expect(h.library.search.mock.calls.every((c) => (c[0] as { publishedOnly?: boolean }).publishedOnly === false)).toBe(true);
  });
});

describe('Home for Spanish with nothing published', () => {
  it('says so in one sentence where Best next reads would be (the existing note), and still shows the doors that have works to browse', async () => {
    const h = await spanish({ library: [catalogText({ id: 'text:es:draft-1', title: 'Borrador', stream: 'honduras', published: false })] });
    await buildFixtureText(h.store, { lang: 'es', slug: 'draft-1', title: 'Borrador', published: false, reviewStatus: 'unreviewed', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola' }] }] });
    h.services.catalog = { ...h.services.catalog, findWorks: async (qy) => (qy.stream === 'library' ? { total: 7, items: [] } : { total: 0, items: [] }) };
    mounted = await h.mount(app());
    await flush(8);
    const spot = q(mounted.container, '[data-testid="best-next-empty"]')!;
    expect(spot.getAttribute('aria-label')).toBe('Best next reads');
    expect(q(spot, '[data-testid="home-empty"] p')!.textContent).toMatch(/^No stories or dialogues in Spanish are published yet: 1 text is imported but awaiting native-speaker review./);
    expect(qa(mounted.container, '[data-testid="home-empty"]')).toHaveLength(1); // said once
    expect(q(mounted.container, '[data-testid="best-next"]')).toBeNull();
    expect(mounted.container.textContent).not.toContain('For you today');
    expect(q(mounted.container, '[data-testid="door-sub-stories"]')!.textContent).toBe('7 books listed'); // doors with works to browse are still there
    expect(qa(mounted.container, 'a.door').length).toBeGreaterThan(3);
    expect(h.learn.rankLibrary).not.toHaveBeenCalled(); // nothing published, so nothing to rank
  });
});

describe('doors count only what the learner may read, and call a listed book a listed book', () => {
  it('unpublished texts are not counted outside preview mode; listed works are "books listed", never "texts"', async () => {
    const lib = [
      catalogText({ id: 'text:es:a', title: 'A', stream: 'honduras', published: true }),
      catalogText({ id: 'text:es:b', title: 'B', stream: 'honduras', published: false }),
    ];
    const h = await spanish({ library: lib });
    h.services.catalog = { ...h.services.catalog, findWorks: async (qy) => (qy.stream === 'library' ? { total: 7, items: [] } : { total: 0, items: [] }) };
    mounted = await h.mount(app());
    await flush(8);
    expect(q(mounted.container, '[data-testid="door-sub-honduras"]')!.textContent).toBe('1 text');
    expect(q(mounted.container, '[data-testid="door-sub-stories"]')!.textContent).toBe('7 books listed');
    expect(q(mounted.container, '[data-testid="door-sub-acquisition"]')!.textContent).toBe('Nothing here yet');
  });
});

describe('courses without streams are unchanged', () => {
  // germany-de has streams since the German course (see test/ui/germanHome.test.tsx); a course joins or leaves this list with its own data
  it.each(['thailand-th', 'india-hi', 'albania-sq'])('%s: no Best next reads, no Explore doors, no Your Books door, nothing asked of the library', async (courseId) => {
    const h = await makeHarness({ courseId, library: LIB });
    mounted = await h.mount(app());
    await flush(8);
    expect(q(mounted.container, '[data-testid="best-next"]')).toBeNull();
    expect(qa(mounted.container, 'a.door')).toHaveLength(0);
    expect(mounted.container.textContent).not.toContain('Explore');
    expect(mounted.container.textContent).not.toContain('Your Books');
    expect(mounted.container.textContent).toContain('For you today');
    expect(h.learn.rankLibrary).not.toHaveBeenCalled();
    expect(h.library.search).not.toHaveBeenCalled();
  });

  it('/explore goes home for a course without streams', async () => {
    const h = await makeHarness({ courseId: 'albania-sq' });
    mounted = await h.mount(app(), { router: '/explore' });
    await flush(6);
    expect(q(mounted.container, '.home__title')!.textContent).toBe('Go');
  });

  it('the Spanish shelves are not a reading ladder: no ladder door, and /course goes home', async () => {
    const h = await spanish();
    await h.store.stages.bulkPut((await import('../../src/course/spanish')).SPANISH_SHELVES);
    mounted = await h.mount(app());
    await flush(8);
    expect(qa(mounted.container, 'a').some((a) => a.getAttribute('href') === '/course')).toBe(false);
    await mounted.unmount();
    mounted = await h.mount(app(), { router: '/course' });
    await flush(6);
    expect(q(mounted.container, '.home__title')!.textContent).toBe('Go');
  });
});

describe('Interests (Settings → You)', () => {
  it('offers "more of", never "only": chosen streams and subjects persist on the learner and reach the ranking', async () => {
    const h = await spanish({ library: LIB });
    h.learn.rankLibrary.mockImplementation(async () => [ranked('text:es:cuento-1', 'manageable', ['Easy to follow.'])]);
    mounted = await h.mount(app(), { router: '/settings' });
    await flush(6);
    const box = byLabel(mounted.container, 'More of');
    expect(box.textContent).toContain('never hides anything');
    expect(box.textContent).not.toContain('Listen'); // the listening stream is switched off with GoListen
    expect(box.textContent).not.toContain('Your Books');
    const honduras = button(box, 'Honduras');
    expect(honduras.getAttribute('aria-pressed')).toBe('false');
    await click(honduras);
    await click(button(box, 'History'));
    expect((await h.store.users.get('u1'))!.interests).toEqual(['honduras', 'history']);
    expect(button(byLabel(mounted.container, 'More of'), 'Honduras').getAttribute('aria-pressed')).toBe('true');
    await click(button(byLabel(mounted.container, 'More of'), 'Honduras')); // toggles off again
    expect((await h.store.users.get('u1'))!.interests).toEqual(['history']);
  });

  it('the learner interests reach the ranking and widen the candidate pages (they never narrow them)', async () => {
    const h = await spanish({ library: LIB, interests: ['honduras'] });
    h.learn.rankLibrary.mockImplementation(async () => [ranked('text:es:cuento-1', 'manageable', ['Easy to follow.'])]);
    mounted = await h.mount(app());
    await flush(8);
    const opts = h.learn.rankLibrary.mock.calls[0][2] as unknown as { interests?: string[] };
    expect(opts.interests).toEqual(['honduras']);
    const asked = h.library.search.mock.calls.map((c) => (c[0] as { stream?: string }).stream);
    expect(asked).toContain(undefined); // the general page is always read
    expect(asked).toContain('honduras'); // plus one for the interest
    const candidates = h.learn.rankLibrary.mock.calls[0][1] as unknown as Array<{ profile: { textId: string } }>;
    expect(candidates.map((c) => c.profile.textId)).toContain('text:es:cuento-1'); // a text outside the interest is still a candidate
  });

  it('is not offered for a course without streams', async () => {
    const h = await makeHarness({ courseId: 'thailand-th' });
    mounted = await h.mount(app(), { router: '/settings' });
    await flush(6);
    expect(q(mounted.container, '[data-testid="interests"]')).toBeNull();
  });

  it('the Spanish course id is the one the doors and streams belong to', () => {
    expect(SPANISH_STREAMS.every((s) => s.courseId === SPANISH_COURSE_ID)).toBe(true);
  });
});
