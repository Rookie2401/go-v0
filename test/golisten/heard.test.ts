/** "Heard" means audibly heard: observed, unmuted, volume above zero, and progress that fits the wall time. */
import { describe, expect, it } from 'vitest';
import { listeningEmitter, emitPlayerEffects, reducePlayer, createPlayerModel } from '../../src/golisten';
import type { PlayerAction, PlayerEffect, PlayerEmit, PlayerManifestInput, PlayerModel } from '../../src/golisten';
import { FakeSpeechProvider, addStory, makeEnv } from './support';
import { buildPlayerManifest } from '../../src/golisten';
import { ids } from '../../src/core';

const manifestOf = (segments: PlayerManifestInput['segments']): PlayerManifestInput => ({ manifestId: 'man:h', textId: 'text:h', segments });
const one = (durationMs = 2000) => manifestOf([{ segmentId: 'seg:0', sentenceIds: ['text:h/s0'], ready: true, assetId: 'asset:0', durationMs }]);

function run(m0: PlayerModel, actions: PlayerAction[]) {
  let m = m0;
  const effects: PlayerEffect[] = [];
  for (const a of actions) { const r = reducePlayer(m, a); m = r.model; effects.push(...r.effects); }
  return { m, effects };
}
const emits = (fx: PlayerEffect[]): PlayerEmit[] => fx.flatMap((f) => (f.type === 'emit' ? [f.emit] : []));
/** Real-time ticks every 250 ms of wall time at speed 1, up to `toMs`. */
const ticks = (toMs: number, extra: Partial<Extract<PlayerAction, { type: 'position' }>> = {}, from = 0): PlayerAction[] => {
  const out: PlayerAction[] = [];
  for (let ms = from + 250; ms <= toMs; ms += 250) out.push({ type: 'position', ms, observedAtMs: 1000 + ms, ...extra });
  return out;
};
const names = (fx: PlayerEffect[]) => emits(fx).map((e) => e.event);

describe('player: only audible, observed progress is heard', () => {
  it('audible observed ticks complete the pass', () => {
    const r = run(createPlayerModel(one()), [{ type: 'play' }, ...ticks(2000, { muted: false, volume: 1 }), { type: 'ended' }]);
    expect(names(r.effects)).toContain('completed');
    const done = emits(r.effects).find((e) => e.event === 'completed');
    expect(done).toMatchObject({ heardCoverageRatio: 1 });
  });

  it('muted playback is not hearing: the pass is abandoned, never completed', () => {
    const r = run(createPlayerModel(one()), [{ type: 'play' }, ...ticks(2000, { muted: true, volume: 1 }), { type: 'ended' }]);
    expect(names(r.effects)).not.toContain('completed');
    expect(names(r.effects)).toContain('abandoned');
    expect(r.m.heardRanges).toEqual([]);
  });

  it('zero volume is not hearing', () => {
    const r = run(createPlayerModel(one()), [{ type: 'play' }, ...ticks(2000, { muted: false, volume: 0 }), { type: 'ended' }]);
    expect(names(r.effects)).not.toContain('completed');
    expect(r.m.heardRanges).toEqual([]);
  });

  it('muting half-way leaves only the audible half heard', () => {
    const r = run(createPlayerModel(one()), [{ type: 'play' }, ...ticks(1000, { muted: false, volume: 1 }), ...ticks(2000, { muted: true, volume: 1 }, 1000)]);
    const heard = r.m.heardRanges.reduce((n, x) => n + (x.endMs - x.startMs), 0);
    expect(heard).toBeLessThanOrEqual(1000);
    expect(heard).toBeGreaterThan(700);
  });

  it('ticks without observedAtMs count nothing, however small the steps', () => {
    const noClock: PlayerAction[] = [];
    for (let ms = 250; ms <= 2000; ms += 250) noClock.push({ type: 'position', ms });
    const r = run(createPlayerModel(one()), [{ type: 'play' }, ...noClock, { type: 'ended' }]);
    expect(r.m.heardRanges).toEqual([]);
    expect(names(r.effects)).not.toContain('completed');
    expect(names(r.effects)).toContain('abandoned');
  });

  it('a big first jump does not count (no wall-time evidence for it); a jump later in the pass must fit the wall time', () => {
    const first = run(createPlayerModel(one(10_000)), [{ type: 'play' }, { type: 'position', ms: 9000, observedAtMs: 1000 }]);
    expect(first.m.heardRanges).toEqual([]);
    const later = run(createPlayerModel(one(10_000)), [{ type: 'play' }, { type: 'position', ms: 250, observedAtMs: 1000 }, { type: 'position', ms: 9000, observedAtMs: 1250 }]);
    expect(later.m.heardRanges.reduce((n, x) => n + (x.endMs - x.startMs), 0)).toBeLessThanOrEqual(250);
  });

  it('a tick that omits muted/volume is the caller asserting audibility (the UI always passes both)', () => {
    const r = run(createPlayerModel(one()), [{ type: 'play' }, ...ticks(2000), { type: 'ended' }]);
    expect(names(r.effects)).toContain('completed');
  });
});

describe('player: which sentences were heard', () => {
  const two = manifestOf([{
    segmentId: 'seg:0', sentenceIds: ['text:h/s0', 'text:h/s1'], ready: true, assetId: 'asset:0', durationMs: 2000,
    sentenceRanges: [{ sentenceId: 'text:h/s0', startMs: 0, endMs: 1000 }, { sentenceId: 'text:h/s1', startMs: 1000, endMs: 2000 }],
  }]);

  it('names the sentences with at least 80% of their aligned range heard', () => {
    // 0..1750 heard: 87.5% of the segment completes it; sentence 2 has 75% of its range and is not credited.
    const r = run(createPlayerModel(two), [{ type: 'play' }, ...ticks(1750), { type: 'ended' }]);
    const done = emits(r.effects).find((e) => e.event === 'completed') as Extract<PlayerEmit, { event: 'completed' }>;
    expect(done).toBeTruthy();
    expect(done.heardSentenceIds).toEqual(['text:h/s0']);
  });

  it('credits both when both are heard', () => {
    const r = run(createPlayerModel(two), [{ type: 'play' }, ...ticks(2000), { type: 'ended' }]);
    const done = emits(r.effects).find((e) => e.event === 'completed') as Extract<PlayerEmit, { event: 'completed' }>;
    expect(done.heardSentenceIds).toEqual(['text:h/s0', 'text:h/s1']);
  });

  it('without per-sentence alignments the field is absent (the whole segment is credited, as before)', () => {
    const r = run(createPlayerModel(one()), [{ type: 'play' }, ...ticks(2000), { type: 'ended' }]);
    const done = emits(r.effects).find((e) => e.event === 'completed') as Extract<PlayerEmit, { event: 'completed' }>;
    expect(done.heardSentenceIds).toBeUndefined();
  });

  it('the emitter puts exactly the named sentences on the event and drops any that are not in the segment', async () => {
    const { store, bus, gl } = await makeEnv({ allowFixture: false, providers: [new FakeSpeechProvider()] });
    await addStory(store, 'de');
    const r = await gl.ensureAudio(ids.text('de', 'story-01'), { runNow: true });
    const pm = await buildPlayerManifest(store, r.manifest);
    const em = listeningEmitter(bus, { userId: 'u1', lang: 'de', session: 's-h', textId: r.manifest.textId, store });
    const sid = pm.segments[0].sentenceIds[0];
    const fx: PlayerEffect[] = [{ type: 'emit', emit: { event: 'completed', segmentIndex: 0, view: { speed: 1, transcriptVisible: false }, replayCount: 0, revealedTranscript: false, heardCoverageRatio: 1, heardSentenceIds: [sid, 'text:other/s9'] } }];
    await emitPlayerEffects(em, { manifest: pm }, fx);
    const evs = (await bus.history({ userId: 'u1' })).filter((e) => e.type === 'AudioSegmentCompleted') as unknown as Array<{ heardSentenceIds?: string[] }>;
    expect(evs).toHaveLength(1);
    expect(evs[0].heardSentenceIds).toEqual([sid]);
  });
});

describe('player manifest: per-sentence ranges', () => {
  it('a one-sentence segment carries none (its own range already says what was heard)', async () => {
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [new FakeSpeechProvider()] });
    await addStory(store, 'de');
    const r = await gl.ensureAudio(ids.text('de', 'story-01'), { runNow: true });
    const pm = await buildPlayerManifest(store, r.manifest);
    expect(pm.segments.every((s) => s.sentenceRanges === undefined)).toBe(true);
  });
});
