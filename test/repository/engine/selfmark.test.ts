// @vitest-environment node
/**
 * The learner's own marks on a word. projection@3 had three ("New to me" = learning, "I recognise it" = known, "I can use it" = productive);
 * projection@5 reads them as LEVELS (learning = new, productive = known, the word known = the level known) and adds the six level words.
 * The contract accepts the legacy words; the fold keeps the LATEST explicit mark as `UnitKnowledge.selfMark` (a level), order-independently;
 * `productive` is a weak productiveRetrieval credit; and the candidate rules read the mark through the level.
 */
import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../../packages/repository-contract/src';
import type { GoEvent, UnitKnowledge } from '../../../packages/repository-contract/src';
import { CANDIDATE_RULES, MODEL_VERSION, RULES, createProjectionEngine, foldEvents, isPositiveTraceable, observationsOf } from '../../../packages/repository-engine/src';
import { FakeStore } from './fakeStore';
import { E, L, NOW, card, enrolment, ev, lookup, production, resetIds, unit } from './helpers';

const LEMMA = 'lemma:sq:shtepi:NOUN';
const FORM = 'form:sq:shtepine';
const T = (h: number, m = 0): string => `2026-10-06T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const mark = (m: string, at: string, ids: string[] = [LEMMA, FORM], id?: string): GoEvent => ev('ItemMarked', ids, { mark: m }, { at, ...(id ? { id } : {}) });
const selfMarkOf = (events: GoEvent[], unitId = LEMMA): UnitKnowledge['selfMark'] =>
  foldEvents(events, { modelVersion: MODEL_VERSION }).find((r) => r.unitId === unitId)?.selfMark;

describe('the contract accepts the productive mark', () => {
  it('ItemMarked validates for saved, known, learning, productive and ignore, and refuses anything else', () => {
    resetIds();
    for (const m of ['saved', 'known', 'learning', 'productive', 'ignore', 'new', 'seen', 'recognized', 'familiar', 'automatic']) expect(validateEvent(mark(m, T(9))), m).toEqual([]);
    expect(validateEvent(mark('mastered', T(9))).map((i) => i.path)).toContain('payload.mark');
  });
});

describe('productive ("I can use it") is a weak productiveRetrieval credit', () => {
  it('is one positive productiveRetrieval observation on each unit named, with the documented weight', () => {
    resetIds();
    const obs = observationsOf(mark('productive', T(9)));
    expect(obs.map((o) => `${o.unitId}:${o.dimension}:${o.outcome}`).sort()).toEqual([`${FORM}:productiveRetrieval:positive`, `${LEMMA}:productiveRetrieval:positive`]);
    expect(RULES.itemMark.productive).toBe(0.3);
    expect(obs[0].weight).toBeCloseTo(0.09);
    expect(obs[0].sourceReliability).toBeCloseTo(0.3);
    expect(obs[0].assisted).toBe(false);
  });

  it('weighs less than a demonstrated retrieval (a recall card, a retrieval production) and a little more than a "known" mark', () => {
    resetIds();
    const w = (e: GoEvent): number => observationsOf(e)[0].weight;
    const self = w(mark('productive', T(9), [LEMMA]));
    expect(self).toBeLessThan(w(card([LEMMA], 'recall', true)) / 5);
    expect(self).toBeLessThan(w(production([LEMMA], { mode: 'retrieval' })) / 5);
    expect(self).toBeGreaterThan(w(mark('known', T(9), [LEMMA])));
  });

  it('is traceable to its own payload (principle j) and a quality "none" note drops it', () => {
    resetIds();
    const e = mark('productive', T(9));
    for (const o of observationsOf(e)) expect(isPositiveTraceable(e, o)).toBe(true);
    expect(observationsOf({ ...e, evidence: { quality: 'none' } as GoEvent['evidence'] })).toEqual([]);
  });

  it('raises productiveRetrieval for the unit and nothing else judged', () => {
    resetIds();
    const row = foldEvents([mark('productive', T(9))], { modelVersion: MODEL_VERSION }).find((r) => r.unitId === LEMMA)!;
    expect(row.dimensions.productiveRetrieval).toMatchObject({ observations: 1, positive: 0.09, negative: 0 });
    expect(row.dimensions.readingRecognition.observations).toBe(0);
  });
});

describe('UnitKnowledge.selfMark: the latest explicit mark', () => {
  it('is absent for a unit that was never marked, and for one that was only saved or ignored', () => {
    resetIds();
    const rows = foldEvents([lookup([LEMMA]), mark('saved', T(9)), mark('ignore', T(10))], { modelVersion: MODEL_VERSION });
    expect(rows.find((r) => r.unitId === LEMMA)).toBeDefined();
    expect('selfMark' in rows.find((r) => r.unitId === LEMMA)!).toBe(false);
  });

  it('is the mark the learner made, with the instant of the event', () => {
    resetIds();
    // legacy words are read as the level they meant: learning = new, productive = known
    expect(selfMarkOf([mark('learning', T(9))])).toEqual({ mark: 'new', at: T(9) });
    expect(selfMarkOf([mark('known', T(9))], FORM)).toEqual({ mark: 'known', at: T(9) });
    expect(selfMarkOf([mark('productive', T(9))])).toEqual({ mark: 'known', at: T(9) });
    for (const m of ['new', 'seen', 'recognized', 'familiar', 'known', 'automatic']) expect(selfMarkOf([mark(m, T(9))]), m).toEqual({ mark: m, at: T(9) });
  });

  it('a later mark replaces an earlier one, whatever order the events arrive in', () => {
    resetIds();
    const a = mark('learning', T(9), undefined, 'm-a');
    const b = mark('known', T(10), undefined, 'm-b');
    const c = mark('productive', T(11), undefined, 'm-c');
    const d = mark('saved', T(12), undefined, 'm-d'); // a bookmark after: not a mark of knowledge
    for (const order of [[a, b, c, d], [d, c, b, a], [b, d, a, c], [c, a, d, b]]) expect(selfMarkOf(order)).toEqual({ mark: 'known', at: T(11) });
    expect(selfMarkOf([c, b, a])).toEqual({ mark: 'known', at: T(11) });
    // and back again: "New to me" after "I can use it" wins because it is later
    expect(selfMarkOf([c, mark('learning', T(13), undefined, 'm-e'), b])).toEqual({ mark: 'new', at: T(13) });
  });

  it('two marks at the same instant are settled by event id, the same way in any order', () => {
    resetIds();
    const x = mark('known', T(9), undefined, 'ev-aaa');
    const y = mark('learning', T(9), undefined, 'ev-bbb');
    expect(selfMarkOf([x, y])).toEqual(selfMarkOf([y, x]));
    expect(selfMarkOf([x, y])?.mark).toBe('new');
  });

  it('a marked event with a duplicate id counts once; a tombstoned mark is forgotten', () => {
    resetIds();
    const a = mark('known', T(9), undefined, 'ev-1');
    const b = mark('learning', T(10), undefined, 'ev-2');
    expect(selfMarkOf([a, b, b, a])).toEqual({ mark: 'new', at: T(10) });
    const rows = foldEvents([a, b], { modelVersion: MODEL_VERSION, tombstones: [{ learnerId: L, scope: { kind: 'event', id: 'ev-2' } } as never] });
    expect(rows.find((r) => r.unitId === LEMMA)?.selfMark).toEqual({ mark: 'known', at: T(9) });
  });

  it('the live (incremental) projection equals a rebuild, selfMark included', async () => {
    resetIds();
    const store = new FakeStore();
    const engine = createProjectionEngine({ store, now: () => NOW });
    await store.append(L, [mark('learning', T(9), undefined, 'ev-1')]);
    await engine.project(L);
    await store.append(L, [mark('known', T(10), undefined, 'ev-2')]);
    const live = await engine.knowledge(L);
    expect(live.find((r) => r.unitId === LEMMA)?.selfMark).toEqual({ mark: 'known', at: T(10) });
    expect(live.find((r) => r.unitId === LEMMA)?.level).toBe('known');
    expect(await engine.rebuild(L)).toEqual(live);
  });
});

describe('projection@6 rebuilds what projection@2 stored', () => {
  it('MODEL_VERSION is projection@6, and a stored projection@2 cursor is rebuilt on the next read, adding the selfMark, the level and the encounters', async () => {
    resetIds();
    expect(MODEL_VERSION).toBe('projection@6');
    const store = new FakeStore();
    await store.append(L, [mark('known', T(9))]);
    const old = createProjectionEngine({ store, now: () => NOW, modelVersion: 'projection@2' });
    await old.project(L);
    expect(await store.getProjectionCursor(L)).toMatchObject({ modelVersion: 'projection@2' });
    const engine = createProjectionEngine({ store, now: () => NOW });
    const rows = await engine.knowledge(L);
    expect(rows.every((r) => r.modelVersion === 'projection@6')).toBe(true);
    expect(rows.find((r) => r.unitId === LEMMA)?.selfMark).toEqual({ mark: 'known', at: T(9) });
    expect(await store.getProjectionCursor(L)).toMatchObject({ modelVersion: 'projection@6' });
    expect(rows.find((r) => r.unitId === LEMMA)).toMatchObject({ level: 'known', encounters: 0 });
  });
});

describe('candidates read the learner\'s marks', () => {
  async function candidatesFor(events: GoEvent[]) {
    const store = new FakeStore();
    store.enrolments.push(enrolment());
    store.units.set(LEMMA, unit(LEMMA, 'lexeme'));
    await store.append(L, events);
    const engine = createProjectionEngine({ store, now: () => NOW });
    const list = await engine.candidates(L, E, { now: NOW });
    return { list, cand: list.find((c) => c.unitId === LEMMA) };
  }
  const lookups = (n: number, from = 6): GoEvent[] => Array.from({ length: n }, (_, i) => lookup([LEMMA], { at: T(from, i) }));

  it('baseline: a word looked up three times is a candidate', async () => {
    resetIds();
    const { cand } = await candidatesFor(lookups(3));
    expect(cand).toBeDefined();
    expect(cand!.reasons.map((r) => r.rule)).toContain('repeatedLookups');
  });

  it('"I recognise it" or "I can use it" (the level known) after the lookups: not drawn; a known unit waits for retention decay', async () => {
    resetIds();
    for (const m of ['known', 'productive']) {
      const { cand } = await candidatesFor([...lookups(3), mark(m, T(8), [LEMMA])]);
      expect(cand, m).toBeUndefined();
    }
  });

  // 2026-10-26, the owner's rule: a mark holds until the learner marks again. A lookup, a help request or a failed judgement after a Known
  // mark no longer brings the word back as a candidate (until then the mark was "contradicted" and the reason selfMarkContradicted said so).
  it('...and later evidence does not bring it back: a lookup, a failed card or a failed production after the mark leaves it Known, with no contradiction reason', async () => {
    resetIds();
    const marked = mark('known', T(8), [LEMMA]);
    const cases: Array<[string, GoEvent]> = [
      ['a later lookup', lookup([LEMMA], { at: T(9) })],
      ['a later failed recall card', card([LEMMA], 'recall', false, {}, { at: T(9) })],
      ['a later failed production', production([LEMMA], { usedCorrectly: false }, { at: T(9) })],
    ];
    for (const [name, later] of cases) {
      const { list, cand } = await candidatesFor([...lookups(3), marked, later]);
      expect(cand, name).toBeUndefined(); // a known unit waits for retention decay, whatever came after the mark
      expect(list.flatMap((c) => c.reasons).some((r) => r.rule === 'selfMarkContradicted'), name).toBe(false);
    }
    const { cand } = await candidatesFor([...lookups(3), mark('productive', T(8), [LEMMA]), lookup([LEMMA], { at: T(9) })]);
    expect(cand).toBeUndefined(); // "I can use it" = the level known: the same
    // the learner's own later mark is what changes it: marked Seen again, the word is drawn once more
    const again = await candidatesFor([...lookups(3), marked, lookup([LEMMA], { at: T(9) }), mark('seen', T(10), [LEMMA])]);
    expect(again.cand).toBeDefined();
  });

  it('evidence from BEFORE the mark does not contradict it, and a correct answer after it is no contradiction either', async () => {
    resetIds();
    const events = [...lookups(2), card([LEMMA], 'recall', false, {}, { at: T(7) }), mark('known', T(8), [LEMMA]), card([LEMMA], 'recall', true, {}, { at: T(9) })];
    expect((await candidatesFor(events)).cand).toBeUndefined();
  });

  it('"New to me" is a strong recognition candidate with the reason "you marked it as new to you", even with no lookup', async () => {
    resetIds();
    const { cand } = await candidatesFor([mark('learning', T(8), [LEMMA])]);
    expect(cand).toBeDefined();
    const why = cand!.reasons.find((r) => r.rule === 'selfMarkedNew')!;
    expect(why.weight).toBe(CANDIDATE_RULES.selfMark.learningWeight);
    expect(why.detail).toContain('you marked it as new to you');
    expect(cand!.targetDimension).toBe('readingRecognition');
    // and it outranks the same word that was merely looked up once
    const plain = (await candidatesFor([lookup([LEMMA], { at: T(8) })])).cand;
    expect(plain === undefined || cand!.score > plain.score).toBe(true);
  });

  it('only the LATEST mark counts: "known" then "New to me" proposes it; "New to me" then "known" does not', async () => {
    resetIds();
    expect((await candidatesFor([...lookups(2), mark('known', T(7), [LEMMA]), mark('learning', T(8), [LEMMA])])).cand!.reasons.map((r) => r.rule)).toContain('selfMarkedNew');
    expect((await candidatesFor([...lookups(2), mark('learning', T(7), [LEMMA]), mark('known', T(8), [LEMMA])])).cand).toBeUndefined();
  });

  it('a unit nobody marked behaves as before (no selfMark reasons)', async () => {
    resetIds();
    const { cand } = await candidatesFor(lookups(3));
    expect(cand!.reasons.map((r) => r.rule).filter((r) => r.startsWith('selfMark'))).toEqual([]);
  });
});
