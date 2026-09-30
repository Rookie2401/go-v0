/**
 * Evidence honesty of the listening events (evidence policy v2, rule 5): every event says whether the audio
 * behind it is real speech and whether a person has reviewed its voice, and a completion means a READY asset
 * really played to its end.
 */
import { describe, expect, it } from 'vitest';
import { ids, type AudioAbandoned, type AudioPlayed, type AudioSegmentCompleted, type DomainEvent, type LanguageCode } from '../../src/core';
import { PlayerMachine, buildPlayerManifest, emitPlayerEffects, listeningEmitter } from '../../src/golisten';
import { FakeSpeechProvider, LANGS, addStory, makeEnv } from './support';

const view0 = { speed: 1, transcriptVisible: false };
type Env = Awaited<ReturnType<typeof makeEnv>>;

const ofType = async (bus: Env['bus'], type: DomainEvent['type']) => (await bus.history({ userId: 'u1' })).filter((e) => e.type === type);

async function firstSegment(env: Env, lang: LanguageCode) {
  await addStory(env.store, lang);
  const r = await env.gl.ensureAudio(ids.text(lang, 'story-01'), { runNow: true });
  const seg = (await env.gl.getSegment(r.manifest.segmentIds[0]))!;
  return { r, seg, ref: { segmentId: seg.id, sentenceIds: seg.sentenceIds } };
}

describe.each(LANGS)('listening events carry speech / voiceReviewed / assetId (%s)', (lang) => {
  it('fixture audio: speech false, voiceReviewed false (still a real completion event; GoLearn grants no evidence)', async () => {
    const env = await makeEnv({ allowFixture: true });
    const { seg, ref } = await firstSegment(env, lang);
    const em = listeningEmitter(env.bus, { userId: 'u1', lang, session: 's', textId: ids.text(lang, 'story-01'), store: env.store });
    const played = (await em.played(ref, view0)) as AudioPlayed;
    const done = (await em.completed(ref, view0)) as AudioSegmentCompleted;
    for (const e of [played, done]) expect(e).toMatchObject({ assetId: seg.assetId, speech: false, voiceReviewed: false });
  });

  it('unreviewed real speech: speech true, voiceReviewed false; reviewed: both true; rejecting flips it back', async () => {
    const env = await makeEnv({ allowFixture: false, providers: [new FakeSpeechProvider()] });
    const { seg, ref, r } = await firstSegment(env, lang);
    let n = 0;
    const emitter = () => listeningEmitter(env.bus, { userId: 'u1', lang, session: `s${n++}`, textId: ids.text(lang, 'story-01'), store: env.store });
    expect(await emitter().completed(ref, view0)).toMatchObject({ assetId: seg.assetId, speech: true, voiceReviewed: false });
    await env.gl.setVoiceReview(r.manifest.voiceConfigId, 'reviewed');
    expect(await emitter().completed(ref, view0)).toMatchObject({ assetId: seg.assetId, speech: true, voiceReviewed: true });
    const em = emitter();
    expect(await em.played(ref, view0)).toMatchObject({ speech: true, voiceReviewed: true });
    expect(await em.transcriptRevealed(ref, view0)).toMatchObject({ speech: true, voiceReviewed: true });
    expect(await em.replayed(ref, view0)).toMatchObject({ speech: true, voiceReviewed: true });
    expect(await em.shadowingAttempt(ref, view0)).toMatchObject({ speech: true, voiceReviewed: true });
    expect(await em.phraseReplayed(ref, view0, { alignmentId: 'al', unitId: 'u' })).toMatchObject({ speech: true, voiceReviewed: true });
    await env.gl.setVoiceReview(r.manifest.voiceConfigId, 'rejected');
    expect(await emitter().completed(ref, view0)).toMatchObject({ speech: true, voiceReviewed: false });
  });
});

describe('AudioSegmentCompleted only when playback of a ready asset finished', () => {
  it('a pending / unknown / byte-less segment completes as AudioAbandoned instead, never as a completion', async () => {
    const env = await makeEnv({ allowFixture: true });
    const { store, bus, gl } = env;
    await addStory(store, 'es');
    const r = await gl.ensureAudio(ids.text('es', 'story-01')); // queued, nothing ready
    const pending = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    const em = listeningEmitter(bus, { userId: 'u1', lang: 'es', session: 'np', textId: ids.text('es', 'story-01'), store });
    const ref = { segmentId: pending.id, sentenceIds: pending.sentenceIds };
    expect(await em.completed(ref, view0, { positionMs: 120 })).toBeNull();
    expect(await ofType(bus, 'AudioSegmentCompleted')).toHaveLength(0);
    const ab = (await ofType(bus, 'AudioAbandoned')) as AudioAbandoned[];
    expect(ab).toHaveLength(1);
    expect(ab[0]).toMatchObject({ segmentId: pending.id, positionMs: 120, speech: false, voiceReviewed: false });
    expect(ab[0].assetId).toBeUndefined();

    expect(await em.completed({ segmentId: 'seg:unknown', sentenceIds: [] }, view0)).toBeNull(); // not in the store at all
    expect(await ofType(bus, 'AudioSegmentCompleted')).toHaveLength(0);

    // a ready segment whose bytes have vanished is not a ready asset either
    await gl.runJobs();
    const ready = (await gl.getSegment(pending.id))!;
    const realHas = store.assets.has.bind(store.assets);
    store.assets.has = async (id: string) => (id === ready.assetId ? false : realHas(id));
    const em2 = listeningEmitter(bus, { userId: 'u1', lang: 'es', session: 'nb', textId: ids.text('es', 'story-01'), store });
    expect(await em2.completed({ segmentId: ready.id, sentenceIds: ready.sentenceIds }, view0)).toBeNull();
    store.assets.has = realHas;
    const em3 = listeningEmitter(bus, { userId: 'u1', lang: 'es', session: 'ok', textId: ids.text('es', 'story-01'), store });
    expect(await em3.completed({ segmentId: ready.id, sentenceIds: ready.sentenceIds }, view0)).toMatchObject({ type: 'AudioSegmentCompleted', assetId: ready.assetId });
  });

  it('without a store the emitter fails closed: no asset hint means no completion, and speech is never assumed', async () => {
    const { bus } = await makeEnv();
    const em = listeningEmitter(bus, { userId: 'u1', lang: 'de', session: 'x', textId: 'text:de:x' });
    expect(await em.completed({ segmentId: 'seg:q', sentenceIds: [] }, view0)).toBeNull();
    expect(await ofType(bus, 'AudioAbandoned')).toHaveLength(1);
    expect(await em.played({ segmentId: 'seg:q', sentenceIds: [], assetId: 'asset:q', ready: true }, view0)).toMatchObject({ assetId: 'asset:q', speech: false, voiceReviewed: false });
    const vouched = await em.played({ segmentId: 'seg:r', sentenceIds: [], assetId: 'asset:r', ready: true, speech: true, voiceReviewed: true }, view0);
    expect(vouched).toMatchObject({ speech: true, voiceReviewed: true }); // the caller may vouch explicitly
  });

  it('failed() records a failed or aborted play as AudioAbandoned once per pass', async () => {
    const env = await makeEnv({ allowFixture: true });
    const { ref } = await firstSegment(env, 'hi');
    const em = listeningEmitter(env.bus, { userId: 'u1', lang: 'hi', session: 'f', textId: ids.text('hi', 'story-01'), store: env.store });
    await em.played(ref, view0);
    expect(await em.failed(ref, view0, 310)).toMatchObject({ type: 'AudioAbandoned', positionMs: 310 });
    expect(await em.failed(ref, view0, 400)).toBeNull();
    expect(await ofType(env.bus, 'AudioSegmentCompleted')).toHaveLength(0);
  });

  it('the player state machine turns a media error into an abandoned pass (never a completion) and can restart it', async () => {
    const { store, bus, gl } = await makeEnv({ allowFixture: true });
    await addStory(store, 'th');
    const r = await gl.ensureAudio(ids.text('th', 'story-01'), { runNow: true });
    const pm = new PlayerMachine(await buildPlayerManifest(store, r.manifest));
    const em = listeningEmitter(bus, { userId: 'u1', lang: 'th', session: 'pe', textId: r.manifest.textId, store });
    const step = async (a: Parameters<PlayerMachine['dispatch']>[0]) => emitPlayerEffects(em, pm.state, pm.dispatch(a));
    await step({ type: 'play' });
    await step({ type: 'position', ms: 250 });
    await step({ type: 'playbackError' });
    expect(pm.state).toMatchObject({ playing: false, started: false, completed: false });
    await step({ type: 'ended' }); // a stray callback after the error is ignored
    const evs = await bus.history({ userId: 'u1' });
    expect(evs.filter((e) => e.type === 'AudioSegmentCompleted')).toHaveLength(0);
    expect(evs.filter((e) => e.type === 'AudioAbandoned')).toMatchObject([{ positionMs: 250, segmentId: r.manifest.segmentIds[0] }]);
    await step({ type: 'playbackError' }); // nothing playing: nothing to abandon
    expect((await bus.history({ userId: 'u1' })).filter((e) => e.type === 'AudioAbandoned')).toHaveLength(1);
    await step({ type: 'play' });
    await step({ type: 'ended' });
    expect((await bus.history({ userId: 'u1' })).filter((e) => e.type === 'AudioSegmentCompleted')).toHaveLength(1);
  });
});
