/**
 * #/review/decks — Saved decks: the decks the learner saved, newest first ("date · N cards · language"), and the built-in decks of the language,
 * Class Essentials (seven languages) and the Alphabet (every language; the owner, 2026-11-14): the name as a bigger, friendlier title over
 * "N cards · language", with no description or note on this page (the owner, 2026-10-28; the deck keeps both in its record). The card itself
 * is the control: pressing it starts the practice (no "Practise again" button, the owner, 2026-10-28), with Remove under it. A removed
 * built-in deck can be restored. Under each built-in card: its own due reviews ("Review due (N)").
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { listSavedDecks, planClassEssentialsDue, planFromSaved, removeSavedDeck, removedBuiltins, restoreBuiltin, type BuiltinDeck, type SavedDeck } from '../deckModel';
import { languageName } from '../format';
import { beginSession, currentReviewModel, PRESS_WAIT_MS } from '../workspace';
import { icon } from '../icons';
import { attachRipple } from '../ripple';
import type { View } from './view';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What a built-in deck is called on this page, the ids of its due line, and what one of its cards is. */
const BUILTIN: Readonly<Record<BuiltinDeck, { name: string; slug: string }>> = {
  'class-essentials': { name: 'Class Essentials', slug: 'class-essentials' },
  alphabet: { name: 'Alphabet', slug: 'alphabet' },
};

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const id = await ctx.identity();
  const status = statusLine();
  const list = h('ul', { class: 'decklist', id: 'saved-decks' });
  const restoreBox = h('p', { class: 'restore-line' });
  append(el, [h('h2', { class: 'saved-decks-title', id: 'decks-title', tabindex: '-1' }, 'Saved Decks'), list, restoreBox, status]);
  if (!id) { list.replaceWith(p('Choose a language to see its saved decks.', 'muted')); return; }
  el.insertBefore(p('Optional practice decks for later review.', 'saved-decks-intro'), list);

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
    const removed = await removedBuiltins(ctx, id!.learnerId, id!.languageId);
    const dueLines = new Map<string, HTMLElement | null>();
    for (const d of decks) if (d.builtin) dueLines.set(d.id, await builtinDueLine(d, quiet).catch(() => null));
    if (!view.alive()) return;
    clear(list); clear(restoreBox);
    for (const kind of removed) {
      const { name, slug } = BUILTIN[kind];
      restoreBox.append(button(`Restore ${name}`, () => { void (async () => { await restoreBuiltin(ctx, id!.learnerId, id!.languageId, kind); setStatus(status, `${name} is back.`, 'ok'); await paint(); })(); }, { class: 'linklike', id: `restore-${slug}` }), ' ');
    }
    if (!decks.length) { list.append(h('li', { class: 'muted', id: 'decks-empty' }, 'Nothing saved yet.')); return; }
    for (const d of decks) {
      const when = d.name ?? new Date(d.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const language = languageName(d.languageId);
      const remove = button('Remove', () => {
        void (async () => {
          await removeSavedDeck(ctx, id!.learnerId, id!.languageId, d.id);
          setStatus(status, 'Deck removed.', 'ok');
          await paint();
        })();
      }, { class: 'linklike', 'data-action': 'remove-deck', 'aria-label': `Remove the deck of ${when}` });
      const builtin = !!d.builtin;
      // the whole card is the button that starts the practice; its visible text is its name, with "press to practise" for a screen reader
      const open = h('button', { type: 'button', class: 'deckrow-open deck-face', 'data-action': 'practise-again' },
        h('span', { class: 'deck-label' },
          h('span', { class: 'deck-kicker' }, 'Saved deck'),
          h('span', { class: 'deck-title' }, when),
          h('span', { class: 'deck-caption' }, `${plural(d.items.length, 'card', 'cards')} · ${language}`),
          !builtin && d.description ? h('span', { class: 'deckrow-note' }, d.description) : null,
          !builtin && d.notes ? h('span', { class: 'deckrow-note deckrow-fine' }, d.notes) : null),
        icon(ctx.deps.doc, 'arrow'), h('span', { class: 'sr' }, ', press to practise')) as HTMLButtonElement;
      open.addEventListener('click', () => {
        open.disabled = true;
        void practise(d).finally(() => { if (view.alive()) open.disabled = false; });
      });
      const tile = h('li', { class: 'deck-tile', 'data-deck-id': d.id, ...(d.builtin ? { 'data-builtin': d.builtin } : {}) }, open, dueLines.get(d.id) ?? null,
        h('div', { class: 'saved-deck-actions' }, remove));
      attachRipple(tile);
      list.append(tile);
    }
  }

  /**
   * A built-in deck's due reviews, under its card (the owner, 2026-10-31: Class Essentials belongs to Saved decks, not the home). Due-only:
   * unreviewed cards stay in the deck and are never counted as due. Each built-in deck counts its own cards: the Alphabet's letters are not
   * Class Essentials' phrases.
   */
  async function builtinDueLine(deck: SavedDeck, quiet = false): Promise<HTMLElement | null> {
    const model = await currentReviewModel(ctx, quiet ? { noRefresh: true } : {}); // this device's copy; the refresh repaints this list through ctx.onData
    if (!model || !deck.builtin) return null;
    const { name, slug } = BUILTIN[deck.builtin];
    const units = new Set(deck.items.map((item) => item.unitId));
    const due = await planClassEssentialsDue(ctx, model, units);
    const nextReturn = (model.classDeck ?? []).filter(item => units.has(item.unitId) && item.status === 'active' && !item.invalidatedAt && !item.suspendedReason
      && Date.parse(item.schedule.due) > Date.parse(model.now)).sort((a, b) => Date.parse(a.schedule.due) - Date.parse(b.schedule.due))[0];
    const start = button(`Review due (${due.items.length})`, () => {
      start.disabled = true;
      void (async () => {
        const current = await currentReviewModel(ctx, { waitMs: PRESS_WAIT_MS });
        if (!current) return;
        const plan = await planClassEssentialsDue(ctx, current, units);
        if (!plan.items.length) { setStatus(status, `No ${name} cards are due right now.`, 'info'); return; }
        const r = await beginSession(ctx, current, { plan });
        if (!r.ok) { setStatus(status, r.message, 'info'); return; }
        ctx.run.active = r.run; ctx.go('review/session');
      })().catch(error => setStatus(status, String(error), 'error')).finally(() => { if (view.alive()) start.disabled = false; });
    }, { id: `start-${slug}-due`, class: 'btn', ...(due.items.length ? {} : { disabled: true }) });
    start.prepend(icon(ctx.deps.doc, 'review'));
    return h('div', { class: 'saved-deck-actions', id: `${slug}-due` },
      h('span', { class: due.items.length ? 'sr' : 'muted', id: `${slug}-due-count` }, due.items.length ? plural(due.items.length, 'card due', 'cards due')
        : nextReturn ? `Nothing due · next ${new Date(nextReturn.schedule.due).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Nothing due'),
      due.items.length ? start : null);
  }
  await paint();
  // a live update (or a sync from another tab) may have changed what is saved: the list is read again, in place
  view.onDispose(ctx.onData(() => { void paint(true); })); // a landed refresh must not start the next one
}
