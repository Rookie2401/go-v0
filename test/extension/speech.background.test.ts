import { describe, it, expect, vi } from 'vitest';
import { createSpeechService, SPEECH_CONFIG_KEY, speechBase } from '../../packages/golearn-extension/src/background/speech';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import type { PrivacySettings } from '../../packages/golearn-extension/src/protocol';
import { REMOTE_SPEECH_CONSENT_OWNER_KEY } from '../../packages/golearn-extension/src/protocol';

const token = 'test-backend-token-12345678901234567890';
const req = { op: 'synthesize', requestId: 'r1', languageId: 'es', readerId: 'web-generic', kind: 'sentence', text: 'Buenos días.', voice: 'es-HN-KarlaNeural', locale: 'es-HN' };
function harness() {
  const area = createMemoryStorageArea();
  let settings: PrivacySettings = { keepSnippets: false, remoteSpeechConsent: true, externalProcessingConsent: false, localOnlySpeech: false };
  const bytes = new Uint8Array(48); bytes.set([82, 73, 70, 70]);
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(bytes, { headers: { 'content-type': 'audio/wav' } }));
  const service = createSpeechService({ area, settings: async () => settings, fetch: fetch as typeof globalThis.fetch, hasPermission: async () => true, extensionId: 'ext-id' });
  const configure = () => service.configure({ op: 'set', baseUrl: 'http://127.0.0.1:8791/api/speech', token, permittedSourceOrigins: ['https://my-content.example'] });
  return { area, service, fetch, configure, setSettings: (v: Partial<PrivacySettings>) => { settings = { ...settings, ...v }; } };
}
describe('authenticated speech background boundary', () => {
  it('restricts endpoint schemes and strips no embedded credentials', () => {
    expect(speechBase('http://remote.example/api/speech')).toBeUndefined();
    expect(speechBase('https://user:secret@example.com/api/speech')).toBeUndefined();
    expect(speechBase('https://example.com/api/speech?token=x')).toBeUndefined();
    expect(speechBase('http://127.0.0.1:8791/api/speech')).toBe('http://127.0.0.1:8791/api/speech');
  });
  it('holds token privately and forwards only permitted requested text', async () => {
    const h = harness(); expect((await h.configure()).ok).toBe(true);
    const configReply = await h.service.configure({ op: 'get' });
    expect(JSON.stringify(configReply)).not.toContain(token);
    const r = await h.service.handle(req, 'tab:0', 'https://my-content.example/read');
    expect(r.ok).toBe(true); expect(r.bytes).toHaveLength(48);
    const init = h.fetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${token}` });
    expect(JSON.parse(String(init?.body))).toMatchObject({ languageId: req.languageId, text: req.text, sourcePermission: 'allowed', kind: 'sentence' });
    expect(JSON.stringify(r)).not.toContain(token);
    expect((await h.area.get(SPEECH_CONFIG_KEY))[SPEECH_CONFIG_KEY]).toBeTruthy();
  });
  it('refuses unknown rights, spoofed reader identities, and licensed Scripture even with owner overrides', async () => {
    const h = harness(); await h.configure();
    expect((await h.service.handle(req, 'a', 'https://other.example')).status).toBe(403);
    expect((await h.service.handle({ ...req, readerId: 'epub-local' }, 'a', 'https://my-content.example')).status).toBe(403);
    await h.service.configure({ op: 'set', baseUrl: 'http://127.0.0.1:8791/api/speech', token, permittedSourceOrigins: ['https://www.biblegateway.com'] });
    expect((await h.service.handle({ ...req, readerId: 'biblegateway' }, 'a', 'https://www.biblegateway.com/passage/')).status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('local-only preference overrides cloud consent', async () => {
    const h = harness(); await h.configure(); h.setSettings({ localOnlySpeech: true });
    expect((await h.service.handle(req, 'a', 'https://my-content.example')).status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('rechecks consent after backend permission lookup and before sending source text', async () => {
    const h = harness(); await h.configure();
    const settings: PrivacySettings = { keepSnippets: false, remoteSpeechConsent: true, externalProcessingConsent: false, localOnlySpeech: false };
    const service = createSpeechService({ area: h.area, settings: async () => settings, fetch: h.fetch,
      hasPermission: async () => { settings.remoteSpeechConsent = false; return true; } });
    expect((await service.handle(req, 'a', 'https://my-content.example')).status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('suppresses audio if permission is withdrawn during download', async () => {
    const h = harness(); await h.configure();
    h.fetch.mockImplementation(async () => { h.setSettings({ remoteSpeechConsent: false }); return new Response(new Uint8Array(48), { headers: { 'content-type': 'audio/wav' } }); });
    expect((await h.service.handle(req, 'a', 'https://my-content.example')).ok).toBe(false);
  });
  it('cancels requests even while asynchronous settings are loading', async () => {
    const h = harness(); await h.configure();
    const result = h.service.handle(req, 'a', 'https://my-content.example');
    await h.service.handle({ op: 'cancel', requestId: 'r1' }, 'a');
    expect((await result).ok).toBe(false);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('accepts only the exact GoReview review page for isolated words', async () => {
    const h = harness(); await h.configure();
    const review = { op: 'synthesize' as const, requestId: 'review:1', languageId: 'es', readerId: 'gopractice-review', kind: 'word' as const, text: 'hola', voice: 'es-HN-KarlaNeural', locale: 'es-HN', processingPermission: 'allowed' as const };
    const good = await h.service.handle(review, 'page', 'chrome-extension://ext-id/review/index.html');
    expect(good.ok).toBe(true);
    expect((await h.service.handle({ ...review, text: 'hola mundo' }, 'page', 'chrome-extension://ext-id/review/index.html')).status).toBe(400);
    expect((await h.service.handle({ ...review, kind: 'phrase' }, 'page', 'chrome-extension://ext-id/review/index.html')).status).toBe(400);
    expect((await h.service.handle(review, 'page', 'chrome-extension://ext-id/review/index.html?x=1')).status).toBe(403);
    expect((await h.service.handle(review, 'page', 'chrome-extension://other/review/index.html')).status).toBe(403);
  });
  it('uses the signed account Repository route when no private endpoint is configured', async () => {
    const h = harness();
    await h.area.set({ [REMOTE_SPEECH_CONSENT_OWNER_KEY]: 'account-1' });
    const accountToken = 'account-session-token-abcdefghijklmnopqrstuvwxyz';
    const service = createSpeechService({ area: h.area, settings: async () => ({ keepSnippets: false, remoteSpeechConsent: true, externalProcessingConsent: false, localOnlySpeech: false }),
      fetch: h.fetch as typeof globalThis.fetch, hasPermission: async () => true, extensionId: 'ext-id',
      account: async () => ({ baseUrl: 'https://repo.example/', token: accountToken, learnerId: 'account-1' }) });
    const shareWord = { ...req, requestId: 'share:1', readerId: 'golearn-share', kind: 'word' as const, text: 'hola', processingPermission: 'allowed' as const };
    const result = await service.handle(shareWord, 'page', 'chrome-extension://ext-id/app/index.html');
    expect(result.ok).toBe(true);
    expect(String(h.fetch.mock.calls[0]?.[0])).toBe('https://repo.example/api/speech/synthesize');
    expect((h.fetch.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${accountToken}` });
    expect(JSON.parse(String((h.fetch.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ languageId: 'es', kind: 'word', text: 'hola' });
    expect(JSON.stringify(result)).not.toContain(accountToken);
  });
  it('forwards a GoReview phrase candidate with its language id for the service material check', async () => {
    const h = harness();
    await h.area.set({ [REMOTE_SPEECH_CONSENT_OWNER_KEY]: 'account-1' });
    const accountToken = 'account-session-token-abcdefghijklmnopqrstuvwxyz';
    const service = createSpeechService({ area: h.area, settings: async () => ({ keepSnippets: false, remoteSpeechConsent: true, externalProcessingConsent: false, localOnlySpeech: false }),
      fetch: h.fetch as typeof globalThis.fetch, hasPermission: async () => true, extensionId: 'ext-id',
      account: async () => ({ baseUrl: 'https://repo.example', token: accountToken, learnerId: 'account-1' }) });
    const candidate = { ...req, requestId: 'review:phrase', readerId: 'gopractice-review', kind: 'phrase' as const, text: 'approved example', processingPermission: 'allowed' as const };
    const result = await service.handle(candidate, 'page', 'chrome-extension://ext-id/review/index.html');
    expect(result.ok).toBe(true);
    expect(JSON.parse(String((h.fetch.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ languageId: 'es', kind: 'phrase', text: 'approved example' });
  });
  it('share speech needs the explicit per-word permission and refuses passages', async () => {
    const h = harness();
    await h.area.set({ [REMOTE_SPEECH_CONSENT_OWNER_KEY]: 'account-1' });
    const service = createSpeechService({ area: h.area, settings: async () => ({ keepSnippets: false, remoteSpeechConsent: true, externalProcessingConsent: false, localOnlySpeech: false }),
      fetch: h.fetch as typeof globalThis.fetch, hasPermission: async () => true, extensionId: 'ext-id',
      account: async () => ({ baseUrl: 'https://repo.example', token, learnerId: 'account-1' }) });
    const base = { ...req, requestId: 'share:2', readerId: 'golearn-share', kind: 'word' as const, text: 'hola' };
    expect((await service.handle(base, 'page', 'chrome-extension://ext-id/app/index.html')).status).toBe(403);
    expect((await service.handle({ ...base, processingPermission: 'allowed', text: 'hola mundo' }, 'page', 'chrome-extension://ext-id/app/index.html')).status).toBe(400);
    expect((await service.handle({ ...base, processingPermission: 'allowed' }, 'page', 'chrome-extension://ext-id/app/index.html?redirect=x')).status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('does not substitute a Bokmål cloud voice for Nynorsk', async () => {
    const h = harness(); await h.configure();
    const result = await h.service.handle({ op: 'voices', requestId: 'nn:voices', languageId: 'nn' }, 'page');
    expect(result).toMatchObject({ ok: true, json: { voices: [] } });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('does not send to a signed-in account after consent was granted to another learner', async () => {
    const h = harness();
    await h.area.set({ [REMOTE_SPEECH_CONSENT_OWNER_KEY]: 'previous-learner' });
    const service = createSpeechService({ area: h.area, settings: async () => ({ keepSnippets: false, remoteSpeechConsent: true, externalProcessingConsent: false, localOnlySpeech: false }),
      fetch: h.fetch as typeof globalThis.fetch, hasPermission: async () => true, account: async () => ({ baseUrl: 'https://repo.example', token, learnerId: 'current-learner' }) });
    const result = await service.handle({ ...req, readerId: 'web-generic' }, 'page', 'https://my-content.example/read');
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
