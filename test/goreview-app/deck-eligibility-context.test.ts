// @vitest-environment jsdom
/**
 * The home's deck summary checks every reviewed card's eligibility (due now; able to become due). Measured on a phone-speed profile with a
 * learner who had a few hundred reviewed cards (2026-11-09, the owner: "it still takes far too long to load"): each check sorted and
 * re-selected the whole review history on its own, 15 s before the home appeared. The checks now share one set of evidence indexes per model.
 */
import { afterEach, expect, it, vi } from 'vitest';

const selectionCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../packages/repository-contract/src', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/repository-contract/src')>();
  return { ...actual, selectReviewEvidenceEvents: (events: Parameters<typeof actual.selectReviewEvidenceEvents>[0]) => {
    selectionCalls.count += 1;
    return actual.selectReviewEvidenceEvents(events);
  } };
});

import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { cardAdded, destroyRigs, ids, makeRig, reviewed, seed } from './helpers';

afterEach(() => destroyRigs());

it('checks the eligibility of many reviewed cards with a bounded number of history selections, and still counts the due ones', async () => {
  const rig = await makeRig({ signedIn: true });
  const A = ids('L1', 'sq');
  const now = rig.clock.now.getTime();
  const iso = (msAgo: number): string => new Date(now - msAgo).toISOString();
  const events = Array.from({ length: 60 }, (_, i) => [
    cardAdded(A, `w${i}`, 'meaning-to-form', iso(40 * 86_400_000)),
    // half answered long ago (due again now), half answered an hour ago (due later)
    reviewed(A, `w${i}`, 'meaning-to-form', 3, iso(i % 2 ? 30 * 86_400_000 : 3_600_000)),
  ]).flat();
  await seed(rig, events);
  const model = await loadReviewModel(rig.app.ctx);
  expect(model?.deck.filter((item) => item.history.length > 0).length).toBe(60);

  selectionCalls.count = 0;
  const deck = await planCurrentDeck(rig.app.ctx, model!);
  // before: well over one selection per reviewed card (121 with these 60); now a few for the whole deck
  expect(selectionCalls.count).toBeLessThan(10);
  expect(deck.summary.dueReviews + deck.summary.dueLearning).toBeGreaterThan(0);
});
