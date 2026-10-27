// @vitest-environment node
/**
 * projection@2: the eighth dimension (phraseComprehension), language-basis weighting of exposure, and the rebuild when a
 * store still holds projection@1 cursors and rows.
 */
import { describe, expect, it } from 'vitest';
import { DIMENSIONS } from '../../../packages/repository-contract/src';
import type { Dimension, GoEvent, UnitKnowledge } from '../../../packages/repository-contract/src';
import { LANGUAGE_BASIS_FACTOR, MODEL_VERSION, RULES, createProjectionEngine, foldEvents, isPositiveTraceable, observationsOf, retentionAt } from '../../../packages/repository-engine/src';
import { FakeStore } from './fakeStore';
import { L, NOW, assist, card, encounter, ev, grammar, lookup, production, resetIds } from './helpers';

const PH = 'phrase:sq:ju_lutem';
const WORD = 'form:sq:librin';
const OLD_SEVEN = DIMENSIONS.filter((d) => d !== 'phraseComprehension');

async function projected(events: GoEvent[]) {
  const store = new FakeStore();
  await store.append(L, events);
  const engine = createProjectionEngine({ store, now: () => NOW });
  await engine.project(L);
  return { store, engine, rows: await engine.knowledge(L) };
}
const rowOf = (rows: UnitKnowledge[], id: string): UnitKnowledge => rows.find((r) => r.unitId === id)!;
const dimsOf = (events: GoEvent[], unitId = PH) => observationsOf(events[0]).filter((o) => o.unitId === unitId).map((o) => `${o.dimension}:${o.outcome}`).sort();

describe('projection@2: the model version and the eighth dimension', () => {
  it('is projection@2 and DIMENSIONS has eight entries with the original seven first, in their old order', () => {
    expect(MODEL_VERSION).toBe('projection@6');
    expect(DIMENSIONS).toHaveLength(8);
    expect(DIMENSIONS[7]).toBe('phraseComprehension');
    expect(DIMENSIONS.slice(0, 7)).toEqual(['exposure', 'assistedRecognition', 'readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding']);
  });

  it('a store with projection@1 cursors and rows is rebuilt on the next read; the seven old dimensions are unchanged, only the new key is added', async () => {
    resetIds();
    const events = [
      encounter([WORD]), lookup([WORD]), assist([WORD]),
      card([WORD], 'recognition', true), card([WORD], 'recall', false),
      grammar(['morph:sq:NOUN:X'], 'morph:sq:NOUN:X', false),
      production([WORD], { usedCorrectly: true }),
    ];
    // the state an old engine left behind: rows with seven dimensions, stamped projection@1, and a cursor at that version
    const old = foldEvents(events, { modelVersion: 'projection@1' }).map((r) => {
      const dimensions = { ...r.dimensions } as Partial<Record<Dimension, unknown>>;
      delete dimensions.phraseComprehension;
      return { ...r, dimensions } as unknown as UnitKnowledge;
    });
    const store = new FakeStore();
    await store.append(L, events);
    await store.putKnowledge(old);
    await store.putProjectionCursor(L, { seq: await store.head(L), modelVersion: 'projection@1' });
    for (const r of await store.getKnowledge(L)) expect(Object.keys(r.dimensions)).toHaveLength(7);

    const engine = createProjectionEngine({ store, now: () => NOW });
    const rows = await engine.knowledge(L); // nothing new in the log, yet the version differs: a full rebuild
    expect(await store.getProjectionCursor(L)).toEqual({ seq: await store.head(L), modelVersion: 'projection@6' });
    expect(rows.length).toBe(old.length);
    for (const r of rows) {
      const before = old.find((o) => o.unitId === r.unitId)!;
      expect(r.modelVersion).toBe('projection@6');
      expect(Object.keys(r.dimensions)).toEqual([...DIMENSIONS]);
      for (const d of OLD_SEVEN) expect(r.dimensions[d], `${r.unitId} ${d}`).toEqual(before.dimensions[d]);
      expect(r.dimensions.phraseComprehension).toMatchObject({ observations: 0, confidence: 0, score: 0.5 });
      // every other field of the row is the same too, apart from the version stamp and the added key
      expect({ ...r, dimensions: undefined, modelVersion: undefined }).toEqual({ ...retentionAt(before, NOW), dimensions: undefined, modelVersion: undefined }); // reads return the retention decayed to the clock
    }
  });
});

describe('phraseComprehension rules', () => {
  it('a recognition card on a phrase: phraseComprehension +/-, not readingRecognition; the weight is the card weight', () => {
    resetIds();
    const right = observationsOf(card([PH], 'recognition', true));
    expect(right).toHaveLength(1);
    expect(right[0]).toMatchObject({ dimension: 'phraseComprehension', outcome: 'positive', assisted: false });
    expect(right[0].weight).toBeCloseTo(RULES.phrase.review * 0.8);
    expect(dimsOf([card([PH], 'recognition', false)])).toEqual(['phraseComprehension:negative']);
  });

  it('a recall or cloze card on a phrase keeps productiveRetrieval and adds a smaller phraseComprehension credit', () => {
    resetIds();
    expect(dimsOf([card([PH], 'recall', true)])).toEqual(['phraseComprehension:positive', 'productiveRetrieval:positive']);
    expect(dimsOf([card([PH], 'cloze', false)])).toEqual(['phraseComprehension:negative', 'productiveRetrieval:negative']);
    const w = observationsOf(card([PH], 'recall', true));
    expect(w.find((o) => o.dimension === 'phraseComprehension')!.weight).toBeLessThan(w.find((o) => o.dimension === 'productiveRetrieval')!.weight);
  });

  it('a word in the same card is judged as before', () => {
    resetIds();
    const obs = observationsOf(card([PH, WORD], 'recognition', true));
    expect(obs.map((o) => `${o.unitId}|${o.dimension}`).sort()).toEqual([`${WORD}|readingRecognition`, `${PH}|phraseComprehension`]);
  });

  it('a hinted card or assessment on a phrase reaches assistedRecognition only', () => {
    resetIds();
    expect(dimsOf([card([PH], 'recognition', true, { hinted: true })])).toEqual(['assistedRecognition:positive']);
    expect(dimsOf([grammar([PH], 'morph:sq:NOUN:X', true, { hinted: true })])).toEqual(['assistedRecognition:positive']);
    expect(dimsOf([card([PH], 'recognition', true, {}, { evidence: { quality: 'strong', assisted: true } })])).toEqual(['assistedRecognition:positive']);
  });

  it('an assessment naming a phrase: phraseComprehension +/- on the phrase, grammaticalUnderstanding on the construction only', () => {
    resetIds();
    const obs = observationsOf(grammar([PH, 'morph:sq:NOUN:X'], 'morph:sq:NOUN:X', false));
    expect(obs.map((o) => `${o.unitId}|${o.dimension}|${o.outcome}`).sort()).toEqual(['morph:sq:NOUN:X|grammaticalUnderstanding|negative', `${PH}|phraseComprehension|negative`]);
  });

  it('assistance requested for a phrase or sentence: assisted recognition (help was needed), exposure, and never phraseComprehension', () => {
    resetIds();
    for (const kind of ['phrase', 'sentence']) {
      const obs = observationsOf(assist([PH, WORD], { assistance: kind }));
      expect(obs.filter((o) => o.dimension === 'phraseComprehension')).toEqual([]);
      expect(obs.filter((o) => o.dimension === 'exposure').map((o) => o.unitId).sort()).toEqual([PH, WORD].sort());
      const needed = obs.filter((o) => o.dimension === 'assistedRecognition');
      expect(needed.map((o) => `${o.unitId}:${o.outcome}:${o.assisted}`)).toEqual([`${PH}:negative:true`]); // the phrase unit only; the word is left alone
    }
    // an ordinary gloss request is exposure only
    expect(observationsOf(assist([PH], { assistance: 'gloss' })).map((o) => o.dimension)).toEqual(['exposure']);
  });

  it('a correct unassisted production using a phrase: contextualProduction as today plus a small phraseComprehension positive', () => {
    resetIds();
    const obs = observationsOf(production([PH, WORD], { usedCorrectly: true }));
    expect(obs.map((o) => `${o.unitId}|${o.dimension}|${o.outcome}`).sort()).toEqual([
      `${PH}|contextualProduction|positive`, `${PH}|phraseComprehension|positive`, `${WORD}|contextualProduction|positive`,
    ].sort());
    const ph = obs.find((o) => o.unitId === PH && o.dimension === 'phraseComprehension')!;
    const cp = obs.find((o) => o.unitId === PH && o.dimension === 'contextualProduction')!;
    expect(ph.weight).toBeCloseTo(RULES.phrase.productionPositive);
    expect(ph.weight).toBeLessThan(cp.weight);
    // an error says nothing about comprehension; assistance routes everything to assistedRecognition
    expect(dimsOf([production([PH], { usedCorrectly: false })])).toEqual(['contextualProduction:negative']);
    expect(dimsOf([production([PH], { usedCorrectly: true, assisted: true, assistance: ['hint'] })])).toEqual(['assistedRecognition:positive']);
  });

  it('UnderstoodMarked on a phrase is a weak self-reported phraseComprehension credit, none when help was used', () => {
    resetIds();
    const obs = observationsOf(ev('UnderstoodMarked', [PH], { scope: 'sentence', helpUsed: false }));
    const ph = obs.find((o) => o.dimension === 'phraseComprehension')!;
    expect(ph).toMatchObject({ outcome: 'positive', sourceReliability: RULES.understood.reliability });
    expect(ph.weight).toBeLessThan(0.2);
    expect(observationsOf(ev('UnderstoodMarked', [PH], { scope: 'sentence', helpUsed: true })).map((o) => o.dimension)).toEqual(['assistedRecognition']);
    expect(observationsOf(ev('UnderstoodMarked', [WORD], { scope: 'sentence', helpUsed: false })).map((o) => o.dimension)).toEqual(['readingRecognition']);
  });

  it('every positive phraseComprehension observation traces to a payload that says so (principle j)', () => {
    resetIds();
    const events = [
      card([PH], 'recognition', true), card([PH], 'recall', true), grammar([PH], 'morph:sq:NOUN:X', true),
      production([PH], { usedCorrectly: true }), ev('UnderstoodMarked', [PH], { scope: 'sentence', helpUsed: false }),
    ];
    let seen = 0;
    for (const e of events) for (const o of observationsOf(e)) if (o.dimension === 'phraseComprehension') { seen++; expect(isPositiveTraceable(e, o)).toBe(true); }
    expect(seen).toBe(5);
  });

  it('the projected row carries the dimension and keeps a phrase\'s other dimensions apart', async () => {
    resetIds();
    const { rows } = await projected([card([PH], 'recognition', true), card([PH], 'recognition', true), production([PH], { usedCorrectly: true })]);
    const r = rowOf(rows, PH);
    expect(r.dimensions.phraseComprehension.observations).toBe(3);
    expect(r.dimensions.phraseComprehension.score).toBeGreaterThan(0.5);
    expect(r.dimensions.readingRecognition.observations).toBe(0);
    expect(r.dimensions.contextualProduction.observations).toBe(1);
    expect(r.retention.basedOn).not.toBe('none');
  });
});

describe('language-basis weighting of exposure', () => {
  const withLang = (basis: string | undefined) => (o?: Record<string, unknown>) => ({ ...(basis ? { language: { languageId: 'sq', basis, confidence: 0.8, override: basis === 'override' } } : {}), ...o });
  const lk = (basis: string | undefined) => ev('SelectionLookedUp', [WORD], { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: ['gloss'], ...withLang(basis)() });
  const en = (basis: string | undefined) => ev('EncounterRecorded', [WORD], { contextKind: 'sentence', ...withLang(basis)() });

  it('factors: override and metadata 1, detection 0.7, team-default 0.5, a v2 event with no language block 1', () => {
    resetIds();
    const base = RULES.exposure.lookup;
    const w = (basis: string | undefined) => observationsOf(lk(basis))[0]?.weight;
    expect(w('override')).toBeCloseTo(base);
    expect(w('book-metadata')).toBeCloseTo(base);
    expect(w('document-metadata')).toBeCloseTo(base);
    expect(w('detection')).toBeCloseTo(base * 0.7);
    expect(w('team-default')).toBeCloseTo(base * 0.5);
    expect(w(undefined)).toBeCloseTo(base);
    expect(LANGUAGE_BASIS_FACTOR).toMatchObject({ override: 1, detection: 0.7, 'team-default': 0.5, undetermined: 0, missing: 1 });
    const enc = (basis: string | undefined) => observationsOf(en(basis))[0]?.weight;
    expect(enc('detection')).toBeCloseTo(RULES.exposure.encounter * 0.7);
    expect(enc('team-default')).toBeCloseTo(RULES.exposure.encounter * 0.5);
  });

  it('undetermined: nothing was parsed, so no observation at all', () => {
    resetIds();
    expect(observationsOf(lk('undetermined'))).toEqual([]);
    expect(observationsOf(en('undetermined'))).toEqual([]);
  });

  it('an unrecognised basis is treated cautiously (0.5), never as certain; the factor only ever lowers', () => {
    resetIds();
    expect(observationsOf(lk('from-the-future'))[0].weight).toBeCloseTo(RULES.exposure.lookup * 0.5);
    for (const f of Object.values(LANGUAGE_BASIS_FACTOR)) expect(f).toBeLessThanOrEqual(1);
  });

  it('does not touch a judged observation or an assistance request', () => {
    resetIds();
    const c = card([WORD], 'recognition', true, { language: { basis: 'team-default' } });
    expect(observationsOf(c)[0].weight).toBeCloseTo(RULES.card.recognition * 0.8);
    expect(observationsOf(assist([WORD], { assistance: 'gloss', language: { basis: 'detection' } }))[0].weight).toBeCloseTo(RULES.exposure.assistance);
  });

  it('shows in the projected exposure weight and in the engine counters by basis', async () => {
    resetIds();
    const { rows, engine } = await projected([lk('override'), lk('detection'), lk('team-default'), lk(undefined), lk('undetermined'), en('detection')]);
    const r = rowOf(rows, WORD);
    expect(r.dimensions.exposure.observations).toBe(5); // the undetermined lookup observed nothing
    expect(r.dimensions.exposure.weight).toBeCloseTo(RULES.exposure.lookup * (1 + 0.7 + 0.5 + 1) + RULES.exposure.encounter * 0.7);
    expect(await engine.counters(L, WORD)).toEqual({
      encounters: 1, lookups: 4, assistance: 0, playbacks: 0, byLanguageBasis: { override: 1, detection: 2, 'team-default': 1, missing: 1 },
    });
  });

  it('exposure by detection never reaches a judged dimension', async () => {
    resetIds();
    const { rows } = await projected([lk('detection'), lk('team-default')]);
    for (const d of DIMENSIONS.filter((x) => x !== 'exposure')) expect(rowOf(rows, WORD).dimensions[d].observations).toBe(0);
  });
});
