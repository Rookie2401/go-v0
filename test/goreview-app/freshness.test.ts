// @vitest-environment jsdom
/**
 * Planning-time freshness (defect B2). The home and the review details paint a model folded at one instant; Start, Begin and
 * Continue plan later. The model must be loaded again when the clock has reached a pending instant of its own (a due time, a
 * snooze's end, a remediation item's delay, the UTC midnight), when the preferences or the local log moved, or when it is more than
 * five minutes old; and reused, as the same object, when none of that happened.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildRemediationStudiedEvent } from '../../packages/goreview/src/planner/remediation';
import type { DeckItem } from '../../packages/goreview/src/types';
import { planRemediation } from '../../packages/goreview/app/deckModel';
import { freshModel, modelIsFresh, nextChangeAt } from '../../packages/goreview/app/freshness';
import { loadReviewModel, type ReviewModel } from '../../packages/goreview/app/workspace';
import { cardAdded, destroyRigs, dueCard, ids, makeRig, reopen, reviewed, seed, T0, until, type Rig } from './helpers';

afterEach(() => { destroyRigs(); });

const A = ids('L1', 'sq');
const MIN = 60_000;
const t0 = Date.parse(T0);
const iso = (ms: number): string => new Date(ms).toISOString();
const calls = (rig: Rig, name: string): number => rig.service.calls.filter((c) => c === name).length;

/** A model with only the fields nextChangeAt reads. */
const synthetic = (now: string, deck: Array<Partial<DeckItem> & { due: string }>, classDeck: Array<Partial<DeckItem> & { due: string }> = []): ReviewModel => {
  const item = ({ due, ...rest }: Partial<DeckItem> & { due: string }): DeckItem => ({ itemId: `card:${due}`, status: 'active', history: [], schedule: { due }, ...rest } as unknown as DeckItem);
  return { now, deck: deck.map(item), classDeck: classDeck.map(item), events: [] } as unknown as ReviewModel;
};

describe('nextChangeAt', () => {
  const now = '2026-10-08T10:00:00.000Z';
  const midnight = '2026-10-09T00:00:00.000Z';

  it('is the earliest due time after now', () => {
    expect(nextChangeAt(synthetic(now, [{ due: iso(t0 + 20 * MIN) }, { due: iso(t0 + 5 * MIN) }, { due: iso(t0 - 5 * MIN) }]))).toBe(iso(t0 + 5 * MIN));
  });

  it('counts a Class Essentials return too, and ignores suspended, dismissed and invalidated items', () => {
    expect(nextChangeAt(synthetic(now, [], [{ due: iso(t0 + 3 * MIN) }]))).toBe(iso(t0 + 3 * MIN));
    const ignored = synthetic(now, [{ due: iso(t0 + MIN), status: 'suspended' }, { due: iso(t0 + MIN), status: 'dismissed' }, { due: iso(t0 + MIN), invalidatedAt: now }]);
    expect(nextChangeAt(ignored)).toBe(midnight);
  });

  it('counts the end of a snooze', () => {
    const m = synthetic(now, [{ due: iso(t0 - 60 * MIN), status: 'snoozed', snoozedUntil: iso(t0 + 30 * MIN) }]);
    expect(nextChangeAt(m)).toBe(iso(t0 + 30 * MIN));
  });

  it('is the next UTC midnight when nothing else is pending, and only a strictly later one', () => {
    expect(nextChangeAt(synthetic(now, [{ due: iso(t0 - MIN) }]))).toBe(midnight);
    expect(nextChangeAt(synthetic(now, []))).toBe(midnight);
    expect(nextChangeAt(synthetic('2026-10-09T00:00:00.000Z', []))).toBe('2026-10-10T00:00:00.000Z'); // exactly midnight: the next day's
    expect(nextChangeAt(synthetic('2026-10-08T23:59:59.999Z', []))).toBe(midnight);
  });

  it('is undefined only when the model has no usable instant', () => {
    expect(nextChangeAt(synthetic('not a date', []))).toBeUndefined();
  });

  it('counts the instant a studied remediation item becomes ready', async () => {
    const rig = await makeRig({ signedIn: true });
    const failure = reviewed(A, 'zog', 'meaning-to-form', 1, iso(t0 - 30 * MIN));
    await seed(rig, [cardAdded(A, 'zog', 'meaning-to-form', iso(t0 - 60 * MIN)), failure]);
    const itemId = (await loadReviewModel(rig.app.ctx))!.deck[0]!.itemId;
    const studiedAt = iso(t0 - 3 * MIN);
    await seed(rig, [buildRemediationStudiedEvent({ learnerId: 'L1', enrolmentId: 'L1-e1', languageId: 'sq', itemId, failureEventId: failure.id, at: studiedAt, deviceId: 'dev-old' })]);
    const model = (await loadReviewModel(rig.app.ctx))!;
    const readyAt = iso(t0 + 7 * MIN);
    // the learning return of a review answered 30 minutes ago is long past; the next pending instant is the delay's end
    const due = Date.parse(model.deck[0]!.schedule.due);
    expect(due).toBeLessThan(t0 + 7 * MIN);
    expect(nextChangeAt(model)).toBe(readyAt);
  });
});

describe('modelIsFresh and freshModel', () => {
  it('reuses the same model object when nothing changed and the clock moved a minute with no pending instant', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    const model = (await loadReviewModel(rig.app.ctx))!;
    const loads = calls(rig, 'candidates');
    rig.clock.set(iso(t0 + MIN));
    expect(await modelIsFresh(rig.app.ctx, model, rig.clock.now.toISOString())).toBe(true);
    expect(await freshModel(rig.app.ctx, model)).toBe(model);
    expect(calls(rig, 'candidates')).toBe(loads);
  });

  it('loads again at the pending instant, not before', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [cardAdded(A, 'zog', 'meaning-to-form', iso(t0 - 60 * MIN)), reviewed(A, 'zog', 'meaning-to-form', 3, iso(t0 - 8 * MIN))]);
    const model = (await loadReviewModel(rig.app.ctx))!;
    const due = Date.parse(nextChangeAt(model)!);
    expect(due).toBeGreaterThan(t0);
    expect(due).toBeLessThan(t0 + 5 * MIN); // inside the five-minute window, so it is the pending instant that decides
    rig.clock.set(iso(due - 1));
    expect(await modelIsFresh(rig.app.ctx, model, rig.clock.now.toISOString())).toBe(true);
    rig.clock.set(iso(due));
    expect(await modelIsFresh(rig.app.ctx, model, rig.clock.now.toISOString())).toBe(false);
    const again = await freshModel(rig.app.ctx, model);
    expect(again).not.toBe(model);
    expect(again.now).toBe(iso(due));
  });

  it('loads again after five minutes even with no pending instant', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    const model = (await loadReviewModel(rig.app.ctx))!;
    expect(await modelIsFresh(rig.app.ctx, model, iso(t0 + 5 * MIN))).toBe(true);
    expect(await modelIsFresh(rig.app.ctx, model, iso(t0 + 5 * MIN + 1))).toBe(false);
    expect(await modelIsFresh(rig.app.ctx, model, iso(t0 - MIN))).toBe(false); // the clock went back
    expect(await modelIsFresh(rig.app.ctx, model, 'nonsense')).toBe(false);
  });

  it('loads again when the saved preferences changed', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    const model = (await loadReviewModel(rig.app.ctx))!;
    await rig.app.ctx.state.setPrefs('L1', { ...model.prefs, cardsPerDeck: (model.prefs.cardsPerDeck ?? 10) + 5 });
    expect(await modelIsFresh(rig.app.ctx, model, rig.clock.now.toISOString())).toBe(false);
    const again = await freshModel(rig.app.ctx, model);
    expect(again).not.toBe(model);
    expect(again.prefs.cardsPerDeck).toBe((model.prefs.cardsPerDeck ?? 10) + 5);
  });

  it('loads again when the local log moved: one more event, and an event replaced by another of the same count', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    const model = (await loadReviewModel(rig.app.ctx))!;
    await seed(rig, dueCard(A, 'mace', 'meaning-to-form'));
    expect(await modelIsFresh(rig.app.ctx, model, rig.clock.now.toISOString())).toBe(false);
    // the same length, a different last event
    const current = (await loadReviewModel(rig.app.ctx))!;
    expect(await modelIsFresh(rig.app.ctx, current, rig.clock.now.toISOString())).toBe(true);
    const swapped = { ...current, events: current.events.map((e, i, all) => (i === all.length - 1 ? { ...e, id: 'something-else' } : e)) } as ReviewModel;
    expect(await modelIsFresh(rig.app.ctx, swapped, rig.clock.now.toISOString())).toBe(false);
  });

  it('loads again across the UTC midnight, inside the five minutes', async () => {
    const rig = await makeRig({ signedIn: true });
    rig.clock.set('2026-10-08T23:58:00.000Z');
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    const model = (await loadReviewModel(rig.app.ctx))!;
    expect(nextChangeAt(model)).toBe('2026-10-09T00:00:00.000Z');
    expect(await modelIsFresh(rig.app.ctx, model, '2026-10-08T23:59:59.999Z')).toBe(true);
    expect(await modelIsFresh(rig.app.ctx, model, '2026-10-09T00:00:00.000Z')).toBe(false);
  });

  it('falls back to the given model when nothing can be loaded', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    const model = (await loadReviewModel(rig.app.ctx))!;
    rig.clock.set(iso(t0 + 30 * MIN));
    await rig.app.ctx.signOut();
    expect(await freshModel(rig.app.ctx, model)).toBe(model);
  });

  it('a remediation item whose delay elapsed since the paint is ready in the plan made from the fresh model', async () => {
    const rig = await makeRig({ signedIn: true });
    const failure = reviewed(A, 'zog', 'meaning-to-form', 1, iso(t0 - 30 * MIN));
    await seed(rig, [cardAdded(A, 'zog', 'meaning-to-form', iso(t0 - 60 * MIN)), failure]);
    const itemId = (await loadReviewModel(rig.app.ctx))!.deck[0]!.itemId;
    await seed(rig, [buildRemediationStudiedEvent({ learnerId: 'L1', enrolmentId: 'L1-e1', languageId: 'sq', itemId, failureEventId: failure.id, at: iso(t0 - 3 * MIN), deviceId: 'dev-old' })]);
    const model = (await loadReviewModel(rig.app.ctx))!;
    expect((await planRemediation(rig.app.ctx, model)).items).toEqual([]); // the delay has not elapsed
    rig.clock.set(iso(t0 + 8 * MIN));
    const fresh = await freshModel(rig.app.ctx, model);
    expect(fresh).not.toBe(model);
    expect((await planRemediation(rig.app.ctx, fresh)).items.map((p) => p.item.itemId)).toEqual([itemId]);
  });
});

describe('Start after the screen has been open', () => {
  const startedItems = (rig: Rig): string[] => rig.app.ctx.run.active!.plan.items.map((p) => p.item.itemId);

  it('plans a learning card whose return came due since the details were painted, with no new event', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [cardAdded(A, 'zog', 'meaning-to-form', iso(t0 - 60 * MIN)), reviewed(A, 'zog', 'meaning-to-form', 3, iso(t0 - 2 * MIN))]);
    const model = (await loadReviewModel(rig.app.ctx))!;
    const due = Date.parse(model.deck[0]!.schedule.due);
    expect(due).toBeGreaterThan(t0);
    await rig.go('review/details');
    await until(() => !!rig.root.querySelector('#due-summary'), 'the details');
    expect(rig.q('#count-due').textContent).toBe('0');
    rig.clock.set(iso(due + 1000));
    rig.q('#start-session').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the session starts');
    expect(startedItems(rig).some((id) => id.includes('zog'))).toBe(true);
  });

  it('plans a card whose snooze ended while the details stayed open', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    const before = (await loadReviewModel(rig.app.ctx))!;
    const item = before.deck[0]!;
    const ectx = (await rig.app.ctx.eventContext())!;
    const snooze = rig.app.ctx.engine.controlEvent(ectx, item, { kind: 'snooze', until: iso(t0 + 30 * MIN) })!;
    await rig.app.ctx.record([snooze]);
    await rig.go('review/details');
    await until(() => !!rig.root.querySelector('#due-summary'), 'the details');
    expect(rig.q('#deck li').getAttribute('data-status')).toBe('snoozed');
    rig.clock.set(iso(t0 + 31 * MIN));
    rig.q('#start-session').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the session starts');
    expect(startedItems(rig).some((id) => id.includes('zog'))).toBe(true);
  });

  it('the home: Begin after a learning return came due plans it beside the card that was already ready', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'mace', 'meaning-to-form'), cardAdded(A, 'zog', 'meaning-to-form', iso(t0 - 60 * MIN)), reviewed(A, 'zog', 'meaning-to-form', 3, iso(t0 - 2 * MIN))]);
    const model = (await loadReviewModel(rig.app.ctx))!;
    const due = Date.parse(model.deck.find((i) => i.unitId.includes('zog'))!.schedule.due);
    await reopen(rig);
    await until(() => Number(rig.q('#deck-count').getAttribute('data-cards')) === 1, 'one card ready');
    rig.clock.set(iso(due + 1000));
    rig.q('#start-session').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the session starts');
    const items = startedItems(rig);
    expect(items.some((id) => id.includes('mace'))).toBe(true);
    expect(items.some((id) => id.includes('zog'))).toBe(true);
  });

  it('does not load again when nothing changed and the clock moved a minute', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    await rig.go('review/details');
    await until(() => !!rig.root.querySelector('#due-summary'), 'the details');
    const loads = calls(rig, 'candidates');
    rig.clock.set(iso(t0 + MIN));
    rig.q('#start-session').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the session starts');
    expect(calls(rig, 'candidates')).toBe(loads);
  });

  it('loads again when the preferences changed', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    await rig.go('review/details');
    await until(() => !!rig.root.querySelector('#due-summary'), 'the details');
    const loads = calls(rig, 'candidates');
    const prefs = await rig.app.ctx.state.getPrefs('L1', 'sq');
    await rig.app.ctx.state.setPrefs('L1', { ...prefs, cardsPerDeck: (prefs.cardsPerDeck ?? 10) + 1 });
    rig.q('#start-session').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the session starts');
    expect(calls(rig, 'candidates')).toBeGreaterThan(loads);
  });
});
