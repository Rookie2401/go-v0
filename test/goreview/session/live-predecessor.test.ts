/**
 * A review is chained to the card's LIVE head, not to the plan's snapshot (2026-10-29). When the card was answered elsewhere after the
 * plan was made (another device, a saved deck opened in between), a review chained to the snapshot's head was excluded by the fold as a
 * stale sibling, so an Easy changed nothing and the card came back.
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { createFsrsScheduler, foldDeckItems, itemIdFor } from '../../../packages/goreview/src/scheduler';
import { createSessionRunner } from '../../../packages/goreview/src/session/runner';
import { createMemoryArea } from '../../../packages/repository-sync/src/area';
import { makePlan, fakeBuilders, fakeGrading, factsProvider, fakeAudioSource, IDENTITY, clock, right, simpleRecorder } from './helpers';
import { NOW } from '../intake/fixtures';

const UNIT = 'form:sq:u1';
const CARD = itemIdFor(UNIT, 'written-recognition');
const at = (minutesBefore: number): string => new Date(Date.parse(NOW) - minutesBefore * 60_000).toISOString();
const added = (): GoEvent => ({ id: 'add-u1', v: 3, learnerId: IDENTITY.learnerId, enrolmentId: IDENTITY.enrolmentId, languageId: 'sq', at: at(600), producer: { app: 'gopractice-review', version: 't', deviceId: 'D0' },
  kind: 'CardAdded', subject: { cardId: CARD, itemIds: [UNIT] }, payload: { unitId: UNIT, unitKind: 'form', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' }, evidence: { quality: 'none' } });
const review = (id: string, when: string, rating: 1 | 3, previous: string | null, deviceId = 'D0'): GoEvent => ({ id, v: 3, learnerId: IDENTITY.learnerId, enrolmentId: IDENTITY.enrolmentId, languageId: 'sq', at: when, producer: { app: 'gopractice-review', version: 't', deviceId },
  kind: 'CardReviewed', subject: { cardId: CARD, itemIds: [UNIT] }, payload: { cardKind: 'recognition', grade: rating === 1 ? 'again' : 'good', correct: rating > 1, hinted: false, rating, outcome: rating > 1 ? 'correct' : 'incorrect', family: 'written-recognition', expectedPreviousReviewId: previous }, evidence: { quality: 'moderate', assisted: false } });

describe('the review chains to the live head of the card', () => {
  it('an answer after another device reviewed the card names that review as its predecessor, and the fold keeps it effective', async () => {
    const scheduler = createFsrsScheduler();
    const old = review('r-old', at(300), 1, null);
    const elsewhere = review('r-elsewhere', at(20), 1, 'r-old', 'D-phone'); // after the plan below was made, on another device
    const log = [added(), old, elsewhere];
    const plan = makePlan({ due: 1 });
    // the plan's snapshot of the card knows only the old review
    plan.items[0]!.item = { ...plan.items[0]!.item, itemId: CARD, unitId: UNIT, history: [{ at: old.at, rating: 1, outcome: 'incorrect', deviceId: 'D0', exerciseId: 'x', family: 'written-recognition', elapsedDays: 0, eventId: 'r-old' }] };
    plan.intent = { kind: 'explicit', reason: 'saved-deck', requestedAt: NOW };
    plan.items[0]!.intent = plan.intent;
    const rec = simpleRecorder();
    const runner = createSessionRunner({ plan, builders: fakeBuilders(), facts: factsProvider, audio: fakeAudioSource(), scheduler, identity: IDENTITY, record: rec.record, persist: createMemoryArea(), now: clock(), random: () => 0.5, grading: fakeGrading,
      committedEvents: async () => log, canPresent: async () => ({ eligible: true }) });
    const r = await runner.answer(right());
    expect(r.evidence?.payload.expectedPreviousReviewId).toBe('r-elsewhere');
    expect(r.evidence?.payload.scheduledDueBefore).not.toBe(plan.items[0]!.item.schedule.due);
    const folded = foldDeckItems([...log, r.evidence!], scheduler, { languageId: 'sq', learnerId: IDENTITY.learnerId, now: NOW });
    const card = folded.find((i) => i.itemId === CARD)!;
    expect(card.history.map((h) => [h.eventId, h.scheduleExcluded ?? null])).toEqual([['r-old', null], ['r-elsewhere', null], [r.evidence!.id, null]]);
    expect(card.schedule.reps).toBe(3);
  });

  it('with no live row (a card new from intake) the snapshot stands and the predecessor is null', async () => {
    const plan = makePlan({ due: 0, newItems: [{ unitId: 'form:sq:fresh' }] });
    const rec = simpleRecorder();
    const runner = createSessionRunner({ plan, builders: fakeBuilders(), facts: factsProvider, audio: fakeAudioSource(), scheduler: createFsrsScheduler(), identity: IDENTITY, record: rec.record, persist: createMemoryArea(), now: clock(), random: () => 0.5, grading: fakeGrading,
      committedEvents: async () => [], canPresent: async () => ({ eligible: true }) });
    const r = await runner.answer(right());
    expect(r.evidence?.payload.expectedPreviousReviewId).toBeNull();
  });
});
