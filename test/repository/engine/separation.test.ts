// @vitest-environment node
/**
 * Separation proofs: exposure, assistance and demonstrated knowledge stay in their own dimensions, and nothing that
 * happens to the analysis or to the answer key reaches back into what the learner met.
 */
import { describe, expect, it } from 'vitest';
import { DIMENSIONS } from '../../../packages/repository-contract/src';
import type { Dimension, DimensionEstimate, GoEvent, UnitKnowledge } from '../../../packages/repository-contract/src';
import { createProjectionEngine, observationsOf } from '../../../packages/repository-engine/src';
import { FakeStore } from './fakeStore';
import { L, NOW, assist, card, encounter, ev, listening, lookup, play, production, resetIds } from './helpers';

const FORM = 'form:sq:librin';
const DEMONSTRATED: Dimension[] = DIMENSIONS.filter((d) => d !== 'exposure');

async function rowAfter(events: GoEvent[], unitId = FORM): Promise<UnitKnowledge> {
  const store = new FakeStore();
  await store.append(L, events);
  const engine = createProjectionEngine({ store, now: () => NOW });
  await engine.project(L);
  return (await engine.knowledge(L)).find((r) => r.unitId === unitId)!;
}
const touched = (r: UnitKnowledge): Dimension[] => DIMENSIONS.filter((d) => r.dimensions[d].observations > 0);
const exposureOf = (r: UnitKnowledge): DimensionEstimate => r.dimensions.exposure;

describe('an encounter raises no demonstrated dimension', () => {
  it('any number of encounters leaves every demonstrated dimension at its prior, with zero confidence', async () => {
    resetIds();
    const r = await rowAfter(Array.from({ length: 12 }, () => encounter([FORM])));
    expect(touched(r)).toEqual(['exposure']);
    for (const d of DEMONSTRATED) expect(r.dimensions[d]).toMatchObject({ score: 0.5, confidence: 0, observations: 0, positive: 0, negative: 0 });
    expect(r.retention.basedOn).toBe('none');
    expect(r.uncertainty).toBe(1);
  });
});

describe('pronunciation playback raises nothing but exposure', () => {
  it('synthetic and recorded playback, and a completed listening, are exposure; the listening dimension stays untouched', async () => {
    resetIds();
    const r = await rowAfter([play([FORM]), play([FORM]), ev('ListeningCompleted', [FORM], { voice: 'recorded' }), ev('PronunciationPlayed', [FORM], { voice: 'recorded' })]);
    expect(touched(r)).toEqual(['exposure']);
    expect(r.dimensions.listeningRecognition).toMatchObject({ score: 0.5, confidence: 0 });
  });
  it('a synthetic-voice listening assessment is not listening evidence either', async () => {
    resetIds();
    expect(observationsOf(listening([FORM], true, { voice: 'synthetic' }))).toEqual([]);
  });
});

describe('a correct written review raises reading or productive retrieval, not listening', () => {
  it('a recognition card reaches readingRecognition only', async () => {
    resetIds();
    const r = await rowAfter([card([FORM], 'recognition', true), card([FORM], 'recognition', true)]);
    expect(touched(r)).toEqual(['readingRecognition']);
    expect(r.dimensions.readingRecognition.score).toBeGreaterThan(0.5);
    expect(r.dimensions.listeningRecognition).toMatchObject({ observations: 0, score: 0.5 });
  });
  it('a recall or cloze card reaches productiveRetrieval only', async () => {
    resetIds();
    for (const kind of ['recall', 'cloze'] as const) {
      const r = await rowAfter([card([FORM], kind, true)]);
      expect(touched(r)).toEqual(['productiveRetrieval']);
      expect(r.dimensions.listeningRecognition.observations).toBe(0);
    }
  });
});

describe('an AI-assisted writing correction raises nothing in contextualProduction', () => {
  const cases: Array<[string, Record<string, unknown>, Partial<GoEvent['evidence']> | undefined]> = [
    ['authorship copied-from-model', { authorship: 'copied-from-model', assisted: false, assistance: [] }, undefined],
    ['authorship ai-generated', { authorship: 'ai-generated' }, undefined],
    ['authorship revised-after-feedback', { authorship: 'revised-after-feedback' }, undefined],
    ['authorship after-hint', { authorship: 'after-hint' }, undefined],
    ['assisted: true', { assisted: true, assistance: ['correction'] }, undefined],
    ['a correction listed although assisted was left false', { assisted: false, assistance: ['correction'] }, undefined],
    ['evidence.assisted', {}, { quality: 'strong', assisted: true }],
  ];
  it.each(cases)('%s (usedCorrectly: true)', async (_name, payload, evidence) => {
    resetIds();
    const e = production([FORM], { usedCorrectly: true, ...payload }, evidence ? { evidence: evidence as GoEvent['evidence'] } : undefined);
    const obs = observationsOf(e);
    expect(obs.filter((o) => o.dimension === 'contextualProduction' || o.dimension === 'productiveRetrieval')).toEqual([]);
    const r = await rowAfter([e]);
    if (r) expect(r.dimensions.contextualProduction).toMatchObject({ observations: 0, score: 0.5, confidence: 0 });
  });
  it('copied-from-model and ai-generated produce no judged observation at all', () => {
    resetIds();
    for (const authorship of ['copied-from-model', 'ai-generated']) expect(observationsOf(production([FORM], { usedCorrectly: true, authorship }))).toEqual([]);
  });
  it('accepting the correction is copying: CorrectionAccepted and CorrectionRejected add nothing', () => {
    resetIds();
    expect(observationsOf(ev('CorrectionAccepted', [FORM], {}))).toEqual([]);
    expect(observationsOf(ev('CorrectionRejected', [FORM], {}))).toEqual([]);
  });
  it('contrast: the same sentence written independently does earn contextualProduction', () => {
    resetIds();
    expect(observationsOf(production([FORM], { usedCorrectly: true, authorship: 'independent' })).map((o) => o.dimension)).toEqual(['contextualProduction']);
    expect(observationsOf(production([FORM], { usedCorrectly: true, authorship: 'reproduced-later' })).map((o) => o.dimension)).toEqual(['contextualProduction']);
  });
});

describe('a GoReview wrong answer does not reduce exposure', () => {
  it('the exposure estimate is identical before and after a failed review; only the demonstrated dimension moves', async () => {
    resetIds();
    const met = [encounter([FORM]), encounter([FORM]), lookup([FORM]), assist([FORM]), play([FORM])];
    const before = await rowAfter(met);
    const after = await rowAfter([...met, card([FORM], 'recognition', false), card([FORM], 'recall', false), listening([FORM], false)]);
    expect(exposureOf(after)).toEqual(exposureOf(before));
    expect(after.dimensions.readingRecognition.negative).toBeGreaterThan(0);
    // and a failure never lowers a count or a weight that exposure had
    expect(exposureOf(after).weight).toBeGreaterThanOrEqual(exposureOf(before).weight);
    expect(exposureOf(after).observations).toBe(exposureOf(before).observations);
  });
});

describe('a parser correction does not erase exposure', () => {
  it('AnalysisCorrected and ReviewItemInvalidated are not evidence: the row is the same with or without them', async () => {
    resetIds();
    const met = [encounter([FORM]), lookup([FORM]), card([FORM], 'recognition', false)];
    const before = await rowAfter(met);
    const corrected = await rowAfter([
      ...met,
      ev('AnalysisCorrected', [FORM], { formId: FORM, correctedLexemeId: 'lemma:sq:libër:NOUN', by: 'reviewer' }),
      ev('ReviewItemInvalidated', [FORM], { reason: 'analysis-invalidated', analysisId: 'a1' }),
    ]);
    const strip = (r: UnitKnowledge) => ({ ...r, basis: undefined });
    expect(strip(corrected)).toEqual(strip(before));
    expect(corrected.dimensions.exposure.observations).toBe(2);
    expect(corrected.dimensions.exposure.weight).toBeGreaterThan(0);
    expect(observationsOf(ev('AnalysisCorrected', [FORM], { formId: FORM, by: 'learner' }))).toEqual([]);
  });
});
