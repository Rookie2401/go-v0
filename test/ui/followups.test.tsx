// @vitest-environment jsdom
// Browser-audit follow-ups: queued audio runs by itself, Home directory, plain reasons,
// compact vocabulary numbers with a disclosure (and live refresh), and the suggestion card's checker coverage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recommendation, SentenceViewed, TextViewed } from '../../src/core';
import { createMemoryStore, ids } from '../../src/core';
import { resumeQueuedAudio } from '../../src/app/bootstrap';
import { AppRoutes, Shell } from '../../src/ui/App';
import { Player } from '../../src/ui/player/Player';
import { Reader } from '../../src/ui/reader/Reader';
import { Testimony } from '../../src/ui/testimony/Testimony';
import { button, byLabel, click, flush, installMediaStubs, makeHarness, q, qa, sleep, suggestion, type as typeInto } from './harness';
import type { Harness, Mounted } from './harness';
import { JOHN_ID, STORY_ID, seedJohn, seedStory } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(() => { installMediaStubs(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; vi.restoreAllMocks(); });

const app = () => <Shell><AppRoutes /></Shell>;
const rec = (over: Partial<Recommendation>): Recommendation => ({ reason: 'next-input', reinforces: [], score: 1, explanation: 'because', ...over });
const editor = () => byLabel<HTMLTextAreaElement>(mounted!.container, 'Your testimony');

// The real unreviewed-text reason, developer hint included.
const RAW_REASON = 'review status is "unreviewed" — machine-drafted text needs a native-speaker review (set review.status to "reviewed" with reviewedBy and reviewedAt)';

// ───────────────────────── 1. queued audio jobs run ─────────────────────────

describe('queued audio is processed without the learner pressing anything', () => {
  it('a saved testimony version whose audio is only queued becomes ready by itself', async () => {
    let ran = false;
    h = await makeHarness({
      listen: { providerId: 'azure', approved: true, status: () => (ran ? {} : { state: 'generating', readySegments: 0, totalSegments: 2 }) },
    });
    h.listen.runJobs.mockImplementation(async () => { ran = true; return 2; });
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Yo creo en Dios. Dios me perdonó.');
    await click(button(mounted.container, 'Save this version'));

    const box = byLabel(mounted.container, 'Listen and rehearse');
    expect(q(box, '[data-testid="audio-generating"]')!.textContent).toContain('0 of 2 sentences ready');
    expect(h.listen.runJobs).not.toHaveBeenCalled();

    await sleep(1800); // one poll tick
    expect(h.listen.runJobs).toHaveBeenCalledTimes(1);
    expect(q(box, '[data-testid="audio-generating"]')).toBeNull();
    expect(q(box, 'section.player')!.getAttribute('data-audio-state')).toBe('ready');
    expect(button(box, 'Play')).toBeTruthy();
  });

  it('never runs jobs while no provider is usable', async () => {
    h = await makeHarness({
      listen: { status: () => ({ state: 'generating', readySegments: 0, totalSegments: 3 }), availability: { available: false, reason: 'no-provider' } },
    });
    await seedStory(h.store);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await sleep(1800);
    expect(h.listen.availability).toHaveBeenCalled();
    expect(h.listen.runJobs).not.toHaveBeenCalled();
  });

  it('does not start a second run while one is still in flight', async () => {
    h = await makeHarness({
      listen: { providerId: 'azure', approved: true, status: () => ({ state: 'generating', readySegments: 0, totalSegments: 3 }) },
    });
    await seedStory(h.store);
    h.listen.runJobs.mockImplementation(() => new Promise<number>(() => undefined)); // never settles
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await sleep(3400); // two poll ticks
    expect(h.listen.runJobs).toHaveBeenCalledTimes(1);
  });

  it('after bootstrap, queued jobs are run once when a provider is usable — and only then', async () => {
    const store = createMemoryStore();
    const job = { id: 'j1', segmentId: 's1', status: 'queued' as const, attempts: 0, maxAttempts: 3, log: [], createdAt: 'x', updatedAt: 'x' };
    const listen = (available: boolean) => ({ availability: vi.fn(async () => ({ available })), runJobs: vi.fn(async () => 1) });

    expect(await resumeQueuedAudio(store, listen(true))).toBe(0); // nothing queued: nothing to run
    const idle = listen(true);
    await resumeQueuedAudio(store, idle);
    expect(idle.runJobs).not.toHaveBeenCalled();

    await store.audioJobs.put(job);
    const ok = listen(true);
    expect(await resumeQueuedAudio(store, ok)).toBe(1);
    expect(ok.runJobs).toHaveBeenCalledTimes(1);

    const none = listen(false);
    await resumeQueuedAudio(store, none);
    expect(none.runJobs).not.toHaveBeenCalled(); // no usable provider

    await store.audioJobs.put({ ...job, id: 'j2', status: 'failed' });
    const retry = listen(true);
    await resumeQueuedAudio(store, retry);
    expect(retry.runJobs).toHaveBeenCalledTimes(1); // a retryable failure counts too
  });
});

// ───────────────────────── 2/3. Home and reading continuation ─────────────────────────

describe('Home is a stable doorway; reading continuation belongs to GoLearn', () => {
  it('does not render engine notes or recommendations as directory items', async () => {
    h = await makeHarness();
    h.learn.recommend.mockImplementation(async () => [rec({ reason: 'next-input', explanation: `No Spanish text is published yet: 1 imported text is waiting (${RAW_REASON}).` })]);
    mounted = await h.mount(app());
    expect(qa(mounted.container, 'a.home__entry').map((a) => a.getAttribute('href'))).toEqual(['/read', '/listen', '/scripture', '/testimony', '/team-texts']);
    expect(mounted.container.textContent).not.toContain('No Spanish text is published yet');
    expect(mounted.container.textContent).not.toContain('set review.status');
    expect(h.learn.recommend).not.toHaveBeenCalled();
  });

  it('does not mix a rehearsal suggestion into the reading directory', async () => {
    h = await makeHarness();
    h.learn.recommend.mockImplementation(async () => [rec({ reason: 'rehearse-testimony', testimonyId: 'tst:u1:es', explanation: 'Read your latest version aloud.' })]);
    mounted = await h.mount(app());
    expect(qa(mounted.container, 'a.home__entry').some((a) => a.getAttribute('href') === '/testimony')).toBe(true);
    expect(mounted.container.textContent).not.toContain('Read your latest version aloud.');
    expect(h.learn.recommend).not.toHaveBeenCalled();
  });

  async function saveVersion() {
    await h.store.revisions.put({
      id: 'tst:u1:es/r1', testimonyId: 'tst:u1:es', userId: 'u1', lang: 'es', number: 1, createdAt: '2026-03-01T10:00:00.000Z',
      fullText: 'Yo creo.', sentences: [{ index: 0, text: 'Yo creo.', textHash: 'h' }], acceptedSuggestionIds: [],
    });
  }

  it('continues from the last visible text on the reading page even after testimony work', async () => {
    h = await makeHarness();
    await seedStory(h.store);
    await saveVersion();
    await h.bus.emit<TextViewed>({ type: 'TextViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 'ses-test', dedupeKey: 'tv:1', textId: STORY_ID, at: '2026-02-01T10:00:00.000Z' });
    mounted = await h.mount(app(), { router: '/read' });
    const card = q<HTMLAnchorElement>(mounted.container, 'a.home__continue')!;
    expect(card.getAttribute('href')).toBe(`/read/${encodeURIComponent(STORY_ID)}`);
    expect(card.textContent).toContain('Story 1');
    expect(card.textContent).not.toContain('testimony');
    expect(mounted.container.textContent).not.toContain('testimony');
  });

  it('does not invent a Continue item from a testimony revision when there is no reading history', async () => {
    h = await makeHarness();
    await seedStory(h.store);
    await saveVersion();
    mounted = await h.mount(app());
    expect(q(mounted.container, 'a.home__continue')).toBeNull();
    expect(qa(mounted.container, 'a.home__entry').some((a) => a.getAttribute('href') === '/testimony')).toBe(true);
  });
});

// ───────────────────────── 4. plain reasons ─────────────────────────

describe('learner-facing reasons are plain; Settings → Content keeps the full text', () => {
  async function unreviewedStory() {
    h = await makeHarness();
    const t = await seedStory(h.store);
    await h.store.texts.put({ ...t, published: false, reviewStatus: 'unreviewed', unpublishedReasons: [RAW_REASON] });
  }

  it('the reading gate for an unpublished text says it plainly', async () => {
    await unreviewedStory();
    mounted = await h.mount(app(), { router: `/read/${encodeURIComponent(STORY_ID)}` });
    const gate = q(mounted.container, '[data-testid="unpublished-gate"]')!.textContent!;
    expect(gate).toContain('awaiting native-speaker review');
    expect(gate).not.toContain('set review.status');
  });

  it('the Library empty state and the preview chip are plain', async () => {
    await unreviewedStory();
    mounted = await h.mount(app(), { router: '/read' });
    expect(mounted.container.textContent).toContain('awaiting native-speaker review');
    expect(mounted.container.textContent).not.toContain('set review.status');
    await mounted.unmount();

    const { setPref } = await import('../../src/ui/prefs');
    setPref('preview', true);
    mounted = await h.mount(app(), { router: '/read' });
    const why = byLabel(mounted.container, 'Why Story 1 is not published').textContent!;
    expect(why).toContain('awaiting native-speaker review');
    expect(why).not.toContain('set review.status');
    expect(qa(mounted.container, '.chip').map((c) => c.getAttribute('title') ?? '').join(' ')).not.toContain('set review.status');
  });

  it('Settings → Content keeps the full reason, hint included', async () => {
    await unreviewedStory();
    mounted = await h.mount(app(), { router: '/settings' });
    const row = q(byLabel(mounted.container, 'Texts'), `tr[data-text-id="${STORY_ID}"]`)!;
    expect(row.textContent).toContain(RAW_REASON);
  });
});

// ───────────────────────── 5. vocabulary numbers ─────────────────────────

describe('vocabulary numbers: compact line always, the explanation behind a disclosure, once per page', () => {
  it('the explanation sits in a closed "What do these numbers mean?" disclosure', async () => {
    h = await makeHarness();
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const vocab = q(mounted.container, '[data-testid="vocabulary-coverage"]')!;
    expect(vocab.querySelector('p')!.textContent).toContain('shown 62% · likely familiar 5% (estimate) · met 15% · new 18%');
    const details = vocab.querySelector('details')!;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('What do these numbers mean?');
    expect(details.querySelector('[data-testid="coverage-explanation"]')!.textContent).toContain('likely familiar is an estimate');
    expect(vocab.querySelector(':scope > p')!.textContent).not.toContain('estimate from meeting a word often');
  });

  it('a scripture page prints the explanation once, even with the prepare panel open', async () => {
    h = await makeHarness();
    await seedStory(h.store);
    await seedJohn(h.store);
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    await click(button(mounted.container, 'Prepare this passage'));
    expect(qa(mounted.container, '[data-testid="vocabulary-coverage"]').length).toBeGreaterThanOrEqual(1);
    expect(qa(mounted.container, '[data-testid="coverage-explanation"]')).toHaveLength(1);
    expect(mounted.container.textContent!.match(/What do these numbers mean\?/g)).toHaveLength(1);
  });

  it('the reader\'s progress block refreshes after the learner\'s own events, not just the first render', async () => {
    h = await makeHarness();
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 0 of 3 sentences');
    // an event that reaches the log after the render (as GoLearn sees it): the block follows as soon as the folds have settled
    await h.bus.emit<SentenceViewed>({
      type: 'SentenceViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 'ses-other', dedupeKey: 'sv:late',
      textId: STORY_ID, sentenceId: ids.sentence(STORY_ID, 0), tokenIds: [],
    });
    await flush();
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 1 of 3 sentences');
    expect(h.learn.settled).toHaveBeenCalled(); // every read was issued after settled()
    const calls = h.learn.readingProgressMany.mock.calls.length;
    // an event about another text does not cause a refetch
    await h.bus.emit<SentenceViewed>({
      type: 'SentenceViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 'ses-other', dedupeKey: 'sv:other',
      textId: 'text:es:elsewhere', sentenceId: 'x', tokenIds: [],
    });
    await flush();
    expect(h.learn.readingProgressMany.mock.calls.length).toBe(calls);
    expect(h.learn.readingProgress).not.toHaveBeenCalled(); // one hook, one bulk read: no per-text fetch of progress anywhere
  });
});

// ───────────────────────── 6. suggestion card ─────────────────────────

describe('suggestion card: checker coverage is a short line plus a disclosure', () => {
  const LONG = "GoTell's Spanish checker has limited coverage. It reports only the mistakes its rules recognise, so accepting this does not mean the sentence is now correct, and a sentence with no detected problem may still contain mistakes. Known limits: It does not check agreement of adjectives. It does not check clitic order.";

  it('shows the lead inline and the adapter limitations behind "What this checker can and cannot see"', async () => {
    h = await makeHarness({ tell: { suggestions: [suggestion({ id: 'a', checkerCoverage: LONG })] } });
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Yo cree en Dios.');
    await click(button(mounted.container, 'Check my writing'));
    const cov = q(mounted.container, '[data-testid="checker-coverage"]')!;
    const inline = cov.querySelector(':scope > p')!.textContent!;
    expect(inline).toContain('has limited coverage');
    expect(inline).toContain('accepting this does not mean the sentence is now correct');
    expect(inline).not.toContain('clitic order');
    const details = cov.querySelector('details')!;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('What this checker can and cannot see');
    expect(details.textContent).toContain('It does not check clitic order.');
  });

  it('a one-sentence coverage note has nothing to hide', async () => {
    h = await makeHarness({ tell: { suggestions: [suggestion({ id: 'a' })] } });
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Yo cree en Dios.');
    await click(button(mounted.container, 'Check my writing'));
    expect(q(mounted.container, '[data-testid="checker-coverage"] details')).toBeNull();
  });
});
