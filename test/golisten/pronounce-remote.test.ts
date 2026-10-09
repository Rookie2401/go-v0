// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { albanianRegistry, AZURE_LICENCE, createGoListen, isIndependentEvidence } from '../../packages/golisten/src';
import type { FetchLike, PronunciationResult } from '../../packages/golisten/src';
import { configuredProxy, fakeAudio, fakeFetch, fakeObjectUrls, fakeSpeech, fakeUtterance, jsonResponse, unconfiguredProxy, wavResponse } from './pronounce-fakes';
import type { FakeFetch } from './pronounce-fakes';

const TEXT = 'mirëdita, si jeni sot';

function setup(net: FakeFetch | undefined, o: { consent?: () => boolean; proxyBase?: string; now?: () => number } = {}) {
  const audio = fakeAudio(1800);
  const urls = fakeObjectUrls();
  const state = { consent: false };
  const g = createGoListen({
    registries: [albanianRegistry()], consent: o.consent ? () => ({ remoteSpeech: o.consent!() }) : () => ({ remoteSpeech: state.consent }),
    speech: fakeSpeech([]), audio, fetch: net?.fetch, objectUrl: urls, utterance: fakeUtterance, speechProxyBase: o.proxyBase, now: o.now, voiceWaitMs: 0,
  });
  return { g, audio, urls, state, net };
}
const ok = (r: PronunciationResult) => { if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.message}`); return r; };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('remote speech needs consent', () => {
  it('without consent: no-consent, and not a single network call', async () => {
    const net = configuredProxy();
    const { g, state } = setup(net);
    expect(state.consent).toBe(false);
    const r = await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence', preferred: 'remote' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no-consent');
      expect(r.alternatives.join(' ')).toMatch(/remote speech/i);
      expect(JSON.stringify(r)).not.toContain('mirëdita');
    }
    expect(net.calls).toHaveLength(0);
  });

  it('a consent callback that throws counts as no consent', async () => {
    const net = configuredProxy();
    const { g } = setup(net, { consent: () => { throw new Error('storage unavailable'); } });
    const r = await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence' });
    expect(r.ok).toBe(false);
    expect(net.calls).toHaveLength(0);
  });

  it('consent is read at the moment of each call: withdrawing it stops the next request', async () => {
    const net = configuredProxy();
    let allowed = true;
    const { g } = setup(net, { consent: () => allowed });
    ok(await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence' }));
    expect(net.calls.filter((c) => c.url.endsWith('/synthesize'))).toHaveLength(1);
    allowed = false;
    const r = await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence' });
    expect(r.ok).toBe(false);
    expect(net.calls.filter((c) => c.url.endsWith('/synthesize'))).toHaveLength(1);
  });
});

describe('remote speech with consent', () => {
  it('posts the proxy shape (text in the body only), plays the returned audio, and describes the voice honestly', async () => {
    const net = configuredProxy();
    const { g, audio, urls, state } = setup(net);
    state.consent = true;
    const r = ok(await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence', preferred: 'remote', rate: 0.9 }));

    expect(net.calls).toHaveLength(1);
    const call = net.calls[0];
    expect(call.url).toBe('/api/speech/synthesize');
    expect(call.url).not.toContain('mirëdita'); // never in a URL
    expect(call.init?.method).toBe('POST');
    expect(call.init?.credentials).toBe('same-origin');
    expect(Object.keys(call.init?.headers ?? {})).toEqual(['content-type']); // no key, no token: the proxy holds the key
    expect(JSON.parse(call.init!.body!)).toEqual({ text: TEXT, voice: 'sq-AL-AnilaNeural', locale: 'sq-AL' });

    expect(r.voice).toMatchObject({
      voiceId: 'azure-speech:sq-AL-AnilaNeural', provider: 'remote', execution: 'remote', synthetic: true, languageId: 'sq', varietyId: 'sq-AL',
      licence: AZURE_LICENCE, qualityVerification: 'unverified', suitableForAssessment: false,
    });
    expect(AZURE_LICENCE).toBe("Microsoft Azure Speech terms (owner's subscription)");
    expect(r.provenance).toMatchObject({ source: 'remote-tts', providerId: 'azure-speech', generatedFromText: true });
    expect(isIndependentEvidence(r.provenance)).toBe(false);

    expect(r.playback.state).toBe('idle');
    r.playback.play();
    expect(audio.opened).toEqual(['blob:fake/1']);
    expect(audio.clips[0].plays).toBe(1);
    expect(audio.clips[0].rate).toBe(0.9);
    audio.clips[0].finish();
    expect(r.playback.state).toBe('ended');
    expect(r.playback.durationMs).toBe(1800);
    r.playback.setRate(1.3); // a recording takes the rate at once
    expect(audio.clips[0].rate).toBe(1.3);
    r.playback.replay();
    expect(r.playback.replays).toBe(1);
    expect(audio.clips[0].plays).toBe(2);
    expect(urls.revoked).toEqual([]);
    r.playback.dispose();
    expect(urls.revoked).toEqual(['blob:fake/1']); // the handle owned its object URL
    expect(audio.clips[0].released).toBe(true);
  });

  it('can ask for the second Albanian voice by id, and a speech proxy base can be configured', async () => {
    const net = configuredProxy();
    const { g, state } = setup(net, { proxyBase: 'https://app.example.test/api/speech/' });
    state.consent = true;
    const r = ok(await g.pronounce({ languageId: 'sq', text: 'faleminderit', kind: 'word', voiceId: 'azure-speech:sq-AL-IlirNeural' }));
    expect(r.voice.voiceId).toBe('azure-speech:sq-AL-IlirNeural');
    expect(net.calls[0].url).toBe('https://app.example.test/api/speech/synthesize');
    expect(JSON.parse(net.calls[0].init!.body!).voice).toBe('sq-AL-IlirNeural');
    const none = await g.pronounce({ languageId: 'sq', text: 'faleminderit', kind: 'word', voiceId: 'azure-speech:sq-AL-NobodyNeural' });
    expect(none.ok).toBe(false);
    expect(net.calls).toHaveLength(1);
  });

  it('maps proxy and network failures to results, never to exceptions, and never repeats the text', async () => {
    const cases: Array<[string, FakeFetch, string]> = [
      ['no key on the server', fakeFetch(() => jsonResponse(401, { error: 'missing-credentials', message: `echo ${TEXT}` })), 'provider-error'],
      ['rate limited', fakeFetch(() => jsonResponse(429, { error: 'rate-limited', message: 'slow down' })), 'provider-error'],
      ['upstream error', fakeFetch(() => jsonResponse(502, { error: 'upstream-error', message: 'x' })), 'provider-error'],
      ['cross-origin refused', fakeFetch(() => jsonResponse(403, { error: 'forbidden-origin', message: 'x' })), 'provider-error'],
      ['not audio', fakeFetch(() => jsonResponse(200, { hello: 'world' })), 'provider-error'],
      ['empty audio', fakeFetch(() => wavResponse(0)), 'provider-error'],
      ['network down', fakeFetch(() => { throw new TypeError('Failed to fetch'); }), 'offline'],
    ];
    for (const [name, net, reason] of cases) {
      const { g, state } = setup(net);
      state.consent = true;
      const r = await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence' });
      expect(r.ok, name).toBe(false);
      if (r.ok) continue;
      expect(r.reason, name).toBe(reason);
      expect(JSON.stringify(r), name).not.toContain('mirëdita');
      expect(r.alternatives.length, name).toBeGreaterThan(0);
    }
  });

  it('refuses text beyond what the speech service accepts, without a request', async () => {
    const net = configuredProxy();
    const { g, state } = setup(net);
    state.consent = true;
    const r = await g.pronounce({ languageId: 'sq', text: 'a'.repeat(5001), kind: 'sentence' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported-kind');
    expect(net.calls).toHaveLength(0);
  });

  it('without a fetch, or with an object-URL port that fails, it returns provider-error', async () => {
    vi.stubGlobal('fetch', undefined);
    const noFetch = await createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: true }), speech: fakeSpeech([]), audio: fakeAudio(), objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0 })
      .pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence' });
    expect(noFetch.ok).toBe(false);
    if (!noFetch.ok) expect(noFetch.reason).toBe('provider-error');

    const net = configuredProxy();
    const broken = { create: () => { throw new Error('no object urls here'); }, revoke: () => undefined };
    const noUrl = await createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: true }), speech: fakeSpeech([]), audio: fakeAudio(), fetch: net.fetch, objectUrl: broken, utterance: fakeUtterance, voiceWaitMs: 0 })
      .pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence' });
    expect(noUrl.ok).toBe(false);
    if (!noUrl.ok) expect(noUrl.reason).toBe('provider-error');
  });

  it('never logs the text', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    for (const net of [configuredProxy(), unconfiguredProxy(), fakeFetch(() => { throw new TypeError('Failed to fetch'); })]) {
      const { g, state } = setup(net);
      state.consent = true;
      const r = await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence' });
      if (r.ok) { r.playback.play(); r.playback.dispose(); }
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

describe('the fetch passed in is the only network path', () => {
  it('a pronounce that needs no remote voice makes no request, even with consent and a fetch present', async () => {
    const net = configuredProxy();
    const fetchSpy: FetchLike = vi.fn(net.fetch);
    const g = createGoListen({
      registries: [albanianRegistry()], consent: () => ({ remoteSpeech: true }),
      speech: fakeSpeech([{ name: 'Local Albanian', lang: 'sq-AL', voiceURI: 'Local Albanian', localService: true }]),
      audio: fakeAudio(), fetch: fetchSpy, objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0,
    });
    const r = ok(await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'sentence' }));
    expect(r.provenance.source).toBe('device-tts'); // the local voice wins over the remote one
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
