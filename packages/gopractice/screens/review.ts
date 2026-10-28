/**
 * #/review — the GoReview home: actual scheduled work, justified admissions and separate optional practice.
 *
 *   GoTell          its own hierarchy (above a rule): the writing workspace, #/tell
 *   Current batch   Due/learning/new/remediation counts, time estimate and Begin; it may contain zero questions.
 *   Class Essentials A distinct due-only scope, with its own remediation and upcoming returns.
 *   Saved decks     "N saved" → #/review/decks
 *   My vocab        "N words" → #/review/vocab
 *
 * Everything the home used to show (intake proposals with their reasons, the dimension counts, the session controls, the deck
 * with its per-item controls) lives on #/review/details, reached from Settings. Sub-routes:
 * #/review/session, #/review/history/<item>, #/review/transfer, #/review/decks, #/review/vocab, #/review/details.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { loadVocabSafe, listSavedDecks, planCurrentDeck, planClassEssentialsDue, planSelectedPractice, selectedPracticeUnits, releaseHoldOut, saveDeck, type CurrentDeck } from '../deckModel';
import { beginSession, endSavedSession, loadReviewModel, recoverableSessions, resumeSession, type ReviewModel } from '../workspace';
import * as decksScreen from './decks';
import { deckSizeControl } from './cardsper';
import { renderHistory, renderTransfer } from './history';
import * as myVocab from './myvocab';
import { renderDetails } from './reviewDetails';
import * as sessionScreen from './session';
import * as remediationScreen from './remediation';
import { classLanguageOf } from '../classEssentials';
import type { View } from './view';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const timeEstimate = (seconds: number): string => seconds < 60 ? 'about 1 minute' : `about ${Math.max(1, Math.round(seconds / 60))} minutes`;

export async function render(el: HTMLElement, ctx: AppContext, view: View, params: string[]): Promise<void> {
  const [sub, ...rest] = params;
  if (sub === 'session') return sessionScreen.render(el, ctx, view);
  if (sub === 'remediation') return remediationScreen.render(el, ctx, view);
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
  let nextDueTimer: number | undefined;

  function armNextDueRefresh(model: ReviewModel): void {
    if (nextDueTimer !== undefined) ctx.deps.win.clearTimeout(nextDueTimer);
    const now = Date.parse(model.now);
    const nextDue = model.deck.filter(item => item.status === 'active' && !item.invalidatedAt && !item.suspendedReason)
      .map(item => Date.parse(item.schedule.due)).filter(due => Number.isFinite(due) && due > now).sort((a, b) => a - b)[0];
    if (nextDue === undefined) { nextDueTimer = undefined; return; }
    // Long timers are capped and re-armed after each paint; returning to the app
    // also refreshes immediately from the shared clock.
    const delay = Math.min(2_147_000_000, Math.max(25, nextDue - now + 25));
    nextDueTimer = ctx.deps.win.setTimeout(() => {
      nextDueTimer = undefined;
      if (view.alive()) void paint();
    }, delay) as unknown as number;
  }

  async function paint(): Promise<void> {
    const model = await loadReviewModel(ctx);
    if (!view.alive()) return;
    paintedEvents = model?.events.length ?? -1;
    if (!model) {
      if (nextDueTimer !== undefined) ctx.deps.win.clearTimeout(nextDueTimer);
      nextDueTimer = undefined;
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
    const bibliaLink = ctx.deps.links?.biblia;
    const [saved, resumable, vocab] = await Promise.all([
      listSavedDecks(ctx, id.learnerId, id.languageId, id.varietyId),
      recoverableSessions(ctx),
      loadVocabSafe(ctx, id.languageId),
    ]);
    const deck = await planCurrentDeck(ctx, model, new Set(), vocab);
    const classDue = classLanguageOf(model.identity.languageId) ? await planClassEssentialsDue(ctx, model) : undefined;
    armNextDueRefresh(model);
    const selected = await selectedPracticeUnits(ctx, id.learnerId, id.languageId);
    const words = vocab.length || model.knowledge.length;
    if (!view.alive()) return;
    clear(root);
    root.setAttribute('lang', 'en');
    append(root, [tellEntry(), deckEntry(model, deck, resumable[0]?.sessionId, selected.length), ...(classDue ? [classDueEntry(model, classDue, deck.summary.classRemediation)] : []), previousEntry(saved.length), vocabEntry(Math.max(words, 0)), ...(bibliaLink ? [bibliaEntry(bibliaLink)] : []), status]);
  }

  /** GoTell: of its own hierarchy, not pedagogically related to what follows; set apart above a rule. */
  function tellEntry(): HTMLElement {
    return h('section', { class: 'entry entry-tell', 'data-entry': 'tell' },
      h('a', { class: 'entry-link', href: '#/tell', id: 'entry-tell' },
        h('span', { class: 'entry-title' }, 'GoTell'), h('span', { class: 'entry-kicker' }, 'Write and be corrected')));
  }

  /** Biblia, when it ships beside this app (the iPhone edition, the extension): the Hebrew Bible and the Greek New Testament read with GoLearn, recorded into this account. */
  function bibliaEntry(href: string): HTMLElement {
    return h('section', { class: 'entry', 'data-entry': 'biblia' },
      h('a', { class: 'entry-link', href, id: 'entry-biblia' },
        h('span', { class: 'entry-title' }, 'Biblia'), h('span', { class: 'entry-kicker' }, 'The Hebrew Bible and the Greek New Testament, read with GoLearn')));
  }
  function previousEntry(count: number): HTMLElement {
    return h('section', { class: 'entry', 'data-entry': 'previous' },
      h('a', { class: 'entry-link', href: '#/review/decks', id: 'entry-previous' },
        h('span', { class: 'entry-title' }, 'Saved decks'), h('span', { class: 'entry-kicker', id: 'previous-count' }, count ? `${count} saved` : 'None saved yet')));
  }

  function vocabEntry(count: number): HTMLElement {
    return h('section', { class: 'entry', 'data-entry': 'vocab' },
      h('a', { class: 'entry-link', href: '#/review/vocab', id: 'entry-vocab' },
        h('span', { class: 'entry-title' }, 'My vocab'), h('span', { class: 'entry-kicker', id: 'vocab-count' }, plural(count, 'word', 'words'))));
  }

  function classDueEntry(m: ReviewModel, due: Awaited<ReturnType<typeof planClassEssentialsDue>>, classRemediation: number): HTMLElement {
    const count = due.availableWork?.questions ?? due.items.length;
    const learningDue = due.items.filter(p => p.item.schedule.phase === 'learning' || p.item.schedule.phase === 'relearning').length;
    const reviewDue = due.items.length - learningDue;
    const start = button('Review Class Essentials due', () => {
      start.disabled = true;
      void (async () => {
        const current = await freshModel(m);
        const plan = await planClassEssentialsDue(ctx, current);
        if (!plan.items.length) { setStatus(status, 'No Class Essentials cards are due for this capped session.', 'info'); return; }
        const result = await beginSession(ctx, current, { plan });
        if (!result.ok) { setStatus(status, result.message, 'info'); return; }
        ctx.run.active = result.run; ctx.go('review/session');
      })().catch(error => setStatus(status, String(error), 'error')).finally(() => { if (view.alive()) start.disabled = false; });
    }, { id: 'start-class-essentials-due', class: 'btn', ...(due.items.length ? {} : { disabled: true }) });
    const limit = due.batch?.workloadLimit ?? (m.prefs.sessionMinutes === 0 ? 0 : m.prefs.sessionMinutes * 60);
    return h('section', { class: 'entry', 'data-entry': 'class-essentials-due', id: 'class-essentials-due' },
      h('h2', { class: 'entry-title' }, 'Class Essentials'),
      h('p', { class: 'entry-kicker', id: 'class-essentials-due-count' }, count ? `${plural(count, 'due card', 'due cards')} · ${reviewDue} scheduled review(s) · ${learningDue} learning return(s)` : 'No reviewed cards due'),
      h('p', { class: 'muted' }, `Due-only practice · ${due.items.length} question(s) in this session${limit ? ` · up to ${Math.round(limit / 60)} minutes` : ''}. Unreviewed phrases stay in the saved collection and are not counted as due.`),
      due.items.length ? start : null,
      classRemediation ? h('p', { class: 'entry-actions' }, h('a', { class: 'btn', id: 'open-class-remediation', href: '#/review/remediation' }, `Study Class Essentials remediation (${classRemediation})`)) : null,
      ...((m.classDeck ?? []).filter(item => item.status === 'active' && !item.invalidatedAt && !item.suspendedReason
        && (item.schedule.phase === 'learning' || item.schedule.phase === 'relearning') && Date.parse(item.schedule.due) > Date.parse(m.now))
        .sort((a, b) => Date.parse(a.schedule.due) - Date.parse(b.schedule.due)).slice(0, 1)
        .map(item => h('p', { class: 'muted', id: 'class-essentials-next-return' }, `Next short-term class return: ${new Date(item.schedule.due).toLocaleString()}.`))));
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
    const planned = await planCurrentDeck(ctx, current);
    const r = await beginSession(ctx, current, { plan: planned.plan });
    if (!r.ok) { setStatus(status, r.message, 'info'); return; }
    await releaseHoldOut(ctx, learnerId, languageId, { preserveAdded: true });
    ctx.run.active = r.run;
    ctx.go('review/session');
  }

  async function resume(sessionId: string): Promise<void> {
    const resumed = await resumeSession(ctx, sessionId);
    if (!resumed.ok) { setStatus(status, resumed.message, 'error'); return; }
    ctx.run.active = resumed.run;
    ctx.go('review/session');
  }

  function deckEntry(m: ReviewModel, deck: CurrentDeck, resumeId: string | undefined, selectedCount: number): HTMLElement {
    const count = deck.entries.length;
    const ready = count > 0;
    const kicker = ready ? `${plural(count, 'card', 'cards')} ready` : 'No eligible reviews right now';
    const start = button(resumeId ? 'Resume' : 'Begin', () => {
      start.disabled = true;
      void (resumeId ? resume(resumeId) : begin(m)).finally(() => { if (view.alive()) start.disabled = false; });
    }, { id: 'start-session', class: 'btn primary', ...(resumeId ? { 'data-action': 'resume-session' } : {}), ...(!ready && !resumeId ? { disabled: true } : {}) });
    const actions = h('div', { class: 'entry-actions' }, start);
    if (selectedCount) actions.append(button('Practice selected words (' + selectedCount + ')', () => {
      void (async () => {
        const current = await freshModel(m);
        const plan = await planSelectedPractice(ctx, current);
        if (!plan.items.length) { setStatus(status, 'Selected words are controlled or no usable exercise is available.', 'info'); return; }
        const result = await beginSession(ctx, current, { plan });
        if (!result.ok) { setStatus(status, result.message, 'info'); return; }
        await releaseHoldOut(ctx, current.identity.learnerId, current.identity.languageId);
        ctx.run.active = result.run; ctx.go('review/session');
      })().catch(error => setStatus(status, String(error), 'error'));
    }, { id: 'start-selected-practice', class: 'btn' }));
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
          const now = await planCurrentDeck(ctx, current);
          const saved = await saveDeck(ctx, current.identity, now.entries);
          const alternative = saved ? await planCurrentDeck(ctx, current, new Set(saved.items.map(item => item.unitId))) : undefined;
          const message = !saved ? 'There is no deck to save yet.' : !alternative?.entries.length
            ? 'Deck saved. No unseen eligible alternatives are available right now.'
            : alternative.entries.length < now.entries.length ? 'Deck saved. A smaller eligible alternative is available.' : 'Deck saved. A fresh eligible alternative is available.';
          setStatus(status, message, saved ? 'ok' : 'info');
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
      h('h2', { class: 'entry-title' }, 'GoReview'),
      m.schedulerIssue ? p(m.schedulerIssue, 'notice') : null,
      h('p', { id: 'review-obligations', class: 'entry-kicker' }, `${deck.summary.dueReviews} due reviews · ${deck.summary.dueLearning} due learning/relearning · ${deck.summary.newAvailable} eligible new admissions · ${deck.summary.remediation} unresolved remediation`),
      h('p', { id: 'microdeck-size', class: 'muted' }, `${deck.summary.batchQuestions} question(s) in this batch · ${deck.summary.questionsAvailable} eligible now · target ${deck.summary.targetQuestions}.`),
      h('p', { id: 'microdeck-estimate', class: 'muted' }, `${timeEstimate(deck.summary.estimatedSeconds)} active practice${deck.summary.workloadLimit ? `, within a ${Math.round(deck.summary.workloadLimit / 60)} minute workload limit` : ', with no fixed session-time limit'}. Estimates are approximate.`),
      deck.plan.batch?.reasons.length ? p(deck.plan.batch.reasons.join(' '), 'help') : null,
      deck.summary.nextReturnAt ? h('p', { id: 'next-learning-return', class: 'muted' }, 'Next short-term learning return: ' + new Date(deck.summary.nextReturnAt).toLocaleString() + '. Leave whenever you like; it remains scheduled in GoReview.') : null,
      deck.summary.nextReviewAt ? h('p', { id: 'next-scheduled-review', class: 'muted' }, 'Next scheduled review: ' + new Date(deck.summary.nextReviewAt).toLocaleString() + '.') : null,
      deck.summary.remediation ? h('p', { class: 'entry-actions' }, h('a', { class: 'btn', id: 'open-remediation', href: '#/review/remediation' }, 'Review remediation (' + deck.summary.remediation + ')')) : null,
      h('p', { class: 'muted' }, 'Scheduled work is primary. Remediation, saved decks and selected vocabulary are separate optional practice.'),
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
  const refreshOnReturn = (): void => { if (view.alive()) void paint(); };
  const refreshOnVisibility = (): void => { if (ctx.deps.doc.visibilityState !== 'hidden') refreshOnReturn(); };
  ctx.deps.win.addEventListener('pageshow', refreshOnReturn);
  ctx.deps.doc.addEventListener('visibilitychange', refreshOnVisibility);
  view.onDispose(() => {
    if (nextDueTimer !== undefined) ctx.deps.win.clearTimeout(nextDueTimer);
    ctx.deps.win.removeEventListener('pageshow', refreshOnReturn);
    ctx.deps.doc.removeEventListener('visibilitychange', refreshOnVisibility);
  });
}
