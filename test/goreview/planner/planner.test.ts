import { describe, expect, it } from 'vitest';
import { applyControls } from '../../../packages/goreview/src/planner/controls';
import { benefitOf, estimateSeconds, planSession } from '../../../packages/goreview/src/planner/planner';
import { buildCardAdded, foldDeck } from '../../../packages/goreview/src/scheduler/deck';
import { validateEvent } from '../../../packages/repository-contract/src';
import type { IntakeOutcome } from '../../../packages/goreview/src/types';
import { audioNone, audioOk, audioPractice, deckItem, dueItem, fakeScheduler, knowledge, NOW, prefs, scheduleState, testNow } from '../intake/fixtures';

const plan = (over: Partial<Parameters<typeof planSession>[0]> = {}) => {
  const intake = over.intake ?? [];
  const inferredTestEvidence = intake.filter((o) => o.decision === 'test-now').map((o) => knowledge(o.unitId));
  return planSession({ deck: [], intake, preferences: prefs(), audio: audioOk, scheduler: fakeScheduler, now: NOW, random: () => 0.5, knowledge: inferredTestEvidence, ...over });
};

describe('planSession: tiers and ordering', () => {
  it('exposes eligible workload beyond the initial micro-deck without admitting it yet', () => {
    const p = plan({ deck:Array.from({length:12},(_,i)=>dueItem(`form:available-${i}`,0.5)), preferences:prefs({sessionMinutes:0}) });
    expect(p.items).toHaveLength(10);
    expect(p.initialQuestionCount).toBe(10);
    expect(p.availableWork).toEqual({ questions:12, newQuestions:0 });
  });

  it('due items come first, lowest recall probability first', () => {
    const p = plan({ deck: [dueItem('form:a', 0.7), dueItem('form:b', 0.2), dueItem('form:c', 0.5)] });
    expect(p.items.map((i) => i.item.unitId)).toEqual(['form:b', 'form:c', 'form:a']);
    expect(p.dueCount).toBe(3);
    expect(p.items[0].why[0]).toContain('due: independent review');
  });

  it('repeated automatic failures pause the item for content repair instead of reseeding it', () => {
    const leech = deckItem({
      unitId: 'form:leech',
      history: Array.from({ length: 5 }, (_, i) => ({ at: `2026-10-0${i + 1}T10:00:00.000Z`, rating: 1 as const, outcome: 'incorrect' as const, deviceId: 'D', exerciseId: `l${i}`, family: 'written-recognition' as const, elapsedDays: 1 })),
    });
    const p = plan({ deck: [leech] });
    expect(p.items).toEqual([]);
    expect(p.skipped[0].why).toContain('content repair');
  });

  it('retracted Again ratings remain in history but do not trigger leech deferral or make a card reviewed', () => {
    const retracted = deckItem({
      unitId: 'form:undone-leech',
      schedule: scheduleState({ phase: 'new', stability: 0, reps: 0, lapses: 0, due: NOW }),
      history: Array.from({ length: 5 }, (_, i) => ({
        at: `2026-10-0${i + 1}T10:00:00.000Z`, rating: 1 as const, outcome: 'incorrect' as const,
        deviceId: 'D', exerciseId: `undone-${i}`, family: 'written-recognition' as const, elapsedDays: 0, retracted: true,
      })),
    });
    const p = plan({ deck: [retracted], knowledge:[knowledge(retracted.unitId)] });
    expect(retracted.history).toHaveLength(5); // audit history is retained
    expect(p.skipped).toEqual([]);
    expect(p.items).toHaveLength(1);
    expect(p.items[0].isNew).toBe(true);
    expect(p.items[0].why[0]).toContain('new in the deck');
  });

  it('due obligations precede new cards regardless of stage weights', () => {
    const due = dueItem('form:known', 0.5);
    const intake = testNow('form:recognized', { score: 0.7 });
    const p = plan({
      deck: [due], intake: [intake],
      knowledge: [knowledge(due.unitId, { readingRecognition: { score: 0.5, confidence: 0.5 } }), knowledge(intake.unitId)],
      preferences: prefs({ sessionMinutes: 10, maxNew: 2 }),
    });
    expect(p.items.map((x) => x.item.unitId)[0]).toBe(due.unitId);
  });

  it('due obligations precede new admissions and non-due weak cards stay deferred', () => {
    const weak = deckItem({
      unitId: 'form:weak', schedule: scheduleState({ stability: 0.8, due: '2026-10-20T00:00:00.000Z' }),
      history: [1, 3, 1].map((rating, i) => ({ at: `2026-10-0${i + 1}T10:00:00.000Z`, rating: rating as 1 | 3, outcome: rating === 1 ? 'incorrect' as const : 'correct' as const, deviceId: 'D', exerciseId: `x${i}`, family: 'written-recognition' as const, elapsedDays: 1 })),
    });
    const p = plan({ deck: [weak, dueItem('form:due', 0.4)], intake: [testNow('form:new')] });
    expect(p.items.map((i) => i.item.unitId)).toEqual(['form:due', 'form:new']);
    expect(p.skipped.find(x=>x.itemId===weak.itemId)?.why).toContain('not due');
    expect(p.items[1].isNew).toBe(true);
    expect(p.items[1].why[0]).toBe('new from intake');
  });

  it('help requests do not fabricate a due memory obligation', () => {
    const idle = deckItem({ unitId: 'form:helped', schedule: scheduleState({ stability: 0.9, due: '2026-10-20T00:00:00.000Z' }) });
    const p = plan({ deck: [idle, deckItem({ unitId: 'form:fine', schedule: scheduleState({ stability: 0.9, due: '2026-10-20T00:00:00.000Z' }) })], recentHelp: new Set(['form:helped']) });
    expect(p.items).toEqual([]);
    expect(p.skipped).toHaveLength(2);
  });

  it('items that are not due and not weak are left alone', () => {
    const p = plan({ deck: [deckItem({ schedule: scheduleState({ stability: 0.95, due: '2026-10-20T00:00:00.000Z' }) })] });
    expect(p.items).toHaveLength(0);
    expect(p.skipped[0].why).toContain('not due');
  });

  it('suspended, dismissed and still-snoozed items are never planned; a finished snooze is', () => {
    const base = { schedule: scheduleState({ stability: 0.3, due: '2026-10-08T09:00:00.000Z' }) };
    const p = plan({
      deck: [
        deckItem({ unitId: 'form:s', status: 'suspended', ...base }), deckItem({ unitId: 'form:d', status: 'dismissed', ...base }),
        deckItem({ unitId: 'form:z', status: 'snoozed', snoozedUntil: '2026-10-09T00:00:00.000Z', ...base }),
        deckItem({ unitId: 'form:over', status: 'snoozed', snoozedUntil: '2026-10-08T08:00:00.000Z', ...base }),
      ],
    });
    expect(p.items.map((i) => i.item.unitId)).toEqual(['form:over']);
    expect(p.skipped).toHaveLength(3);
  });

  it('plans from a pure reading: the deck and intake are not mutated', () => {
    const deck = [dueItem('form:a', 0.3)];
    const intake = [testNow('form:n')];
    const before = JSON.stringify([deck, intake]);
    plan({ deck, intake });
    expect(JSON.stringify([deck, intake])).toBe(before);
  });
});

describe('planSession: the time budget', () => {
  it('a short session keeps due items it cannot fit, lists them as skipped (over budget), and writes nothing', () => {
    const deck = [dueItem('form:a', 0.1), dueItem('form:b', 0.2), dueItem('form:c', 0.3), dueItem('form:d', 0.4)];
    const before = JSON.stringify(deck);
    const p = plan({ deck, preferences: prefs({ sessionMinutes: 1 }) }); // 60 s → two 25 s items
    expect(p.items.map((i) => i.item.unitId)).toEqual(['form:a', 'form:b']);
    expect(p.skipped.map((s) => s.itemId)).toEqual([deck[2].itemId, deck[3].itemId]);
    expect(p.skipped.every((s) => s.why.startsWith('over budget'))).toBe(true);
    expect(p.dueCount).toBe(2);
    expect(JSON.stringify(deck)).toBe(before); // the skipped items are untouched: still due
    expect(deck.every((d) => fakeScheduler.isDue(d.schedule, NOW))).toBe(true);
  });

  it('the estimated seconds of the plan never exceed the budget', () => {
    const deck = Array.from({ length: 30 }, (_, i) => dueItem(`form:${i}`, 0.1 + i / 100, i % 2 ? 'sentence-completion' : 'morphological-identification'));
    for (const minutes of [1, 3, 5, 10]) {
      const p = plan({ deck, preferences: prefs({ sessionMinutes: minutes }) });
      expect(p.items.reduce((s, i) => s + i.estimatedSeconds, 0)).toBeLessThanOrEqual(minutes * 60);
      expect(p.items.length + p.skipped.length).toBe(30);
    }
  });

  it('a smaller later due item may use leftover time, but the skipped big one is still listed', () => {
    const p = plan({
      deck: [dueItem('form:a', 0.1), dueItem('form:big', 0.2, 'sentence-completion'), dueItem('form:c', 0.3)],
      preferences: prefs({ sessionMinutes: 1 }),
    });
    expect(p.items.map((i) => i.item.unitId)).toEqual(['form:a', 'form:c']);
    expect(p.skipped.map((s) => s.itemId)).toEqual(['card:productive-recall:form:big']);
  });

  it('estimates per family are the documented ones', () => {
    expect(estimateSeconds('written-recognition', 'review')).toBe(25);
    expect(estimateSeconds('written-recognition', 'new')).toBe(15); // a choice question
    expect(estimateSeconds('meaning-to-form')).toBe(25);
    expect(estimateSeconds('grammar-application')).toBe(35);
    expect(estimateSeconds('morphological-identification')).toBe(35);
    expect(estimateSeconds('sentence-completion')).toBe(40);
    expect(estimateSeconds('audio-to-meaning')).toBe(38); // 30 s + one expected replay
  });
});

describe('planSession: new items', () => {
  it('reserves workload for a learning return scheduled two minutes into the session', () => {
    const learningSoon = deckItem({ unitId:'form:learning-soon',
      schedule:scheduleState({ phase:'learning', due:'2026-10-08T10:02:00.000Z', stability:0.5 }) });
    const intake = ['a','b','c','d','e','f'].map(label=>testNow(`form:new-${label}`));
    const p = plan({ deck:[dueItem('form:due',0.4),learningSoon], intake,
      preferences:prefs({ sessionMinutes:2,maxNew:10,dailyNewLimit:10 }) });
    expect(p.items.filter(item=>item.isNew)).toHaveLength(3);
    expect(p.batch?.workloadLimit).toBe(120);
    expect(p.batch?.reasons.at(-1)).toContain('upcoming scheduled work');
  });

  it('supports a fixed-admission comparison without changing the default workload-aware policy', () => {
    const due = Array.from({length:6},(_,i)=>dueItem(`form:fixed-due-${i}`,0.5,'sentence-completion'));
    const learningSoon = deckItem({ unitId:'form:fixed-learning', schedule:scheduleState({ phase:'learning', due:'2026-10-08T10:03:00.000Z' }) });
    const intake = Array.from({length:8},(_,i)=>testNow(`form:fixed-new-${i}`));
    const shared = { deck:[...due,learningSoon], intake, preferences:prefs({ sessionMinutes:5,maxNew:10,dailyNewLimit:10 }) };
    const aware = plan(shared);
    const fixed = plan({ ...shared, admissionPolicy:{ mode:'fixed' } });
    expect(aware.newCount).toBeLessThan(fixed.newCount);
    expect(fixed.newCount).toBeGreaterThan(aware.newCount);
  });

  it('adds at most maxNew new items from test-now outcomes and lists the rest as beyond the limit', () => {
    const intake = ['a', 'b', 'c', 'd', 'e'].map((u) => testNow(`form:${u}`));
    const p = plan({ intake, preferences: prefs({ maxNew: 2 }) });
    expect(p.newCount).toBe(2);
    expect(p.items).toHaveLength(2);
    expect(p.skipped).toHaveLength(3);
    expect(p.skipped[0].why).toContain('new-item budget exhausted');
  });

  it('only test-now outcomes become new items', () => {
    const later: IntakeOutcome = { ...testNow('form:later'), decision: 'test-later' };
    const p = plan({ intake: [later, testNow('form:now')] });
    expect(p.items.map((i) => i.item.unitId)).toEqual(['form:now']);
  });

  it('the new deck item is built for the CardAdded: id, family, intake origin, reason with explains tokens', () => {
    const construction = testNow('morph:x', { kind: 'morph-construction', explains: ['form:sq:a'] }, 'grammar-application');
    const p = plan({ intake: [construction] });
    const item = p.items[0].item;
    expect(item.itemId).toBe('card:construction-understanding:morph:x');
    expect(item.addedBy).toBe('intake');
    expect(item.status).toBe('active');
    expect(item.reasons[0]).toContain('explains:form:sq:a');
  });

  it('an intake item that is already in the deck in any state is not added twice', () => {
    const existing = deckItem({ unitId: 'form:x', status: 'suspended' });
    const p = plan({ deck: [existing], intake: [testNow('form:x')] });
    expect(p.items).toHaveLength(0);
  });

  it('never-reviewed deck items count toward maxNew and come after due items', () => {
    const fresh = deckItem({ unitId: 'form:fresh', history: [], schedule: fakeScheduler.newState('2026-10-08T09:00:00.000Z') });
    const fresh2 = deckItem({ unitId: 'form:fresh2', history: [], schedule: fakeScheduler.newState('2026-10-08T09:00:00.000Z') });
    const p = plan({ deck: [fresh, fresh2, dueItem('form:due', 0.5)], knowledge:[knowledge(fresh.unitId),knowledge(fresh2.unitId)], preferences: prefs({ maxNew: 1 }) });
    expect(p.items.map((i) => i.item.unitId)).toEqual(['form:due', 'form:fresh']);
    expect(p.newCount).toBe(1);
    expect(p.skipped.map((s) => s.itemId)).toEqual([fresh2.itemId]);
  });

  it('orders new items by cost/benefit: higher score and lower cost first', () => {
    const intake = [
      testNow('form:low', { score: 0.55, cost: 0.2 }),
      testNow('form:high', { score: 0.95, cost: 0.2 }),
      testNow('form:costly', { score: 0.95, cost: 0.9 }),
    ];
    const p = plan({ intake });
    expect(p.items.map((i) => i.item.unitId)).toEqual(['form:high', 'form:costly', 'form:low']);
    expect(benefitOf(1, 0.9, 25, 0.1)).toBeGreaterThan(benefitOf(1, 0.9, 40, 0.1));
  });

  it('with equal scores the cheaper family goes first', () => {
    const p = plan({ intake: [testNow('form:slow', { score: 0.8 }, 'sentence-completion'), testNow('form:quick', { score: 0.8 }, 'meaning-to-form')] });
    expect(p.items[0].item.unitId).toBe('form:quick');
  });

  it('a due item with a larger deficit outranks a cheaper one (retrievability first)', () => {
    const p = plan({ deck: [dueItem('form:ok', 0.8, 'written-recognition'), dueItem('form:forgotten', 0.1, 'sentence-completion')] });
    expect(p.items[0].item.unitId).toBe('form:forgotten');
  });
});

describe('planSession: listening', () => {
  const listeningDue = dueItem('form:l', 0.3, 'audio-to-meaning');

  it('keeps a due listening item when listening is on and audio is available', () => {
    const p = plan({ deck: [listeningDue] });
    expect(p.items[0].family).toBe('audio-to-meaning');
    expect(p.listeningCount).toBe(1);
  });

  it('flags audio that is practice only', () => {
    const p = plan({ deck: [listeningDue], audio: audioPractice });
    expect(p.items[0].family).toBe('audio-to-meaning');
    expect(p.items[0].why.join(' ')).toContain('cannot count as listening evidence');
  });

  it('keeps listening unsatisfied when listening is switched off', () => {
    const p = plan({ deck: [listeningDue], preferences: prefs({ includeListening: false }) });
    expect(p.items).toEqual([]);
    expect(p.listeningCount).toBe(0);
    expect(p.skipped[0].why).toContain('Listening remains due');
  });

  it('keeps listening unsatisfied when no audio is available', () => {
    const p = plan({ deck: [listeningDue], audio: audioNone });
    expect(p.items).toEqual([]);
    expect(p.skipped[0].why).toContain('audio is unavailable');
  });

  it('does not add a NEW listening item without audio; it is listed as skipped', () => {
    const o = testNow('form:nl', {}, 'audio-to-meaning');
    const none = plan({ intake: [o], audio: audioNone });
    expect(none.items).toHaveLength(0);
    expect(none.skipped[0].why).toContain('audio is unavailable');
    const some = plan({ intake: [o] });
    expect(some.items[0].family).toBe('audio-to-meaning');
  });
});

describe('planSession: grammar share', () => {
  const mixed = (grammar: number, written: number) => [
    ...Array.from({ length: grammar }, (_, i) => testNow(`morph:g${i}`, { score: 0.8 - i * 0.01 }, 'grammar-application')),
    ...Array.from({ length: written }, (_, i) => testNow(`form:w${i}`, { score: 0.8 - i * 0.01 }, 'written-recognition')),
  ];

  it('grammarShare does not override global priority ordering', () => {
    const p = plan({ intake: mixed(8, 8), preferences: prefs({ maxNew: 10, sessionMinutes: 30, grammarShare: 0.4 }) });
    expect(p.items).toHaveLength(10);
    expect(p.grammarCount).toBe(2);
  });

  it('a high grammarShare does not pull lower-priority grammar items ahead', () => {
    const p = plan({ intake: mixed(8, 8), preferences: prefs({ maxNew: 10, sessionMinutes: 30, grammarShare: 0.8 }) });
    expect(p.grammarCount).toBe(2);
  });

  it('falls back to the other kind when the preferred one runs out', () => {
    const none = plan({ intake: mixed(0, 6), preferences: prefs({ maxNew: 5, sessionMinutes: 30, grammarShare: 0.5 }) });
    expect(none.items).toHaveLength(5);
    expect(none.grammarCount).toBe(0);
    const only = plan({ intake: mixed(6, 0), preferences: prefs({ maxNew: 5, sessionMinutes: 30, grammarShare: 0.1 }) });
    expect(only.items).toHaveLength(5);
    expect(only.grammarCount).toBe(5);
  });

  it('new grammar never displaces existing due obligations', () => {
    const deck = Array.from({ length: 5 }, (_, i) => dueItem(`form:d${i}`, 0.1 + i / 20));
    const p = plan({ deck, intake: mixed(4, 0), preferences: prefs({ maxNew: 4, sessionMinutes: 30, grammarShare: 0.5 }) });
    expect(p.items.slice(0, 5).map((i) => i.item.unitId)).toEqual(deck.map((d) => d.unitId));
    expect(p.items.slice(5).map((i) => i.item.unitId)).toEqual(['morph:g0', 'morph:g1', 'morph:g2', 'morph:g3']);
    expect(p.dueCount).toBe(5);
  });
});

describe('planSession: plan metadata', () => {
  it('carries id, time, language, budget and counts', () => {
    const p = plan({ deck: [dueItem('form:a', 0.5)], intake: [testNow('form:n')] });
    expect(p.planId).toMatch(/^plan:2026-10-08T10:00:00.000Z:/);
    expect(p.createdAt).toBe(NOW);
    expect(p.languageId).toBe('sq');
    expect(p.budgetMinutes).toBe(10);
    expect([p.dueCount, p.newCount, p.listeningCount, p.grammarCount]).toEqual([1, 1, 0, 0]);
  });

  it('rejects a non-ISO now', () => {
    expect(() => plan({ now: 'tomorrow' })).toThrow(RangeError);
  });
});

describe('applyControls', () => {
  const ctx = { learnerId: 'L1', enrolmentId: 'E1', deviceId: 'D1', now: NOW };
  const added = (unitId = 'form:a') => buildCardAdded({ learnerId: 'L1', enrolmentId: 'E1', languageId: 'sq', at: '2026-10-01T10:00:00.000Z', deviceId: 'D1', unitId, unitKind: 'form', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake', reason: 'test' });

  it('produces valid CardRemoved / CardAdded events that the fold applies; the deck is never edited directly', () => {
    const base = foldDeck([added('form:a'), added('form:b'), added('form:c'), added('form:d')], fakeScheduler, { now: NOW }).items;
    const snapshot = JSON.stringify(base);
    const r = applyControls(base, {
      snooze: [{ itemId: base[0].itemId, until: '2026-10-12T00:00:00.000Z' }], suspend: [base[1].itemId], dismiss: [base[2].itemId],
    }, ctx);
    expect(r.ignored).toEqual([]);
    expect(r.events.map((e) => e.kind)).toEqual(['CardRemoved', 'CardRemoved', 'CardRemoved']);
    for (const e of r.events) expect(validateEvent(e)).toEqual([]);
    expect(JSON.stringify(base)).toBe(snapshot);

    const after = foldDeck([added('form:a'), added('form:b'), added('form:c'), added('form:d'), ...r.events], fakeScheduler, { now: NOW });
    expect(after.ignored).toEqual([]);
    expect(after.items.map((i) => i.status)).toEqual(['snoozed', 'suspended', 'dismissed', 'active']);
    expect(after.items[0].snoozedUntil).toBe('2026-10-12T00:00:00.000Z');
  });

  it('resume produces a CardAdded that re-activates the item and keeps its history', () => {
    const base = foldDeck([added('form:a')], fakeScheduler, { now: NOW }).items;
    const suspended = applyControls(base, { suspend: [base[0].itemId] }, ctx).events;
    const mid = foldDeck([added('form:a'), ...suspended], fakeScheduler, { now: NOW }).items;
    expect(mid[0].status).toBe('suspended');
    const resumed = applyControls(mid, { resume: [mid[0].itemId] }, { ...ctx, now: '2026-10-08T11:00:00.000Z' });
    expect(resumed.events.map((e) => e.kind)).toEqual(['CardAdded']);
    expect(validateEvent(resumed.events[0])).toEqual([]);
    const end = foldDeck([added('form:a'), ...suspended, ...resumed.events], fakeScheduler, { now: NOW }).items;
    expect(end[0].status).toBe('active');
  });

  it('ignores controls that make no sense, with the reason', () => {
    const base = foldDeck([added('form:a')], fakeScheduler, { now: NOW }).items;
    const id = base[0].itemId;
    const r = applyControls(base, {
      snooze: [{ itemId: id, until: '2026-10-01T00:00:00.000Z' }, { itemId: 'nope', until: '2026-10-12T00:00:00.000Z' }], resume: [id],
    }, ctx);
    expect(r.events).toEqual([]);
    expect(r.ignored.map((i) => i.why)).toEqual(['the snooze would already be over', 'not in the deck', 'the item is already active']);
  });

  it('a second control on the same item in one call is ignored, not merged', () => {
    const base = foldDeck([added('form:a')], fakeScheduler, { now: NOW }).items;
    const r = applyControls(base, { suspend: [base[0].itemId], dismiss: [base[0].itemId] }, ctx);
    expect(r.events).toHaveLength(1);
    expect(r.ignored[0].control).toBe('dismiss');
  });

  it('a snooze is a postponement: it appends no review and rewrites no history', () => {
    const base = foldDeck([added('form:a')], fakeScheduler, { now: NOW }).items;
    const r = applyControls(base, { snooze: [{ itemId: base[0].itemId, until: '2026-10-20T00:00:00.000Z' }] }, ctx);
    expect(r.events.every((e) => e.kind === 'CardRemoved')).toBe(true);
    const after = foldDeck([added('form:a'), ...r.events], fakeScheduler, { now: NOW }).items[0];
    expect(after.history).toEqual([]);
    expect(after.schedule.reps).toBe(base[0].schedule.reps);
  });
});

