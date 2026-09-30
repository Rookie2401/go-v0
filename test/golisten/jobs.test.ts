import { describe, expect, it } from 'vitest';
import { ids, type AppStore } from '../../src/core';
import { BadAudioProvider, FallbackLocaleProvider, FlakyProvider, addStory, makeEnv } from './support';

const tid = (lang: Parameters<typeof ids.text>[0], slug = 'story-01') => ids.text(lang, slug);

async function assertReadyImpliesAsset(store: AppStore) {
  for (const s of await store.audioSegments.all()) {
    if (s.status === 'ready') {
      expect(s.assetId).toBeTruthy();
      expect(await store.assets.has(s.assetId!)).toBe(true);
      expect((await store.audioAssets.get(s.assetId!))!.validation?.ok).toBe(true);
    } else expect(s.assetId).toBeUndefined();
  }
}

describe('job runner: retries, backoff, dead state', () => {
  it('a flaky provider retries with exponential backoff, then succeeds without duplicate assets', async () => {
    const flaky = new FlakyProvider(2);
    const { store, gl, clock } = await makeEnv({ providers: [flaky], defaultProviderId: 'flaky' });
    await addStory(store, 'es');

    const r = await gl.ensureAudio(tid('es'), { runNow: true });
    expect(r).toMatchObject({ created: 3, failed: 3 });
    expect(r.manifest.complete).toBe(false);
    expect(await store.audioAssets.count()).toBe(0);
    const failed = await gl.jobs('failed');
    expect(failed).toHaveLength(3);
    for (const j of failed) {
      expect(j.attempts).toBe(1);
      expect(j.lastError).toMatch(/flaky failure #1/);
      expect(Date.parse(j.nextAttemptAt!) - Date.parse(clock.now())).toBe(1000); // base backoff
    }
    await assertReadyImpliesAsset(store);

    expect(await gl.runJobs()).toBe(0); // backoff not elapsed
    clock.advance(1000);
    expect(await gl.runJobs()).toBe(3); // attempt 2 fails
    const second = await gl.jobs('failed');
    expect(second.every((j) => j.attempts === 2 && Date.parse(j.nextAttemptAt!) - Date.parse(clock.now()) === 2000)).toBe(true); // doubled
    clock.advance(1999);
    expect(await gl.runJobs()).toBe(0);
    clock.advance(1);
    expect(await gl.runJobs()).toBe(3); // attempt 3 succeeds

    expect(flaky.calls).toHaveLength(9);
    expect(await gl.jobs('succeeded')).toHaveLength(3);
    expect(await store.audioAssets.count()).toBe(3); // no duplicates from the retries
    const manifest = (await gl.getManifest(tid('es')))!;
    expect(manifest.complete).toBe(true);
    for (const j of await gl.jobs()) {
      expect(j.attempts).toBe(3);
      expect(j.lastError).toBeUndefined();
      expect(j.log.some((l) => /flaky failure #2/.test(l.message))).toBe(true);
      expect(j.log.some((l) => /succeeded/.test(l.message))).toBe(true);
    }
    const d = await gl.diagnostics(tid('es'));
    expect(d).toMatchObject({ failedJobs: 0, deadJobs: 0 });
    await assertReadyImpliesAsset(store);
  });

  it('goes dead after maxAttempts (4), marks the segment failed, stops retrying, and can be re-queued deliberately', async () => {
    const flaky = new FlakyProvider(4); // attempts 1..4 fail, the 5th would work
    const { store, gl, clock } = await makeEnv({ providers: [flaky], defaultProviderId: 'flaky' });
    await addStory(store, 'de');
    await gl.ensureAudio(tid('de'), { runNow: true });
    for (let i = 0; i < 3; i++) { clock.advance(10 * 60 * 1000); await gl.runJobs(); }

    const dead = await gl.jobs('dead');
    expect(dead).toHaveLength(3);
    for (const j of dead) {
      expect(j.attempts).toBe(4);
      expect(j.lastError).toMatch(/flaky failure #4/);
      expect(j.nextAttemptAt).toBeUndefined();
      expect(j.log.some((l) => /dead after 4 attempts/.test(l.message))).toBe(true);
    }
    for (const s of await store.audioSegments.all()) { expect(s.status).toBe('failed'); expect(s.assetId).toBeUndefined(); }
    expect(await store.audioAssets.count()).toBe(0);
    const d = await gl.diagnostics(tid('de'));
    expect(d.deadJobs).toBe(3);
    expect(d.failedJobs).toBe(0);
    expect(d.segments.every((s) => s.status === 'failed' && /flaky failure #4/.test(s.lastError ?? ''))).toBe(true);
    expect((await gl.getManifest(tid('de')))!.complete).toBe(false);

    const calls = flaky.calls.length;
    clock.advance(24 * 3600 * 1000);
    expect(await gl.runJobs()).toBe(0); // dead stays dead
    expect(flaky.calls.length).toBe(calls);
    const again = await gl.ensureAudio(tid('de'), { runNow: true });
    expect(again).toMatchObject({ failed: 3, reused: 0 }); // idempotent: does not silently resurrect dead work
    expect(flaky.calls.length).toBe(calls);

    expect(await gl.retryDead()).toBe(3);
    expect(await gl.runJobs()).toBe(3);
    expect((await gl.getManifest(tid('de')))!.complete).toBe(true);
    expect(await store.audioAssets.count()).toBe(3);
    await assertReadyImpliesAsset(store);
  });

  it('runJobs honours max, skips dead/succeeded jobs, and recovers a stale running job', async () => {
    const { store, gl, clock } = await makeEnv();
    await addStory(store, 'sq');
    await gl.ensureAudio(tid('sq'));
    expect(await gl.runJobs({ max: 2 })).toBe(2);
    expect(await gl.jobs('succeeded')).toHaveLength(2);
    expect(await gl.jobs('queued')).toHaveLength(1);
    const [queued] = await gl.jobs('queued');
    await store.audioJobs.put({ ...queued, status: 'running', updatedAt: clock.now() }); // a crashed worker
    expect(await gl.runJobs()).toBe(0); // fresh running job is left alone
    clock.advance(61_000);
    expect(await gl.runJobs()).toBe(1);
    expect(await gl.jobs('succeeded')).toHaveLength(3);
    expect(await gl.runJobs()).toBe(0);
  });

  it('maxAttempts and backoff are configurable', async () => {
    const flaky = new FlakyProvider(99);
    const { store, gl, clock } = await makeEnv({ providers: [flaky], defaultProviderId: 'flaky', maxAttempts: 2, backoffBaseMs: 50 });
    await addStory(store, 'hi');
    await gl.ensureAudio(tid('hi'), { runNow: true });
    clock.advance(50);
    await gl.runJobs();
    expect(await gl.jobs('dead')).toHaveLength(3);
    expect((await gl.jobs())[0].maxAttempts).toBe(2);
  });
});

describe('validation gate: bad audio never becomes an asset or a ready segment', () => {
  const cases: Array<['silent' | 'empty' | 'garbage' | 'mp3' | 'lying-duration', RegExp]> = [
    ['silent', /silent/],
    ['empty', /empty/],
    ['garbage', /not-wav/],
    ['mp3', /unvalidatable-format: audio\/mpeg/],
    ['lying-duration', /declared-duration-mismatch/],
  ];
  it.each(cases)('rejects %s audio', async (mode, pattern) => {
    const { store, gl } = await makeEnv({ providers: [new BadAudioProvider(mode)], defaultProviderId: 'bad-audio' });
    await addStory(store, 'th');
    const r = await gl.ensureAudio(tid('th'), { runNow: true });
    expect(r.failed).toBe(3);
    expect(r.manifest.complete).toBe(false);
    expect(await store.audioAssets.count()).toBe(0);
    expect((await gl.jobs('failed')).every((j) => pattern.test(j.lastError ?? ''))).toBe(true);
    for (const s of await store.audioSegments.all()) { expect(s.status).toBe('pending'); expect(s.assetId).toBeUndefined(); }
    await assertReadyImpliesAsset(store);
  });

  it('keeps failing after retries (validation errors are retried, then dead) and never stores the bytes', async () => {
    const { store, gl, clock } = await makeEnv({ providers: [new BadAudioProvider('silent')], defaultProviderId: 'bad-audio' });
    await addStory(store, 'es');
    await gl.ensureAudio(tid('es'), { runNow: true });
    for (let i = 0; i < 3; i++) { clock.advance(10 * 60 * 1000); await gl.runJobs(); }
    expect(await gl.jobs('dead')).toHaveLength(3);
    expect(await store.audioAssets.count()).toBe(0);
    expect((await store.audioSegments.all()).every((s) => s.status === 'failed' && !s.assetId)).toBe(true);
  });
});

describe('locale honesty', () => {
  it('records the locale the provider actually delivered on the asset and the voice config', async () => {
    const { store, gl } = await makeEnv({ providers: [new FallbackLocaleProvider('es-ES')], defaultProviderId: 'fallback-locale' });
    await addStory(store, 'es');
    const voice = await gl.resolveVoice('es');
    expect(voice.requestedLocale).toBe('es-HN');
    expect(voice.actualLocale).toBe('es-419'); // what the voice list promised
    const r = await gl.ensureAudio(tid('es'), { runNow: true });
    expect(r.manifest.complete).toBe(true);
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    const asset = (await gl.getAsset(seg.assetId!))!;
    expect(asset.locale).toBe('es-ES'); // not the promised es-419
    const updated = (await store.voices.get(voice.id))!;
    expect(updated.requestedLocale).toBe('es-HN');
    expect(updated.actualLocale).toBe('es-ES');
    expect(updated.qaNote).toMatch(/es-ES/);
    expect((await gl.jobs()).some((j) => j.log.some((l) => /locale mismatch/.test(l.message)))).toBe(true);
    const d = await gl.diagnostics(tid('es'));
    expect(d.segments[0]).toMatchObject({ requestedLocale: 'es-HN', actualLocale: 'es-ES' });
    // the cache key follows the corrected locale: one honest regeneration, then stable
    expect(await gl.ensureAudio(tid('es'), { runNow: true })).toMatchObject({ created: 3, reused: 0 });
    expect(await gl.ensureAudio(tid('es'), { runNow: true })).toMatchObject({ created: 0, reused: 3 });
  });
});
