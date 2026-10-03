// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AudioAbandoned, AudioPlayed, AudioSegmentCompleted } from '../../src/core';
import { ids } from '../../src/core';
import { Player } from '../../src/ui/player/Player';
import { setPref } from '../../src/ui/prefs';
import { button, click, flush, installMediaStubs, makeHarness, q, qa, seedAudio, sleep } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;
let media: ReturnType<typeof installMediaStubs>;
beforeEach(() => { media = installMediaStubs(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

async function setup(opts?: Parameters<typeof makeHarness>[0], withAudio = true) {
  h = await makeHarness(opts);
  await seedStory(h.store);
  if (withAudio) await seedAudio(h.store, h.voice, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
}
const section = () => q(mounted!.container, 'section.player')!;
const state = () => section().getAttribute('data-audio-state');
const audioEl = () => q<HTMLAudioElement>(mounted!.container, 'audio')!;

describe('Player — every audio state, driven by golisten.audioStatus', () => {
  it('unavailable: no provider is configured — says so, offers nothing to play, and reading is unaffected', async () => {
    await setup({ listen: { unavailable: true } }, false);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(state()).toBe('unavailable');
    expect(q(mounted.container, '[data-testid="audio-unavailable"]')!.textContent).toBe('Audio is not available — no speech provider is configured. You can still read.');
    expect(qa(mounted.container, 'audio')).toHaveLength(0);
    expect(qa(mounted.container, 'button')).toHaveLength(0); // no "prepare" for something that cannot be made
    expect(h.listen.ensureAudio).not.toHaveBeenCalled();
    expect(h.listen.audioStatus).toHaveBeenCalledWith(STORY_ID, { preview: false });
  });

  it('unavailable with another reason (missing key) shows that reason', async () => {
    await setup({ listen: { unavailable: true, status: () => ({ reason: 'Audio is not available — the speech provider has no working credentials in this session. You can still read.' }) } }, false);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(q(mounted.container, '[data-testid="audio-unavailable"]')!.textContent).toBe('Audio is not available — the speech provider has no working credentials in this session. You can still read.');
  });

  it('not generated: offers to prepare it, and preparing calls ensureAudio', async () => {
    await setup({ listen: { approved: true, providerId: 'azure' } }, false);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(state()).toBe('not-generated');
    await seedAudio(h.store, { ...h.voice, isSpeech: true, reviewStatus: 'reviewed', approved: true, providerId: 'azure' }, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    await click(button(mounted.container, 'Prepare audio for this text'));
    expect(h.listen.ensureAudio).toHaveBeenCalledWith(STORY_ID, { runNow: true });
    expect(state()).toBe('ready');
  });

  it('generating: shows progress and keeps asking until it is done', async () => {
    await setup({ listen: { status: () => ({ state: 'generating', readySegments: 1, totalSegments: 3 }) } }, false);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(state()).toBe('generating');
    expect(q(mounted.container, '[data-testid="audio-generating"]')!.textContent).toContain('1 of 3 sentences ready');
    expect(qa(mounted.container, 'audio')).toHaveLength(0);
    const before = h.listen.audioStatus.mock.calls.length;
    await sleep(1700); // the poll interval is 1.5 s
    expect(h.listen.audioStatus.mock.calls.length).toBeGreaterThan(before);
  });

  it('failed: shows the reason and how many failed, and retry calls ensureAudio', async () => {
    await setup({ listen: { status: () => ({ state: 'failed', reason: '2 of 3 sentences could not be voiced: Azure returned 429 too many requests. Fix the cause, then retry.', failedSegments: 2, totalSegments: 3 }) } }, false);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(state()).toBe('failed');
    const failed = q(mounted.container, '[data-testid="audio-failed"]')!;
    expect(failed.getAttribute('role')).toBe('alert');
    expect(failed.textContent).toContain('Azure returned 429 too many requests');
    expect(failed.textContent).toContain('2 of 3 sentences could not be voiced');
    await click(button(mounted.container, 'Try again'));
    expect(h.listen.ensureAudio).toHaveBeenCalledWith(STORY_ID, { runNow: true });
  });

  it('stale: says the audio is for an earlier version, hides the old audio, and regenerates on request', async () => {
    await setup({ listen: { status: () => ({ state: 'stale', audioContentVersion: 1, textContentVersion: 2, reason: 'This audio was made for version 1 of the text; the text is now version 2. Regenerate the audio.' }) } });
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(state()).toBe('stale');
    const note = q(mounted.container, '[data-testid="audio-stale"]')!.textContent!;
    expect(note).toContain('for an earlier version of the text');
    expect(note).toContain('made for version 1 of the text; the text is now version 2');
    expect(qa(mounted.container, 'audio')).toHaveLength(0); // the old recording is not played against newer words
    await click(button(mounted.container, 'Regenerate audio'));
    expect(h.listen.ensureAudio).toHaveBeenCalledWith(STORY_ID, { runNow: true });
  });

  it('unreviewed real recording: playable, exposure-counted, and clearly marked as not evidence-eligible', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(state()).toBe('preview-only');
    expect(q(mounted.container, '[data-testid="fixture-badge"]')).toBeNull();
    expect(q(mounted.container, '[data-testid="preview-audio-badge"]')!.textContent).toBe('Unreviewed recording');
    expect(q(mounted.container, '[data-testid="preview-audio-note"]')!.textContent).toContain('You can record listening exposure');
    expect(q(mounted.container, '[data-testid="preview-audio-note"]')!.textContent).toContain('has not passed human review for listening evidence');
    await click(button(mounted.container, 'Play'));
    expect(media.play).toHaveBeenCalled();
  });

  it('keeps non-speech fixture audio clearly marked as not counted', async () => {
    await setup();
    for (const id of ['asset:0', 'asset:1', 'asset:2']) {
      const asset = (await h.store.audioAssets.get(id))!;
      await h.store.audioAssets.put({ ...asset, sourceType: 'generated-tts', audioKind: undefined, isSpeech: false, rights: undefined, textBinding: undefined, qualityState: undefined, narratorOrVoiceId: undefined });
    }
    setPref('preview', true);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(q(mounted.container, '[data-testid="fixture-badge"]')!.textContent).toBe('fixture audio — not speech');
    expect(q(mounted.container, '[data-testid="preview-audio-badge"]')!.textContent).toBe('fixture audio — not counted');
    expect(q(mounted.container, '[data-testid="preview-audio-note"]')!.textContent).toContain('does not count toward your listening progress');
  });

  it('preview-only for a real voice nobody has auditioned: distinguishes exposure from evidence', async () => {
    await setup({ listen: { providerId: 'azure', approved: false } });
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(state()).toBe('preview-only');
    expect(q(mounted.container, '[data-testid="fixture-badge"]')).toBeNull(); // it IS speech, just not reviewed
    expect(q(mounted.container, '[data-testid="preview-audio-note"]')!.textContent).toContain('You can record listening exposure');
  });

  it('ready: reviewed real speech plays with no preview badge', async () => {
    await setup({ listen: { providerId: 'azure', approved: true, actualLocale: 'es-HN' } });
    mounted = await h.mount(<Player textId={STORY_ID} />);
    expect(state()).toBe('ready');
    expect(q(mounted.container, '[data-testid="preview-audio-badge"]')).toBeNull();
    expect(q(mounted.container, '[data-testid="fixture-badge"]')).toBeNull();
    await click(button(mounted.container, 'Play'));
    expect(audioEl().src).toBe('blob:test/asset:0');
  });

  it('an AudioUnavailable error from ensureAudio is not shown as a failure: the state becomes unavailable', async () => {
    await setup({ listen: { approved: true, providerId: 'azure' } }, false);
    mounted = await h.mount(<Player textId={STORY_ID} />);
    h.listen.ensureAudio.mockImplementationOnce(async () => { throw Object.assign(new Error('no provider'), { name: 'AudioUnavailable' }); });
    h.listen.audioStatus.mockImplementation(async (textId: string) => ({
      textId, state: 'unavailable', reason: 'the speech key was removed', isSpeech: false, textContentVersion: 1, readySegments: 0, totalSegments: 0, failedSegments: 0, evidenceEligible: false,
    }));
    await click(button(mounted.container, 'Prepare audio for this text'));
    expect(q(mounted.container, '[role="alert"]')).toBeNull();
    expect(q(mounted.container, '[data-testid="audio-unavailable"]')!.textContent).toContain('the speech key was removed');
  });
});

describe('Player — listening events say what was played', () => {
  it('a fixture play is recorded as non-speech and unreviewed (so GoLearn can exclude it)', async () => {
    await setup();
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await click(button(mounted.container, 'Play'));
    await act(async () => { audioEl().currentTime = 0.8; audioEl().dispatchEvent(new Event('timeupdate')); });
    await act(async () => { audioEl().dispatchEvent(new Event('ended')); });
    await flush();
    const played = ((await h.events('AudioPlayed')) as AudioPlayed[])[0];
    expect(played).toMatchObject({ assetId: 'asset:0', speech: false, voiceReviewed: false });
    const done = ((await h.events('AudioSegmentCompleted')) as AudioSegmentCompleted[])[0];
    expect(done).toMatchObject({ assetId: 'asset:0', speech: false, voiceReviewed: false });
  });

  it('reviewed real speech is recorded as such', async () => {
    await setup({ listen: { providerId: 'azure', approved: true, actualLocale: 'es-HN' } });
    const asset = (await h.store.audioAssets.get('asset:0'))!;
    await h.store.audioAssets.put({ ...asset, qualityState: 'human_reviewed' });
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await click(button(mounted.container, 'Play'));
    await act(async () => { audioEl().currentTime = 0.8; audioEl().dispatchEvent(new Event('timeupdate')); });
    await act(async () => { audioEl().dispatchEvent(new Event('ended')); });
    await flush();
    expect(((await h.events('AudioSegmentCompleted')) as AudioSegmentCompleted[])[0]).toMatchObject({ speech: true, voiceReviewed: true, assetId: 'asset:0' });
  });

  it('a media error is a playback error: the pass is abandoned, never completed', async () => {
    await setup({ listen: { providerId: 'azure', approved: true, actualLocale: 'es-HN' } });
    mounted = await h.mount(<Player textId={STORY_ID} />);
    await click(button(mounted.container, 'Play'));
    await act(async () => { audioEl().dispatchEvent(new Event('error')); });
    await flush();
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(0);
    expect(((await h.events('AudioAbandoned')) as AudioAbandoned[]).length).toBeGreaterThan(0);
  });
});
