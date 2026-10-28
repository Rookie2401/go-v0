// @vitest-environment jsdom
/**
 * The end of a deck (packages/goreview/app/screens/session.ts, summary): "Repeat this deck" asks the same cards again in a new session;
 * "New deck from the weak words" builds a deck of which half (WEAK_SHARE) is the previous deck's weak words, weakest first, and the rest
 * what is due or new next. `weakEntries` (deckModel.ts) decides what counts as weak.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PlannedItem, ReviewResult, SessionPlan } from '../../packages/goreview/src/types';
import { WEAK_SHARE, weakEntries } from '../../packages/goreview/app/deckModel';
import { destroyRigs, dueCard, ids, key, makeRig, shownLabel, startWith, type, unitOf, until, type Rig } from './helpers';

afterEach(() => destroyRigs());

const A = ids('L1', 'sq');
const answerTyped = (rig: Rig, text: string): void => {
  const input = rig.q<HTMLInputElement>('#answer-input');
  type(input, text);
  key('Enter', input);
};
/** Answers every card of the open session: the labels in `wrong` get a wrong answer, the rest the right one; ends on the summary. */
async function playOut(rig: Rig, wrong: readonly string[] = []): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 20 && !rig.root.querySelector('#summary'); i++) {
    await until(() => !!rig.root.querySelector('#session .exercise') || !!rig.root.querySelector('#summary'), 'a card or the summary');
    if (rig.root.querySelector('#summary')) break;
    const label = shownLabel(rig);
    seen.push(label);
    answerTyped(rig, wrong.includes(label) ? 'xxxxxx' : label);
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    rig.q('#next').click();
  }
  await until(() => !!rig.root.querySelector('#summary'), 'the summary');
  return seen;
}
const planUnits = (rig: Rig): string[] => (rig.app.ctx.run.active?.plan.items ?? []).map((p) => p.item.unitId);

describe('weakEntries', () => {
  const item = (label: string): PlannedItem => ({
    item: { itemId: `item:${label}`, unitId: unitOf(label), unitKind: 'lemma', dimension: 'readingRecognition', family: 'meaning-to-form' } as unknown as PlannedItem['item'],
    family: 'meaning-to-form', why: [], estimatedSeconds: 20, isNew: false,
  });
  const plan = { items: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(item) } as unknown as SessionPlan;
  const result = (label: string, outcome: ReviewResult['grading']['outcome'], rating: ReviewResult['rating']): ReviewResult =>
    ({ itemId: `item:${label}`, grading: { outcome }, rating } as unknown as ReviewResult);

  it('takes the cards answered not quite, skipped, partly, hard or not judged, weakest first; a correct card and a card set aside are not weak', () => {
    const weak = weakEntries({
      plan,
      results: [result('a', 'correct', 3), result('b', 'partial', 2), result('c', 'incorrect', 1), result('d', 'correct', 2), result('e', 'ambiguous', null), result('g', 'incorrect', 1)],
      skipped: ['item:f'],
      controls: [{ itemId: 'item:g' }],
    });
    expect(weak.map((w) => [w.label, w.weakness])).toEqual([['c', 'incorrect'], ['f', 'skipped'], ['b', 'partial'], ['d', 'hard'], ['e', 'unjudged']]);
  });

  it('a card asked twice counts by its worse answer; a correct second answer does not clear a first wrong one', () => {
    const weak = weakEntries({ plan, results: [result('a', 'incorrect', 1), result('a', 'correct', 3), result('b', 'correct', 3), result('b', 'correct', 2)], skipped: [], controls: [] });
    expect(weak.map((w) => [w.label, w.weakness])).toEqual([['a', 'incorrect'], ['b', 'hard']]);
  });

  it('the share of a follow-up deck given to the weak words is one half', () => {
    expect(WEAK_SHARE).toBe(0.5);
  });
});

describe('the end of a deck', () => {
  it('names the weak words and begins a new deck that asks them, without the cards answered correctly', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    const first = rig.app.ctx.run.active;
    await playOut(rig, ['zog']);
    expect(rig.q('#summary-next h2').textContent).toBe('Next');
    const note = rig.q('#weak-note').textContent ?? '';
    expect(note).toContain('1 of the 2 cards was weak');
    expect(note).toContain('zog');
    expect(note).not.toContain('mace');
    expect(note).toContain('50% of its cards');
    expect(rig.q<HTMLButtonElement>('#new-deck-weak').disabled).toBe(false);
    rig.q('#new-deck-weak').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the new deck\'s first card');
    expect(rig.app.ctx.run.active).not.toBe(first);
    expect(rig.app.ctx.run.active?.finish).toBeUndefined();
    expect(planUnits(rig)).toEqual([unitOf('zog')]);
    expect(shownLabel(rig)).toBe('zog');
    // the new session runs to its own summary, which counts its own cards
    await playOut(rig);
    expect(rig.q('#sum-answered').textContent).toContain('1 of 1 planned');
    expect(rig.root.querySelector('#summary-next')).not.toBeNull();
  });

  it('with every card correct, the weak-words deck is not offered, and Repeat asks the same cards again', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    const units = planUnits(rig);
    expect(units).toHaveLength(2);
    const first = rig.app.ctx.run.active;
    await playOut(rig);
    expect(rig.q<HTMLButtonElement>('#new-deck-weak').disabled).toBe(true);
    expect(rig.q('#weak-note').textContent).toContain('Every card was answered correctly');
    expect(rig.q('#repeat-deck').getAttribute('aria-label')).toBe('Repeat this deck: the same 2 cards again');
    rig.q('#repeat-deck').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the repeated deck\'s first card');
    expect(rig.app.ctx.run.active).not.toBe(first);
    expect([...planUnits(rig)].sort()).toEqual([...units].sort());
    expect(rig.q('#session-progress').textContent).toContain('of 2');
    const seen = await playOut(rig);
    expect(seen.sort()).toEqual(['mace', 'zog']);
    expect(rig.q('#sum-answered').textContent).toContain('2 of 2 planned, 2 correct');
  });

  it('a summary reopened from the recovered run (a finished session returned to) offers the same actions', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'zog', 'meaning-to-form'));
    await playOut(rig, ['zog']);
    await rig.go('settings');
    await rig.go('review/session');
    await until(() => !!rig.root.querySelector('#summary-next'), 'the summary again');
    rig.q('#new-deck-weak').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the new deck');
    expect(planUnits(rig)).toEqual([unitOf('zog')]);
  });
});
