import { describe, expect, it } from 'vitest';
import {
  MAX_SPEED, MIN_SPEED, PlayerMachine, clampSpeed, createPlayerModel, isTranscriptVisible, reducePlayer,
  type PlayerAction, type PlayerEffect, type PlayerEmit, type PlayerManifestInput, type PlayerModel,
} from '../../src/golisten';

const seg = (i: number, ready = true, paragraphIndex = Math.floor(i / 2)) => ({
  segmentId: `seg:${i}`, sentenceIds: [`text:x/s${i}`], ready, assetId: ready ? `asset:${i}` : undefined, durationMs: 1500, paragraphIndex,
});
const manifest = (ready: boolean[] = [true, true, true, true, true]): PlayerManifestInput => ({ manifestId: 'man:x', textId: 'text:x', segments: ready.map((r, i) => seg(i, r)) });

/** Dispatch a sequence and return final model + all effects. */
function run(m0: PlayerModel, actions: PlayerAction[]) {
  let m = m0;
  const effects: PlayerEffect[] = [];
  for (const a of actions) { const r = reducePlayer(m, a); m = r.model; effects.push(...r.effects); }
  return { m, effects };
}
const emits = (fx: PlayerEffect[]): PlayerEmit[] => fx.flatMap((f) => (f.type === 'emit' ? [f.emit] : []));
const names = (fx: PlayerEffect[]) => emits(fx).map((e) => e.event);
function finish(m: PlayerModel) {
  const seg = m.manifest.segments[m.segmentIndex];
  const end = seg.rangeMs?.endMs ?? seg.durationMs ?? 0;
  const observed = reducePlayer(m, { type: 'position', ms: end, observedAtMs: 2000 });
  return reducePlayer(observed.model, { type: 'ended' });
}

describe('player state machine: basics', () => {
  it('starts at the first playable segment, paused, speed 1, transcript hidden, no loop', () => {
    const m = createPlayerModel(manifest([false, true, true]));
    expect(m).toMatchObject({ manifestId: 'man:x', segmentIndex: 1, playing: false, speed: 1, transcriptMode: 'hidden', loop: { unit: 'none' }, finished: false });
  });

  it('speed is clamped to 0.7-1.25 and every change keeps pitch (preservesPitch rate effects)', () => {
    expect(clampSpeed(0.5)).toBe(MIN_SPEED);
    expect(clampSpeed(3)).toBe(MAX_SPEED);
    expect(clampSpeed(Number.NaN)).toBe(1);
    expect(clampSpeed(0.8123)).toBe(0.81);
    const m0 = createPlayerModel(manifest());
    const low = reducePlayer(m0, { type: 'setSpeed', speed: 0.1 });
    expect(low.model.speed).toBe(0.7);
    expect(low.effects).toContainEqual({ type: 'setRate', rate: 0.7, preservesPitch: true });
    expect(emits(low.effects)).toEqual([{ event: 'speedChanged', from: 1, to: 0.7 }]);
    const high = reducePlayer(m0, { type: 'setSpeed', speed: 9 });
    expect(high.model.speed).toBe(1.25);
    const same = reducePlayer(high.model, { type: 'setSpeed', speed: 99 });
    expect(same.effects).toEqual([]); // already at max: no event, no rate churn
    // stepping
    let m = m0;
    for (let i = 0; i < 10; i++) m = reducePlayer(m, { type: 'stepSpeed', delta: 1 }).model;
    expect(m.speed).toBe(1.25);
    for (let i = 0; i < 20; i++) m = reducePlayer(m, { type: 'stepSpeed', delta: -1 }).model;
    expect(m.speed).toBe(0.7);
    expect(reducePlayer(m0, { type: 'stepSpeed', delta: -1 }).model.speed).toBe(0.95);
  });

  it('every rate effect sets preservesPitch: true', () => {
    const { effects } = run(createPlayerModel(manifest()), [{ type: 'setSpeed', speed: 0.8 }, { type: 'play' }, { type: 'next' }, { type: 'replay' }]);
    const rates = effects.filter((e): e is Extract<PlayerEffect, { type: 'setRate' }> => e.type === 'setRate');
    expect(rates.length).toBeGreaterThanOrEqual(4);
    expect(rates.every((r) => r.preservesPitch === true && r.rate === 0.8)).toBe(true);
  });

  it('play loads + starts + emits played once; resume after pause is not a new pass', () => {
    const m0 = createPlayerModel(manifest());
    const a = reducePlayer(m0, { type: 'play' });
    expect(a.model).toMatchObject({ playing: true, started: true, segmentIndex: 0 });
    expect(a.effects.map((e) => e.type)).toEqual(expect.arrayContaining(['load', 'setRate', 'play', 'emit', 'prefetch']));
    expect(names(a.effects)).toEqual(['played']);
    expect(reducePlayer(a.model, { type: 'play' }).effects).toEqual([]); // already playing
    const paused = reducePlayer(a.model, { type: 'pause' });
    expect(paused.effects).toEqual([{ type: 'pause' }]);
    const resumed = reducePlayer(paused.model, { type: 'play' });
    expect(resumed.effects).toEqual([{ type: 'play' }]);
    expect(names(resumed.effects)).toEqual([]);
    expect(reducePlayer(resumed.model, { type: 'toggle' }).model.playing).toBe(false);
  });

  it('does nothing when no segment is ready', () => {
    const m0 = createPlayerModel(manifest([false, false]));
    expect(reducePlayer(m0, { type: 'play' }).effects).toEqual([]);
    expect(reducePlayer(m0, { type: 'next' }).effects).toEqual([]);
    expect(reducePlayer(m0, { type: 'replay' }).effects).toEqual([]);
  });
});

describe('player state machine: navigation', () => {
  it('ended emits completed and auto-advances; the last segment finishes playback; play then restarts', () => {
    let { m } = run(createPlayerModel(manifest([true, true])), [{ type: 'play' }]);
    const r1 = finish(m);
    expect(names(r1.effects)).toEqual(['completed', 'seeked', 'played']);
    expect(r1.model).toMatchObject({ segmentIndex: 1, playing: true, started: true, completed: false });
    const r2 = finish(r1.model);
    expect(names(r2.effects)).toEqual(['completed']);
    expect(r2.model).toMatchObject({ playing: false, finished: true });
    const again = reducePlayer(r2.model, { type: 'play' });
    expect(again.model).toMatchObject({ segmentIndex: 0, playing: true, finished: false });
    expect(names(again.effects)).toContain('played');
    // stray duplicate media callbacks are ignored
    expect(reducePlayer(r2.model, { type: 'ended' }).effects).toEqual([]);
    m = r1.model;
  });

  it('next/prev/seek skip segments that are not ready and never load them', () => {
    const m0 = createPlayerModel(manifest([true, false, true, false, true]));
    const { m, effects } = run(m0, [{ type: 'play' }, { type: 'next' }]);
    expect(m.segmentIndex).toBe(2);
    const loaded = effects.flatMap((e) => (e.type === 'load' ? [e.segmentIndex] : []));
    expect(loaded).toEqual([0, 2]);
    expect(reducePlayer(m, { type: 'seekSegment', index: 3 }).effects).toEqual([]);
    expect(reducePlayer(m, { type: 'seekSegment', index: 1 }).effects).toEqual([]);
    expect(reducePlayer(m, { type: 'prev' }).model.segmentIndex).toBe(0);
    expect(reducePlayer(reducePlayer(m, { type: 'next' }).model, { type: 'next' }).model.segmentIndex).toBe(4);
  });

  it('prev restarts the current segment when more than 2 s in, otherwise goes back', () => {
    const longManifest = manifest();
    longManifest.segments[1] = { ...longManifest.segments[1], durationMs: 5000 };
    const m0 = run(createPlayerModel(longManifest), [{ type: 'play' }, { type: 'next' }, { type: 'position', ms: 500 }]).m;
    expect(reducePlayer(m0, { type: 'prev' }).model.segmentIndex).toBe(0);
    const late = reducePlayer(m0, { type: 'position', ms: 3000 }).model;
    const r = reducePlayer(late, { type: 'prev' });
    expect(r.model.segmentIndex).toBe(1);
    expect(names(r.effects)).toEqual(['replayed']);
    // at the very first segment prev replays it
    const first = run(createPlayerModel(manifest()), [{ type: 'play' }]).m;
    expect(names(reducePlayer(first, { type: 'prev' }).effects)).toEqual(['replayed']);
  });

  it('seeks by sentence id and by paragraph', () => {
    const m0 = createPlayerModel(manifest());
    const s = reducePlayer(m0, { type: 'seekSentence', sentenceId: 'text:x/s3' });
    expect(s.model.segmentIndex).toBe(3);
    expect(emits(s.effects)).toEqual([{ event: 'seeked', fromSegmentIndex: 0, toSegmentIndex: 3 }]);
    expect(reducePlayer(m0, { type: 'seekSentence', sentenceId: 'text:x/s99' }).effects).toEqual([]);
    // paragraphs: [0,1] [2,3] [4]
    expect(reducePlayer(m0, { type: 'seekParagraph', delta: 1 }).model.segmentIndex).toBe(2);
    const at3 = s.model;
    expect(reducePlayer(at3, { type: 'seekParagraph', delta: -1 }).model.segmentIndex).toBe(0);
    expect(reducePlayer(at3, { type: 'seekParagraph', delta: 1 }).model.segmentIndex).toBe(4);
    expect(reducePlayer(reducePlayer(at3, { type: 'seekParagraph', delta: 1 }).model, { type: 'seekParagraph', delta: 1 }).effects).toEqual([]);
  });

  it('a half-heard segment emits abandoned when the learner leaves it; completed or unstarted ones do not', () => {
    const playing = run(createPlayerModel(manifest()), [{ type: 'play' }, { type: 'position', ms: 600 }]).m;
    const left = reducePlayer(playing, { type: 'next' });
    expect(emits(left.effects)).toContainEqual({ event: 'abandoned', segmentIndex: 0, view: { speed: 1, transcriptVisible: false }, positionMs: 600 });
    const unstarted = reducePlayer(createPlayerModel(manifest()), { type: 'next' });
    expect(names(unstarted.effects)).not.toContain('abandoned');
    const ended = run(createPlayerModel(manifest()), [{ type: 'play' }, { type: 'position', ms: 600 }, { type: 'ended' }]);
    expect(names(ended.effects).filter((n) => n === 'abandoned')).toEqual(['abandoned']);
  });

  it('prefetches a window ahead of the current segment, skipping unready ones and never repeating', () => {
    const m0 = createPlayerModel(manifest([true, true, false, true, true, true]), { prefetchWindow: 2 });
    const a = reducePlayer(m0, { type: 'play' });
    const pf1 = a.effects.filter((e) => e.type === 'prefetch');
    expect(pf1).toEqual([{ type: 'prefetch', segmentIndexes: [1, 3], assetIds: ['asset:1', 'asset:3'] }]);
    const b = reducePlayer(a.model, { type: 'next' }); // now at 1: window is 3,4 -> only 4 is new
    expect(b.effects.filter((e) => e.type === 'prefetch')).toEqual([{ type: 'prefetch', segmentIndexes: [4], assetIds: ['asset:4'] }]);
    const c = reducePlayer(b.model, { type: 'next' }); // at 3: window 4,5 -> 5 new
    expect(c.effects.filter((e) => e.type === 'prefetch')).toEqual([{ type: 'prefetch', segmentIndexes: [5], assetIds: ['asset:5'] }]);
    const d = reducePlayer(c.model, { type: 'next' }); // at 4: window 5 only, already fetched
    expect(d.effects.filter((e) => e.type === 'prefetch')).toEqual([]);
  });

  it('manifestUpdated keeps the current segment and prefetches newly ready ones', () => {
    const m0 = run(createPlayerModel(manifest([true, false, false])), [{ type: 'play' }]).m;
    const updated = { ...manifest([true, true, true]) };
    const r = reducePlayer(m0, { type: 'manifestUpdated', manifest: updated });
    expect(r.model.segmentIndex).toBe(0);
    expect(r.model.playing).toBe(true);
    expect(r.effects).toEqual([{ type: 'prefetch', segmentIndexes: [1, 2], assetIds: ['asset:1', 'asset:2'] }]);
    const { m } = run(r.model, [{ type: 'next' }]);
    expect(m.segmentIndex).toBe(1);
  });
});

describe('player state machine: replay and loops', () => {
  it('replay starts a new pass: emits replayed with a running count, and completion reports the replays', () => {
    let m = run(createPlayerModel(manifest()), [{ type: 'play' }]).m;
    const r1 = reducePlayer(m, { type: 'replay' });
    expect(emits(r1.effects)).toEqual([{ event: 'replayed', segmentIndex: 0, view: { speed: 1, transcriptVisible: false }, count: 1 }]);
    expect(r1.effects).toContainEqual({ type: 'seek', ms: 0 });
    const r2 = reducePlayer(r1.model, { type: 'replay' });
    expect(r2.model.replayCount).toBe(2);
    m = r2.model;
    const end = finish(m);
    expect(emits(end.effects)[0]).toMatchObject({ event: 'completed', replayCount: 2 });
    // play after a completed (non-advancing) pass is a deliberate replay
    const nonAdvFirst = reducePlayer(createPlayerModel(manifest(), { autoAdvance: false }), { type: 'play' }).model;
    const nonAdv = { m: finish(nonAdvFirst).model, effects: finish(nonAdvFirst).effects };
    expect(nonAdv.m).toMatchObject({ playing: false, completed: true, finished: false, segmentIndex: 0 });
    expect(names(reducePlayer(nonAdv.m, { type: 'play' }).effects)).toEqual(['replayed']);
  });

  it('sentence loop repeats the same segment: completed, then seek 0 + play + replayed, forever', () => {
    let m = run(createPlayerModel(manifest()), [{ type: 'play' }, { type: 'setLoop', unit: 'sentence' }]).m;
    expect(m.loop).toEqual({ unit: 'sentence', alignmentId: undefined });
    for (let i = 1; i <= 3; i++) {
      const r = finish(m);
      expect(names(r.effects)).toEqual(['completed', 'replayed']);
      expect(r.effects).toContainEqual({ type: 'seek', ms: 0 });
      expect(r.model).toMatchObject({ segmentIndex: 0, playing: true, replayCount: i });
      m = r.model;
    }
    m = reducePlayer(m, { type: 'setLoop', unit: 'none' }).model;
    expect(finish(m).model.segmentIndex).toBe(1);
  });

  it('requires fresh observed coverage for every loop pass and restarts a ranged sentence at its offset', () => {
    const ranged = { ...manifest([true]), segments: [{ ...seg(0), rangeMs: { startMs: 200, endMs: 1500 } }] };
    let m = run(createPlayerModel(ranged), [{ type: 'play' }, { type: 'setLoop', unit: 'sentence' }, { type: 'position', ms: 1500, observedAtMs: 1300 }]).m;
    const first = reducePlayer(m, { type: 'ended' });
    expect(names(first.effects)).toEqual(['completed', 'replayed']);
    expect(first.effects).toContainEqual({ type: 'seek', ms: 200 });
    expect(first.model.heardRanges).toEqual([]);
    // A duplicate end or seek to the end on pass two has no new observed coverage.
    expect(names(reducePlayer(first.model, { type: 'ended' }).effects)).toEqual(['abandoned']);
    const seeked = reducePlayer(first.model, { type: 'seekPosition', ms: 1490 });
    const end = reducePlayer(seeked.model, { type: 'ended' });
    expect(names(end.effects)).toEqual(['abandoned']);
  });

  it('seeking after completion starts a fresh pass at the chosen point instead of resetting to zero', () => {
    const completed = finish(run(createPlayerModel(manifest([true])), [{ type: 'play' }]).m).model;
    expect(completed.completed).toBe(true);
    const seek = reducePlayer(completed, { type: 'seekPosition', ms: 1000 });
    expect(seek.model).toMatchObject({ positionMs: 1000, completed: false, finished: false, started: false, heardRanges: [] });
    expect(names(seek.effects)).toEqual(['replayed']);
    const play = reducePlayer(seek.model, { type: 'play' });
    expect(play.model.positionMs).toBe(1000);
    const end = reducePlayer(reducePlayer(play.model, { type: 'position', ms: 1500, observedAtMs: 1000 }).model, { type: 'ended' });
    expect(names(end.effects)).toEqual(['abandoned']);
  });

  it('applies a paused user seek and a restored checkpoint to the media element before Play', () => {
    const fresh = createPlayerModel(manifest([true]));
    const selected = reducePlayer(fresh, { type: 'seekPosition', ms: 1000 });
    expect(selected.model.positionMs).toBe(1000);
    expect(selected.effects).toEqual([{ type: 'seek', ms: 1000 }]);
    const playSelected = reducePlayer(selected.model, { type: 'play' });
    expect(playSelected.effects.slice(0, 3)).toEqual([
      { type: 'load', segmentIndex: 0, segmentId: 'seg:0', assetId: 'asset:0' },
      { type: 'seek', ms: 1000 },
      { type: 'setRate', rate: 1, preservesPitch: true },
    ]);
    expect(emits(playSelected.effects).map((e) => e.event)).toEqual(['played']);

    const restored = reducePlayer(fresh, { type: 'restorePosition', segmentId: 'seg:0', positionMs: 1000 });
    expect(restored.model.positionMs).toBe(1000);
    expect(emits(restored.effects)).toEqual([]);
    const playRestored = reducePlayer(restored.model, { type: 'play' });
    expect(playRestored.effects).toContainEqual({ type: 'seek', ms: 1000 });
    expect(emits(playRestored.effects).map((e) => e.event)).toEqual(['played']);
  });

  it('a phrase loop needs a real aligned range; position past its end seeks back and emits phraseReplayed', () => {
    const phraseManifest = { ...manifest(), segments: manifest().segments.map((s, i) => i === 0 ? { ...s, reviewedAlignmentIds: ['al:1'], reviewedAlignmentRanges: [{ id: 'al:1', unitId: 'po:1', unit: 'phrase' as const, startMs: 400, endMs: 900 }] } : s) };
    const m0 = run(createPlayerModel(phraseManifest), [{ type: 'play' }]).m;
    expect(reducePlayer(m0, { type: 'setLoop', unit: 'phrase' }).model.loop.unit).toBe('none'); // no range: refused
    expect(reducePlayer(m0, { type: 'setLoop', unit: 'phrase', alignmentId: 'al:1', range: { startMs: 500, endMs: 500 } }).model.loop.unit).toBe('none');
    expect(reducePlayer(m0, { type: 'setLoop', unit: 'phrase', alignmentId: 'al:1', unitId: 'po:1', range: { startMs: 401, endMs: 900 } }).model.loop.unit).toBe('none'); // caller cannot substitute a made-up range
    expect(reducePlayer(m0, { type: 'setLoop', unit: 'phrase', alignmentId: 'al:1', unitId: 'po:other', range: { startMs: 400, endMs: 900 } }).model.loop.unit).toBe('none');
    const m1 = reducePlayer(m0, { type: 'setLoop', unit: 'phrase', alignmentId: 'al:1', unitId: 'po:1', range: { startMs: 400, endMs: 900 } }).model;
    expect(m1.loop).toEqual({ unit: 'phrase', alignmentId: 'al:1' });
    expect(reducePlayer(m1, { type: 'position', ms: 700 }).effects).toEqual([]);
    const past = reducePlayer(m1, { type: 'position', ms: 950 });
    expect(past.effects).toContainEqual({ type: 'seek', ms: 400 });
    expect(emits(past.effects)).toEqual([{ event: 'phraseReplayed', segmentIndex: 0, view: { speed: 1, transcriptVisible: false }, alignmentId: 'al:1', unitId: 'po:1' }]);
    expect(past.model.positionMs).toBe(400);
  });
});

describe('player state machine: transcript modes', () => {
  const at = (mode: 'visible' | 'hidden' | 'reveal-current' | 'reveal-after') => createPlayerModel(manifest(), { transcriptMode: mode });

  it('visibility per mode', () => {
    expect(isTranscriptVisible(at('visible'), 0)).toBe(true);
    expect(isTranscriptVisible(at('hidden'), 0)).toBe(false);
    const rc = at('reveal-current');
    expect(isTranscriptVisible(rc, 0)).toBe(false); // not started yet
    const rcPlaying = run(rc, [{ type: 'play' }]).m;
    expect(isTranscriptVisible(rcPlaying, 0)).toBe(true);
    expect(isTranscriptVisible(rcPlaying, 1)).toBe(false);
    const ra = run(at('reveal-after'), [{ type: 'play' }]).m;
    expect(isTranscriptVisible(ra, 0)).toBe(false); // hidden while listening
    const done = finish(ra).model; // advanced to 1
    expect(isTranscriptVisible(done, 0)).toBe(true); // revealed after
    expect(isTranscriptVisible(done, 1)).toBe(false);
  });

  it('explicit reveal records TranscriptRevealed once, and completion reports whether the transcript was visible', () => {
    const m0 = run(at('hidden'), [{ type: 'play' }]).m;
    const rev = reducePlayer(m0, { type: 'revealTranscript' });
    expect(emits(rev.effects)).toEqual([{ event: 'transcriptRevealed', segmentIndex: 0, view: { speed: 1, transcriptVisible: true } }]);
    expect(reducePlayer(rev.model, { type: 'revealTranscript' }).effects).toEqual([]);
    expect(emits(finish(rev.model).effects)[0]).toMatchObject({ event: 'completed', revealedTranscript: true });
    // never revealed -> listened "blind"
    expect(emits(finish(m0).effects)[0]).toMatchObject({ event: 'completed', revealedTranscript: false, view: { transcriptVisible: false } });
    // reveal-after only reveals once the pass is over, so a completed pass still counts as blind
    const ra = run(at('reveal-after'), [{ type: 'play' }]).m;
    expect(emits(finish(ra).effects)[0]).toMatchObject({ event: 'completed', revealedTranscript: false });
    // visible mode: nothing to reveal, and completion says it was visible
    const vis = run(at('visible'), [{ type: 'play' }]).m;
    expect(reducePlayer(vis, { type: 'revealTranscript' }).effects).toEqual([]);
    expect(emits(finish(vis).effects)[0]).toMatchObject({ revealedTranscript: true });
  });

  it('events carry the speed in force at the time', () => {
    const started = run(at('hidden'), [{ type: 'setSpeed', speed: 0.8 }, { type: 'play' }]).m;
    const e = emits(finish(started).effects);
    expect(e.find((x) => x.event === 'played')).toMatchObject({ view: { speed: 0.8 } });
    expect(e.find((x) => x.event === 'completed')).toMatchObject({ view: { speed: 0.8 } });
  });

  it('does not let visible-to-hidden transcript changes launder a pass', () => {
    const m = run(at('hidden'), [{ type: 'play' }, { type: 'setTranscriptMode', mode: 'visible' }, { type: 'setTranscriptMode', mode: 'hidden' }]).m;
    const covered = reducePlayer(m, { type: 'position', ms: 1500, observedAtMs: 1400 }).model;
    expect(emits(reducePlayer(covered, { type: 'ended' }).effects)[0]).toMatchObject({ event: 'completed', revealedTranscript: true, view: { transcriptVisible: true } });
  });

  it('paused or not-yet-started position callbacks add no audible coverage', () => {
    const fresh = reducePlayer(createPlayerModel(manifest()), { type: 'position', ms: 900, observedAtMs: 900 });
    expect(fresh.model.heardRanges).toEqual([]);
    const paused = run(at('hidden'), [{ type: 'play' }, { type: 'pause' }]).m;
    expect(reducePlayer(paused, { type: 'position', ms: 900, observedAtMs: 1200 }).model.heardRanges).toEqual([]);
  });
});

describe('PlayerMachine wrapper', () => {
  it('holds state, returns effects and notifies subscribers', () => {
    const pm = new PlayerMachine(manifest(), { speed: 1.1 });
    const seen: number[] = [];
    const off = pm.subscribe((m) => seen.push(m.segmentIndex));
    const fx = pm.dispatch({ type: 'play' });
    expect(fx.length).toBeGreaterThan(0);
    pm.dispatch({ type: 'next' });
    off();
    pm.dispatch({ type: 'next' });
    expect(seen).toEqual([0, 1]);
    expect(pm.state.segmentIndex).toBe(2);
    expect(pm.state.speed).toBe(1.1);
  });
});
