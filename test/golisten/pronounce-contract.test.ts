// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { validateEvent, validatePayload } from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import { albanianRegistry, createGoListen, defaultRegistries, isIndependentEvidence } from '../../packages/golisten/src';
import type { GoListenOptions, PronunciationProvenance, PronunciationResult } from '../../packages/golisten/src';
import { SQ_AL, configuredProxy, fakeAudio, fakeFetch, fakeObjectUrls, fakeSpeech, fakeUtterance } from './pronounce-fakes';

const TEXT = 'mirëdita';
const base = (o: Partial<GoListenOptions> = {}): GoListenOptions => ({
  registries: defaultRegistries(), consent: () => ({ remoteSpeech: true }), speech: fakeSpeech([SQ_AL]), audio: fakeAudio(1200),
  fetch: configuredProxy().fetch, objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0, ...o,
});
const ok = (r: PronunciationResult) => { if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.message}`); return r; };

describe('isIndependentEvidence: the evidence-direction rule', () => {
  const p = (o: Partial<PronunciationProvenance>): PronunciationProvenance => ({ source: 'recording', voiceId: 'v', generatedFromText: false, reviewedRecording: true, note: '', ...o });
  it('only a reviewed human recording that was not generated from the text qualifies', () => {
    expect(isIndependentEvidence(p({}))).toBe(true);
    expect(isIndependentEvidence(p({ reviewedRecording: false }))).toBe(false);
    expect(isIndependentEvidence(p({ reviewedRecording: undefined }))).toBe(false);
    expect(isIndependentEvidence(p({ generatedFromText: true }))).toBe(false);
    expect(isIndependentEvidence(p({ source: 'device-tts', generatedFromText: true }))).toBe(false);
    expect(isIndependentEvidence(p({ source: 'remote-tts', generatedFromText: true, reviewedRecording: true }))).toBe(false);
    // even a mislabelled synthetic path that claims review cannot pass
    expect(isIndependentEvidence(p({ source: 'device-tts', generatedFromText: false, reviewedRecording: true }))).toBe(false);
  });

  it('is false for every synthetic path GoListen can produce', async () => {
    const device = ok(await createGoListen(base()).pronounce({ languageId: 'sq', text: TEXT, kind: 'word' }));
    expect(device.provenance.source).toBe('device-tts');
    const remote = ok(await createGoListen(base({ speech: fakeSpeech([]) })).pronounce({ languageId: 'sq', text: TEXT, kind: 'word' }));
    expect(remote.provenance.source).toBe('remote-tts');
    const demo = ok(await createGoListen(base()).pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase' }));
    expect(demo.provenance.source).toBe('recording');
    for (const r of [device, remote, demo]) expect(isIndependentEvidence(r.provenance), r.provenance.source).toBe(false);
    expect(device.voice.synthetic && remote.voice.synthetic).toBe(true);
  });
});

describe('PronunciationPlayed events', () => {
  it('has the contract payload shape and validates with the Repository contract', async () => {
    const g = createGoListen(base());
    const r = ok(await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'word', autoplay: true }));
    const ev = g.events(r, true)!;
    expect(ev.kind).toBe('PronunciationPlayed');
    expect(ev.payload).toEqual({ voice: 'synthetic', voiceId: 'device:Fake Albanian AL', repeated: false });
    expect(validatePayload('PronunciationPlayed', ev.payload)).toEqual([]);
    expect(ev.evidence).toEqual({ quality: 'none', assisted: false });
    expect(JSON.stringify(ev)).not.toContain(TEXT); // no text, ever
  });

  it('reports a recording as recorded, with its duration, and a replay as repeated', async () => {
    const g = createGoListen(base({ speech: fakeSpeech([]) }));
    const r = ok(await g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase' }));
    r.playback.play();
    r.playback.replay();
    const ev = g.events(r, true)!;
    expect(ev.payload.voice).toBe('recorded');
    expect(ev.payload.voiceId).toBe('recording:de-guten-tag-commons');
    expect(ev.payload.repeated).toBe(true);
    expect(ev.payload.durationMs).toBe(1200);
    expect(validatePayload('PronunciationPlayed', ev.payload)).toEqual([]);
  });

  it('wraps into a valid contract event, with evidence quality none', async () => {
    const g = createGoListen(base());
    const r = ok(await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'word', autoplay: true }));
    const e = g.events(r, true)!;
    const event: GoEvent = {
      id: 'evt-1', v: 2, learnerId: 'learner-1', enrolmentId: 'enrol-1', languageId: 'sq', at: '2026-10-08T10:00:00Z',
      producer: { app: 'golearn-ext', version: '0.0.0', deviceId: 'dev-1', surface: 'reading-card' },
      kind: e.kind, subject: { itemIds: ['sq:lex:mirëdita'] }, payload: e.payload as unknown as Record<string, unknown>, evidence: e.evidence,
    };
    expect(validateEvent(event)).toEqual([]);
  });

  it('is never a ListeningAssessed payload, in any state, for any result', async () => {
    const g = createGoListen(base());
    const results = [
      ok(await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'word', autoplay: true })),
      ok(await g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase', autoplay: true })),
      await g.pronounce({ languageId: 'xx', text: TEXT, kind: 'word' }),
    ];
    for (const r of results) for (const ended of [true, false]) {
      const ev = g.events(r, ended);
      if (!ev) continue;
      expect(ev.kind).toBe('PronunciationPlayed');
      expect(JSON.stringify(ev)).not.toMatch(/ListeningAssessed|answerShownBefore|correct/);
      expect(ev.evidence.quality).toBe('none');
    }
  });

  it('produces nothing for a failure, or for audio that was never played', async () => {
    const g = createGoListen(base());
    expect(g.events(await g.pronounce({ languageId: 'xx', text: TEXT, kind: 'word' }), true)).toBeNull();
    const idle = ok(await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'word' }));
    expect(g.events(idle, false)).toBeNull();
    expect(g.events(idle, true)?.payload.durationMs).toBeUndefined(); // not played, so no measured duration invented
  });
});

describe('pronounce never throws and never blocks', () => {
  const REQ = { languageId: 'sq', text: TEXT, kind: 'word' } as const;
  const cases: Array<[string, Partial<GoListenOptions>]> = [
    ['getVoices throws', { speech: { ...fakeSpeech([]), getVoices: () => { throw new Error('boom'); } }, consent: () => ({ remoteSpeech: false }) }],
    ['consent throws', { consent: () => { throw new Error('boom'); } }],
    ['fetch throws', { speech: fakeSpeech([]), fetch: fakeFetch(() => { throw new TypeError('Failed to fetch'); }).fetch }],
    ['fetch rejects asynchronously', { speech: fakeSpeech([]), fetch: () => Promise.reject(new Error('boom')) }],
    ['response body blows up', { speech: fakeSpeech([]), fetch: async () => ({ ok: true, status: 200, headers: { get: () => 'audio/wav' }, json: async () => ({}), blob: async () => { throw new Error('boom'); } }) }],
    ['utterance factory throws (play fails, not pronounce)', { utterance: () => { throw new Error('boom'); } }],
    ['object urls throw', { speech: fakeSpeech([]), objectUrl: { create: () => { throw new Error('boom'); }, revoke: () => undefined } }],
    ['audio port throws', { speech: fakeSpeech([]), audio: { open: () => { throw new Error('boom'); } } }],
  ];
  for (const [name, o] of cases) {
    it(`${name}: a result, not an exception`, async () => {
      const g = createGoListen(base(o));
      const r = await g.pronounce({ ...REQ, autoplay: true });
      expect(typeof r.ok).toBe('boolean');
      if (!r.ok) {
        expect(r.message.length).toBeGreaterThan(0);
        expect(r.alternatives.length).toBeGreaterThan(0);
        expect(JSON.stringify(r)).not.toContain(TEXT);
      } else {
        expect(() => { r.playback.play(); r.playback.replay(); r.playback.pause(); r.playback.stop(); r.playback.dispose(); }).not.toThrow();
      }
    });
  }

  it('bad requests are unsupported-kind results', async () => {
    const g = createGoListen(base());
    for (const bad of [{ ...REQ, text: '   ' }, { ...REQ, text: '' }, { ...REQ, kind: 'paragraph' as never }, null as never, undefined as never, { languageId: 'sq', kind: 'word' } as never]) {
      const r = await g.pronounce(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('unsupported-kind');
    }
  });

  it('an unregistered language is a no-voice result that says nothing is claimed', async () => {
    const r = await createGoListen(base({ registries: [albanianRegistry()] })).pronounce({ languageId: 'zz', text: TEXT, kind: 'word' });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('no-voice'); expect(r.alternatives.join(' ')).toMatch(/text-first/); }
  });

  it('a failing preferred provider falls through to the next one', async () => {
    const fx = configuredProxy();
    const g = createGoListen(base({ fetch: fx.fetch }));
    const r = ok(await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'word', preferred: 'remote' }));
    expect(r.provenance.source).toBe('remote-tts'); // preferred is tried first
    const down = createGoListen(base({ fetch: fakeFetch(() => { throw new TypeError('x'); }).fetch }));
    const r2 = ok(await down.pronounce({ languageId: 'sq', text: TEXT, kind: 'word', preferred: 'remote' }));
    expect(r2.provenance.source).toBe('device-tts'); // remote was down; the local voice answered
  });

  it('does not touch the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const g = createGoListen(base({ fetch: fakeFetch(() => { throw new TypeError('x'); }).fetch, speech: fakeSpeech([]) }));
    await g.pronounce({ languageId: 'sq', text: TEXT, kind: 'word' });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
