/**
 * #/review — the GoReview home (the owner, 2026-10-31):
 *
 *   GoTell          its own hierarchy (above a rule): the writing workspace, #/tell
 *   GoReview        Current Deck   what the system has you drilling: new words, cards never answered, learning and relearning returns
 *                                  (and the missed words to study, under it). A press starts it; Begin new deck beside it draws a fresh
 *                                  set of new words (the words already answered keep their schedule).
 *                   Review Deck    the spaced reviews that are due. A press starts it.
 *                   Saved decks    "N saved" → #/review/decks (Class Essentials lives there)
 *   My vocab        "N words" → #/review/vocab
 *
 * A deck's size is set in Settings alone (the owner, 2026-10-28).
 * Everything the home used to show (intake proposals with their reasons, the dimension counts, the session controls, the deck
 * with its per-item controls) lives on #/review/details, reached from Settings. Sub-routes:
 * #/review/session, #/review/history/<item>, #/review/transfer, #/review/decks, #/review/vocab, #/review/details.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { addedWords, holdOutOf, loadVocabSafe, listSavedDecks, planCurrentDeck, planFreshDeck, planSelectedPractice, selectedPracticeUnits, releaseHoldOut, saveDeck, setHoldOut, type CurrentDeck, type DeckPart, type SavedDeck, type VocabRow } from '../deckModel';
import { explainAdmissions } from '../admissionExplanation';
import { freshModel, planCouldHaveChanged } from '../freshness';
import { loadingMark } from '../loading';
import { MAX_SNAPSHOT_WORDS, readSnapshot, restoreMissing, type ReviewSnapshot } from '../snapshot';
import { beginSession, endSavedSession, loadReviewModel, recoverableSessions, resumeSession, type ReviewModel } from '../workspace';
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
interface PaintedHome { key: string; at: number; model: ReviewModel; deck: CurrentDeck; review: CurrentDeck; selectedCount: number; resumeId: string | undefined; saved: number; words: number; vocabCompleteness: VocabCompleteness }
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
  /** How many events the painted model was folded from; a sync that brings more repaints the home. */
  let paintedEvents = -1;
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

  /** Draws GoTell, GoReview (Current Deck, Review Deck, Saved decks) and My vocab. */
  function draw(model: ReviewModel, deck: CurrentDeck, review: CurrentDeck, resumeId: string | undefined, savedCount: number, words: number,
    selectedCount: number, vocabCompleteness: VocabCompleteness = 'complete'): void {
    clear(root);
    root.setAttribute('lang', 'en');
    append(root, [tellEntry(), goReviewEntry(model, deck, review, resumeId, selectedCount, savedCount), vocabEntry(Math.max(words, 0), vocabCompleteness), ...(ctx.deps.links?.biblia ? [bibliaEntry(ctx.deps.links.biblia)] : []), status]);
  }

  async function paint(force = false): Promise<void> {
    const local = await homeLocal(ctx).catch(() => undefined);
    const now = ctx.deps.now().getTime();
    const memo = local ? painted.get(ctx)?.get(local.id) : undefined;
    if (!force && memo && local && memo.key === local.key && now - memo.at < HOME_MEMO_MS && !scheduleMovedSince(memo.model, now) && !planCouldHaveChanged(memo.model, now)) {
      if (!view.alive()) return;
      paintedEvents = memo.model.events.length;
      draw(memo.model, memo.deck, memo.review, memo.resumeId, memo.saved, memo.words, memo.selectedCount, memo.vocabCompleteness);
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
          ? 'You have no language yet. GoReview reviews what you met while reading, so choose your language in GoLearn setup first; it appears here at once, and no account is needed.'
          : 'You have no language yet. GoReview reviews what you met while reading, so set up a language in GoLearn first; it will appear here after the next sync.'),
        setup ? h('p', {}, h('a', { class: 'btn', id: 'link-setup', href: setup }, 'Choose your language')) : null,
        button('Check again', () => { void (async () => { await ctx.refreshProfile(); await paint(); })(); }, { id: 'recheck' }))]);
      return;
    }
    const id = model.identity;
    const homeId = `${id.learnerId}|${id.enrolmentId}`;
    if (model.candidateRecoveryIncomplete) painted.get(ctx)?.delete(homeId);
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
    const selected = await selectedPracticeUnits(ctx, id.learnerId, id.languageId);
    armNextDueRefresh(model);
    const words = vocab.length || model.knowledge.length;
    const vocabCompleteness: VocabCompleteness = vocab.length >= MAX_SNAPSHOT_WORDS ? 'partial' : 'loading';
    if (!view.alive()) return;
    draw(model, deck, review, resumable[0]?.sessionId, saved.length, words, selected.length, vocabCompleteness);
    // Start the separate paged inventory only after the useful deck is on screen; its pages can contend with Repository deck requests.
    const live = loadVocabSafe(ctx, id.languageId);
    // the key as the stores stand now, after the paint (a restored deck or preference is part of it)
    const after = await homeLocal(ctx).catch(() => undefined);
    const same = after && after.id === homeId ? after : undefined;
    if (same && !model.candidateRecoveryIncomplete) {
      const map = painted.get(ctx) ?? new Map<string, PaintedHome>();
      map.set(same.id, { key: same.key, at: now, model, deck, review, selectedCount: selected.length, resumeId: resumable[0]?.sessionId, saved: saved.length, words, vocabCompleteness });
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
    const kicker = h('span', { class: 'entry-kicker', id: 'vocab-count' }, plural(count, 'word', 'words'));
    setVocabCount(kicker, count, completeness);
    return h('section', { class: 'entry', 'data-entry': 'vocab' },
      h('a', { class: 'entry-link', href: '#/review/vocab', id: 'entry-vocab' },
        h('span', { class: 'entry-title' }, 'My vocab'), kicker));
  }

  async function begin(m: ReviewModel, part: DeckPart): Promise<void> {
    const current = await freshModel(ctx, m);
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
    const current = await freshModel(ctx, m);
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
    if (!resumed.ok) { setStatus(status, resumed.message, 'error'); return; }
    ctx.run.active = resumed.run;
    ctx.go('review/session');
  }

  /** One of the two deck buttons: the deck's name over its count, the whole button a press that starts it (greyed out when empty). */
  function deckButton(id: string, title: string, kicker: string, count: number, onPress: () => Promise<void>): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'deck-button', id, 'data-cards': String(count), ...(count ? {} : { disabled: true }) },
      h('span', { class: 'deck-button-title' }, title), h('span', { class: 'deck-button-kicker', id: `${id}-count` }, kicker)) as HTMLButtonElement;
    b.addEventListener('click', () => {
      b.disabled = true;
      void onPress().catch((error) => setStatus(status, String(error), 'error')).finally(() => { if (view.alive()) b.disabled = false; });
    });
    return b;
  }

  function goReviewEntry(m: ReviewModel, deck: CurrentDeck, review: CurrentDeck, resumeId: string | undefined, selectedCount: number, savedCount: number): HTMLElement {
    const drilling = deck.entries.length;
    const reviewing = review.entries.length;
    const currentKicker = drilling ? plural(drilling, 'card', 'cards')
      : deck.summary.nextReturnAt ? `Nothing to drill now · next return ${when(deck.summary.nextReturnAt)}` : 'Nothing to drill right now';
    const reviewKicker = reviewing ? `${plural(reviewing, 'card', 'cards')} due`
      : review.summary.nextReviewAt ? `Nothing due · next review ${when(review.summary.nextReviewAt)}` : 'Nothing due';
    const current = deckButton('start-session', 'Current Deck', currentKicker, drilling, () => begin(m, 'current'));
    const newDeck = button('Begin new deck', () => {
      newDeck.disabled = true;
      void beginNewDeck(m, resumeId).catch((error) => setStatus(status, String(error), 'error')).finally(() => { if (view.alive()) newDeck.disabled = false; });
    }, { class: 'btn friendly deck-new', id: 'start-new', 'data-action': 'begin-new-deck' });
    const reviewButton = deckButton('start-review', 'Review Deck', reviewKicker, reviewing, () => begin(m, 'review'));

    // under the Current Deck: the missed words to study, words picked by hand, and saving the deck for later
    const extras = h('div', { class: 'deck-extras' });
    if (deck.summary.remediation) extras.append(h('a', { class: 'linklike', id: 'open-remediation', href: '#/review/remediation' }, `${plural(deck.summary.remediation, 'missed word', 'missed words')} to study`));
    if (selectedCount) extras.append(button(`Practice selected words (${selectedCount})`, () => {
      void (async () => {
        const fresh = await freshModel(ctx, m);
        const plan = await planSelectedPractice(ctx, fresh);
        if (!plan.items.length) { setStatus(status, 'Selected words are controlled or no usable exercise is available.', 'info'); return; }
        const result = await beginSession(ctx, fresh, { plan });
        if (!result.ok) { setStatus(status, result.message, 'info'); return; }
        await releaseHoldOut(ctx, fresh.identity.learnerId, fresh.identity.languageId);
        ctx.run.active = result.run; ctx.go('review/session');
      })().catch(error => setStatus(status, String(error), 'error'));
    }, { id: 'start-selected-practice', class: 'linklike' }));
    if (drilling) extras.append(button('Save this deck', () => {
      void (async () => {
        const fresh = await freshModel(ctx, m);
        const holdOut = await holdOutOf(ctx, fresh.identity.learnerId, fresh.identity.languageId);
        const now = await planCurrentDeck(ctx, fresh, holdOut, undefined, 'current');
        const saved = await saveDeck(ctx, fresh.identity, now.entries);
        setStatus(status, saved ? 'Deck saved. It waits in Saved decks; a fresh Current Deck is drawn.' : 'There is no deck to save yet.', saved ? 'ok' : 'info');
        await paint();
      })();
    }, { class: 'linklike', id: 'save-deck' }));
    const whyNoNew = drilling ? undefined : explainAdmissions(m, deck);

    return h('section', { class: 'entry entry-goreview', 'data-entry': 'deck', id: 'current-deck' },
      h('h2', { class: 'entry-title' }, 'GoReview'),
      m.schedulerIssue ? p(m.schedulerIssue, 'notice') : null,
      resumeId ? h('p', { class: 'deck-resume' }, h('span', { class: 'muted' }, 'A deck is in progress.'), ' ',
        button('Resume', () => { void resume(resumeId); }, { class: 'btn primary', id: 'resume-session', 'data-action': 'resume-session' })) : null,
      h('div', { class: 'deck-row', 'data-deck': 'current' }, current, newDeck),
      extras.childElementCount ? extras : null,
      whyNoNew ? h('p', { id: 'why-no-new', class: 'muted deck-why', 'data-code': whyNoNew.code }, whyNoNew.text) : null,
      h('div', { class: 'deck-row', 'data-deck': 'review' }, reviewButton),
      h('a', { class: 'deck-saved entry-link', href: '#/review/decks', id: 'entry-previous' },
        h('span', { class: 'deck-button-title' }, 'Saved decks'), h('span', { class: 'deck-button-kicker', id: 'previous-count' }, savedCount ? `${savedCount} saved` : 'None saved yet')));
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
