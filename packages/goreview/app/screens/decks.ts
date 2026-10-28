/**
 * #/review/decks — Saved decks: the decks the learner saved, newest first ("date · N cards · language"), and Class Essentials, the built-in deck
 * for the language: its name as a bigger, friendlier title over "N cards · language", with no description or note on this page (the owner,
 * 2026-10-28; the deck keeps both in its record). The card itself is the control: pressing it starts the practice (no "Practise again"
 * button, the owner, 2026-10-28), and Remove sits at the card's top right. A removed Class Essentials can be restored.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { classEssentialsRemoved, listSavedDecks, planFromSaved, removeSavedDeck, restoreClassEssentials, type SavedDeck } from '../deckModel';
import { languageName } from '../format';
import { beginSession, loadReviewModel } from '../workspace';
import type { View } from './view';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const id = await ctx.identity();
  const status = statusLine();
  const list = h('ul', { class: 'decklist', id: 'saved-decks' });
  const restoreBox = h('p', { class: 'restore-line' });
  append(el, [h('h2', { class: 'page-title', id: 'decks-title', tabindex: '-1' }, 'Saved decks'), list, restoreBox, status]);
  if (!id) { list.replaceWith(p('Choose a language to see its saved decks.', 'muted')); return; }

  async function practise(saved: SavedDeck): Promise<void> {
    const model = await loadReviewModel(ctx);
    if (!model) { setStatus(status, 'Choose a language first.', 'error'); return; }
    const plan = await planFromSaved(ctx, model, saved);
    if (!plan.items.length) { setStatus(status, 'None of these cards can be asked right now.', 'info'); return; }
    const r = await beginSession(ctx, model, { plan });
    if (!r.ok) { setStatus(status, r.message, 'info'); return; }
    ctx.run.active = r.run;
    ctx.go('review/session');
  }

  async function paint(): Promise<void> {
    const decks = await listSavedDecks(ctx, id!.learnerId, id!.languageId, id!.varietyId);
    const removed = await classEssentialsRemoved(ctx, id!.learnerId, id!.languageId);
    if (!view.alive()) return;
    clear(list); clear(restoreBox);
    if (removed) restoreBox.append(button('Restore Class Essentials', () => { void (async () => { await restoreClassEssentials(ctx, id!.learnerId, id!.languageId); setStatus(status, 'Class Essentials is back.', 'ok'); await paint(); })(); }, { class: 'linklike', id: 'restore-class-essentials' }));
    if (!decks.length) { list.append(h('li', { class: 'muted', id: 'decks-empty' }, 'Nothing saved yet. Save a deck from the home and it waits here.')); return; }
    for (const d of decks) {
      const when = d.name ?? new Date(d.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const language = languageName(d.languageId);
      const remove = button('Remove', () => {
        void (async () => {
          await removeSavedDeck(ctx, id!.learnerId, id!.languageId, d.id);
          setStatus(status, 'Deck removed.', 'ok');
          await paint();
        })();
      }, { class: 'linklike deckrow-remove', 'data-action': 'remove-deck', 'aria-label': `Remove the deck of ${when}` });
      const builtin = d.builtin === 'class-essentials';
      // the whole card is the button that starts the practice; its visible text is its name, with "press to practise" for a screen reader
      const open = h('button', { type: 'button', class: 'deckrow-open', 'data-action': 'practise-again' },
        h('span', { class: 'deckrow-body' },
          builtin ? h('span', { class: 'deckrow-title' }, when) : null,
          h('span', { class: 'deckrow-line' }, builtin ? `${plural(d.items.length, 'card', 'cards')} · ${language}` : `${when} · ${plural(d.items.length, 'card', 'cards')} · ${language}`),
          !builtin && d.description ? h('span', { class: 'deckrow-note' }, d.description) : null,
          !builtin && d.notes ? h('span', { class: 'deckrow-note deckrow-fine' }, d.notes) : null),
        h('span', { class: 'sr' }, ', press to practise')) as HTMLButtonElement;
      open.addEventListener('click', () => {
        open.disabled = true;
        void practise(d).finally(() => { if (view.alive()) open.disabled = false; });
      });
      list.append(h('li', { class: builtin ? 'deckrow deckrow-builtin' : 'deckrow', 'data-deck-id': d.id }, open, remove));
    }
  }
  await paint();
  // a live update (or a sync from another tab) may have changed what is saved: the list is read again, in place
  view.onDispose(ctx.onData(() => { void paint(); }));
}
