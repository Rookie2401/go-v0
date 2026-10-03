import { describe, expect, it } from 'vitest';
import { hash, ids, type LanguageCode } from '../../src/core';
import { createGoListen } from '../../src/golisten';
import { FakeSpeechProvider, FlakyProvider, LANGS, STORY, addStory, makeEnv, replaceSentence } from './support';

const tid = (lang: LanguageCode, slug = 'story-01') => ids.text(lang, slug);

/** A second service over the SAME store (a new session): same voices, segments and manifests. */
function sibling(env: Awaited<ReturnType<typeof makeEnv>>, deps: Partial<Parameters<typeof createGoListen>[0]> = {}) {
  return createGoListen({ store: env.store, bus: env.bus, adapters: env.registry, clock: env.clock.clock, ...deps });
}

describe.each(LANGS)('audioStatus state machine (%s)', (lang) => {
  it('not-generated -> generating -> preview-only -> ready (only after a person reviews a real voice)', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    await addStory(store, lang);

    const s0 = await gl.audioStatus(tid(lang));
    expect(s0).toMatchObject({ state: 'not-generated', isSpeech: true, evidenceEligible: false, readySegments: 0, totalSegments: 3, providerId: 'fake-speech', voiceReview: 'unreviewed' });
    expect(s0.reason).toMatch(/No audio has been generated/);
    expect(await store.manifests.count()).toBe(0); // status never writes

    await gl.ensureAudio(tid(lang)); // queued, not run
    const s1 = await gl.audioStatus(tid(lang));
    expect(s1).toMatchObject({ state: 'generating', readySegments: 0, totalSegments: 3, failedSegments: 0, evidenceEligible: false });
    expect(s1.reason).toMatch(/Generating audio: 0 of 3/);

    await gl.runJobs({ max: 2 });
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'generating', readySegments: 2 });
    await gl.runJobs();

    const s2 = await gl.audioStatus(tid(lang));
    expect(s2).toMatchObject({ state: 'preview-only', readySegments: 3, isSpeech: true, evidenceEligible: false, voiceReview: 'unreviewed', audioContentVersion: 1, textContentVersion: 1 });
    expect(s2.reason).toMatch(/has not been auditioned/);
    expect(s2.reason).toMatch(/earns no listening evidence/);

    const voiceId = (await gl.getManifest(tid(lang)))!.voiceConfigId;
    await gl.setVoiceReview(voiceId, 'in-review');
    expect((await gl.audioStatus(tid(lang))).state).toBe('preview-only');
    await gl.setVoiceReview(voiceId, 'rejected', 'robotic');
    const rejected = await gl.audioStatus(tid(lang));
    expect(rejected.state).toBe('preview-only');
    expect(rejected.reason).toMatch(/rejected/);
    expect(rejected.evidenceEligible).toBe(false);

    await gl.setVoiceReview(voiceId, 'reviewed', 'listened to every sentence');
    const ready = await gl.audioStatus(tid(lang));
    expect(ready).toMatchObject({ state: 'ready', evidenceEligible: true, voiceReview: 'reviewed', isSpeech: true, failedSegments: 0 });
    expect(ready.reason).toBeUndefined();
    await gl.setVoiceReview(voiceId, 'approved');
    expect((await gl.audioStatus(tid(lang))).evidenceEligible).toBe(true);
    await gl.setVoiceReview(voiceId, 'unreviewed');
    expect((await gl.audioStatus(tid(lang))).evidenceEligible).toBe(false);
  });

  it('fixture audio is preview-only forever: not speech, and a "reviewed" mark cannot make it evidence', async () => {
    const { store, gl } = await makeEnv({ allowFixture: true });
    await addStory(store, lang);
    await gl.ensureAudio(tid(lang), { runNow: true });
    const st = await gl.audioStatus(tid(lang));
    expect(st).toMatchObject({ state: 'preview-only', isSpeech: false, evidenceEligible: false, providerId: 'fixture' });
    expect(st.reason).toMatch(/not speech/i);
    expect(st.reason).toMatch(/Turn on preview/);
    expect((await gl.audioStatus(tid(lang), { preview: true })).reason).not.toMatch(/Turn on preview/);

    const voice = await gl.setVoiceReview((await gl.getManifest(tid(lang)))!.voiceConfigId, 'reviewed');
    expect(voice).toMatchObject({ reviewStatus: 'reviewed', approved: false, isSpeech: false });
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'preview-only', evidenceEligible: false, isSpeech: false });
  });

  it('stale when the text moved to a newer content version; regenerating reuses every unchanged sentence', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    await addStory(store, lang);
    await gl.ensureAudio(tid(lang), { runNow: true });
    await gl.setVoiceReview((await gl.getManifest(tid(lang)))!.voiceConfigId, 'reviewed');
    expect((await gl.audioStatus(tid(lang))).state).toBe('ready');

    const t = (await store.texts.get(tid(lang)))!;
    await store.texts.put({ ...t, contentVersion: 2 });
    const stale = await gl.audioStatus(tid(lang));
    expect(stale).toMatchObject({ state: 'stale', audioContentVersion: 1, textContentVersion: 2, evidenceEligible: false });
    expect(stale.reason).toMatch(/version 1/);
    expect(stale.reason).toMatch(/now version 2/);

    const calls = fake.calls.length;
    const again = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(again).toMatchObject({ created: 0, reused: 3 });
    expect(fake.calls.length).toBe(calls);
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'ready', audioContentVersion: 2, textContentVersion: 2, evidenceEligible: true });
  });

  it('an edited sentence invalidates only itself (new sentence key, old one retired)', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    await addStory(store, lang);
    const before = await gl.ensureAudio(tid(lang), { runNow: true });
    await gl.setVoiceReview(before.manifest.voiceConfigId, 'reviewed');
    const calls = fake.calls.length;
    const edited = STORY[lang][1].tokens.map((t) => t.surface).join(lang === 'th' ? '' : ' ') + (lang === 'th' ? 'สวัสดี' : ' hola');

    await replaceSentence(store, tid(lang), 1, edited);
    const stale = await gl.audioStatus(tid(lang));
    expect(stale.state).toBe('stale'); // version moved
    const live = (await store.sentences.where('textId', tid(lang))).filter((s) => s.retiredInVersion === undefined);
    expect(live).toHaveLength(3);
    expect((await store.sentences.where('textId', tid(lang))).filter((s) => s.retiredInVersion !== undefined)).toHaveLength(1);

    const after = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(after).toMatchObject({ created: 1, reused: 2, failed: 0 });
    expect(fake.calls.length).toBe(calls + 1);
    expect(after.manifest.segmentIds).toHaveLength(3); // the retired sentence is not voiced
    expect(after.manifest.segmentIds[0]).toBe(before.manifest.segmentIds[0]);
    expect(after.manifest.segmentIds[2]).toBe(before.manifest.segmentIds[2]);
    expect(after.manifest.segmentIds[1]).not.toBe(before.manifest.segmentIds[1]);
    expect(after.manifest.complete).toBe(true);
    const newSeg = (await gl.getSegment(after.manifest.segmentIds[1]))!;
    expect(newSeg.displayText).toBe(edited);
    expect(newSeg.sentenceIds).toEqual([ids.sentence(tid(lang), ids.sentenceKey(edited))]);
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'ready', readySegments: 3, totalSegments: 3, evidenceEligible: true });
  });

  it('even without a version bump, an in-place release edit invalidates every old binding until reauthorized', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    await addStory(store, lang);
    await gl.ensureAudio(tid(lang), { runNow: true });
    const s1 = (await store.sentences.get(ids.sentence(tid(lang), 1)))!;
    const changed = s1.text + (lang === 'th' ? 'สวัสดี' : ' hola');
    await store.sentences.put({ ...s1, text: changed, textHash: hash(changed) }); // edited in place, contentVersion untouched
    const st = await gl.audioStatus(tid(lang));
    expect(st).toMatchObject({ state: 'not-generated', readySegments: 0, totalSegments: 3, playAllowed: false });
    const r = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(r).toMatchObject({ created: 1, reused: 2 });
    expect((await gl.audioStatus(tid(lang))).state).toBe('preview-only');
  });

  it('a voice change regenerates; the old voice audio is kept and comes back without synthesis', async () => {
    const a = new FakeSpeechProvider({ id: 'fake-a' });
    const b = new FakeSpeechProvider({ id: 'fake-b' });
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [a, b], defaultProviderId: 'fake-a' });
    await addStory(store, lang);
    const first = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'preview-only', providerId: 'fake-a' });

    gl.setDefaultProvider('fake-b');
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'not-generated', providerId: 'fake-b' });
    const second = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(second).toMatchObject({ created: 3, reused: 0 });
    expect(second.manifest.voiceConfigId).not.toBe(first.manifest.voiceConfigId);
    expect(b.calls).toHaveLength(3);
    expect(await gl.audioStatus(tid(lang))).toMatchObject({ state: 'preview-only', providerId: 'fake-b' });

    gl.setDefaultProvider('fake-a');
    expect(await gl.ensureAudio(tid(lang), { runNow: true })).toMatchObject({ created: 0, reused: 3 });
    expect(a.calls).toHaveLength(3);
    // an explicit voice can be inspected regardless of the default
    expect((await gl.audioStatus(tid(lang), { voiceConfigId: second.manifest.voiceConfigId })).providerId).toBe('fake-b');
  });

  it('a provider version change re-keys the audio and resets a voice review (nobody has heard the new audio)', async () => {
    const v1 = new FakeSpeechProvider({ version: '1' });
    const env = await makeEnv({ allowFixture: false, providers: [v1] });
    await addStory(env.store, lang);
    const r1 = await env.gl.ensureAudio(tid(lang), { runNow: true });
    await env.gl.setVoiceReview(r1.manifest.voiceConfigId, 'reviewed');
    expect((await env.gl.audioStatus(tid(lang))).evidenceEligible).toBe(true);

    const v2 = new FakeSpeechProvider({ version: '2' });
    env.gl.registerProvider(v2); // same id, new version
    expect((await env.gl.audioStatus(tid(lang))).state).toBe('not-generated'); // keys changed: no current audio
    const r2 = await env.gl.ensureAudio(tid(lang), { runNow: true });
    expect(r2).toMatchObject({ created: 3, reused: 0 });
    expect(v2.calls).toHaveLength(3);
    const voice = (await env.store.voices.get(r2.manifest.voiceConfigId))!;
    expect(voice).toMatchObject({ providerVersion: '2', reviewStatus: 'unreviewed', approved: false });
    expect(voice.qaNote).toMatch(/Provider version changed 1 -> 2/);
    expect(await env.gl.audioStatus(tid(lang))).toMatchObject({ state: 'preview-only', providerVersion: '2', evidenceEligible: false });
  });
});

describe('audioStatus: failures, retries and waiting', () => {
  it('shows the retry in progress, then failed with the provider error, then recovers after retryDead', async () => {
    const flaky = new FlakyProvider(2);
    const { store, gl, clock } = await makeEnv({ providers: [flaky], defaultProviderId: 'flaky', maxAttempts: 2, backoffBaseMs: 100 });
    await addStory(store, 'es');
    await gl.ensureAudio(tid('es'), { runNow: true });

    const retrying = await gl.audioStatus(tid('es'));
    expect(retrying.state).toBe('generating');
    expect(retrying.reason).toMatch(/3 sentences are being retried after an error \(flaky failure #1\)/);
    const d1 = await gl.diagnostics(tid('es'));
    expect(d1.failedJobs).toBe(3);
    expect(d1.segments.every((s) => s.jobStatus === 'failed' && s.attempts === 1 && s.maxAttempts === 2 && !!s.nextAttemptAt && /flaky failure #1/.test(s.lastError ?? ''))).toBe(true);

    clock.advance(100);
    await gl.runJobs(); // attempt 2 fails -> dead
    const failed = await gl.audioStatus(tid('es'));
    expect(failed).toMatchObject({ state: 'failed', failedSegments: 3, readySegments: 0, evidenceEligible: false });
    expect(failed.reason).toMatch(/3 of 3 sentences could not be voiced: flaky failure #2/);
    const d2 = await gl.diagnostics(tid('es'));
    expect(d2.deadJobs).toBe(3);
    expect(d2.segments.every((s) => s.jobStatus === 'dead' && s.status === 'failed')).toBe(true);

    expect(await gl.retryDead()).toBe(3);
    expect((await gl.audioStatus(tid('es'))).state).toBe('generating');
    await gl.runJobs();
    expect((await gl.audioStatus(tid('es'))).state).toBe('preview-only'); // fixture-class provider: preview-only, never ready
  });

  it('jobs wait (consume no attempt) while the provider is unavailable, and the status says so', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    await addStory(store, 'de');
    await gl.ensureAudio(tid('de')); // queued while available
    fake.state = { available: false, reason: 'missing-credentials', detail: 'key removed' };
    expect(await gl.runJobs()).toBe(0);
    expect(fake.calls).toHaveLength(0);
    expect((await gl.jobs()).every((j) => j.status === 'queued' && j.attempts === 0)).toBe(true);
    const st = await gl.audioStatus(tid('de'));
    expect(st.state).toBe('unavailable');
    expect(st.reason).toMatch(/waiting for the speech provider/);
    expect(st.reason).toMatch(/key removed/);
    fake.state = { available: true };
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.audioStatus(tid('de'))).state).toBe('preview-only');
  });

  it('failed segments win over waiting ones: the status names the error, not just "waiting"', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [fake], maxAttempts: 1 });
    await addStory(store, 'hi');
    await gl.ensureAudio(tid('hi'));
    const job = (await gl.jobs())[0];
    await store.audioJobs.put({ ...job, status: 'dead', attempts: 1, lastError: 'server: boom' });
    await store.audioSegments.put({ ...(await store.audioSegments.get(job.segmentId))!, status: 'failed' });
    fake.state = { available: false, reason: 'offline' };
    const st = await gl.audioStatus(tid('hi'));
    expect(st.state).toBe('failed');
    expect(st.reason).toMatch(/server: boom/);
    expect(st.reason).toMatch(/offline/);
  });
});

describe('audioStatus across sessions (stored audio vs what is configured now)', () => {
  it('fixture audio left in the store is unavailable (not shown as audio) while fixtures are off, and preview-only once they are on', async () => {
    const env = await makeEnv({ allowFixture: true });
    await addStory(env.store, 'th');
    await env.gl.ensureAudio(tid('th'), { runNow: true });
    const next = sibling(env, { allowFixture: false });
    const off = await next.audioStatus(tid('th'));
    expect(off.state).toBe('unavailable');
    expect(off.reason).toMatch(/development fixture audio/);
    expect(off.reason).toMatch(/no speech provider/);
    expect(off.evidenceEligible).toBe(false);
    expect(((await next.ensureAudio(tid('th')).catch((e: unknown) => e)) as Error).name).toBe('AudioUnavailable');
    expect(await env.store.audioSegments.count()).toBe(3); // nothing was deleted
    next.setAllowFixture(true);
    expect((await next.audioStatus(tid('th'))).state).toBe('preview-only');
  });

  it('reviewed real-speech audio stays ready when the provider is not configured this session', async () => {
    const fake = new FakeSpeechProvider();
    const env = await makeEnv({ allowFixture: false, providers: [fake] });
    await addStory(env.store, 'sq');
    const r = await env.gl.ensureAudio(tid('sq'), { runNow: true });
    await env.gl.setVoiceReview(r.manifest.voiceConfigId, 'reviewed');
    const next = sibling(env, { allowFixture: false }); // no providers at all
    expect(await next.availability()).toMatchObject({ available: false, reason: 'no-provider' });
    expect(await next.audioStatus(tid('sq'))).toMatchObject({ state: 'ready', evidenceEligible: true });
    expect(((await next.ensureAudio(tid('sq')).catch((e: unknown) => e)) as Error).name).toBe('AudioUnavailable'); // generating more needs a provider
  });
});

describe('testimony revisions and text-less segments', () => {
  it('audio for a revision is generated for the exact text of revision.textId and reported like any text', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    const { buildFixtureText } = await import('../../src/core');
    await buildFixtureText(store, { lang: 'es', slug: 'testimony-r1', kind: 'testimony', corpusId: 'tst-es', sentences: [STORY.es[1], STORY.es[2]] });
    const id = tid('es', 'testimony-r1');
    const r = await gl.ensureAudio(id, { runNow: true });
    expect(r.manifest.complete).toBe(true);
    expect((await Promise.all(r.manifest.segmentIds.map((s) => gl.getSegment(s)))).map((s) => s!.displayText)).toEqual(['Dios me perdonó.', 'Entiendo mi corazón.']);
    await gl.setVoiceReview(r.manifest.voiceConfigId, 'reviewed');
    expect(await gl.audioStatus(id)).toMatchObject({ state: 'ready', totalSegments: 2, evidenceEligible: true });
  });

  it('ensureSentenceAudio records voice and asset honesty on text-less segments', async () => {
    const fake = new FakeSpeechProvider();
    const { store, gl } = await makeEnv({ allowFixture: true, providers: [fake], defaultProviderId: 'fake-speech' });
    const seg = await gl.ensureSentenceAudio({ lang: 'de', text: 'Ich glaube an Gott.', ownerId: 'u1', contextId: 'tst:u1:de/r1/s0', runNow: true });
    const asset = (await gl.getAsset(seg.assetId!))!;
    expect(asset.isSpeech).toBe(true);
    expect(asset.generation!.softwareVersion).toMatch(/fake-speech@1/);
    expect(await store.voices.get(seg.voiceConfigId)).toMatchObject({ isSpeech: true, reviewStatus: 'unreviewed', providerVersion: '1' });
  });
});

describe('setVoiceReview', () => {
  it('records the decision, keeps a dated note, mirrors `approved`, and rejects unknown voices', async () => {
    const fake = new FakeSpeechProvider();
    const { gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    const voice = await gl.resolveVoice('hi');
    expect(voice).toMatchObject({ reviewStatus: 'unreviewed', approved: false });
    const reviewed = await gl.setVoiceReview(voice.id, 'reviewed', 'Auditioned the QA set; danda pauses are right.');
    expect(reviewed).toMatchObject({ reviewStatus: 'reviewed', approved: true });
    expect(reviewed.qaNote).toMatch(/Review reviewed on 2026-02-01: Auditioned the QA set/);
    expect((await gl.resolveVoice('hi')).reviewStatus).toBe('reviewed'); // survives re-resolution
    const rejected = await gl.setVoiceReview(voice.id, 'rejected', 'rushed');
    expect(rejected).toMatchObject({ reviewStatus: 'rejected', approved: false });
    expect(rejected.qaNote).toMatch(/reviewed on 2026-02-01.*Review rejected/);
    await expect(gl.setVoiceReview('nope', 'reviewed')).rejects.toThrow(/not found/);
  });
});

describe('diagnostics', () => {
  it('exposes provider, version, review, speech flag, job state and locale per segment', async () => {
    const fake = new FakeSpeechProvider({ version: '7' });
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [fake] });
    await addStory(store, 'es');
    const r = await gl.ensureAudio(tid('es'), { runNow: true });
    await gl.setVoiceReview(r.manifest.voiceConfigId, 'reviewed');
    const d = await gl.diagnostics(tid('es'));
    expect(d.segments).toHaveLength(3);
    for (const s of d.segments) {
      expect(s).toMatchObject({ providerId: 'fake-speech', providerVersion: '7', voiceReview: 'reviewed', isSpeech: true, jobStatus: 'succeeded', attempts: 1, requestedLocale: 'es-HN', actualLocale: 'es-419' });
    }
  });
});
