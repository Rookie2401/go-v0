// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { albanianRegistry, createGoListen, deviceRegistry, isIndependentEvidence } from '../../packages/golisten/src';
import type { PronunciationResult, SpeechLike, SpeechVoiceLike } from '../../packages/golisten/src';
import { EN, ES, SQ, SQ_AL, SQ_NET, fakeAudio, fakeFetch, fakeSpeech, fakeUtterance, jsonResponse, voice } from './pronounce-fakes';
import type { FakeSpeech } from './pronounce-fakes';

function setup(voices: SpeechVoiceLike[], o: { consent?: boolean; clock?: () => number; speech?: SpeechLike; deviceOnly?: boolean } = {}) {
  const speech: FakeSpeech = fakeSpeech(voices);
  const net = fakeFetch(() => jsonResponse(500, { error: 'x' }));
  const g = createGoListen({
    registries: [o.deviceOnly ? deviceRegistry('sq', ['sq-AL', 'sq'], 'Albanian') : albanianRegistry()], consent: () => ({ remoteSpeech: o.consent ?? false }), speech: o.speech ?? speech,
    audio: fakeAudio(), fetch: net.fetch, utterance: fakeUtterance, now: o.clock, voiceWaitMs: 0,
  });
  return { g, speech, net };
}
const ok = (r: PronunciationResult) => { if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.message}`); return r; };

describe('device voices: strict language match', () => {
  it('an English voice is never substituted for Albanian: nothing is spoken, and the result says what the device does offer', async () => {
    // device-only registry: the only possible answer is no-voice
    const only = setup([EN, ES], { deviceOnly: true });
    const r0 = await only.g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', autoplay: true });
    expect(r0.ok).toBe(false);
    if (r0.ok) return;
    expect(r0.reason).toBe('no-voice');
    expect(r0.message).toMatch(/no sq voice/);
    expect(r0.message).toMatch(/en-US/);
    expect(r0.alternatives.length).toBeGreaterThan(0);
    expect(only.speech.spoken).toHaveLength(0);

    // the Albanian registry also lists the remote voice: without consent the most actionable reason leads, still no speech
    const { g, speech, net } = setup([EN, ES]);
    const r = await g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', autoplay: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no-consent');
    expect(r.message).toMatch(/no sq voice/); // the device finding is still reported
    expect(r.alternatives.join(' ')).toMatch(/remote speech/i);
    expect(speech.spoken).toHaveLength(0);
    expect(net.calls).toHaveLength(0);
  });

  it('asking for the English voice by id for Albanian is refused as wrong-language-voice, and never speaks', async () => {
    const { g, speech } = setup([EN, SQ]);
    const r = await g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', voiceId: 'device:Fake English', autoplay: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wrong-language-voice');
    expect(speech.spoken).toHaveLength(0);
  });

  it('accepts sq and sq-AL (also written sq_AL) only; a near language or another region is not accepted', async () => {
    for (const v of [voice('A', 'sq'), voice('B', 'sq-AL'), voice('C', 'sq_AL'), voice('D', 'SQ-al')]) {
      const { g } = setup([EN, v]);
      const r = ok(await g.pronounce({ languageId: 'sq', text: 'në', kind: 'word' }));
      expect(r.voice.label).toContain(v.name);
    }
    for (const bad of [voice('Kosovo', 'sq-XK'), voice('Macedonian', 'mk-MK'), voice('Sq3', 'sqi'), voice('Spanish', 'es-ES'), voice('Slovak', 'sk-SK')]) {
      const { g, speech } = setup([EN, bad]);
      const r = await g.pronounce({ languageId: 'sq', text: 'në', kind: 'word', autoplay: true });
      expect(r.ok, bad.lang).toBe(false);
      expect(speech.spoken, bad.lang).toHaveLength(0);
    }
  });

  it('prefers sq-AL over bare sq, and a local voice over a network voice', async () => {
    const a = ok(await setup([SQ, SQ_AL]).g.pronounce({ languageId: 'sq', text: 'në', kind: 'word' }));
    expect(a.voice.voiceId).toBe('device:Fake Albanian AL');
    expect(a.voice.varietyId).toBe('sq-AL');
    const b = ok(await setup([SQ_NET, SQ]).g.pronounce({ languageId: 'sq', text: 'në', kind: 'word' }));
    expect(b.voice.voiceId).toBe('device:Fake Albanian');
    expect(b.voice.varietyId).toBeUndefined(); // a bare "sq" tag makes no regional claim
  });

  it('describes the device voice honestly: synthetic, local, unverified, never for assessment', async () => {
    const r = ok(await setup([SQ_AL]).g.pronounce({ languageId: 'sq', text: 'në', kind: 'word' }));
    expect(r.voice).toMatchObject({ provider: 'device', execution: 'local', synthetic: true, qualityVerification: 'unverified', suitableForAssessment: false, languageId: 'sq' });
    expect(r.voice.supports).toEqual(['word', 'phrase', 'sentence']);
    expect(r.provenance).toMatchObject({ source: 'device-tts', generatedFromText: true });
    expect(r.provenance.note).toMatch(/practice only/);
    expect(isIndependentEvidence(r.provenance)).toBe(false);
  });
});

describe('device voices: a network browser voice needs consent', () => {
  it('without consent a not-local voice is not used (no-consent) and nothing is spoken', async () => {
    const { g, speech } = setup([SQ_NET], { consent: false });
    const r = await g.pronounce({ languageId: 'sq', text: 'në', kind: 'word', autoplay: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-consent');
    expect(speech.spoken).toHaveLength(0);
  });
  it('with consent it is used and described as remote execution', async () => {
    const { g } = setup([SQ_NET], { consent: true });
    const r = ok(await g.pronounce({ languageId: 'sq', text: 'në', kind: 'word', preferred: 'device', processingPermission: 'allowed' }));
    expect(r.voice.execution).toBe('remote');
    expect(r.voice.knownLimitations.join(' ')).toMatch(/not local/);
  });
});

describe('device playback lifecycle', () => {
  it('plays, ends, counts replays, reports measured duration, and honours the rate', async () => {
    let t = 10_000;
    const { g, speech } = setup([SQ_AL], { clock: () => t });
    const r = ok(await g.pronounce({ languageId: 'sq', text: '  mirëdita   shokë ', kind: 'phrase', rate: 0.8 }));
    const pb = r.playback;
    expect(pb.state).toBe('idle');
    expect(pb.replays).toBe(0);
    expect(pb.rate).toBe(0.8);
    expect(speech.spoken).toHaveLength(0); // not autoplay

    pb.play();
    expect(pb.state).toBe('playing');
    expect(speech.spoken).toHaveLength(1);
    const u = speech.spoken[0];
    expect(u.text).toBe('mirëdita shokë'); // whitespace normalised, nothing else changed
    expect(u.lang).toBe('sq-AL');
    expect(u.rate).toBe(0.8);
    expect((u.voice as SpeechVoiceLike).name).toBe('Fake Albanian AL');

    let ended = 0;
    const off = pb.onEnd(() => { ended += 1; });
    t += 900;
    speech.finish();
    expect(pb.state).toBe('ended');
    expect(ended).toBe(1);
    expect(pb.durationMs).toBe(900);
    expect(pb.replays).toBe(0);

    pb.setRate(1.2);
    pb.replay();
    expect(pb.state).toBe('playing');
    expect(pb.replays).toBe(1);
    expect(speech.spoken).toHaveLength(2);
    expect(speech.spoken[1].rate).toBe(1.2);
    speech.finish();
    expect(ended).toBe(2);

    off();
    pb.play(); // after the end, a new hearing counts as a replay
    expect(pb.replays).toBe(2);
    speech.finish();
    expect(ended).toBe(2); // unsubscribed
  });

  it('clamps the rate to 0.5 to 1.5, in the request and in setRate', async () => {
    const { g, speech } = setup([SQ_AL]);
    const fast = ok(await g.pronounce({ languageId: 'sq', text: 'në', kind: 'word', rate: 9 }));
    expect(fast.playback.rate).toBe(1.5);
    const slow = ok(await g.pronounce({ languageId: 'sq', text: 'në', kind: 'word', rate: 0.01 }));
    expect(slow.playback.rate).toBe(0.5);
    slow.playback.setRate(Number.NaN);
    expect(slow.playback.rate).toBe(1);
    slow.playback.setRate(2);
    expect(slow.playback.rate).toBe(1.5);
    slow.playback.play();
    expect(speech.spoken[0].rate).toBe(1.5);
  });

  it('pause and resume use the speaker without starting a new hearing; stop returns to idle and the cancel is not an error', async () => {
    const { g, speech } = setup([SQ_AL]);
    const pb = ok(await g.pronounce({ languageId: 'sq', text: 'në', kind: 'word', autoplay: true })).playback;
    expect(pb.state).toBe('playing');
    pb.pause();
    expect(pb.state).toBe('paused');
    expect(speech.pauses).toBe(1);
    pb.play();
    expect(pb.state).toBe('playing');
    expect(speech.resumes).toBe(1);
    expect(speech.spoken).toHaveLength(1);
    expect(pb.replays).toBe(0);
    pb.stop();
    expect(pb.state).toBe('idle'); // the fake reports the cancel as a 'canceled' error event; it must not mark an error
    expect(speech.cancels).toBeGreaterThan(0);
    speech.finish(); // a late end from the abandoned utterance is ignored
    expect(pb.state).toBe('idle');
  });

  it('an utterance error puts the handle in error; another voice taking the speaker returns it to idle', async () => {
    const a = setup([SQ_AL]);
    const pa = ok(await a.g.pronounce({ languageId: 'sq', text: 'në', kind: 'word', autoplay: true })).playback;
    a.speech.breakIt('synthesis-failed');
    expect(pa.state).toBe('error');

    const b = setup([SQ_AL]);
    const pb = ok(await b.g.pronounce({ languageId: 'sq', text: 'në', kind: 'word', autoplay: true })).playback;
    b.speech.breakIt('interrupted');
    expect(pb.state).toBe('idle');
  });

  it('a speaker that throws does not throw out of the handle', async () => {
    const speech = fakeSpeech([SQ_AL]);
    speech.speak = () => { throw new Error('boom'); };
    const { g } = setup([SQ_AL], { speech });
    const pb = ok(await g.pronounce({ languageId: 'sq', text: 'në', kind: 'word' })).playback;
    expect(() => pb.play()).not.toThrow();
    expect(pb.state).toBe('error');
    expect(() => { pb.replay(); pb.pause(); pb.stop(); pb.dispose(); }).not.toThrow();
  });

  it('waits briefly for the browser to fill its voice list the first time', async () => {
    const listeners: Array<() => void> = [];
    let loaded = false;
    const speech = fakeSpeech([]);
    speech.getVoices = () => (loaded ? [SQ_AL] : []);
    speech.addEventListener = (_t, cb) => { listeners.push(cb); };
    speech.removeEventListener = () => undefined;
    const g = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: false }), speech, audio: fakeAudio(), utterance: fakeUtterance, voiceWaitMs: 500 });
    const pending = g.pronounce({ languageId: 'sq', text: 'në', kind: 'word' });
    await new Promise((r) => setTimeout(r, 20));
    loaded = true;
    listeners.forEach((f) => f());
    expect(ok(await pending).voice.label).toContain('Fake Albanian AL');
  });
});


it('rechecks cloud consent at start, replay and paused resume', async () => {
  let allowed = true;
  const speech = fakeSpeech([SQ_NET]);
  const g = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: allowed }), speech, audio: fakeAudio(), utterance: fakeUtterance, voiceWaitMs: 0 });
  const result = await g.pronounce({ languageId: 'sq', text: 'test', kind: 'word', preferred: 'device', processingPermission: 'allowed' });
  if (!result.ok) throw new Error(result.message);
  allowed = false; result.playback.play();
  expect(result.playback.state).toBe('error'); expect(speech.spoken).toHaveLength(0);
  allowed = true; result.playback.replay(); result.playback.pause();
  allowed = false; result.playback.play();
  expect(result.playback.state).toBe('error'); expect(speech.resumes).toBe(0);
  result.playback.replay(); expect(speech.spoken).toHaveLength(1);
});

it('retired device handles cannot cancel, pause or resume the replacement', async () => {
  const speech = fakeSpeech([SQ_AL]);
  const { g } = setup([SQ_AL], { speech });
  const a = await g.pronounce({ languageId: 'sq', text: 'one', kind: 'word' });
  const b = await g.pronounce({ languageId: 'sq', text: 'two', kind: 'word' });
  if (!a.ok || !b.ok) throw new Error('unavailable');
  a.playback.play(); const old = speech.spoken[0];
  b.playback.play();
  expect(a.playback.state).toBe('idle');
  const cancels = speech.cancels;
  a.playback.pause(); a.playback.stop(); a.playback.dispose();
  old.onend?.(); old.onerror?.({ error: 'synthesis-failed' });
  expect(speech.cancels).toBe(cancels); expect(speech.pauses).toBe(0);
  expect(b.playback.state).toBe('playing');
  speech.finish(); expect(b.playback.state).toBe('ended');
});
