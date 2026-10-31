// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handle } from '../../../packages/repository-service/src/handler';
import { makeEvent, raw, createHarness, signUp } from './fakes';

const VOICE = 'es-MX-DaliaNeural';
const consentEvent = (learnerId: string, enrolmentId: string, kind: 'ConsentGiven' | 'ConsentWithdrawn', at: string) => makeEvent(
  { learnerId, enrolmentId, deviceId: 'dev-1' },
  { kind, producer: { app: 'golearn-app', version: 'test', deviceId: 'dev-1' }, subject: {}, payload: { consent: 'remote-speech', scope: 'remote-speech' }, at },
);

function wavResponse(): Response {
  const bytes = new Uint8Array(45);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WAVE'), 8);
  return new Response(bytes, { status: 200, headers: { 'content-type': 'audio/wav' } });
}

const voiceResponse = () => new Response(JSON.stringify([
  { ShortName: VOICE, Locale: 'es-MX', Gender: 'Female' },
]), { status: 200, headers: { 'content-type': 'application/json' } });

async function synthesize(h: ReturnType<typeof createHarness>, token: string, body: Record<string, unknown>) {
  return handle(new Request('http://repository.local/api/speech/synthesize', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), h.deps);
}

describe('account-authenticated Azure Speech routes', () => {
  it('requires a valid account session for status and voices before any upstream request', async () => {
    const h = createHarness();
    const upstream = vi.fn(async () => voiceResponse());
    h.deps.speech = { key: 'test-azure-key', region: 'westus', fetch: upstream };
    const status = await raw(h, 'GET', '/api/speech/status');
    const voices = await raw(h, 'GET', '/api/speech/voices?lang=es');
    const synth = await raw(h, 'POST', '/api/speech/synthesize', { body: { languageId: 'es', text: 'Hola', voice: VOICE, locale: 'es-MX', format: 'riff-24khz-16bit-mono-pcm', kind: 'word', sourcePermission: 'allowed' } });
    expect(status).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
    expect(voices).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
    expect(synth).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns a redacted unconfigured status and a distinct missing-credentials result', async () => {
    const h = createHarness();
    const s = await signUp(h, 'speech@example.com');
    const status = await raw(h, 'GET', '/api/speech/status', { token: s.token });
    const voices = await raw(h, 'GET', '/api/speech/voices?lang=es', { token: s.token });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ configured: false, provider: 'azure-speech' });
    expect(JSON.stringify(status.body)).not.toContain('test-azure-key');
    expect(voices).toMatchObject({ status: 503, body: { error: 'missing-credentials' } });
  });

  it('allows status and voices with an account bearer, and returns the Azure voice catalog', async () => {
    const h = createHarness();
    const s = await signUp(h, 'voices@example.com');
    const upstream = vi.fn(async () => voiceResponse());
    h.deps.speech = { key: 'test-azure-key', region: 'westus', fetch: upstream };
    const status = await raw(h, 'GET', '/api/speech/status', { token: s.token });
    const voices = await raw(h, 'GET', '/api/speech/voices?lang=es', { token: s.token });
    expect(status.body).toMatchObject({ configured: true, provider: 'azure-speech', region: 'westus' });
    expect(voices).toMatchObject({ status: 200, body: { voices: [{ id: VOICE, locale: 'es-MX' }] } });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('synthesizes only after persisted remote-speech consent and explicit source permission', async () => {
    const h = createHarness();
    const s = await signUp(h, 'synthesis@example.com');
    const upstream = vi.fn(async () => wavResponse());
    h.deps.speech = { key: 'test-azure-key', region: 'westus', fetch: upstream };
    const body = { languageId: 'es', text: 'Hola', voice: VOICE, locale: 'es-MX', format: 'riff-24khz-16bit-mono-pcm', kind: 'word', sourcePermission: 'allowed' };
    const noConsent = await synthesize(h, s.token, body);
    expect(noConsent.status).toBe(403);
    expect((await noConsent.json()).error).toBe('remote-speech-consent-required');
    expect(upstream).not.toHaveBeenCalled();

    await h.store.append(s.learnerId, [consentEvent(s.learnerId, s.enrolmentId!, 'ConsentGiven', h.clock.now())]);
    const deniedSource = await synthesize(h, s.token, { ...body, sourcePermission: 'unknown' });
    expect(deniedSource.status).toBe(403);
    expect((await deniedSource.json()).error).toBe('source-not-authorized');
    expect(upstream).not.toHaveBeenCalled();

    const allowed = await synthesize(h, s.token, body);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('content-type')).toBe('audio/wav');
    expect(allowed.headers.get('x-speech-provider-version')).toBe('azure-proxy@1');
    expect(allowed.headers.get('access-control-expose-headers')).toContain('X-Speech-Delivered-Locale');
    expect((await allowed.arrayBuffer()).byteLength).toBe(45);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(h.logs.join('\n')).not.toContain(s.token);
    expect(h.logs.join('\n')).not.toContain('test-azure-key');
    expect(h.logs.join('\n')).not.toContain('Hola');
  });

  it('rejects arbitrary phrase/sentence text and markup before upstream', async () => {
    const h = createHarness();
    const s = await signUp(h, 'word-only@example.com');
    const upstream = vi.fn(async () => wavResponse());
    h.deps.speech = { key: 'test-azure-key', region: 'westus', fetch: upstream };
    await h.store.append(s.learnerId, [consentEvent(s.learnerId, s.enrolmentId!, 'ConsentGiven', h.clock.now())]);
    const base = { languageId: 'es', text: 'Hola', voice: VOICE, locale: 'es-MX', format: 'riff-24khz-16bit-mono-pcm', kind: 'word', sourcePermission: 'allowed' };
    const invalid = [
      { ...base, kind: 'sentence', text: 'Un párrafo privado que no pertenece al paquete.' },
      { ...base, kind: 'phrase', text: 'un párrafo privado' },
      { ...base, text: 'Hola mundo' },
      { ...base, text: 'Hola\n' },
      { ...base, text: '<speak>Hola</speak>' },
      { ...base, text: 'x'.repeat(121) },
    ];
    for (const body of invalid) {
      const response = await synthesize(h, s.token, body);
      expect(response.status).toBe(422);
      expect((await response.json()).error).toBe('invalid-input');
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('accepts only exact phrase and sentence text present in the matching pack/tutorial', async () => {
    const h = createHarness();
    const s = await signUp(h, 'published-material@example.com');
    const upstream = vi.fn(async () => wavResponse());
    h.deps.speech = { key: 'test-azure-key', region: 'westus', fetch: upstream };
    await h.store.append(s.learnerId, [consentEvent(s.learnerId, s.enrolmentId!, 'ConsentGiven', h.clock.now())]);
    const base = { languageId: 'es', voice: VOICE, locale: 'es-MX', format: 'riff-24khz-16bit-mono-pcm', sourcePermission: 'allowed' };
    for (const [kind, text] of [
      ['phrase', 'Yo tengo un libro.'],
      ['sentence', 'Ana vive en una casa pequeña.'],
    ]) {
      const response = await synthesize(h, s.token, { ...base, kind, text });
      expect(response.status).toBe(200);
      await response.arrayBuffer();
    }
    const wrongLanguage = await synthesize(h, s.token, { ...base, languageId: 'de', kind: 'sentence', text: 'Ana vive en una casa pequeña.' });
    expect(wrongLanguage.status).toBe(422);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('honors the latest consent withdrawal and revoked account sessions', async () => {
    const h = createHarness();
    const s = await signUp(h, 'withdraw@example.com');
    const upstream = vi.fn(async () => wavResponse());
    h.deps.speech = { key: 'test-azure-key', region: 'westus', fetch: upstream };
    await h.store.append(s.learnerId, [
      consentEvent(s.learnerId, s.enrolmentId!, 'ConsentGiven', '2026-10-08T10:00:00.000Z'),
      consentEvent(s.learnerId, s.enrolmentId!, 'ConsentWithdrawn', '2026-10-08T10:01:00.000Z'),
    ]);
    const body = { languageId: 'es', text: 'Hola', voice: VOICE, locale: 'es-MX', format: 'riff-24khz-16bit-mono-pcm', kind: 'word', sourcePermission: 'allowed' };
    const withdrawn = await synthesize(h, s.token, body);
    expect(withdrawn.status).toBe(403);
    expect((await withdrawn.json()).error).toBe('remote-speech-consent-required');
    expect(upstream).not.toHaveBeenCalled();

    await h.store.append(s.learnerId, [consentEvent(s.learnerId, s.enrolmentId!, 'ConsentGiven', '2026-10-08T10:02:00.000Z')]);
    const session = await h.store.getSessionByTokenHash(h.crypto.sha256(s.token));
    expect(session).toBeTruthy();
    await h.store.revokeSession(session!.sessionId, h.clock.now());
    const revoked = await synthesize(h, s.token, body);
    expect(revoked.status).toBe(401);
    expect((await revoked.json()).error).toBe('unauthorized');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('applies per-account request and character budgets', async () => {
    const h = createHarness();
    const first = await signUp(h, 'budget-one@example.com');
    const second = await signUp(h, 'budget-two@example.com');
    const upstream = vi.fn(async () => voiceResponse());
    const speech = { key: 'test-azure-key', region: 'westus', fetch: upstream, rateLimitPerMinute: 1, dailyCharacterLimit: 3 };
    h.deps.speech = speech;
    const one = await raw(h, 'GET', '/api/speech/voices?lang=es', { token: first.token });
    const oneLimited = await raw(h, 'GET', '/api/speech/voices?lang=es', { token: first.token });
    const otherAccount = await raw(h, 'GET', '/api/speech/voices?lang=es', { token: second.token });
    expect(one.status).toBe(200);
    expect(oneLimited).toMatchObject({ status: 429, body: { error: 'rate-limited' } });
    expect(otherAccount.status).toBe(200);

    await h.store.append(first.learnerId, [consentEvent(first.learnerId, first.enrolmentId!, 'ConsentGiven', h.clock.now())]);
    h.deps.speech = { ...speech, rateLimitPerMinute: 5 };
    const tooManyChars = await synthesize(h, first.token, { languageId: 'es', text: 'long', voice: VOICE, locale: 'es-MX', format: 'riff-24khz-16bit-mono-pcm', kind: 'word', sourcePermission: 'allowed' });
    expect(tooManyChars).toMatchObject({ status: 429 });
    expect((await tooManyChars.json()).error).toBe('daily-limit');
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('keeps repository CORS and bounded body handling on the authenticated routes', async () => {
    const h = createHarness();
    const s = await signUp(h, 'cors@example.com');
    h.deps.speech = { key: 'test-azure-key', region: 'westus', fetch: vi.fn(async () => voiceResponse()) };
    const preflight = await handle(new Request('http://repository.local/api/speech/synthesize', { method: 'OPTIONS' }), h.deps);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
    await h.store.append(s.learnerId, [consentEvent(s.learnerId, s.enrolmentId!, 'ConsentGiven', h.clock.now())]);
    const large = await handle(new Request('http://repository.local/api/speech/synthesize', {
      method: 'POST', headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(21_000), sourcePermission: 'allowed' }),
    }), h.deps);
    expect(large.status).toBe(413);
    expect((await large.json()).error).toBe('too-large');
  });
});
