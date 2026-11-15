/**
 * Living beside the rest of the ecosystem in one event log: the level a learner is SHOWN follows the shared display rule, and
 * the cards of GoReview's own built-in decks (the Alphabet letters) in the same language are recognised and left alone.
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { displayLevelOf, validateEvent } from '../../packages/repository-contract/src';
import { buildCardAdded, itemIdFor } from '../../packages/goreview/src/scheduler/deck';
import { createFsrsScheduler } from '../../packages/goreview/src/scheduler/fsrs';
import { GREEK } from '../../packages/goreview-ecclesia/src/languages';
import { isBuiltinDeckUnit, isVocabularyUnit, unitClassOf } from '../../packages/goreview-ecclesia/src/identity';
import { mapEncounters } from '../../packages/goreview-ecclesia/src/encounters';
import { cardSchedules, knowledgeRows, knowledgeStandings, levelDistribution, listedVocabulary } from '../../packages/goreview-ecclesia/src/profile';
import { composeSession, readingCandidates } from '../../packages/goreview-ecclesia/src/session';
import { JOHN_1, JOHN_1_1_18, lexemeOf, passage } from './fixtures/greek-john';

const identity = { learnerId: 'L-eco', enrolmentId: 'E', deviceId: 'D' };
const scope = { learnerId: identity.learnerId, languageId: 'el' };
const T = (m: number): string => new Date(Date.parse('2026-11-14T09:00:00.000Z') + m * 60_000).toISOString();
const v1 = JOHN_1_1_18.verses[0]!;
const LOGOS = lexemeOf('λόγος', 'NOUN'), THEOS = lexemeOf('θεός', 'NOUN');
const ALPHA = 'class:el-alphabet:α';

/** A reading: verse 1 shown, λόγος looked up. */
const reading = (): GoEvent[] => mapEncounters([
  { kind: 'passage-viewed', encounterId: 'e:1', at: T(0), passage: JOHN_1, verses: passage(1, 1).verses },
  { kind: 'word-selected', encounterId: 'e:2', at: T(1), passage: JOHN_1, verse: 1, token: v1.tokens[4]! },
], { profile: GREEK, identity }).flatMap((m) => m.events);

/** An Alphabet-deck card and one review of it, as GoReview records them (ordinary review events against a `class:` unit). */
function alphabetEvents(): GoEvent[] {
  const card = itemIdFor(ALPHA, 'written-recognition');
  const added = buildCardAdded({ learnerId: identity.learnerId, enrolmentId: identity.enrolmentId, languageId: 'el', at: T(2), deviceId: 'D', unitId: ALPHA, unitKind: 'class', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'learner' });
  const reviewed: GoEvent = {
    id: 'alpha-review-1', v: 3, learnerId: identity.learnerId, enrolmentId: identity.enrolmentId, languageId: 'el', at: T(3),
    producer: { app: 'gopractice-review', version: 'test', deviceId: 'D' }, kind: 'CardReviewed', subject: { cardId: card, itemIds: [ALPHA] },
    payload: { cardKind: 'recognition', family: 'written-recognition', assessmentDimension: 'written-recognition', rating: 3, grade: 'good', correct: true, outcome: 'correct', responseMode: 'typed', hinted: false, retrievalAttempted: true, expectedPreviousReviewId: null },
    evidence: { quality: 'moderate', sourceReliability: 1 },
  };
  for (const e of [added, reviewed]) expect(validateEvent(e), e.id).toEqual([]);
  return [added, reviewed];
}

describe('the level a learner is shown', () => {
  it('a word only met in passing is shown as New; a word looked up is shown as Seen (the shared display rule)', () => {
    const standings = knowledgeStandings(reading(), scope);
    const theos = standings.get(THEOS)!, logos = standings.get(LOGOS)!;
    expect(theos).toMatchObject({ level: 'seen', shownLevel: 'new', unitClass: 'lexeme' });
    expect(logos).toMatchObject({ level: 'seen', shownLevel: 'seen', lookups: 1 });
    // the same function every other app uses, on the same rows
    for (const row of knowledgeRows(reading(), scope)) expect(standings.get(row.unitId)!.shownLevel).toBe(displayLevelOf(row));
  });
  it('lists and counts for a learner use the shown level; estimates keep the Repository level', () => {
    const standings = knowledgeStandings(reading(), scope);
    const listed = listedVocabulary(standings).map((s) => s.unitId);
    expect(listed.sort()).toEqual([LOGOS, 'form:el:λόγος'].sort());
    const byLevel = levelDistribution(standings), byShown = levelDistribution(standings, { by: 'shown' });
    expect(byLevel.new).toBe(0);
    expect(byShown.seen).toBe(2);
    expect(byShown.new).toBe(byLevel.seen - 2);
    expect(byShown.new + byShown.seen).toBe(byLevel.seen);
  });
  it('a completed passage is not "in passing": its words are shown as they stand', () => {
    const events = [...reading(), ...mapEncounters([{ kind: 'passage-completed', encounterId: 'e:3', at: T(5), passage: JOHN_1, verses: passage(1, 1).verses, helpUsed: false }], { profile: GREEK, identity }).flatMap((m) => m.events)];
    expect(knowledgeStandings(events, scope).get(THEOS)).toMatchObject({ level: 'recognized', shownLevel: 'recognized' });
  });
});

describe('beside GoReview’s Alphabet deck in the same language', () => {
  const events = [...reading(), ...alphabetEvents()];

  it('recognises what a unit id names', () => {
    expect(unitClassOf(LOGOS)).toBe('lexeme');
    expect(unitClassOf('form:el:λόγος')).toBe('form');
    expect(unitClassOf('morph:el:NOUN:Case=Nom')).toBe('construction');
    expect(unitClassOf(ALPHA)).toBe('alphabet');
    expect(unitClassOf('class:he-alphabet:א')).toBe('alphabet');
    expect(unitClassOf('class:el-essentials:1')).toBe('other');
    expect(isVocabularyUnit(ALPHA)).toBe(false);
    expect(isBuiltinDeckUnit(ALPHA)).toBe(true);
    expect(isBuiltinDeckUnit(LOGOS)).toBe(false);
  });
  it('a reviewed letter is in the log but is not a word: not listed, not counted, not proposed', () => {
    const standings = knowledgeStandings(events, scope);
    expect(standings.get(ALPHA)).toMatchObject({ unitClass: 'alphabet' });
    expect(listedVocabulary(standings).some((s) => s.unitId === ALPHA)).toBe(false);
    const words = levelDistribution(standings), all = levelDistribution(standings, { vocabularyOnly: false });
    expect(Object.values(all).reduce((a, b) => a + b, 0)).toBeGreaterThan(Object.values(words).reduce((a, b) => a + b, 0));
    const candidates = readingCandidates({ profile: GREEK, events, rows: knowledgeRows(events, scope), deck: [] });
    expect(candidates.some((c) => c.unitId === ALPHA)).toBe(false);
  });
  it('its card is visible with its class and is left out of an Ecclesia session', () => {
    const scheduler = createFsrsScheduler();
    const later = T(60 * 24 * 3);
    const schedules = cardSchedules(events, scheduler, { ...scope, now: later });
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ unitId: ALPHA, unitClass: 'alphabet', isDue: true });
    const s = composeSession({ profile: GREEK, identity, events, now: later, scheduler, random: () => 0.3 });
    expect(s.outsideScope).toEqual([schedules[0]!.cardId]);
    expect(s.deck.some((d) => d.unitId === ALPHA)).toBe(false);
    expect(s.plan.items.some((p) => p.item.unitId === ALPHA)).toBe(false);
  });
});
