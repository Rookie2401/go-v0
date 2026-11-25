/**
 * A Korean homonym's lemma string carries the dictionary's number (눈² = snow). The number is identity, never spelling: GoReview's card
 * front and back, what the learner is asked to type, and the text a voice is given are the bare headword (눈). The unit id and the facts'
 * lemma keep the number, so the two homonyms stay two items.
 */
import { describe, expect, it } from 'vitest';
import { BUILDERS, gradeAndRate } from '../../../packages/goreview/src/exercises';
import type { ReviewExercise } from '../../../packages/goreview/src/exercises';
import type { ReviewFacts } from '../../../packages/goreview/src/facts';
import { FAMILY_DIMENSION } from '../../../packages/goreview/src/types';
import type { ExerciseFamily } from '../../../packages/goreview/src/types';
import { unitLabel } from '../../../packages/goreview/app/format';
import { unitLabel as tellUnitLabel } from '../../../packages/gotell/src';
import { IDS, NOW, ctxOf, fakeAudio, makeWorld, target } from './support';

const KO_ID = 'lemma:ko:눈²:NOUN';

/** The Albanian lemma's facts, re-labelled as the Korean homonym 눈² "snow": the shape is the pack's own, only the identity is Korean. */
async function koreanFacts(): Promise<ReviewFacts> {
  const f = await makeWorld().facts(IDS.liber);
  return { ...f, lemma: '눈²', glosses: ['snow'], unit: { ...f.unit, unitId: KO_ID, label: '눈²', languageId: 'ko' } } as ReviewFacts;
}
const koTarget = (family: ExerciseFamily) => ({ ...target(KO_ID, FAMILY_DIMENSION[family]), languageId: 'ko', varietyId: undefined });
const buildKo = async (family: ExerciseFamily, audio?: ReturnType<typeof fakeAudio>): Promise<ReviewExercise> => {
  const f = await koreanFacts();
  const r = await BUILDERS[family].build(koTarget(family) as never, f, ctxOf({ audio }));
  if ('unavailable' in r) throw new Error(r.reason);
  return r as ReviewExercise;
};

describe('Korean homonym numbers on GoReview cards', () => {
  it('the unit id keeps the number; every label made from it is the headword', () => {
    expect(KO_ID).toContain('눈²');
    expect(unitLabel(KO_ID)).toBe('눈');
    expect(unitLabel('lemma:ko:묻다¹:VERB')).toBe('묻다');
    expect(unitLabel('form:ko:눈이')).toBe('눈이');
    expect(tellUnitLabel(KO_ID)).toBe('눈');
    // other languages and a unit's exponent are untouched
    expect(unitLabel('lemma:sq:shtëpi:NOUN')).toBe('shtëpi');
    expect(unitLabel('lemma:en:m²:NOUN')).toBe('m²');
  });

  it('the front of a recognition card shows the headword, never the number, in the question or the explanation', async () => {
    const e = await buildKo('written-recognition');
    expect(e.target.unitId).toBe(KO_ID);
    const shown = JSON.stringify([e.prompt, e.answerKey.explanation]);
    expect(shown).toContain('눈');
    expect(shown).not.toMatch(/[⁰¹²³⁴-⁹]/);
  });

  it('a retrieval card asks for the headword and accepts it as typed, without the number', async () => {
    const e = await buildKo('meaning-to-form');
    expect(e.answerKey.accepted).toEqual(['눈']);
    expect(gradeAndRate(e, { hinted: false, assistance: [], typed: '눈' }, { now: NOW })).toMatchObject({ grading: { outcome: 'correct' } });
    expect(JSON.stringify([e.prompt, e.answerKey.explanation])).not.toMatch(/[⁰¹²³⁴-⁹]/);
  });

  it('a listening card gives GoListen the headword and expects it back', async () => {
    const audio = fakeAudio('recorded');
    const e = await buildKo('audio-transcription', audio);
    expect(audio.requests.map((r) => r.text)).toEqual(['눈']);
    expect(e.prompt.stimulusText).toBe('눈');
    expect(e.answerKey.accepted).toEqual(['눈']);
  });
});
