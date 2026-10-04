// @vitest-environment jsdom
// Explicit feature-off behavior: no speech request, provider, remembered Azure key, queued audio resume, or testimony audio job.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURES, createMemoryStore } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import { rememberAzure, resetPrefsForTests } from '../../src/ui/prefs';

beforeEach(() => { resetPrefsForTests(); try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetPrefsForTests(); try { localStorage.clear(); } catch { /* jsdom */ } });

const STATUS = { configured: true, provider: 'azure-speech', providerVersion: 'azure-proxy@1' };
const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const fetchSpy = () => { const f = vi.fn(async () => reply(200, STATUS)); vi.stubGlobal('fetch', f); return f; };
const calls = (f: ReturnType<typeof fetchSpy>) => f.mock.calls.map((c) => String((c as unknown[])[0]));

describe('the shipped default', () => {
  it('has listening on', () => {
    expect(FEATURES.listen).toBe(true);
  });
});

describe('bootstrap with listening explicitly off', () => {
  it('performs no fetch to /api/speech/ (even with the proxy check left at its default) and registers no provider', async () => {
    const f = fetchSpy();
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, features: { listen: false } });
    await new Promise((res) => setTimeout(res, 20));
    expect(r.services.features.listen).toBe(false);
    expect(calls(f).filter((u) => u.includes('/api/speech/'))).toEqual([]);
    expect(r.services.golisten.providers()).toEqual([]);
    expect(r.services.golisten.allowFixture()).toBe(false);
    expect(await r.services.golisten.availability()).toMatchObject({ available: false });
    expect(await r.services.store.audioJobs.count()).toBe(0);
  });

  it('does not read a remembered Azure key, and never turns on the fixture for preview or the development preference', async () => {
    rememberAzure({ key: 'k-remembered', region: 'westeurope' });
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false, features: { listen: false } });
    expect(r.services.golisten.providers()).toEqual([]);
    expect(r.services.speech.azure()).toEqual({ configured: false, remembered: false });
    const { setPref } = await import('../../src/ui/prefs');
    setPref('preview', true);
    setPref('devFixtureAudio', true);
    expect(r.services.golisten.allowFixture()).toBe(false);
  });

  it('the speech controls are inert: nothing is registered, remembered or requested', async () => {
    const f = fetchSpy();
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, features: { listen: false } });
    await r.services.speech.configureAzure({ key: 'k-1', region: 'r-1', remember: true });
    expect(r.services.golisten.providers()).toEqual([]);
    expect(JSON.stringify({ ...localStorage })).not.toContain('k-1');
    expect(await r.services.speech.proxy?.()).toBeUndefined();
    expect(await r.services.speech.recheck?.()).toBeUndefined();
    expect(calls(f).filter((u) => u.includes('/api/speech/'))).toEqual([]);
  });

  it('saving a testimony version queues no audio job and writes no audio row', async () => {
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false, features: { listen: false } });
    const user = r.user!;
    const testimony = await r.services.gotell.getOrCreateTestimony(user.id, 'es');
    await r.services.gotell.acceptRevision(testimony.id, 'Yo creo en Dios.');
    await r.services.golearn.settled();
    expect(await r.services.store.revisions.count()).toBe(1);
    expect(await r.services.store.audioJobs.count()).toBe(0);
    expect(await r.services.store.audioSegments.count()).toBe(0);
    expect(await r.services.store.manifests.count()).toBe(0);
  });

  it('(contrast) the same save with listening opted in and the fixture allowed does queue audio, so the test above can fail', async () => {
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false, features: { listen: true }, allowFixture: true });
    const testimony = await r.services.gotell.getOrCreateTestimony(r.user!.id, 'es');
    await r.services.gotell.acceptRevision(testimony.id, 'Yo creo en Dios.');
    expect(await r.services.store.audioSegments.count()).toBeGreaterThan(0);
  });

  it('GoLearn is told listening is off: no listening recommendation and no listening signal', async () => {
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false, features: { listen: false } });
    const sr = await r.services.golearn.stageReadiness(r.user!.id, 'honduras-es');
    expect(sr.signals.map((s) => s.key)).not.toContain('listening');
    const recs = await r.services.golearn.recommend(r.user!.id, { includeUnpublished: true });
    expect(recs.map((x) => x.reason)).not.toContain('listen-to-read-text');
  });
});

describe('bootstrap with listening on', () => {
  it('with the defaults makes no request to /api/speech/* (no proxy is configured) and reads no stored key', async () => {
    const f = fetchSpy();
    rememberAzure({ key: 'k-remembered', region: 'westeurope' });
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, features: { listen: true } });
    await new Promise((res) => setTimeout(res, 20));
    expect(calls(f).filter((u) => u.includes('/api/speech/'))).toEqual([]);
    expect(r.services.features.listen).toBe(true);
    expect(await r.services.speech.proxy?.()).toBeUndefined();
    expect(r.services.speech.azure().configured).toBe(false); // the direct-key option is off, so the stored key is not used
    expect(r.services.golisten.providers()).toEqual([]);
  });

  it('checks the speech service when a proxy is configured, and reads a stored key only with the direct-key option on', async () => {
    const f = fetchSpy();
    const { setPref } = await import('../../src/ui/prefs');
    setPref('azureDirectKey', true);
    rememberAzure({ key: 'k-remembered', region: 'westeurope' });
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: {}, features: { listen: true } });
    await new Promise((res) => setTimeout(res, 20));
    expect(calls(f).some((u) => u.includes('/api/speech/'))).toBe(true);
    expect(r.services.speech.azure().configured).toBe(true);
  });

  it('the build flag VITE_SPEECH_PROXY=1 configures the proxy check', async () => {
    const f = fetchSpy();
    vi.stubEnv('VITE_SPEECH_PROXY', '1');
    try {
      await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, features: { listen: true } });
      await new Promise((res) => setTimeout(res, 20));
      expect(calls(f).some((u) => u.includes('/api/speech/'))).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });

  it('a voice review change invalidates GoLearn\'s listening state; with listening off nothing is wired', async () => {
    const voice = { id: 'v:1', lang: 'es' as const, providerId: 'x', voiceId: 'x', requestedLocale: 'es', actualLocale: 'es', approved: false, reviewStatus: 'unreviewed' as const, isSpeech: true };
    const on = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false, features: { listen: true } });
    const spy = vi.spyOn(on.services.golearn, 'invalidateListening');
    await on.services.store.voices.put(voice);
    await on.services.golisten.setVoiceReview('v:1', 'reviewed');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(undefined);

    const off = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false, features: { listen: false } });
    const offSpy = vi.spyOn(off.services.golearn, 'invalidateListening');
    await off.services.store.voices.put(voice);
    await off.services.golisten.setVoiceReview('v:1', 'reviewed');
    expect(offSpy).not.toHaveBeenCalled();
  });

  it('speechProxy: false makes no request even when the proxy is configured at build time', async () => {
    const f = fetchSpy();
    vi.stubEnv('VITE_SPEECH_PROXY', '1');
    await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false, features: { listen: true } });
    await new Promise((res) => setTimeout(res, 20));
    expect(calls(f).filter((u) => u.includes('/api/speech/'))).toEqual([]);
  });
});
