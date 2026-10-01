/**
 * Audit round (PLAN7 F1): `available` means "playback of some kind is possible"; `realSpeech` means a REAL speech provider is
 * usable. A preview session whose only provider is the development fixture is available but never real speech, and says
 * why real speech is not there. Listening evidence is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { AzureSpeechProvider, listeningEmitter } from '../../src/golisten';
import { createGoLearn } from '../../src/golearn';
import { FakeSpeechProvider, addStory, makeEnv } from './support';

describe('GoListen.availability(): real speech is a separate fact', () => {
  it('only the fixture usable (preview): available, reason development-fixture, realSpeech false, with no-provider as the real reason', async () => {
    const { gl } = await makeEnv({ allowFixture: true });
    expect(await gl.availability()).toMatchObject({
      available: true, reason: 'development-fixture', realSpeech: false, realSpeechReason: 'no-provider',
    });
  });

  it('fixture usable and a real provider without a key: the real provider\'s own reason and detail are carried', async () => {
    const azure = new AzureSpeechProvider({ key: '', region: '' });
    const own = await azure.availability();
    const { gl } = await makeEnv({ allowFixture: true, providers: [azure] });
    const a = await gl.availability();
    expect(a).toMatchObject({ available: true, reason: 'development-fixture', realSpeech: false, realSpeechReason: 'missing-credentials' });
    expect(a.realSpeechDetail).toBe(own.detail);
  });

  it('a usable real provider: realSpeech true (the fixture never makes it true)', async () => {
    const { gl } = await makeEnv({ allowFixture: true, providers: [new FakeSpeechProvider()] });
    expect(await gl.availability()).toEqual({ available: true, realSpeech: true, detail: 'fake-speech' });
  });

  it('nothing usable: not available and not real speech, with the reason', async () => {
    const off = await makeEnv({ allowFixture: false });
    expect(await off.gl.availability()).toMatchObject({ available: false, realSpeech: false, reason: 'no-provider', realSpeechReason: 'no-provider' });
    const azure = new AzureSpeechProvider({ key: '', region: '' });
    const noKey = await makeEnv({ allowFixture: false, providers: [azure] });
    expect(await noKey.gl.availability()).toMatchObject({ available: false, realSpeech: false, reason: 'missing-credentials', realSpeechReason: 'missing-credentials' });
  });

  it('switching preview on and off re-reads the truth, and the audio status gate still follows "can anything play"', async () => {
    const { gl, store } = await makeEnv({ allowFixture: false });
    await addStory(store, 'es');
    expect(await gl.availability()).toMatchObject({ available: false, realSpeech: false });
    expect((await gl.audioStatus(ids.text('es', 'story-01'))).state).toBe('unavailable');
    gl.setAllowFixture(true);
    expect(await gl.availability()).toMatchObject({ available: true, realSpeech: false, reason: 'development-fixture' });
    expect((await gl.audioStatus(ids.text('es', 'story-01'))).state).toBe('not-generated'); // placeholder audio can be made in preview
    gl.setAllowFixture(false);
    expect(await gl.availability()).toMatchObject({ available: false, realSpeech: false });
  });
});

describe('listening evidence is unchanged', () => {
  it('a preview session that plays fixture audio to the end leaves listenedSentences at 0', async () => {
    const env = await makeEnv({ allowFixture: true });
    await addStory(env.store, 'es');
    const learn = createGoLearn({ store: env.store, bus: env.bus, adapters: env.registry, clock: env.clock.clock });
    learn.attach();
    const textId = ids.text('es', 'story-01');
    const r = await env.gl.ensureAudio(textId, { runNow: true });
    const em = listeningEmitter(env.bus, { userId: 'u1', lang: 'es', session: 's-preview', textId, store: env.store });
    for (const id of r.manifest.segmentIds) {
      const seg = (await env.gl.getSegment(id))!;
      const ref = { segmentId: seg.id, sentenceIds: seg.sentenceIds };
      await em.played(ref, { speed: 1, transcriptVisible: false });
      expect(await em.completed(ref, { speed: 1, transcriptVisible: false })).toMatchObject({ type: 'AudioSegmentCompleted', speech: false });
    }
    await learn.settled();
    expect((await learn.readingProgress('u1', textId)).listenedSentences).toBe(0);
  });
});
