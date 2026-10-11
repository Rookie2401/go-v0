import { describe, expect, it } from 'vitest';
import { BUILDERS, evidenceFor, gradeAndRate, validateExercise } from '../../../packages/goreview/src/exercises';
import type { ReviewExercise } from '../../../packages/goreview/src/exercises';
import type { ReviewFacts } from '../../../packages/goreview/src/facts';
import { validateEvent } from '../../../packages/repository-contract/src';
import { FAMILY_DIMENSION } from '../../../packages/goreview/src/types';
import type { ExerciseFamily, Response } from '../../../packages/goreview/src/types';
import { IDS, NOW, ctxOf, fakeAudio, makeWorld, target } from './support';
import type { AudioMode } from './support';

const resp = (over: Partial<Response> = {}): Response => ({ hinted: false, assistance: [], audioPlayed: true, ...over });
const identity = { learnerId: 'L1', enrolmentId: 'E1', deviceId: 'D1', itemId: 'item-1' };

async function build(family: ExerciseFamily, id: string, mode: AudioMode | 'none') {
  const w = makeWorld();
  const f = await w.facts(id);
  const audio = mode === 'none' ? undefined : fakeAudio(mode);
  const r = await BUILDERS[family].build(target(id, FAMILY_DIMENSION[family]), f, ctxOf({ audio }));
  return { r, audio, can: BUILDERS[family].canBuild(target(id, FAMILY_DIMENSION[family]), f, ctxOf({ audio })) };
}

describe('audio-to-meaning', () => {
  it('asks GoListen for a word stimulus of the unit, keeps the written form hidden, and the response is the meaning', async () => {
    const { r, audio } = await build('audio-to-meaning', IDS.liber, 'recorded');
    if ('unavailable' in r) throw new Error(r.reason);
    const e = r as ReviewExercise;
    expect(audio!.requests).toEqual([{ text: 'libër', itemIds: [IDS.liber], kind: 'word' }]);
    expect(e.prompt.audio?.itemIds).toEqual([IDS.liber]);
    expect(e.prompt.audio?.answerHidden).toBe(true);
    expect(e.prompt.stimulusText).toBe('libër');
    expect(e.hiddenBeforeAnswer).toContain('stimulusText');
    expect(e.prompt.instruction).not.toMatch(/libër/);
    expect(e.answerKey.accepted).toEqual(['book']);
    expect(e.responseMode).toBe('typed-or-self');
    expect(e.eligibility).toEqual({ eligible: true, status: 'high-confidence', caveats: [] });
    expect(validateExercise(e).ok).toBe(true);
    expect(gradeAndRate(e, resp({ typed: 'book' }), { now: NOW })).toMatchObject({ grading: { outcome: 'correct' }, rating: 3 });
  });

  it('a form speaks the form, not the lemma', async () => {
    const { r, audio } = await build('audio-to-meaning', IDS.librin, 'recorded');
    if ('unavailable' in r) throw new Error(r.reason);
    expect(audio!.requests[0].text).toBe('librin');
    const el = (r as ReviewExercise).eligibility;
    expect(el.eligible ? el.caveats.join(' ') : '').toContain('provisional');
  });

  it('a synthetic voice still gives a practice exercise, with the caveat; it will claim no evidence', async () => {
    const { r } = await build('audio-to-meaning', IDS.liber, 'synthetic');
    if ('unavailable' in r) throw new Error(r.reason);
    const e = r as ReviewExercise;
    expect(e.eligibility.eligible && e.eligibility.caveats.join(' ')).toContain('practice only');
    expect(e.prompt.audio?.validity.eligibleForEvidence).toBe(false);
    expect(validateExercise(e).ok).toBe(true);
  });

  it('unavailable when there is no source, the source says so, or the source throws', async () => {
    const none = await build('audio-to-meaning', IDS.liber, 'none');
    expect(none.can).toBe(false);
    expect(none.r).toMatchObject({ unavailable: true });
    expect((none.r as { reason: string }).reason).toContain('no listening assessment source');
    const un = await build('audio-to-meaning', IDS.liber, 'unavailable');
    expect(un.r).toEqual({ unavailable: true, reason: 'no listening stimulus: no recording and no voice for sq' });
    const th = await build('audio-to-meaning', IDS.liber, 'throws');
    expect((th.r as { reason: string }).reason).toContain('could not be prepared (provider exploded)');
  });

  it('refuses a conflicted form before asking the source anything, and a unit without a gloss', async () => {
    const { r, audio } = await build('audio-to-meaning', IDS.nena, 'recorded');
    expect(r).toEqual({ unavailable: true, reason: 'analysis conflicted: sources disagree' });
    expect(audio!.requests).toEqual([]);
    const w = makeWorld();
    const f = await w.facts(IDS.liber);
    const noGloss: ReviewFacts = { ...f, glosses: [], lexiconGlossCount: 0 };
    const out = await BUILDERS['audio-to-meaning'].build(target(IDS.liber, 'auditory-recognition'), noGloss, ctxOf({ audio: fakeAudio() }));
    expect((out as { reason: string }).reason).toContain('no gloss');
  });

  it('refuses a stimulus that does not hide its answer or is for another language', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.liber);
    const leaky = fakeAudio();
    const real = leaky.prepareStimulus.bind(leaky);
    leaky.prepareStimulus = async (req) => { const s = await real(req); return 'unavailable' in s ? s : { ...s, answerHidden: false as unknown as true }; };
    expect(await BUILDERS['audio-to-meaning'].build(target(IDS.liber, 'auditory-recognition'), f, ctxOf({ audio: leaky }))).toMatchObject({ unavailable: true });
    const other = fakeAudio();
    const real2 = other.prepareStimulus.bind(other);
    other.prepareStimulus = async (req) => { const s = await real2(req); return 'unavailable' in s ? s : { ...s, languageId: 'de' }; };
    expect(await BUILDERS['audio-to-meaning'].build(target(IDS.liber, 'auditory-recognition'), f, ctxOf({ audio: other }))).toMatchObject({ unavailable: true });
  });
});

describe('audio-transcription', () => {
  it('the response is the typed form; ë and ç matter; the article is not optional', async () => {
    const { r, audio } = await build('audio-transcription', IDS.liber, 'recorded');
    if ('unavailable' in r) throw new Error(r.reason);
    const e = r as ReviewExercise;
    expect(audio!.requests[0].text).toBe('libër');
    expect(e.answerKey.accepted).toEqual(['libër']);
    expect(e.hiddenBeforeAnswer).toEqual(['stimulusText']);
    expect(e.responseMode).toBe('typed');
    expect(gradeAndRate(e, resp({ typed: 'libër' }), { now: NOW })).toMatchObject({ grading: { outcome: 'correct' }, rating: 3 });
    expect(gradeAndRate(e, resp({ typed: 'LIBËR' }), { now: NOW }).grading.outcome).toBe('correct');
    expect(gradeAndRate(e, resp({ typed: 'liber' }), { now: NOW })).toMatchObject({ grading: { outcome: 'partial' }, rating: 2 });
    expect(gradeAndRate(e, resp({ typed: 'librin' }), { now: NOW })).toMatchObject({ grading: { outcome: 'incorrect' }, rating: 1 });
    expect(gradeAndRate(e, resp({ selfGrade: 'good' }), { now: NOW }).grading.outcome).toBe('unable-to-grade');
  });

  it('is unavailable without a stimulus', async () => {
    expect((await build('audio-transcription', IDS.liber, 'none')).r).toMatchObject({ unavailable: true });
    expect((await build('audio-transcription', IDS.liber, 'unavailable')).r).toMatchObject({ unavailable: true });
  });
});

describe('listening evidence', () => {
  async function result(mode: AudioMode, family: ExerciseFamily, response: Partial<Response>, replaysUsed = 0) {
    const { r, audio } = await build(family, IDS.liber, mode);
    if ('unavailable' in r) throw new Error(r.reason);
    const e = r as ReviewExercise;
    const res = resp({ typed: family === 'audio-to-meaning' ? 'book' : 'libër', replays: replaysUsed, ...response });
    const { grading, rating } = gradeAndRate(e, res, { now: NOW });
    const scoring = audio!.scoringMetadata(e.prompt.audio!, replaysUsed);
    const ev = evidenceFor(e, { response: res, grading, rating, scoring }, identity, NOW);
    return { e, ev, grading, rating };
  }

  it('a reviewed recording, audio played, written form hidden: ListeningAssessed with answerShownBefore false and real evidence', async () => {
    for (const family of ['audio-to-meaning', 'audio-transcription'] as const) {
      const { ev } = await result('recorded', family, {});
      expect(ev?.kind, family).toBe('ListeningAssessed');
      expect(validateEvent(ev)).toEqual([]);
      expect(ev!.payload).toMatchObject({ stimulus: 'word', voice: 'recorded', answerShownBefore: false, correct: true, responseMode: 'typed', hinted: false, family, assessmentDimension: FAMILY_DIMENSION[family] });
      expect(ev!.evidence).toMatchObject({ quality: 'moderate', assisted: false });
      expect(ev!.subject).toEqual({ cardId: 'item-1', itemIds: [IDS.liber] });
    }
  });

  it('too many replays make the answer hinted and the evidence weak', async () => {
    const { ev } = await result('recorded', 'audio-to-meaning', {}, 5);
    expect(ev!.payload).toMatchObject({ hinted: true });
    expect(ev!.evidence).toMatchObject({ quality: 'weak', assisted: true });
  });

  it('a synthetic voice is practice: the event is recorded as history with quality none', async () => {
    const { ev } = await result('synthetic', 'audio-to-meaning', {});
    expect(ev?.kind).toBe('ListeningAssessed');
    expect(ev!.payload).toMatchObject({ voice: 'synthetic', answerShownBefore: false });
    expect(ev!.evidence?.quality).toBe('none');
    expect(validateEvent(ev)).toEqual([]);
  });

  it('failed playback claims nothing: no event, no rating', async () => {
    const { ev, rating, grading } = await result('recorded', 'audio-to-meaning', { audioFailed: true, audioPlayed: false, typed: undefined });
    expect(grading.outcome).toBe('invalid-question');
    expect(rating).toBeNull();
    expect(ev).toBeNull();
  });

  it('when the written form was shown first it is not a listening result: a reading review with no evidence', async () => {
    const { ev } = await result('recorded', 'audio-transcription', { transcriptShownBefore: true });
    expect(ev?.kind).toBe('CardReviewed');
    expect(ev!.payload).toMatchObject({ cardKind: 'recognition', answerShownBefore: true, audioOnly: false });
    expect(ev!.evidence?.quality).toBe('none');
    expect(validateEvent(ev)).toEqual([]);
    expect(JSON.stringify(ev)).not.toContain('ListeningAssessed');
  });

  it('audio that never played is not listening either', async () => {
    const { ev } = await result('recorded', 'audio-to-meaning', { audioPlayed: false });
    expect(ev?.kind).toBe('CardReviewed');
    expect(ev!.evidence?.quality).toBe('none');
    expect(ev!.payload).toMatchObject({ audioPlayed: false });
  });

  it('a challenged listening answer is kept with quality none and no rating', async () => {
    const { ev, rating } = await result('recorded', 'audio-to-meaning', { challenged: true });
    expect(rating).toBeNull();
    expect(ev?.kind).toBe('ListeningAssessed');
    expect(ev!.evidence?.quality).toBe('none');
    expect(ev!.payload).toHaveProperty('rating', null);
  });

  it('GoListen’s scoring metadata can lower eligibility but a stimulus that is not eligible is never raised by it', async () => {
    const { r } = await build('audio-to-meaning', IDS.liber, 'synthetic');
    const e = r as ReviewExercise;
    const res = resp({ typed: 'book' });
    const { grading, rating } = gradeAndRate(e, res, { now: NOW });
    const ev = evidenceFor(e, { response: res, grading, rating, scoring: { voice: 'recorded', hinted: false, replays: 0, eligibleForEvidence: true } }, identity, NOW);
    expect(ev!.evidence?.quality).toBe('none');
    expect(ev!.payload).toMatchObject({ voice: 'synthetic' });
  });
});
