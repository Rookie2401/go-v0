/**
 * One word, one NEW card per batch (2026-10-29). The Repository proposes a word once per objective and intake can turn several of those
 * into cards in one load; before, a batch could hold the same word as a recognition card, a retrieval card and a listening card ("the same
 * nine words with slightly different questions"). A due card is an obligation and is kept whatever its word; a second automatic NEW card
 * for a word already in the batch is deferred with the code `same-unit-in-batch` and stays eligible for a later batch. Explicit practice
 * (a saved deck, selected words) is the learner's own choice and is not deferred.
 */
import { describe, expect, it } from 'vitest';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import { audioOk, dueItem, fakeScheduler, knowledge, NOW, prefs, testNow } from '../intake/fixtures';

const U = 'form:sq:librin', V = 'form:sq:shtepi';
const familiar = (unitId: string) => ({ ...knowledge(unitId), level: 'familiar' as const, encounters: 5 });

describe('one word, one new card per batch', () => {
  it('a second automatic new card for a word already in the batch is deferred, the next word is admitted instead', () => {
    const intake = [testNow(U), testNow(U, {}, 'meaning-to-form'), testNow(U, {}, 'audio-to-meaning'), testNow(V)];
    const plan = planSession({ deck: [], intake, knowledge: [familiar(U), familiar(V)], preferences: prefs({ maxNew: 5, dailyNewLimit: 5, cardsPerDeck: 10, includeListening: true }), audio: audioOk, scheduler: fakeScheduler, now: NOW, readingSignals: [], learnerId: 'L1', random: () => 0.1 });
    expect(plan.items.map((p) => p.item.unitId)).toEqual(expect.arrayContaining([U, V]));
    expect(plan.items.filter((p) => p.item.unitId === U)).toHaveLength(1);
    const deferred = plan.skipped.filter((s) => s.code === 'same-unit-in-batch');
    expect(deferred).toHaveLength(2);
    expect(deferred.every((s) => s.itemId.endsWith(U))).toBe(true);
    expect(plan.newCount).toBe(2);
  });

  it('a due card keeps its place, and a NEW card for the same word in another dimension waits for a later batch', () => {
    const due = dueItem(U, 0.4, 'written-recognition');
    const plan = planSession({ deck: [due], intake: [testNow(U, {}, 'meaning-to-form'), testNow(V)], knowledge: [familiar(U), familiar(V)], preferences: prefs({ maxNew: 5, dailyNewLimit: 5, cardsPerDeck: 10 }), audio: audioOk, scheduler: fakeScheduler, now: NOW, readingSignals: [], learnerId: 'L1', random: () => 0.1 });
    expect(plan.items.map((p) => [p.item.unitId, p.isNew])).toEqual([[U, false], [V, true]]);
    expect(plan.skipped.find((s) => s.code === 'same-unit-in-batch')?.itemId).toContain(U);
  });

  it('two DUE cards of one word are both obligations and both stay', () => {
    const a = dueItem(U, 0.4, 'written-recognition'), b = dueItem(U, 0.3, 'meaning-to-form');
    const plan = planSession({ deck: [a, b], intake: [], preferences: prefs({ cardsPerDeck: 10 }), audio: audioOk, scheduler: fakeScheduler, now: NOW, readingSignals: [], learnerId: 'L1', random: () => 0.1 });
    expect(plan.items).toHaveLength(2);
    expect(plan.skipped.some((s) => s.code === 'same-unit-in-batch')).toBe(false);
  });

  it('explicit practice is never deferred by the rule', () => {
    const explicit = { kind: 'explicit' as const, reason: 'selected-vocabulary' as const, requestedAt: NOW };
    const intake = [{ ...testNow(U), intent: explicit, explicitlySelected: true }, { ...testNow(U, {}, 'meaning-to-form'), intent: explicit, explicitlySelected: true }];
    const plan = planSession({ deck: [], intake, knowledge: [familiar(U)], preferences: prefs({ maxNew: 5, dailyNewLimit: 5, cardsPerDeck: 10 }), audio: audioOk, scheduler: fakeScheduler, now: NOW, readingSignals: [], learnerId: 'L1', random: () => 0.1, intent: explicit });
    expect(plan.items).toHaveLength(2);
  });
});
