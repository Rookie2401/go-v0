// @vitest-environment node
/** The named principles of the projection engine, one test each. */
import { describe, expect, it } from 'vitest';
import { DIMENSIONS } from '../../../packages/repository-contract/src';
import type { Dimension, GoEvent, UnitKnowledge } from '../../../packages/repository-contract/src';
import { createProjectionEngine, foldEvents, isPositiveTraceable, observationsOf } from '../../../packages/repository-engine/src';
import { FakeStore } from './fakeStore';
import { E, L, NOW, assist, card, encounter, ev, grammar, listening, lookup, play, production, randomEvent, resetIds, rng, shuffled, unit } from './helpers';

const FORM = 'form:sq:librin';
const INDEPENDENT: Dimension[] = ['readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding'];

async function project(events: GoEvent[], setup?: (s: FakeStore) => void) {
  const store = new FakeStore();
  setup?.(store);
  await store.append(L, events);
  const engine = createProjectionEngine({ store, now: () => NOW });
  await engine.project(L);
  return { store, engine, rows: await engine.knowledge(L) };
}
const row = (rows: UnitKnowledge[], id: string): UnitKnowledge => rows.find((r) => r.unitId === id)!;
const untouched = (r: UnitKnowledge, dims: Dimension[]): void => { for (const d of dims) { expect(r.dimensions[d].observations, d).toBe(0); expect(r.dimensions[d].confidence, d).toBe(0); expect(r.dimensions[d].score, d).toBe(0.5); } };

describe('invariant (a): a lookup or click is exposure, never understanding', () => {
  it('lookups, layers and assistance requests touch only the exposure dimension', async () => {
    resetIds();
    const { rows } = await project([lookup([FORM]), ev('AnalysisShown', [FORM], { layers: ['gloss'] }), assist([FORM]), assist([FORM], { assistance: 'translation' })]);
    const r = row(rows, FORM);
    expect(r.dimensions.exposure.observations).toBe(4);
    untouched(r, DIMENSIONS.filter((d) => d !== 'exposure'));
    expect(r.retention.basedOn).toBe('none');
    expect(r.uncertainty).toBe(1);
  });
});

describe('invariant (b): playing audio is exposure, never listening recognition', () => {
  it('pronunciation playback and a completed listening are exposure only', async () => {
    resetIds();
    const { rows, engine } = await project([play([FORM]), ev('ListeningCompleted', [FORM], { voice: 'recorded' })]);
    const r = row(rows, FORM);
    untouched(r, DIMENSIONS.filter((d) => d !== 'exposure'));
    expect(r.dimensions.exposure.observations).toBe(2);
    expect(await engine.counters(L, FORM)).toEqual({ encounters: 0, lookups: 0, assistance: 0, playbacks: 2 });
  });
});

describe('invariant (c): accepting a correction is not independent production', () => {
  it('correction responses, drafts and submitted sentences produce no observation', () => {
    resetIds();
    for (const kind of ['CorrectionAccepted', 'CorrectionRejected', 'DraftSaved', 'SentenceSubmitted', 'AnalysisCorrected', 'ReviewItemInvalidated', 'CardAdded', 'CardRemoved'] as const) {
      expect(observationsOf(ev(kind, [FORM], { draftId: 'd', formId: FORM, by: 'learner', reason: 'learner-removed' })), kind).toEqual([]);
    }
  });
  it('a production written with a correction or hint reaches assistedRecognition only', async () => {
    resetIds();
    const { rows } = await project([production([FORM], { usedCorrectly: true, assisted: true, assistance: ['correction'] })]);
    const r = row(rows, FORM);
    expect(r.dimensions.assistedRecognition.positive).toBeGreaterThan(0);
    untouched(r, INDEPENDENT);
  });
  it('an unassisted, judged-correct production does reach contextualProduction', async () => {
    resetIds();
    const { rows } = await project([production([FORM], { usedCorrectly: true })]);
    expect(row(rows, FORM).dimensions.contextualProduction.positive).toBeCloseTo(0.9);
  });
});

describe('invariant (d): assisted observations never feed the independent dimensions', () => {
  it('hinted reviews, assessments and listenings, help-assisted understood marks and evidence.assisted all go to assistedRecognition', async () => {
    resetIds();
    const events = [
      card([FORM], 'recognition', true, { hinted: true }),
      card([FORM], 'recall', true, { answerShownBefore: true }),
      listening([FORM], true, { hinted: true }),
      grammar([FORM, 'morph:sq:NOUN:X'], 'morph:sq:NOUN:X', true, { hinted: true }),
      ev('UnderstoodMarked', [FORM], { scope: 'sentence', helpUsed: true }),
      card([FORM], 'recognition', true, {}, { evidence: { quality: 'strong', assisted: true } }),
    ];
    const { rows } = await project(events);
    for (const id of [FORM, 'morph:sq:NOUN:X']) untouched(row(rows, id), INDEPENDENT);
    expect(row(rows, FORM).dimensions.assistedRecognition.observations).toBe(5);
    expect(row(rows, 'morph:sq:NOUN:X').dimensions.assistedRecognition.observations).toBe(1);
  });
  it('every produced observation flagged assisted lands on assistedRecognition or exposure', () => {
    const rand = rng(7);
    for (let i = 0; i < 300; i++) for (const o of observationsOf(randomEvent(rand, i))) if (o.assisted) expect(['assistedRecognition', 'exposure']).toContain(o.dimension);
  });
});

describe('invariant (e): declared evidence can lower a weight, never raise it', () => {
  const listen = (evidence?: GoEvent['evidence']) => observationsOf(listening([FORM], true, {}, evidence ? { evidence } : {}));
  it('quality scales the weight down by none/weak/moderate/strong = 0/0.5/0.8/1', () => {
    expect(listen()[0].weight).toBeCloseTo(0.8);
    expect(listen({ quality: 'strong' })[0].weight).toBeCloseTo(0.8);
    expect(listen({ quality: 'moderate' })[0].weight).toBeCloseTo(0.64);
    expect(listen({ quality: 'weak' })[0].weight).toBeCloseTo(0.4);
    expect(listen({ quality: 'none' })).toEqual([]);
  });
  it('a declared source reliability can lower but never lift the kind\'s own reliability', () => {
    const understood = (sr: number) => observationsOf(ev('UnderstoodMarked', [FORM], { scope: 'sentence', helpUsed: false }, { evidence: { quality: 'strong', sourceReliability: sr } }))[0];
    expect(understood(1).weight).toBeCloseTo(0.4 * 0.4); // self-report stays a self-report, whatever the producer claims
    expect(understood(1).sourceReliability).toBeCloseTo(0.4);
    expect(understood(0.2).weight).toBeCloseTo(0.4 * 0.2);
  });
  it('over a random battery no observation exceeds its kind\'s ceiling', () => {
    const rand = rng(11);
    for (let i = 0; i < 400; i++) for (const o of observationsOf(randomEvent(rand, i))) expect(o.weight).toBeLessThanOrEqual(0.9 + 1e-9);
    const plain = (k: number) => observationsOf(card([FORM], 'recall', true, {}, { id: `p${k}` }))[0].weight;
    const withEv = (q: 'weak' | 'strong') => observationsOf(card([FORM], 'recall', true, {}, { id: 'q', evidence: { quality: q, sourceReliability: 1 } }))[0].weight;
    expect(withEv('strong')).toBeLessThanOrEqual(plain(1));
    expect(withEv('weak')).toBeLessThan(plain(2));
  });
});

describe('invariant (f): no single known/unknown boolean, no single mastery number', () => {
  it('a row has exactly the seven dimensions and no aggregate field', async () => {
    resetIds();
    const { rows } = await project([card([FORM], 'recognition', true), listening([FORM], false), lookup([FORM])]);
    const r = row(rows, FORM);
    expect(Object.keys(r.dimensions)).toEqual([...DIMENSIONS]);
    for (const k of Object.keys(r)) expect(k).not.toMatch(/known|learned|mastery|mastered|level|score$/i);
    expect(JSON.stringify(r)).not.toMatch(/learned|mastered|\bknown\b/i);
  });
  it('the same unit can be strong in one dimension and weak in another', async () => {
    resetIds();
    const events = [card([FORM], 'recognition', true), card([FORM], 'recognition', true), listening([FORM], false), listening([FORM], false)];
    const r = row((await project(events)).rows, FORM);
    expect(r.dimensions.readingRecognition.score).toBeGreaterThan(0.6);
    expect(r.dimensions.listeningRecognition.score).toBeLessThan(0.4);
  });
});

describe('invariant (g): the fold is deterministic, order-independent and idempotent', () => {
  const thirty = (): GoEvent[] => { const rand = rng(2026); return Array.from({ length: 30 }, (_, i) => randomEvent(rand, i)); };

  it('property: the same 30 events in 20 seeded shuffles give identical stored rows', async () => {
    const events = thirty();
    const baseline = JSON.stringify(foldEvents(events, { modelVersion: 'projection@1' }));
    expect(JSON.parse(baseline).length).toBeGreaterThan(2);
    const rand = rng(99);
    for (let k = 0; k < 20; k++) {
      const store = new FakeStore();
      await store.append(L, shuffled(events, rand));
      const engine = createProjectionEngine({ store, now: () => NOW });
      await engine.project(L);
      const stored = (await store.getKnowledge(L)).sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
      expect(JSON.stringify(stored), `shuffle ${k}`).toBe(baseline);
    }
  });

  it('property: shuffled arrival split into three projected batches gives the same rows too', async () => {
    const events = thirty();
    const baseline = JSON.stringify(foldEvents(events, { modelVersion: 'projection@1' }));
    const rand = rng(5);
    for (let k = 0; k < 10; k++) {
      const order = shuffled(events, rand);
      const store = new FakeStore();
      const engine = createProjectionEngine({ store, now: () => NOW });
      for (const batch of [order.slice(0, 10), order.slice(10, 20), order.slice(20)]) { await store.append(L, batch); await engine.project(L); }
      const stored = (await store.getKnowledge(L)).sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
      expect(JSON.stringify(stored), `shuffle ${k}`).toBe(baseline);
    }
  });

  it('duplicates of an event (same id) change nothing, at the fold and through the store', async () => {
    const events = thirty();
    const once = JSON.stringify(foldEvents(events, { modelVersion: 'projection@1' }));
    expect(JSON.stringify(foldEvents([...events, ...events.slice(0, 12), ...events], { modelVersion: 'projection@1' }))).toBe(once);
    const store = new FakeStore();
    await store.append(L, events);
    const engine = createProjectionEngine({ store, now: () => NOW });
    await engine.project(L);
    const first = JSON.stringify(await store.getKnowledge(L));
    await store.append(L, events); // replayed: the store dedupes on id
    expect((await engine.project(L)).folded).toBe(0);
    expect(JSON.stringify(await store.getKnowledge(L))).toBe(first);
  });

  it('projecting twice is a no-op the second time', async () => {
    const { engine, store } = await project(thirty());
    const before = JSON.stringify(await store.getKnowledge(L));
    expect(await engine.project(L)).toMatchObject({ folded: 0 });
    expect(JSON.stringify(await store.getKnowledge(L))).toBe(before);
  });
});

describe('invariant (h): rebuild from the log equals the incrementally projected state', () => {
  it('three projected batches equal one rebuild, rows and cursor', async () => {
    const rand = rng(31);
    const events = Array.from({ length: 45 }, (_, i) => randomEvent(rand, i));
    const store = new FakeStore();
    const engine = createProjectionEngine({ store, now: () => NOW });
    for (const batch of [events.slice(0, 15), events.slice(15, 30), events.slice(30)]) { await store.append(L, batch); await engine.project(L); }
    const live = JSON.stringify(await engine.knowledge(L));
    const cursorBefore = await store.getProjectionCursor(L);
    const rebuilt = JSON.stringify(await engine.rebuild(L));
    expect(rebuilt).toBe(live);
    expect(await store.getProjectionCursor(L)).toEqual(cursorBefore);
  });
  it('a change of model version triggers a full rebuild instead of an incremental fold', async () => {
    resetIds();
    const store = new FakeStore();
    await store.append(L, [card([FORM], 'recognition', true)]);
    const v1 = createProjectionEngine({ store, now: () => NOW, modelVersion: 'projection@0-test' });
    await v1.project(L);
    expect((await store.getKnowledge(L))[0].modelVersion).toBe('projection@0-test');
    const v2 = createProjectionEngine({ store, now: () => NOW });
    expect((await v2.project(L)).folded).toBe(1);
    expect((await store.getKnowledge(L))[0].modelVersion).toBe('projection@1');
    expect(await store.getProjectionCursor(L)).toEqual({ seq: 1, modelVersion: 'projection@1' });
  });
});

describe('invariant (i): the engine never writes linguistic rows', () => {
  it('projecting, rebuilding, preferences, candidates and suitability write no unit, relation, analysis, alias or pack', async () => {
    resetIds();
    const rand = rng(3);
    const events = Array.from({ length: 40 }, (_, i) => randomEvent(rand, i));
    const store = new FakeStore();
    for (const id of ['form:sq:a', 'form:sq:b']) store.units.set(id, unit(id, 'form'));
    store.units.set('morph:sq:NOUN:X', unit('morph:sq:NOUN:X', 'morph-construction'));
    store.enrolments.push({ enrolmentId: E, learnerId: L, languageId: 'sq', packId: 'p', packVersion: '1', goals: [{ kind: 'reading' }], startedAt: NOW });
    await store.append(L, events);
    const snapshot = JSON.stringify([...store.units], (_k, v) => v);
    store.lingWrites = 0;
    const engine = createProjectionEngine({ store, now: () => NOW });
    await engine.project(L);
    await engine.rebuild(L);
    await engine.preferences(L, 'sq');
    await engine.candidates(L, E);
    await engine.suitability(L, 'sq', { unitIds: ['form:sq:a', 'form:sq:b'], tokenCount: 4, constructionIds: ['morph:sq:NOUN:X'] });
    expect(store.lingWrites).toBe(0);
    expect(JSON.stringify([...store.units])).toBe(snapshot);
    expect(store.relations).toEqual([]);
    expect(store.aliases).toEqual([]);
  });
});

describe('invariant (j): a projection never invents a success', () => {
  it('every positive observation traces to a payload that says correct / usedCorrectly / understood / known', () => {
    const rand = rng(1234);
    let positives = 0;
    for (let i = 0; i < 1500; i++) {
      const e = randomEvent(rand, i);
      for (const o of observationsOf(e)) {
        if (o.outcome !== 'positive') continue;
        positives++;
        expect(isPositiveTraceable(e, o), JSON.stringify(e)).toBe(true);
      }
    }
    expect(positives).toBeGreaterThan(300);
  });
  it('wrong, unjudged, unknown-state and bookkeeping events never produce a positive', () => {
    resetIds();
    const none = [
      card([FORM], 'recognition', false), card([FORM], 'recall', false, { grade: 'easy' }), listening([FORM], false), grammar([FORM], 'morph:sq:NOUN:X', false),
      production([FORM], { usedCorrectly: false }), production([FORM], { usedCorrectly: 'unjudged' }), ev('ItemMarked', [FORM], { mark: 'learning' }), ev('ItemMarked', [FORM], { mark: 'saved' }),
      lookup([FORM]), play([FORM]), encounter([FORM]), ev('CorrectionAccepted', [FORM], {}),
    ];
    for (const e of none) expect(observationsOf(e).filter((o) => o.outcome === 'positive'), e.kind).toEqual([]);
  });
  it('a correct:true payload with a contradicting grade still counts as the payload says (correct decides, grade only modulates)', () => {
    const [o] = observationsOf(card([FORM], 'recognition', true, { grade: 'hard' }));
    expect(o.outcome).toBe('positive');
    expect(o.weight).toBeCloseTo(0.7 * 0.6);
  });
});
