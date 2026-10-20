// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateEvent, validatePayload } from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import {
  albanianRegistry, assessmentEvidence, createGoListen, defaultRegistries, demoGermanRegistry, isAssessmentQualified, listeningAssessedPayload,
} from '../../packages/golisten/src';
import type { AudioStimulus, GoListenOptions, StimulusRequest, VoiceRegistry } from '../../packages/golisten/src';
import { SQ_AL, configuredProxy, fakeAudio, fakeObjectUrls, fakeSpeech, fakeUtterance } from './pronounce-fakes';

const TEXT = 'faleminderit';
const REQ: StimulusRequest = { languageId: 'sq', kind: 'word', text: TEXT, itemIds: ['sq:lex:0042'], processingPermission: 'allowed' };
const opts = (o: Partial<GoListenOptions> = {}): GoListenOptions => ({
  registries: defaultRegistries(), consent: () => ({ remoteSpeech: true }), speech: fakeSpeech([SQ_AL]), audio: fakeAudio(900),
  fetch: configuredProxy().fetch, objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0, ...o,
});
const stim = async (g: ReturnType<typeof createGoListen>, req: StimulusRequest = REQ): Promise<AudioStimulus> => {
  const s = await g.assessment().prepareStimulus(req);
  if ('unavailable' in s) throw new Error(`unavailable: ${s.reason}`);
  return s;
};

/** A registry holding a reviewed human recording, as a native-reviewed course will one day supply. Test-only. */
const reviewedRegistry = (suitable: boolean): VoiceRegistry => {
  const r = demoGermanRegistry({ url: 'https://example.test/reviewed.wav' });
  r.entries = r.entries.map((e) => ({ ...e, voiceId: 'recording:reviewed-test', qualityVerification: 'native-reviewed' as const, suitableForAssessment: suitable, supports: ['word', 'phrase', 'sentence'] as ('word' | 'phrase' | 'sentence')[], label: 'reviewed test recording', licence: 'Test licence', knownLimitations: [] }));
  return r;
};

describe('assessment stimuli hide the answer and reflect the evidence rule', () => {
  it('requires both native review and explicit assessment approval', () => {
    const base = { ...albanianRegistry().entries[0], synthetic: false as const, qualityVerification: 'native-reviewed' as const };
    expect(isAssessmentQualified({ ...base, suitableForAssessment: true })).toBe(true);
    expect(isAssessmentQualified({ ...base, suitableForAssessment: false })).toBe(false);
    expect(isAssessmentQualified({ ...base, qualityVerification: 'unverified' as const, suitableForAssessment: true })).toBe(false);
  });

  it('a device-voice stimulus is practice: answerHidden, not eligible, no text outside audio.text', async () => {
    const g = createGoListen(opts());
    const s = await stim(g);
    expect(s.answerHidden).toBe(true);
    expect(s.audio).toEqual({ kind: 'device', text: TEXT });
    expect(s.voice).toMatchObject({ provider: 'device', synthetic: true, suitableForAssessment: false });
    expect(s.validity.eligibleForEvidence).toBe(false);
    expect(s.validity.reason).toMatch(/never listening evidence/);
    expect(s.replaysAllowed).toBe(2);
    expect(s.itemIds).toEqual(['sq:lex:0042']);
    // the only place the written form appears is the field the device voice needs
    expect(JSON.stringify({ ...s, audio: undefined })).not.toContain(TEXT);
  });

  it('a remote-voice stimulus carries a URL and no text at all, and is not eligible', async () => {
    const g = createGoListen(opts({ speech: fakeSpeech([]) }));
    const s = await stim(g);
    expect(s.audio).toEqual({ kind: 'remote', url: 'blob:fake/1' });
    expect(JSON.stringify(s)).not.toContain(TEXT);
    expect(s.validity.eligibleForEvidence).toBe(false);
    expect(s.voice.synthetic).toBe(true);
  });

  it('the German demonstration recording is not eligible: it serves a phrase only, and it is unreviewed', async () => {
    const g = createGoListen(opts({ registries: [demoGermanRegistry()] }));
    const u = await g.assessment().prepareStimulus({ languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: [] });
    expect(u).toMatchObject({ unavailable: true }); // a stimulus is a word or a sentence; the demonstration is neither

    const wide = demoGermanRegistry({ url: 'https://example.test/demo.wav' });
    wide.entries = wide.entries.map((e) => ({ ...e, supports: ['word', 'phrase', 'sentence'] as ('word' | 'phrase' | 'sentence')[] }));
    const g2 = createGoListen(opts({ registries: [wide] }));
    const s = await stim(g2, { languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: [] });
    expect(s.audio.kind).toBe('recorded');
    expect(s.validity.eligibleForEvidence).toBe(false);
    expect(s.validity.reason).toMatch(/not been reviewed/);
  });

  it('a reviewed human recording marked suitable IS eligible; reviewed but not suitable is not; nothing synthetic ever is', async () => {
    const good = createGoListen(opts({ registries: [reviewedRegistry(true)] }));
    const s = await stim(good, { languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: ['de:x'] });
    expect(s.audio).toEqual({ kind: 'recorded', url: 'https://example.test/reviewed.wav' });
    expect(s.validity.eligibleForEvidence).toBe(true);
    expect(JSON.stringify(s)).not.toContain('Guten');
    const meta = good.assessment().scoringMetadata(s, 1);
    expect(meta).toEqual({ voice: 'recorded', hinted: false, replays: 1, eligibleForEvidence: true });
    expect(assessmentEvidence(meta)).toEqual({ quality: 'moderate', assisted: false });
    expect(assessmentEvidence(good.assessment().scoringMetadata(s, 3))).toEqual({ quality: 'weak', assisted: true });

    const notSuitable = createGoListen(opts({ registries: [reviewedRegistry(false)] }));
    const s2 = await stim(notSuitable, { languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: ['de:x'] });
    expect(s2.validity.eligibleForEvidence).toBe(false);
  });

  it('eligibility cannot be forged onto a synthetic stimulus', async () => {
    const g = createGoListen(opts());
    const src = g.assessment();
    const s = await src.prepareStimulus(REQ) as AudioStimulus;
    const forged: AudioStimulus = { ...s, validity: { eligibleForEvidence: true, reason: 'trust me' } };
    const meta = src.scoringMetadata(forged, 0);
    expect(meta.eligibleForEvidence).toBe(false);
    expect(meta.voice).toBe('synthetic');
    expect(assessmentEvidence(meta).quality).toBe('none');
    expect(assessmentEvidence({ ...meta, eligibleForEvidence: true }).quality).toBe('none'); // a synthetic voice is never evidence, even if mislabelled
  });

  it('is unavailable (not an error) when nothing can speak the text', async () => {
    const g = createGoListen(opts({ speech: fakeSpeech([]), consent: () => ({ remoteSpeech: false }) }));
    const u = await g.assessment().prepareStimulus(REQ);
    expect(u).toMatchObject({ unavailable: true });
    if ('unavailable' in u) expect(u.reason.length).toBeGreaterThan(0);
    const unknown = await g.assessment().prepareStimulus({ ...REQ, languageId: 'zz' });
    expect(unknown).toMatchObject({ unavailable: true });
    const empty = await g.assessment().prepareStimulus({ ...REQ, text: ' ' });
    expect(empty).toMatchObject({ unavailable: true });
  });
});

describe('scoring metadata maps onto the Repository contract', () => {
  it('counts replays, flags hints beyond the allowance, and says synthetic for a synthetic voice', async () => {
    const g = createGoListen(opts());
    const s = await stim(g);
    const src = g.assessment();
    expect(src.scoringMetadata(s, 0)).toEqual({ voice: 'synthetic', hinted: false, replays: 0, eligibleForEvidence: false });
    expect(src.scoringMetadata(s, 2).hinted).toBe(false);
    expect(src.scoringMetadata(s, 3)).toMatchObject({ hinted: true, replays: 3 });
    expect(src.scoringMetadata(s, -4).replays).toBe(0);
  });

  it('builds a ListeningAssessed payload the contract accepts: answerShownBefore false, evidence none for synthetic', async () => {
    const g = createGoListen(opts());
    const s = await stim(g);
    const meta = g.assessment().scoringMetadata(s, 1);
    const payload = listeningAssessedPayload(s, meta, { correct: true, responseMode: 'choice', latencyMs: 2300, difficulty: 0.4 });
    expect(payload).toEqual({ stimulus: 'word', voice: 'synthetic', answerShownBefore: false, correct: true, responseMode: 'choice', hinted: false, latencyMs: 2300, difficulty: 0.4 });
    expect(validatePayload('ListeningAssessed', payload)).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain(TEXT);

    const evidence = assessmentEvidence(meta);
    expect(evidence.quality).toBe('none');
    const event: GoEvent = {
      id: 'evt-2', v: 2, learnerId: 'l', enrolmentId: 'e', languageId: 'sq', at: '2026-10-08T10:00:00Z',
      producer: { app: 'gopractice-review', version: '0.0.0', deviceId: 'd', surface: 'listening-exercise' },
      kind: 'ListeningAssessed', subject: { itemIds: s.itemIds }, payload: payload as unknown as Record<string, unknown>, evidence,
    };
    expect(validateEvent(event)).toEqual([]);
  });

  it('a reviewed-recording result validates too, with quality above none', async () => {
    const g = createGoListen(opts({ registries: [reviewedRegistry(true)] }));
    const s = await stim(g, { languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: ['de:x'] });
    const meta = g.assessment().scoringMetadata(s, 0);
    const payload = listeningAssessedPayload(s, meta, { correct: false, responseMode: 'typed' });
    expect(payload).toMatchObject({ voice: 'recorded', answerShownBefore: false, hinted: false });
    expect(validatePayload('ListeningAssessed', payload)).toEqual([]);
    expect(assessmentEvidence(meta).quality).toBe('moderate');
  });
});

describe('playing a stimulus', () => {
  it('device: speaks the stimulus text and the replay count flows into the scoring metadata', async () => {
    const speech = fakeSpeech([SQ_AL]);
    const g = createGoListen(opts({ speech }));
    const src = g.assessment();
    const s = await stim(g);
    const pb = src.playbackOf(s);
    pb.play();
    expect(speech.spoken.map((u) => u.text)).toEqual([TEXT]);
    speech.finish();
    pb.replay();
    pb.replay();
    pb.replay();
    expect(pb.replays).toBe(3);
    expect(src.scoringMetadata(s, pb.replays).hinted).toBe(true);
  });

  it('recorded and remote: play through the AudioPort', async () => {
    const audio = fakeAudio(700);
    const rec = createGoListen(opts({ registries: [reviewedRegistry(true)], audio }));
    const s = await stim(rec, { languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: [] });
    rec.assessment().playbackOf(s).play();
    expect(audio.opened).toEqual(['https://example.test/reviewed.wav']);

    const audio2 = fakeAudio(700);
    const rem = createGoListen(opts({ speech: fakeSpeech([]), audio: audio2 }));
    const s2 = await stim(rem);
    const p = rem.assessment().playbackOf(s2);
    p.play();
    p.replay();
    expect(audio2.opened).toEqual(['blob:fake/1']);
    expect(audio2.clips[0].plays).toBe(2);
  });

  it('a stimulus whose voice has gone gives an error handle, not an exception; a device stimulus for a foreign-language voice is refused', async () => {
    const speech = fakeSpeech([SQ_AL]);
    const g = createGoListen(opts({ speech }));
    const s = await stim(g);
    speech.getVoices = () => [];
    const gone = g.assessment().playbackOf(s);
    expect(() => gone.play()).not.toThrow();
    expect(gone.state).toBe('error');

    const forged: AudioStimulus = { ...s, voice: { ...s.voice, voiceId: 'device:Fake English' } };
    const speech2 = fakeSpeech([SQ_AL, { name: 'Fake English', lang: 'en-US', voiceURI: 'Fake English', localService: true }]);
    const g2 = createGoListen(opts({ speech: speech2 }));
    const refused = g2.assessment().playbackOf(forged);
    refused.play();
    expect(refused.state).toBe('error');
    expect(speech2.spoken).toHaveLength(0);
    // an unregistered language likewise
    expect(g2.assessment().playbackOf({ ...s, languageId: 'zz' }).state).toBe('error');
  });
});

describe('registries are inputs', () => {
  it('the Albanian registry alone yields no eligible stimulus however it is called', async () => {
    for (const speech of [fakeSpeech([SQ_AL]), fakeSpeech([])]) {
      const g = createGoListen(opts({ registries: [albanianRegistry()], speech }));
      const s = await g.assessment().prepareStimulus(REQ);
      if ('unavailable' in s) continue;
      expect(s.validity.eligibleForEvidence).toBe(false);
    }
  });
});


it('keeps one assessment source and rejects unknown and altered evidence bindings', async () => {
  const g = createGoListen(opts({ registries: [reviewedRegistry(true)] }));
  expect(g.assessment()).toBe(g.assessment());
  const s = await stim(g, { languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: ['de:x'] });
  const src = g.assessment();
  expect(src.scoringMetadata({ ...s }, 0).eligibleForEvidence).toBe(false);
  for (const change of [() => { s.audio = { kind: 'recorded', url: '/different.wav' }; }, () => { s.voice.suitableForAssessment = false; }, () => { s.itemIds.push('different'); }, () => { s.replaysAllowed = 99; }]) {
    const saved = JSON.stringify(s); change();
    expect(src.scoringMetadata(s, 0).eligibleForEvidence).toBe(false);
    expect(src.playbackOf(s).state).toBe('error');
    Object.assign(s, JSON.parse(saved));
  }
  const p = src.playbackOf(s); p.dispose();
  expect(src.scoringMetadata(s, 0).eligibleForEvidence).toBe(true);
  src.releaseStimulus!(s);
  expect(src.scoringMetadata(s, 0).eligibleForEvidence).toBe(true);
  const unsuitable = createGoListen(opts({ registries: [reviewedRegistry(false)] }));
  const s2 = await stim(unsuitable, { languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: [] });
  s2.validity.eligibleForEvidence = true; s2.voice.suitableForAssessment = true;
  expect(unsuitable.assessment().scoringMetadata(s2, 0).eligibleForEvidence).toBe(false);
});

it('releases remote stimuli once through playback disposal or explicit unused cleanup', async () => {
  const urls = fakeObjectUrls();
  const g = createGoListen(opts({ speech: fakeSpeech([]), objectUrl: urls }));
  const src = g.assessment();
  const s = await stim(g);
  const p = src.playbackOf(s);
  expect(src.playbackOf(s)).toBe(p);
  p.play(); p.dispose(); p.dispose(); src.releaseStimulus!(s);
  expect(urls.revoked).toEqual(['blob:fake/1']);
  expect(src.playbackOf(s).state).toBe('error');
  const unused = await stim(g);
  if (unused.audio.kind !== 'device') unused.audio.url = '/tampered.wav';
  src.releaseStimulus!(unused); src.releaseStimulus!(unused);
  expect(urls.revoked).toEqual(['blob:fake/1', 'blob:fake/2']);
});
