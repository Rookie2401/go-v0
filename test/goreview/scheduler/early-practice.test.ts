/**
 * Explicit practice (a saved deck, selected words, Repeat this batch) of a card that is not yet due keeps the card's schedule: the
 * answer stays in the causal chain and in the Repository's evidence, but a success skips no learning step and grows no interval
 * from a repetition minutes apart. A failure is a lapse wherever it happens; the first answer of a fresh card and any answer at or
 * after the due time schedule as usual (the owner's brief, 2026-10-29: one memory history, actual elapsed time).
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { createFsrsScheduler, foldDeck, itemIdFor } from '../../../packages/goreview/src/scheduler';
import { added, at, DAY, reviewed, T0 } from './helpers';

const ID = itemIdFor('lex:logos', 'written-recognition');
const MIN = 60_000;
const explicit = (e: GoEvent, reason: 'saved-deck' | 'selected-vocabulary' | 'early-review' = 'saved-deck'): GoEvent =>
  ({ ...e, payload: { ...e.payload, practiceIntent: { kind: 'explicit', reason, requestedAt: e.at } } });
const events = (...rest: GoEvent[]): GoEvent[] => [added('lex:logos', T0), ...rest];

describe('explicit practice before a card is due', () => {
  it('a success minutes after a learning step keeps the schedule and stays in the chain; a failure is a lapse; at the due time it schedules as usual', () => {
    const s = createFsrsScheduler();
    const first = reviewed(ID, at(DAY), 3);
    const base = foldDeck(events(first), s, { now: at(2 * DAY) }).items[0]!;
    expect(Date.parse(base.schedule.due)).toBeGreaterThan(Date.parse(first.at));

    const early = explicit(reviewed(ID, at(DAY + 2 * MIN), 3));
    const kept = foldDeck(events(first, early), s, { now: at(2 * DAY) }).items[0]!;
    expect(kept.schedule).toEqual(base.schedule);
    expect(kept.history).toHaveLength(2);
    expect(kept.history[1]).toMatchObject({ eventId: early.id, earlyPractice: true, rating: 3 });
    expect(kept.history[1]!.scheduleExcluded).toBeUndefined();
    expect(kept.status).toBe('active');

    const lapse = explicit(reviewed(ID, at(DAY + 3 * MIN), 1));
    const lapsed = foldDeck(events(first, early, lapse), s, { now: at(2 * DAY) }).items[0]!;
    expect(lapsed.schedule).toEqual(s.review(base.schedule, 1, lapse.at));
    expect(lapsed.history[2]!.earlyPractice).toBeUndefined();

    const onTime = explicit(reviewed(ID, new Date(Date.parse(base.schedule.due) + MIN).toISOString(), 3));
    const scheduled = foldDeck(events(first, onTime), s, { now: at(2 * DAY) }).items[0]!;
    expect(scheduled.schedule).toEqual(s.review(base.schedule, 3, onTime.at));
    expect(scheduled.history[1]!.earlyPractice).toBeUndefined();
  });

  it('the first answer of a fresh card schedules it whatever asked for the practice; an automatic early answer (a timed return) is untouched', () => {
    const s = createFsrsScheduler();
    const firstExplicit = explicit(reviewed(ID, at(DAY), 3), 'selected-vocabulary');
    const fresh = foldDeck(events(firstExplicit), s, { now: at(2 * DAY) }).items[0]!;
    expect(fresh.schedule).toEqual(s.review(s.newState(T0), 3, firstExplicit.at));
    expect(fresh.history[0]!.earlyPractice).toBeUndefined();

    const first = reviewed(ID, at(DAY), 3), second = reviewed(ID, at(DAY + 2 * MIN), 3);
    const auto = foldDeck(events(first, second), s, { now: at(2 * DAY) }).items[0]!;
    expect(auto.schedule).toEqual(s.review(s.review(s.newState(T0), 3, first.at), 3, second.at));
    expect(auto.history.every((h) => h.earlyPractice === undefined)).toBe(true);
  });

  it('a later ordinary review follows the kept answer in the chain: the early answer is its predecessor and nothing is excluded', () => {
    const s = createFsrsScheduler();
    const first = reviewed(ID, at(DAY), 3);
    const early = explicit(reviewed(ID, at(DAY + 2 * MIN), 3));
    const base = foldDeck(events(first, early), s, { now: at(3 * DAY) }).items[0]!;
    const later = { ...reviewed(ID, at(2 * DAY), 3), payload: { ...reviewed(ID, at(2 * DAY), 3).payload, expectedPreviousReviewId: early.id } };
    const fold = foldDeck(events(first, early, later), s, { now: at(3 * DAY) }).items[0]!;
    expect(fold.history.map((h) => h.scheduleExcluded ?? null)).toEqual([null, null, null]);
    expect(fold.schedule).toEqual(s.review(base.schedule, 3, later.at));
  });
});
