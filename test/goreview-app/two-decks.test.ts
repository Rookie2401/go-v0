// @vitest-environment jsdom
/**
 * The home's two decks (the owner, 2026-10-31): the Review Deck holds the spaced reviews that are due; the Current Deck holds what is
 * still being drilled (new words, learning and relearning returns), with Begin new deck beside it drawing a fresh set of new words.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { decksKey, holdOutOf, planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { candidate, defaultService, destroyRigs, dueCard, ids, knowledgeRow, makeRig, reopen, reviewed, seed, until, type FakeService, type Rig } from './helpers';

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
    expect(rig.q('#start-review-count').textContent).toBe('1 card due');

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
