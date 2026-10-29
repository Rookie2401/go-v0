// @vitest-environment jsdom
/**
 * The home remembers its last paint for ten minutes (home-reload.test.ts). A short learning return that falls due inside those minutes
 * must still reach the learner: the memo is dropped, and Begin plans with the card, once a card's due time has passed since the model
 * was folded (the stale-home defect found in the 2026-10-29 trace: the memo compared preferences and event count only).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { scheduleMovedSince } from '../../packages/goreview/app/screens/review';
import type { DeckItem } from '../../packages/goreview/src/types';
import { cardAdded, destroyRigs, ids, makeRig, reviewed, seed, until } from './helpers';

afterEach(() => { destroyRigs(); });
const A = ids('L1', 'sq');
const MIN = 60_000;

describe('the home after a learning return comes due', () => {
  it('drops the memo and shows the card once its return fell due while the memo held; Begin then plans with it', async () => {
    const rig = await makeRig({ signedIn: true });
    const t0 = rig.clock.now.getTime();
    // a card answered Good a few minutes ago: its next step is due soon, after "now"
    await seed(rig, [cardAdded(A, 'zog', 'meaning-to-form', new Date(t0 - 60 * MIN).toISOString()), reviewed(A, 'zog', 'meaning-to-form', 3, new Date(t0 - 2 * MIN).toISOString())]);
    const model = await loadReviewModel(rig.app.ctx);
    const due = Date.parse(model!.deck[0]!.schedule.due);
    expect(due).toBeGreaterThan(t0);
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#deck-count'), 'the home');
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBe(0);
    // the return falls due; nothing else changes (same events, same preferences), so the memo would still hold
    rig.clock.set(new Date(due + 1000).toISOString());
    await rig.go('settings');
    await rig.go('review');
    await until(() => Number(rig.q('#deck-count').getAttribute('data-cards')) > 0, 'the return on the home');
    rig.q('#start-session').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the session starts with the returned card');
    expect(rig.q('.exercise').getAttribute('data-item')).toContain('zog');
  });

  it('the rule: moved only when an active card\'s due time lies after the fold and at or before now; dismissed, suspended and still-future cards do not count', () => {
    const at = (offsetMs: number): string => new Date(Date.UTC(2026, 9, 8, 10, 0, 0) + offsetMs).toISOString();
    const item = (due: string, status: DeckItem['status'] = 'active'): DeckItem => ({ schedule: { due }, status } as unknown as DeckItem);
    const model = (deck: DeckItem[], classDeck?: DeckItem[]) => ({ now: at(0), deck, classDeck });
    const now = Date.parse(at(8 * MIN));
    expect(scheduleMovedSince(model([item(at(5 * MIN))]), now)).toBe(true);
    expect(scheduleMovedSince(model([item(at(8 * MIN))]), now)).toBe(true); // due exactly now
    expect(scheduleMovedSince(model([item(at(9 * MIN))]), now)).toBe(false); // still ahead
    expect(scheduleMovedSince(model([item(at(-MIN))]), now)).toBe(false); // was due already when the model was folded: the plan has it
    expect(scheduleMovedSince(model([item(at(5 * MIN), 'suspended'), item(at(5 * MIN), 'dismissed'), item(at(5 * MIN), 'snoozed')]), now)).toBe(false);
    expect(scheduleMovedSince(model([], [item(at(5 * MIN))]), now)).toBe(true); // a Class Essentials return counts too
    expect(scheduleMovedSince(model([]), now)).toBe(false);
  });
});
