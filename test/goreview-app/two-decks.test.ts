// @vitest-environment jsdom
/**
 * The home's two decks (the owner, 2026-10-31): the Review Deck holds the spaced reviews that are due; the Current Deck holds what is
 * still being drilled (new words, learning and relearning returns), with Begin new deck beside it drawing a fresh set of new words.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { decksKey, holdOutOf, planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import type { GoEvent } from '../../packages/repository-contract/src';
import { candidate, cardAdded, defaultService, destroyRigs, dueCard, ids, knowledgeRow, makeRig, reopen, reviewed, seed, until, type FakeService, type Rig } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
const cards = (rig: Rig, id: string): number => Number(rig.q(`#${id}`).getAttribute('data-cards'));
const PREFS = { languageId: 'sq', sessionMinutes: 0, maxNew: 5, cardsPerDeck: 5, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true, practiceGoals: ['recognition' as const] };
/** Candidates the Repository proposes, each a word read before (recognized), so intake admits it as a new card. */
const offer = (service: FakeService, labels: string[]): void => {
  const proposed = labels.map((l, i) => candidate(l, 0.9 - i * 0.05));
  service.candidates.set('L1-e1', proposed);
  service.knowledge.set('L1', proposed.map((c) => ({ ...knowledgeRow('L1', c.unitId, 'sq', {}), level: 'recognized' as const })));
};
const newUnits = async (rig: Rig): Promise<string[]> => {
  const model = (await loadReviewModel(rig.app.ctx))!;
  const deck = await planCurrentDeck(rig.app.ctx, model, await holdOutOf(rig.app.ctx, 'L1', 'sq'), undefined, 'current');
  return deck.plan.items.filter((p) => p.isNew).map((p) => p.item.unitId);
};

describe('the two decks on the GoReview home', () => {
  it('a spaced review that is due goes to the Review Deck; a card answered Again stays in the Current Deck', async () => {
    const rig = await makeRig({ signedIn: true });
    // zog: answered Again, so it is still being drilled; mace: Again, then Easy a day later, so it is an established review that has come due
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form'), reviewed(A, 'mace', 'meaning-to-form', 4, '2026-09-02T10:00:00.000Z')]);
    await reopen(rig);
    expect(cards(rig, 'start-session')).toBe(1);
    expect(cards(rig, 'start-review')).toBe(1);
    expect(rig.q('#start-review-count').textContent).toBe('1 card'); // the count of the deck, never "due" (a deck may hold deck-fill)

    click(rig.q('#start-review'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the review session');
    const plan = rig.app.ctx.run.active!.plan;
    expect(plan.items.map((p) => p.item.unitId)).toHaveLength(1);
    expect(plan.items[0].item.unitId).toContain('mace');
  });

  it('new words go to the Current Deck, never to the Review Deck', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', PREFS);
    offer(service, ['det', 'diell', 'hene']);
    await reopen(rig);
    expect(cards(rig, 'start-session')).toBeGreaterThan(0);
    expect(cards(rig, 'start-review')).toBe(0);
    expect(rig.q<HTMLButtonElement>('#start-review').disabled).toBe(true);
  });

  it('Begin new deck starts a fresh set of new words, and the words it set aside go back into the pool', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', PREFS);
    offer(service, ['det', 'diell', 'hene', 'yll', 'qiell', 'mal', 'lum', 'pyll', 'fushe', 'det2', 're', 'shi']);
    await reopen(rig);
    const first = await newUnits(rig);
    expect(first.length).toBeGreaterThan(0);

    click(rig.q('#start-new'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), `the new deck: ${rig.q('#review-home .status').textContent}`);
    const fresh = rig.app.ctx.run.active!.plan.items.filter((p) => p.isNew).map((p) => p.item.unitId);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.filter((u) => first.includes(u))).toEqual([]); // a fresh set, not the deck it replaced
    expect([...(await holdOutOf(rig.app.ctx, 'L1', 'sq'))]).toEqual([]); // the set-aside words are back in the pool
  });

  it('with no other new word ready, Begin new deck leaves the Current Deck as it is and says so', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', PREFS);
    offer(service, ['det', 'diell']);
    await reopen(rig);
    const before = cards(rig, 'start-session');
    expect(before).toBeGreaterThan(0); // the two words are the whole Current Deck: there is no other set to draw
    click(rig.q('#start-new'));
    await until(() => /No other new words are ready/.test(rig.q('#review-home .status').textContent ?? ''), 'the message');
    expect(rig.app.current()).toBe('review');
    expect(cards(rig, 'start-session')).toBe(before);
    const key = decksKey('L1', 'sq');
    expect(((await rig.area.get(key))[key] as { holdOut?: string[] } | undefined)?.holdOut ?? []).toEqual([]);
  });
});

describe('deck fill: each deck is always the size the learner set (the owner, 2026-11-03)', () => {
  const labels = (n: number, prefix: string): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  /** A card answered Easy a few days ago: an established spaced review that is not due for a good while. */
  const spaced = (label: string, day: string): GoEvent[] => [cardAdded(A, label, 'meaning-to-form', '2026-09-01T09:00:00.000Z'), reviewed(A, label, 'meaning-to-form', 4, `2026-10-${day}T10:00:00.000Z`)];
  /** A card answered Good six minutes ago: still in its learning steps, with its return not yet due. */
  const stepping = (label: string): GoEvent[] => [cardAdded(A, label, 'meaning-to-form', '2026-09-01T09:00:00.000Z'), reviewed(A, label, 'meaning-to-form', 3, '2026-10-08T09:54:00.000Z')];
  const planOf = async (rig: Rig, part: 'current' | 'review') => {
    const model = (await loadReviewModel(rig.app.ctx))!;
    return { model, deck: await planCurrentDeck(rig.app.ctx, model, await holdOutOf(rig.app.ctx, 'L1', 'sq'), undefined, part) };
  };

  it('the Review Deck fills with early spaced reviews, soonest due first, up to the size', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', PREFS);
    // one established review that is due, and seven that are not
    await seed(rig, [...dueCard(A, 'mace', 'meaning-to-form'), reviewed(A, 'mace', 'meaning-to-form', 4, '2026-09-02T10:00:00.000Z'),
      ...labels(7, 'later').flatMap((l, i) => spaced(l, `0${1 + (i % 7)}`))]);
    await reopen(rig);
    expect(cards(rig, 'start-review')).toBe(5);
    const { model, deck } = await planOf(rig, 'review');
    const items = deck.plan.items;
    expect(items).toHaveLength(5);
    expect(items[0].item.unitId).toContain('mace');
    expect(items[0].presentationReason).not.toBe('deck-fill'); // the due review is an obligation
    const fill = items.slice(1);
    expect(fill.every((p) => p.presentationReason === 'deck-fill' && p.intent?.kind === 'explicit' && !p.isNew)).toBe(true);
    const dues = fill.map((p) => Date.parse(p.item.schedule.due));
    expect(dues).toEqual([...dues].sort((a, b) => a - b)); // soonest due first
    const rest = model.deck.filter((d) => !items.some((p) => p.item.itemId === d.itemId) && d.schedule.phase === 'review').map((d) => Date.parse(d.schedule.due));
    expect(rest.every((t) => t >= Math.max(...dues))).toBe(true); // nothing sooner was left out
    expect(deck.plan.dueCount).toBe(1);
    expect(deck.summary.dueReviews).toBe(1); // the home still counts only what is due
  });

  it('the Current Deck takes learning returns first, then spaced reviews, so it is full', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', PREFS);
    // zog: due learning return (answered Again long ago); two cards in their learning steps, not yet due; four spaced reviews, not due
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...stepping('step1'), ...stepping('step2'),
      ...spaced('rev1', '05'), ...spaced('rev2', '02'), ...spaced('rev3', '06'), ...spaced('rev4', '01')]);
    await reopen(rig);
    expect(cards(rig, 'start-session')).toBe(5);
    const { deck } = await planOf(rig, 'current');
    const items = deck.plan.items;
    expect(items).toHaveLength(5);
    expect(items[0].item.unitId).toContain('zog');
    expect(items[0].presentationReason).toBe('due-learning-return');
    expect(items.slice(1, 3).map((p) => p.item.unitId.split(':')[2]).sort()).toEqual(['step1', 'step2']); // learning returns first
    expect(items.slice(1, 3).every((p) => p.queue === 'learning' && p.presentationReason === 'deck-fill')).toBe(true);
    expect(items.slice(3).every((p) => p.presentationReason === 'deck-fill' && p.item.schedule.phase === 'review')).toBe(true); // then spaced reviews
    const due = items.slice(3).map((p) => Date.parse(p.item.schedule.due));
    expect(due).toEqual([...due].sort((a, b) => a - b));
    expect(deck.plan.dueCount).toBe(1);
    expect(deck.plan.newCount).toBe(0);
  });

  it('a deck that due work already fills gets no fill, and the Current Deck never borrows Class Essentials or set-aside cards', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', PREFS);
    await seed(rig, [...labels(5, 'due').flatMap((l) => dueCard(A, l, 'meaning-to-form')), ...spaced('later', '05')]);
    await reopen(rig);
    const { deck } = await planOf(rig, 'current');
    expect(deck.plan.items).toHaveLength(5);
    expect(deck.plan.items.some((p) => p.presentationReason === 'deck-fill')).toBe(false);
  });
});
