// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AudioAbandoned, AudioReplayed, AudioSeeked, PlaybackSpeedChanged } from '../../src/core';
import { ids } from '../../src/core';
import { Player } from '../../src/ui/player/Player';
import type { PlayerChange } from '../../src/ui/player/Player';
import { button, byLabel, click, flush, installMediaStubs, makeHarness, pressKey, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { seedAudio } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;
let media: ReturnType<typeof installMediaStubs>;

async function setup(listen?: Parameters<typeof makeHarness>[0]) {
  h = await makeHarness(listen);
  await seedStory(h.store);
  await seedAudio(h.store, h.voice, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
}
const audioEl = () => q<HTMLAudioElement>(mounted!.container, 'audio')!;

beforeEach(() => { media = installMediaStubs(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

describe('Player', () => {
  it('labels the authorized recording source instead of confusing it with the configured provider', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(q(mounted.container, '[data-testid="fixture-badge"]')).toBeNull();
    expect(q(mounted.container, '[data-testid="audio-source-kind"]')!.textContent).toBe('Human recording');
    expect(q(mounted.container, '[data-testid="audio-narrator"]')!.textContent).toBe('Test narrator');
    await mounted.unmount();

    await setup({ listen: { providerId: 'azure', actualLocale: 'es-HN', approved: true } });
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(q(mounted.container, '[data-testid="fixture-badge"]')).toBeNull();
    expect(q(mounted.container, '[data-testid="audio-source-kind"]')!.textContent).toBe('Human recording');
  });

  it('labels every control for assistive tech', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    for (const label of ['Previous sentence', 'Play', 'Next sentence', 'Replay sentence (R)', 'Loop sentence', 'Playback speed', 'Transcript mode']) {
      expect(byLabel(mounted.container, label)).toBeTruthy();
    }
    expect(q(mounted.container, '[aria-live="polite"]')!.textContent).toContain('Sentence 1 of 3');
  });

  it('updates the seek slider as playback advances', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    const slider = byLabel<HTMLInputElement>(mounted.container, 'Seek within current listening unit');
    expect(slider.value).toBe('0');
    await click(button(mounted.container, 'Play'));
    await act(async () => { audioEl().currentTime = 0.5; audioEl().dispatchEvent(new Event('timeupdate')); });
    await flush();
    expect(Number(slider.value)).toBe(500);
  });

  it('passes the final native media position to ended without counting it as heard coverage', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await click(button(mounted.container, 'Play'));
    // Simulate a browser that updates currentTime to the end but emits no final timeupdate.
    audioEl().currentTime = 0.7;
    await act(async () => { audioEl().dispatchEvent(new Event('ended')); });
    await flush();
    const abandoned = await h.events('AudioAbandoned') as AudioAbandoned[];
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].positionMs).toBe(700);
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(0);
  });

  it('muted or zero-volume playback is not hearing: the pass ends as an abandonment, never a completion', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await click(button(mounted.container, 'Play'));
    audioEl().muted = true;
    await act(async () => { audioEl().currentTime = 0.8; audioEl().dispatchEvent(new Event('timeupdate')); });
    await act(async () => { audioEl().dispatchEvent(new Event('ended')); });
    await flush();
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(0);
    expect(await h.events('AudioAbandoned')).toHaveLength(1);

    audioEl().muted = false;
    audioEl().volume = 0;
    await click(button(mounted.container, 'Replay sentence (R)'));
    await act(async () => { audioEl().currentTime = 0.8; audioEl().dispatchEvent(new Event('timeupdate')); });
    await act(async () => { audioEl().dispatchEvent(new Event('ended')); });
    await flush();
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(0); // zero volume: still not heard

    // the same sentence played again with sound on does count
    audioEl().volume = 1;
    await click(button(mounted.container, 'Replay sentence (R)'));
    await act(async () => { audioEl().currentTime = 0.8; audioEl().dispatchEvent(new Event('timeupdate')); });
    await act(async () => { audioEl().dispatchEvent(new Event('ended')); });
    await flush();
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(1);
  });

  it('plays with preservesPitch and emits AudioPlayed; play/pause toggle works', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await click(button(mounted.container, 'Play'));
    expect(media.play).toHaveBeenCalled();
    expect(audioEl().src).toBe('blob:test/asset:0');
    expect(audioEl().preservesPitch).toBe(true);
    expect(audioEl().playbackRate).toBe(1);
    expect((await h.events('AudioPlayed'))).toHaveLength(1);
    expect(button(mounted.container, 'Pause')).toBeTruthy();
    await click(button(mounted.container, 'Pause'));
    expect(media.pause).toHaveBeenCalled();
  });

  it('R replays the current sentence from anywhere (but not while typing)', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await click(button(mounted.container, 'Play'));
    const before = media.play.mock.calls.length;
    await pressKey('r');
    expect(media.play.mock.calls.length).toBe(before + 1);
    const replays = (await h.events('AudioReplayed')) as AudioReplayed[];
    expect(replays).toHaveLength(1);
    expect(replays[0].count).toBe(1);
    await pressKey('R');
    expect(((await h.events('AudioReplayed')) as AudioReplayed[]).map((e) => e.count)).toEqual([1, 2]);

    const input = document.createElement('input');
    document.body.append(input);
    await pressKey('r', input);
    expect((await h.events('AudioReplayed'))).toHaveLength(2); // typing an r is not a replay
    input.remove();
  });

  it('clamps speed to 0.7–1.25, keeps pitch, and records the change', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    const slider = byLabel<HTMLInputElement>(mounted.container, 'Playback speed');
    expect(slider.min).toBe('0.7');
    expect(slider.max).toBe('1.25');
    const setValue = async (v: string) => {
      const slider = byLabel<HTMLInputElement>(mounted!.container, 'Playback speed');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => { setter.call(slider, v); slider.dispatchEvent(new Event('input', { bubbles: true })); });
      await flush();
    };
    await click(button(mounted.container, 'Play'));
    await setValue('0.85'); 
    expect(audioEl().playbackRate).toBe(0.85);
    expect(audioEl().preservesPitch).toBe(true);
    await setValue('9'); // the browser sanitizes to max; the machine clamps regardless
    expect(audioEl().playbackRate).toBeLessThanOrEqual(1.25);
    const changes = (await h.events('PlaybackSpeedChanged')) as PlaybackSpeedChanged[];
    expect(changes[0]).toMatchObject({ from: 1, to: 0.85 });
    expect(changes.every((c) => c.to >= 0.7 && c.to <= 1.25)).toBe(true);
  });

  it('moves between sentences, loops a sentence, and reports what is playing', async () => {
    await setup();
    const seen: PlayerChange[] = [];
    mounted = await h.mount(<Player textId={STORY_ID} onChange={(c) => seen.push(c)} />);
    await click(button(mounted.container, 'Play'));
    await click(button(mounted.container, 'Next sentence'));
    expect(q(mounted.container, '[aria-live="polite"]')!.textContent).toContain('Sentence 2 of 3');
    expect(audioEl().src).toBe('blob:test/asset:1');
    const seeks = (await h.events('AudioSeeked')) as AudioSeeked[];
    expect(seeks.at(-1)).toMatchObject({ fromSegmentId: 'seg:0', toSegmentId: 'seg:1' });
    expect(seen.at(-1)!.segment!.sentenceIds).toEqual([ids.sentence(STORY_ID, 1)]);
    expect(seen.at(-1)!.state.playing).toBe(true);

    await click(button(mounted.container, 'Loop sentence'));
    expect(byLabel(mounted.container, 'Loop sentence').getAttribute('aria-pressed')).toBe('true');
    await act(async () => { audioEl().currentTime = 0.8; audioEl().dispatchEvent(new Event('timeupdate')); });
    await act(async () => { audioEl().dispatchEvent(new Event('ended')); });
    await flush();
    expect(q(mounted.container, '[aria-live="polite"]')!.textContent).toContain('Sentence 2 of 3'); // looped, did not advance
    expect((await h.events('AudioSegmentCompleted'))).toHaveLength(1);

    await click(button(mounted.container, 'Loop sentence'));
    await act(async () => { audioEl().currentTime = 0.8; audioEl().dispatchEvent(new Event('timeupdate')); });
    await act(async () => { audioEl().dispatchEvent(new Event('ended')); });
    await flush();
    expect(q(mounted.container, '[aria-live="polite"]')!.textContent).toContain('Sentence 3 of 3'); // auto-advanced
  });

  it('transcript modes hide and reveal text, and tell the reader what to conceal', async () => {
    await setup();
    const seen: PlayerChange[] = [];
    mounted = await h.mount(<Player textId={STORY_ID} onChange={(c) => seen.push(c)} />);
    expect(q(mounted.container, '.transcript')!.textContent).toContain('Yo creo en Dios.'); // default: visible
    expect(seen.at(-1)!.concealed(ids.sentence(STORY_ID, 0))).toBe(false);

    await click(button(mounted.container, 'Listen only (hide text)'));
    expect(q(mounted.container, '.transcript')!.textContent).not.toContain('Yo creo en Dios.');
    expect(seen.at(-1)!.concealed(ids.sentence(STORY_ID, 0))).toBe(true);

    await click(button(mounted.container, 'Show this sentence'));
    expect(q(mounted.container, '.transcript')!.textContent).toContain('Yo creo en Dios.');
    expect(seen.at(-1)!.concealed(ids.sentence(STORY_ID, 0))).toBe(false);
    expect(seen.at(-1)!.concealed(ids.sentence(STORY_ID, 1))).toBe(true);
    expect((await h.events('TranscriptRevealed'))).toHaveLength(1);
  });

  it('offers to prepare audio when none exists, and calls ensureAudio with runNow', async () => {
    h = await makeHarness();
    await seedStory(h.store);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(qa(mounted.container, 'audio')).toHaveLength(0);
    await seedAudio(h.store, h.voice, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    await click(button(mounted.container, 'Prepare audio for this text'));
    expect(h.listen.ensureAudio).toHaveBeenCalledWith(STORY_ID, { runNow: true });
    expect(q(mounted.container, '[aria-live="polite"]')!.textContent).toContain('Sentence 1 of 3'); // reloaded into the player
  });
});
