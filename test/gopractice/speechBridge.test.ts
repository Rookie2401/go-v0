import { describe, expect, it, vi } from 'vitest';
import { createPracticeSpeechFetch, isTrustedPracticeUrl } from '../../packages/gopractice/speechBridge';
import { createAudioDeps } from '../../packages/gopractice/audio';
import { spanishRegistry } from '../../packages/golisten/src';
import { fakeAudio, fakeObjectUrls } from '../golisten/pronounce-fakes';

describe('GoPractice authenticated speech bridge', () => {
  it('enforces the exact extension page URL', () => {
    expect(isTrustedPracticeUrl('chrome-extension://abc/practice/index.html', 'abc')).toBe(true);
    expect(isTrustedPracticeUrl('chrome-extension://abc/practice/index.html#/session', 'abc')).toBe(true);
    expect(isTrustedPracticeUrl('chrome-extension://abc/practice/index.html?x=1', 'abc')).toBe(false);
    expect(isTrustedPracticeUrl('https://abc/practice/index.html', 'abc')).toBe(false);
    expect(isTrustedPracticeUrl('chrome-extension://other/practice/index.html', 'abc')).toBe(false);
  });
  it('maps a real synth reply to audio', async () => {
    let resolve!: (v: unknown) => void;
    const sendMessage = vi.fn((m: unknown) => (m as { op?: string }).op === 'cancel' ? Promise.resolve({ ok: true, status: 200 }) : new Promise((r) => { resolve = r; }));
    const fetch = createPracticeSpeechFetch({ id: 'abc', sendMessage }, 'chrome-extension://abc/practice/index.html')!;
    const pending = fetch('/api/speech/synthesize', { method: 'POST', body: JSON.stringify({ text: 'hola', voice: 'es-HN-KarlaNeural', locale: 'es-HN' }) });
    resolve({ ok: true, status: 200, bytes: [82, 73, 70, 70] });
    const r = await pending;
    expect(r.ok).toBe(true); expect(await r.blob()).toBeInstanceOf(Blob);
  });
  it('returns bridge failures as failed responses', async () => {
    const fetch = createPracticeSpeechFetch({ id: 'abc', sendMessage: async () => ({ ok: false, status: 503 }) }, 'chrome-extension://abc/practice/index.html')!;
    const r = await fetch('/api/speech/status');
    expect(r.ok).toBe(false); expect(r.status).toBe(503);
  });
  it('returns cancelled after a late background success', async () => {
    let resolve!: (v: unknown) => void;
    const sendMessage = vi.fn((m: unknown) => (m as { op?: string }).op === 'cancel' ? Promise.resolve({ ok: true, status: 200 }) : new Promise((r) => { resolve = r; }));
    const bridge = createPracticeSpeechFetch({ id: 'abc', sendMessage }, 'chrome-extension://abc/practice/index.html')!;
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
    const audio = createAudioDeps({ consent: () => true, extensionRuntime: runtime, extensionUrl: 'chrome-extension://abc/practice/index.html', registries: [spanishRegistry()], audio: fakeAudio(), objectUrl: fakeObjectUrls() });
    const result = await audio.pronounce!({ languageId: 'es', text: 'hola', kind: 'word', processingPermission: 'allowed' });
    expect(result.ok).toBe(true);
  });
});
