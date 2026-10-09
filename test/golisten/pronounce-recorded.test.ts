// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGoListen, defaultRegistries, demoGermanRegistry, deviceRegistry, isIndependentEvidence } from '../../packages/golisten/src';
import type { PronunciationResult, VoiceRegistry } from '../../packages/golisten/src';
import { fakeAudio, fakeSpeech, fakeUtterance, voice } from './pronounce-fakes';

afterEach(() => { vi.unstubAllGlobals(); });
const FIXTURE = path.resolve(__dirname, '../fixtures/golisten/de-guten-tag.wav');
const FIXTURE_URL = pathToFileURL(FIXTURE).href;
const ok = (r: PronunciationResult) => { if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.message}`); return r; };

const make = (registries: VoiceRegistry[] = [demoGermanRegistry({ url: FIXTURE_URL })], o: { audio?: ReturnType<typeof fakeAudio> | null; speech?: ReturnType<typeof fakeSpeech> } = {}) => {
  const audio = o.audio === null ? undefined : (o.audio ?? fakeAudio(2640));
  const g = createGoListen({ registries, consent: () => ({ remoteSpeech: false }), speech: o.speech ?? fakeSpeech([]), audio, utterance: fakeUtterance, voiceWaitMs: 0 });
  return { g, audio };
};

describe('the German demonstration recording', () => {
  it('the fixture asset really is the PD-self WAV described in its README', () => {
    const bytes = fs.readFileSync(FIXTURE);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WAVE');
    expect(fs.readFileSync(path.resolve(FIXTURE, '../README.md'), 'utf8')).toMatch(/public domain/i);
  });

  it('plays the fixture URL through the AudioPort and is labelled as a demonstration asset', async () => {
    const { g, audio } = make();
    const r = ok(await g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase' }));
    expect(r.voice).toMatchObject({
      provider: 'recorded', execution: 'local', synthetic: false, languageId: 'de', qualityVerification: 'unverified', suitableForAssessment: false,
    });
    expect(r.voice.label).toBe('demonstration asset (German recording)');
    expect(r.voice.licence).toMatch(/Public domain \(PD-self/);
    expect(r.voice.knownLimitations.join(' ')).toMatch(/Not suitable for listening assessment/);
    expect(r.provenance).toMatchObject({ source: 'recording', generatedFromText: false, reviewedRecording: false });
    expect(r.provenance.note).toMatch(/Beagle Beck/);

    expect(audio!.opened).toHaveLength(0);
    r.playback.play();
    expect(audio!.opened).toEqual([FIXTURE_URL]);
    expect(audio!.clips[0].plays).toBe(1);
    expect(r.playback.state).toBe('playing');
    audio!.clips[0].finish();
    expect(r.playback.state).toBe('ended');
    expect(r.playback.durationMs).toBe(2640);
  });

  it('a recording is not independent evidence until a human has reviewed it, and the demo has not been reviewed', async () => {
    const r = ok(await make().g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase' }));
    expect(isIndependentEvidence(r.provenance)).toBe(false);
  });

  it('matches the spoken text only: ignoring case and punctuation, never serving it for other text', async () => {
    const { g, audio } = make();
    ok(await g.pronounce({ languageId: 'de', text: '  guten   TAG ', kind: 'phrase' }));
    const other = await g.pronounce({ languageId: 'de', text: 'Guten Abend!', kind: 'phrase', autoplay: true });
    expect(other.ok).toBe(false);
    if (!other.ok) {
      expect(other.reason).toBe('no-voice');
      expect(other.message).toMatch(/nothing is claimed/);
    }
    expect(audio!.opened).toHaveLength(0);
  });

  it('serves a phrase only: the kind the recording supports', async () => {
    const r = await make().g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'word' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported-kind');
  });

  it('without an audio output it fails softly; a play() the browser rejects puts the handle in error', async () => {
    vi.stubGlobal('Audio', undefined); // jsdom has an Audio element; this environment has none
    const none = await make(undefined, { audio: null }).g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase' });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.reason).toBe('provider-error');

    const audio = fakeAudio();
    audio.rejectPlay = true;
    const r = ok(await make(undefined, { audio }).g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase', autoplay: true }));
    await new Promise((res) => setTimeout(res, 0));
    expect(r.playback.state).toBe('error');
  });

  it('recorded comes first by default and a device voice can be preferred; a registry may combine both', async () => {
    const both = [demoGermanRegistry({ url: FIXTURE_URL }), deviceRegistry('de', ['de', 'de-DE'], 'German')];
    const speech = fakeSpeech([voice('Fake German', 'de-DE')]);
    const { g } = make(both, { speech });
    const first = ok(await g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase' }));
    expect(first.provenance.source).toBe('recording');
    const dev = ok(await g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase', preferred: 'device' }));
    expect(dev.provenance.source).toBe('device-tts');
    const text = ok(await g.pronounce({ languageId: 'de', text: 'Guten Abend!', kind: 'phrase' }));
    expect(text.provenance.source).toBe('device-tts'); // the recording cannot say it; the device voice is the practice fallback
  });

  it('the default registries carry sq, the de demonstration and es', () => {
    expect(defaultRegistries().map((r) => r.languageId)).toEqual(['sq', 'de', 'es', 'hi', 'th', 'nb', 'nn']);
  });
});
