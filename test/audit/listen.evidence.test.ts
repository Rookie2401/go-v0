// @vitest-environment node
/**
 * AUDIT §19 (part 1) — GoListen's evidence-direction rule, end to end into the Repository.
 *   playback never yields ListeningAssessed; a PronunciationPlayed event never moves listeningRecognition in the engine;
 *   isIndependentEvidence is false for synthetic and unreviewed; a stimulus hides the answer; a reviewed recording is eligible.
 * Real pieces: packages/golisten (createGoListen, registries, assessment), the contract validators, the real store and engine,
 * GoReview's `prepareListening`/`publicView`. Fakes: the browser ports only (speechSynthesis, audio, fetch).
 */
import { describe, expect, it } from 'vitest';
import { validateEvent, validatePayload } from '../../packages/repository-contract/src';
import { observationsOf } from '../../packages/repository-engine/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import {
  assessmentEvidence, createGoListen, defaultRegistries, demoGermanRegistry, isIndependentEvidence, listeningAssessedPayload,
} from '../../packages/golisten/src';
import type { AudioStimulus, GoListenOptions, PronunciationProvenance, StimulusRequest, VoiceRegistry } from '../../packages/golisten/src';
import { prepareListening, publicView } from '../../packages/goreview/src/listening';
import type { UnitFacts } from '../../packages/goreview/src/types';
import { configuredProxy, fakeAudio, fakeObjectUrls, fakeSpeech, fakeUtterance, SQ_AL } from '../golisten/pronounce-fakes';
import { append, changed, dimOf, ev, flushRowsAfterAll, LEARNER, makeWorld, note, recognition, rowsOf } from './model.support';

flushRowsAfterAll('listen.evidence');

const WORD = 'shkollë';
const SQ_REQ: StimulusRequest = { languageId: 'sq', kind: 'word', text: WORD, itemIds: ['form:sq:shkollë'], processingPermission: 'allowed' };
const opts = (o: Partial<GoListenOptions> = {}): GoListenOptions => ({
  registries: defaultRegistries(), consent: () => ({ remoteSpeech: true, localOnly: false }), speech: fakeSpeech([SQ_AL]), audio: fakeAudio(900),
  fetch: configuredProxy().fetch, objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0, ...o,
});

/** A registry holding a human recording, as a native-reviewed course will one day supply it. TEST registry: nothing like it ships today. */
function recordingRegistry(o: { verification: 'unverified' | 'machine-checked' | 'native-reviewed'; suitable: boolean; lang?: string; text?: string }): VoiceRegistry {
  const r = demoGermanRegistry({ url: 'https://example.test/recording.wav' });
  r.languageId = o.lang ?? 'de';
  r.entries = r.entries.map((e) => ({
    ...e, languageId: o.lang ?? 'de', voiceId: `recording:test-${o.verification}-${o.suitable}`, qualityVerification: o.verification, suitableForAssessment: o.suitable,
    supports: ['word', 'phrase', 'sentence'] as ('word' | 'phrase' | 'sentence')[], label: `test recording (${o.verification})`, knownLimitations: [], licence: 'Test licence',
    source: { kind: 'recorded' as const, recordings: [{ text: o.text ?? 'Guten Tag!', url: 'https://example.test/recording.wav', attribution: 'test' }] },
  }));
  return r;
}
const DE_REQ: StimulusRequest = { languageId: 'de', kind: 'sentence', text: 'Guten Tag!', itemIds: ['form:de:guten'] };

async function prepared(g: ReturnType<typeof createGoListen>, req: StimulusRequest): Promise<AudioStimulus> {
  const s = await g.assessment().prepareStimulus(req);
  if ('unavailable' in s) throw new Error(`unavailable: ${s.reason}`);
  return s;
}

// ═════════════════════════════ playback is exposure ═════════════════════════════

describe('§19 playback never yields a ListeningAssessed event', () => {
  it('every playback outcome (device ended / stopped / replayed, remote, recorded, failed) is a PronunciationPlayed with evidence quality "none", or nothing', async () => {
    const speech = fakeSpeech([SQ_AL]);
    const device = createGoListen(opts({ speech }));
    const r1 = await device.pronounce({ languageId: 'sq', text: WORD, kind: 'word', autoplay: true });
    if (!r1.ok) throw new Error(r1.message);
    speech.finish();
    const e1 = device.events(r1, true);

    const r2 = await device.pronounce({ languageId: 'sq', text: WORD, kind: 'word' });
    if (!r2.ok) throw new Error(r2.message);
    const e2 = device.events(r2, false); // never started: nothing played
    r2.playback.play(); r2.playback.replay(); r2.playback.replay();
    const e3 = device.events(r2, false); // started and replayed twice, never ended

    const remote = createGoListen(opts({ speech: fakeSpeech([]) }));
    const r4 = await remote.pronounce({ languageId: 'sq', text: WORD, kind: 'word', autoplay: true, processingPermission: 'allowed' });
    if (!r4.ok) throw new Error(r4.message);
    const e4 = remote.events(r4, true);

    const rec = createGoListen(opts({ registries: [recordingRegistry({ verification: 'native-reviewed', suitable: true })] }));
    const r5 = await rec.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase', autoplay: true });
    if (!r5.ok) throw new Error(r5.message);
    const e5 = rec.events(r5, true);

    const failed = await createGoListen(opts({ speech: fakeSpeech([]), fetch: undefined })).pronounce({ languageId: 'sq', text: WORD, kind: 'word' });
    const e6 = createGoListen(opts()).events(failed, true);

    expect(e2).toBeNull();
    expect(e6).toBeNull();
    const events = [e1, e3, e4, e5].filter((e): e is NonNullable<typeof e> => e !== null);
    expect(events).toHaveLength(4);
    for (const e of events) {
      expect(e.kind).toBe('PronunciationPlayed');
      expect(e.evidence).toEqual({ quality: 'none', assisted: false });
      expect(validatePayload('PronunciationPlayed', e.payload)).toEqual([]);
      // the payload cannot be passed off as an assessment: the contract refuses it as ListeningAssessed
      expect(validatePayload('ListeningAssessed', e.payload).length).toBeGreaterThan(0);
      expect(JSON.stringify(e)).not.toMatch(/correct|answerShownBefore/);
    }
    expect(events.map((e) => e.payload.voice)).toEqual(['synthetic', 'synthetic', 'synthetic', 'recorded']);
    expect(events[1]!.payload.repeated).toBe(true);
    note('L1', '§19', 'playback outcomes: device ended, device replayed, remote, REVIEWED recording, never started, failed', 'PronunciationPlayed with evidence {quality none} or null; never ListeningAssessed; payload refused if relabelled', `kinds ${events.map((e) => e.kind)}; voices ${events.map((e) => e.payload.voice)}; null for not-started and failed; ListeningAssessed validation of the payload: ${validatePayload('ListeningAssessed', events[0]!.payload).length} issues`);
  });

  it('even a reviewed, suitable human recording is only exposure when merely played', async () => {
    const g = createGoListen(opts({ registries: [recordingRegistry({ verification: 'native-reviewed', suitable: true })] }));
    const r = await g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase', autoplay: true });
    if (!r.ok) throw new Error(r.message);
    expect(isIndependentEvidence(r.provenance)).toBe(true); // it COULD be evidence in an assessment…
    expect(g.events(r, true)!.kind).toBe('PronunciationPlayed'); // …but a plain playback never is
  });
});

describe('§19 a PronunciationPlayed event never moves listeningRecognition in the engine', () => {
  it('50 plays (synthetic and recorded, repeated, with a lying evidence note and a smuggled "correct") move exposure only', async () => {
    const w = await makeWorld('memory');
    const unit = 'form:sq:shkollë';
    await append(w, recognition([unit], true));
    const before = await rowsOf(w);
    const plays: GoEvent[] = [];
    for (let i = 0; i < 50; i++) {
      plays.push(ev('PronunciationPlayed', [unit], { voice: i % 2 ? 'recorded' : 'synthetic', repeated: i > 0, ...(i % 5 === 0 ? { correct: true, answerShownBefore: false } : {}) },
        { app: 'golearn-ext', ...(i % 3 === 0 ? { evidence: { quality: 'strong' as const, assisted: false } } : {}) }));
    }
    plays.push(ev('ListeningCompleted', [unit], { voice: 'recorded' }));
    for (const p of plays) expect(validateEvent(p)).toEqual([]);
    await append(w, ...plays);
    const after = await rowsOf(w);
    const listening = dimOf(after, unit, 'listeningRecognition');
    expect(listening.observations).toBe(0);
    expect(listening.weight).toBe(0);
    expect(listening.score).toBe(0.5);
    expect(dimOf(after, unit, 'readingRecognition')).toEqual(dimOf(before, unit, 'readingRecognition'));
    expect(changed(before, after)).toEqual([`${unit}|exposure`]);
    expect((await w.engine.counters(LEARNER, unit)).playbacks).toBe(51);
    note('L2', '§19', '51 playback events incl. quality "strong" and a smuggled correct:true', 'listeningRecognition untouched (0 observations); only exposure moves; playbacks counted separately', `listening obs ${listening.observations}/weight ${listening.weight}; moved ${JSON.stringify(changed(before, after))}; playbacks ${(await w.engine.counters(LEARNER, unit)).playbacks}`);
  });

  it('a ListeningAssessed that claims the answer was shown first is refused at the write boundary, and one that slips through the fold is ignored', async () => {
    const w = await makeWorld('memory');
    const bad = ev('ListeningAssessed', ['form:sq:x'], { stimulus: 'word', voice: 'recorded', answerShownBefore: true, correct: true, responseMode: 'choice' });
    expect(validateEvent(bad).some((i) => i.path === 'payload.answerShownBefore')).toBe(true);
    const out = await w.store.append(LEARNER, [bad]);
    expect(out[0]!.stored).toBe(false);
    const { observationsOf } = await import('../../packages/repository-engine/src');
    expect(observationsOf(bad)).toEqual([]);
    note('L3', '§19', 'ListeningAssessed with answerShownBefore:true', 'refused by validateEvent and by the store; the engine would ignore it anyway', `store.stored=${out[0]!.stored}; observations 0`);
  });
});

// ═════════════════════════════ isIndependentEvidence ═════════════════════════════

describe('§19 isIndependentEvidence', () => {
  it('is true for exactly one of the 18 combinations: a recording, not generated from text, reviewed by a human', () => {
    const results: Array<[string, boolean]> = [];
    for (const source of ['device-tts', 'remote-tts', 'recording'] as const) {
      for (const generatedFromText of [true, false] as const) {
        for (const reviewedRecording of [true, false, undefined] as const) {
          const p: PronunciationProvenance = { source, voiceId: 'v', generatedFromText, ...(reviewedRecording === undefined ? {} : { reviewedRecording }), note: '' };
          results.push([`${source}/generated=${generatedFromText}/reviewed=${reviewedRecording}`, isIndependentEvidence(p)]);
        }
      }
    }
    expect(results).toHaveLength(18);
    expect(results.filter(([, v]) => v).map(([k]) => k)).toEqual(['recording/generated=false/reviewed=true']);
    note('L4', '§19', 'isIndependentEvidence truth table (source × generatedFromText × reviewed)', 'true only for recording / not generated / reviewed', `${results.filter(([, v]) => v).length} true of 18: ${results.filter(([, v]) => v).map(([k]) => k)}`);
  });

  it('real provenance from the registries: device, remote and the unreviewed German recording are all false', async () => {
    const g = createGoListen(opts({ registries: defaultRegistries() }));
    const dev = await g.pronounce({ languageId: 'sq', text: WORD, kind: 'word' });
    const rem = await createGoListen(opts({ speech: fakeSpeech([]) })).pronounce({ languageId: 'sq', text: WORD, kind: 'word', processingPermission: 'allowed' });
    const demo = await g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase' });
    for (const r of [dev, rem, demo]) {
      if (!r.ok) throw new Error(r.message);
      expect(isIndependentEvidence(r.provenance)).toBe(false);
    }
    if (!dev.ok || !rem.ok || !demo.ok) return;
    expect([dev.provenance.source, rem.provenance.source, demo.provenance.source]).toEqual(['device-tts', 'remote-tts', 'recording']);
    expect(demo.provenance.reviewedRecording).toBe(false);
    note('L5', '§19', 'provenance of the shipped voices', 'device, remote and the German demonstration clip: not independent evidence', `device-tts false; remote-tts false; recording (qualityVerification ${demo.voice.qualityVerification}, reviewed=${demo.provenance.reviewedRecording}) false`);
  });
});

// ═════════════════════════════ assessment stimuli ═════════════════════════════

describe('§19 an assessment stimulus hides the answer', () => {
  it('recorded and remote stimuli carry no text; a device stimulus carries it only in audio.text; the id and the voice label never contain it', async () => {
    const rec = await prepared(createGoListen(opts({ registries: [recordingRegistry({ verification: 'native-reviewed', suitable: true })] })), DE_REQ);
    const remote = await prepared(createGoListen(opts({ speech: fakeSpeech([]) })), SQ_REQ);
    const device = await prepared(createGoListen(opts()), SQ_REQ);
    for (const s of [rec, remote, device]) {
      expect(s.answerHidden).toBe(true);
      expect(s.stimulusId).not.toContain(s.audio.kind === 'device' ? WORD : 'Guten');
      expect(s.voice.label).not.toMatch(/shkollë|Guten/);
    }
    const sansIds = (x: AudioStimulus) => JSON.stringify({ ...x, itemIds: undefined });
    expect(sansIds(rec)).not.toContain('Guten');
    expect(sansIds(remote)).not.toContain(WORD);
    expect(device.audio).toEqual({ kind: 'device', text: WORD });
    expect(JSON.stringify({ ...device, audio: undefined, itemIds: undefined })).not.toContain(WORD);
    note('L6', '§19', 'stimulus JSON for recorded, remote and device voices', 'answerHidden true; text appears nowhere except device audio.text', `recorded: text absent; remote: text absent; device: text only in audio.text (${JSON.stringify(device.audio)}); itemIds excluded here, see D9`);
  });

  it("GoReview's public view of a prepared listening item omits the intended expression, and a device stimulus keeps it in audio.text only (documented: the UI must not render it)", async () => {
    const g = createGoListen(opts());
    const facts = { unit: { unitId: 'form:sq:shkollë', kind: 'form', label: WORD } } as UnitFacts;
    const prep = await prepareListening({ audio: g.assessment() }, { unitId: 'form:sq:shkollë', unitKind: 'form', languageId: 'sq', dimension: 'auditory-recognition' }, facts);
    if ('unavailable' in prep) throw new Error(prep.reason);
    expect(prep.metadata.intendedExpression).toBe(WORD); // kept for after the response
    const pub = publicView(prep);
    expect(JSON.stringify(pub.metadata)).not.toContain(WORD);
    expect((pub.metadata as Record<string, unknown>).intendedExpression).toBeUndefined();
    expect(JSON.stringify({ ...pub.stimulus, audio: undefined, itemIds: undefined })).not.toContain(WORD);
  });

  it('DEFECT D9 (fixed): the stimulus handed to the UI (publicView) contains no form of the answer — itemIds are content-derived unit ids such as form:sq:shkollë', async () => {
    const g = createGoListen(opts({ speech: fakeSpeech([]) })); // remote voice: the only text that could appear is the id
    const facts = { unit: { unitId: 'form:sq:shkollë', kind: 'form', label: WORD } } as UnitFacts;
    const source = g.assessment();
    const prep = await prepareListening({ audio: { ...source, prepareStimulus: (req) => source.prepareStimulus({ ...req, processingPermission: 'allowed' }) } }, { unitId: 'form:sq:shkollë', unitKind: 'form', languageId: 'sq', dimension: 'auditory-transcription' }, facts);
    if ('unavailable' in prep) throw new Error(prep.reason);
    const pub = JSON.stringify(publicView(prep));
    note('D9', '§19', 'publicView(prepared) of a remote-voice transcription item (answer = the written form)', 'no occurrence of the written form ("recorded and remote audio carries no text at all")', `occurs ${pub.split(WORD).length - 1}× (prepared stimulus keeps ${JSON.stringify(prep.stimulus.itemIds)} for the producer; the public view shows ${JSON.stringify(publicView(prep).stimulus.itemIds)})`);
    expect(pub).not.toContain(WORD);
  });

  it('OBSERVATION O3: the voice descriptor of a recording may name its source file, so the stimulus of the shipped demonstration clip reveals the phrase in voice.licence (documented: show it only after the response)', async () => {
    const wide = demoGermanRegistry();
    wide.entries = wide.entries.map((e) => ({ ...e, supports: ['word', 'phrase', 'sentence'] as ('word' | 'phrase' | 'sentence')[] }));
    const s = await prepared(createGoListen(opts({ registries: [wide] })), DE_REQ);
    expect(s.voice.licence).toContain('Guten_Tag');
    note('O3', '§19', 'stimulus.voice.licence of the shipped German clip', 'no occurrence of the answer in what the UI holds before the response', 'licence = "' + s.voice.licence.slice(0, 80) + '…" (names De-Guten_Tag.oga); assessment.ts documents that the descriptor is shown only after the response', true);
  });

  it('a request with no text, or a kind other than word/sentence, yields no stimulus rather than a hint', async () => {
    const g = createGoListen(opts());
    for (const bad of [{ ...SQ_REQ, text: '   ' }, { ...SQ_REQ, kind: 'phrase' as never }, { ...SQ_REQ, languageId: 'xx' }]) {
      const s = await g.assessment().prepareStimulus(bad);
      expect('unavailable' in s).toBe(true);
    }
  });
});

describe('§19 eligibility of a stimulus, and the chain GoListen → event → engine', () => {
  const eligibleOf = async (r: VoiceRegistry, req: StimulusRequest, replays = 0) => {
    const g = createGoListen(opts({ registries: [r] }));
    const s = await prepared(g, req);
    return { g, s, meta: g.assessment().scoringMetadata(s, replays) };
  };

  it('a reviewed human recording marked suitable is eligible; reviewed-but-unsuitable, machine-checked and unverified recordings are not', async () => {
    const good = await eligibleOf(recordingRegistry({ verification: 'native-reviewed', suitable: true }), DE_REQ);
    expect(good.s.validity.eligibleForEvidence).toBe(true);
    expect(good.meta).toEqual({ voice: 'recorded', hinted: false, replays: 0, eligibleForEvidence: true });
    expect(assessmentEvidence(good.meta)).toEqual({ quality: 'moderate', assisted: false });
    const rows: string[] = [`native-reviewed+suitable → ${good.s.validity.eligibleForEvidence}`];
    for (const [verification, suitable] of [['native-reviewed', false], ['machine-checked', true], ['unverified', true], ['unverified', false]] as const) {
      const x = await eligibleOf(recordingRegistry({ verification, suitable }), DE_REQ);
      expect(x.s.validity.eligibleForEvidence, `${verification}/${suitable}`).toBe(false);
      expect(x.meta.eligibleForEvidence).toBe(false);
      expect(assessmentEvidence(x.meta).quality).toBe('none');
      rows.push(`${verification}+suitable=${suitable} → false`);
    }
    note('L7', '§19', 'eligibility by recording review state (TEST registry)', 'only native-reviewed AND suitableForAssessment is eligible (evidence quality moderate); the rest quality none', rows.join('; '));
  });

  it('synthetic stimuli (device, remote) are never eligible; the shipped German clip is not; each yields evidence quality "none"', async () => {
    const device = await prepared(createGoListen(opts()), SQ_REQ);
    const remoteG = createGoListen(opts({ speech: fakeSpeech([]) }));
    const remote = await prepared(remoteG, SQ_REQ);
    const wide = demoGermanRegistry();
    wide.entries = wide.entries.map((e) => ({ ...e, supports: ['word', 'phrase', 'sentence'] as ('word' | 'phrase' | 'sentence')[] }));
    const demoG = createGoListen(opts({ registries: [wide] }));
    const demo = await prepared(demoG, DE_REQ);
    for (const [g, s] of [[createGoListen(opts()), device], [remoteG, remote], [demoG, demo]] as const) {
      expect(s.validity.eligibleForEvidence).toBe(false);
      expect(assessmentEvidence(g.assessment().scoringMetadata(s, 0)).quality).toBe('none');
    }
    note('L8', '§19', 'eligibility of the voices that ship', 'device, remote and demo clip: not eligible, evidence quality none', `device ${device.validity.eligibleForEvidence}, remote ${remote.validity.eligibleForEvidence}, demo ${demo.validity.eligibleForEvidence} (${demo.validity.reason})`);
  });

  it('forged eligibility is refused by the issuing source, repeated source access and another engine', async () => {
    const device = createGoListen(opts());
    const src = device.assessment();
    const s = await src.prepareStimulus(SQ_REQ);
    if ('unavailable' in s) throw new Error(s.reason);
    const forged: AudioStimulus = { ...s, validity: { eligibleForEvidence: true, reason: 'forged' }, voice: { ...s.voice, suitableForAssessment: true } };
    expect(src.scoringMetadata(forged, 0).eligibleForEvidence).toBe(false); // voice.synthetic still true
    const flipped: AudioStimulus = { ...forged, voice: { ...forged.voice, synthetic: false } };
    expect(src.scoringMetadata(flipped, 0).eligibleForEvidence).toBe(false); // made here: the stored provenance (device-tts, generated from text) overrules the descriptor
    const fresh = createGoListen(opts()).assessment().scoringMetadata(flipped, 0).eligibleForEvidence;
    expect(fresh).toBe(false); // unknown source: public descriptors cannot authorize evidence

    const unreviewedG = createGoListen(opts({ registries: [recordingRegistry({ verification: 'unverified', suitable: true })] }));
    const usrc = unreviewedG.assessment();
    const u = await usrc.prepareStimulus(DE_REQ);
    if ('unavailable' in u) throw new Error(u.reason);
    const forgedU: AudioStimulus = { ...u, validity: { eligibleForEvidence: true, reason: 'forged' } };
    expect(usrc.scoringMetadata(forgedU, 0).eligibleForEvidence).toBe(false); // the stored provenance says unreviewed
    expect(unreviewedG.assessment().scoringMetadata(forgedU, 0).eligibleForEvidence).toBe(false);
    note('L9', '§19', 'forged eligibility flags handed to scoringMetadata', 'unknown or altered stimuli cannot authorize evidence', 'synthetic forged → false, descriptor edited to synthetic:false → false, unreviewed recording forged → false. Repeated assessment() access and a different engine also refuse forgeries; O2 is fixed.');
  });

  it('chain: the reviewed recording becomes a valid ListeningAssessed that moves listeningRecognition; hints move assistedRecognition; synthetic moves nothing', async () => {
    const w = await makeWorld('memory');
    const unit = 'form:de:guten';
    const good = await eligibleOf(recordingRegistry({ verification: 'native-reviewed', suitable: true }), DE_REQ, 0);
    const hinted = await eligibleOf(recordingRegistry({ verification: 'native-reviewed', suitable: true }), DE_REQ, 3);
    const syntheticG = createGoListen(opts());
    const sStim = await prepared(syntheticG, SQ_REQ);
    const sMeta = syntheticG.assessment().scoringMetadata(sStim, 0);

    const make = (meta: typeof good.meta, correct: boolean, languageId: string): GoEvent => ev('ListeningAssessed', [unit], { ...listeningAssessedPayload({ kind: 'word' }, meta, { correct, responseMode: 'choice' }) }, { languageId, evidence: assessmentEvidence(meta), app: 'gopractice-review' });
    const eligibleEvent = make(good.meta, true, 'sq');
    const hintedEvent = make(hinted.meta, true, 'sq');
    const syntheticEvent = make(sMeta, true, 'sq');
    for (const e of [eligibleEvent, hintedEvent, syntheticEvent]) expect(validateEvent(e)).toEqual([]);

    await append(w, syntheticEvent);
    expect(changed(new Map(), await rowsOf(w))).toEqual([]); // practice: nothing moves
    const base = await rowsOf(w);
    await append(w, hintedEvent);
    expect(changed(base, await rowsOf(w))).toEqual([`${unit}|assistedRecognition`]);
    const mid = await rowsOf(w);
    await append(w, eligibleEvent);
    expect(changed(mid, await rowsOf(w))).toEqual([`${unit}|listeningRecognition`]);
    const final = await rowsOf(w);
    const l = dimOf(final, unit, 'listeningRecognition');
    note('L10', '§19', 'GoListen metadata → ListeningAssessed → engine', 'synthetic (quality none): no row; replays beyond allowance (hinted): assistedRecognition; clean reviewed recording: listeningRecognition only', `synthetic moved nothing; hinted → assistedRecognition; eligible → listeningRecognition (score ${l.score}, weight ${l.weight}, positive ${l.positive})`);
  });
});

// ═════════════════════════════ the defect-test for the engine's own rule ═════════════════════════════

describe('§19 defence in depth in the engine', () => {
  it('DEFECT D8 (fixed): a ListeningAssessed event with voice:"synthetic" and NO evidence note does not count as listening evidence in the engine', async () => {
    const w = await makeWorld('memory');
    const unit = 'form:sq:shkollë';
    const e = ev('ListeningAssessed', [unit], { stimulus: 'word', voice: 'synthetic', answerShownBefore: false, correct: true, responseMode: 'choice' });
    expect(validateEvent(e)).toEqual([]);
    await append(w, e);
    const rows = await rowsOf(w);
    const weight = rows.get(unit)?.dimensions.listeningRecognition.weight ?? 0;
    note('D8', '§19', 'engine on ListeningAssessed{voice:synthetic} with no evidence note', 'listeningRecognition weight 0 (synthetic speech is never listening evidence)', `weight ${weight}, score ${rows.get(unit)?.dimensions.listeningRecognition.score} (the engine rule table credits synthetic speech at 0, whatever evidence note the producer attaches)`);
    expect(weight).toBe(0);
    // an optimistic producer note cannot buy credit back for a synthetic voice, and a recording still counts
    const strong = ev('ListeningAssessed', [unit], { stimulus: 'word', voice: 'synthetic', answerShownBefore: false, correct: true, responseMode: 'choice' }, { evidence: { quality: 'strong' } });
    expect(observationsOf(strong)).toEqual([]);
    expect(observationsOf(ev('ListeningAssessed', [unit], { stimulus: 'word', voice: 'recorded', answerShownBefore: false, correct: true, responseMode: 'choice' }))[0]!.weight).toBeCloseTo(0.8);
  });

  it('the product\'s own producer (GoReview/GoListen) always sets quality "none" for synthetic, so the gap above is not reachable on the real path', async () => {
    const g = createGoListen(opts());
    const s = await prepared(g, SQ_REQ);
    const meta = g.assessment().scoringMetadata(s, 0);
    expect(meta.voice).toBe('synthetic');
    expect(assessmentEvidence(meta)).toEqual({ quality: 'none', assisted: false });
  });
});
