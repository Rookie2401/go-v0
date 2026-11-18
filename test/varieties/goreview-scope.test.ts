// @vitest-environment node
/**
 * GoReview: one deck fold and one FSRS, with a card's variety in its identity, and queues built from a scope
 * (packages/goreview/src/scheduler/scope.ts). The brief's tests A (isolation), C (variety-only decks), D (combined decks),
 * E (legacy decks) and F (scheduling integrity).
 */
import { describe, expect, it } from 'vitest';
import { cardIdFor, normalizeScope } from '../../packages/repository-contract/src';
import type { GoEvent, ReviewCandidate, ReviewScope, UnitKnowledge } from '../../packages/repository-contract/src';
import { classifyDeck, countByVariety, createFsrsScheduler, foldDeckItems, itemIdFor, resolveScope, scopeReview, scopeSignature, taskVarietyOf, varietyOfItem } from '../../packages/goreview/src/scheduler';
import { decideIntake } from '../../packages/goreview/src/intake/intake';
import { planSession } from '../../packages/goreview/src/planner/planner';
import type { DeckItem, IntakeOutcome } from '../../packages/goreview/src/types';
import { audioOk, candidate, prefs } from '../goreview/intake/fixtures';
import { cardAdded, cardReviewed, day, knowledgeOf, lookup, met } from './helpers';

const NOW = '2026-10-20T10:00:00.000Z';
const fsrs = createFsrsScheduler({ desiredRetention: 0.9 });
const deckOf = (events: GoEvent[], languageId: string, now = NOW): DeckItem[] => foldDeckItems(events, fsrs, { languageId, now });
const WR = 'written-recognition';

// ── a Greek learner: Plato, the New Testament, a newspaper, and some words nothing classifies ──
const LOGOS = 'lemma:el:λόγος:NOUN';    // Classical and Modern, a card in each
const NOMOS = 'lemma:el:νόμος:NOUN';    // Classical only; an OLD card (default stamp) made after the Classical evidence
const SPITI = 'lemma:el:σπίτι:NOUN';    // Modern only
const THEOS = 'lemma:el:θεός:NOUN';     // Koine only
const OLD = 'lemma:el:παλαιός:ADJ';     // nothing classifies it; an old card
const XENOS = 'lemma:el:ξένος:NOUN';    // Classical and Koine, no card yet
const NEO = 'lemma:el:νέος:ADJ';        // Modern only, no card yet

const greekReading: GoEvent[] = [
  ...met(LOGOS, 'el-att', 1), ...met(LOGOS, 'el-mod', 3, 'seen', 'analysed'),
  ...met(NOMOS, 'el-att', 1), ...met(SPITI, 'el-mod', 2, 'recognized', 'analysed'), ...met(THEOS, 'el-koi', 2),
  lookup(OLD, { at: day(2), weak: 'el-mod' }),
  ...met(XENOS, 'el-att', 4), ...met(XENOS, 'el-koi', 5), ...met(NEO, 'el-mod', 5, 'recognized', 'analysed'),
];
const greekCards: GoEvent[] = [
  cardAdded(LOGOS, { at: day(6), variety: 'el-att' }), cardReviewed(LOGOS, 3, { at: day(6, 11), variety: 'el-att' }),
  cardAdded(LOGOS, { at: day(7), variety: 'el-mod' }),
  cardAdded(SPITI, { at: day(7), variety: 'el-mod' }), cardReviewed(SPITI, 3, { at: day(7, 11), variety: 'el-mod' }),
  cardAdded(THEOS, { at: day(7), variety: 'el-koi' }), cardReviewed(THEOS, 3, { at: day(7, 11), variety: 'el-koi' }),
  cardAdded(OLD, { at: day(3), stamp: 'el-mod' }), cardReviewed(OLD, 3, { at: day(3, 11), stamp: 'el-mod' }),
  cardAdded(NOMOS, { at: day(5), stamp: 'el-mod' }), cardReviewed(NOMOS, 3, { at: day(5, 11), stamp: 'el-mod' }),
];
const greekKnowledge = knowledgeOf([...greekReading, ...greekCards]);
const greekDeck = deckOf(greekCards, 'el');
const greekCandidates: ReviewCandidate[] = [LOGOS, NOMOS, SPITI, THEOS, OLD, XENOS, NEO].map((unitId) => candidate({ unitId, kind: 'lexeme' }));
const scopeOf = (languageId: string, ...varietyIds: string[]): ReviewScope => normalizeScope({ languageId, varietyIds })!;
const greek = (scope: ReviewScope) => scopeReview({ languageId: 'el', scope, deck: greekDeck, candidates: greekCandidates, knowledge: greekKnowledge });
const idsOf = (deck: DeckItem[]): string[] => deck.map((i) => i.itemId).sort();
const outcomesOf = (scoped: ReturnType<typeof scopeReview>, languageId = 'el'): IntakeOutcome[] => {
  const rows = new Map(scoped.knowledge.map((k) => [k.unitId, k]));
  return scoped.candidates.map((c) => decideIntake({ candidate: c, knowledge: rows.get(c.unitId), existing: scoped.coverage, audio: audioOk, saved: new Set(), preferences: prefs({ languageId }), now: NOW }));
};
const planOf = (scoped: ReturnType<typeof scopeReview>, over: Partial<Parameters<typeof planSession>[0]> = {}) => planSession({
  deck: scoped.deck, intake: outcomesOf(scoped), preferences: prefs({ languageId: 'el', sessionMinutes: 0, maxNew: 5, cardsPerDeck: 20 }), audio: audioOk, scheduler: fsrs, now: NOW,
  random: () => 0.5, knowledge: scoped.knowledge, transfer: scoped.transfer, ...over,
});

describe('Test A: a Classical card and a Modern card of one word are two cards', () => {
  const attic = cardIdFor(LOGOS, WR, 'el-att'), modern = cardIdFor(LOGOS, WR, 'el-mod');
  const item = (deck: DeckItem[], id: string): DeckItem => deck.find((i) => i.itemId === id)!;

  it('the Classical review moved the Classical card; the Modern card has no history and its own schedule', () => {
    expect(attic).not.toBe(modern);
    expect(item(greekDeck, attic).history).toHaveLength(1);
    expect(item(greekDeck, attic).schedule.reps).toBe(1);
    expect(item(greekDeck, modern).history).toHaveLength(0);
    expect(item(greekDeck, modern).schedule).toEqual(fsrs.newState(day(7)));
    expect(item(greekDeck, attic).varietyId).toBe('el-att');
    expect(item(greekDeck, modern).varietyId).toBe('el-mod');
  });

  it('answering the Modern card (a lapse, then two successes) never reschedules the Classical one', () => {
    const before = item(greekDeck, attic);
    const more = [...greekCards, cardReviewed(LOGOS, 1, { at: day(8), variety: 'el-mod' }), cardReviewed(LOGOS, 3, { at: day(9), variety: 'el-mod' }), cardReviewed(LOGOS, 4, { at: day(12), variety: 'el-mod' })];
    const after = deckOf(more, 'el');
    expect(item(after, attic)).toEqual(before);
    expect(item(after, modern).history.map((h) => h.rating)).toEqual([1, 3, 4]);
    expect(item(after, modern).schedule.due).not.toBe(before.schedule.due);
  });

  it('an envelope that names another variety cannot move a card out of the variety its id names', () => {
    const odd: GoEvent = { ...cardAdded(XENOS, { at: day(9), variety: 'el-koi' }), varietyId: 'el-mod' };
    expect(deckOf([odd], 'el')[0]).toMatchObject({ itemId: cardIdFor(XENOS, WR, 'el-koi'), varietyId: 'el-koi' });
  });

  it('a review that arrives without its creation event is still recovered under the variety its card id names', () => {
    const lone = cardReviewed(XENOS, 3, { at: day(9), variety: 'el-koi' });
    const recovered = deckOf([{ ...lone, payload: { ...lone.payload, assessmentDimension: WR, family: WR } }], 'el');
    expect(recovered.map((i) => [i.itemId, i.varietyId])).toEqual([[cardIdFor(XENOS, WR, 'el-koi'), 'el-koi']]);
  });
});

describe('which variety a card belongs to', () => {
  const classified = classifyDeck(greekDeck, greekKnowledge);
  const of = (unit: string, variety?: string) => classified.find((i) => i.itemId === cardIdFor(unit, WR, variety))!.variety;

  it('its id says so; an old card is assigned on evidence or stays unsettled', () => {
    expect(of(LOGOS, 'el-att')).toEqual({ varietyId: 'el-att', basis: 'card' });
    expect(of(SPITI, 'el-mod')).toEqual({ varietyId: 'el-mod', basis: 'card' });
    // an old card stamped with the enrolment's default, of a word met only in Plato before the card was made: Classical
    expect(of(NOMOS)).toEqual({ varietyId: 'el-att', basis: 'legacy' });
    // an old card of a word nothing classifies: unsettled, never "Modern" because its enrolment said so by default
    expect(of(OLD)).toEqual({ basis: 'unsettled' });
  });

  it('without the word\'s knowledge only a chosen stamp can speak; a language without varieties has none', () => {
    const old = greekDeck.find((i) => i.unitId === NOMOS)!;
    expect(varietyOfItem(old)).toEqual({ basis: 'unsettled' });
    expect(varietyOfItem({ ...old, varietyId: 'el-koi' })).toEqual({ varietyId: 'el-koi', basis: 'legacy' });
    expect(varietyOfItem({ ...old, languageId: 'de', itemId: itemIdFor('lemma:de:a', WR), unitId: 'lemma:de:a' })).toEqual({ basis: 'no-varieties' });
  });

  it('counts by variety cover the whole deck, whatever scope is in force', () => {
    expect(countByVariety({ languageId: 'el', deck: greekDeck, knowledge: greekKnowledge, scheduler: fsrs, now: NOW })).toEqual([
      { varietyId: 'el-att', eligible: 2, due: 2, new: 0, suspended: 0 },
      { varietyId: 'el-koi', eligible: 1, due: 1, new: 0, suspended: 0 },
      { varietyId: 'el-mod', eligible: 2, due: 1, new: 1, suspended: 0 },
      { eligible: 1, due: 1, new: 0, suspended: 0 },
    ]);
    expect(countByVariety({ languageId: 'de', deck: greekDeck, scheduler: fsrs, now: NOW })).toEqual([]);
  });
});

describe('Test C: a deck of one variety cannot hold another', () => {
  it('Classical Greek: no Modern and no Koine card, proposal or planned question', () => {
    const scoped = greek(scopeOf('el', 'el-att'));
    expect(idsOf(scoped.deck)).toEqual([cardIdFor(LOGOS, WR, 'el-att'), cardIdFor(NOMOS, WR), cardIdFor(OLD, WR)].sort());
    expect(scoped.deck.every((i) => i.variety?.varietyId === 'el-att' || i.variety?.varietyId === undefined)).toBe(true);
    expect(scoped.candidates.map((c) => [c.unitId, c.varietyId])).toEqual([[LOGOS, 'el-att'], [NOMOS, 'el-att'], [OLD, undefined], [XENOS, 'el-att']]);
    expect(scoped.excluded.filter((x) => !x.itemId).map((x) => x.unitId).sort()).toEqual([NEO, SPITI, THEOS].sort());
    const plan = planOf(scoped);
    expect(plan.items.length).toBeGreaterThan(0);
    for (const p of plan.items) {
      expect([SPITI, THEOS, NEO]).not.toContain(p.item.unitId);
      expect(p.item.itemId).not.toContain('@el-mod');
      expect(p.item.itemId).not.toContain('@el-koi');
    }
    // the new Classical word becomes a Classical card
    expect(plan.items.find((p) => p.item.unitId === XENOS)?.item).toMatchObject({ itemId: cardIdFor(XENOS, WR, 'el-att'), varietyId: 'el-att' });
  });

  it('Koine only, and Modern only', () => {
    const koine = greek(scopeOf('el', 'el-koi'));
    expect(idsOf(koine.deck)).toEqual([cardIdFor(OLD, WR), cardIdFor(THEOS, WR, 'el-koi')].sort());
    expect(koine.candidates.map((c) => [c.unitId, c.varietyId])).toEqual([[THEOS, 'el-koi'], [OLD, undefined], [XENOS, 'el-koi']]);
    const modern = greek(scopeOf('el', 'el-mod'));
    expect(idsOf(modern.deck)).toEqual([cardIdFor(LOGOS, WR, 'el-mod'), cardIdFor(OLD, WR), cardIdFor(SPITI, WR, 'el-mod')].sort());
    expect(modern.candidates.map((c) => [c.unitId, c.varietyId])).toEqual([[LOGOS, 'el-mod'], [SPITI, 'el-mod'], [OLD, undefined], [NEO, 'el-mod']]);
    for (const p of planOf(modern).items) expect(['el-mod', undefined]).toContain(classifyDeck([p.item], greekKnowledge)[0]!.variety?.varietyId);
  });

  it('the knowledge a queue reads is the variety\'s own: λόγος is Recognized in Classical Greek and Seen in Modern', () => {
    const level = (scope: ReviewScope): string => greek(scope).knowledge.find((k) => k.unitId === LOGOS)!.level;
    expect(level(scopeOf('el', 'el-att'))).toBe('recognized');
    expect(level(scopeOf('el', 'el-mod'))).toBe('seen');
  });

  it('a queue that leaves the unsettled out holds neither the old card nor its word, and still counts the card as covering it', () => {
    const strict = greek({ ...scopeOf('el', 'el-mod'), includeUnsettled: false });
    expect(idsOf(strict.deck)).toEqual([cardIdFor(LOGOS, WR, 'el-mod'), cardIdFor(SPITI, WR, 'el-mod')].sort());
    expect(strict.candidates.map((c) => c.unitId)).not.toContain(OLD);
    expect(strict.coverage.map((i) => i.unitId)).toContain(OLD);
  });

  it('Biblical Hebrew and Modern Hebrew, each alone', () => {
    const MELEKH = 'lemma:he:מלך:NOUN', BAYIT = 'lemma:he:בית:NOUN', MAHSHEV = 'lemma:he:מחשב:NOUN';
    const reading = [...met(MELEKH, 'he-bib', 1, 'known'), ...met(BAYIT, 'he-bib', 1), ...met(BAYIT, 'he-mod', 4, 'seen', 'analysed'), ...met(MAHSHEV, 'he-mod', 4, 'seen', 'analysed')];
    const cards = [cardAdded(MELEKH, { at: day(5), variety: 'he-bib' }), cardReviewed(MELEKH, 3, { at: day(5, 11), variety: 'he-bib' }),
      cardAdded(BAYIT, { at: day(6), variety: 'he-mod' }), cardAdded(MAHSHEV, { at: day(6), variety: 'he-mod' })];
    const knowledge = knowledgeOf([...reading, ...cards]), deck = deckOf(cards, 'he');
    const candidates = [MELEKH, BAYIT, MAHSHEV].map((unitId) => candidate({ unitId, kind: 'lexeme' }));
    const biblical = scopeReview({ languageId: 'he', scope: scopeOf('he', 'he-bib'), deck, candidates, knowledge });
    expect(idsOf(biblical.deck)).toEqual([cardIdFor(MELEKH, WR, 'he-bib')]);
    expect(biblical.candidates.map((c) => [c.unitId, c.varietyId])).toEqual([[MELEKH, 'he-bib'], [BAYIT, 'he-bib']]);
    expect(biblical.excluded.map((x) => x.unitId)).toContain(MAHSHEV);
    const modern = scopeReview({ languageId: 'he', scope: scopeOf('he', 'he-mod'), deck, candidates, knowledge });
    expect(idsOf(modern.deck)).toEqual([cardIdFor(BAYIT, WR, 'he-mod'), cardIdFor(MAHSHEV, WR, 'he-mod')].sort());
    expect(modern.candidates.map((c) => c.unitId)).not.toContain(MELEKH);
    // the Modern queue reads בית as Seen (its Modern evidence), not as the Recognized it is in Biblical Hebrew, and says where it is known
    expect(modern.knowledge.find((k) => k.unitId === BAYIT)!.level).toBe('seen');
    expect(modern.transfer[BAYIT]).toEqual([{ unitId: BAYIT, fromVarietyId: 'he-bib', relation: 'other-group', link: 'same-item', level: 'recognized', strength: 'weak' }]);
  });
});

describe('Test D: varieties combined on purpose', () => {
  const all = greek(scopeOf('el', 'el-att', 'el-koi', 'el-mod'));

  it('cards of every requested variety appear, each with its own identity', () => {
    expect(all.deck).toHaveLength(greekDeck.length);
    const byId = new Map(all.deck.map((i) => [i.itemId, i.variety?.varietyId]));
    expect(byId.get(cardIdFor(LOGOS, WR, 'el-att'))).toBe('el-att');
    expect(byId.get(cardIdFor(LOGOS, WR, 'el-mod'))).toBe('el-mod');
    expect(byId.get(cardIdFor(THEOS, WR, 'el-koi'))).toBe('el-koi');
    expect(byId.get(cardIdFor(NOMOS, WR))).toBe('el-att');
    expect(all.excluded).toEqual([]);
  });

  it('two learning tasks of one word are not merged, and one task named twice is one card', () => {
    // λόγος has two cards (Classical and Modern): both stay, and a proposal for it makes no third
    expect(all.deck.filter((i) => i.unitId === LOGOS)).toHaveLength(2);
    const twice = scopeReview({ languageId: 'el', scope: all.scope!, deck: greekDeck, candidates: [...greekCandidates, ...greekCandidates], knowledge: greekKnowledge });
    const plan = planOf(twice);
    const ids = plan.items.map((p) => p.item.itemId);
    expect(new Set(ids).size).toBe(ids.length);
    // the due Classical card is asked; the never-answered Modern card of the same word waits for a later batch (the planner's standing rule:
    // one new card per word in a batch), as its own card, neither merged into the Classical one nor dropped
    expect(plan.items.filter((p) => p.item.unitId === LOGOS).map((p) => p.item.itemId)).toEqual([cardIdFor(LOGOS, WR, 'el-att')]);
    expect(plan.skipped.find((x) => x.itemId === cardIdFor(LOGOS, WR, 'el-mod'))?.code).toBe('same-unit-in-batch');
    // with the Classical card not in the batch, the Modern card is asked
    const modernOnly = planOf({ ...twice, deck: twice.deck.filter((i) => i.itemId !== cardIdFor(LOGOS, WR, 'el-att')) });
    expect(modernOnly.items.map((p) => p.item.itemId)).toContain(cardIdFor(LOGOS, WR, 'el-mod'));
    // νόμος already has its Classical card (an old one): the Classical proposal is that card, not a second one
    expect(plan.items.filter((p) => p.item.unitId === NOMOS).map((p) => p.item.itemId)).toEqual([cardIdFor(NOMOS, WR)]);
    expect(outcomesOf(all).find((o) => o.unitId === NOMOS)?.decision).toBe('already-covered');
  });

  it('a word eligible in two requested varieties is proposed for one of them at a time, and its new card is that variety\'s', () => {
    const xenos = all.candidates.filter((c) => c.unitId === XENOS);
    expect(xenos).toHaveLength(1);
    expect(xenos[0]!.varietyId).toBe('el-koi'); // met there most recently
    const made = planOf(all).items.find((p) => p.item.unitId === XENOS)!;
    expect(made.item).toMatchObject({ itemId: cardIdFor(XENOS, WR, 'el-koi'), varietyId: 'el-koi' });
    // once the Koine card exists, the Classical task is the one proposed
    const withKoine = scopeReview({ languageId: 'el', scope: all.scope!, deck: deckOf([...greekCards, cardAdded(XENOS, { at: day(9), variety: 'el-koi' })], 'el'), candidates: greekCandidates, knowledge: greekKnowledge });
    expect(withKoine.candidates.find((c) => c.unitId === XENOS)?.varietyId).toBe('el-att');
  });

  it('an answer in a combined deck changes the card answered and no other', () => {
    const more = deckOf([...greekCards, cardReviewed(LOGOS, 1, { at: day(10), variety: 'el-mod' })], 'el');
    const same = (id: string): void => expect(more.find((i) => i.itemId === id)).toEqual(greekDeck.find((i) => i.itemId === id));
    for (const id of [cardIdFor(LOGOS, WR, 'el-att'), cardIdFor(THEOS, WR, 'el-koi'), cardIdFor(SPITI, WR, 'el-mod'), cardIdFor(NOMOS, WR), cardIdFor(OLD, WR)]) same(id);
    expect(more.find((i) => i.itemId === cardIdFor(LOGOS, WR, 'el-mod'))!.history).toHaveLength(1);
  });
});

describe('the default is never a combination', () => {
  it('no choice: the enrolment\'s variety alone; else the one studied; else the language\'s default', () => {
    expect(resolveScope({ languageId: 'el', enrolmentVarietyId: 'el-koi', deck: greekDeck })?.varietyIds).toEqual(['el-koi']);
    expect(resolveScope({ languageId: 'el', deck: [] })?.varietyIds).toEqual(['el-mod']);
    const biblicalOnly = deckOf([cardAdded('lemma:he:מלך:NOUN', { at: day(5), variety: 'he-bib' })], 'he');
    expect(resolveScope({ languageId: 'he', deck: biblicalOnly })?.varietyIds).toEqual(['he-bib']);
    expect(resolveScope({ languageId: 'de', deck: [] })).toBeUndefined();
  });

  it('a chosen scope is honoured, several varieties only when named', () => {
    expect(resolveScope({ languageId: 'el', enrolmentVarietyId: 'el-mod', chosen: { varietyIds: ['el-att', 'el-koi'] }, deck: [] })).toEqual({ languageId: 'el', varietyIds: ['el-att', 'el-koi'], includeUnsettled: true });
    expect(resolveScope({ languageId: 'el', enrolmentVarietyId: 'el-koi', chosen: { varietyIds: ['nonsense'] }, deck: [] })?.varietyIds).toEqual(['el-koi']);
    expect(scopeSignature(scopeOf('el', 'el-koi', 'el-att'))).toBe('el:el-att+el-koi+unsettled');
    expect(scopeSignature(undefined)).toBe('');
  });

  it('a new card of a word takes the first scope variety the word is classified in, or none', () => {
    const row = (unit: string): UnitKnowledge => greekKnowledge.find((k) => k.unitId === unit)!;
    expect(taskVarietyOf(scopeOf('el', 'el-mod'), row(LOGOS))).toBe('el-mod');
    expect(taskVarietyOf(scopeOf('el', 'el-mod'), row(NOMOS))).toBeUndefined();
    expect(taskVarietyOf(scopeOf('el', 'el-mod'), row(OLD))).toBeUndefined();
    expect(taskVarietyOf(undefined, row(LOGOS))).toBeUndefined();
  });
});

describe('Test E: a deck from before varieties', () => {
  // everything this learner has is old: cards with the old id shape, stamped with whatever the enrolment was
  const reading = [...met(NOMOS, 'el-att', 1), ...met(THEOS, 'el-koi', 1), lookup(OLD, { at: day(2), weak: 'el-mod' }), lookup(SPITI, { at: day(2), weak: 'el-mod' })];
  const cards = [NOMOS, THEOS, OLD, SPITI].flatMap((unit, i) => [cardAdded(unit, { at: day(3, 10 + i), stamp: 'el-mod' }), cardReviewed(unit, 3, { at: day(4, 10 + i), stamp: 'el-mod' }), cardReviewed(unit, 4, { at: day(9, 10 + i), stamp: 'el-mod' })]);
  const deck = deckOf(cards, 'el');
  const knowledge = knowledgeOf([...reading, ...cards]);

  it('every card keeps its id, its history and its schedule: the fold is the one it always was', () => {
    expect(deck.map((i) => i.itemId).sort()).toEqual([NOMOS, THEOS, OLD, SPITI].map((u) => `card:${WR}:${u}`).sort());
    for (const item of deck) {
      expect(item.history.map((h) => h.rating)).toEqual([3, 4]);
      expect(item.schedule.reps).toBe(2);
      expect(Date.parse(item.schedule.due)).toBeGreaterThan(Date.parse(day(9)));
    }
    // classification adds a label and changes nothing else
    const stripped = classifyDeck(deck, knowledge).map(({ variety: _v, ...rest }) => rest);
    expect(stripped).toEqual(deck);
  });

  it('cards are assigned only where the evidence is sufficient; the rest are kept unsettled', () => {
    const variety = new Map(classifyDeck(deck, knowledge).map((i) => [i.unitId, i.variety]));
    expect(variety.get(NOMOS)).toEqual({ varietyId: 'el-att', basis: 'legacy' });
    expect(variety.get(THEOS)).toEqual({ varietyId: 'el-koi', basis: 'legacy' });
    expect(variety.get(OLD)).toEqual({ basis: 'unsettled' });   // not Modern Greek because the enrolment defaulted to it
    expect(variety.get(SPITI)).toEqual({ basis: 'unsettled' });
  });

  it('the learner\'s default queue still holds every unsettled card, and no second card is made for any old one', () => {
    const scope = resolveScope({ languageId: 'el', enrolmentVarietyId: 'el-mod', deck })!;
    const scoped = scopeReview({ languageId: 'el', scope, deck, candidates: [NOMOS, THEOS, OLD, SPITI].map((unitId) => candidate({ unitId, kind: 'lexeme' })), knowledge });
    expect(scoped.deck.map((i) => i.unitId).sort()).toEqual([OLD, SPITI].sort());
    expect(scoped.excluded.filter((x) => x.itemId).map((x) => x.unitId).sort()).toEqual([NOMOS, THEOS].sort()); // kept, in their own varieties' queues
    const outcomes = outcomesOf(scoped);
    expect(outcomes.filter((o) => o.decision === 'test-now')).toEqual([]);
    expect(outcomes.map((o) => [o.unitId, o.decision])).toEqual([[OLD, 'already-covered'], [SPITI, 'already-covered']]);
    // and the Classical queue holds the old Classical card under its old id, with its whole history
    const classical = scopeReview({ languageId: 'el', scope: scopeOf('el', 'el-att'), deck, candidates: [candidate({ unitId: NOMOS, kind: 'lexeme' })], knowledge });
    expect(classical.deck.find((i) => i.unitId === NOMOS)).toMatchObject({ itemId: `card:${WR}:${NOMOS}`, history: [{ rating: 3 }, { rating: 4 }] });
    expect(outcomesOf(classical).map((o) => o.decision)).toEqual(['already-covered']);
  });

  it('rows from a service that does not yet record varieties leave everything where it was', () => {
    const plain = knowledge.map(({ varieties: _v, unclassified: _u, sources: _s, ...row }) => row as UnitKnowledge);
    const scope = resolveScope({ languageId: 'el', enrolmentVarietyId: 'el-mod', deck })!;
    const scoped = scopeReview({ languageId: 'el', scope, deck, candidates: [candidate({ unitId: NEO, kind: 'lexeme' })], knowledge: plain });
    expect(scoped.deck).toHaveLength(deck.length); // every old card is unsettled and stays in the queue
    expect(scoped.candidates.map((c) => [c.unitId, c.varietyId])).toEqual([[NEO, undefined]]);
    expect(scoped.knowledge).toEqual(plain);
  });
});

describe('Test F: scheduling is what it was', () => {
  const many = (variety: string, count: number, prefix: string, reviewed = true): GoEvent[] => Array.from({ length: count }, (_, i) => `lemma:el:${prefix}${i}:NOUN`).flatMap((unit, i) => [
    cardAdded(unit, { at: day(1, 1 + (i % 20)), variety }), ...(reviewed ? [cardReviewed(unit, 3, { at: day(2, 1 + (i % 20)), variety })] : []),
  ]);

  it('a scoped plan is the plan of the same cards: scoping decides what is given, never how it is ordered or limited', () => {
    const cards = [...many('el-att', 14, 'α'), ...many('el-mod', 14, 'μ')];
    const deck = deckOf(cards, 'el');
    const scoped = scopeReview({ languageId: 'el', scope: scopeOf('el', 'el-att'), deck, candidates: [], knowledge: [] });
    const p = { preferences: prefs({ languageId: 'el', sessionMinutes: 0, cardsPerDeck: 10 }), audio: audioOk, scheduler: fsrs, now: NOW, random: () => 0.5, intake: [] };
    const plain = planSession({ ...p, deck: deck.filter((i) => i.varietyId === 'el-att') });
    const viaScope = planSession({ ...p, deck: scoped.deck });
    expect(viaScope.items.map((x) => x.item.itemId)).toEqual(plain.items.map((x) => x.item.itemId));
    expect(viaScope.items).toHaveLength(10);            // the deck size holds
    expect(viaScope.dueCount).toBe(plain.dueCount);
    expect(viaScope.availableWork).toEqual(plain.availableWork);
  });

  it('a short queue is never filled from another variety', () => {
    const cards = [...many('el-att', 2, 'α'), ...many('el-mod', 20, 'μ')];
    const scoped = scopeReview({ languageId: 'el', scope: scopeOf('el', 'el-att'), deck: deckOf(cards, 'el'), candidates: [], knowledge: [] });
    const plan = planSession({ deck: scoped.deck, intake: [], preferences: prefs({ languageId: 'el', sessionMinutes: 0, cardsPerDeck: 10 }), audio: audioOk, scheduler: fsrs, now: NOW, random: () => 0.5 });
    expect(plan.items).toHaveLength(2);
    expect(plan.items.every((x) => x.item.varietyId === 'el-att')).toBe(true);
  });

  it('a card just answered Easy is not asked again, in scope or out of it', () => {
    const unit = 'lemma:el:εὖ:ADV';
    const cards = [cardAdded(unit, { at: day(1), variety: 'el-att' }), cardReviewed(unit, 4, { at: '2026-10-20T09:55:00.000Z', variety: 'el-att' })];
    const scoped = scopeReview({ languageId: 'el', scope: scopeOf('el', 'el-att'), deck: deckOf(cards, 'el'), candidates: [], knowledge: [] });
    expect(Date.parse(scoped.deck[0]!.schedule.due)).toBeGreaterThan(Date.parse(NOW));
    const plan = planSession({ deck: scoped.deck, intake: [], preferences: prefs({ languageId: 'el', sessionMinutes: 0 }), audio: audioOk, scheduler: fsrs, now: NOW, random: () => 0.5, fillPool: [] });
    expect(plan.items).toEqual([]);
  });

  it('new cards stay within the new-card limit, one new card per word in a batch, across varieties', () => {
    const words = Array.from({ length: 8 }, (_, i) => `lemma:el:καινός${i}:ADJ`);
    const reading = words.flatMap((unit) => [...met(unit, 'el-att', 1), ...met(unit, 'el-koi', 2)]);
    const knowledge = knowledgeOf(reading);
    const scope = scopeOf('el', 'el-att', 'el-koi');
    const scoped = scopeReview({ languageId: 'el', scope, deck: [], candidates: words.map((unitId) => candidate({ unitId, kind: 'lexeme' })), knowledge });
    const plan = planSession({ deck: scoped.deck, intake: outcomesOf(scoped), preferences: prefs({ languageId: 'el', sessionMinutes: 0, maxNew: 3, cardsPerDeck: 20 }), audio: audioOk, scheduler: fsrs, now: NOW,
      random: () => 0.5, knowledge: scoped.knowledge });
    expect(plan.newCount).toBeLessThanOrEqual(3);
    expect(plan.items.length).toBeLessThanOrEqual(3);
    expect(new Set(plan.items.map((x) => x.item.unitId)).size).toBe(plan.items.length);
    expect(plan.items.every((x) => x.item.itemId.includes('@el-koi:'))).toBe(true);
  });

  it('suspended and dismissed cards stay out, and a dismissed word is not proposed again in its variety', () => {
    const removal = (unit: string, reason: 'suspended' | 'dismissed', variety: string): GoEvent => ({
      ...cardAdded(unit, { at: day(8), variety }), id: `x-${unit}-${reason}`, kind: 'CardRemoved', subject: { cardId: cardIdFor(unit, WR, variety) }, payload: { reason },
    });
    const cards = [...greekCards, removal(LOGOS, 'suspended', 'el-att'), removal(SPITI, 'dismissed', 'el-mod')];
    const deck = deckOf(cards, 'el');
    const attic = scopeReview({ languageId: 'el', scope: scopeOf('el', 'el-att'), deck, candidates: greekCandidates, knowledge: greekKnowledge });
    expect(planOf(attic).items.map((p) => p.item.itemId)).not.toContain(cardIdFor(LOGOS, WR, 'el-att'));
    expect(outcomesOf(attic).find((o) => o.unitId === LOGOS)?.decision).toBe('already-covered'); // suspended: resume it, do not add another
    const modern = scopeReview({ languageId: 'el', scope: scopeOf('el', 'el-mod'), deck, candidates: greekCandidates, knowledge: greekKnowledge });
    expect(planOf(modern).items.map((p) => p.item.unitId)).not.toContain(SPITI);
    expect(outcomesOf(modern).find((o) => o.unitId === SPITI)?.decision).toBe('low-priority');
    // the Modern card of λόγος is untouched by the suspension of its Classical card
    expect(modern.deck.find((i) => i.itemId === cardIdFor(LOGOS, WR, 'el-mod'))?.status).toBe('active');
  });

  it('a word Automatic in Biblical Hebrew is not suppressed in Modern Hebrew, and its familiarity only orders new cards', () => {
    const A = 'lemma:he:אב:NOUN', B = 'lemma:he:בן:NOUN';
    const reading = [...met(A, 'he-bib', 1, 'automatic'), ...met(A, 'he-mod', 5, 'recognized', 'analysed'), ...met(B, 'he-mod', 5, 'recognized', 'analysed')];
    const knowledge = knowledgeOf(reading);
    const scoped = scopeReview({ languageId: 'he', scope: scopeOf('he', 'he-mod'), deck: [], candidates: [B, A].map((unitId) => candidate({ unitId, kind: 'lexeme', score: 0.7 })), knowledge });
    const outcomes = outcomesOf(scoped, 'he');
    expect(outcomes.map((o) => [o.unitId, o.decision])).toEqual([[B, 'test-now'], [A, 'test-now']]); // Automatic elsewhere suppresses nothing here
    const plan = planSession({ deck: [], intake: outcomes, preferences: prefs({ languageId: 'he', sessionMinutes: 0, maxNew: 5 }), audio: audioOk, scheduler: fsrs, now: NOW, random: () => 0.5,
      knowledge: scoped.knowledge, transfer: scoped.transfer });
    // equal scores: the word already known in a related variety is introduced first, and says so; nothing about its schedule differs
    expect(plan.items.map((p) => p.item.unitId)).toEqual([A, B]);
    expect(plan.items[0]!.transfer?.[0]).toMatchObject({ fromVarietyId: 'he-bib', level: 'automatic', strength: 'moderate' });
    expect(plan.items[0]!.why.join(' ')).toContain('known in he-bib');
    expect(plan.items[0]!.item.schedule).toEqual(plan.items[1]!.item.schedule);
    expect(plan.items[0]!.item.history).toEqual([]);
    expect(plan.items[1]!.transfer).toBeUndefined();
  });
});
