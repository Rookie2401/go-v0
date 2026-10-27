// @vitest-environment node
/**
 * projection@4: the six knowledge levels (new, seen, recognized, familiar, known, automatic), `levelOf`, the mark/contradiction rules,
 * `encounters`, the legacy-mark mapping, the rebuild from immutable events, and the candidates drawn BY LEVEL (review as a progression).
 */
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_LEVELS, LEGACY_MARK_LEVEL, levelOfMark } from '../../../packages/repository-contract/src';
import type { Dimension, DimensionEstimate, GoEvent, KnowledgeLevel, UnitKnowledge } from '../../../packages/repository-contract/src';
import {
  CANDIDATE_RULES, LEVEL_THRESHOLDS, MODEL_VERSION, RULES, createProjectionEngine, emptyRow, evidenceLevelOf, foldEvents, levelOf, markStatus, observationsOf,
} from '../../../packages/repository-engine/src';
import { FakeStore } from './fakeStore';
import { E, L, NOW, assist, card, encounter, enrolment, ev, listening, lookup, play, production, resetIds, unit } from './helpers';

const U = 'lemma:sq:shtepi:NOUN';
const T = (h: number, m = 0, day = 6, month = 10): string => `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const mark = (m: string, at: string, ids: string[] = [U], id?: string): GoEvent => ev('ItemMarked', ids, { mark: m }, { at, ...(id ? { id } : {}) });
const rowOf = (events: GoEvent[], unitId = U): UnitKnowledge => foldEvents(events, { modelVersion: MODEL_VERSION }).find((r) => r.unitId === unitId)!;
const levelFrom = (events: GoEvent[]): KnowledgeLevel => rowOf(events).level;

/** Dimension estimates with the given overrides, for the pure rules. */
const dims = (over: Partial<Record<Dimension, Partial<DimensionEstimate>>>): UnitKnowledge['dimensions'] => {
  const d = emptyRow(L, 'u', 'sq', 't').dimensions;
  for (const [k, v] of Object.entries(over)) d[k as Dimension] = { ...d[k as Dimension], ...v };
  return d;
};

describe('levelOf: the thresholds, on the dimension estimates', () => {
  it('new: nothing observed, nothing marked', () => {
    expect(levelOf({ dimensions: dims({}) })).toBe('new');
  });

  it('seen: only exposures / lookups / help requests / failed attempts were observed', () => {
    expect(levelOf({ dimensions: dims({ exposure: { observations: 2, positive: 2 } }) })).toBe('seen');
    expect(levelOf({ dimensions: dims({ exposure: { observations: 1, negative: 1 } }) })).toBe('seen');
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 2, positive: 0, negative: 1, score: 0.2 } }) })).toBe('seen');
  });

  it('recognized: a positive assistedRecognition, or one recognition below the familiar score', () => {
    expect(levelOf({ dimensions: dims({ assistedRecognition: { observations: 1, positive: 0.3, score: 0.6 } }) })).toBe('recognized');
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 1, positive: 0.1, score: 0.55 } }) })).toBe('recognized');
    // two observations but a score under 0.6: still only recognized
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 2, positive: 0.5, negative: 0.5, score: 0.5 } }) })).toBe('recognized');
    // a negative-only assisted attempt is not recognition
    expect(levelOf({ dimensions: dims({ assistedRecognition: { observations: 1, negative: 0.15, score: 0.3 } }) })).toBe('seen');
  });

  it('familiar: score >= 0.6 over >= 2 observations (one observation is never enough)', () => {
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 2, positive: 1, score: 0.6 } }) })).toBe('familiar');
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 2, positive: 1, score: 0.59 } }) })).toBe('recognized');
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 1, positive: 2, score: 0.9 } }) })).toBe('recognized');
    expect(LEVEL_THRESHOLDS.familiar).toEqual({ score: 0.6, observations: 2 });
  });

  it('known: score >= 0.8 over >= 4 observations, and listening recognition counts too', () => {
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 4, positive: 2, score: 0.8 } }) })).toBe('known');
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 3, positive: 2, score: 0.9 } }) })).toBe('familiar');
    expect(levelOf({ dimensions: dims({ readingRecognition: { observations: 4, positive: 2, score: 0.79 } }) })).toBe('familiar');
    expect(levelOf({ dimensions: dims({ listeningRecognition: { observations: 4, positive: 2, score: 0.85 } }) })).toBe('known');
    expect(LEVEL_THRESHOLDS.known).toEqual({ score: 0.8, observations: 4 });
  });

  it('production successes alone do not establish automatic knowledge', () => {
    expect(levelOf({ dimensions: dims({ productiveRetrieval: { observations: 2, positive: 1, score: 0.7 } }) })).toBe('recognized');
    expect(levelOf({ dimensions: dims({ contextualProduction: { observations: 2, positive: 1, score: 0.75 } }) })).toBe('recognized');
    expect(levelOf({ dimensions: dims({ productiveRetrieval: { observations: 1, positive: 1, score: 0.9 } }) })).toBe('recognized');
    expect(levelOf({ dimensions: dims({ productiveRetrieval: { observations: 2, positive: 1, score: 0.69 } }) })).toBe('recognized');
    expect(LEVEL_THRESHOLDS).not.toHaveProperty('automatic');
  });

  it('a phrase or a construction is understood as a whole: phraseComprehension and grammaticalUnderstanding count as recognition', () => {
    expect(levelOf({ dimensions: dims({ phraseComprehension: { observations: 4, positive: 3, score: 0.85 } }) })).toBe('known');
    expect(levelOf({ dimensions: dims({ grammaticalUnderstanding: { observations: 2, positive: 1, score: 0.7 } }) })).toBe('familiar');
  });

  it('the highest level any dimension reaches counts', () => {
    expect(evidenceLevelOf(dims({ readingRecognition: { observations: 2, positive: 1, score: 0.7 }, productiveRetrieval: { observations: 3, positive: 2, score: 0.8 } }))).toBe('familiar');
  });
});

describe('levels from real events (the fold)', () => {
  it('one lookup is seen; an encounter alone is seen; nothing is new', () => {
    resetIds();
    expect(levelFrom([lookup([U])])).toBe('seen');
    expect(levelFrom([encounter([U])])).toBe('seen');
    expect(foldEvents([], { modelVersion: MODEL_VERSION })).toEqual([]);
  });

  it('a correct hinted card (understood with help) is recognized; a single correct recognition card is recognized', () => {
    resetIds();
    expect(levelFrom([card([U], 'recognition', true, { hinted: true })])).toBe('recognized');
    expect(levelFrom([card([U], 'recognition', true)])).toBe('recognized');
  });

  it('two correct recognition cards are familiar, four are known', () => {
    resetIds();
    const cards = (n: number): GoEvent[] => Array.from({ length: n }, (_, i) => card([U], 'recognition', true, {}, { at: T(8, i) }));
    expect(levelFrom(cards(2))).toBe('familiar');
    expect(levelFrom(cards(3))).toBe('familiar');
    expect(levelFrom(cards(4))).toBe('known');
  });

  it('four correct recorded-voice listening answers are known (listening counts)', () => {
    resetIds();
    expect(levelFrom(Array.from({ length: 4 }, (_, i) => listening([U], true, {}, { at: T(8, i) })))).toBe('known');
  });

  it('correct recall cards do not alone reach automatic; failures lower the evidence estimate', () => {
    resetIds();
    const recall = (ok: boolean, m: number): GoEvent => card([U], 'recall', ok, {}, { at: T(8, m) });
    expect(levelFrom([recall(true, 0), recall(true, 1)])).toBe('recognized');
    expect(levelFrom([recall(true, 0)])).toBe('recognized');
    expect(levelFrom([recall(true, 0), recall(false, 1)])).not.toBe('automatic');
  });

  it('failed recognitions after reaching familiar drop the unit back (the level follows the estimate); with no success at all it is only seen', () => {
    resetIds();
    const good = [card([U], 'recognition', true, {}, { at: T(8, 0) }), card([U], 'recognition', true, {}, { at: T(8, 1) })];
    const bad = [card([U], 'recognition', false, {}, { at: T(8, 2) }), card([U], 'recognition', false, {}, { at: T(8, 3) })];
    expect(levelFrom(good)).toBe('familiar');
    expect(levelFrom([...good, ...bad])).toBe('recognized'); // recognised before, but no longer reliably
    expect(levelFrom(bad)).toBe('seen');
  });
});

describe('legacy marks keep their meaning', () => {
  it('LEGACY_MARK_LEVEL and levelOfMark: learning = new, productive = known; the level words are themselves', () => {
    expect(LEGACY_MARK_LEVEL).toEqual({ learning: 'new', known: 'recognized', productive: 'known' });
    expect(levelOfMark('learning')).toBe('new');
    expect(levelOfMark('productive')).toBe('known');
    for (const l of KNOWLEDGE_LEVELS) expect(levelOfMark(l)).toBe(l);
  });

  it('the evidence of every legacy mark is exactly what it was in projection@3', () => {
    resetIds();
    const w = (m: string): { dimension: string; outcome: string; weight: number } => {
      const o = observationsOf(mark(m, T(9)))[0];
      return { dimension: o.dimension, outcome: o.outcome, weight: o.weight };
    };
    expect(w('known')).toEqual({ dimension: 'readingRecognition', outcome: 'positive', weight: 0.06 });
    expect(w('learning')).toEqual({ dimension: 'readingRecognition', outcome: 'negative', weight: 0.06 });
    expect(w('productive')).toEqual({ dimension: 'productiveRetrieval', outcome: 'positive', weight: 0.09 });
    expect(RULES.itemMark.weight).toBe(0.2);
  });

  it('the new level marks carry evidence by what they claim: help requests, weak recognition, weak production', () => {
    resetIds();
    const kind = (m: string): string => { const o = observationsOf(mark(m, T(9)))[0]; return `${o.dimension}:${o.outcome}`; };
    expect(kind('new')).toBe('readingRecognition:negative');
    expect(kind('seen')).toBe('readingRecognition:negative');
    expect(kind('recognized')).toBe('readingRecognition:positive');
    expect(kind('familiar')).toBe('readingRecognition:positive');
    expect(kind('known')).toBe('readingRecognition:positive');
    expect(kind('automatic')).toBe('productiveRetrieval:positive');
    expect(observationsOf(mark('saved', T(9)))).toEqual([]);
    expect(observationsOf(mark('ignore', T(9)))).toEqual([]);
  });

  it('a stored legacy mark reads as its level: learning -> new, productive -> known', () => {
    resetIds();
    expect(rowOf([lookup([U], { at: T(7) }), mark('learning', T(8))])).toMatchObject({ level: 'new', selfMark: { mark: 'new' } });
    expect(rowOf([lookup([U], { at: T(7) }), mark('productive', T(8))])).toMatchObject({ level: 'known', selfMark: { mark: 'known' } });
  });
});

describe('the learner\'s newest mark decides the level, until later evidence contradicts it', () => {
  it('a mark decides outright: every level word, with evidence that would say otherwise', () => {
    resetIds();
    for (const m of KNOWLEDGE_LEVELS) expect(levelFrom([lookup([U], { at: T(7) }), mark(m, T(8))]), m).toBe(m);
  });

  it('the latest mark wins, so a word can be marked back down', () => {
    resetIds();
    expect(levelFrom([mark('automatic', T(8)), mark('seen', T(9))])).toBe('seen');
  });

  it('evidence from BEFORE the mark never contradicts it; a plain re-encounter and a correct answer after it do not either', () => {
    resetIds();
    expect(levelFrom([lookup([U], { at: T(6) }), lookup([U], { at: T(7) }), mark('known', T(8))])).toBe('known');
    expect(levelFrom([mark('known', T(8)), encounter([U], { at: T(9) })])).toBe('known');
    expect(levelFrom([mark('automatic', T(8)), card([U], 'recall', true, {}, { at: T(9) })])).toBe('automatic');
  });

  // 2026-10-26, the owner's rule: after the first automatic step from New to Seen, only the learner changes a word's state. A mark other
  // than New holds whatever comes after it (until 2026-10-26 evidence two levels against it "contradicted" it, so opening the card of a word
  // marked Known read it back down to Seen).
  it('a lookup, an assistance request or a failed judgement AFTER a mark leaves the mark in force: the level stays what the learner said', () => {
    resetIds();
    for (const later of [lookup([U], { at: T(9) }), assist([U], { assistance: 'gloss' }, { at: T(9) }), card([U], 'recall', false, {}, { at: T(9) })]) {
      const row = rowOf([mark('known', T(8)), later]);
      expect(row.selfMark?.mark).toBe('known'); // the mark is still the learner's latest
      expect(row.level).toBe('known');
      expect(markStatus(row, undefined).status).toBe('in-force');
    }
    expect(levelFrom([mark('automatic', T(8)), lookup([U], { at: T(9) })])).toBe('automatic');
    expect(levelFrom([mark('familiar', T(8)), lookup([U], { at: T(9) }), lookup([U], { at: T(9, 1) }), lookup([U], { at: T(9, 2) })])).toBe('familiar');
  });

  it('a mark is changed only by a later mark: the newest one decides, up or down', () => {
    resetIds();
    expect(levelFrom([mark('recognized', T(8)), lookup([U], { at: T(9) })])).toBe('recognized');
    expect(levelFrom([mark('known', T(8)), lookup([U], { at: T(9) }), mark('seen', T(10))])).toBe('seen');
    expect(levelFrom([mark('seen', T(8)), mark('known', T(10)), lookup([U], { at: T(11) })])).toBe('known');
    // correct answers after a Seen mark do not raise it either: the learner raises it
    expect(levelFrom([mark('seen', T(8)), card([U], 'recognition', true, {}, { at: T(9, 0) }), card([U], 'recognition', true, {}, { at: T(9, 1) }), card([U], 'recognition', true, {}, { at: T(9, 2) })])).toBe('seen');
    expect(LEVEL_THRESHOLDS.contradictionGap).toBe(2); // kept for the candidate rules' reason text; no longer decides a level
  });

  it('the other way: evidence two or more levels ABOVE the mark, dated after it, releases it (a word marked new, then recognised reliably)', () => {
    resetIds();
    const later = [card([U], 'recognition', true, {}, { at: T(9, 0) }), card([U], 'recognition', true, {}, { at: T(9, 1) })];
    expect(levelFrom([mark('new', T(8)), ...later])).toBe('familiar');
    // a mark of new is released by a first recognition (two levels up); a mark of seen needs more (one level up is not enough)
    expect(levelFrom([mark('new', T(8)), card([U], 'recognition', true, {}, { at: T(9, 0) })])).toBe('recognized');
    expect(levelFrom([mark('seen', T(8)), card([U], 'recognition', true, {}, { at: T(9, 0) })])).toBe('seen');
    // evidence from before the mark does not release it
    expect(levelFrom([...later.map((e, i) => ({ ...e, at: T(7, i) })), mark('new', T(8))])).toBe('new');
  });

  it('a mark of NEW is released by ANY later observation: a lookup after it makes the word seen (the click that meets a new word)', () => {
    resetIds();
    expect(levelFrom([mark('new', T(8))])).toBe('new');
    expect(levelFrom([mark('new', T(8)), lookup([U], { at: T(9) })])).toBe('seen');
    expect(rowOf([mark('new', T(8)), lookup([U], { at: T(9) })])).toMatchObject({ level: 'seen', selfMark: { mark: 'new' } });
    // an exposure or a help request after the mark does the same
    expect(levelFrom([mark('new', T(8)), encounter([U], { at: T(9) })])).toBe('seen');
    expect(levelFrom([mark('new', T(8)), assist([U], { assistance: 'gloss' }, { at: T(9) })])).toBe('seen');
    // a lookup BEFORE the mark does not release it: the learner said new after meeting it
    expect(levelFrom([lookup([U], { at: T(7) }), mark('new', T(8))])).toBe('new');
    // the level is max(seen, evidence): a recognition after the mark still wins
    expect(levelFrom([mark('new', T(8)), lookup([U], { at: T(9) }), card([U], 'recognition', true, {}, { at: T(9, 1) })])).toBe('recognized');
    // a mark of any other level keeps the two-level rule: one lookup does not touch a mark of seen, nor a mark of recognized
    expect(levelFrom([mark('seen', T(8)), lookup([U], { at: T(9) })])).toBe('seen');
    expect(levelFrom([mark('recognized', T(8)), lookup([U], { at: T(9) })])).toBe('recognized');
    // marking new AGAIN after the lookup puts it back to new until the next meeting
    expect(levelFrom([lookup([U], { at: T(7) }), mark('new', T(8)), lookup([U], { at: T(9) }), mark('new', T(10))])).toBe('new');
    // the pure rule (a stored row, no `since`): dimensions touched after the mark stand in for the evidence since
    const touched = dims({ exposure: { observations: 1, positive: 1, lastAt: T(9) } });
    expect(markStatus({ dimensions: touched, selfMark: { mark: 'new', at: T(8) } }).status).toBe('released');
    expect(levelOf({ dimensions: touched, selfMark: { mark: 'new', at: T(8) } })).toBe('seen');
    expect(levelOf({ dimensions: touched, selfMark: { mark: 'new', at: T(10) } })).toBe('new');
  });
});

describe('encounters: distinct encounter events', () => {
  it('counts lookups, exposures, assistance requests and recognitions once per event id', () => {
    resetIds();
    const events = [lookup([U], { id: 'a' }), encounter([U], { id: 'b' }), assist([U], { assistance: 'gloss' }, { id: 'c' }), card([U], 'recognition', true, {}, { id: 'd' })];
    expect(rowOf(events).encounters).toBe(4);
    expect(rowOf([...events, ...events]).encounters).toBe(4); // replayed: the same event ids
  });

  it('an event that touches a unit through two dimensions is one encounter; one event naming two units is one encounter of each', () => {
    resetIds();
    const hinted = card([U, 'lemma:sq:ujk:NOUN'], 'recognition', true, { hinted: true }, { id: 'h' });
    expect(rowOf([hinted]).encounters).toBe(1);
    expect(rowOf([hinted], 'lemma:sq:ujk:NOUN').encounters).toBe(1);
  });

  it('playing its audio, producing it and marking it are not encounters', () => {
    resetIds();
    expect(rowOf([play([U]), production([U], { mode: 'retrieval' }), mark('known', T(9))]).encounters).toBe(0);
  });
});

describe('the projection (live and rebuilt) carries level and encounters', () => {
  it('live == rebuild, level and encounters included, in batches', async () => {
    resetIds();
    const store = new FakeStore();
    const engine = createProjectionEngine({ store, now: () => NOW });
    await store.append(L, [lookup([U], { at: T(7) }), card([U], 'recognition', true, {}, { at: T(8) })]);
    await engine.project(L);
    await store.append(L, [mark('known', T(9)), lookup([U], { at: T(10) })]);
    const live = await engine.knowledge(L);
    expect(live[0]).toMatchObject({ unitId: U, encounters: 3 });
    expect(await engine.rebuild(L)).toEqual(live);
  });

  it('a store at projection@3 (rows without level / encounters, a legacy selfMark) is rebuilt from the immutable events: same dimensions, new fields', async () => {
    resetIds();
    const events = [lookup([U], { at: T(7) }), card([U], 'recognition', true, {}, { at: T(8) }), mark('learning', T(9)), card([U], 'recognition', true, {}, { at: T(10, 0) }), card([U], 'recognition', true, {}, { at: T(10, 1) })];
    const store = new FakeStore();
    await store.append(L, events);
    // what projection@3 stored: the same dimensions, no level, no encounters, the legacy mark word
    const before = foldEvents(events, { modelVersion: 'projection@3' }).map((r) => {
      const { level: _l, encounters: _e, ...old } = r;
      return { ...old, ...(old.selfMark ? { selfMark: { mark: 'learning', at: old.selfMark.at } } : {}) };
    });
    await store.putKnowledge(before as unknown as UnitKnowledge[]);
    await store.putProjectionCursor(L, { seq: await store.head(L), modelVersion: 'projection@3' });
    const eventsBefore = JSON.stringify(await store.list({ learnerId: L, limit: 100 }));

    const engine = createProjectionEngine({ store, now: () => NOW });
    const rows = await engine.knowledge(L);
    expect(rows[0].modelVersion).toBe('projection@5');
    expect(rows[0].dimensions).toEqual(before[0].dimensions); // every number the old projection stored, unchanged
    expect(rows[0]).toMatchObject({ level: 'familiar', encounters: 4, selfMark: { mark: 'new', at: T(9) } }); // new -> released by two reliable recognitions after it
    expect(await store.getProjectionCursor(L)).toMatchObject({ modelVersion: 'projection@5' });
    expect(JSON.stringify(await store.list({ learnerId: L, limit: 100 }))).toBe(eventsBefore); // nothing stored was rewritten
  });

  it('migrates a stored projection@4 automatic inference without inventing a mark or event, and releases it after later independent failure', async () => {
    resetIds();
    const history = [card([U], 'recall', true, {}, { at: T(8, 0, 8) }), card([U], 'recall', true, {}, { at: T(8, 1, 8) })];
    const store = new FakeStore();
    await store.append(L, history);
    const prior = foldEvents(history, { modelVersion: 'projection@4' })[0];
    await store.putKnowledge([{ ...prior, level: 'automatic', modelVersion: 'projection@4' }]);
    await store.putProjectionCursor(L, { seq: await store.head(L), modelVersion: 'projection@4' });
    const beforeEvents = JSON.stringify(await store.list({ learnerId: L, limit: 100 }));
    const engine = createProjectionEngine({ store, now: () => '2026-10-10T09:00:00.000Z' });

    const migrated = (await engine.knowledge(L))[0];
    expect(migrated).toMatchObject({ level: 'automatic', legacyKnowability: { level: 'automatic', modelVersion: 'projection@4', migratedAt: '2026-10-10T09:00:00.000Z', basis: 'legacy-production-inference' } });
    expect(migrated.selfMark).toBeUndefined();
    expect(JSON.stringify(await store.list({ learnerId: L, limit: 100 }))).toBe(beforeEvents);

    await store.append(L, [card([U], 'recall', false, {}, { at: '2026-10-10T10:00:00.000Z' })]);
    const afterFailure = (await engine.knowledge(L))[0];
    expect(afterFailure.level).not.toBe('automatic');
    expect(afterFailure.legacyKnowability).toBeUndefined();
  });
});

describe('candidates are drawn by level: review is a progression, not a request', () => {
  async function run(events: GoEvent[], setup?: (s: FakeStore) => void) {
    const store = new FakeStore();
    store.enrolments.push(enrolment());
    store.units.set(U, unit(U, 'lexeme'));
    setup?.(store);
    await store.append(L, events);
    const engine = createProjectionEngine({ store, now: () => NOW });
    const list = await engine.candidates(L, E, { now: NOW });
    const rows = await engine.knowledge(L);
    return { list, cand: list.find((c) => c.unitId === U), row: rows.find((r) => r.unitId === U)! };
  }
  // `day` 7 = yesterday (October); `day` 1 = in September, five weeks before NOW and far past the half-life of this little evidence.
  const monthOf = (day: number): number => (day === 1 ? 9 : 10);
  const recognitionCards = (n: number, day: number): GoEvent[] => Array.from({ length: n }, (_, i) => card([U], 'recognition', true, {}, { at: T(8, i, day, monthOf(day)) }));
  const recallCards = (n: number, day: number): GoEvent[] => Array.from({ length: n }, (_, i) => card([U], 'recall', true, {}, { at: T(8, i, day, monthOf(day)) }));

  it('seen: a looked-up unit is proposed for recognition practice, and the reason names the level', async () => {
    resetIds();
    const { cand, row } = await run([lookup([U], { at: T(8, 0, 7) }), lookup([U], { at: T(8, 1, 7) })]);
    expect(row.level).toBe('seen');
    expect(cand!.targetDimension).toBe('readingRecognition');
    const why = cand!.reasons.find((r) => r.rule === 'knowledgeLevel')!;
    expect(why.weight).toBe(0);
    expect(why.detail).toContain('Seen (2 encounters)');
    expect(why.detail).toContain('recognition practice');
  });

  it('new: a unit marked new is proposed with no lookup at all, nothing asked of a card', async () => {
    resetIds();
    const { cand, row } = await run([mark('new', T(8, 0, 7))]);
    expect(row.level).toBe('new');
    expect(cand!.reasons.map((r) => r.rule)).toEqual(expect.arrayContaining(['selfMarkedNew', 'knowledgeLevel']));
    expect(cand!.reasons.find((r) => r.rule === 'knowledgeLevel')!.detail).toContain('New');
  });

  it('recognized / familiar: proposed for reading recognition when the learner struggled again, not otherwise', async () => {
    resetIds();
    const calm = await run(recognitionCards(2, 7));
    expect(calm.row.level).toBe('familiar');
    expect(calm.cand).toBeUndefined(); // exposure and success alone are no reason, and retention has not decayed
    const lookedUp = await run([...recognitionCards(2, 7), lookup([U], { at: T(9, 0, 7) }), lookup([U], { at: T(9, 1, 7) })]);
    expect(lookedUp.cand).toBeDefined();
    expect(lookedUp.cand!.targetDimension).toBe('readingRecognition');
    expect(lookedUp.cand!.reasons.find((r) => r.rule === 'knowledgeLevel')!.detail).toMatch(/^(Recognized|Familiar|Seen)/);
  });

  it('known: not proposed while fresh; proposed for RETRIEVAL once its retention has decayed', async () => {
    resetIds();
    const fresh = await run(recognitionCards(4, 7));
    expect(fresh.row.level).toBe('known');
    expect(fresh.cand).toBeUndefined();
    const old = await run(recognitionCards(4, 1)); // 37 days before NOW: far past one half-life
    expect(old.row.level).toBe('known');
    expect(old.cand).toBeDefined();
    expect(old.cand!.targetDimension).toBe('productiveRetrieval');
    expect(old.cand!.reasons.map((r) => r.rule)).toEqual(expect.arrayContaining(['retentionDecayed', 'knowledgeLevel']));
    expect(old.cand!.reasons.find((r) => r.rule === 'retentionDecayed')!.weight).toBe(CANDIDATE_RULES.level.decayedWeight);
    expect(old.cand!.reasons.find((r) => r.rule === 'knowledgeLevel')!.detail).toContain('Known');
  });

  it('known with an analysis that cannot support production: recognition is asked instead, and it says so', async () => {
    resetIds();
    const old = await run(recognitionCards(4, 1), (s) => s.units.set(U, unit(U, 'lexeme', 'provisional')));
    expect(old.cand).toBeDefined();
    expect(old.cand!.targetDimension).toBe('readingRecognition');
    expect(old.cand!.reasons.map((r) => r.rule)).toContain('levelTarget');
  });

  it('production reviews do not create automatic; an explicit automatic mark holds through a later lookup (2026-10-26: only the learner changes it)', async () => {
    resetIds();
    const fresh = await run(recallCards(2, 7));
    expect(fresh.row.level).toBe('recognized');
    expect(fresh.cand).toBeUndefined();
    const old = await run(recallCards(2, 1));
    expect(old.row.level).toBe('recognized');
    expect(old.cand).toBeUndefined();
    const marked = await run([mark('automatic', T(8, 0, 7)), lookup([U], { at: T(9, 0, 7) })]);
    expect(marked.row.level).toBe('automatic');
    expect(marked.cand?.reasons.some((r) => r.rule === 'selfMarkContradicted') ?? false).toBe(false);
  });

  it('a unit marked known and left alone is not proposed (the claim stands until evidence or decay says otherwise)', async () => {
    resetIds();
    expect((await run([lookup([U], { at: T(7, 0, 7) }), lookup([U], { at: T(7, 1, 7) }), mark('known', T(8, 0, 7))])).cand).toBeUndefined();
  });
});
