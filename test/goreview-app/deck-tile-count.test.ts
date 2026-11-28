// @vitest-environment jsdom
/**
 * The Current Deck tile counts only the cards the session will ask (2026-11-27): a card whose exercise cannot be built (a word the deck gate holds
 * back) was counted by the tile and then skipped by the session, so "10 cards" became 7 to 9 questions.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ExerciseBuilder } from '../../packages/goreview/src';
import { FAKE_BUILDERS, dueCard, destroyRigs, ids, makeRig, reopen, seed, until } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();

describe('the Current Deck tile', () => {
  it('does not count a card whose exercise cannot be built', async () => {
    const builders: ExerciseBuilder[] = FAKE_BUILDERS.map((b) => ({ ...b, canBuild: (target) => !target.unitId.includes('mace') }));
    const rig = await makeRig({ signedIn: true, builders });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    expect(Number(rig.q('#start-session').getAttribute('data-cards')), 'the tile counts what will be asked').toBe(1);
    click(rig.q('#start-session'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the session');
    expect(rig.q('#session .exercise').textContent, 'the session asks the word that can be built (zog is a bird)').toContain('bird');
  });
});
