// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { destroyRigs, dueCard, ids, makeRig, reopen, seed, type, until, type Rig } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
const dueMany = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).flatMap((l) => dueCard(A, l, 'meaning-to-form'));
const cards = (rig: Rig): number => Number(rig.q('#deck-count').getAttribute('data-cards'));

function word(label: string, level: UnitKnowledge['level'], encounters: number, at: string): VocabularyItem {
  const unitId = `lemma:sq:${label}:NOUN`;
  return { knowledge: { unitId, languageId: 'sq', level, encounters, firstSeenAt: at, lastSeenAt: at } as UnitKnowledge, unit: { unitId, languageId: 'sq', label, kind: 'lexeme' } as VocabularyItem['unit'], surfaceForms: [label], lastEncounter: at, sources: [] };
}
function useWords(rig: Rig, items: VocabularyItem[]): void {
  const page: VocabularyPage = { items, catalog: { total: items.length, counts: { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } } };
  const api = { vocabulary: vi.fn(async () => ({ ok: true as const, status: 200, data: page })), units: vi.fn(async () => ({ ok: true as const, status: 200, data: { units: {}, missing: [] } })) } as unknown as RepositoryApi;
  rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
}

describe('cards per deck', () => {
  it('defaults to 10; the home sizes the deck to it and carries no deck-size control (Settings keeps the stepper; the owner, 2026-10-28)', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueMany(14));
    await reopen(rig);
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck).toBe(10);
    expect(cards(rig)).toBe(10);
    expect(rig.root.querySelector('#deck-size-link, #deck-size-box, #home-size')).toBeNull();
    expect(rig.q('#review-home').textContent).not.toMatch(/deck size/i);
  });

  it('the typed number and the stepper in Settings change the plan size for the next visit to the home, and the size is clamped to 5 to 60 (no preset pills, 2026-10-28)', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueMany(14));
    await reopen(rig);
    const prefs = async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck;
    await rig.go('settings');
    expect(rig.qa('#settings-prefs .deck-size .stepper-btn').map((b) => b.id)).toEqual(['pref-less', 'pref-more']); // the stepper alone: the 5 · 10 · 15 · 20 · 30 pills are gone
    type(rig.q<HTMLInputElement>('#pref-size'), '5');
    await until(async () => (await prefs()) === 5, 'five');
    await rig.go('review');
    await until(() => cards(rig) === 5, 'five cards');
    await rig.go('settings');
    click(rig.q('#pref-more'));
    await until(async () => (await prefs()) === 6, 'six');
    await rig.go('review');
    await until(() => cards(rig) === 6, 'six cards');
    await rig.go('settings');
    type(rig.q<HTMLInputElement>('#pref-size'), '15');
    await until(async () => (await prefs()) === 15, 'fifteen');
    await rig.go('review');
    await until(() => cards(rig) === 14, 'all fourteen: fewer than the size when there is less material');
    await rig.go('settings');
    type(rig.q<HTMLInputElement>('#pref-size'), '1');
    await until(async () => (await prefs()) === 5, 'the lower clamp');
    type(rig.q<HTMLInputElement>('#pref-size'), '999');
    await until(async () => (await prefs()) === 60, 'the upper clamp');
    await until(() => rig.q<HTMLButtonElement>('#pref-more').disabled, 'the stepper to stop at 60');
  });

  it('tops the schedule up from the vocabulary toward the size, never padding past the words there are', async () => {
    const rig = await makeRig({ signedIn: true });
    useWords(rig, [word('zog', 'seen', 4, '2026-10-05T00:00:00.000Z'), word('mace', 'new', 1, '2026-10-06T00:00:00.000Z'), word('qen', 'new', 1, '2026-10-04T00:00:00.000Z'), word('diell', 'seen', 2, '2026-10-03T00:00:00.000Z')]);
    await rig.app.ctx.state.updatePrefs('L1', 'sq', { cardsPerDeck: 20 });
    await seed(rig, dueMany(2));
    await reopen(rig);
    expect(cards(rig)).toBe(6); // two due cards and the four words
  });

  it('with fewer words than the size the deck is all the words', async () => {
    const rig = await makeRig({ signedIn: true });
    useWords(rig, [word('zog', 'seen', 4, '2026-10-05T00:00:00.000Z'), word('mace', 'new', 1, '2026-10-06T00:00:00.000Z'), word('qen', 'new', 1, '2026-10-04T00:00:00.000Z')]);
    await rig.app.ctx.state.updatePrefs('L1', 'sq', { cardsPerDeck: 30 });
    await reopen(rig);
    expect(cards(rig)).toBe(3);
  });

  it('the saved deck keeps its own size', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueMany(12));
    await rig.app.ctx.state.updatePrefs('L1', 'sq', { cardsPerDeck: 5 });
    await reopen(rig);
    click(rig.q('#save-deck'));
    await until(() => rig.q('#previous-count').textContent === '2 saved', 'the saved deck');
    await rig.app.ctx.state.updatePrefs('L1', 'sq', { cardsPerDeck: 20 });
    await rig.go('review/decks');
    expect(rig.q('[data-deck-id]:not([data-deck-id^="class-essentials"]) .deckrow-line').textContent).toMatch(/ · 5 cards · /);
    click(rig.q('[data-deck-id]:not([data-deck-id^="class-essentials"]) [data-action="practise-again"]'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the session');
    expect(rig.app.ctx.run.active!.plan.items).toHaveLength(5);
  });

  it('migrates an earlier session length to the nearest card count, once', async () => {
    const rig = await makeRig({ signedIn: true });
    const key = 'gopractice:prefs:L1:sq';
    await rig.area.set({ [key]: { languageId: 'sq', sessionMinutes: 15, maxNew: 5, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true } });
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck).toBe(30);
    await rig.app.ctx.state.updatePrefs('L1', 'sq', { cardsPerDeck: 12 });
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck).toBe(12); // not migrated again
    await rig.area.set({ [key]: { languageId: 'sq', sessionMinutes: 0, maxNew: 5 } });
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck).toBe(10); // flexible time reads as the default
    await rig.area.set({ [key]: { languageId: 'sq', sessionMinutes: 120 } });
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck).toBe(60);
  });

  it('with a session open a new size set in Settings is kept for the next deck; the open session stays resumable', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueMany(12));
    await reopen(rig);
    click(rig.q('#start-session'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the session');
    await rig.go('settings');
    type(rig.q<HTMLInputElement>('#pref-size'), '5');
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck === 5, 'the new size');
    await rig.go('review');
    await until(() => !!rig.root.querySelector('[data-action="resume-session"]'), 'the resumable session');
    expect(rig.root.querySelector('#deck-size-link')).toBeNull();
  });

  it('is operable and named: a labelled stepper in Settings (no pills anywhere, nothing on the home), a 44 px target in standalone mode', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    expect(rig.q('#pref-less').getAttribute('aria-label')).toBe('Fewer cards per deck');
    expect(rig.q('#pref-more').getAttribute('aria-label')).toBe('More cards per deck');
    expect(rig.q('#pref-size').getAttribute('aria-label')).toBe('Cards per deck');
    expect(rig.qa('.deck-size .pill')).toEqual([]);
    expect(rig.q('#pref-size').closest('[role="group"]')?.getAttribute('aria-label')).toBe('Cards per deck');
    click(rig.q('#pref-more'));
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck === 11, 'one more');
    expect(rig.q<HTMLInputElement>('#pref-size').value).toBe('11');
    await rig.go('review');
    expect(rig.root.querySelector('#deck-size-box, #deck-size-link')).toBeNull(); // the home has no stepper of its own since 2026-10-28
    const css = readFileSync('packages/goreview/app/styles.css', 'utf8');
    expect(css).toMatch(/@media \(pointer: coarse\), \(display-mode: standalone\) \{[^]*?\.stepper-btn \{ width: 2\.75rem; height: 2\.75rem; \}/);
    expect(css).not.toMatch(/\.pill\b/);
    expect(css).not.toMatch(/\.deck-size-(box|line)/);
  });
});
