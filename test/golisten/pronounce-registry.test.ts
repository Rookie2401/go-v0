// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { albanianRegistry, AZURE_LICENCE, createGoListen, defaultRegistries, indexRegistries, deviceRegistry } from '../../packages/golisten/src';
import type { FetchLike } from '../../packages/golisten/src';
import { EN, ES, SQ_AL, SQ_NET, configuredProxy, fakeAudio, fakeFetch, fakeObjectUrls, fakeSpeech, fakeUtterance, jsonResponse, unconfiguredProxy } from './pronounce-fakes';
import type { FakeFetch } from './pronounce-fakes';
import type { SpeechVoiceLike } from '../../packages/golisten/src';

function make(o: { voices?: SpeechVoiceLike[]; consent?: boolean; net?: FakeFetch; now?: () => number } = {}) {
  const state = { consent: o.consent ?? false };
  const g = createGoListen({
    registries: defaultRegistries(), consent: () => ({ remoteSpeech: state.consent }), speech: fakeSpeech(o.voices ?? []),
    audio: fakeAudio(), fetch: o.net?.fetch as FetchLike | undefined, objectUrl: fakeObjectUrls(), utterance: fakeUtterance, now: o.now, voiceWaitMs: 0,
  });
  return { g, state };
}
const stateOf = async (g: ReturnType<typeof make>['g'], voiceId: string) =>
  (await g.availability('sq')).voices.find((v) => v.voiceId === voiceId)?.state;

describe('the Albanian registry', () => {
  const sq = albanianRegistry();
  it('has a device template, two Azure Neural voices, and NO recordings', () => {
    expect(sq.entries.map((e) => e.provider)).toEqual(['device', 'remote', 'remote']);
    expect(sq.entries.some((e) => e.provider === 'recorded')).toBe(false);
    expect(sq.entries.every((e) => e.languageId === 'sq')).toBe(true);
    expect(sq.gaps).toContain('No Albanian recordings exist; nothing is claimed.');
    expect(sq.entries[0].source).toEqual({ kind: 'device', langTags: ['sq-AL', 'sq'] });
  });
  it('declares the Azure voices synthetic, remote, unverified, licence as the owner\'s subscription, never for assessment', () => {
    const azure = sq.entries.filter((e) => e.provider === 'remote');
    expect(azure.map((e) => e.source.kind === 'remote' && e.source.providerVoice)).toEqual(['sq-AL-AnilaNeural', 'sq-AL-IlirNeural']);
    for (const e of azure) {
      expect(e).toMatchObject({ synthetic: true, execution: 'remote', qualityVerification: 'unverified', suitableForAssessment: false, licence: AZURE_LICENCE });
      expect(e.knownLimitations.join(' ')).toMatch(/consent/);
    }
  });
  it('no entry anywhere is both synthetic and suitable for assessment, or synthetic and verified native-reviewed', () => {
    for (const r of defaultRegistries()) for (const e of r.entries) {
      if (e.synthetic) { expect(e.suitableForAssessment).toBe(false); expect(e.qualityVerification).not.toBe('native-reviewed'); }
    }
  });
  it('default registries expose the same strict device tags as GoLearn for experimental packs', () => {
    const byLanguage = new Map(defaultRegistries().map((r) => [r.languageId, r]));
    for (const [languageId, tags] of [
      ['de', ['de-DE', 'de-AT', 'de-CH', 'de']],
      ['hi', ['hi-IN', 'hi']],
      ['th', ['th-TH', 'th']],
      ['nb', ['nb-NO', 'nb', 'no-NO', 'no']],
      ['nn', ['nn-NO', 'nn']],
    ] as const) {
      const entry = byLanguage.get(languageId)!.entries.find((e) => e.source.kind === 'device')!;
      expect(entry.source).toEqual({ kind: 'device', langTags: tags });
      expect(entry.synthetic).toBe(true);
      expect(entry.suitableForAssessment).toBe(false);
    }
  });

  it('registers Azure fallback voices for Hindi and Thai using the documented standard voice ids', () => {
    const byLanguage = new Map(defaultRegistries().map((r) => [r.languageId, r]));
    expect(byLanguage.get('hi')!.entries.filter((e) => e.provider === 'remote').map((e) => e.source.kind === 'remote' && e.source.providerVoice))
      .toEqual(['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural']);
    expect(byLanguage.get('th')!.entries.filter((e) => e.provider === 'remote').map((e) => e.source.kind === 'remote' && e.source.providerVoice))
      .toEqual(['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural']);
    for (const languageId of ['hi', 'th'] as const) {
      for (const entry of byLanguage.get(languageId)!.entries.filter((e) => e.provider === 'remote')) {
        expect(entry).toMatchObject({ execution: 'remote', synthetic: true, qualityVerification: 'unverified', suitableForAssessment: false, licence: AZURE_LICENCE });
      }
    }
  });

  it('keeps German recording/device coverage and adds documented Azure fallback voices', () => {
    const de = defaultRegistries().find((r) => r.languageId === 'de')!;
    expect(de.entries.filter((e) => e.provider === 'recorded')).toHaveLength(1);
    expect(de.entries.filter((e) => e.provider === 'device')).toHaveLength(1);
    expect(de.entries.filter((e) => e.provider === 'remote').map((e) => e.source.kind === 'remote' && e.source.providerVoice))
      .toEqual(['de-DE-KatjaNeural', 'de-DE-ConradNeural']);
  });
  it('merges registries of the same language', () => {
    const merged = indexRegistries([albanianRegistry(), deviceRegistry('sq', ['sq'], 'Albanian')]).get('sq')!;
    expect(merged.entries).toHaveLength(4);
  });
});

describe('listing and availability', () => {
  it('lists only device voices whose language matches, and shows an unavailable template when none is installed', async () => {
    const some = make({ voices: [EN, ES, SQ_AL] });
    const listed = await some.g.voices('sq');
    const device = listed.filter((v) => v.provider === 'device');
    expect(device.map((v) => v.label)).toEqual(['Device voice: Fake Albanian AL (sq-AL)']);
    expect(await device[0].availability()).toBe('available');

    const none = make({ voices: [EN, ES] });
    const t = (await none.g.voices('sq')).filter((v) => v.provider === 'device');
    expect(t).toHaveLength(1);
    expect(t[0].label).toMatch(/none installed/);
    expect(await t[0].availability()).toBe('unavailable');
  });

  it('a network browser voice is available only with consent', async () => {
    const { g, state } = make({ voices: [SQ_NET] });
    const v = (await g.voices('sq')).find((x) => x.provider === 'device')!;
    expect(v.execution).toBe('remote');
    expect(await v.availability()).toBe('needs-consent');
    state.consent = true;
    expect(await v.availability()).toBe('available');
  });

  it('remote: needs-consent without consent (and no request), needs-key when the proxy has no key, available when it offers the voice', async () => {
    const id = 'azure-speech:sq-AL-AnilaNeural';

    const net1 = configuredProxy();
    const a = make({ net: net1 });
    expect(await stateOf(a.g, id)).toBe('needs-consent');
    expect(net1.calls).toHaveLength(0);

    const b = make({ net: unconfiguredProxy(), consent: true });
    expect(await stateOf(b.g, id)).toBe('needs-key');

    const net3 = configuredProxy();
    const c = make({ net: net3, consent: true });
    expect(await stateOf(c.g, id)).toBe('available');
    expect(net3.calls.map((x) => x.url)).toEqual(['/api/speech/status', '/api/speech/voices?lang=sq']);
    expect(net3.calls.every((x) => !('body' in (x.init ?? {})))).toBe(true); // availability sends no text at all
  });

  it('remote: unavailable when there is no proxy (static host), the network is down, or the voice is not offered; needs-key when the key is rejected', async () => {
    const id = 'azure-speech:sq-AL-AnilaNeural';
    const noProxy = make({ consent: true, net: fakeFetch(() => jsonResponse(404, { error: 'not-found' })) });
    expect(await stateOf(noProxy.g, id)).toBe('unavailable');

    const down = make({ consent: true, net: fakeFetch(() => { throw new TypeError('Failed to fetch'); }) });
    expect(await stateOf(down.g, id)).toBe('unavailable');

    const missing = make({ consent: true, net: fakeFetch((url) => (url.endsWith('/status') ? jsonResponse(200, { configured: true }) : jsonResponse(200, { voices: [{ id: 'sq-AL-IlirNeural' }] }))) });
    expect(await stateOf(missing.g, id)).toBe('unavailable');
    expect(await stateOf(missing.g, 'azure-speech:sq-AL-IlirNeural')).toBe('available');

    const rejected = make({ consent: true, net: fakeFetch((url) => (url.endsWith('/status') ? jsonResponse(200, { configured: true }) : jsonResponse(401, { error: 'missing-credentials' }))) });
    expect(await stateOf(rejected.g, id)).toBe('needs-key');
  });

  it('caches the proxy answer briefly, and re-asks after it expires', async () => {
    let t = 0;
    const net = configuredProxy();
    const { g } = make({ net, consent: true, now: () => t });
    await g.availability('sq');
    const first = net.calls.length;
    await g.availability('sq');
    expect(net.calls.length).toBe(first);
    t += 61_000;
    await g.availability('sq');
    expect(net.calls.length).toBeGreaterThan(first);
  });

  it('withdrawing consent flips remote back to needs-consent at once, despite the cache', async () => {
    const { g, state } = make({ net: configuredProxy(), consent: true });
    expect(await stateOf(g, 'azure-speech:sq-AL-AnilaNeural')).toBe('available');
    state.consent = false;
    expect(await stateOf(g, 'azure-speech:sq-AL-AnilaNeural')).toBe('needs-consent');
  });

  it('availability(): the summary says whether anything can speak and what is honestly missing', async () => {
    const none = await make({ voices: [EN] }).g.availability('sq');
    expect(none.canPronounce).toBe(false);
    expect(none.gaps.join(' ')).toMatch(/No Albanian recordings exist/);
    expect(none.voices.map((v) => v.state).sort()).toEqual(['needs-consent', 'needs-consent', 'unavailable']);

    const some = await make({ voices: [SQ_AL] }).g.availability('sq');
    expect(some.canPronounce).toBe(true);

    const unknown = await make().g.availability('xx');
    expect(unknown).toMatchObject({ canPronounce: false, voices: [] });
    expect(unknown.gaps.join(' ')).toMatch(/nothing is claimed/);
    expect(await make().g.voices('xx')).toEqual([]);
  });

  it('the German demonstration appears as one available recorded voice', async () => {
    const { g } = make();
    const de = await g.availability('de');
    expect(de.voices.filter((v) => v.provider === 'recorded')).toHaveLength(1);
    expect(de.voices.find((v) => v.provider === 'recorded')).toMatchObject({ state: 'available', synthetic: false });
  });
});

describe('phonetic detail without audio', () => {
  it('lists Albanian letter values for the letters present, with its source and its limits', async () => {
    const { g } = make();
    const p = g.phonetics({ languageId: 'sq', text: 'Mirëdita, shqip', kind: 'phrase' })!;
    expect(p.notes.join(' ')).toMatch(/"ë"/);
    expect(p.notes.join(' ')).toMatch(/"sh"/);
    expect(p.notes.join(' ')).toMatch(/"q"/);
    expect(p.ipa).toBeUndefined(); // no whole-word transcription is claimed
    expect(p.stress).toBeUndefined();
    expect(p.source).toMatch(/not reviewed by a native speaker/);
    expect(g.phonetics({ languageId: 'sq', text: 'mirdita', kind: 'word' })).toBeUndefined();
    expect(g.phonetics({ languageId: 'de', text: 'Guten Tag', kind: 'phrase' })).toBeUndefined();
  });

  it('is attached to a successful pronunciation, and is available when no audio is', async () => {
    const withVoice = make({ voices: [SQ_AL] }).g;
    const r = await withVoice.pronounce({ languageId: 'sq', text: 'çfarë', kind: 'word' });
    expect(r.ok && r.phonetic?.notes.join(' ')).toMatch(/"ç"/);
    const noVoice = make({ voices: [EN] }).g;
    expect((await noVoice.pronounce({ languageId: 'sq', text: 'çfarë', kind: 'word' })).ok).toBe(false);
    expect(noVoice.phonetics({ languageId: 'sq', text: 'çfarë', kind: 'word' })).toBeDefined();
  });
});
