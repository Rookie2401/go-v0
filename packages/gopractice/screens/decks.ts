/** #/review/decks — the decks the learner saved, newest first: "date · N cards · language", Practise again, Remove. */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { listSavedDecks, planFromSaved, removeSavedDeck, type SavedDeck } from '../deckModel';
import { languageName } from '../format';
import { beginSession, loadReviewModel } from '../workspace';
import type { View } from './view';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const id = await ctx.identity();
  const status = statusLine();
  const list = h('ul', { class: 'decklist', id: 'saved-decks' });
  append(el, [h('p', {}, h('a', { href: '#/review' }, '← GoReview')), h('h2', { class: 'page-title', id: 'decks-title', tabindex: '-1' }, 'Previous decks'), list, status]);
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
    const decks = await listSavedDecks(ctx, id!.learnerId, id!.languageId);
    if (!view.alive()) return;
    clear(list);
    if (!decks.length) { list.append(h('li', { class: 'muted', id: 'decks-empty' }, 'Nothing saved yet. Save a deck from the home and it waits here.')); return; }
    for (const d of decks) {
      const when = new Date(d.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const language = languageName(d.languageId);
      const again = button('Practise again', () => {
        again.disabled = true;
        void practise(d).finally(() => { if (view.alive()) again.disabled = false; });
      }, { class: 'btn small', 'data-action': 'practise-again', 'aria-label': `Practise again: ${when}, ${plural(d.items.length, 'card', 'cards')}` });
      const remove = button('Remove', () => {
        void (async () => {
          await removeSavedDeck(ctx, id!.learnerId, id!.languageId, d.id);
          setStatus(status, 'Deck removed.', 'ok');
          await paint();
        })();
      }, { class: 'linklike', 'data-action': 'remove-deck', 'aria-label': `Remove the deck of ${when}` });
      list.append(h('li', { class: 'deckrow', 'data-deck-id': d.id },
        h('span', { class: 'deckrow-line' }, `${when} · ${plural(d.items.length, 'card', 'cards')} · ${language}`),
        h('span', { class: 'entry-actions' }, again, remove)));
    }
  }
  await paint();
}
