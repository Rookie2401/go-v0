// @vitest-environment node
/**
 * projection@8: what a learner has shown of a unit is kept per variety (packages/repository-engine/src/projection.ts `withVarieties`), read
 * through `knowledgeInVariety`; what is known in one variety is familiarity evidence for another (`transferEvidence`), never mastery.
 * The brief's tests A (Classical / Modern Greek), B (Biblical / Modern Hebrew), E (existing users) and G (the same on every device).
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION, cardIdFor, classifiedVarietiesOf, knowledgeInVariety, ownKnowledgeOf, transferEvidence, transferPriority,
} from '../../packages/repository-contract/src';
import type { GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import { MODEL_VERSION, createProjectionEngine, foldEvents } from '../../packages/repository-engine/src';
import { FakeStore } from '../repository/engine/fakeStore';
import { shuffled, rng } from '../repository/engine/helpers';

const L = 'learner-1', E = 'enrol-1';
const LOGOS = 'lemma:el:λόγος:NOUN';
const MELEKH = 'lemma:he:מלך:NOUN';
let n = 0;
const day = (d: number, h = 10): string => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`;

interface O { at: string; lang?: string; sentenceKey?: string; declared?: string; analysed?: string; weak?: string; id?: string }
const reader = (kind: GoEvent['kind'], unit: string, payload: Record<string, unknown>, o: O): GoEvent => {
  const lang = o.lang ?? unit.split(':')[1];
  return {
    id: o.id ?? `r-${String(++n).padStart(4, '0')}`, v: CONTRACT_VERSION, learnerId: L, enrolmentId: E, languageId: lang, at: o.at,
    producer: { app: 'golearn-ext', version: '1', deviceId: 'd1' }, kind,
    subject: { itemIds: [unit], ...(o.sentenceKey ? { sentenceKey: o.sentenceKey } : {}) },
    payload: {
      ...payload,
      ...(o.declared ? { language: { languageId: lang, varietyId: o.declared, basis: 'override', confidence: 1, override: true } } : {}),
      ...(o.weak ? { language: { languageId: lang, varietyId: o.weak, basis: 'team-default', confidence: 0.3, override: false } } : {}),
      ...(o.analysed ? { variety: { varietyId: o.analysed, basis: 'analysed' } } : {}),
    },
  };
};
const lookup = (unit: string, o: O): GoEvent => reader('SelectionLookedUp', unit, { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: ['gloss'] }, o);
const mark = (unit: string, level: string, o: O): GoEvent => reader('ItemMarked', unit, { mark: level }, o);

/** A GoReview card event: `variety` puts it in the card's id (a card made since varieties were recorded); `stamp` is the old envelope variety. */
const cardEvent = (kind: 'CardAdded' | 'CardReviewed', unit: string, o: { at: string; variety?: string; stamp?: string; correct?: boolean; id?: string }): GoEvent => {
  const lang = unit.split(':')[1];
  const cardId = cardIdFor(unit, 'written-recognition', o.variety);
  return {
    id: o.id ?? `c-${String(++n).padStart(4, '0')}`, v: 2, learnerId: L, enrolmentId: E, languageId: lang, at: o.at,
    ...((o.variety ?? o.stamp) ? { varietyId: o.variety ?? o.stamp } : {}),
    producer: { app: 'gopractice-review', version: '0.1.0', deviceId: 'd1' }, kind, subject: { cardId, itemIds: [unit] },
    payload: kind === 'CardAdded'
      ? { unitId: unit, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' }
      : { cardKind: 'recognition', grade: o.correct === false ? 'again' : 'good', correct: o.correct !== false, hinted: false, rating: o.correct === false ? 1 : 3 },
    ...(kind === 'CardAdded' ? { evidence: { quality: 'none' as const } } : {}),
  };
};

const fold = (events: GoEvent[]): Map<string, UnitKnowledge> => new Map(foldEvents(events, { modelVersion: MODEL_VERSION }).map((r) => [r.unitId, r]));
const view = (row: UnitKnowledge, v: string) => knowledgeInVariety(row, v);

describe('Test A: Classical and Modern Greek are learned apart', () => {
  const classical = [
    lookup(LOGOS, { at: day(1), declared: 'el-att', sentenceKey: 's-plato' }),
    mark(LOGOS, 'known', { at: day(1, 11), sentenceKey: 's-plato' }), // a follow-up of that card: no variety of its own
  ];

  it('what is learned in Classical Greek is Classical knowledge; Modern Greek is not granted', () => {
    const row = fold(classical).get(LOGOS)!;
    expect(row.level).toBe('known'); // the row across its varieties, as every reader of rows before @8 expects
    expect(row.varieties).toEqual({ 'el-att': { whole: true, firstAt: day(1) } });
    expect(classifiedVarietiesOf(row)).toEqual(['el-att']);
    expect(view(row, 'el-att')).toMatchObject({ basis: 'classified', knowledge: { level: 'known', encounters: 1 } });
    const modern = view(row, 'el-mod');
    expect(modern.basis).toBe('not-met');
    expect(modern.knowledge).toMatchObject({ level: 'new', encounters: 0, unitId: LOGOS });
    expect(modern.knowledge.selfMark).toBeUndefined();
    expect(Object.values(modern.knowledge.dimensions).every((d) => d.observations === 0)).toBe(true);
  });

  it('the lexical relationship stays: the same unit id, and Classical knowledge is evidence about the Modern word', () => {
    const row = fold(classical).get(LOGOS)!;
    expect(transferEvidence(row, 'el-mod')).toEqual([{ unitId: LOGOS, fromVarietyId: 'el-att', relation: 'other-group', link: 'same-item', level: 'known', strength: 'moderate' }]);
    // a neighbouring ancient stage is nearer than Modern Greek
    expect(transferEvidence(row, 'el-koi')[0]).toMatchObject({ relation: 'same-group', strength: 'strong' });
    expect(transferEvidence(row, 'el-att')).toEqual([]); // nothing transfers into the variety it was learned in
  });

  it('meeting the word in Modern Greek starts Modern knowledge at Seen and leaves Classical knowledge untouched', () => {
    const before = fold(classical).get(LOGOS)!;
    const row = fold([...classical, lookup(LOGOS, { at: day(3), analysed: 'el-mod', sentenceKey: 's-news' })]).get(LOGOS)!;
    expect(classifiedVarietiesOf(row)).toEqual(['el-att', 'el-mod']);
    expect(view(row, 'el-mod').knowledge).toMatchObject({ level: 'seen', encounters: 1 });
    expect(view(row, 'el-mod').basis).toBe('classified');
    const attic = view(row, 'el-att').knowledge;
    expect(attic.level).toBe('known');
    expect(attic.dimensions).toEqual(before.dimensions);
    expect(attic.selfMark).toEqual(before.selfMark);
    expect(ownKnowledgeOf(row, 'el-att')).toMatchObject({ level: 'known', events: 2, reader: 2, review: 0, firstAt: day(1) });
    expect(ownKnowledgeOf(row, 'el-mod')).toMatchObject({ level: 'seen', events: 1, firstAt: day(3) });
  });

  it('a review of the Classical card moves Classical knowledge only', () => {
    const events = [...classical, lookup(LOGOS, { at: day(3), analysed: 'el-mod', sentenceKey: 's-news' }),
      cardEvent('CardAdded', LOGOS, { at: day(4), variety: 'el-att' }), cardEvent('CardReviewed', LOGOS, { at: day(4, 11), variety: 'el-att' })];
    const row = fold(events).get(LOGOS)!;
    expect(view(row, 'el-att').knowledge.dimensions.readingRecognition.observations).toBeGreaterThan(view(row, 'el-mod').knowledge.dimensions.readingRecognition.observations);
    expect(view(row, 'el-mod').knowledge.dimensions.readingRecognition.positive).toBe(0);
    expect(ownKnowledgeOf(row, 'el-att')).toMatchObject({ review: 1 });
    expect(ownKnowledgeOf(row, 'el-mod')).toMatchObject({ review: 0, level: 'seen' });
  });
});

describe('Test B: Biblical and Modern Hebrew', () => {
  const biblical = [
    lookup(MELEKH, { at: day(1), declared: 'he-bib', sentenceKey: 's-ps' }),
    mark(MELEKH, 'automatic', { at: day(1, 11), sentenceKey: 's-ps' }),
    cardEvent('CardAdded', MELEKH, { at: day(2), variety: 'he-bib' }),
    cardEvent('CardReviewed', MELEKH, { at: day(2, 11), variety: 'he-bib' }),
  ];

  it('Biblical mastery stays whole and gives the Modern item familiarity evidence, not mastery', () => {
    const row = fold(biblical).get(MELEKH)!;
    expect(view(row, 'he-bib').knowledge.level).toBe('automatic');
    expect(view(row, 'he-mod')).toMatchObject({ basis: 'not-met', knowledge: { level: 'new' } });
    const transfer = transferEvidence(row, 'he-mod');
    expect(transfer).toEqual([{ unitId: MELEKH, fromVarietyId: 'he-bib', relation: 'other-group', link: 'same-item', level: 'automatic', strength: 'moderate' }]);
    expect(transferPriority(transfer)).toBe(1);
  });

  it('target-variety evidence, and only it, raises the Modern item', () => {
    const met = fold([...biblical, lookup(MELEKH, { at: day(5), analysed: 'he-mod', sentenceKey: 's-haaretz' })]).get(MELEKH)!;
    expect(view(met, 'he-mod').knowledge.level).toBe('seen');
    expect(view(met, 'he-bib').knowledge.level).toBe('automatic');
    const marked = fold([...biblical, lookup(MELEKH, { at: day(5), analysed: 'he-mod', sentenceKey: 's-haaretz' }), mark(MELEKH, 'familiar', { at: day(5, 11), analysed: 'he-mod' })]).get(MELEKH)!;
    expect(view(marked, 'he-mod').knowledge.level).toBe('familiar');
    expect(view(marked, 'he-bib').knowledge.level).toBe('automatic'); // a later Modern mark does not replace the Biblical one
  });

  it('a differently spelled relative is only ever weak evidence, and weak evidence moves nothing', () => {
    const pointed = 'lemma:he:מֶלֶךְ:NOUN';
    const rows = fold([lookup(pointed, { at: day(1), declared: 'he-bib', sentenceKey: 's1' }), mark(pointed, 'known', { at: day(1, 11), sentenceKey: 's1' })]);
    const evidence = transferEvidence(undefined, 'he-mod', [rows.get(pointed)!]);
    expect(evidence).toEqual([{ unitId: pointed, fromVarietyId: 'he-bib', relation: 'other-group', link: 'same-spelling-family', level: 'known', strength: 'weak' }]);
    expect(transferPriority(evidence)).toBe(0);
  });

  it('Biblical Aramaic read inside the Hebrew Bible is never credited to Hebrew', () => {
    const word = 'lemma:he:מלכא:NOUN';
    const row = fold([lookup(word, { at: day(1), declared: 'arc-bib', sentenceKey: 's-dan' }), mark(word, 'known', { at: day(1, 11), sentenceKey: 's-dan' })]).get(word)!;
    expect(classifiedVarietiesOf(row)).toEqual(['arc-bib']);
    expect(view(row, 'he-bib').knowledge.level).toBe('new');
    expect(transferEvidence(row, 'he-bib')).toEqual([]); // a related language, not a period of this one
  });
});

describe('how a record gets its variety', () => {
  it('a follow-up event belongs to the variety of its sentence; a sentence stated two ways settles nothing', () => {
    const one = fold([lookup(LOGOS, { at: day(1), declared: 'el-koi', sentenceKey: 's1' }), mark(LOGOS, 'recognized', { at: day(1, 11), sentenceKey: 's1' })]).get(LOGOS)!;
    expect(one.varieties).toEqual({ 'el-koi': { whole: true, firstAt: day(1) } });
    const two = fold([lookup(LOGOS, { at: day(1), declared: 'el-koi', sentenceKey: 's1' }), lookup(LOGOS, { at: day(1, 10), analysed: 'el-att', sentenceKey: 's1' }),
      mark(LOGOS, 'recognized', { at: day(1, 11), sentenceKey: 's1' })]).get(LOGOS)!;
    expect(two.unclassified?.selfMark?.mark).toBe('recognized'); // the mark is kept, assigned to neither
    expect(view(two, 'el-koi').knowledge.level).toBe('recognized'); // and it still counts in each variety's view
    expect(view(two, 'el-att').knowledge.level).toBe('recognized');
    expect(ownKnowledgeOf(two, 'el-koi')?.level).toBe('seen');     // but not as that variety's own evidence
  });

  it("an enrolment's default variety and a detected language classify nothing", () => {
    const row = fold([lookup(MELEKH, { at: day(1), weak: 'he-mod', sentenceKey: 's1' }), mark(MELEKH, 'known', { at: day(1, 11), sentenceKey: 's1' })]).get(MELEKH)!;
    expect(row.varieties).toBeUndefined();
    expect(row.unclassified).toBeUndefined();
    expect(row.sources).toEqual({ reader: 2, review: 0 });
    // nothing is classified: the row is read as it always was, in whatever variety is asked, and is assigned to none
    for (const v of ['he-mod', 'he-bib']) expect(view(row, v)).toMatchObject({ basis: 'unsettled', knowledge: { level: 'known' } });
  });

  it('a language without learning varieties gets no variety fields at all', () => {
    const unit = 'lemma:sq:libër:NOUN';
    const row = fold([lookup(unit, { at: day(1), sentenceKey: 's1' }), mark(unit, 'known', { at: day(1, 11), sentenceKey: 's1' })]).get(unit)!;
    expect('varieties' in row).toBe(false);
    expect('unclassified' in row).toBe(false);
    expect('sources' in row).toBe(false);
    expect(knowledgeInVariety(row, 'sq-standard')).toEqual({ basis: 'no-varieties', knowledge: row });
  });
});

describe('Test E: existing users (records written before varieties were recorded)', () => {
  const legacyCard = (o: { stamp?: string; addedAt: string }): GoEvent[] => [
    cardEvent('CardAdded', MELEKH, { at: o.addedAt, stamp: o.stamp }),
    cardEvent('CardReviewed', MELEKH, { at: day(6), stamp: o.stamp }),
    cardEvent('CardReviewed', MELEKH, { at: day(8), stamp: o.stamp }),
  ];

  it('nothing of the row a reader saw before changes: the same events of a language without varieties fold to the same numbers', () => {
    const events = [lookup(MELEKH, { at: day(1), declared: 'he-bib', sentenceKey: 's1' }), mark(MELEKH, 'familiar', { at: day(2), weak: 'he-mod' }),
      lookup(MELEKH, { at: day(3), analysed: 'he-mod', sentenceKey: 's2' }), ...legacyCard({ stamp: 'he-mod', addedAt: day(5) })];
    const asOther = JSON.parse(JSON.stringify(events).replaceAll('"he"', '"xx"').replaceAll(':he:', ':xx:')) as GoEvent[];
    const he = fold(events).get(MELEKH)!;
    const xx = fold(asOther).get(MELEKH.replace(':he:', ':xx:'))!;
    const { varieties: _v, unclassified: _u, sources: _s, unitId: _i, languageId: _l, ...before } = he;
    const { unitId: _i2, languageId: _l2, ...plain } = xx;
    expect(before).toEqual(plain);
  });

  it('a legacy card of a word met only in Biblical texts is a Biblical card, whatever default its enrolment stamped', () => {
    const row = fold([lookup(MELEKH, { at: day(1), declared: 'he-bib', sentenceKey: 's1' }), ...legacyCard({ stamp: 'he-mod', addedAt: day(5) })]).get(MELEKH)!;
    expect(row.varieties).toEqual({ 'he-bib': { whole: true, firstAt: day(1) } });
    expect(ownKnowledgeOf(row, 'he-bib')).toMatchObject({ review: 2, reader: 1 });
    expect(view(row, 'he-mod').knowledge.dimensions.readingRecognition.observations).toBe(0);
  });

  it('a legacy card with nothing to classify it stays unsettled: never Modern, never Biblical, and never lost', () => {
    const alone = fold(legacyCard({ stamp: 'he-mod', addedAt: day(5) })).get(MELEKH)!;
    expect(alone.varieties).toBeUndefined();
    expect(alone.dimensions.readingRecognition.observations).toBe(2);
    expect(alone.sources).toEqual({ reader: 0, review: 2 });
    for (const v of ['he-mod', 'he-bib']) expect(view(alone, v)).toMatchObject({ basis: 'unsettled', knowledge: { level: alone.level } });
  });

  it('a stamp somebody chose (not the default) classifies a legacy card when nothing contradicts it', () => {
    const row = fold(legacyCard({ stamp: 'he-bib', addedAt: day(5) })).get(MELEKH)!;
    expect(row.varieties).toEqual({ 'he-bib': { whole: true } });
    expect(view(row, 'he-mod').knowledge.level).toBe('new');
  });

  it('evidence that arrives AFTER a legacy card began never moves it', () => {
    // the card began on day 5 with nothing classified; the word is met in a Biblical text on day 9
    const events = [...legacyCard({ stamp: 'he-mod', addedAt: day(5) }), lookup(MELEKH, { at: day(9), declared: 'he-bib', sentenceKey: 's1' })];
    const row = fold(events).get(MELEKH)!;
    expect(classifiedVarietiesOf(row)).toEqual(['he-bib']);
    expect(ownKnowledgeOf(row, 'he-bib')).toMatchObject({ review: 0, reader: 1 }); // the old answers were not handed to Biblical Hebrew
    expect(row.unclassified?.dimensions.readingRecognition.observations).toBe(2);   // they are kept, unassigned
    // and they still count for the learner wherever the word is read (no progress is lost)
    expect(view(row, 'he-bib').knowledge.dimensions.readingRecognition.observations).toBe(2);
    expect(view(row, 'he-mod').knowledge.dimensions.readingRecognition.observations).toBe(2);
    // later Modern evidence changes nothing about the old card either
    const later = fold([...events, lookup(MELEKH, { at: day(12), analysed: 'he-mod', sentenceKey: 's2' })]).get(MELEKH)!;
    expect(later.unclassified?.dimensions.readingRecognition.observations).toBe(2);
    expect(ownKnowledgeOf(later, 'he-bib')).toMatchObject({ review: 0 });
    expect(ownKnowledgeOf(later, 'he-mod')).toMatchObject({ review: 0, reader: 1 });
  });

  it('a card assigned on the evidence of its day keeps that assignment when another variety is met later', () => {
    const events = [lookup(MELEKH, { at: day(1), declared: 'he-bib', sentenceKey: 's1' }), ...legacyCard({ stamp: 'he-mod', addedAt: day(5) }),
      lookup(MELEKH, { at: day(12), analysed: 'he-mod', sentenceKey: 's2' })];
    const row = fold(events).get(MELEKH)!;
    expect(ownKnowledgeOf(row, 'he-bib')).toMatchObject({ review: 2 });
    expect(ownKnowledgeOf(row, 'he-mod')).toMatchObject({ review: 0, reader: 1, level: 'seen' });
    expect(row.unclassified).toBeUndefined();
  });
});

describe('Test G: the same on every device, in any order', () => {
  const events = (): GoEvent[] => [
    lookup(LOGOS, { at: day(1), declared: 'el-att', sentenceKey: 's1', id: 'g1' }), mark(LOGOS, 'known', { at: day(1, 11), sentenceKey: 's1', id: 'g2' }),
    lookup(LOGOS, { at: day(3), analysed: 'el-mod', sentenceKey: 's2', id: 'g3' }), lookup(LOGOS, { at: day(3, 12), weak: 'el-mod', id: 'g4' }),
    cardEvent('CardAdded', LOGOS, { at: day(4), variety: 'el-att', id: 'g5' }), cardEvent('CardReviewed', LOGOS, { at: day(4, 11), variety: 'el-att', id: 'g6' }),
    cardEvent('CardAdded', LOGOS, { at: day(5), variety: 'el-mod', id: 'g7' }), cardEvent('CardReviewed', LOGOS, { at: day(5, 11), variety: 'el-mod', correct: false, id: 'g8' }),
    lookup(MELEKH, { at: day(2), declared: 'he-bib', sentenceKey: 's3', id: 'g9' }), cardEvent('CardAdded', MELEKH, { at: day(6), stamp: 'he-mod', id: 'g10' }),
    cardEvent('CardReviewed', MELEKH, { at: day(6, 11), stamp: 'he-mod', id: 'g11' }), lookup(MELEKH, { at: day(9), analysed: 'he-mod', sentenceKey: 's4', id: 'g12' }),
  ];

  it('any arrival order, and any duplication, folds to the same rows', () => {
    const want = JSON.stringify(foldEvents(events(), { modelVersion: MODEL_VERSION }));
    const rand = rng(11);
    for (let i = 0; i < 25; i++) {
      const mixed = shuffled([...events(), ...events().slice(0, 4)], rand);
      expect(JSON.stringify(foldEvents(mixed, { modelVersion: MODEL_VERSION }))).toBe(want);
    }
  });

  it('a device that folds as events arrive and one that rebuilds from the whole log hold the same knowledge', async () => {
    const all = events();
    const live = new FakeStore();
    const liveEngine = createProjectionEngine({ store: live, now: () => day(20) });
    for (let i = 0; i < all.length; i += 3) { await live.append(L, all.slice(i, i + 3)); await liveEngine.project(L); }
    const other = new FakeStore();
    await other.append(L, shuffled(all, rng(5)));
    const rebuilt = await createProjectionEngine({ store: other, now: () => day(20) }).rebuild(L);
    expect(await liveEngine.knowledge(L)).toEqual(rebuilt);
    const logos = rebuilt.find((r) => r.unitId === LOGOS)!;
    expect(classifiedVarietiesOf(logos)).toEqual(['el-att', 'el-mod']);
    expect(logos.unclassified?.basis.events).toBe(1); // the lookup only an enrolment default spoke for
  });

  it('a store projected by the model before varieties is rebuilt on the next read and gains them, keeping every level', async () => {
    const store = new FakeStore();
    await store.append(L, events());
    const old = createProjectionEngine({ store, now: () => day(20), modelVersion: 'projection@7' });
    const before = await old.rebuild(L);
    const engine = createProjectionEngine({ store, now: () => day(20) });
    const after = await engine.knowledge(L);
    expect(after.map((r) => [r.unitId, r.level, r.encounters, r.selfMark])).toEqual(before.map((r) => [r.unitId, r.level, r.encounters, r.selfMark]));
    expect(after.every((r) => r.modelVersion === MODEL_VERSION)).toBe(true);
    expect(after.find((r) => r.unitId === LOGOS)?.varieties).toBeDefined();
  });
});
