import { describe, expect, it, vi } from 'vitest';
import { createAccountSpeechFetch, createPracticeSpeechFetch, isTrustedPracticeUrl } from '../../packages/goreview/app/speechBridge';
import { createAudioDeps } from '../../packages/goreview/app/audio';
import { spanishRegistry } from '../../packages/golisten/src';
import { fakeAudio, fakeObjectUrls } from '../golisten/pronounce-fakes';

describe('GoReview authenticated speech bridge', () => {
  it('enforces the exact extension page URL', () => {
    expect(isTrustedPracticeUrl('chrome-extension://abc/review/index.html', 'abc')).toBe(true);
    expect(isTrustedPracticeUrl('chrome-extension://abc/review/index.html#/session', 'abc')).toBe(true);
    expect(isTrustedPracticeUrl('chrome-extension://abc/review/index.html?x=1', 'abc')).toBe(false);
    expect(isTrustedPracticeUrl('https://abc/review/index.html', 'abc')).toBe(false);
    expect(isTrustedPracticeUrl('chrome-extension://other/review/index.html', 'abc')).toBe(false);
  });
  it('maps a real synth reply to audio', async () => {
    let resolve!: (v: unknown) => void;
    const sendMessage = vi.fn((m: unknown) => (m as { op?: string }).op === 'cancel' ? Promise.resolve({ ok: true, status: 200 }) : new Promise((r) => { resolve = r; }));
    const fetch = createPracticeSpeechFetch({ id: 'abc', sendMessage }, 'chrome-extension://abc/review/index.html')!;
    const pending = fetch('/api/speech/synthesize', { method: 'POST', body: JSON.stringify({ text: 'hola', voice: 'es-HN-KarlaNeural', locale: 'es-HN' }) });
    resolve({ ok: true, status: 200, bytes: [82, 73, 70, 70] });
    const r = await pending;
    expect(r.ok).toBe(true); expect(await r.blob()).toBeInstanceOf(Blob);
  });
  it('returns bridge failures as failed responses', async () => {
    const fetch = createPracticeSpeechFetch({ id: 'abc', sendMessage: async () => ({ ok: false, status: 503 }) }, 'chrome-extension://abc/review/index.html')!;
    const r = await fetch('/api/speech/status');
    expect(r.ok).toBe(false); expect(r.status).toBe(503);
  });
  it('returns cancelled after a late background success', async () => {
    let resolve!: (v: unknown) => void;
    const sendMessage = vi.fn((m: unknown) => (m as { op?: string }).op === 'cancel' ? Promise.resolve({ ok: true, status: 200 }) : new Promise((r) => { resolve = r; }));
    const bridge = createPracticeSpeechFetch({ id: 'abc', sendMessage }, 'chrome-extension://abc/review/index.html')!;
    const ctl = new AbortController();
    const pending = bridge('/api/speech/synthesize', { method: 'POST', body: JSON.stringify({ text: 'hola', voice: 'es-HN-KarlaNeural', locale: 'es-HN' }), signal: ctl.signal });
    ctl.abort(); resolve({ ok: true, status: 200, bytes: [82, 73, 70, 70] });
    expect((await pending).status).toBe(499);
  });
  it('runs the real GoListen remote pronunciation through the bridge', async () => {
    const runtime = { id: 'abc', sendMessage: async (m: unknown) => {
      const x = m as { op?: string };
      if (x.op === 'status') return { ok: true, status: 200, json: { configured: true } };
      if (x.op === 'voices') return { ok: true, status: 200, json: { voices: [{ id: 'es-HN-KarlaNeural', name: 'Karla', locale: 'es-HN', lang: 'es' }] } };
      return { ok: true, status: 200, bytes: [82, 73, 70, 70, 1] };
    } };
    const audio = createAudioDeps({ consent: () => true, extensionRuntime: runtime, extensionUrl: 'chrome-extension://abc/review/index.html', registries: [spanishRegistry()], audio: fakeAudio(), objectUrl: fakeObjectUrls() });
    const result = await audio.pronounce!({ languageId: 'es', text: 'hola', kind: 'word', processingPermission: 'allowed' });
    expect(result.ok).toBe(true);
  });
  it('attaches the current account token only to the exact authenticated Repository speech route', async () => {
    const token = 'account-session-token';
    const sent: Array<{ url: string; init?: unknown }> = [];
    const fetcher = async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
      sent.push({ url, init });
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ configured: true }), blob: async () => new Blob() };
    };
    const fetch = createAccountSpeechFetch(fetcher, 'https://repo.example/api/speech', async () => token, () => true);
    const ok = await fetch('https://repo.example/api/speech/status');
    expect(ok.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://repo.example/api/speech/status');
    expect(sent[0]?.init).toMatchObject({ method: 'GET', headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store' });
    await fetch('https://attacker.example/api/speech/status');
    await fetch('https://repo.example/api/speech/status?redirect=1');
    const phrase = await fetch('https://repo.example/api/speech/synthesize', { method: 'POST', body: JSON.stringify({ languageId: 'es', kind: 'phrase', text: 'hola mundo', voice: 'es-HN-KarlaNeural', locale: 'es-HN', sourcePermission: 'allowed' }) });
    expect(phrase.status).toBe(200); // the authenticated service makes the exact approved-material decision
    expect(sent).toHaveLength(2);
    expect(JSON.parse(String((sent[1]?.init as { body?: string })?.body))).toMatchObject({ languageId: 'es', kind: 'phrase', text: 'hola mundo' });
    const word = await fetch('https://repo.example/api/speech/synthesize', { method: 'POST', body: JSON.stringify({ languageId: 'es', kind: 'word', text: 'hola', voice: 'es-HN-KarlaNeural', locale: 'es-HN', sourcePermission: 'allowed' }) });
    expect(word.status).toBe(200);
    expect(sent).toHaveLength(3);
    expect(JSON.parse(String((sent[2]?.init as { body?: string })?.body)).languageId).toBe('es');
    const markup = await fetch('https://repo.example/api/speech/synthesize', { method: 'POST', body: JSON.stringify({ languageId: 'es', kind: 'sentence', text: '<speak>hola</speak>', sourcePermission: 'allowed' }) });
    expect(markup.status).toBe(422);
    expect(sent).toHaveLength(3);
  });
});
