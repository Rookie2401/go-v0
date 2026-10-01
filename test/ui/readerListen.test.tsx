// @vitest-environment jsdom
/**
 * Listening is switched off by one flag (PLAN8): with `features.listen === false` the reader has no player, no audio
 * banner, no "Prepare audio", no transcript or speed controls, no listening wording, and never touches `golisten`.
 * With it on, everything is as before. The off state is passed through the harness's `features` option; `golisten` is
 * replaced by a spy that records every property the UI touches.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoListen, ReadingProgress } from '../../src/core';
import { ids } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { Reader } from '../../src/ui/reader/Reader';
import { Player } from '../../src/ui/player/Player';
import { makeHarness, q, qa, seedAudio } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

/** A GoListen that fails the test if anything at all is read from it. */
function spyListen(): { golisten: GoListen; touched: string[] } {
  const touched: string[] = [];
  const golisten = new Proxy({}, { get: (_t, prop) => { touched.push(String(prop)); return vi.fn(async () => undefined); } }) as GoListen;
  return { golisten, touched };
}

async function setup(listen: boolean): Promise<{ h: Harness; touched: string[] }> {
  const h = await makeHarness({ features: { listen } });
  await seedStory(h.store);
  await seedAudio(h.store, h.voice, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
  // an older record that says the learner listened: the reading details must not repeat it while listening is off
  h.learn.readingProgressMany.mockImplementation(async (userId: string, textIds: string[]) => new Map(textIds.map((id) => [id, {
    userId, lang: 'es', textId: id, contentVersion: 1, sentencesTotal: 3, sentencesSeen: 1, sentencesUnderstood: 0, sittings: 1, listenedSentences: 3,
  } as ReadingProgress])));
  const { golisten, touched } = spyListen();
  Object.assign(h.services, { golisten });
  return { h, touched };
}

const page = (h: Harness) => h.mount(<Shell><AppRoutes /></Shell>, { router: `/read/${encodeURIComponent(STORY_ID)}` });

describe('reader with listening off', () => {
  it('renders no player, banner, "Prepare audio", transcript or speed controls, and no listening wording', async () => {
    const { h, touched } = await setup(false);
    mounted = await page(h);
    const c = mounted.container;
    expect(q(c, 'article.reader')).not.toBeNull(); // the text itself is there
    expect(q(c, '.player')).toBeNull();
    expect(q(c, 'audio')).toBeNull();
    expect(c.textContent).not.toMatch(/Audio is not available|Prepare audio|transcript|speed|listen/i);
    expect(qa(c, 'button').some((b) => /audio|transcript|speed|replay|play/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`))).toBe(false);
    expect(touched).toEqual([]); // not audioStatus, not ensureAudio, not availability: nothing
  });

  it('the reading details do not mention listening even when an older record does', async () => {
    const { h, touched } = await setup(false);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toContain('Seen 1 of 3');
    expect(q(mounted.container, '[data-testid="reading-extras"]')).toBeNull();
    expect(mounted.container.textContent).not.toContain('listened');
    expect(touched).toEqual([]);
  });

  it('a Player rendered anywhere is empty and silent', async () => {
    const { h, touched } = await setup(false);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(mounted.container.innerHTML).toBe('');
    expect(touched).toEqual([]);
  });
});

describe('reader with listening on', () => {
  it('is unchanged: the player, its status and the listening wording are there', async () => {
    const { h, touched } = await setup(true);
    mounted = await page(h);
    const c = mounted.container;
    expect(q(c, '.player')).not.toBeNull();
    expect(touched).toContain('audioStatus');
    expect(q(c, '[data-testid="reading-extras"]')!.textContent).toContain('listened to 3 sentences');
  });
});
