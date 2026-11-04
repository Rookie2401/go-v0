import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import { foldDeckItems } from '../../packages/goreview/src/scheduler/deck';
import { createFsrsScheduler } from '../../packages/goreview/src/scheduler/fsrs';
import { writtenRecognition } from '../../packages/goreview/src/exercises/written-recognition';
import { GREEK } from '../../packages/goreview-ecclesia/src/languages';
import { cardAddedEvent, cardsForPassage, contextsOf, contextualCard } from '../../packages/goreview-ecclesia/src/cards';
import { factsProviderFor, inMemoryLexicon, lexemeFacts, orderGlosses } from '../../packages/goreview-ecclesia/src/facts';
import { mapEncounters } from '../../packages/goreview-ecclesia/src/encounters';
import { GREEK_FORMS, GREEK_LEXEMES, JOHN_1, JOHN_1_1_18, lexemeOf, passage } from './fixtures/greek-john';

const identity = { learnerId: 'L', enrolmentId: 'E', deviceId: 'D' };
const AT = '2026-11-04T09:00:00.000Z';
const v1 = JOHN_1_1_18.verses[0]!;
const logos = v1.tokens[4]!;
const LOGOS = lexemeOf('λόγος', 'NOUN');

describe('contextual cards', () => {
  it('have a deterministic identity: unit × dimension, whatever the passage, verse or position', () => {
    const a = contextualCard(GREEK, logos, { ref: JOHN_1, verse: 1 });
    const b = contextualCard(GREEK, JOHN_1_1_18.verses[13]!.tokens.find((t) => t.lemma === 'λόγος')!, { ref: { book: 'JHN', chapter: 1, verse: 14 }, verse: 14 });
    expect(a.cardId).toBe('card:written-recognition:lemma:el:λόγος:NOUN');
    expect(b.cardId).toBe(a.cardId);
    expect(a.context).toMatchObject({ verse: 1, tokenIndex: 4, sentenceKey: 'v:JHN.1.1' });
    expect(b.context).toMatchObject({ verse: 14, sentenceKey: 'v:JHN.1.14' });
    expect(a.context.sourceRef).toMatchObject({ kind: 'scripture', translationId: 'SBLGNT', book: 'JHN', chapter: 1, verse: 1 });
    expect(contextualCard(GREEK, logos, { ref: JOHN_1, verse: 1 }, { target: 'form' }).cardId).toBe('card:written-recognition:form:el:λόγος');
  });
  it('one card per distinct unit of a passage, first occurrence giving the context', () => {
    const cards = cardsForPassage(GREEK, passage(1, 2));
    const ids = cards.map((c) => c.cardId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(cards.find((c) => c.unitId === LOGOS)!.context).toMatchObject({ verse: 1, tokenIndex: 4 });
    expect(cards.map((c) => c.unitId)).toContain(lexemeOf('οὗτος', 'PRON'));
  });
  it('a learner-added card is a valid CardAdded the deck fold creates an item from, with the passage as its reason', () => {
    const card = contextualCard(GREEK, logos, { ref: JOHN_1, verse: 1 });
    const e = cardAddedEvent(GREEK, card, identity, AT);
    expect(validateEvent(e)).toEqual([]);
    expect(e.subject.cardId).toBe(card.cardId);
    expect(e.payload).toMatchObject({ unitId: LOGOS, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'learner', reason: 'met in JHN.1.1-18 verse 1' });
    expect(e.varietyId).toBe('el-koi');
    const deck = foldDeckItems([e], createFsrsScheduler(), { learnerId: 'L', languageId: 'el', now: AT });
    expect(deck).toHaveLength(1);
    expect(deck[0]).toMatchObject({ itemId: card.cardId, unitId: LOGOS, status: 'active', addedBy: 'learner' });
    expect(deck[0]!.schedule.phase).toBe('new');
  });
  it('lists every Scripture place a unit was met, from the reading events', () => {
    const events = mapEncounters([
      { kind: 'passage-viewed', encounterId: 'a', at: AT, passage: JOHN_1, verses: passage(1, 14).verses },
      { kind: 'word-selected', encounterId: 'b', at: '2026-11-04T09:01:00.000Z', passage: JOHN_1, verse: 14, token: JOHN_1_1_18.verses[13]!.tokens.find((t) => t.lemma === 'λόγος')! },
    ], { profile: GREEK, identity }).flatMap((m) => m.events);
    const ctxs = contextsOf(LOGOS, events);
    expect(ctxs.map((c) => c.verse)).toEqual([1, 14]);
    expect(ctxs[1]!.kinds).toEqual({ EncounterRecorded: 1, SelectionLookedUp: 1 });
    expect(ctxs[1]!.lastAt).toBe('2026-11-04T09:01:00.000Z');
  });
});

describe('facts from the reader lexicon', () => {
  const lexicon = inMemoryLexicon(GREEK_LEXEMES, GREEK_FORMS);
  const facts = factsProviderFor(GREEK, lexicon);

  it('orders short glosses first and keeps long senses after them', () => {
    expect(orderGlosses(['(a) rule (kingly or magisterial)', 'beginning', 'beginning', 'ruler'])).toEqual(['beginning', 'ruler', '(a) rule (kingly or magisterial)']);
  });
  it('builds lexeme facts GoReview’s written-recognition builder accepts, with attribution', async () => {
    const f = await facts.factsFor(LOGOS, 'el', 'el-koi');
    expect(f).toBeDefined();
    expect(f!.unit).toMatchObject({ unitId: LOGOS, kind: 'lexeme', languageId: 'el', varietyId: 'el-koi', label: 'λόγος', pos: 'NOUN', status: 'high-confidence', packId: 'pack:el' });
    expect(f!.glosses[0]).toBe('a word');
    expect(f!.glossAttribution).toMatch(/Dodson/);
    expect(f!.exampleSentences).toEqual([]);
    const target = { unitId: LOGOS, unitKind: 'lexeme', languageId: 'el', varietyId: 'el-koi', dimension: 'written-recognition' as const };
    const ctx = { now: AT, random: () => 0.3, pool: facts.pool(20) };
    expect(writtenRecognition.canBuild(target, f!, ctx)).toBe(true);
    const ex = await writtenRecognition.build(target, f!, ctx);
    expect('unavailable' in ex).toBe(false);
    if (!('unavailable' in ex)) {
      expect(ex.validation.ok).toBe(true);
      expect(ex.prompt.instruction).toMatch(/λόγος/u);
      expect(ex.answerKey.accepted).toContain('a word');
      expect(ex.responseMode).toBe('choice'); // the pool gave distractors
      expect(ex.prompt.options).toHaveLength(4);
    }
  });
  it('builds form facts linked to the lexeme (form-of) with the form’s features', async () => {
    const f = await facts.factsFor('form:el:θεόν', 'el');
    expect(f!.unit).toMatchObject({ kind: 'form', label: 'θεόν', features: { Case: 'Acc', Number: 'Sing', Gender: 'Masc' } });
    expect(f!.relations[0]).toMatchObject({ relation: 'form-of', fromId: 'form:el:θεόν', toId: lexemeOf('θεός', 'NOUN') });
    expect(f!.lemma).toBe('θεός');
    expect(f!.glosses.length).toBeGreaterThan(0);
  });
  it('yields nothing for an unknown unit or another language (the item is then skipped with that reason)', async () => {
    expect(await facts.factsFor('lemma:el:ἄγνωστος:ADJ', 'el')).toBeUndefined();
    expect(await facts.factsFor(LOGOS, 'he')).toBeUndefined();
    expect(await facts.factsFor('morph:el:NOUN:Case=Nom', 'el')).toBeUndefined();
  });
  it('a lexeme without glosses is refused by the builder, not shown', () => {
    const f = lexemeFacts(GREEK, { lexemeId: 'lemma:el:ἄγνωστος:ADJ', lemma: 'ἄγνωστος', pos: 'ADJ', glosses: [] });
    const target = { unitId: f.unit.unitId, unitKind: 'lexeme', languageId: 'el', dimension: 'written-recognition' as const };
    expect(writtenRecognition.canBuild(target, f, { now: AT, random: () => 0.3 })).toBe(false);
  });
});
