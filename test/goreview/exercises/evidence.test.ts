import { describe, expect, it } from 'vitest';
import { BUILDERS, evidenceFor, gradeAndRate } from '../../../packages/goreview/src/exercises';
import type { EvidenceInputObject, ReviewExercise } from '../../../packages/goreview/src/exercises';
import { FAMILY_DIMENSION } from '../../../packages/goreview/src/types';
import type { ExerciseFamily, Grading, Response } from '../../../packages/goreview/src/types';
import { validateEvent } from '../../../packages/repository-contract/src';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { observationsOf } from '../../../packages/repository-engine/src/evidence';
import { foldEvents } from '../../../packages/repository-engine/src/projection';
import { remediationBacklog } from '../../../packages/goreview/src/planner/remediation';
import { deckItem } from '../intake/fixtures';
import { IDS, NOW, ctxOf, fakeAudio, makeWorld, target } from './support';

const resp = (over: Partial<Response> = {}): Response => ({ hinted: false, assistance: [], ...over });
const identity = { learnerId: 'L1', enrolmentId: 'E1', deviceId: 'D1', itemId: 'item-9' };
const world = makeWorld();

async function exercise(family: ExerciseFamily, id: string, random = 0): Promise<ReviewExercise> {
  const f = await world.facts(id);
  const r = await BUILDERS[family].build(target(id, FAMILY_DIMENSION[family]), f, ctxOf({ audio: fakeAudio(), random: () => random }));
  if ('unavailable' in r) throw new Error(r.reason);
  return r as ReviewExercise;
}

function event(e: ReviewExercise, response: Response, extra?: { latencyMs?: number; difficulty?: number }): { ev: GoEvent | null; grading: Grading } {
  const { grading, rating } = gradeAndRate(e, response, { now: NOW });
  return { ev: evidenceFor(e, { response, grading, rating }, identity, NOW, extra), grading };
}
const must = (x: GoEvent | null): GoEvent => { if (!x) throw new Error('expected an event'); return x; };

describe('written families → CardReviewed', () => {
  it('written-recognition: a typed correct answer', async () => {
    const e = await exercise('written-recognition', IDS.liber);
    const ev = must(event(e, resp({ typed: 'book' })).ev);
    expect(validateEvent(ev)).toEqual([]);
    expect(ev.kind).toBe('CardReviewed');
    expect(ev.payload).toEqual({
      cardKind: 'recognition', grade: 'good', correct: true, hinted: false, answerShownBefore: false, rating: 3, outcome: 'correct',
      family: 'written-recognition', exerciseId: e.exerciseId, assessmentDimension: 'written-recognition',
    });
    expect(ev.subject).toEqual({ cardId: 'item-9', itemIds: [IDS.liber] });
    expect(ev.evidence).toEqual({ quality: 'moderate', assisted: false, sourceReliability: 1 });
    expect(ev).toMatchObject({ learnerId: 'L1', enrolmentId: 'E1', languageId: 'sq', varietyId: 'sq-standard', at: NOW, producer: { app: 'gopractice-review', deviceId: 'D1', surface: 'written-recognition' } });
  });

  it('assisted answers do not produce a schedule rating; unassisted grades retain their rating', async () => {
    const e = await exercise('written-recognition', IDS.liber);
    expect(must(event(e, resp({ typed: 'volume' })).ev).payload).toMatchObject({ grade: 'again', correct: false, rating: 1 });
    expect(must(event(e, resp({ typed: 'book', hinted: true })).ev)).toMatchObject({ payload: { grade: 'good', correct: true, hinted: true, rating: null }, evidence: { quality: 'none', assisted: true } });
    expect(must(event(e, resp({ selfGrade: 'easy' })).ev)).toMatchObject({ payload: { grade: 'easy', correct: true, rating: 4 }, evidence: { quality: 'weak', sourceReliability: 0.6 } });
    expect(must(event(e, resp({ selfGrade: 'hard' })).ev)).toMatchObject({ payload: { grade: 'hard', outcome: 'correct', correct: true, rating: 2 }, evidence: { quality: 'weak', sourceReliability: 0.6 } });
    const t = await exercise('audio-transcription', IDS.liber);
    // a listening event has no card grade; the rating and the outcome carry it
    expect(must(event(t, resp({ typed: 'liber', audioPlayed: true })).ev).payload).toMatchObject({ outcome: 'partial', correct: false, rating: 1 });
  });

  it('carries self-Hard as successful, low-reliability evidence through grading, event, projection and remediation', async () => {
    const e = await exercise('written-recognition', IDS.liber);
    const hard = must(event(e, resp({ selfGrade: 'hard' })).ev);
    hard.payload.expectedPreviousReviewId = null;
    expect(hard.payload).toMatchObject({ grade: 'hard', outcome: 'correct', correct: true, rating: 2 });
    expect(hard.evidence).toMatchObject({ quality: 'weak', sourceReliability: 0.6 });
    const row = foldEvents([hard], { modelVersion: 'phase1-test' }).find(r => r.unitId === IDS.liber)!;
    expect(row.dimensions.readingRecognition.positive).toBeGreaterThan(0);
    expect(row.dimensions.readingRecognition.negative).toBe(0);
    expect(remediationBacklog([deckItem({ unitId: IDS.liber, itemId: identity.itemId })], [hard], NOW)).toEqual([]);
  });

  it('meaning-to-form is a recall card; sentence-completion a cloze card; phrase-comprehension a recognition card', async () => {
    expect(must(event(await exercise('meaning-to-form', IDS.liber), resp({ typed: 'libër' })).ev).payload).toMatchObject({ cardKind: 'recall', assessmentDimension: 'meaning-to-target-retrieval' });
    expect(must(event(await exercise('sentence-completion', IDS.shkolle), resp({ typed: 'shkollë' })).ev).payload).toMatchObject({ cardKind: 'cloze', assessmentDimension: 'productive-recall' });
    expect(must(event(await exercise('phrase-comprehension', IDS.phrase), resp({ typed: 'my name is' })).ev).payload).toMatchObject({ cardKind: 'recognition', assessmentDimension: 'phrase-comprehension' });
  });

  it('a provisional target caps the evidence at weak', async () => {
    const facts = await world.facts(IDS.librin);
    // This test targets evidence quality; supply an explicit form translation so it does not rely on the lemma gloss.
    const supported = { ...facts, glosses: ['book'], wordAnalysis: { ...facts.wordAnalysis!, inflectedMeaning: { text: 'book', source: 'reviewed-test-fixture' } } };
    const r = await BUILDERS['written-recognition'].build(target(IDS.librin, FAMILY_DIMENSION['written-recognition']), supported, ctxOf({ audio: fakeAudio() }));
    if ('unavailable' in r) throw new Error(r.reason);
    const e = r as ReviewExercise;
    expect(must(event(e, resp({ typed: 'book' })).ev).evidence).toMatchObject({ quality: 'weak' });
  });

  it('a choice answer is weaker evidence than a typed one', async () => {
    const e = await exercise('morphological-identification', IDS.shkolle);
    expect(must(event(e, resp({ choice: e.answerKey.accepted[0] })).ev).evidence?.quality).toBe('weak');
  });

  it('latency and difficulty are carried when the caller knows them', async () => {
    const e = await exercise('meaning-to-form', IDS.liber);
    expect(must(event(e, resp({ typed: 'libër' }), { latencyMs: 4200, difficulty: 0.4 }).ev).payload).toMatchObject({ latencyMs: 4200, difficulty: 0.4 });
  });
});

describe('grammar families → AssessmentAnswered', () => {
  it('morphological-identification (feature): the construction the form realises, task interpret', async () => {
    const e = await exercise('morphological-identification', IDS.shkolle, 0);
    const wrong = e.prompt.options!.find((o) => o !== e.answerKey.accepted[0])!;
    const ev = must(event(e, resp({ choice: wrong })).ev);
    expect(validateEvent(ev)).toEqual([]);
    expect(ev.kind).toBe('AssessmentAnswered');
    expect(ev.payload).toMatchObject({
      constructionId: 'morph:sq:NOUN:Case=Acc|Definite=Ind|Gender=Fem|Number=Sing', task: 'interpret', correct: false, hinted: false, rating: 1,
      outcome: 'incorrect', family: 'morphological-identification', assessmentDimension: 'morphological-analysis', answer: wrong, expected: e.answerKey.accepted[0],
    });
    expect(ev.subject).toEqual({ cardId: 'item-9', itemIds: [IDS.shkolle, 'morph:sq:NOUN:Case=Acc|Definite=Ind|Gender=Fem|Number=Sing'] });
  });

  it('grammar-application: task choose-form, evidence attributed to the answer’s construction', async () => {
    const e = await exercise('grammar-application', IDS.liber);
    const ev = must(event(e, resp({ choice: 'libër' })).ev);
    expect(validateEvent(ev)).toEqual([]);
    expect(ev.kind).toBe('AssessmentAnswered');
    expect(ev.payload).toMatchObject({ constructionId: 'morph:sq:NOUN:Case=Nom,Acc|Definite=Ind|Gender=Masc|Number=Sing', task: 'choose-form', correct: true, rating: 3, assessmentDimension: 'construction-understanding' });
    const c = await exercise('grammar-application', IDS.constructionInd);
    expect(must(event(c, resp({ choice: c.answerKey.accepted[0] })).ev).payload).toMatchObject({ constructionId: IDS.constructionInd });
  });

  it('the lemma-only question about a provisional form claims no construction: it is a recognition card', async () => {
    const e = await exercise('morphological-identification', IDS.librin);
    const ev = must(event(e, resp({ typed: 'libër' })).ev);
    expect(validateEvent(ev)).toEqual([]);
    expect(ev.kind).toBe('CardReviewed');
    expect(ev.payload).toMatchObject({ cardKind: 'recognition', correct: true, assessmentDimension: 'morphological-analysis' });
    expect(ev.payload).not.toHaveProperty('constructionId');
    expect(ev.subject.itemIds).toEqual([IDS.librin]);
    expect(ev.evidence?.quality).toBe('weak'); // typed, but the analysis is provisional
  });
});

describe('nothing to claim, and history that claims nothing', () => {
  it('invalid, unable-to-grade and ambiguous results make no event', async () => {
    const e = await exercise('written-recognition', IDS.liber);
    const { grading, rating } = gradeAndRate(e, resp({}), { now: NOW });
    expect(grading.outcome).toBe('unable-to-grade');
    expect(evidenceFor(e, { response: resp({}), grading, rating }, identity, NOW)).toBeNull();
    const bad = { ...e, validation: { ok: false, issues: ['x'] } };
    const g2 = gradeAndRate(bad, resp({ typed: 'book' }), { now: NOW });
    expect(g2.grading.outcome).toBe('invalid-question');
    expect(evidenceFor(bad, { response: resp({ typed: 'book' }), ...g2 }, identity, NOW)).toBeNull();
    const amb: Grading = { outcome: 'ambiguous', confidence: 0.5, explanation: 'x' };
    expect(evidenceFor(e, { response: resp({ typed: 'x' }), grading: amb, rating: null }, identity, NOW)).toBeNull();
  });

  it('a challenged answer is kept as history with quality none and no rating', async () => {
    const e = await exercise('meaning-to-form', IDS.liber);
    const { ev, grading } = event(e, resp({ typed: 'libër', challenged: true }));
    expect(grading.outcome).toBe('correct');
    const x = must(ev);
    expect(validateEvent(x)).toEqual([]);
    expect(x.evidence).toMatchObject({ quality: 'none' });
    expect(x.payload).toHaveProperty('rating', null);
    expect(x.payload).toMatchObject({ correct: true, grade: 'good' });
    // and the Repository’s engine draws nothing from it
    expect(observationsOf(x)).toEqual([]);
  });
});

describe('the events the Repository engine reads', () => {
  it('a typed correct recognition is a positive reading observation; a wrong grammar choice a negative grammar one', async () => {
    const r = await exercise('written-recognition', IDS.liber);
    const obs = observationsOf(must(event(r, resp({ typed: 'book' })).ev));
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ unitId: IDS.liber, dimension: 'readingRecognition', outcome: 'positive', assisted: false });
    const g = await exercise('morphological-identification', IDS.shkolle, 0);
    const wrong = g.prompt.options!.find((o) => o !== g.answerKey.accepted[0])!;
    const go = observationsOf(must(event(g, resp({ choice: wrong })).ev));
    expect(go).toHaveLength(1);
    expect(go[0]).toMatchObject({ unitId: 'morph:sq:NOUN:Case=Acc|Definite=Ind|Gender=Fem|Number=Sing', dimension: 'grammaticalUnderstanding', outcome: 'negative' });
    const hinted = observationsOf(must(event(r, resp({ typed: 'book', hinted: true })).ev));
    expect(hinted).toEqual([]);
    const cloze = observationsOf(must(event(await exercise('sentence-completion', IDS.shkolle), resp({ typed: 'shkollë' })).ev));
    expect(cloze[0]).toMatchObject({ dimension: 'productiveRetrieval', outcome: 'positive' });
  });
});

describe('every event is valid, deterministic, and carries no sentence text', () => {
  const FAMILIES: Array<[ExerciseFamily, string, Partial<Response>]> = [
    ['written-recognition', IDS.liber, { typed: 'book' }],
    ['meaning-to-form', IDS.shkolle, { typed: 'shkollë' }],
    ['morphological-identification', IDS.shkolle, {}],
    ['grammar-application', IDS.liber, { choice: 'libër' }],
    ['phrase-comprehension', IDS.phrase, { typed: 'my name is' }],
    ['sentence-completion', IDS.liber, { typed: 'libër' }],
    ['audio-to-meaning', IDS.liber, { typed: 'book', audioPlayed: true }],
    ['audio-transcription', IDS.liber, { typed: 'libër', audioPlayed: true }],
  ];

  it.each(FAMILIES)('%s', async (family, id, response) => {
    const e = await exercise(family, id);
    const r = e.responseMode === 'choice' && !response.choice ? resp({ choice: e.answerKey.accepted[0] }) : resp(response);
    const a = must(event(e, r).ev);
    const b = must(event(e, r).ev);
    expect(a).toEqual(b); // deterministic: a retry is the same event (same id, same dedupe key)
    expect(validateEvent(a)).toEqual([]);
    expect(a.id.length).toBeLessThanOrEqual(200);
    expect(a.dedupeKey).toBe(`review:item-9:${e.exerciseId}:${NOW}`);
    expect(a.payload).toMatchObject({ family, exerciseId: e.exerciseId, assessmentDimension: FAMILY_DIMENSION[family] });
    expect(a.subject.cardId).toBe('item-9');
    expect(a.subject.itemIds).toContain(id);
    // no text of any sentence, and nothing the learner could see only after answering
    const json = JSON.stringify(a);
    for (const s of ['Ajo ka', 'Fëmijët', 'shkon', 'Unë quhem', 'Ana ', 'në _____']) expect(json, `${family}: ${s}`).not.toContain(s);
    for (const k of ['text', 'sentence', 'sentenceText', 'passage', 'content', 'body']) expect(a.payload, k).not.toHaveProperty(k);
    expect(a.subject).not.toHaveProperty('sentenceText');
    expect(a.subject).not.toHaveProperty('text');
  });

  it('the single-object form the session runner uses gives the same event', async () => {
    const e = await exercise('written-recognition', IDS.liber);
    const response = resp({ typed: 'book' });
    const { grading, rating } = gradeAndRate(e, response, { now: NOW });
    const input: EvidenceInputObject = { exercise: e, response, grading, rating, item: { itemId: 'item-9' }, identity: { learnerId: 'L1', enrolmentId: 'E1', deviceId: 'D1' }, at: NOW };
    expect(evidenceFor(input)).toEqual(evidenceFor(e, { response, grading, rating }, identity, NOW));
    // listening scores stand in for scoring metadata
    const hear = await exercise('audio-to-meaning', IDS.liber);
    const rr = resp({ typed: 'book', audioPlayed: true });
    const g = gradeAndRate(hear, rr, { now: NOW });
    const viaListening = evidenceFor({ exercise: hear, response: rr, ...g, item: { itemId: 'item-9' }, identity: { learnerId: 'L1', enrolmentId: 'E1', deviceId: 'D1' }, at: NOW, listening: { voice: 'recorded', hinted: false, replays: 0, eligibleForEvidence: true } });
    expect(viaListening?.kind).toBe('ListeningAssessed');
    const synthetic = evidenceFor({ exercise: hear, response: rr, ...g, item: { itemId: 'item-9' }, identity: { learnerId: 'L1', enrolmentId: 'E1', deviceId: 'D1' }, at: NOW, listening: { voice: 'synthetic', hinted: false, replays: 0, eligibleForEvidence: false } });
    expect(synthetic?.evidence?.quality).toBe('none');
  });
});
