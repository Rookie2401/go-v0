import { describe, expect, it } from 'vitest';
import { ids, type AudioPlayed, type AudioSegmentCompleted, type AudioReplayed, type DomainEvent } from '../../src/core';
import { PlayerMachine, buildPlayerManifest, emitPlayerEffects, listeningEmitter } from '../../src/golisten';
import { addStory, makeEnv } from './support';

const seg = { segmentId: 'seg:a', sentenceIds: ['text:es:x/s0'] };
const view = { speed: 1, transcriptVisible: false };
const ctx = { userId: 'u1', lang: 'es' as const, session: 'sess1', textId: 'text:es:x' };

const ofType = async (bus: { history: (f?: { userId?: string }) => Promise<DomainEvent[]> }, type: DomainEvent['type']) =>
  (await bus.history({ userId: 'u1' })).filter((e) => e.type === type);

describe('listeningEmitter', () => {
  it('fills the Listen base fields, including speed and transcript state', async () => {
    const { bus } = await makeEnv();
    const em = listeningEmitter(bus, ctx);
    const e = (await em.played(seg, { speed: 0.85, transcriptVisible: true })) as AudioPlayed;
    expect(e).toMatchObject({ type: 'AudioPlayed', userId: 'u1', lang: 'es', surface: 'listen', session: 'sess1', textId: 'text:es:x', segmentId: 'seg:a', sentenceIds: ['text:es:x/s0'], speed: 0.85, transcriptVisible: true });
    expect(e.dedupeKey).toBe('AudioPlayed|sess1|seg:a|0');
    const c = (await em.completed(seg, { speed: 0.85, transcriptVisible: true })) as AudioSegmentCompleted;
    expect(c).toMatchObject({ type: 'AudioSegmentCompleted', speed: 0.85, transcriptVisible: true, replayCount: 0, revealedTranscript: true, revealedTranslation: false });
  });

  it('completion is deduped per segment per pass; a replay opens a new pass that counts again', async () => {
    const { bus } = await makeEnv();
    const em = listeningEmitter(bus, ctx);
    expect(await em.played(seg, view)).not.toBeNull();
    expect(await em.played(seg, view)).toBeNull(); // rerender / duplicate callback
    expect(await em.completed(seg, view)).not.toBeNull();
    expect(await em.completed(seg, view)).toBeNull();
    expect(em.passOf('seg:a')).toBe(0);
    const r = (await em.replayed(seg, view)) as AudioReplayed;
    expect(r.count).toBe(1);
    expect(em.passOf('seg:a')).toBe(1);
    expect(await em.completed(seg, view)).toMatchObject({ replayCount: 1 });
    expect(await em.completed(seg, view)).toBeNull();
    await em.replayed(seg, view);
    const completions = await ofType(bus, 'AudioSegmentCompleted');
    expect(completions).toHaveLength(2);
    expect(await ofType(bus, 'AudioReplayed')).toHaveLength(2);
    // a different segment and a different session are independent
    expect(await em.completed({ segmentId: 'seg:b', sentenceIds: [] }, view)).not.toBeNull();
    expect(await listeningEmitter(bus, { ...ctx, session: 'sess2' }).completed(seg, view)).not.toBeNull();
  });

  it('every speed change is its own event carrying from/to', async () => {
    const { bus } = await makeEnv();
    const em = listeningEmitter(bus, ctx);
    await em.speedChanged({ from: 1, to: 0.8 });
    await em.speedChanged({ from: 0.8, to: 0.7 });
    await em.speedChanged({ from: 0.7, to: 0.8 }); // same from/to pair as before is still a new action
    const evs = await ofType(bus, 'PlaybackSpeedChanged');
    expect(evs).toHaveLength(3);
    expect(evs.map((e) => (e as { from: number; to: number }).to)).toEqual([0.8, 0.7, 0.8]);
    expect(evs.every((e) => (e as { textId: string }).textId === 'text:es:x')).toBe(true);
  });

  it('transcript reveal is recorded per pass and flows into the completion event; translation peeks too', async () => {
    const { bus } = await makeEnv();
    const em = listeningEmitter(bus, ctx);
    await em.played(seg, view);
    expect(await em.transcriptRevealed(seg, { speed: 1, transcriptVisible: true })).toMatchObject({ type: 'TranscriptRevealed', transcriptVisible: true });
    expect(await em.transcriptRevealed(seg, { speed: 1, transcriptVisible: true })).toBeNull();
    em.translationRevealed('seg:a');
    const c = await em.completed(seg, view);
    expect(c).toMatchObject({ revealedTranscript: true, revealedTranslation: true });
    await em.replayed(seg, view);
    expect(await em.transcriptRevealed(seg, { speed: 1, transcriptVisible: true })).not.toBeNull(); // new pass
  });

  it('records seeks, abandonment, phrase replays, shadowing attempts and recordings with stable keys', async () => {
    const { bus } = await makeEnv();
    const em = listeningEmitter(bus, ctx);
    expect(await em.seeked({ fromSegmentId: 'seg:a', toSegmentId: 'seg:b' })).toMatchObject({ type: 'AudioSeeked', fromSegmentId: 'seg:a', toSegmentId: 'seg:b' });
    expect(await em.abandoned(seg, view, 640)).toMatchObject({ type: 'AudioAbandoned', positionMs: 640 });
    expect(await em.abandoned(seg, view, 700)).toBeNull(); // once per pass
    expect(await em.phraseReplayed(seg, view, { alignmentId: 'al:1', unitId: 'po:1' })).toMatchObject({ type: 'PhraseReplayed', alignmentId: 'al:1', unitId: 'po:1' });
    expect(await em.phraseReplayed(seg, view, { alignmentId: 'al:1', unitId: 'po:1' })).not.toBeNull(); // each loop repeat counts
    expect(await em.shadowingAttempt(seg, view)).toMatchObject({ attempt: 1 });
    expect(await em.shadowingAttempt(seg, view)).toMatchObject({ attempt: 2 });
    expect(await em.recordingCreated({ recordingId: 'rec1', targetText: 'Dios me perdonó.', sentenceId: 'text:es:x/s1' })).toMatchObject({ type: 'UserRecordingCreated', recordingId: 'rec1' });
    expect(await em.recordingCreated({ recordingId: 'rec1', targetText: 'Dios me perdonó.' })).toBeNull();
  });

  it('honours a custom surface and clock', async () => {
    const { bus } = await makeEnv();
    const em = listeningEmitter(bus, { ...ctx, surface: 'testimony', clock: () => '2026-03-03T03:03:03.000Z' });
    const e = await em.played(seg, view);
    expect(e).toMatchObject({ surface: 'testimony', at: '2026-03-03T03:03:03.000Z' });
  });
});

describe('player + emitter integration over a real manifest', () => {
  it('drives a generated manifest and records listening events with the speed and transcript state of each action', async () => {
    const { store, bus, gl } = await makeEnv();
    await addStory(store, 'de');
    const r = await gl.ensureAudio(ids.text('de', 'story-01'), { runNow: true });
    const pm = new PlayerMachine(await buildPlayerManifest(store, r.manifest), { transcriptMode: 'hidden' });
    expect(pm.state.manifest.segments).toHaveLength(3);
    expect(pm.state.manifest.segments.every((s) => s.ready && s.assetId && s.durationMs! > 0 && s.sentenceIds.length === 1)).toBe(true);
    const em = listeningEmitter(bus, { userId: 'u1', lang: 'de', session: 's-int', textId: r.manifest.textId });
    const step = async (a: Parameters<PlayerMachine['dispatch']>[0]) => emitPlayerEffects(em, pm.state, pm.dispatch(a));

    await step({ type: 'setSpeed', speed: 0.8 });
    await step({ type: 'play' });
    await step({ type: 'revealTranscript' });
    await step({ type: 'ended' }); // completes s0 (transcript revealed), auto-advances to s1
    await step({ type: 'replay' }); // replay s1
    await step({ type: 'ended' }); // completes s1 after one replay, advances to s2
    await step({ type: 'next' }); // nowhere to go
    await step({ type: 'ended' }); // completes s2, finishes

    const evs = await bus.history({ userId: 'u1' });
    const type = (t: string) => evs.filter((e) => e.type === t) as unknown as Array<Record<string, unknown>>;
    expect(type('PlaybackSpeedChanged')).toMatchObject([{ from: 1, to: 0.8 }]);
    const played = type('AudioPlayed');
    expect(played.map((e) => e.segmentId)).toEqual(r.manifest.segmentIds.slice(0, 1).concat(r.manifest.segmentIds.slice(1, 2), r.manifest.segmentIds.slice(2, 3)));
    expect(played.every((e) => e.speed === 0.8)).toBe(true);
    const completed = type('AudioSegmentCompleted');
    expect(completed).toHaveLength(3);
    expect(completed.map((e) => e.segmentId)).toEqual(r.manifest.segmentIds);
    expect(completed[0]).toMatchObject({ revealedTranscript: true, transcriptVisible: true, replayCount: 0, speed: 0.8 });
    expect(completed[1]).toMatchObject({ revealedTranscript: false, transcriptVisible: false, replayCount: 1 });
    expect(completed[2]).toMatchObject({ revealedTranscript: false, replayCount: 0 });
    expect(type('TranscriptRevealed')).toHaveLength(1);
    expect(type('AudioReplayed')).toMatchObject([{ count: 1, speed: 0.8 }]);
    expect(type('AudioSeeked')).toHaveLength(2); // s0->s1, s1->s2
    expect(pm.state.finished).toBe(true);

    // feeding the same effects again (a rerender that re-dispatches) does not double count
    const dup = emitPlayerEffects(em, pm.state, [{ type: 'emit', emit: { event: 'completed', segmentIndex: 2, view: { speed: 0.8, transcriptVisible: false }, replayCount: 0, revealedTranscript: false } }]);
    await dup;
    expect(type('AudioSegmentCompleted')).toHaveLength(3);
    expect((await bus.history({ userId: 'u1' })).filter((e) => e.type === 'AudioSegmentCompleted')).toHaveLength(3);
  });

  it('an unfinished pass is reported as abandoned, not completed', async () => {
    const { store, bus, gl } = await makeEnv();
    await addStory(store, 'sq');
    const r = await gl.ensureAudio(ids.text('sq', 'story-01'), { runNow: true });
    const pm = new PlayerMachine(await buildPlayerManifest(store, r.manifest));
    const em = listeningEmitter(bus, { userId: 'u1', lang: 'sq', session: 's-ab', textId: r.manifest.textId });
    const step = async (a: Parameters<PlayerMachine['dispatch']>[0]) => emitPlayerEffects(em, pm.state, pm.dispatch(a));
    await step({ type: 'play' });
    await step({ type: 'position', ms: 420 });
    await step({ type: 'next' });
    const evs = await bus.history({ userId: 'u1' });
    expect(evs.filter((e) => e.type === 'AudioSegmentCompleted')).toHaveLength(0);
    expect(evs.filter((e) => e.type === 'AudioAbandoned')).toMatchObject([{ positionMs: 420, segmentId: r.manifest.segmentIds[0] }]);
  });

  it('buildPlayerManifest marks pending segments as not playable and exposes paragraph indexes', async () => {
    const { store, gl } = await makeEnv();
    await addStory(store, 'hi');
    const r = await gl.ensureAudio(ids.text('hi', 'story-01'), { sentenceIds: [ids.sentence(ids.text('hi', 'story-01'), 0)], runNow: true });
    const pmi = await buildPlayerManifest(store, r.manifest);
    expect(pmi.segments).toHaveLength(1);
    const later = await gl.ensureAudio(ids.text('hi', 'story-01'));
    const pend = await buildPlayerManifest(store, later.manifest);
    expect(pend.segments.map((s) => s.ready)).toEqual([true, false, false]);
    expect(pend.segments.every((s) => s.paragraphIndex === 0)).toBe(true);
    expect(pend.segments[1].assetId).toBeUndefined();
  });
});
