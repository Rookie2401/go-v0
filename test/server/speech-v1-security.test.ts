import { describe, it, expect, vi } from 'vitest';
import { handleSpeechRequest, type SpeechRequest } from '../../server/speechHandler';
const wav = () => { const b = new Uint8Array(48); b.set([82,73,70,70]); b.set([87,65,86,69], 8); return b; };
const request = (token: string, patch: Record<string, unknown> = {}): SpeechRequest => ({ method: 'POST', path: '/api/speech/synthesize', headers: { host: '127.0.0.1:8791', authorization: `Bearer ${token}` }, body: JSON.stringify({ text: 'hola', kind: 'word', sourcePermission: 'allowed', voice: 'es-HN-CarlosNeural', locale: 'es-HN', ...patch }) });
describe('GoListen V1 backend security regression', () => {
  it('fails closed when the backend access token is unconfigured', async () => {
    const fetch = vi.fn();
    expect((await handleSpeechRequest(request('test-token'), { key: 'mock-azure', region: 'westus' }, { fetch, now: Date.now })).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects SSML, locale spoofing, missing source permission and unbounded scope before Azure', async () => {
    const fetch = vi.fn(); const token = 'security-regression-token';
    for (const p of [{ ssml: '<speak><audio src="https://foreign.invalid/x"/></speak>' }, { locale: 'en-US' }, { sourcePermission: undefined }, { kind: 'passage' }]) {
      expect((await handleSpeechRequest(request(token, p), { key: 'mock-azure', region: 'westus', authToken: token }, { fetch, now: Date.now })).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('charges a daily character budget before synthesis and refuses an excess request', async () => {
    const token = 'daily-budget-regression-token';
    const fetch = vi.fn(async () => new Response(wav()));
    const env = { key: 'mock-azure', region: 'westus', authToken: token, dailyCharacterLimit: 5 };
    expect((await handleSpeechRequest(request(token), env, { fetch, now: Date.now })).status).toBe(200);
    expect((await handleSpeechRequest(request(token), env, { fetch, now: Date.now })).status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a RIFF response with no WAVE signature', async () => {
    const token = 'wav-validation-regression-token'; const bytes = wav(); bytes.fill(0, 8, 12);
    const fetch = vi.fn(async () => new Response(bytes));
    expect((await handleSpeechRequest(request(token), { key: 'mock-azure', region: 'westus', authToken: token }, { fetch, now: Date.now })).status).toBe(502);
  });
});
