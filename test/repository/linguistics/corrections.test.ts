// @vitest-environment node
/**
 * Corrections end to end (service + projection engine over one store): the encounter events stay exactly as recorded, the
 * wrong answer key is withdrawn and superseded, and the learner's exposure follows the corrected identity.
 */
import { describe, expect, it } from 'vitest';
import type { FormAnalysis, GoEvent, UnitProvenance } from '../../../packages/repository-contract/src';
import { createProjectionEngine, eligibilityFor } from '../../../packages/repository-engine/src';
import { createLinguisticService } from '../../../packages/repository-linguistics/src';
import { FakeStore as Store } from '../engine/fakeStore';
import { E, L, NOW, card, encounter, enrolment, lookup, resetIds, unit } from '../engine/helpers';

const FORM = 'form:sq:librin';
const WRONG = 'lemma:sq:libra:NOUN';
const RIGHT = 'lemma:sq:libër:NOUN';
const WRONG_MORPH = 'morph:sq:NOUN:Case=Nom';
const AT = '2026-10-09T09:00:00.000Z';
const prov = (confidence: number): UnitProvenance => ({ source: 'parser', ref: 'adapter-sq@9', confidence, validation: 'production-validated' }) as unknown as UnitProvenance;

/** A form whose parser committed to ONE reading, a wrong lemma, and a learner who met, looked up and failed on it. */
async function world(extra: (s: Store) => void = () => undefined, candidates = 1) {
  resetIds();
  const store = new Store();
  store.enrolments.push(enrolment());
  store.units.set(FORM, unit(FORM, 'form', 'provisional', { provenance: prov(0.7) }));
  store.units.set(WRONG, unit(WRONG, 'lexeme', 'provisional', { provenance: prov(0.7) }));
  store.units.set(WRONG_MORPH, unit(WRONG_MORPH, 'morph-construction', 'provisional', { provenance: prov(0.7) }));
  const readings = [{ lexemeId: WRONG, constructionIds: [WRONG_MORPH], confidence: 0.7, provenance: prov(0.7) }];
  if (candidates > 1) readings.push({ lexemeId: 'lemma:sq:librë:NOUN', constructionIds: [], confidence: 0.6, provenance: prov(0.6) });
  const old: FormAnalysis = {
    analysisId: 'analysis:old', formId: FORM, languageId: 'sq', candidates: readings, chosen: 0, status: 'provisional', analyzerId: 'adapter-sq@9',
    packId: 'pack:sq', packVersion: '9', createdAt: '2026-10-01T00:00:00.000Z',
  };
  store.analyses.set(old.analysisId, old);
  store.relations.push({ fromId: FORM, relation: 'form-of', toId: WRONG, confidence: 0.7, provenance: prov(0.7), status: 'provisional' });
  store.relations.push({ fromId: FORM, relation: 'realizes', toId: WRONG_MORPH, confidence: 0.7, provenance: prov(0.7), status: 'provisional' });
  extra(store);
  // what the reader recorded: the form and the lexeme the (wrong) analysis named, as the learner met them
  const at = (h: number) => ({ at: `2026-10-07T${String(h).padStart(2, '0')}:00:00.000Z` });
  const events: GoEvent[] = [
    encounter([FORM, WRONG], at(8)), encounter([FORM, WRONG], at(9)), lookup([FORM, WRONG], at(10)), card([FORM, WRONG], 'recognition', false, {}, at(11)),
  ];
  await store.append(L, events);
  const engine = createProjectionEngine({ store, now: () => NOW });
  const svc = createLinguisticService(store, { now: () => AT });
  return { store, engine, svc, events };
}
const snapshot = (store: Store): string => JSON.stringify(store.events);

describe('a reviewer corrects a wrong lemma', () => {
  it('(a) the original encounter events are untouched, byte for byte', async () => {
    const { store, engine, svc } = await world();
    await engine.project(L);
    const before = snapshot(store);
    const headBefore = await store.head(L);
    await svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer', reason: 'wrong lemma' }, AT);
    expect(snapshot(store)).toBe(before);
    expect(await store.head(L)).toBe(headBefore);
    expect(store.events).toHaveLength(4);
  });

  it('(c) returns the affected units and the ones whose candidates must be withdrawn', async () => {
    const { svc } = await world();
    const r = await svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer' }, AT);
    expect(r.withdrawUnitIds).toEqual([WRONG, WRONG_MORPH].sort());
    expect(r.affectedUnitIds).toEqual([RIGHT, WRONG, WRONG_MORPH].sort());
    expect(r.affectedUnitIds).toEqual(expect.arrayContaining(r.withdrawUnitIds));
  });

  it('(d) the corrected analysis supersedes the old one, and the old answer key is invalidated everywhere', async () => {
    const { store, svc } = await world();
    const r = await svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer' }, AT);
    const old = store.analyses.get('analysis:old')!;
    expect(old).toMatchObject({ status: 'invalidated', supersededBy: r.analysis.analysisId });
    expect(old.candidates[0].lexemeId).toBe(WRONG); // the row is kept as history
    expect(r.analysis.status).toBe('verified');
    // the old lexeme is superseded, and its eligibility reads invalidated for every dimension
    expect(r.superseded).toEqual([WRONG]);
    expect(store.units.get(WRONG)!.supersededBy).toBe(RIGHT);
    for (const d of ['readingRecognition', 'grammaticalUnderstanding'] as const) {
      expect(eligibilityFor(store.units.get(WRONG), [], d)).toEqual({ eligible: false, status: 'invalidated', reason: `superseded by ${RIGHT}` });
    }
    // the form: only the corrected analysis is live
    expect(eligibilityFor(store.units.get(FORM), await store.analysesOfForm(FORM), 'readingRecognition')).toMatchObject({ eligible: true, status: 'verified' });
  });

  it('(b) re-keys the projection through a certain alias: the exposure is preserved on the new id, nothing is left on the old one', async () => {
    const { store, engine, svc } = await world();
    const early = await engine.knowledge(L, [WRONG]);
    const exposureBefore = early[0].dimensions.exposure;
    const countersBefore = await engine.counters(L, WRONG);
    expect(exposureBefore.observations).toBe(3);

    const r = await svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer', reason: 'wrong lemma' }, AT);
    expect(r.aliases.find((a) => a.oldId === WRONG)).toMatchObject({ newId: RIGHT, mapping: 'certain', confidence: 0.95 });
    expect(store.aliases.map((a) => a.oldId)).toContain(WRONG);

    const rows = await engine.knowledge(L); // self-healing read: sees the new certain alias and re-keys
    expect(rows.find((x) => x.unitId === WRONG)).toBeUndefined();
    const moved = rows.find((x) => x.unitId === RIGHT)!;
    expect(moved.dimensions.exposure).toEqual(exposureBefore);
    expect(moved.dimensions.readingRecognition).toEqual(early[0].dimensions.readingRecognition); // the failed card moved with it
    expect(await engine.counters(L, RIGHT)).toEqual(countersBefore);
    expect(await engine.counters(L, WRONG)).toEqual(countersBefore); // reads of the old id resolve to the new one
    // a rebuild from the log gives the same state
    expect(JSON.stringify(await engine.rebuild(L))).toBe(JSON.stringify(rows));
    // the form keeps its own exposure
    expect(rows.find((x) => x.unitId === FORM)!.dimensions.exposure.observations).toBe(3);
  });

  it('(c) the old candidate is withdrawn; the new unit is a candidate only at the corrected status', async () => {
    const { engine, svc } = await world();
    const before = await engine.candidates(L, E, { now: NOW });
    expect(before.map((c) => c.unitId)).toContain(WRONG);
    expect(before.find((c) => c.unitId === WRONG)!.eligibility).toMatchObject({ eligible: true, status: 'provisional' });

    await svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer' }, AT);
    const after = await engine.candidates(L, E, { now: NOW });
    expect(after.map((c) => c.unitId)).not.toContain(WRONG);
    const fresh = after.find((c) => c.unitId === RIGHT)!;
    expect(fresh).toBeDefined();
    expect(fresh.eligibility).toMatchObject({ eligible: true, status: 'verified' }); // a reviewer's verdict, and only that
    expect(fresh.reasons.map((r) => r.rule)).toContain('demonstratedError'); // the learner's failure followed the identity
  });
});

describe('a learner corrects a wrong lemma', () => {
  it('is provisional: the alias is uncertain, the evidence stays where it was, the new unit is eligible for recognition only', async () => {
    const { store, engine, svc } = await world();
    const before = JSON.stringify(await engine.knowledge(L));
    const r = await svc.correct(FORM, { lexemeId: RIGHT, by: 'learner' }, AT);
    expect(r.analysis.status).toBe('provisional');
    expect(r.aliases.find((a) => a.oldId === WRONG)).toMatchObject({ newId: RIGHT, mapping: 'uncertain', confidence: 0.6 });
    expect(r.superseded).toEqual([]);
    expect(r.withdrawUnitIds).toContain(WRONG); // still reported, so the caller withdraws the item
    expect(store.units.get(WRONG)!.supersededBy).toBeUndefined();
    expect(JSON.stringify(await engine.knowledge(L))).toBe(before); // an uncertain alias moves nothing
    // the new lexeme is only provisional: no grammatical or productive item on it
    expect(eligibilityFor(store.units.get(RIGHT), [], 'readingRecognition')).toMatchObject({ eligible: true, status: 'provisional' });
    expect(eligibilityFor(store.units.get(RIGHT), [], 'grammaticalUnderstanding')).toMatchObject({ eligible: false });
    expect(store.units.get(RIGHT)!.provenance).toMatchObject({ source: 'learner', validation: 'unreviewed' });
  });
});

describe('when a correction is a re-key and when it is not', () => {
  it('resolving an ambiguity (the superseded analysis had several readings) is not a wrong answer: no alias, evidence stays', async () => {
    const { engine, svc } = await world(() => undefined, 2);
    const before = JSON.stringify(await engine.knowledge(L));
    const r = await svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer' }, AT);
    expect(r.aliases).toEqual([]);
    expect(r.withdrawUnitIds).toContain(WRONG);
    expect(JSON.stringify(await engine.knowledge(L))).toBe(before);
  });

  it('rekey: true forces the re-key of an ambiguous one; rekey: false forbids it for a committed one', async () => {
    const forced = await world(() => undefined, 2);
    expect((await forced.svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer', rekey: true }, AT)).aliases.map((a) => a.oldId)).toContain(WRONG);
    const forbidden = await world();
    expect((await forbidden.svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer', rekey: false }, AT)).aliases).toEqual([]);
  });

  it('an id another live analysis still points at is not re-keyed', async () => {
    const other = 'form:sq:librat';
    const { store, svc } = await world((s) => {
      s.units.set(other, unit(other, 'form', 'provisional'));
      s.analyses.set('analysis:other', {
        analysisId: 'analysis:other', formId: other, languageId: 'sq', candidates: [{ lexemeId: WRONG, confidence: 0.7, provenance: prov(0.7) }], chosen: 0, status: 'provisional',
        analyzerId: 'adapter-sq@9', packId: 'pack:sq', packVersion: '9', createdAt: '2026-10-01T00:00:00.000Z',
      });
      s.relations.push({ fromId: other, relation: 'form-of', toId: WRONG, confidence: 0.7, provenance: prov(0.7), status: 'provisional' });
    });
    const r = await svc.correct(FORM, { lexemeId: RIGHT, by: 'reviewer' }, AT);
    expect(r.aliases.map((a) => a.oldId)).not.toContain(WRONG);
    expect(store.units.get(WRONG)!.supersededBy).toBeUndefined();
  });

  it('a feature correction re-keys the construction within its part of speech, and never across parts of speech', async () => {
    const { svc } = await world();
    const same = await svc.correct(FORM, { features: { Case: 'Acc' }, lexemeId: 'lemma:sq:libër:NOUN', by: 'reviewer' }, AT);
    expect(same.aliases.map((a) => `${a.oldId}>${a.newId}`)).toEqual(expect.arrayContaining([`${WRONG_MORPH}>morph:sq:NOUN:Case=Acc`]));
    const across = await world();
    const verb = await across.svc.correct(FORM, { features: { Tense: 'Pres' }, lexemeId: 'lemma:sq:lexoj:VERB', by: 'reviewer' }, AT);
    expect(verb.aliases.map((a) => a.oldId)).not.toContain(WRONG_MORPH);
  });
});

describe('invalidate names what to withdraw', () => {
  it('reports the affected units and, with a replacement, only those the replacement drops', async () => {
    const { svc } = await world();
    const plain = await svc.invalidate('analysis:old', 'wrong parse');
    expect(plain.affectedUnitIds).toEqual([WRONG, WRONG_MORPH].sort());
    expect(plain.withdrawUnitIds).toEqual(plain.affectedUnitIds);
    const again = await world();
    const replacement: FormAnalysis = { ...(await again.store.getAnalysis('analysis:old'))!, analysisId: 'analysis:new', candidates: [{ lexemeId: RIGHT, constructionIds: [WRONG_MORPH], confidence: 0.9, provenance: prov(0.9) }], status: 'verified' };
    const withR = await again.svc.invalidate('analysis:old', 'better reading', replacement);
    expect(withR.withdrawUnitIds).toEqual([WRONG]);
    expect(withR.affectedUnitIds).toEqual([WRONG, WRONG_MORPH].sort());
  });
});
