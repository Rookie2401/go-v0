import { describe, expect, it } from 'vitest';
import { ids, type AppStore } from '../../src/core';
import { AzureSpeechProvider, FixtureTtsProvider, createGoListen } from '../../src/golisten';
import { FakeSpeechProvider, LANGS, addStory, makeEnv } from './support';

const tid = (lang: Parameters<typeof ids.text>[0]) => ids.text(lang, 'story-01');

const AUDIO_TABLES = ['voices', 'audioAssets', 'audioSegments', 'alignments', 'manifests', 'audioJobs'] as const;
async function audioRowCount(store: AppStore): Promise<number> {
  let n = 0;
  for (const t of AUDIO_TABLES) n += await store[t].count();
  return n;
}

describe.each(LANGS)('no fixture by default (%s)', (lang) => {
  it('reports unavailable, explains it, and ensureAudio throws AudioUnavailable without writing anything', async () => {
    const { store, gl } = await makeEnv({ allowFixture: false });
    await addStory(store, lang);
    expect(gl.providers()).toEqual([]); // the fixture is not even registered
    expect(await gl.availability()).toMatchObject({ available: false, reason: 'no-provider' });

    const status = await gl.audioStatus(tid(lang));
    expect(status).toMatchObject({ state: 'unavailable', isSpeech: false, evidenceEligible: false, textContentVersion: 1, totalSegments: 3, readySegments: 0 });
    expect(status.reason).toMatch(/no speech provider is configured/i);
    expect(status.reason).toMatch(/still read/i);

    const err = await gl.ensureAudio(tid(lang), { runNow: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe('AudioUnavailable');
    expect((err as { reason?: string }).reason).toBe('no-provider');
    expect(await audioRowCount(store)).toBe(0);

    const sErr = await gl.ensureSentenceAudio({ lang, text: 'Hola.', ownerId: 'u1', contextId: 'r1/s0', runNow: true }).catch((e: unknown) => e);
    expect((sErr as Error).name).toBe('AudioUnavailable');
    const vErr = await gl.resolveVoice(lang).catch((e: unknown) => e);
    expect((vErr as Error).name).toBe('AudioUnavailable');
    expect(await audioRowCount(store)).toBe(0);
    expect(await gl.runJobs()).toBe(0);
  });

  it('with allowFixture the fixture is registered, is not speech, and availability says so', async () => {
    const { store, gl } = await makeEnv({ allowFixture: true });
    await addStory(store, lang);
    const fixture = gl.providers().find((p) => p.id === 'fixture')!;
    expect(fixture).toBeInstanceOf(FixtureTtsProvider);
    expect(fixture.isSpeech).toBe(false);
    expect(await gl.availability()).toMatchObject({ available: true, reason: 'development-fixture' });
    const r = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(r.manifest.complete).toBe(true);
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    expect((await gl.getAsset(seg.assetId!))!.isSpeech).toBe(false);
    const voice = (await store.voices.get(seg.voiceConfigId))!;
    expect(voice).toMatchObject({ isSpeech: false, reviewStatus: 'unreviewed', providerId: 'fixture' });
  });
});

describe('availability details', () => {
  it('a real provider without credentials is unavailable with its reason, and gates ensureAudio', async () => {
    const azure = new AzureSpeechProvider({ key: '', region: '' });
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [azure] });
    await addStory(store, 'es');
    expect(await gl.availability()).toMatchObject({ available: false, reason: 'missing-credentials' });
    const st = await gl.audioStatus(tid('es'));
    expect(st.state).toBe('unavailable');
    expect(st.reason).toMatch(/credentials/);
    const err = await gl.ensureAudio(tid('es')).catch((e: unknown) => e);
    expect((err as Error).name).toBe('AudioUnavailable');
    expect((err as { reason?: string }).reason).toBe('missing-credentials');
    expect(await audioRowCount(store)).toBe(0);
  });

  it('a real provider with credentials is available (configured, not verified) and real providers win over the fixture', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: true, providers: [fake] });
    await addStory(store, 'de');
    expect(await gl.availability()).toEqual({ available: true, detail: 'fake-speech' });
    const voice = await gl.resolveVoice('de');
    expect(voice.providerId).toBe('fake-speech'); // automatic choice: usable real provider before the fixture
    expect(voice).toMatchObject({ isSpeech: true, reviewStatus: 'unreviewed', providerVersion: '1' });
    expect(await store.voices.count()).toBe(1);
  });

  it('non-speech providers other than the fixture are also unusable unless fixtures are allowed', async () => {
    const tone = new FakeSpeechProvider();
    const nonSpeech = { ...tone, id: 'tone', isSpeech: false, availability: tone.availability.bind(tone), capabilities: tone.capabilities.bind(tone), listVoices: tone.listVoices.bind(tone), synthesize: tone.synthesize.bind(tone), version: '1' };
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [nonSpeech] });
    await addStory(store, 'es');
    expect(await gl.availability()).toMatchObject({ available: false, reason: 'no-provider' });
    expect(((await gl.ensureAudio(tid('es')).catch((e: unknown) => e)) as Error).name).toBe('AudioUnavailable');
    gl.setAllowFixture(true);
    expect(await gl.availability()).toMatchObject({ available: true, reason: 'development-fixture' });
  });

  it('setAllowFixture and unregisterProvider change availability at runtime', async () => {
    const { store, gl } = await makeEnv({ allowFixture: false });
    await addStory(store, 'sq');
    expect((await gl.availability()).available).toBe(false);
    gl.setAllowFixture(true);
    expect(gl.allowFixture()).toBe(true);
    expect(gl.providers().map((p) => p.id)).toEqual(['fixture']);
    expect((await gl.ensureAudio(tid('sq'), { runNow: true })).manifest.complete).toBe(true);
    gl.setAllowFixture(false);
    expect((await gl.availability()).available).toBe(false);
    expect(((await gl.ensureAudio(tid('sq')).catch((e: unknown) => e)) as Error).name).toBe('AudioUnavailable');

    const fake = new FakeSpeechProvider();
    gl.registerProvider(fake);
    expect((await gl.availability()).available).toBe(true);
    gl.unregisterProvider('fake-speech');
    expect((await gl.availability()).available).toBe(false);
  });

  it('an unavailable provider reports availability without throwing even when it throws', async () => {
    const fake = new FakeSpeechProvider();
    fake.availability = () => Promise.reject(new Error('probe exploded'));
    const { gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    expect(await gl.availability()).toMatchObject({ available: false, reason: 'provider-error', detail: 'probe exploded' });
  });

  it('createGoListen without a store row for the text still never throws from audioStatus', async () => {
    const { store, bus, registry } = await makeEnv({ allowFixture: false });
    const gl = createGoListen({ store, bus, adapters: registry });
    const st = await gl.audioStatus('text:es:nope');
    expect(st.state).toBe('unavailable');
    expect(st.evidenceEligible).toBe(false);
  });
});
