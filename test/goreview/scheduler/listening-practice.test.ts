/**
 * Listening practice with a computer voice (2026-10-29). A `ListeningAssessed` event answered to a synthetic or unreviewed voice carries
 * evidence quality 'none' (it is never listening knowledge) but, when stamped `payload.listeningPractice`, it still moves the card's own
 * FSRS schedule, so the card comes back on its interval instead of being re-planned as fresh work in every session (the defect: a card
 * whose answers never rated had an empty effective history, was `new in the deck` forever and consumed the new-card allowance each time).
 * Every reader of ratings that is not the scheduler must leave such an event alone: the Repository's evidence weights (quality none),
 * learning metrics, the micro-deck observations, the remediation backlog, the optimizer's reliable history.
 */
import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../../packages/repository-contract/src';
import { createFsrsScheduler, foldDeck, foldDeckItems, itemIdFor } from '../../../packages/goreview/src/scheduler';
import { learningMetrics } from '../../../packages/goreview/src/transfer/learning-metrics';
import { microdeckObservations, planSession } from '../../../packages/goreview/src/planner/planner';
import { remediationBacklog } from '../../../packages/goreview/src/planner/remediation';
import { reliableReviewHistory } from '../../../server/review/optimizer';
import { foldEvents } from '../../../packages/repository-engine/src/projection';
import { audioOk, knowledge, prefs } from '../intake/fixtures';
import { added, at, DAY, LEARNER, reviewed, T0 } from './helpers';

const sched = createFsrsScheduler();
const UNIT = 'lex:akouo';
const ID = itemIdFor(UNIT, 'auditory-recognition');
const practice = (when: string, rating: 1 | 2 | 3 | 4, flag = true) => {
  const e = reviewed(ID, when, rating, { kind: 'ListeningAssessed', extra: { family: 'audio-to-meaning', assessmentDimension: 'auditory-recognition', retrievalAttempted: true, ...(flag ? { listeningPractice: true } : {}) } });
  e.subject = { cardId: ID, itemIds: [UNIT] };
  e.evidence = { quality: 'none', assisted: false };
  return e;
};
const card = () => added(UNIT, T0, { dimension: 'auditory-recognition', family: 'audio-to-meaning' });

describe('listening practice with a computer voice', () => {
  it('a rated quality-none event stamped listeningPractice schedules the card; without the stamp it is unscored, as before', () => {
    const flagged = foldDeck([card(), practice(at(DAY), 3)], sched, { languageId: 'grc', now: at(2 * DAY) });
    const item = flagged.items[0]!;
    expect(item.history).toHaveLength(1);
    expect(item.history[0]).toMatchObject({ rating: 3, listeningPractice: true });
    expect(item.history[0]!.scheduleExcluded).toBeUndefined();
    expect(item.schedule.phase).not.toBe('new');
    expect(Date.parse(item.schedule.due)).toBeGreaterThan(Date.parse(at(DAY)));
    expect(flagged.unscored[ID]).toBeUndefined();

    const plain = foldDeck([card(), practice(at(DAY), 3, false)], sched, { languageId: 'grc', now: at(2 * DAY) });
    expect(plain.items[0]!.history).toHaveLength(0);
    expect(plain.unscored[ID]).toBe(1);
  });

  it('the event is a valid Repository event', () => {
    expect(validateEvent(practice(at(DAY), 3))).toEqual([]);
  });

  it('in a causal chain (as the runner records it) the practice event is a link: it schedules, and a later real answer whose predecessor it is schedules too', () => {
    // the first failure was found in the app: the contract classifier refused the quality-none event as a chain member, the fold
    // excluded it as "causal predecessor chain is unresolved", and the card kept its old due time (and came back at once)
    const first = reviewed(ID, at(DAY), 1, { kind: 'ListeningAssessed', extra: { family: 'audio-to-meaning', assessmentDimension: 'auditory-recognition', retrievalAttempted: true, expectedPreviousReviewId: null } });
    first.subject = { cardId: ID, itemIds: [UNIT] }; first.evidence = { quality: 'moderate', assisted: false };
    const second = practice(at(2 * DAY), 3); second.payload.expectedPreviousReviewId = first.id;
    const third = reviewed(ID, at(10 * DAY), 3, { kind: 'ListeningAssessed', extra: { family: 'audio-to-meaning', assessmentDimension: 'auditory-recognition', retrievalAttempted: true, expectedPreviousReviewId: second.id } });
    third.subject = { cardId: ID, itemIds: [UNIT] }; third.evidence = { quality: 'moderate', assisted: false };
    const fold = foldDeck([card(), first, second, third], sched, { languageId: 'grc', now: at(11 * DAY) });
    expect(fold.ignored).toEqual([]);
    expect(fold.items[0]!.history.map((h) => [h.rating, h.scheduleExcluded ?? null, h.listeningPractice ?? false])).toEqual([[1, null, false], [3, null, true], [3, null, false]]);
    expect(fold.items[0]!.schedule.reps).toBe(3);
    // the Repository's projection reads no knowledge from the practice link
    const withPractice = foldEvents([card(), first, second, third], { modelVersion: 'test' });
    const without = foldEvents([card(), first, { ...third, payload: { ...third.payload, expectedPreviousReviewId: first.id } }], { modelVersion: 'test' });
    expect(withPractice).toEqual(without); // the practice link adds no observation to the knowledge rows
  });

  it('after a practice answer the card is not fresh work any more: the planner leaves it until it is due', () => {
    const events = [card(), practice(at(DAY), 3)];
    const deck = foldDeckItems(events, sched, { languageId: 'grc', now: at(DAY + 60_000) });
    const soon = planSession({ deck, intake: [], preferences: prefs({ languageId: 'grc', includeListening: true }), audio: audioOk, scheduler: sched, now: at(DAY + 60_000), readingSignals: events, learnerId: LEARNER, random: () => 0.1 });
    expect(soon.items).toHaveLength(0);
    expect(soon.skipped.map((s) => s.why)).toContain('not due; optional remediation is separate from scheduled review');
    // and before the fix shape (no history) it was planned as new every time
    // (the app hands the planner the Repository's knowledge row for every deck unit; a Familiar word is admissible as new work)
    const familiar = { ...knowledge(UNIT), languageId: 'grc', level: 'familiar' as const, encounters: 4 };
    const unscored = foldDeckItems([card(), practice(at(DAY), 3, false)], sched, { languageId: 'grc', now: at(DAY + 60_000) });
    const again = planSession({ deck: unscored, intake: [], knowledge: [familiar], preferences: prefs({ languageId: 'grc', includeListening: true }), audio: audioOk, scheduler: sched, now: at(DAY + 60_000), readingSignals: events, learnerId: LEARNER, random: () => 0.1 });
    expect(again.items.map((p) => p.isNew)).toEqual([true]);
    const fixed = planSession({ deck, intake: [], knowledge: [familiar], preferences: prefs({ languageId: 'grc', includeListening: true }), audio: audioOk, scheduler: sched, now: at(DAY + 60_000), readingSignals: events, learnerId: LEARNER, random: () => 0.1 });
    expect(fixed.items).toHaveLength(0);
  });

  it('readers of ratings other than the scheduler ignore it: learning metrics, micro-deck observations, remediation, the optimizer history', () => {
    const withPractice = [card(), practice(at(DAY), 1), practice(at(2 * DAY), 3)];
    const scope = { learnerId: LEARNER, languageId: 'grc', now: at(3 * DAY) };
    const deck = foldDeckItems(withPractice, sched, { languageId: 'grc', now: scope.now });
    expect(deck[0]!.history).toHaveLength(2); // scheduled twice
    expect(learningMetrics(withPractice, deck, scope)).toMatchObject({ independentReviews: 0, delayedAttempts: 0, listeningAttempts: 0, repeatedFailureCards: 0, delayedFailed: 0 });
    expect(microdeckObservations(withPractice, 'grc', scope.now)).toEqual([]);
    expect(remediationBacklog(deck, withPractice, scope.now)).toEqual([]); // a practice Again is not a learner weakness
    const history = reliableReviewHistory(withPractice, 'grc');
    expect(history).toHaveLength(2);
    expect(history.every((r) => r.independent === false)).toBe(true); // never trains the FSRS parameters
  });
});
