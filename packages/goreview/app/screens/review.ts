/**
 * #/review — the GoReview home: Current Deck (with New), Review Deck, Saved, and My vocab.
 * Settings opens Review Details for additional practice and the deck controls.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { addedWords, holdOutOf, loadVocabSafe, listSavedDecks, planCurrentDeck, planFreshDeck, releaseHoldOut, setHoldOut, type CurrentDeck, type DeckPart, type SavedDeck, type VocabRow } from '../deckModel';
import { explainAdmissions } from '../admissionExplanation';
import { freshModel, planCouldHaveChanged } from '../freshness';
import { loadingMark } from '../loading';
import { icon } from '../icons';
import { MAX_SNAPSHOT_WORDS, readSnapshot, restoreMissing, type ReviewSnapshot } from '../snapshot';
import { beginSession, currentReviewModel, endSavedSession, forgetReviewModels, recoverableSessions, resumeSession, reviewModelRevision, type ReviewModel } from '../workspace';
import * as decksScreen from './decks';
import { renderHistory, renderTransfer } from './history';
import * as myVocab from './myvocab';
import { renderDetails } from './reviewDetails';
import * as sessionScreen from './session';
import * as remediationScreen from './remediation';
import type { View } from './view';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const when = (at: string): string => new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The home as it was last painted, per app instance (a restart starts afresh) and per learner and enrolment. Coming back from Settings
 * or the account page with nothing changed paints it again at once, with no request to the Repository (2026-10-28: on a phone the
 * requests took seconds). "Nothing changed" is a key over every local store the deck and the counts depend on: the events (a sync that
 * brings events from another device changes it), the preferences (the deck size), the words added by hand, the hold-out, the saved
 * decks, the open sessions and the device's vocabulary snapshot (written by My vocab and by every live read). The candidates can only
 * move with the events, so they are not asked for again while the key holds; after HOME_MEMO_MS they are asked for anyway.
 */
type VocabCompleteness = 'complete' | 'partial' | 'loading' | 'unavailable' | 'stale';
interface PaintedHome { key: string; at: number; model: ReviewModel; deck: CurrentDeck; review: CurrentDeck; resumeId: string | undefined; saved: number; words: number; vocabCompleteness: VocabCompleteness }
const painted = new WeakMap<AppContext, Map<string, PaintedHome>>();
/** How long a painted home is reused unchanged before the Repository is asked again anyway. */
export const HOME_MEMO_MS = 10 * 60_000;
/** Forgets the painted homes of one app instance: for a test that swaps the Repository under the app (in use, a change there reaches the device as events, which change the key). */
export const forgetPaintedHome = (ctx: AppContext): void => { painted.delete(ctx); forgetReviewModels(ctx); };

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

/** What a deck panel shows: its entries and counts. Two plans with the same look draw the same panel. */
const deckLook = (d: CurrentDeck): string => JSON.stringify([d.filled, d.hasVocabulary, d.entries.map((e) => `${e.itemId}|${e.dimension}|${e.family}|${e.label}`), d.summary, d.remediation.length]);

/** A card (a short learning return, most often) has come due since the model was folded: a plan from that model would miss it, and Begin could say nothing is due (2026-10-29). */
export function scheduleMovedSince(m: Pick<ReviewModel, 'now' | 'deck' | 'classDeck'>, nowMs: number): boolean {
  const then = Date.parse(m.now);
  return [...m.deck, ...(m.classDeck ?? [])].some((i) => i.status === 'active' && Date.parse(i.schedule.due) > then && Date.parse(i.schedule.due) <= nowMs);
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
  /** What the drawn home shows, so the live model that follows a provisional one redraws only when it differs. */
  let drawnLook = '';
  /** The newest live model painted: a button drawn from a provisional model it did not need to redraw acts on this one. */
  let latest: ReviewModel | undefined;
  const latestOf = (m: ReviewModel): ReviewModel => latest && latest !== m && m.provisional && latest.identity.enrolmentId === m.identity.enrolmentId ? latest : m;
  /** How many events the painted model was folded from; a sync that brings more repaints the home. */
  let paintedEvents = -1;
  /** How many refreshes that changed the model had landed when the home was last drawn; one that lands later repaints it. */
  let paintedRevision = -1;
  let nextDueTimer: number | undefined;

  function armNextDueRefresh(model: ReviewModel): void {
    if (nextDueTimer !== undefined) ctx.deps.win.clearTimeout(nextDueTimer);
    const now = Date.parse(model.now);
    const nextDue = [...model.deck, ...(model.classDeck ?? [])].filter(item => item.status === 'active' && !item.invalidatedAt && !item.suspendedReason)
      .map(item => Date.parse(item.schedule.due)).filter(due => Number.isFinite(due) && due > now).sort((a, b) => a - b)[0];
    if (nextDue === undefined) { nextDueTimer = undefined; return; }
    const delay = Math.min(2_147_000_000, Math.max(25, nextDue - now + 25));
    nextDueTimer = ctx.deps.win.setTimeout(() => { nextDueTimer = undefined; if (view.alive()) void requestRepaint(true, false); }, delay) as unknown as number;
  }

  function draw(model: ReviewModel, deck: CurrentDeck, review: CurrentDeck, resumeId: string | undefined, savedCount: number, words: number,
    vocabCompleteness: VocabCompleteness = 'complete'): void {
    clear(root);
    root.setAttribute('lang', 'en');
    append(root, [
      goReviewEntry(model, deck, review, resumeId, savedCount),
      vocabEntry(Math.max(words, 0), vocabCompleteness),
      ctx.deps.links?.biblia ? h('a', { class: 'home-link', href: ctx.deps.links.biblia, id: 'entry-biblia' }, 'Biblia') : null,
      status,
    ]);
  }

  /** `quiet`: a repaint that only shows a refresh that just landed must not start another refresh. */
  async function paint(force = false, quiet = false): Promise<void> {
    const local = await homeLocal(ctx).catch(() => undefined);
    const now = ctx.deps.now().getTime();
    const memo = local ? painted.get(ctx)?.get(local.id) : undefined;
    const memoTtl = memo && (memo.model.candidateSource === 'cached' || memo.model.knowledgeStatus.source === 'partial' || memo.model.candidateRecoveryIncomplete || memo.model.candidateReadinessIncomplete)
      ? 30_000 : HOME_MEMO_MS;
    // an incomplete recovery or readiness check is never reused: the next visit asks again (ReviewModel.candidateRecoveryIncomplete)
    const incomplete = !!memo && (!!memo.model.candidateRecoveryIncomplete || !!memo.model.candidateReadinessIncomplete);
    if (!force && memo && !incomplete && local && memo.key === local.key && now - memo.at < memoTtl && !scheduleMovedSince(memo.model, now) && !planCouldHaveChanged(memo.model, now)) {
      if (!view.alive()) return;
      paintedEvents = memo.model.events.length;
      draw(memo.model, memo.deck, memo.review, memo.resumeId, memo.saved, memo.words, memo.vocabCompleteness);
      return;
    }
    // the first paint shows the loading mark; a repaint over a painted home keeps it until the new one is ready
    if (!root.childElementCount) root.append(loadingMark('Loading your deck…'));
    // this device's own copy at once (the last live model of this log, else the last complete prepared deck and the local log), asking the service
    // nothing (2026-11-10: the home no longer waits for the network when it holds a copy). The refresh runs in the background; when it lands with
    // something different the home is told (ctx.onData) and repaints through requestRepaint, drawing only where it differs. With no copy on this
    // device (a first run) this waits for the live load, at most REFRESH_DEADLINE_MS.
    const idn = await ctx.identity().catch(() => undefined);
    paintedRevision = idn ? reviewModelRevision(ctx, idn) : -1;
    const model = await currentReviewModel(ctx, quiet ? { noRefresh: true } : {});
    if (!view.alive()) return;
    await paintModel(model, now);
  }

  /** Draws the home for `model`; a provisional one (this device's saved deck) is not remembered, and the live one that follows it is drawn only where it differs. */
  async function paintModel(model: ReviewModel | undefined, now: number): Promise<void> {
    paintedEvents = model?.events.length ?? -1;
    if (!model) {
      clear(root);
      const [enrolments, mode, known] = await Promise.all([ctx.enrolments(), ctx.mode(), ctx.identity().catch(() => undefined)]);
      const setup = ctx.deps.links?.setup;
      // a learner exists but nothing could be built within the deadline: the live load goes on and the home repaints when it lands
      if (known) { append(root, [h('div', { class: 'notice', id: 'deck-not-loaded' }, p('Your deck could not be loaded yet. It appears here when the service answers.'),
        button('Check again', () => { void requestRepaint(true, false); }, { id: 'recheck' })), status]); return; }
      append(root, [enrolments.length ? p('Choose a language above.') : h('div', { class: 'notice', id: 'no-enrolment' },
        p(mode === 'device'
          ? 'You have no language yet. GoReview reviews what you met while reading, so choose your language in GoLearn setup first; it appears here at once, and no account is needed.'
          : 'You have no language yet. GoReview reviews what you met while reading, so choose a language in GoLearn setup, on the same account. It appears here after the next sync.'),
        setup ? h('p', {}, h('a', { class: 'btn', id: 'link-setup', href: setup }, 'Choose your language')) : null,
        button('Check again', () => { void (async () => { await ctx.refreshProfile(); await requestRepaint(true, false); })(); }, { id: 'recheck' }))]);
      return;
    }
    const id = model.identity;
    const homeId = `${id.learnerId}|${id.enrolmentId}`;
    // the local stores are read after the model: loading it may have brought decks and preferences back from the snapshot (restoreMissing)
    const [holdOut, saved, resumable, snapshot] = await Promise.all([
      holdOutOf(ctx, id.learnerId, id.languageId),
      listSavedDecks(ctx, id.learnerId, id.languageId, id.varietyId),
      recoverableSessions(ctx),
      readSnapshot(ctx, id.learnerId, id.languageId).catch(() => undefined),
    ]);
    // My vocab is a separate paged inventory. A device snapshot paints its count when present; live paging runs after the deck paints.
    const snapRows = (snapshot?.vocab?.rows ?? []) as VocabRow[];
    // Vocabulary is a separate inventory view, not an admission input. A cold
    // home must be able to paint the justified deck before its paged count loads.
    const vocab = snapRows;
    const deck = await planCurrentDeck(ctx, model, holdOut, vocab, 'current');
    const review = await planCurrentDeck(ctx, model, holdOut, vocab, 'review');
    armNextDueRefresh(model);
    const words = vocab.length || model.knowledge.length;
    const vocabCompleteness: VocabCompleteness = vocab.length >= MAX_SNAPSHOT_WORDS ? 'partial' : 'loading';
    if (!view.alive()) return;
    const look = JSON.stringify([homeId, deckLook(deck), deckLook(review), resumable[0]?.sessionId ?? '', saved.length, model.schedulerIssue ?? '', model.candidateSource === 'cached' && !model.provisional ? model.knowledgeStatus.fetchedAt : '',
      model.candidateReadinessIncomplete ?? false, model.knowledgeStatus.source === 'partial' || !!model.candidateRecoveryIncomplete]);
    if (look !== drawnLook || !root.querySelector('[data-entry]')) draw(model, deck, review, resumable[0]?.sessionId, saved.length, words, vocabCompleteness);
    drawnLook = look;
    if (!model.provisional) latest = model;
    if (model.provisional) return; // the live model follows: it is the one remembered, and it starts the vocabulary count
    // Start the separate paged inventory only after the useful deck is on screen; its pages can contend with Repository deck requests.
    const live = loadVocabSafe(ctx, id.languageId);
    // the key as the stores stand now, after the paint (a restored deck or preference is part of it)
    const after = await homeLocal(ctx).catch(() => undefined);
    const same = after && after.id === homeId ? after : undefined;
    if (same) {
      const map = painted.get(ctx) ?? new Map<string, PaintedHome>();
      map.set(same.id, { key: same.key, at: now, model, deck, review, resumeId: resumable[0]?.sessionId, saved: saved.length, words, vocabCompleteness });
      painted.set(ctx, map);
    }
    void live.then((result) => {
      const count = result ? result.rows.length : model.knowledge.length;
      const completeness: VocabCompleteness = !result ? 'unavailable' : result.stale ? 'stale' : result.complete ? 'complete' : 'partial';
      const m = same ? painted.get(ctx)?.get(same.id) : undefined;
      if (m && m.model === model) { m.words = count; m.vocabCompleteness = completeness; }
      if (!view.alive()) return;
      const kicker = root.querySelector<HTMLElement>('#vocab-count');
      if (kicker) setVocabCount(kicker, count, completeness);
    });
  }

  function setVocabCount(kicker: HTMLElement, count: number, completeness: VocabCompleteness): void {
    const base = plural(count, 'word', 'words');
    const label = completeness === 'partial' ? `${count.toLocaleString()}+ words` : base;
    kicker.textContent = label;
    kicker.dataset.completeness = completeness;
    kicker.setAttribute('aria-label', completeness === 'partial' ? `${count.toLocaleString()} or more words; the full vocabulary list did not load` :
      completeness === 'loading' ? `${base}; the full vocabulary count is still loading` :
        completeness === 'unavailable' ? `${base}; the vocabulary count could not be refreshed` :
          completeness === 'stale' ? `${base}; showing the saved vocabulary count from the last successful load` : label);
    kicker.title = completeness === 'partial' ? 'Only a partial vocabulary list loaded. More words may be available.' :
      completeness === 'loading' ? 'The deck is ready; the separate vocabulary count is still loading.' :
        completeness === 'unavailable' ? 'The vocabulary count could not be refreshed.' :
          completeness === 'stale' ? 'Showing the last saved count because the Repository is unavailable.' : '';
  }

  function vocabEntry(count: number, completeness: VocabCompleteness = 'complete'): HTMLElement {
    const kicker = h('span', { class: 'sr', id: 'vocab-count' }, plural(count, 'word', 'words'));
    setVocabCount(kicker, count, completeness);
    return h('section', { class: 'entry', 'data-entry': 'vocab' },
      h('a', { class: 'home-link', href: '#/review/vocab', id: 'entry-vocab', 'aria-describedby': 'vocab-count' }, 'My Vocabulary'), kicker);
  }

  function candidateFreshness(model: ReviewModel): HTMLElement | null {
    const status = model.knowledgeStatus;
    if (model.provisional) return null; // the live model is being asked for; it says how fresh it is
    if (model.candidateSource === 'cached') {
      const readiness = model.candidateReadinessIncomplete ? ' Some exercises could not be checked yet.' : '';
      return h('p', { class: 'muted', id: 'candidate-freshness', 'data-source': status.source }, `Using saved word data from ${when(status.fetchedAt)}.${readiness}`);
    }
    if (status.source === 'partial' || model.candidateRecoveryIncomplete || model.candidateReadinessIncomplete) {
      return h('p', { class: 'muted', id: 'candidate-freshness', 'data-source': status.source }, model.candidateReadinessIncomplete
        ? 'Some exercises could not be checked; this view may be incomplete.' : 'Some word data could not be refreshed; this view may be incomplete.');
    }
    return null;
  }

  async function begin(m: ReviewModel, part: DeckPart): Promise<void> {
    const current = await freshModel(ctx, latestOf(m));
    const { learnerId, languageId } = current.identity;
    const planned = await planCurrentDeck(ctx, current, await holdOutOf(ctx, learnerId, languageId), undefined, part);
    const r = await beginSession(ctx, current, { plan: planned.plan });
    if (!r.ok) { setStatus(status, r.message, 'info'); return; }
    await releaseHoldOut(ctx, learnerId, languageId, { preserveAdded: true });
    ctx.run.active = r.run;
    ctx.go('review/session');
  }

  /**
   * Begin new deck: a fresh set of new words now. A deck in progress is ended (what was answered keeps its schedule and comes back
   * through the Review Deck); the new words the Current Deck holds are set aside for this draw only, and go back into the pool once
   * the new session starts. With no other new word ready, nothing is ended or set aside and the Current Deck stays as it is.
   */
  async function beginNewDeck(m: ReviewModel, resumeId: string | undefined): Promise<void> {
    const current = await freshModel(ctx, latestOf(m));
    const { learnerId, languageId } = current.identity;
    const held = await holdOutOf(ctx, learnerId, languageId);
    const before = await planCurrentDeck(ctx, current, held, undefined, 'current');
    const setAside = new Set([...held, ...before.plan.items.filter((p) => p.isNew).map((p) => p.item.unitId)]);
    const fresh = await planFreshDeck(ctx, current, setAside);
    if (!fresh.plan.items.some((p) => p.isNew)) {
      setStatus(status, 'No other new words are ready right now. Your Current Deck stays as it is.', 'info');
      return;
    }
    if (resumeId && !(await endSavedSession(ctx, resumeId))) { setStatus(status, 'The deck in progress could not be ended.', 'error'); return; }
    await setHoldOut(ctx, learnerId, languageId, setAside);
    const r = await beginSession(ctx, current, { plan: fresh.plan });
    if (!r.ok) { await setHoldOut(ctx, learnerId, languageId, held); setStatus(status, r.message, 'info'); return; }
    await releaseHoldOut(ctx, learnerId, languageId, { preserveAdded: true });
    ctx.run.active = r.run;
    ctx.go('review/session');
  }

  async function resume(sessionId: string): Promise<void> {
    const resumed = await resumeSession(ctx, sessionId);
    if (!resumed.ok) {
      setStatus(status, resumed.message, 'error');
      await requestRepaint(true, false);
      return;
    }
    ctx.run.active = resumed.run;
    ctx.go('review/session');
  }

  function deckButton(id: string, label: string, description: string, count: number, content: HTMLElement, onPress: () => Promise<void>, canResume = false): HTMLButtonElement {
    const detailId = `${id}-count`;
    const b = h('button', { type: 'button', class: 'deck-face', id, 'data-cards': String(count),
      'aria-label': label, 'aria-describedby': detailId, disabled: !count && !canResume,
      'data-action': canResume ? 'resume-session' : undefined },
      content, icon(ctx.deps.doc, 'arrow'), h('span', { id: detailId, class: 'sr' }, description)) as HTMLButtonElement;
    b.addEventListener('click', () => {
      b.disabled = true;
      void onPress().catch((error) => setStatus(status, String(error), 'error')).finally(() => { if (view.alive()) b.disabled = false; });
    });
    return b;
  }

  function deckLabel(title: string, caption: string): HTMLElement {
    return h('span', { class: 'deck-label' },
      h('span', { class: 'deck-title' }, title), h('span', { class: 'deck-caption' }, caption));
  }

  function goReviewEntry(m: ReviewModel, deck: CurrentDeck, review: CurrentDeck, resumeId: string | undefined, savedCount: number): HTMLElement {
    const drilling = deck.entries.length;
    const reviewing = review.entries.length;
    // Deck fill (the owner, 2026-11-03): a deck is always the size the learner set, topped up with early reviews, so the kickers read the
    // deck's card count and never "due". When the whole eligible pool is smaller than the size (nothing new can be admitted, no due review
    // waits in the Review Deck, nothing was held back for time or batch room) the Current Deck says it holds all of the learner's cards.
    const heldBack = deck.plan.skipped.some(s => s.code === 'over-time-budget' || s.code === 'beyond-micro-deck' || s.code === 'same-unit-in-batch');
    const poolExhausted = drilling > 0 && drilling < deck.summary.targetQuestions && deck.summary.newAvailable === 0 && deck.summary.dueReviews === 0 && !heldBack;
    const currentKicker = poolExhausted ? (drilling === 1 ? '1 card · your only one' : `all ${drilling} of your cards`)
      : drilling ? plural(drilling, 'card', 'cards')
      : deck.summary.nextReturnAt ? `Nothing to drill now · next return ${when(deck.summary.nextReturnAt)}` : 'Nothing to drill right now';
    const reviewKicker = reviewing ? plural(reviewing, 'card', 'cards')
      : review.summary.nextReviewAt ? `Nothing due · next review ${when(review.summary.nextReviewAt)}` : 'Nothing due';
    const whyNoNew = drilling || resumeId ? undefined : explainAdmissions(m, deck);
    const currentAction = resumeId ? 'Resume' : drilling ? 'Start' : 'No cards ready';
    const current = deckButton('start-session', `${currentAction} · Current Deck`,
      resumeId ? `Resume your session in progress. ${currentKicker}` : [currentKicker, whyNoNew?.text].filter(Boolean).join('. '),
      drilling, h('span', { class: 'deck-label' },
        h('span', { class: 'deck-kicker' }, 'Current Deck'),
        h('span', { class: 'deck-title' }, currentAction),
        h('span', { class: 'deck-caption' }, 'Your active vocabulary collection')),
      () => resumeId ? resume(resumeId) : begin(m, 'current'), !!resumeId);
    const newDeck = button('New deck', () => {
      newDeck.disabled = true;
      void beginNewDeck(m, resumeId).catch((error) => setStatus(status, String(error), 'error')).finally(() => { if (view.alive()) newDeck.disabled = false; });
    }, { class: 'deck-new', id: 'start-new', 'data-action': 'begin-new-deck', 'aria-label': 'Begin new deck' });
    const reviewButton = deckButton('start-review', 'Review Deck', reviewKicker, reviewing,
      h('span', { class: 'deck-row' }, icon(ctx.deps.doc, 'review'), deckLabel('Review Deck', reviewing ? 'Study cards' : 'No cards ready')),
      () => begin(m, 'review'));

    return h('section', { 'data-entry': 'deck', id: 'current-deck', 'aria-label': 'Decks' },
      m.schedulerIssue ? p(m.schedulerIssue, 'notice') : null,
      candidateFreshness(m),
      h('div', { class: 'deck-tiles' },
        h('div', { class: 'deck-tile', 'data-deck': 'current' }, current, newDeck),
        h('div', { class: 'deck-tile', 'data-deck': 'review' }, reviewButton),
        h('div', { class: 'deck-tile', 'data-deck': 'saved' },
          h('a', { class: 'deck-face', href: '#/review/decks', id: 'entry-previous', 'aria-label': 'Saved', 'aria-describedby': 'previous-count' },
            h('span', { class: 'deck-row' }, icon(ctx.deps.doc, 'saved'), deckLabel('Saved', 'Your collections')), icon(ctx.deps.doc, 'arrow')),
          h('span', { id: 'previous-count', class: 'sr' }, savedCount ? `${savedCount} saved` : 'None saved yet'))));
  }

  // Every repaint goes through this one guarded function, registered before the first paint: one runs at a time, a request that arrives meanwhile
  // is folded into one more run. A conditional request (a sync, a live update, a refresh that landed) repaints only when the log has a different number
  // of events or a refresh changed the model, and waits while a field has focus; an unconditional one (a press, Check again, the next-due timer) always does.
  let repainting: Promise<void> | undefined;
  let pending: { force: boolean; conditional: boolean; quiet: boolean } | undefined;
  function requestRepaint(force: boolean, conditional: boolean, first = false): Promise<void> {
    pending = pending ? { force: pending.force || force, conditional: pending.conditional && conditional, quiet: false } : { force, conditional, quiet: false };
    if (repainting) return repainting;
    const loop = (async (): Promise<void> => {
      try {
        while (pending) {
          const req = pending; pending = undefined;
          if (!view.alive()) return;
          let forced = req.force;
          let quiet = false;
          if (req.conditional) {
            try {
              const id = await ctx.identity();
              if (!id) continue;
              const count = (await ctx.events(id.languageId)).length;
              const active = ctx.deps.doc.activeElement;
              const typing = !!active && root.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
              const refreshed = reviewModelRevision(ctx, id) !== paintedRevision;
              if (typing || (count === paintedEvents && !refreshed)) continue;
              forced = forced || refreshed; // a model that changed is drawn even when the painted home's memo still holds
              quiet = refreshed && count === paintedEvents && !req.force; // nothing but a landed refresh to show: it does not start the next one
            } catch { continue; }
          }
          try { await paint(forced, quiet); } catch (error) { if (first) throw error; /* a later repaint: the home stays as painted */ }
        }
      } finally { repainting = undefined; }
    })();
    repainting = loop;
    return loop;
  }
  // E-04: the first pull of this device may finish after the home was painted; a card another device added must not stay invisible
  // until the next visit. A live update (or a refresh of the model) repaints the same way.
  view.onDispose(ctx.onSync(() => { void requestRepaint(false, true); }));
  view.onDispose(ctx.onData(() => { void requestRepaint(false, true); }));
  void ctx.whenSynced().then(() => { void requestRepaint(false, true); });

  await requestRepaint(false, false, true);
}
