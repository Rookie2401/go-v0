import { describe, it, expect } from 'vitest';
import { createGoListenPronouncer } from '../../packages/golearn-extension/src/content/voice';
import type { SpeechMessage, SpeechReply } from '../../packages/golearn-extension/src/speechProtocol';
import { fakeAudio, fakeObjectUrls, fakeSpeech, fakeUtterance, voice } from '../golisten/pronounce-fakes';
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const reply: SpeechReply = { ok: true, status: 200, bytes: Array(48).fill(0) };
function harness(bridge?: (req: SpeechMessage) => Promise<SpeechReply>) {
  const audio = fakeAudio(), urls = fakeObjectUrls(), speech = fakeSpeech([voice('Spanish local', 'es-HN')]);
  const calls: SpeechMessage[] = []; let allowed = true;
  const pron = createGoListenPronouncer({ speech, audio, objectUrl: urls, utterance: fakeUtterance, voiceWaitMs: 0,
    refreshConsent: async () => allowed, speechBridge: async req => { calls.push(req); return bridge ? bridge(req) : reply; } });
  return { pron, calls, audio, urls, speech, revokeConsent: () => { allowed = false; } };
}
describe('GoLearn Azure playback through privileged messages', () => {
  it('uses Azure first for a requested sentence and carries reader/variety context', async () => {
    const h = harness(); h.pron.setRate?.(0.75);
    const result = await h.pron.play('Buenos días.', 'es', { readerId: 'web-generic', varietyId: 'es-HN', kind: 'sentence' });
    expect(result).toMatchObject({ ok: true, voiceId: 'azure-speech:es-HN-CarlosNeural' });
    expect(h.calls[0]).toMatchObject({ op: 'synthesize', readerId: 'web-generic', kind: 'sentence', locale: 'es-HN', text: 'Buenos días.' });
    expect(h.speech.spoken).toHaveLength(0); expect(h.audio.clips[0].rate).toBe(0.75);
    h.pron.setRate?.(1.25); expect(h.audio.clips[0].rate).toBe(1.25);
    h.pron.stop?.(); expect(h.urls.revoked).toEqual(['blob:fake/1']);
  });
  it('cancels the actual pending message and discards a late response', async () => {
    let resolve!: (r: SpeechReply) => void;
    const h = harness(async req => req.op === 'cancel' ? reply : new Promise(r => { resolve = r; }));
    const playing = h.pron.play('hola', 'es', { readerId: 'web-generic' }); await flush();
    const id = h.calls[0].requestId; h.pron.stop?.();
    expect(h.calls).toContainEqual(expect.objectContaining({ op: 'cancel', requestId: id }));
    resolve(reply); expect((await playing).ok).toBe(false);
    expect(h.audio.opened).toHaveLength(0); expect(h.speech.spoken).toHaveLength(0);
    expect(h.urls.revoked).toHaveLength(1);
  });
  it('a newer selection wins when an older Azure response arrives last', async () => {
    const resolvers: Array<(r: SpeechReply) => void> = [];
    const h = harness(async req => req.op === 'cancel' ? reply : new Promise(r => resolvers.push(r)));
    const old = h.pron.play('antes', 'es'); await flush();
    const fresh = h.pron.play('ahora', 'es'); await flush();
    resolvers[1](reply); expect((await fresh).ok).toBe(true);
    resolvers[0](reply); expect((await old).ok).toBe(false);
    expect(h.audio.opened).toHaveLength(1); expect(h.urls.revoked).toHaveLength(1);
  });
  it('refused remote source processing falls back to a local matching voice', async () => {
    const h = harness(async () => ({ ok: false, status: 403 }));
    expect(await h.pron.play('hola', 'es', { varietyId: 'es-HN', kind: 'phrase' })).toMatchObject({ ok: true, voiceId: 'device:Spanish local' });
    expect(h.speech.spoken).toHaveLength(1);
  });
  it('surfaces the remote failure when no local fallback voice exists', async () => {
    const h = harness(async () => ({ ok: false, status: 403 }));
    const result = await h.pron.play('नमस्ते', 'hi', { varietyId: 'hi-IN', kind: 'word' });
    expect(result).toMatchObject({ ok: false, message: 'The speech proxy refused the request (it accepts same-origin requests only).' });
    expect(h.speech.spoken).toHaveLength(0);
  });
  it('a consent withdrawal while Azure is loading releases its audio without playing', async () => {
    let resolve!: (r: SpeechReply) => void;
    const h = harness(async () => new Promise(r => { resolve = r; }));
    const playing = h.pron.play('hola', 'es'); await flush(); h.revokeConsent(); resolve(reply);
    expect((await playing).ok).toBe(false); expect(h.audio.opened).toHaveLength(0); expect(h.urls.revoked).toHaveLength(1);
  });
  it('reports Azure availability from the privileged status and voice replies', async () => {
    const h = harness(async req => req.op === 'status'
      ? { ok: true, status: 200, json: { configured: true } }
      : req.op === 'voices'
        ? { ok: true, status: 200, json: { voices: [{ id: 'es-HN-CarlosNeural' }] } }
        : reply);
    await expect(h.pron.availability('es')).resolves.toMatchObject({ available: true, note: expect.stringContaining('Azure Neural') });
    expect(h.calls.map(c => c.op)).toEqual(['status', 'voices']);
  });
  it('keeps a local voice available while retaining a backend diagnostic', async () => {
    const h = harness(async req => req.op === 'status'
      ? { ok: false, status: 503, message: 'The authenticated speech backend is not configured.' }
      : reply);
    const result = await h.pron.availability('es');
    expect(result.available).toBe(true);
    expect(result.note).toContain('backend is not configured');
    expect(h.calls.map(c => c.op)).toEqual(['status']);
  });
  it('does not collapse a permission failure into no local device voice', async () => {
    const h = harness(async req => req.op === 'status'
      ? { ok: false, status: 403, message: 'Grant access to the configured speech backend from GoLearn setup.' }
      : reply);
    const result = await h.pron.availability('hi');
    expect(result).toEqual({ available: false, note: 'Grant access to the configured speech backend from GoLearn setup.' });
  });
});
