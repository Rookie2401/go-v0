import { describe, it, expect } from 'vitest';
import { createGoListen, albanianRegistry, defaultRegistries } from '../../packages/golisten/src';
import { configuredProxy, fakeSpeech, fakeAudio, fakeObjectUrls, fakeUtterance, SQ_AL, SQ_NET } from './pronounce-fakes';
function rig(localOnly = false, cloud = false) {
  const net = configuredProxy(), speech = fakeSpeech([cloud ? SQ_NET : SQ_AL]), audio = fakeAudio(), urls = fakeObjectUrls();
  const g = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: true, localOnly }), speech, audio, objectUrl: urls, fetch: net.fetch, utterance: fakeUtterance, voiceWaitMs: 0 });
  return { g, net, speech, audio, urls };
}
describe('shared V1 provider permissions and cancellation', () => {
  it('Azure is primary when the host explicitly grants source processing permission', async () => {
    const h = rig(); const r = await h.g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', processingPermission: 'allowed' });
    expect(r).toMatchObject({ ok: true, provenance: { source: 'remote-tts' } });
    expect(h.net.calls).toHaveLength(1);
  });
  it('local-only plays an explicitly local matching voice without a network request', async () => {
    const h = rig(true); const r = await h.g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', autoplay: true, processingPermission: 'allowed' });
    expect(r).toMatchObject({ ok: true, provenance: { source: 'device-tts' } });
    expect(h.speech.spoken).toHaveLength(1); expect(h.net.calls).toHaveLength(0);
  });
  it('local-only availability and voice listings make no network request', async () => {
    const h = rig(true, true); await h.g.voices('sq');
    const available = await h.g.availability('sq');
    expect(available.canPronounce).toBe(false); expect(h.net.calls).toHaveLength(0);
  });
  it('aborting a prepared local hearing stops it and does not record completion', async () => {
    const h = rig(true); const controller = new AbortController();
    const r = await h.g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', autoplay: true, signal: controller.signal });
    expect(r.ok).toBe(true); if (!r.ok) return;
    controller.abort(); expect(r.playback.state).toBe('idle'); h.speech.finish();
    expect(r.playback.state).toBe('idle');
  });
  it('missing rights blocks Azure and browser cloud voices even with user consent', async () => {
    const h = rig(false, true); const r = await h.g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', autoplay: true });
    expect(r.ok).toBe(false); expect(h.speech.spoken).toHaveLength(0); expect(h.net.calls).toHaveLength(0);
  });
  it('an aborted request cannot fall through to device playback', async () => {
    const h = rig(); const controller = new AbortController(); controller.abort();
    const r = await h.g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', autoplay: true, signal: controller.signal, processingPermission: 'allowed' });
    expect(r.ok).toBe(false); expect(h.net.calls).toHaveLength(0); expect(h.speech.spoken).toHaveLength(0);
  });
  it('canonical standard ids use matching generic local tags without crossing languages or Norwegian standards', async () => {
    for (const [languageId, varietyId, tag] of [['hi', 'hi-standard', 'hi'], ['sq', 'sq-standard', 'sq'], ['th', 'th-standard', 'th'], ['nb', 'nb', 'no-NO'], ['nn', 'nn', 'nn']]) {
      const speech = fakeSpeech([{ name: tag, lang: tag, localService: true }]);
      const g = createGoListen({ registries: defaultRegistries(), consent: () => ({ remoteSpeech: false, localOnly: true }), speech, utterance: fakeUtterance, voiceWaitMs: 0 });
      expect((await g.pronounce({ languageId, varietyId, text: 'test', kind: 'word' })).ok, tag).toBe(true);
    }
  });
});
