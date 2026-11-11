/**
 * #/review/decks — Saved decks: the decks the learner saved, newest first ("date · N cards · language"), and Class Essentials, the built-in deck
 * for the language: its name as a bigger, friendlier title over "N cards · language", with no description or note on this page (the owner,
 * 2026-10-28; the deck keeps both in its record). The card itself is the control: pressing it starts the practice (no "Practise again"
 * button, the owner, 2026-10-28), and Remove sits at the card's top right. A removed Class Essentials can be restored. Under the Class
 * Essentials card: its due reviews ("Review due (N)") and its missed phrases (moved here from the home, the owner, 2026-10-31).
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { classEssentialsRemoved, effectiveRemediation, listSavedDecks, planClassEssentialsDue, planFromSaved, removeSavedDeck, restoreClassEssentials, type SavedDeck } from '../deckModel';
import { classLanguageOf } from '../classEssentials';
import { languageName } from '../format';
import { beginSession, currentReviewModel, PRESS_WAIT_MS } from '../workspace';
import { recordSavedDeckChange } from '../savedDeckSync';
import type { View } from './view';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const id = await ctx.identity();
  const status = statusLine();
  const list = h('ul', { class: 'decklist', id: 'saved-decks' });
  const restoreBox = h('p', { class: 'restore-line' });
  append(el, [h('h2', { class: 'page-title', id: 'decks-title', tabindex: '-1' }, 'Saved decks'), list, restoreBox, status]);
  if (!id) { list.replaceWith(p('Choose a language to see its saved decks.', 'muted')); return; }
  el.insertBefore(p('Saved decks are separate optional practice. Each card opens that practice; Remove stays at its top right.', 'muted'), list);
  el.append(button('Sync saved decks', () => {
    void (async () => {
      try {
        for (const deck of await listSavedDecks(ctx, id.learnerId, id.languageId, id.varietyId)) if (!deck.builtin) await recordSavedDeckChange(ctx, 'save', deck);
        setStatus(status, 'Saved decks queued for synchronization.', 'ok');
      } catch (e) { setStatus(status, e instanceof Error ? e.message : 'The decks could not be synchronized.', 'error'); }
    })();
  }, { class: 'btn', id: 'sync-saved-decks' }));

  async function practise(saved: SavedDeck): Promise<void> {
    const model = await currentReviewModel(ctx, { waitMs: PRESS_WAIT_MS });
    if (!model) { setStatus(status, 'Choose a language first.', 'error'); return; }
    const plan = await planFromSaved(ctx, model, saved);
    if (!plan.items.length) {
      const explanations = plan.skipped.slice(0, 3).map(skip => {
        const label = saved.items.find(item => item.itemId === skip.itemId)?.label ?? skip.itemId;
        return `${label}: ${skip.why}`;
      });
      const remaining = Math.max(0, plan.skipped.length - explanations.length);
      setStatus(status, explanations.length
        ? `None of these cards can be asked right now. ${explanations.join(' ')}${remaining ? ` ${remaining} more card(s) were skipped.` : ''}`
        : 'None of these cards can be asked right now. They remain saved and no review was recorded.', 'info');
      return;
    }
    const r = await beginSession(ctx, model, { plan });
    if (!r.ok) { setStatus(status, r.message, 'info'); return; }
    ctx.run.active = r.run;
    ctx.go('review/session');
  }

  async function paint(quiet = false): Promise<void> {
    const decks = await listSavedDecks(ctx, id!.learnerId, id!.languageId, id!.varietyId);
    const removed = await classEssentialsRemoved(ctx, id!.learnerId, id!.languageId);
    const classLine = decks.some((d) => d.builtin === 'class-essentials') ? await classDueLine(quiet).catch(() => null) : null;
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
      list.append(h('li', { class: builtin ? 'deckrow deckrow-builtin' : 'deckrow', 'data-deck-id': d.id }, open, remove, builtin ? classLine : null));
    }
  }

  /**
   * Class Essentials' due reviews, under its card (the owner, 2026-10-31: Class Essentials belongs to Saved decks, not the home).
   * Due-only: unreviewed phrases stay in the deck and are never counted as due.
   */
  async function classDueLine(quiet = false): Promise<HTMLElement | null> {
    const model = await currentReviewModel(ctx, quiet ? { noRefresh: true } : {}); // this device's copy; the refresh repaints this list through ctx.onData
    if (!model || !classLanguageOf(model.identity.languageId)) return null;
    const due = await planClassEssentialsDue(ctx, model);
    const missed = effectiveRemediation(model).class.length;
    const nextReturn = (model.classDeck ?? []).filter(item => item.status === 'active' && !item.invalidatedAt && !item.suspendedReason
      && Date.parse(item.schedule.due) > Date.parse(model.now)).sort((a, b) => Date.parse(a.schedule.due) - Date.parse(b.schedule.due))[0];
    const start = button(`Review due (${due.items.length})`, () => {
      start.disabled = true;
      void (async () => {
        const current = await currentReviewModel(ctx, { waitMs: PRESS_WAIT_MS });
        if (!current) return;
        const plan = await planClassEssentialsDue(ctx, current);
        if (!plan.items.length) { setStatus(status, 'No Class Essentials cards are due right now.', 'info'); return; }
        const r = await beginSession(ctx, current, { plan });
        if (!r.ok) { setStatus(status, r.message, 'info'); return; }
        ctx.run.active = r.run; ctx.go('review/session');
      })().catch(error => setStatus(status, String(error), 'error')).finally(() => { if (view.alive()) start.disabled = false; });
    }, { id: 'start-class-essentials-due', class: 'btn', ...(due.items.length ? {} : { disabled: true }) });
    return h('div', { class: 'deckrow-due', id: 'class-essentials-due' },
      h('span', { class: 'muted', id: 'class-essentials-due-count' }, due.items.length ? plural(due.items.length, 'card due', 'cards due')
        : nextReturn ? `Nothing due · next ${new Date(nextReturn.schedule.due).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Nothing due'),
      due.items.length ? start : null,
      missed ? h('a', { class: 'linklike', id: 'open-class-remediation', href: '#/review/remediation' }, plural(missed, 'missed phrase to study', 'missed phrases to study')) : null);
  }
  await paint();
  // a live update (or a sync from another tab) may have changed what is saved: the list is read again, in place
  view.onDispose(ctx.onData(() => { void paint(true); })); // a landed refresh must not start the next one
}
