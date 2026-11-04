/**
 * Deck fill (2026-11-03). An automatic deck is completed to the learner's deck size with early practice of cards that are not yet due:
 * `intent: { kind: 'explicit', reason: 'early-review' }`, `presentationReason: 'deck-fill'`. Through the real fold and the real budget:
 * a Good/Easy answer keeps the card's schedule (history entry `earlyPractice: true`), an Again is an ordinary lapse, and none of it
 * spends the day's new-word allowance.
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { createFsrsScheduler, foldDeck, foldDeckItems, itemIdFor } from '../../../packages/goreview/src/scheduler';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import { admissionBudget } from '../../../packages/goreview/src/planner/budget';
import { audioOk, prefs } from '../intake/fixtures';
import { added, at, DAY, LEARNER, reviewed, T0 } from './helpers';

const sched = createFsrsScheduler();
const HOUR = 3_600_000;
const MIN = 60_000;
const unitOf = (name: string) => `lex:${name}`;
const idOf = (name: string) => itemIdFor(unitOf(name), 'written-recognition');
/** The event the runner writes for a deck-fill card: the planner's intent copied to `practiceIntent` (runner.ts: `e.payload.practiceIntent = clone(cur.planned.intent)`). */
const fillIntent = (when: string) => ({ kind: 'explicit', reason: 'early-review', requestedAt: when });
const fillAnswer = (name: string, when: string, rating: 1 | 3 | 4): GoEvent =>
  reviewed(idOf(name), when, rating, { extra: { practiceIntent: fillIntent(when), presentationReason: 'deck-fill', overlap: 'explicit' } });

// A card first answered Easy at DAY (09:00 the next day): a long interval, so a review two hours later is well before the due time.
const FIRST = at(DAY);
const EARLY = at(DAY + 2 * HOUR); // same UTC day as the first answer
const firstEvents = (name: string): GoEvent[] => [added(unitOf(name), T0), reviewed(idOf(name), FIRST, 4)];
const foldOne = (events: GoEvent[], now = EARLY) => foldDeck(events, sched, { languageId: 'grc', now }).items.find((i) => i.itemId === events.find((e) => e.kind === 'CardAdded')!.subject.cardId)!;

describe('deck-fill answers through the real fold', () => {
  it('precondition: the card has history and is not due at the review time', () => {
    const base = foldOne(firstEvents('good'));
    expect(base.history).toHaveLength(1);
    expect(Date.parse(base.schedule.due)).toBeGreaterThan(Date.parse(EARLY));
  });

  it('1. Good keeps due, phase and stability and the history entry is earlyPractice', () => {
    const base = foldOne(firstEvents('good'));
    const answer = fillAnswer('good', EARLY, 3);
    const after = foldOne([...firstEvents('good'), answer]);
    expect(after.schedule.due).toBe(base.schedule.due);
    expect(after.schedule.phase).toBe(base.schedule.phase);
    expect(after.schedule.stability).toBe(base.schedule.stability);
    expect(after.schedule).toEqual(base.schedule);
    expect(after.history).toHaveLength(2);
    expect(after.history[1]).toMatchObject({ eventId: answer.id, rating: 3, earlyPractice: true });
    expect(after.history[1]!.scheduleExcluded).toBeUndefined();
  });

  it('2. Easy keeps due, phase and stability and the history entry is earlyPractice', () => {
    const base = foldOne(firstEvents('easy'));
    const answer = fillAnswer('easy', EARLY, 4);
    const after = foldOne([...firstEvents('easy'), answer]);
    expect(after.schedule.due).toBe(base.schedule.due);
    expect(after.schedule.phase).toBe(base.schedule.phase);
    expect(after.schedule.stability).toBe(base.schedule.stability);
    expect(after.schedule).toEqual(base.schedule);
    expect(after.history[1]).toMatchObject({ eventId: answer.id, rating: 4, earlyPractice: true });
  });

  it('3. Again reschedules as a lapse: due changes, phase is relearning, no earlyPractice flag', () => {
    const base = foldOne(firstEvents('again'));
    const answer = fillAnswer('again', EARLY, 1);
    const after = foldOne([...firstEvents('again'), answer]);
    expect(after.schedule.due).not.toBe(base.schedule.due);
    expect(Date.parse(after.schedule.due)).toBeLessThan(Date.parse(base.schedule.due));
    expect(after.schedule.phase).toBe('relearning');
    expect(after.schedule).toEqual(sched.review(base.schedule, 1, EARLY));
    expect(after.history[1]!.earlyPractice).toBeUndefined();
    expect(after.history[1]).toMatchObject({ eventId: answer.id, rating: 1 });
  });

  it('4. the new-word allowance used is the same before and after the three fill answers', () => {
    const cards = ['good', 'easy', 'again'].flatMap(firstEvents);
    const fills = [fillAnswer('good', EARLY, 3), fillAnswer('easy', at(DAY + 2 * HOUR + MIN), 4), fillAnswer('again', at(DAY + 2 * HOUR + 2 * MIN), 1)];
    const now = at(DAY + 3 * HOUR);
    const input = { learnerId: LEARNER, languageId: 'grc', now, maxNew: 5, dailyNewLimit: 5 };
    const before = admissionBudget(cards, input), after = admissionBudget([...cards, ...fills], input);
    // the three first answers are introductions of the day (same UTC day); the fill answers are not
    expect(before.used).toBe(3);
    expect(after.used).toBe(before.used);
    expect(after.remaining).toBe(before.remaining);
    // and an explicit answer on a later day of a card first answered earlier spends nothing either
    const nextDay = { ...input, now: at(2 * DAY + 3 * HOUR) };
    const laterFill = fillAnswer('good', at(2 * DAY + 2 * HOUR), 3);
    expect(admissionBudget([...cards, laterFill], nextDay).used).toBe(0);
  });
});

describe('deck-fill plan through the real fold and planner', () => {
  it('one due card and three not-due cards at cardsPerDeck 4: three deck-fill items with explicit early-review intent', () => {
    const now = at(3 * DAY);
    const events: GoEvent[] = [
      added(unitOf('due'), T0), reviewed(idOf('due'), at(DAY), 3), // a Good first answer: a short learning step, due long before `now`
      ...['n1', 'n2', 'n3'].flatMap((n) => [added(unitOf(n), T0), reviewed(idOf(n), at(3 * DAY - 2 * HOUR), 4)]), // Easy two hours ago: not due
    ];
    const deck = foldDeckItems(events, sched, { languageId: 'grc', now });
    expect(deck.filter((i) => sched.isDue(i.schedule, now)).map((i) => i.unitId)).toEqual([unitOf('due')]);
    const plan = planSession({ deck, intake: [], preferences: prefs({ languageId: 'grc', cardsPerDeck: 4, sessionMinutes: 0, maxNew: 0 }), audio: audioOk, scheduler: sched, now, readingSignals: events, learnerId: LEARNER, random: () => 0.1 });
    expect(plan.items).toHaveLength(4);
    const fill = plan.items.filter((p) => p.presentationReason === 'deck-fill');
    expect(fill.map((p) => p.item.unitId).sort()).toEqual([unitOf('n1'), unitOf('n2'), unitOf('n3')]);
    expect(plan.items.filter((p) => p.presentationReason !== 'deck-fill').map((p) => p.item.unitId)).toEqual([unitOf('due')]);
    for (const p of fill) {
      expect(p.isNew).toBe(false);
      expect(p.intent).toEqual({ kind: 'explicit', reason: 'early-review', requestedAt: now });
    }
    expect(plan.newCount).toBe(0);
    // the runner copies the planned intent into the review event, so the fold treats the Good answer as early practice
    const runnerEvent = reviewed(fill[0]!.item.itemId, at(3 * DAY + MIN), 3);
    runnerEvent.payload.practiceIntent = structuredClone(fill[0]!.intent);
    expect(runnerEvent.payload.practiceIntent).toMatchObject({ kind: 'explicit', reason: 'early-review' });
    const folded = foldDeck([...events, runnerEvent], sched, { languageId: 'grc', now: at(3 * DAY + MIN) }).items.find((i) => i.itemId === fill[0]!.item.itemId)!;
    expect(folded.history.at(-1)).toMatchObject({ eventId: runnerEvent.id, earlyPractice: true });
    expect(folded.schedule).toEqual(deck.find((i) => i.itemId === folded.itemId)!.schedule);
  });
});
