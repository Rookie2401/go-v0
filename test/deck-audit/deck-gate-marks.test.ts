/**
 * The two language-neutral entrances of the deck gate that a language's own review gate (src/core/review-gate.ts) uses: the MARK a reading carries
 * (ReviewFacts.reviewMark, written by the facts provider from notes.reviewGate / reviewStatus + reviewKind) becomes the unit's hold, and a language listed in
 * DECK_NO_FORM_CARDS never makes a form unit a card. Nothing here is Korean-specific except the list entry.
 */
import { describe, expect, it } from 'vitest';
import { applyDeckGate, type DeckGateDeps } from '../../packages/goreview/src/facts/deck-gate';
import { deckNoFormCards } from '../../packages/goreview/src/facts/deck-known-limits';
import type { UnitFacts } from '../../packages/goreview/src/types';

const NOW = '2026-11-26T00:00:00.000Z';
const make = (unitId: string, extra: Record<string, unknown> = {}): UnitFacts => ({
  unit: { unitId, kind: unitId.startsWith('form:') ? 'form' : 'lexeme', languageId: 'xx', label: 'w', packId: 'pack:xx', packVersion: '1', status: 'provisional', createdAt: NOW, provenance: { source: 'hand-lexicon', ref: 'goreview-facts:pack-derived@test', confidence: 0.9 } },
  relations: [], analyses: [], status: 'provisional', lemma: 'w', pos: 'NOUN', glosses: ['thing'], lexiconGlossCount: 1, lemmaInWordList: true,
  constructionIds: [], featureExplanations: {}, siblingForms: [], exampleSentences: [], pronunciationNotes: [], ...extra,
}) as unknown as UnitFacts;
const deps = (extra: Partial<DeckGateDeps> = {}): DeckGateDeps => ({ languageId: 'xx', gloss: async () => undefined, factsOf: async () => undefined, ...extra });

describe('a reading the language marked', () => {
  const mark = { kind: 'two-words', reason: 'The sentence leaves two words equally likely.' };
  it('is held with the kind and sentence the language wrote, and no meaning to build a card from', async () => {
    const out = await applyDeckGate(make('lemma:xx:w:NOUN', { reviewMark: mark }), deps());
    expect(out?.status).toBe('requires-review');
    expect(out?.unit.status).toBe('requires-review');
    expect(out?.reviewHold).toEqual(mark);
    expect(out?.glosses).toEqual([]);
  });
  it('is left alone when a reviewer verified the unit, and an unmarked unit is not held by this rule', async () => {
    expect((await applyDeckGate(make('lemma:xx:w:NOUN', { reviewMark: mark, status: 'verified' }), deps()))?.reviewHold).toBeUndefined();
    expect((await applyDeckGate(make('lemma:xx:w:NOUN'), deps()))?.reviewHold).toBeUndefined();
  });
});

describe('a language whose written forms are never cards', () => {
  it('holds every form unit of it with the language\'s sentence, and no other language', async () => {
    expect(deckNoFormCards('ko')).toMatch(/not made a review card/);
    expect(deckNoFormCards('de')).toBeUndefined();
    const sentence = 'Forms are not review cards here.';
    const form = await applyDeckGate(make('form:xx:w'), deps({ noFormCards: sentence }));
    expect(form?.status).toBe('requires-review');
    expect(form?.reviewHold).toEqual({ kind: 'known-limit', reason: sentence });
    const lemma = await applyDeckGate(make('lemma:xx:w:NOUN'), deps({ noFormCards: sentence }));
    expect(lemma?.reviewHold).toBeUndefined();
  });
});
