/**
 * #/review — the GoReview home. Four things and nothing else, each a large serif title over a one-line kicker:
 *
 *   GoTell          its own hierarchy (above a rule): the writing workspace, #/tell
 *   Current deck    "N cards ready", Begin, and a quiet Save deck. The deck is always ready (../deckModel)
 *   Previous decks  "N saved" → #/review/decks
 *   My vocab        "N words" → #/review/vocab
 *
 * Everything the home used to show (intake proposals with their reasons, the dimension counts, the session controls, the deck
 * with its per-item controls) lives on #/review/details, reached from Settings. Sub-routes:
 * #/review/session, #/review/history/<item>, #/review/transfer, #/review/decks, #/review/vocab, #/review/details.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { holdOutOf, loadVocabSafe, listSavedDecks, planCurrentDeck, releaseHoldOut, saveDeck, type CurrentDeck } from '../deckModel';
import { beginSession, endSavedSession, loadReviewModel, recoverableSessions, resumeSession, type ReviewModel } from '../workspace';
import * as decksScreen from './decks';
import { deckSizeControl } from './cardsper';
import { renderHistory, renderTransfer } from './history';
import * as myVocab from './myvocab';
import { renderDetails } from './reviewDetails';
import * as sessionScreen from './session';
import type { View } from './view';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export async function render(el: HTMLElement, ctx: AppContext, view: View, params: string[]): Promise<void> {
  const [sub, ...rest] = params;
  if (sub === 'session') return sessionScreen.render(el, ctx, view);
  if (sub === 'history') return renderHistory(el, ctx, view, rest);
  if (sub === 'transfer') return renderTransfer(el, ctx);
  if (sub === 'decks') return decksScreen.render(el, ctx, view);
  if (sub === 'vocab') return myVocab.render(el, ctx, view);
  if (sub === 'details') return renderDetails(el, ctx, view);

  const root = h('div', { id: 'review-home', class: 'home' });
  el.append(root);
  const status = statusLine();
  /** How many events the painted model was folded from; a sync that brings more repaints the home. */
  let paintedEvents = -1;
  /** Whether the inline deck-size stepper is open (it stays open across the re-plan a change causes). */
  let sizeOpen = false;

  async function paint(): Promise<void> {
    const model = await loadReviewModel(ctx);
    if (!view.alive()) return;
    paintedEvents = model?.events.length ?? -1;
    if (!model) {
      clear(root);
      const [enrolments, mode] = await Promise.all([ctx.enrolments(), ctx.mode()]);
      const setup = ctx.deps.links?.setup;
      append(root, [enrolments.length ? p('Choose a language above.') : h('div', { class: 'notice', id: 'no-enrolment' },
        p(mode === 'device'
          ? 'You have no language yet. GoPractice reviews what you met while reading, so choose your language in GoLearn setup first; it appears here at once, and no account is needed.'
          : 'You have no language yet. GoPractice reviews what you met while reading, so set up a language in GoLearn first; it will appear here after the next sync.'),
        setup ? h('p', {}, h('a', { class: 'btn', id: 'link-setup', href: setup }, 'Choose your language')) : null,
        button('Check again', () => { void (async () => { await ctx.refreshProfile(); await paint(); })(); }, { id: 'recheck' }))]);
      return;
    }
    const id = model.identity;
    const [holdOut, saved, resumable, vocab] = await Promise.all([
      holdOutOf(ctx, id.learnerId, id.languageId),
      listSavedDecks(ctx, id.learnerId, id.languageId),
      recoverableSessions(ctx),
      loadVocabSafe(ctx, id.languageId),
    ]);
    const deck = await planCurrentDeck(ctx, model, holdOut, vocab);
    const words = vocab.length || model.knowledge.length;
    if (!view.alive()) return;
    clear(root);
    root.setAttribute('lang', 'en');
    append(root, [tellEntry(), deckEntry(model, deck, resumable[0]?.sessionId), previousEntry(saved.length), vocabEntry(Math.max(words, 0)), status]);
  }

  /** GoTell: of its own hierarchy, not pedagogically related to what follows; set apart above a rule. */
  function tellEntry(): HTMLElement {
    return h('section', { class: 'entry entry-tell', 'data-entry': 'tell' },
      h('a', { class: 'entry-link', href: '#/tell', id: 'entry-tell' },
        h('span', { class: 'entry-title' }, 'GoTell'), h('span', { class: 'entry-kicker' }, 'Write and be corrected')));
  }

  function previousEntry(count: number): HTMLElement {
    return h('section', { class: 'entry', 'data-entry': 'previous' },
      h('a', { class: 'entry-link', href: '#/review/decks', id: 'entry-previous' },
        h('span', { class: 'entry-title' }, 'Previous decks'), h('span', { class: 'entry-kicker', id: 'previous-count' }, count ? `${count} saved` : 'None saved yet')));
  }

  function vocabEntry(count: number): HTMLElement {
    return h('section', { class: 'entry', 'data-entry': 'vocab' },
      h('a', { class: 'entry-link', href: '#/review/vocab', id: 'entry-vocab' },
        h('span', { class: 'entry-title' }, 'My vocab'), h('span', { class: 'entry-kicker', id: 'vocab-count' }, plural(count, 'word', 'words'))));
  }

  /**
   * The model to plan with: the one on screen, unless the saved preferences or the local log have moved on since it was painted
   * (a sync brought a card from another device), in which case it is loaded again.
   */
  async function freshModel(m: ReviewModel): Promise<ReviewModel> {
    try {
      const prefs = await ctx.state.getPrefs(m.identity.learnerId, m.identity.languageId);
      const events = await ctx.events(m.identity.languageId);
      if (JSON.stringify(prefs) === JSON.stringify(m.prefs) && events.length === m.events.length) return m;
      return (await loadReviewModel(ctx)) ?? m;
    } catch { return m; }
  }

  async function begin(m: ReviewModel): Promise<void> {
    const current = await freshModel(m);
    const { learnerId, languageId } = current.identity;
    const planned = await planCurrentDeck(ctx, current, await holdOutOf(ctx, learnerId, languageId));
    const r = await beginSession(ctx, current, { plan: planned.plan });
    if (!r.ok) { setStatus(status, r.message, 'info'); return; }
    await releaseHoldOut(ctx, learnerId, languageId);
    ctx.run.active = r.run;
    ctx.go('review/session');
  }

  async function resume(sessionId: string): Promise<void> {
    const resumed = await resumeSession(ctx, sessionId);
    if (!resumed.ok) { setStatus(status, resumed.message, 'error'); return; }
    ctx.run.active = resumed.run;
    ctx.go('review/session');
  }

  function deckEntry(m: ReviewModel, deck: CurrentDeck, resumeId: string | undefined): HTMLElement {
    const count = deck.entries.length;
    const ready = count > 0;
    const kicker = ready ? `${plural(count, 'card', 'cards')} ready` : 'Read with GoLearn to build your first deck';
    const start = button(resumeId ? 'Resume' : 'Begin', () => {
      start.disabled = true;
      void (resumeId ? resume(resumeId) : begin(m)).finally(() => { if (view.alive()) start.disabled = false; });
    }, { id: 'start-session', class: 'btn primary', ...(resumeId ? { 'data-action': 'resume-session' } : {}), ...(!ready && !resumeId ? { disabled: true } : {}) });
    const actions = h('div', { class: 'entry-actions' }, start);
    if (resumeId) {
      actions.append(button('Begin a new deck', () => {
        void (async () => {
          const ended = await endSavedSession(ctx, resumeId);
          if (!ended) { setStatus(status, 'The saved session could not be ended.', 'error'); return; }
          await paint();
        })();
      }, { class: 'linklike', id: 'start-new', 'data-action': 'end-session' }));
    }
    if (ready) {
      actions.append(button('Save deck', () => {
        void (async () => {
          const current = await freshModel(m);
          const holdOut = await holdOutOf(ctx, current.identity.learnerId, current.identity.languageId);
          const now = await planCurrentDeck(ctx, current, holdOut);
          const saved = await saveDeck(ctx, current.identity, now.entries);
          setStatus(status, saved ? 'Deck saved. A fresh deck is ready.' : 'There is no deck to save yet.', saved ? 'ok' : 'info');
          await paint();
        })();
      }, { class: 'linklike', id: 'save-deck' }));
    }
    // the deck's size, one quiet line: it opens the same stepper as Settings, inline
    const sizeBox = h('div', { class: 'deck-size-box', id: 'deck-size-box', hidden: !sizeOpen });
    const sizeLink = button(`deck size: ${m.prefs.cardsPerDeck ?? 10}`, () => {
      sizeOpen = !sizeOpen;
      sizeBox.hidden = !sizeOpen;
      sizeLink.setAttribute('aria-expanded', sizeOpen ? 'true' : 'false');
    }, { class: 'linklike', id: 'deck-size-link', 'aria-expanded': sizeOpen ? 'true' : 'false', 'aria-controls': 'deck-size-box' });
    sizeBox.append(deckSizeControl(ctx, m.identity.learnerId, m.identity.languageId, m.prefs.cardsPerDeck, () => {
      if (resumeId) { setStatus(status, 'A session is open: the new size applies to the next deck.', 'info'); return; }
      void paint();
    }, 'home'));
    return h('section', { class: 'entry', 'data-entry': 'deck', id: 'current-deck' },
      h('h2', { class: 'entry-title' }, 'Current deck'),
      h('p', { class: 'entry-kicker', id: 'deck-count', 'data-cards': String(count) }, kicker),
      h('p', { class: 'deck-size-line' }, sizeLink), sizeBox, actions);
  }

  await paint();

  // E-04: the first pull of this device may finish after the home was painted; a card another device added must not stay invisible
  // until the next visit. Repaint when a sync leaves the local log with a different number of events (unless the learner is acting).
  let repainting = false;
  let again = false;
  const repaintIfChanged = async (): Promise<void> => {
    if (repainting) { again = true; return; }
    repainting = true;
    try {
      do {
        again = false;
        if (!view.alive()) return;
        const id = await ctx.identity();
        if (!id) return;
        const count = (await ctx.events(id.languageId)).length;
        const active = ctx.deps.doc.activeElement;
        const typing = !!active && root.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
        if (count !== paintedEvents && !typing) await paint();
      } while (again);
    } catch { /* the home stays as painted */ } finally { repainting = false; }
  };
  void ctx.whenSynced().then(repaintIfChanged);
  view.onDispose(ctx.onSync(() => { void repaintIfChanged(); }));
  // a live update: the same guarded repaint (it waits while a field has focus)
  view.onDispose(ctx.onData(() => { void repaintIfChanged(); }));
}
