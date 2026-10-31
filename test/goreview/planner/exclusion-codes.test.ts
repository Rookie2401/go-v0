import { describe, expect, it } from 'vitest';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import { reviewEligibility } from '../../../packages/goreview/src/planner/eligibility';
import type { DeckItem, ExclusionCode, SessionPlan } from '../../../packages/goreview/src/types';
import type { UnitKnowledge } from '../../../packages/repository-contract/src';
import { audioNone, audioOk, deckItem, dueItem, fakeScheduler, knowledge, NOW, prefs, scheduleState, testNow } from '../intake/fixtures';

const plan = (over: Partial<Parameters<typeof planSession>[0]> = {}): SessionPlan => {
  const intake = over.intake ?? [];
  const inferred = intake.filter(o => o.decision === 'test-now').map(o => knowledge(o.unitId));
  return planSession({ deck: [], intake, preferences: prefs(), audio: audioOk, scheduler: fakeScheduler, now: NOW, random: () => 0.5, knowledge: inferred, ...over });
};
const codeOf = (p: SessionPlan, itemId: string): ExclusionCode | undefined => p.skipped.find(s => s.itemId === itemId)?.code;
const FUTURE = '2026-10-12T10:00:00.000Z';

describe('planSession: every skip carries a stable exclusion code (reason strings unchanged)', () => {
  it('a card that is not due is scheduled-not-due, or learning-not-due while it is still in its steps', () => {
    const review = deckItem({ unitId: 'form:later', schedule: scheduleState({ due: FUTURE }) });
    const learning = deckItem({ unitId: 'form:steps', schedule: scheduleState({ due: FUTURE, phase: 'learning' }) });
    const p = plan({ deck: [review, learning] });
    expect(p.items).toEqual([]);
    expect(codeOf(p, review.itemId)).toBe('scheduled-not-due');
    expect(codeOf(p, learning.itemId)).toBe('learning-not-due');
    expect(p.skipped.find(s => s.itemId === review.itemId)!.why).toBe('not due; optional remediation is separate from scheduled review');
  });

  it('the eligibility result names the code on the automatic path', () => {
    const item = deckItem({ unitId: 'form:later', schedule: scheduleState({ due: FUTURE }) });
    const r = reviewEligibility({ item, unitId: item.unitId, events: [], now: NOW });
    expect(r).toEqual({ eligible: false, reason: 'not due; early review requires an explicit request', code: 'scheduled-not-due' });
    const learning = { ...item, schedule: scheduleState({ due: FUTURE, phase: 'relearning' as const }) };
    expect(reviewEligibility({ item: learning, unitId: item.unitId, events: [], now: NOW }).code).toBe('learning-not-due');
    expect(reviewEligibility({ item, unitId: item.unitId, events: [], now: 'not-a-date' })).toMatchObject({ eligible: false, code: 'invalid-request' });
  });

  it('a listening card without usable audio is listening-audio-unavailable', () => {
    const item = dueItem('form:audio', 0.5, 'audio-to-meaning');
    const p = plan({ deck: [item], audio: audioNone });
    expect(p.items).toEqual([]);
    expect(codeOf(p, item.itemId)).toBe('listening-audio-unavailable');
    expect(p.skipped[0]!.why).toContain('Listening remains due');
  });

  it('new work beyond the new-item budget is new-budget-exhausted (planner loop and eligibility paths)', () => {
    const intake = [testNow('form:n1'), testNow('form:n2'), testNow('form:n3')];
    const limited = plan({ intake, preferences: prefs({ maxNew: 1 }) });
    expect(limited.items).toHaveLength(1);
    const codes = limited.skipped.map(s => s.code);
    expect(codes).toEqual(['new-budget-exhausted', 'new-budget-exhausted']);
    expect(limited.skipped.every(s => s.why === 'session or daily new-item budget exhausted' || s.why === 'new-card budget exhausted')).toBe(true);
    const none = plan({ intake: [testNow('form:n1')], preferences: prefs({ maxNew: 0 }) });
    expect(none.skipped.map(s => s.code)).toEqual(['new-budget-exhausted']);
  });

  it('due work that does not fit the session minutes is over-time-budget', () => {
    const deck = [dueItem('form:a', 0.2), dueItem('form:b', 0.3), dueItem('form:c', 0.4)];
    const p = plan({ deck, preferences: prefs({ sessionMinutes: 1 }) });
    expect(p.items.length).toBeLessThan(3);
    const over = p.skipped.filter(s => s.why === 'over budget (still due; nothing was written)');
    expect(over.length).toBe(3 - p.items.length);
    expect(over.every(s => s.code === 'over-time-budget')).toBe(true);
  });

  it('eligible work beyond the micro-deck size is beyond-micro-deck', () => {
    const deck = Array.from({ length: 12 }, (_, i) => dueItem(`form:available-${i}`, 0.5));
    const p = plan({ deck, preferences: prefs({ sessionMinutes: 0 }) });
    expect(p.items).toHaveLength(10);
    expect(p.skipped).toHaveLength(2);
    expect(p.skipped.every(s => s.code === 'beyond-micro-deck' && s.why.startsWith('eligible for the next micro-deck'))).toBe(true);
  });

  it('automatic admission of a New unit is knowledge-beyond-new-required', () => {
    const outcome = testNow('form:fresh');
    const newKnowledge: UnitKnowledge = { ...knowledge(outcome.unitId), level: 'new' };
    const p = plan({ intake: [{ ...outcome, knowledge: newKnowledge }], knowledge: [newKnowledge] });
    expect(p.items).toEqual([]);
    expect(p.skipped.map(s => s.code)).toEqual(['knowledge-beyond-new-required']);
    expect(p.skipped[0]!.why).toBe('automatic admission needs observed knowledge beyond New');
  });

  it.each([
    ['snoozed', { status: 'snoozed' as const, snoozedUntil: FUTURE }, 'snoozed'],
    ['suspended', { status: 'suspended' as const }, 'suspended'],
    ['dismissed', { status: 'dismissed' as const }, 'dismissed'],
    ['invalidated', { invalidatedAt: NOW }, 'invalidated'],
  ] as Array<[string, Partial<DeckItem>, ExclusionCode]>)('a %s card is %s', (_name, over, code) => {
    const item = dueItem('form:ctl', 0.4, 'written-recognition', over);
    const p = plan({ deck: [item] });
    expect(p.items).toEqual([]);
    expect(codeOf(p, item.itemId)).toBe(code);
  });

  it('repeated failures pause a card as repair-required', () => {
    const leech = deckItem({
      unitId: 'form:leech',
      history: Array.from({ length: 5 }, (_, i) => ({ at: `2026-10-0${i + 1}T10:00:00.000Z`, rating: 1 as const, outcome: 'incorrect' as const, deviceId: 'D', exerciseId: `l${i}`, family: 'written-recognition' as const, elapsedDays: 1 })),
    });
    const p = plan({ deck: [leech] });
    expect(p.skipped[0]!.code).toBe('repair-required');
    expect(p.skipped[0]!.why).toContain('content repair');
  });

  it('the codes do not change what is planned: the same inputs give the same items', () => {
    const deck = [dueItem('form:a', 0.7), dueItem('form:b', 0.2), dueItem('form:c', 0.5)];
    expect(plan({ deck }).items.map(i => i.item.unitId)).toEqual(['form:b', 'form:c', 'form:a']);
  });
});
