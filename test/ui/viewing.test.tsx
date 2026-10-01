// @vitest-environment jsdom
/**
 * Reading EXPOSURE (SentenceViewed) with the REAL view detector, driven through a fake IntersectionObserver, fake
 * timers, and switches for tab visibility and window focus. The regression that motivated it: opening a Scripture
 * passage and its preparation panel showed "Read: 2 of 3" within a second.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComprehensionReported, SentenceViewed, TextCompleted, TextViewed } from '../../src/core';
import { buildFixtureText, ids } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { Reader } from '../../src/ui/reader/Reader';
import { MAX_DWELL_MS, MIN_DWELL_MS, requiredDwellMs } from '../../src/ui/reader/viewDetection';
import { button, byLabel, click, flush, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { JOHN_ID, STORY_ID, seedJohn, seedStory } from './fixtures';
import { installViewEnv } from './viewHelpers';
import type { ViewEnv } from './viewHelpers';

let h: Harness;
let mounted: Mounted | undefined;
let env: ViewEnv | undefined;

beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { env?.restore(); env = undefined; await mounted?.unmount(); mounted = undefined; });

const S = (i: number, text = STORY_ID) => ids.sentence(text, i);
const views = async () => (await h.events('SentenceViewed')) as SentenceViewed[];
const app = () => <Shell><AppRoutes /></Shell>;
/** A click that does not wait on timers (the fake clock must only move when the test moves it). */
const tap = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

async function readStory() {
  await seedStory(h.store);
  env = installViewEnv();
  mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
  return env;
}

describe('requiredDwellMs', () => {
  it('is max(1500 ms, 220 ms x word tokens), capped at 12 s', () => {
    expect(MIN_DWELL_MS).toBe(1500);
    expect(MAX_DWELL_MS).toBe(12_000);
    expect(requiredDwellMs(0)).toBe(1500);
    expect(requiredDwellMs(6)).toBe(1500); // 1320 < 1500
    expect(requiredDwellMs(7)).toBe(1540);
    expect(requiredDwellMs(12)).toBe(2640);
    expect(requiredDwellMs(55)).toBe(12_000); // 12 100 capped
    expect(requiredDwellMs(500)).toBe(12_000);
  });
});

describe('Scripture regression: a passage and its preparation panel are not reading', () => {
  it('opening the passage and its preparation panel for a second yields zero SentenceViewed (and stays zero)', async () => {
    await seedJohn(h.store);
    env = installViewEnv();
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    expect(q(mounted.container, 'article.reader')!.getAttribute('data-mode')).toBe('scripture');
    for (const i of [0, 1, 2]) await env.show(S(i, JOHN_ID)); // all three are on screen
    await env.advance(200);

    await tap(button(mounted.container, 'Prepare this passage'));
    await env.advance(1000);
    expect(await views()).toHaveLength(0);
    // however long the panel stays open (far longer than any sentence needs), the passage behind it is not being read
    await env.advance(30_000);
    expect(await views()).toHaveLength(0);
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 0 of 3 sentences');
    expect(mounted.container.textContent).not.toMatch(/Read: \d+ of \d+/);
  });

  it('closing the panel starts every dwell again from zero', async () => {
    await seedJohn(h.store);
    env = installViewEnv();
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    await env.show(S(0, JOHN_ID));
    await env.advance(1200); // nearly there...
    await tap(button(mounted.container, 'Prepare this passage')); // ...then the panel opens: the dwell is thrown away
    await env.advance(5000);
    expect(await views()).toHaveLength(0);
    await tap(button(mounted.container, 'Prepare this passage')); // closed again
    await env.advance(1000);
    expect(await views()).toHaveLength(0); // a fresh dwell, not the 1200 ms from before
    await env.advance(700);
    const seen = await views();
    expect(seen).toHaveLength(1);
    expect(seen[0].sentenceId).toBe(S(0, JOHN_ID));
  });

  it('opening the preparation panel emits at most one TextViewed (mode preview) per sitting, and nothing else', async () => {
    await seedJohn(h.store);
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    const open = () => button(mounted!.container, 'Prepare this passage');
    await click(open());
    await click(open()); // close
    await click(open()); // open again
    const tv = (await h.events('TextViewed')) as TextViewed[];
    expect(tv.map((e) => e.mode).sort()).toEqual(['open', 'preview']);
    expect(tv.find((e) => e.mode === 'preview')).toMatchObject({ textId: JOHN_ID, surface: 'scripture', contentVersion: 1 });
    expect(await views()).toHaveLength(0);
    expect(await h.events('ComprehensionReported')).toHaveLength(0);
    expect(await h.events('TextCompleted')).toHaveLength(0);
  });

  it('shows the passage\'s progress in the panel as "Seen x of y", never "Read"', async () => {
    await seedJohn(h.store);
    mounted = await h.mount(app(), { router: `/scripture/${encodeURIComponent(JOHN_ID)}` });
    await click(button(mounted.container, 'Prepare this passage'));
    expect(q(mounted.container, '[data-testid="prepare-progress"]')!.textContent).toBe('Seen 0 of 3 sentences');
  });
});

describe('a sentence is seen only after a continuous dwell, in view, in the foreground', () => {
  it('a long enough dwell on one sentence yields exactly one SentenceViewed, with dwellMs and contentVersion', async () => {
    const e = await readStory();
    await e.show(S(0));
    await e.advance(1100);
    expect(await views()).toHaveLength(0);
    await e.advance(700);
    await flush();
    const seen = await views();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ sentenceId: S(0), textId: STORY_ID, surface: 'corpus', contentVersion: 1 });
    expect(seen[0].dwellMs).toBeGreaterThanOrEqual(1500);
    expect(seen[0].dwellMs).toBeLessThan(MAX_DWELL_MS);
    expect(seen[0].tokenIds).toEqual([0, 1, 2, 3].map((i) => ids.token(S(0), i)));
    // the other two sentences were never on screen: nothing for them
    await e.advance(10_000);
    expect(await views()).toHaveLength(1);
  });

  it('leaving and returning to the same sentence in the same sitting does not make a second exposure', async () => {
    const e = await readStory();
    await e.show(S(0));
    await e.advance(1800);
    await flush();
    expect(await views()).toHaveLength(1);
    await e.hide(S(0));
    await e.show(S(0));
    await e.advance(3000);
    await flush();
    expect(await views()).toHaveLength(1);
  });

  it('needs at least 60 % of the sentence visible, and leaving the screen resets the dwell', async () => {
    const e = await readStory();
    await e.show(S(0), 0.5);
    await e.advance(6000);
    expect(await views()).toHaveLength(0); // half visible is not "in view"

    await e.show(S(1), 0.6);
    await e.advance(1000);
    await e.hide(S(1)); // scrolled away mid-dwell
    await e.show(S(1), 1);
    await e.advance(1000);
    expect(await views()).toHaveLength(0); // the 1000 ms before the scroll-away do not count
    await e.advance(700);
    await flush();
    expect((await views()).map((v) => v.sentenceId)).toEqual([S(1)]);
  });

  it('a longer sentence needs a longer dwell (220 ms per word), up to a 12 s cap', async () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => ({ surface: `palabra${i}`, lemma: `palabra${i}`, pos: 'NOUN' as const, gloss: 'word' }));
    const text = await buildFixtureText(h.store, {
      lang: 'es', slug: 'long', title: 'Long',
      sentences: [{ tokens: [...words(12), { surface: '.', isWord: false }] }, { tokens: [...words(80), { surface: '.', isWord: false }] }],
    });
    env = installViewEnv();
    mounted = await h.mount(<Reader textId={text.id} mode="corpus" />);
    await env.show(S(0, text.id));
    await env.show(S(1, text.id));
    await env.advance(2300); // 12 words: 2640 ms
    expect(await views()).toHaveLength(0);
    await env.advance(500);
    await flush();
    expect((await views()).map((v) => v.sentenceId)).toEqual([S(0, text.id)]);
    expect((await views())[0].dwellMs).toBeGreaterThanOrEqual(2640);

    await env.advance(8000); // 80 words would be 17 600 ms: capped at 12 000, and ~11 s have passed
    expect(await views()).toHaveLength(1);
    await env.advance(2500);
    await flush();
    const seen = await views();
    expect(seen.map((v) => v.sentenceId)).toEqual([S(0, text.id), S(1, text.id)]);
    expect(seen[1].dwellMs).toBeGreaterThanOrEqual(12_000);
  });

  it('a hidden tab yields none, and the dwell only starts once it is visible again', async () => {
    const e = await readStory();
    await e.setTabVisible(false);
    await e.show(S(0));
    await e.advance(10_000);
    expect(await views()).toHaveLength(0);
    await e.setTabVisible(true);
    await e.advance(1000);
    expect(await views()).toHaveLength(0);
    await e.advance(700);
    await flush();
    expect(await views()).toHaveLength(1);
  });

  it('hiding the tab mid-dwell throws the dwell away', async () => {
    const e = await readStory();
    await e.show(S(0));
    await e.advance(1200);
    await e.setTabVisible(false);
    await e.advance(500);
    await e.setTabVisible(true);
    await e.advance(1000);
    expect(await views()).toHaveLength(0);
    await e.advance(700);
    await flush();
    expect(await views()).toHaveLength(1);
  });

  it('a blurred window yields none, and focus restores detection with a fresh dwell', async () => {
    const e = await readStory();
    await e.setWindowFocused(false);
    await e.show(S(0));
    await e.advance(10_000);
    expect(await views()).toHaveLength(0);
    await e.setWindowFocused(true);
    await e.advance(1000);
    expect(await views()).toHaveLength(0);
    await e.advance(700);
    await flush();
    expect(await views()).toHaveLength(1);
  });

  it('consulting a word (the word sheet) is part of reading: it does not pause detection', async () => {
    const e = await readStory();
    await e.show(S(0));
    const creo = qa<HTMLButtonElement>(mounted!.container, 'button.tok').find((b) => b.textContent === 'creo')!;
    await tap(creo);
    expect(q(mounted!.container, '.panel')).not.toBeNull();
    await e.advance(1800);
    await flush();
    expect((await views()).map((v) => v.sentenceId)).toEqual([S(0)]);
  });
});

describe('a deliberate report or completion is not a view', () => {
  it('"Understood" emits ComprehensionReported (with contentVersion) and no SentenceViewed', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(button(mounted.container, 'Understood sentence 1'));
    const reports = (await h.events('ComprehensionReported')) as ComprehensionReported[];
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ scope: 'sentence', degree: 'all', sentenceIds: [S(0)], contentVersion: 1 });
    expect(await views()).toHaveLength(0);
  });

  it('the end-of-text report and the finish button never fabricate views, and carry the contentVersion', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(button(mounted.container, /finished reading/));
    await click(button(byLabel(mounted.container, 'How much did you understand?'), 'All'));
    expect(await views()).toHaveLength(0);
    const done = (await h.events('TextCompleted')) as TextCompleted[];
    expect(done).toHaveLength(1);
    expect(done[0].contentVersion).toBe(1);
    const reports = (await h.events('ComprehensionReported')) as ComprehensionReported[];
    expect(reports[0]).toMatchObject({ scope: 'text', degree: 'all', contentVersion: 1 });
    // the label says Finished only because the button was pressed, and Seen stays 0
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 0 of 3 sentences · Finished (your mark)');
    expect(q(mounted.container, '[data-testid="reading-extras"]')!.textContent).toBe(' · you said you understood all of it');
  });

  it('keeps the manual fallback where there is no IntersectionObserver: an explicit "seen" mark, with no invented timing', async () => {
    await seedStory(h.store);
    expect(typeof IntersectionObserver).toBe('undefined'); // jsdom
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const marks = qa<HTMLButtonElement>(mounted.container, 'button[aria-label^="Mark sentence"]');
    expect(marks).toHaveLength(3);
    expect(marks[0].getAttribute('aria-label')).toBe('Mark sentence 1 as seen');
    await click(marks[0]);
    const seen = await views();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ sentenceId: S(0), contentVersion: 1 });
    expect(seen[0].dwellMs).toBeUndefined();
  });
});

describe('a second sitting in a page that stayed open is not swallowed', () => {
  it('after 31 minutes without activity the same sentence counts again, under a new session id and dedupe key', async () => {
    await seedStory(h.store);
    env = installViewEnv();
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />, { session: null });
    await env.show(S(0));
    await env.advance(1800);
    await flush();
    let seen = await views();
    expect(seen).toHaveLength(1);

    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    await env.hide(S(0));
    await env.show(S(0));
    await env.advance(1800);
    await flush();
    seen = await views();
    expect(seen).toHaveLength(2);
    expect(seen[1].session).not.toBe(seen[0].session);
    expect(seen[1].dedupeKey).not.toBe(seen[0].dedupeKey);
    expect(seen[0].dedupeKey).toContain(seen[0].userId); // keys are scoped to the learner as well
  });
});
