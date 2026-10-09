// @vitest-environment node
/** Review-candidate rules added in projection@2: construction-level difficulty, validation-aware analysisConfidence, coverage, benefit vs burden, mission, frequency. */
import { describe, expect, it } from 'vitest';
import type { GoEvent, LanguagePackInfo, LinguisticUnit, ReviewCandidate, UnitProvenance } from '../../../packages/repository-contract/src';
import { CANDIDATE_RULES, MISSION_SKIPPED_NOTE, createProjectionEngine } from '../../../packages/repository-engine/src';
import { FakeStore } from './fakeStore';
import { E, L, NOW, assist, card, enrolment, ev, lookup, realizes, resetIds, unit } from './helpers';

const CX = 'morph:sq:NOUN:Case=Acc|Definite=Def';
const FORMS = ['form:sq:librin', 'form:sq:shtëpinë', 'form:sq:mësuesin', 'form:sq:djalin'];
const RECENT = '2026-10-06T10:00:00.000Z';

const prov = (validation: string): UnitProvenance => ({ source: 'dictionary', ref: 'test', confidence: 0.99, validation }) as unknown as UnitProvenance;

async function run(events: GoEvent[], setup?: (s: FakeStore) => void, opts: { includeCovered?: boolean } = {}) {
  const store = new FakeStore();
  store.enrolments.push(enrolment());
  setup?.(store);
  await store.append(L, events);
  const engine = createProjectionEngine({ store, now: () => NOW });
  const notes: string[] = [];
  const list = await engine.candidates(L, E, { now: NOW, notes, ...opts });
  return { store, engine, list, notes };
}
const world = (forms: string[], cxExtra: Partial<LinguisticUnit> = {}, formExtra: Partial<LinguisticUnit> = {}) => (s: FakeStore): void => {
  for (const f of forms) s.units.set(f, unit(f, 'form', 'verified', formExtra));
  s.units.set(CX, unit(CX, 'morph-construction', 'verified', { label: 'definite accusative', ...cxExtra }));
  s.relations.push(...forms.map((f) => realizes(f, CX)));
};
const by = (list: ReviewCandidate[], id: string): ReviewCandidate | undefined => list.find((c) => c.unitId === id);
const rules = (c: ReviewCandidate | undefined): string[] => (c?.reasons ?? []).map((r) => r.rule);

describe('construction-level difficulty (grammaticalLeverage)', () => {
  const gloss = (f: string, at = RECENT) => assist([f], { assistance: 'gloss' }, { at });

  it('four definite-accusative forms with gloss requests: ONE construction candidate with the explanation, and the forms are demoted', async () => {
    resetIds();
    const events = FORMS.map((f) => gloss(f));
    const withC = await run(events, world(FORMS));
    const without = await run(events, (s) => { for (const f of FORMS) s.units.set(f, unit(f, 'form', 'verified')); });

    const c = by(withC.list, CX)!;
    expect(c).toBeDefined();
    expect(withC.list.filter((x) => x.kind === 'morph-construction')).toHaveLength(1);
    expect(c.targetDimension).toBe('grammaticalUnderstanding');
    expect(c.explains).toEqual([...FORMS].sort());
    expect(c.reasons.find((r) => r.rule === 'grammaticalLeverage')).toMatchObject({ weight: 0.3, detail: 'repeated difficulty across 4 forms of definite accusative' });
    expect(c.eligibility.eligible).toBe(true);
    expect(by(without.list, CX)).toBeUndefined();

    for (const f of FORMS) {
      const demoted = by(withC.list, f)!;
      const plain = by(without.list, f)!;
      expect(rules(demoted)).toContain('explained-by-construction');
      expect(demoted.score).toBeCloseTo(plain.score * 0.5);
    }
  });

  it('three forms are enough, two are not', async () => {
    resetIds();
    expect(by((await run(FORMS.slice(0, 3).map((f) => gloss(f)), world(FORMS))).list, CX)).toBeDefined();
    expect(by((await run(FORMS.slice(0, 2).map((f) => gloss(f)), world(FORMS))).list, CX)).toBeUndefined();
  });

  it('counts distinct forms, not requests: one form asked about four times indicts nothing', async () => {
    resetIds();
    const { list } = await run([gloss(FORMS[0]), gloss(FORMS[0]), gloss(FORMS[0]), gloss(FORMS[0])], world(FORMS));
    expect(by(list, CX)).toBeUndefined();
  });

  it('failed recognition counts too, mixed with assistance requests', async () => {
    resetIds();
    const events = [gloss(FORMS[0]), gloss(FORMS[1]), card([FORMS[2]], 'recognition', false, {}, { at: RECENT })];
    const { list } = await run(events, world(FORMS));
    expect(by(list, CX)?.explains).toEqual([FORMS[0], FORMS[1], FORMS[2]].sort());
  });

  it('only difficulty inside the window counts: three forms asked about months ago do not promote the construction', async () => {
    resetIds();
    const old = '2026-07-01T10:00:00.000Z';
    const { list } = await run(FORMS.slice(0, 3).map((f) => gloss(f, old)), world(FORMS));
    expect(by(list, CX)).toBeUndefined();
    const mixed = await run([gloss(FORMS[0], old), gloss(FORMS[1], old), gloss(FORMS[2], RECENT)], world(FORMS));
    expect(by(mixed.list, CX)).toBeUndefined();
    expect(CANDIDATE_RULES.grammaticalLeverage.windowDays).toBe(30);
  });

  it('an exposure-only form does not count, nor does a form without a realizes relation', async () => {
    resetIds();
    const events = [gloss(FORMS[0]), gloss(FORMS[1]), ev('EncounterRecorded', [FORMS[2]], { contextKind: 'sentence' }, { at: RECENT })];
    expect(by((await run(events, world(FORMS))).list, CX)).toBeUndefined();
    const noRel = await run(FORMS.slice(0, 3).map((f) => gloss(f)), (s) => { world(FORMS)(s); s.relations.length = 0; });
    expect(by(noRel.list, CX)).toBeUndefined();
  });

  it('an ineligible construction (experimental pack) is listed last with score 0 and does NOT demote its forms', async () => {
    resetIds();
    const events = FORMS.map((f) => gloss(f));
    const exp = await run(events, world(FORMS, { provenance: prov('experimental') }));
    const c = by(exp.list, CX)!;
    expect(c.eligibility).toMatchObject({ eligible: false, status: 'provisional', reason: expect.stringContaining('experimental') });
    expect(c.score).toBe(0);
    expect(exp.list[exp.list.length - 1].unitId).toBe(CX);
    for (const f of FORMS) expect(rules(by(exp.list, f))).not.toContain('explained-by-construction');
  });

  it('is deterministic and every score is the clamped sum of its reasons', async () => {
    resetIds();
    const events = FORMS.map((f) => gloss(f));
    const a = (await run(events, world(FORMS))).list;
    resetIds();
    const b = (await run(FORMS.map((f) => gloss(f)), world(FORMS))).list;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const c of a) if (c.eligibility.eligible) expect(c.score).toBeCloseTo(Math.min(1, Math.max(0, c.reasons.reduce((s, r) => s + r.weight, 0))));
  });
});

describe('analysisConfidence by validation level', () => {
  const F = 'form:sq:librin';
  const ev1 = (): GoEvent[] => [card([F], 'recognition', false, {}, { at: RECENT })];

  it.each([['experimental', -0.3], ['seed-only', -0.3], ['unreviewed', -0.1]])('%s: eligible for recognition but with a negative that names the level', async (validation, weight) => {
    resetIds();
    const good = by((await run(ev1(), (s) => { s.units.set(F, unit(F, 'form', 'verified', { provenance: prov('production-validated') })); })).list, F)!;
    const weak = by((await run(ev1(), (s) => { s.units.set(F, unit(F, 'form', 'verified', { provenance: prov(validation) })); })).list, F)!;
    expect(weak.eligibility).toMatchObject({ eligible: true, status: 'provisional' });
    expect(weak.reasons.find((r) => r.rule === 'analysisConfidence')).toMatchObject({ weight, detail: expect.stringContaining(validation) });
    expect(rules(good)).not.toContain('analysisConfidence');
    expect(weak.score).toBeCloseTo(good.score + weight);
  });

  it('a 0.99-confidence experimental analysis is still provisional and is not raised by its confidence', async () => {
    resetIds();
    const c = by((await run(ev1(), (s) => { s.units.set(F, unit(F, 'form', 'high-confidence', { provenance: prov('experimental') })); })).list, F)!;
    expect(c.eligibility.eligible && c.eligibility.status).toBe('provisional');
  });

  it('incomplete and unsupported analyses are not eligible: score 0, listed after the eligible ones, reason names the level', async () => {
    resetIds();
    for (const validation of ['incomplete', 'unsupported']) {
      const { list } = await run(ev1(), (s) => { s.units.set(F, unit(F, 'form', 'verified', { provenance: prov(validation) })); });
      const c = by(list, F)!;
      expect(c.eligibility).toMatchObject({ eligible: false, status: 'requires-review' });
      expect(c.score).toBe(0);
      expect(c.reasons.find((r) => r.rule === 'analysisConfidence')!.detail).toContain(validation);
    }
  });
});

describe('existingCoverage', () => {
  const F = 'form:sq:librin';
  const base = (): GoEvent[] => [card([F], 'recognition', false, {}, { at: RECENT })];
  const setup = (s: FakeStore): void => { s.units.set(F, unit(F, 'form', 'verified')); };

  it('a unit already carded in the deck events is not proposed again; removing the card proposes it again', async () => {
    resetIds();
    const carded = [...base(), ev('CardAdded', [F], {}, { at: '2026-10-07T11:00:00.000Z' })];
    expect(by((await run(carded, setup)).list, F)).toBeUndefined();
    const removed = [...carded, ev('CardRemoved', [F], {}, { at: '2026-10-07T12:00:00.000Z' })];
    expect(by((await run(removed, setup)).list, F)).toBeDefined();
    const invalidated = [...carded, ev('ReviewItemInvalidated', [F], { reason: 'analysis-invalidated' }, { at: '2026-10-07T12:00:00.000Z' })];
    expect(by((await run(invalidated, setup)).list, F)).toBeDefined();
  });

  it('includeCovered lists it with the documented penalty and the reason', async () => {
    resetIds();
    const carded = [...base(), ev('CardAdded', [F], {}, { at: '2026-10-07T11:00:00.000Z' })];
    const c = by((await run(carded, setup, { includeCovered: true })).list, F)!;
    expect(c.reasons.find((r) => r.rule === 'existingCoverage')).toMatchObject({ weight: -0.3, detail: expect.stringMatching(/already covered/) });
  });

  it('a card on the construction keeps the construction from being proposed, and its forms are then not demoted for it', async () => {
    resetIds();
    const events = [...FORMS.map((f) => assist([f], { assistance: 'gloss' }, { at: RECENT })), ev('CardAdded', [CX], {}, { at: '2026-10-07T11:00:00.000Z' })];
    const { list } = await run(events, world(FORMS));
    expect(by(list, CX)).toBeUndefined();
    for (const f of FORMS) expect(rules(by(list, f))).not.toContain('explained-by-construction');
  });
});

describe('benefitVsBurden', () => {
  it('a cheap, valuable item gains 0.05 with the numbers in the detail', async () => {
    resetIds();
    const F = 'form:sq:librin';
    const c = by((await run([card([F], 'recognition', false, {}, { at: RECENT })], (s) => { s.units.set(F, unit(F, 'form', 'verified')); })).list, F)!;
    const r = c.reasons.find((x) => x.rule === 'benefitVsBurden')!;
    expect(r.weight).toBe(0.05);
    expect(r.detail).toMatch(/benefit 0\.75 vs burden 0\.30: cheap/);
  });

  it('a long, costly item with little to gain loses 0.05', async () => {
    resetIds();
    const P = 'phrase:sq:a_b_c_d_e';
    const { list } = await run([lookup([P], { at: RECENT })], (s) => { s.units.set(P, unit(P, 'multiword', 'verified', { label: 'a b c d e' })); });
    const r = by(list, P)!.reasons.find((x) => x.rule === 'benefitVsBurden')!;
    expect(r.weight).toBe(-0.05);
    expect(r.detail).toMatch(/costly/);
  });

  it('is silent between the two ratios', async () => {
    resetIds();
    const P = 'phrase:sq:a_b';
    const { list } = await run([lookup([P], { at: RECENT }), lookup([P], { at: RECENT })], (s) => { s.units.set(P, unit(P, 'multiword', 'verified', { label: 'a b' })); });
    expect(rules(by(list, P))).not.toContain('benefitVsBurden');
  });
});

describe('missionRelevance', () => {
  const F = 'form:sq:librin';
  const events = (): GoEvent[] => [card([F], 'recognition', false, {}, { at: RECENT })];
  const setup = (s: FakeStore): void => { s.units.set(F, unit(F, 'form', 'verified')); };

  it('is skipped, with a note, when the pack facts expose no mission word list', async () => {
    resetIds();
    const { list, notes } = await run(events(), setup);
    expect(rules(by(list, F))).not.toContain('missionRelevance');
    expect(notes).toEqual([MISSION_SKIPPED_NOTE]);
  });

  it('credits a unit in the mission word list when the pack exposes one', async () => {
    resetIds();
    const pack = { packId: 'pack:sq', languageId: 'sq', version: '1', analyzerId: 'x', coverage: { notes: [] }, licences: [], reviewStatus: 'machine-drafted', missionUnitIds: [F] } as unknown as LanguagePackInfo;
    const { list, notes } = await run(events(), (s) => { setup(s); s.packs.push(pack); });
    expect(by(list, F)!.reasons.find((r) => r.rule === 'missionRelevance')).toMatchObject({ weight: 0.1 });
    expect(notes).toEqual([]);
  });
});

describe('wordFrequency', () => {
  it('is graded by the unit\'s own rank: very common 0.15, common 0.1, uncommon none and not a candidate on its own', async () => {
    resetIds();
    const ids = ['form:sq:a', 'form:sq:b', 'form:sq:c'];
    const { list } = await run(ids.map((i) => ev('EncounterRecorded', [i], { contextKind: 'sentence' }, { at: RECENT })), (s) => {
      s.units.set(ids[0], unit(ids[0], 'form', 'verified', { frequency: { rank: 120, source: 't' } }));
      s.units.set(ids[1], unit(ids[1], 'form', 'verified', { frequency: { rank: 1500, source: 't' } }));
      s.units.set(ids[2], unit(ids[2], 'form', 'verified', { frequency: { rank: 9000, source: 't' } }));
    });
    expect(by(list, ids[0])!.reasons.find((r) => r.rule === 'wordFrequency')).toMatchObject({ weight: 0.15, detail: 'frequency rank 120' });
    expect(by(list, ids[1])!.reasons.find((r) => r.rule === 'wordFrequency')).toMatchObject({ weight: 0.1 });
    expect(by(list, ids[2])).toBeUndefined();
  });
});
