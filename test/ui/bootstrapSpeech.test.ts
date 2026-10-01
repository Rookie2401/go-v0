// @vitest-environment jsdom
/**
 * Bootstrap wires the app's own speech service (ProxySpeechProvider, same-origin /api/speech/*) without ever touching a
 * key: it registers the provider when the service says it is configured (or says it exists but has no key), reports the
 * status to Settings, never blocks or fails startup when there is no server, and binds the importer's version history.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import { resetPrefsForTests } from '../../src/ui/prefs';

beforeEach(() => { resetPrefsForTests(); localStorage.clear(); });
afterEach(() => { resetPrefsForTests(); localStorage.clear(); });

const reply = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no json'); return body; } }) as unknown as Response;
const STATUS = { configured: true, provider: 'azure', providerVersion: 'azure-neural@2026-09', region: 'westeurope' };
const opts = (fetchImpl: typeof fetch) => ({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: { fetch: fetchImpl }, features: { listen: true } });
const ids = (r: Awaited<ReturnType<typeof bootstrap>>) => r.services.golisten.providers().map((p) => p.id);

describe('bootstrap: the app\'s own speech service', () => {
  it('configured: asks /api/speech/status, registers the provider, and sends no credential of any kind', async () => {
    const fetchMock = vi.fn(async () => reply(200, STATUS));
    const r = await bootstrap(opts(fetchMock as unknown as typeof fetch));
    const status = await r.services.speech.proxy!();
    expect(status).toMatchObject({ available: true });
    expect(ids(r)).toContain('speech-proxy');
    expect((await r.services.golisten.availability()).available).toBe(true);
    for (const call of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(call[0]).toBe('/api/speech/status'); // the only request the app makes without a learner's text to speak
      expect(JSON.stringify(call[1])).not.toMatch(/key|authorization|ocp-apim/i);
    }
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/westeurope|speech-azure|azure/i); // nothing stored for this path
    expect(r.services.speech.azure().configured).toBe(false); // the direct-key path is untouched
  });

  it('unconfigured: reports the exact instruction, and audio stays honestly unavailable', async () => {
    const fetchMock = vi.fn(async () => reply(200, { ...STATUS, configured: false, region: undefined }));
    const r = await bootstrap(opts(fetchMock as unknown as typeof fetch));
    const status = await r.services.speech.proxy!();
    expect(status).toMatchObject({ available: false, reason: 'missing-credentials' });
    expect(status!.detail).toBe('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.');
    const a = await r.services.golisten.availability();
    expect(a.available).toBe(false);
    expect(a.reason).toBe('missing-credentials');
  });

  it('no proxy on this host (static hosting): not registered, startup unaffected, and the status says so', async () => {
    const r = await bootstrap(opts((async () => reply(404)) as unknown as typeof fetch));
    const status = await r.services.speech.proxy!();
    expect(status).toMatchObject({ available: false, reason: 'no-provider' });
    expect(ids(r)).not.toContain('speech-proxy');
    expect(r.user).not.toBeNull();
  });

  it('an unreachable service never fails or blocks startup: provider-error, not registered', async () => {
    const r = await bootstrap(opts((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch));
    const status = await r.services.speech.proxy!();
    expect(status).toMatchObject({ available: false, reason: expect.stringMatching(/provider-error|offline/) });
    expect(ids(r)).not.toContain('speech-proxy');
    expect(r.user).not.toBeNull();
  });

  it('speechProxy: false makes no request and reports no service', async () => {
    const fetchMock = vi.fn(async () => reply(200, STATUS));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', skipCorpus: true, speechProxy: false });
      expect(await r.services.speech.proxy!()).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(ids(r)).not.toContain('speech-proxy');
    } finally { vi.unstubAllGlobals(); }
  });

  it('"Check again" after .env.local was fixed: asks again and registers the working provider', async () => {
    let configured = false;
    const fetchMock = vi.fn(async () => reply(200, { ...STATUS, configured }));
    const r = await bootstrap(opts(fetchMock as unknown as typeof fetch));
    expect(await r.services.speech.proxy!()).toMatchObject({ reason: 'missing-credentials' });
    configured = true;
    const again = await r.services.speech.recheck!();
    expect(again).toMatchObject({ available: true });
    expect(await r.services.speech.proxy!()).toMatchObject({ available: true }); // Settings reads the fresh answer
    expect(ids(r)).toContain('speech-proxy');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('bootstrap: the importer\'s content-version history reaches the UI', () => {
  it('ingest.history is bound to contentHistory: one entry per version, oldest first', async () => {
    const r = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', speechProxy: false });
    const text = (await r.services.store.texts.all())[0];
    const history = r.services.ingest.history!(text);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history.at(-1)!.version).toBe(text.contentVersion);
    expect(history[0]).toEqual({ version: expect.any(Number), at: expect.any(String), summary: expect.any(String) });
  });
});
