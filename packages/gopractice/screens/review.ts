/**
 * #/review — the GoReview home. Four things and nothing else, each a large serif title over a one-line kicker:
 *
 *   GoTell          its own hierarchy (above a rule): the writing workspace, #/tell
 *   Current deck    accurate due/new/remediation counts, an adaptive bounded batch, and a separate optional selected-practice action
 *   Saved decks     "N saved" → #/review/decks
 *   My vocab        "N words" → #/review/vocab
 *
 * Everything the home used to show (intake proposals with their reasons, the dimension counts, the session controls, the deck
 * with its per-item controls) lives on #/review/details, reached from Settings. Sub-routes:
 * #/review/session, #/review/history/<item>, #/review/transfer, #/review/decks, #/review/vocab, #/review/details.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { addedWords, holdOutOf, loadVocabSafe, listSavedDecks, planClassEssentialsDue, planCurrentDeck, planSelectedPractice, selectedPracticeUnits, releaseHoldOut, saveDeck, type CurrentDeck, type SavedDeck, type VocabRow } from '../deckModel';
import { loadingMark } from '../loading';
import { readSnapshot, restoreMissing, type ReviewSnapshot } from '../snapshot';
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

/**
 * The home as it was last painted, per app instance (a restart starts afresh) and per learner and enrolment. Coming back from Settings
 * or the account page with nothing changed paints it again at once, with no request to the Repository (2026-10-28: on a phone the
 * requests took seconds). "Nothing changed" is a key over every local store the deck and the counts depend on: the events (a sync that
 * brings events from another device changes it), the preferences (the deck size), the words added by hand, the hold-out, the saved
 * decks, the open sessions and the device's vocabulary snapshot (written by My vocab and by every live read). The candidates can only
 * move with the events, so they are not asked for again while the key holds; after HOME_MEMO_MS they are asked for anyway.
 */
interface PaintedHome { key: string; at: number; model: ReviewModel; deck: CurrentDeck; classDue?: Awaited<ReturnType<typeof planClassEssentialsDue>>; selectedCount: number; resumeId: string | undefined; saved: number; words: number }
const painted = new WeakMap<AppContext, Map<string, PaintedHome>>();
/** How long a painted home is reused unchanged before the Repository is asked again anyway. */
export const HOME_MEMO_MS = 10 * 60_000;
/** Forgets the painted homes of one app instance: for a test that swaps the Repository under the app (in use, a change there reaches the device as events, which change the key). */
export const forgetPaintedHome = (ctx: AppContext): void => { painted.delete(ctx); };

/** The local reads the home depends on, and the key over them. */
interface HomeLocal { id: string; key: string; holdOut: Set<string>; saved: SavedDeck[]; resumable: Awaited<ReturnType<typeof recoverableSessions>>; snapshot: ReviewSnapshot | undefined }
async function homeLocal(ctx: AppContext): Promise<HomeLocal | undefined> {
  const idn = await ctx.identity();
  if (!idn) return undefined;
  const { learnerId, languageId, varietyId, enrolmentId } = idn;
  // before any store is read: a store the storage lost comes back from the snapshot (reading it first would create it empty)
  await restoreMissing(ctx, learnerId, languageId);
  const [prefs, events, added, holdOut, saved, resumable, snapshot] = await Promise.all([
    ctx.state.getPrefs(learnerId, languageId), ctx.events(languageId), addedWords(ctx, learnerId, languageId), holdOutOf(ctx, learnerId, languageId),
    listSavedDecks(ctx, learnerId, languageId, varietyId), recoverableSessions(ctx), readSnapshot(ctx, learnerId, languageId).catch(() => undefined),
  ]);
  const key = JSON.stringify([enrolmentId, varietyId ?? '', events.length, prefs, added.map((w) => w.unitId), [...holdOut].sort(), saved.map((d) => d.id), resumable.map((s) => s.sessionId), snapshot?.vocab?.rows.length ?? 0]);
  return { id: `${learnerId}|${enrolmentId}`, key, holdOut, saved, resumable, snapshot };
}

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
    const nextDue = [...model.deck, ...(model.classDeck ?? [])].filter(item => item.status === 'active' && !item.invalidatedAt && !item.suspendedReason)
      .map(item => Date.parse(item.schedule.due)).filter(due => Number.isFinite(due) && due > now).sort((a, b) => a - b)[0];
    if (nextDue === undefined) { nextDueTimer = undefined; return; }
    const delay = Math.min(2_147_000_000, Math.max(25, nextDue - now + 25));
    nextDueTimer = ctx.deps.win.setTimeout(() => { nextDueTimer = undefined; if (view.alive()) void paint(true); }, delay) as unknown as number;
  }

  /** Draws the four entries. */
  function draw(model: ReviewModel, deck: CurrentDeck, resumeId: string | undefined, savedCount: number, words: number,
    selectedCount: number, classDue?: Awaited<ReturnType<typeof planClassEssentialsDue>>): void {
    const bibliaLink = ctx.deps.links?.biblia;
    clear(root);
    root.setAttribute('lang', 'en');
    append(root, [tellEntry(), deckEntry(model, deck, resumeId, selectedCount), ...(classDue ? [classDueEntry(model, classDue, deck.summary.classRemediation)] : []), previousEntry(savedCount), vocabEntry(Math.max(words, 0)), ...(bibliaLink ? [bibliaEntry(bibliaLink)] : []), status]);
  }

  async function paint(force = false): Promise<void> {
    const local = await homeLocal(ctx).catch(() => undefined);
    const now = ctx.deps.now().getTime();
    const memo = local ? painted.get(ctx)?.get(local.id) : undefined;
    if (!force && memo && local && memo.key === local.key && now - memo.at < HOME_MEMO_MS) {
      if (!view.alive()) return;
      paintedEvents = memo.model.events.length;
      draw(memo.model, memo.deck, memo.resumeId, memo.saved, memo.words, memo.selectedCount, memo.classDue);
      return;
    }
    // the first paint shows the loading mark; a repaint over a painted home keeps it until the new one is ready
    if (!root.childElementCount) root.append(loadingMark('Loading your deck…'));
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
    // the local stores are read after the model: loading it may have brought decks and preferences back from the snapshot (restoreMissing)
    const [holdOut, saved, resumable, snapshot] = await Promise.all([
      holdOutOf(ctx, id.learnerId, id.languageId),
      listSavedDecks(ctx, id.learnerId, id.languageId, id.varietyId),
      recoverableSessions(ctx),
      readSnapshot(ctx, id.learnerId, id.languageId).catch(() => undefined),
    ]);
    // My vocab: the Repository's list takes a page per hundred words, each a slow read that holds the service's other answers back; the
    // device's snapshot of it (written at every live read) paints the home now, the live list is read once the home is drawn, and its count
    // replaces the snapshot's when it arrives. With no snapshot yet, the live list is waited for.
    const snapRows = (snapshot?.vocab?.rows ?? []) as VocabRow[];
    let live: Promise<VocabRow[]> | undefined = snapRows.length ? undefined : loadVocabSafe(ctx, id.languageId);
    const vocab = live ? await live : snapRows;
    const deck = await planCurrentDeck(ctx, model, holdOut, vocab);
    const classDue = classLanguageOf(model.identity.languageId) ? await planClassEssentialsDue(ctx, model) : undefined;
    const selected = await selectedPracticeUnits(ctx, id.learnerId, id.languageId);
    armNextDueRefresh(model);
    const words = vocab.length || model.knowledge.length;
    if (!view.alive()) return;
    draw(model, deck, resumable[0]?.sessionId, saved.length, words, selected.length, classDue);
    // the key as the stores stand now, after the paint (a restored deck or preference is part of it)
    const after = await homeLocal(ctx).catch(() => undefined);
    const same = after && after.id === `${id.learnerId}|${id.enrolmentId}` ? after : undefined;
    if (same) {
      const map = painted.get(ctx) ?? new Map<string, PaintedHome>();
      map.set(same.id, { key: same.key, at: now, model, deck, classDue, selectedCount: selected.length, resumeId: resumable[0]?.sessionId, saved: saved.length, words });
      painted.set(ctx, map);
    }
    if (!live) {
      live = loadVocabSafe(ctx, id.languageId);
      void live.then((rows) => {
        if (!view.alive() || !rows.length || rows.length === words) return;
        const m = same ? painted.get(ctx)?.get(same.id) : undefined;
        if (m && m.model === model) m.words = rows.length;
        const kicker = root.querySelector('#vocab-count');
        if (kicker) kicker.textContent = plural(rows.length, 'word', 'words');
      });
    }
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
    const nextReturn = (m.classDeck ?? []).filter(item => item.status === 'active' && !item.invalidatedAt && !item.suspendedReason
      && (item.schedule.phase === 'learning' || item.schedule.phase === 'relearning') && Date.parse(item.schedule.due) > Date.parse(m.now))
      .sort((a, b) => Date.parse(a.schedule.due) - Date.parse(b.schedule.due))[0];
    return h('section', { class: 'entry', 'data-entry': 'class-essentials-due', id: 'class-essentials-due' },
      h('h2', { class: 'entry-title' }, 'Class Essentials'),
      h('p', { class: 'entry-kicker', id: 'class-essentials-due-count' }, count ? `${plural(count, 'due card', 'due cards')} · ${reviewDue} scheduled review(s) · ${learningDue} learning return(s)` : 'No reviewed cards due'),
      h('p', { class: 'muted' }, `Due-only practice · ${due.items.length} question(s) in this session${limit ? ` · up to ${Math.round(limit / 60)} minutes` : ''}. Unreviewed phrases stay in the saved collection and are not counted as due.`),
      due.items.length ? start : null,
      classRemediation ? h('p', { class: 'entry-actions' }, h('a', { class: 'btn', id: 'open-class-remediation', href: '#/review/remediation' }, `Study Class Essentials remediation (${classRemediation})`)) : null,
      nextReturn ? h('p', { class: 'muted', id: 'class-essentials-next-return' }, `Next short-term class return: ${new Date(nextReturn.schedule.due).toLocaleString()}.`) : null);
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
    if (selectedCount) actions.append(button(`Practice selected words (${selectedCount})`, () => {
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
          const holdOut = await holdOutOf(ctx, current.identity.learnerId, current.identity.languageId);
          const now = await planCurrentDeck(ctx, current, holdOut);
          const saved = await saveDeck(ctx, current.identity, now.entries);
          const savedMessage = now.summary.newAvailable > 0
            ? `Deck saved. ${plural(now.summary.newAvailable, 'unseen eligible new item', 'unseen eligible new items')} available; due reviews remain ready.`
            : 'Deck saved. No unseen eligible alternatives; due obligations remain ready.';
          setStatus(status, saved ? savedMessage : 'There is no deck to save yet.', saved ? 'ok' : 'info');
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
    }, 'home', { centred: true }));
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
}
