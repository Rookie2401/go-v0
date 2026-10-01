// @vitest-environment jsdom
/** Partial audio generation: the Player says which part failed and why, and the ready sentences stay playable. */
import { afterEach, describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { Player } from '../../src/ui/player/Player';
import { button, installMediaStubs, makeHarness, q, seedAudio } from './harness';
import type { Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const REASON = '2 of 3 sentences ready; 1 failed: rate limited (429) after 4 attempts. The ready sentences can still be played.';

describe('Player: partial generation', () => {
  it('shows the reason and keeps the ready sentences playable, with a way to retry the rest', async () => {
    installMediaStubs();
    const h = await makeHarness({
      listen: { providerId: 'azure', approved: true, status: () => ({ state: 'failed' as const, readySegments: 2, totalSegments: 3, failedSegments: 1, reason: REASON }) },
    });
    await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    mounted = await h.mount(<Player textId={STORY_ID} />);
    const note = q(mounted.container, '[data-testid="audio-partial"]')!;
    expect(note.textContent).toContain('2 of 3 sentences ready; 1 failed: rate limited (429) after 4 attempts.');
    expect(note.textContent).toContain('The ready sentences can still be played.');
    expect(q(mounted.container, '[data-testid="audio-failed"]')).toBeNull(); // not the all-failed state
    expect(button(mounted.container, 'Play')).toBeTruthy(); // the controls are there
    expect(button(note, 'Try the missing sentences again')).toBeTruthy();
    expect(q(mounted.container, 'section.player')!.getAttribute('data-audio-state')).toBe('failed');
  });

  it('when nothing is ready, it is the plain failed state (no controls)', async () => {
    installMediaStubs();
    const h = await makeHarness({
      listen: { providerId: 'azure', approved: true, status: () => ({ state: 'failed' as const, readySegments: 0, totalSegments: 3, failedSegments: 3, reason: '0 of 3 sentences ready; 3 failed: boom.' }) },
    });
    await seedStory(h.store);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(q(mounted.container, '[data-testid="audio-failed"]')!.textContent).toContain('boom');
    expect(q(mounted.container, '[data-testid="audio-partial"]')).toBeNull();
  });
});
