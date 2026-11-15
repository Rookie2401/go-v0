// @vitest-environment jsdom
/**
 * Save Deck at the end of a session (the owner, 2026-11-14: "When the user goes through either his current deck or review deck, add the
 * option to save the deck at the end"). The Saved Decks redesign of the same day had taken the page's own Save Current Deck button away, so
 * this is the one place a learner saves a deck.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { registry } from '../../packages/goreview/src';
import { decksKey, type SavedDeck } from '../../packages/goreview/app/deckModel';
import { renderSummary } from '../../packages/goreview/app/screens/session';
import { destroyRigs, dueCard, ids, key, makeRig, queued, reopen, reviewed, seed, shownLabel, startWith, type, until, type Rig } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
const store = async (rig: Rig): Promise<{ decks: SavedDeck[]; holdOut: string[] }> => {
  const k = decksKey('L1', 'sq');
  const raw = (await rig.area.get(k))[k] as { decks?: SavedDeck[]; holdOut?: string[] } | undefined;
  return { decks: raw?.decks ?? [], holdOut: raw?.holdOut ?? [] };
};
const own = async (rig: Rig): Promise<SavedDeck[]> => (await store(rig)).decks.filter((d) => !d.builtin);
async function playOut(rig: Rig): Promise<void> {
  for (let i = 0; i < 20 && !rig.root.querySelector('#summary'); i++) {
    await until(() => !!rig.root.querySelector('#session .exercise') || !!rig.root.querySelector('#summary'), 'a card or the summary');
    if (rig.root.querySelector('#summary')) break;
    const input = rig.q<HTMLInputElement>('#answer-input');
    type(input, shownLabel(rig));
    key('Enter', input);
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    click(rig.q('#next'));
  }
  await until(() => !!rig.root.querySelector('#summary'), 'the summary');
}
const tiles = (rig: Rig): string[] => rig.qa('#summary-next > .deck-tile > .deck-face').map((face) => face.id);
const waitForNext = (rig: Rig): Promise<void> => until(() => !!rig.root.querySelector('#continue-due-work'), 'the next-deck options');

describe('Save Deck at the end of a session', () => {
  it('after a Current Deck: offered beside Next Deck, saves the deck\'s own cards once, and says so', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    const planned = rig.app.ctx.run.active!.plan.items.map((p) => p.item.itemId);
    await playOut(rig);
    await waitForNext(rig);
    expect(tiles(rig)).toEqual(['continue-due-work', 'save-session-deck', 'open-remediation', 'back-to-review']); // Next Deck stays first
    const save = rig.q<HTMLButtonElement>('#save-session-deck');
    expect(save.querySelector('.deck-title')!.textContent).toBe('Save Deck');
    expect(save.querySelector('.deck-caption')!.textContent).toBe('Keep these 2 cards in Saved Decks');
    expect(save.getAttribute('aria-label')).toBe('Save Deck. Keep these 2 cards in Saved Decks');
    expect(await own(rig)).toHaveLength(0); // nothing is saved until it is asked for

    click(save);
    await until(() => rig.q('#save-deck-tile').getAttribute('data-save-state') === 'saved', 'the deck to be saved');
    // the summary is drawn again when the save is recorded, so the tile on the page is a new one: it says Saved, and so would any other
    const saved = rig.q<HTMLButtonElement>('#save-session-deck');
    expect(saved.disabled).toBe(true);
    expect(saved.querySelector('.deck-title')!.textContent).toBe('Deck Saved');
    expect(saved.querySelector('.deck-caption')!.textContent).toBe('2 cards · find it in Saved Decks');
    expect(rig.q('#save-deck-tile [role="status"]').textContent).toBe('Deck saved: 2 cards, in Saved Decks.');
    expect(rig.qa('#save-session-deck')).toHaveLength(1);
    expect(tiles(rig)).toEqual(['continue-due-work', 'save-session-deck', 'open-remediation', 'back-to-review']);
    const decks = await own(rig);
    expect(decks).toHaveLength(1);
    expect(decks[0].items.map((i) => i.itemId)).toEqual(planned);
    expect(decks[0].languageId).toBe('sq');
    expect((await queued(rig)).some((e) => e.kind === 'PreferenceChanged' && String(e.payload.key).endsWith(decks[0].id))).toBe(true); // it goes to the account, for the other devices
    click(saved); click(save); // a second press does nothing, on the tile now shown or on the one first pressed
    await new Promise((r) => setTimeout(r, 20));
    expect(await own(rig)).toHaveLength(1);

    await rig.go('review/decks');
    await until(() => rig.qa('#saved-decks .deck-tile').length === 3, 'the saved deck in Saved Decks');
    expect(rig.q(`[data-deck-id="${decks[0].id}"] .deck-caption`).textContent).toBe('2 cards · Albanian');
  });

  it('saving a finished deck holds nothing back: the next deck is what it would have been', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form'), ...dueCard(A, 'qen', 'meaning-to-form')]);
    await playOut(rig);
    await waitForNext(rig);
    const before = rig.q('#continue-due-work').getAttribute('aria-label');
    const line = rig.q('#next-deck-line').textContent;
    click(rig.q('#save-session-deck'));
    await until(() => rig.q('#save-deck-tile').getAttribute('data-save-state') === 'saved', 'the deck to be saved');
    expect((await store(rig)).holdOut).toEqual([]); // the page's old button held the saved words out of the next deck; this one does not
    await reopen(rig);
    const home = Number(rig.q('#start-session').getAttribute('data-cards'));
    const fresh = await makeRig({ signedIn: true });
    await startWith(fresh, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form'), ...dueCard(A, 'qen', 'meaning-to-form')]);
    await playOut(fresh);
    await waitForNext(fresh);
    expect(fresh.q('#continue-due-work').getAttribute('aria-label')).toBe(before); // the same next deck with and without the save
    expect(fresh.q('#next-deck-line').textContent).toBe(line);
    await reopen(fresh);
    expect(Number(fresh.q('#start-session').getAttribute('data-cards'))).toBe(home);
  });

  it('after a Review Deck too, and when the session was ended early: the deck is the planned cards', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    const words = ['mikut', 'qen', 'dhi'];
    await seed(rig, words.flatMap((w) => [...dueCard(A, w, 'written-recognition'), reviewed(A, w, 'written-recognition', 4, '2026-09-02T10:00:00.000Z')]));
    await reopen(rig);
    expect(Number(rig.q('#start-review').getAttribute('data-cards'))).toBe(3);
    click(rig.q('#start-review'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the first review card');
    const planned = rig.app.ctx.run.active!.plan.items.map((p) => p.item.unitId);
    expect(planned).toHaveLength(3);
    click(rig.q('#finish-early'));
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    expect(rig.q('#sum-label').textContent).toBe('Session ended early');
    expect(rig.q('#save-session-deck .deck-caption').textContent).toBe('Keep these 3 cards in Saved Decks');
    click(rig.q('#save-session-deck'));
    await until(() => rig.q('#save-deck-tile').getAttribute('data-save-state') === 'saved', 'the deck to be saved');
    expect((await own(rig))[0].items.map((i) => i.unitId)).toEqual(planned);
  });

  it('is not offered after a saved deck, Class Essentials or the Alphabet: those are saved already', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    for (const deckId of ['class-essentials:sq', 'alphabet:sq']) {
      await rig.go('review/decks');
      await until(() => !!rig.root.querySelector(`[data-deck-id="${deckId}"]`), deckId);
      click(rig.q(`[data-deck-id="${deckId}"] [data-action="practise-again"]`));
      await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), `the first card of ${deckId}`);
      click(rig.q('#finish-early'));
      await until(() => !!rig.root.querySelector('#summary'), 'the summary');
      await until(() => !!rig.root.querySelector('#back-to-review'), 'the way back');
      expect(rig.root.querySelector('#save-session-deck'), deckId).toBeNull();
      await rig.go('review');
    }
    expect(await own(rig)).toHaveLength(0);
  });

  it('a summary drawn again after the save still says Deck Saved and cannot save a second copy', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    const run = rig.app.ctx.run.active!;
    await playOut(rig);
    click(rig.q('#save-session-deck'));
    await until(() => rig.q('#save-deck-tile').getAttribute('data-save-state') === 'saved', 'the deck to be saved');
    const again = document.createElement('div');
    await renderSummary(again, rig.app.ctx, run); // as a live update redraws it
    const save = again.querySelector<HTMLButtonElement>('#save-session-deck')!;
    expect(save.disabled).toBe(true);
    expect(save.querySelector('.deck-title')!.textContent).toBe('Deck Saved');
    click(save);
    await new Promise((r) => setTimeout(r, 20));
    expect(await own(rig)).toHaveLength(1);
  });
});
