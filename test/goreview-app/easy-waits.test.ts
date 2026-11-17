// @vitest-environment jsdom
/**
 * The owner, 2026-11-17: "If I say a word was easy, it appears far too often again ... an easy word comes up infrequently, giving way for
 * other words. One exception: if the word was previously marked difficult." The scheduler already gives an Easy answer a long interval;
 * what brought Easy words back was deck fill (2026-11-03), which topped each deck up with not-yet-due cards. A card whose latest answer
 * was Easy is no longer fill, unless it was once answered Again or Hard. Through the real home: the Current Deck and the Review Deck.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { holdOutOf, planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import type { GoEvent } from '../../packages/repository-contract/src';
import { cardAdded, destroyRigs, dueCard, ids, makeRig, reopen, reviewed, seed, type Rig } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const PREFS = { languageId: 'sq', sessionMinutes: 0, maxNew: 5, cardsPerDeck: 6, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true, practiceGoals: ['recognition' as const] };
/** A card with these answers, a few days ago and an hour apart; all of them leave it in the review phase and not due on 2026-10-08. */
const card = (label: string, day: string, ratings: (1 | 2 | 3 | 4)[]): GoEvent[] => [cardAdded(A, label, 'meaning-to-form', '2026-09-01T09:00:00.000Z'),
  ...ratings.map((r, k) => reviewed(A, label, 'meaning-to-form', r, `2026-10-${day}T${String(9 + k * 6).padStart(2, '0')}:00:00.000Z`))];
const labelOf = (unitId: string): string => unitId.split(':')[2]!;

async function decks(rig: Rig) {
  const model = (await loadReviewModel(rig.app.ctx))!;
  const held = await holdOutOf(rig.app.ctx, 'L1', 'sq');
  const current = await planCurrentDeck(rig.app.ctx, model, held, undefined, 'current');
  const review = await planCurrentDeck(rig.app.ctx, model, held, undefined, 'review');
  const fill = (d: typeof current) => d.plan.items.filter((p) => p.presentationReason === 'deck-fill').map((p) => labelOf(p.item.unitId)).sort();
  return { model, current, review, fill };
}

describe('an Easy word waits for its due time (the owner, 2026-11-17)', () => {
  it('a word only ever answered Easy is in neither deck before it is due; one once answered Hard or Again still fills; Good words fill as before', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', PREFS);
    await seed(rig, [
      ...dueCard(A, 'due', 'meaning-to-form'), reviewed(A, 'due', 'meaning-to-form', 4, '2026-09-02T10:00:00.000Z'), // an established review that is due
      ...card('easy1', '05', [4]), ...card('easy2', '06', [4]),           // only ever Easy: wait
      ...card('hard-then-easy', '07', [2, 4]),                            // once difficult: may still be practised early
      ...card('again-then-easy', '07', [1, 3, 4]),                        // once difficult: may still be practised early
      ...card('good', '06', [4, 3]),                                       // latest Good: fills as before
    ]);
    await reopen(rig);
    const { model, current, review, fill } = await decks(rig);
    const notDue = model.deck.filter((i) => Date.parse(i.schedule.due) > Date.parse(model.now)).map((i) => labelOf(i.unitId)).sort();
    expect(notDue).toEqual(['again-then-easy', 'easy1', 'easy2', 'good', 'hard-then-easy']);
    const planned = [...current.plan.items, ...review.plan.items].map((p) => labelOf(p.item.unitId));
    expect(planned).not.toContain('easy1');
    expect(planned).not.toContain('easy2');
    expect(fill(review)).toEqual(['again-then-easy', 'good', 'hard-then-easy']);
    expect(review.plan.items.filter((p) => p.presentationReason !== 'deck-fill').map((p) => labelOf(p.item.unitId))).toEqual(['due']);
  });

  it('while an Easy word waits, the home does not say the Current Deck holds all of the learner\'s cards', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', PREFS);
    await seed(rig, [...card('good1', '05', [4, 3]), ...card('good2', '06', [4, 3]), ...card('easy', '06', [4])]);
    await reopen(rig);
    const kicker = rig.q('#start-session-count').textContent ?? '';
    expect(rig.q('#start-session').getAttribute('data-cards')).toBe('2');
    expect(kicker).not.toMatch(/all \d+ of your cards|your only one/);
  });
});
