/**
 * #/review/details — the full GoReview workspace the home used to be: what is due, what intake proposes and why, the session
 * controls, the deck with its per-item controls, and a session start. It is not on the home (the home shows four things only);
 * it is reached from Settings. Everything the learner sees about a proposal carries its reason; nothing is added to the deck
 * without it being shown.
 */
import type { IntakeOutcome, SessionPlan } from '../../src/types';
import type { AppContext } from '../context';
import { append, button, clear, embedTarget, h, langProps, p, setStatus, statusLine, type Child } from '../dom';
import { itemMarked } from '../events';
import { nextSkillGuidance } from '../admissionExplanation';
import { DIMENSION_LABEL, FAMILY_LABEL, languageName, unitLabel } from '../format';
import { beginSession, currentReviewModel, endSavedSession, recoverableSessions, resumeSession, reviewModelRevision, type ReviewModel } from '../workspace';
import { freshModel } from '../freshness';
import { deckSizeControl } from './cardsper';
import { prefsForm } from './prefs';
import { addToDeck, planCurrentDeck, planSelectedPractice, releaseHoldOut, selectedPracticeUnits } from '../deckModel';
import { isNotExamined } from '../../src/intake/intake';
import { itemIdFor } from '../../src/scheduler/deck';
import type { View } from './view';

export async function renderDetails(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const root = h('div', { id: 'review-details' });
  el.append(root);
  const status = statusLine();
  /** Saves of the session controls still in flight: Start waits for them, so a preference changed an instant before is the one planned with. */
  let saving: Promise<unknown>[] = [];
  /** How many events the painted model was folded from; a sync that brings more repaints the home. */
  let paintedEvents = -1;
  /** How many model-changing refreshes had landed when this was last drawn. */
  let paintedRevision = -1;

  async function paint(quiet = false): Promise<void> {
    // this device's own copy at once; the live refresh runs in the background and repaints this page when it lands (ctx.onData below)
    const idn = await ctx.identity().catch(() => undefined);
    paintedRevision = idn ? reviewModelRevision(ctx, idn) : -1;
    const model = await currentReviewModel(ctx, quiet ? { noRefresh: true } : {});
    if (!view.alive()) return;
    paintedEvents = model?.events.length ?? -1;
    saving = [];
    // everything the page shows is built before the old page is replaced, so a repaint never shows an empty page in between
    const built = model ? await Promise.all([
      planCurrentDeck(ctx, model), recoveryBlock(), selectedPracticeUnits(ctx, model.identity.learnerId, model.identity.languageId),
    ]) : undefined;
    if (!view.alive()) return;
    clear(root);
    if (!model) {
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
    const tag = model.identity.varietyId ?? model.identity.languageId;
    root.setAttribute('lang', 'en');
    const [planned, recovery, selected] = built!;
    append(root, [summary(model, planned.plan), startBlock(model), recovery,
      optionalPractice(model, planned.summary.remediation, selected.length),
      controlsBlock(model), candidatesBlock(model, tag, planned.plan), deckBlock(model, tag), status]);
  }

  async function recoveryBlock(): Promise<HTMLElement | null> {
    const sessions = await recoverableSessions(ctx);
    if (!view.alive() || !sessions.length) return null;
    const rows = sessions.map((saved) => h('div', { class: 'row', 'data-session-id': saved.sessionId },
      p(`Session from ${new Date(saved.startedAt).toLocaleString()} · ${saved.index} of ${saved.plan.items.length} prompts completed`, 'muted'),
      button('Resume', () => {
        void (async () => {
          const resumed = await resumeSession(ctx, saved.sessionId);
          if (!resumed.ok) { setStatus(status, resumed.message, 'error'); return; }
          ctx.run.active = resumed.run;
          ctx.go('review/session');
        })();
      }, { class: 'btn primary', 'data-action': 'resume-session' }),
      button('End without grading the rest', () => {
        void (async () => {
          const ended = await endSavedSession(ctx, saved.sessionId);
          setStatus(status, ended ? 'Session ended. Completed reviews are preserved; unanswered prompts remain due.' : 'The saved session could not be ended.', ended ? 'ok' : 'error');
          await paint();
        })();
      }, { class: 'btn', 'data-action': 'end-session' })));
    return h('section', { class: 'card', id: 'recoverable-sessions', 'aria-labelledby': 'recoverable-heading' },
      h('h2', { id: 'recoverable-heading' }, 'Resume a session'), ...rows);
  }

  // ── due-review summary
  function summary(m: ReviewModel, plan: SessionPlan): HTMLElement {
    const c = m.counts;
    const candidates = m.outcomes.filter((o) => o.decision === 'test-now' || o.decision === 'test-later');
    const listening = !m.audio.available ? `not available: ${m.audio.reason}` : m.audio.eligibleForEvidence ? 'available (counts as listening evidence)' : 'available as practice only: synthetic speech never counts as listening evidence';
    const levels = new Map(m.knowledge.map((entry) => [entry.unitId, entry.level]));
    for (const outcome of m.outcomes) if (outcome.knowledge && !levels.has(outcome.unitId)) levels.set(outcome.unitId, outcome.knowledge.level);
    const stageCounts = new Map<string, number>();
    for (const planned of plan.items) {
      const level = levels.get(planned.item.unitId) ?? 'unknown';
      stageCounts.set(level, (stageCounts.get(level) ?? 0) + 1);
    }
    return h('section', { class: 'card', id: 'due-summary', 'aria-labelledby': 'due-h' },
      h('h2', { id: 'due-h' }, `${languageName(m.identity.languageId)} · Today`),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Due'), h('dd', { id: 'count-due' }, String(c.due)),
        h('dt', {}, 'Learning'), h('dd', { id: 'count-learning' }, String(c.learning)),
        h('dt', {}, 'New in your deck'), h('dd', { id: 'count-fresh' }, String(c.fresh)),
        h('dt', {}, 'New candidates'), h('dd', { id: 'count-candidates' }, String(candidates.length)),
        h('dt', {}, 'Listening'), h('dd', { id: 'listening-availability' }, listening)),
      h('h3', {}, 'Recommended for this session'),
      h('dl', { class: 'facts', id: 'session-overview' }, h('dt', {}, 'Fits the time budget'), h('dd', {}, String(plan.items.length)), ...[...stageCounts].flatMap(([level, count]) => [h('dt', {}, level[0].toUpperCase() + level.slice(1)), h('dd', {}, String(count))])),
      c.suspended + c.snoozed + c.dismissed ? p(`Set aside: ${c.suspended} suspended, ${c.snoozed} snoozed, ${c.dismissed} dismissed.`, 'muted') : null,
      p(`Scheduler: ${m.algorithm}. Scheduling is retention bookkeeping, not a measure of what you know.`, 'muted'));
  }

  function startBlock(m: ReviewModel): HTMLElement {
    const note = p('', 'muted');
    const start = button('Start a session', () => {
      start.disabled = true;
      void (async () => {
        await Promise.allSettled(saving);
        const current = await freshModel(ctx, m);
        const planned = await planCurrentDeck(ctx, current);
        const r = await beginSession(ctx, current, { plan: planned.plan });
        if (!r.ok) { start.disabled = false; setStatus(status, r.message, 'info'); return; }
        ctx.run.active = r.run;
        ctx.go('review/session');
      })();
    }, { id: 'start-session', class: 'btn primary' });
    note.textContent = `${m.prefs.cardsPerDeck ?? 10} cards per deck, at most ${m.prefs.maxNew} new item(s) from the schedule. Review results are recorded only when you answer.`;
    const size = deckSizeControl(ctx, m.identity.learnerId, m.identity.languageId, m.prefs.cardsPerDeck, () => { void paint(); }, 'details');
    return h('section', { class: 'card' }, h('div', { class: 'row' }, start, h('a', { class: 'btn', href: '#/review/transfer', id: 'link-transfer' }, 'Transfer measures')), h('p', {}, 'Cards per deck'), size, note);
  }

  function optionalPractice(model: ReviewModel, missed: number, selected: number): HTMLElement | null {
    if (!missed && !selected) return null;
    const start = button(`Practice selected words (${selected})`, () => {
      start.disabled = true;
      void (async () => {
        const fresh = await freshModel(ctx, model);
        const plan = await planSelectedPractice(ctx, fresh);
        if (!plan.items.length) { setStatus(status, 'Selected words are controlled or no usable exercise is available.', 'info'); return; }
        const result = await beginSession(ctx, fresh, { plan });
        if (!result.ok) { setStatus(status, result.message, 'info'); return; }
        await releaseHoldOut(ctx, fresh.identity.learnerId, fresh.identity.languageId);
        ctx.run.active = result.run;
        ctx.go('review/session');
      })().catch(error => setStatus(status, String(error), 'error')).finally(() => { if (view.alive()) start.disabled = false; });
    }, { id: 'start-selected-practice', class: 'btn' });
    return h('section', { class: 'card', 'aria-labelledby': 'optional-practice-heading' },
      h('h2', { id: 'optional-practice-heading' }, 'Optional practice'),
      h('div', { class: 'row' },
        missed ? h('a', { class: 'linklike', id: 'open-remediation', href: '#/review/remediation' },
          `${missed} missed ${missed === 1 ? 'word' : 'words'} to study`) : null,
        selected ? start : null));
  }

  function controlsBlock(m: ReviewModel): HTMLElement {
    const d = h('details', { class: 'card', id: 'session-controls' }, h('summary', {}, 'Session controls'),
      prefsForm(ctx, m.identity.learnerId, m.prefs, () => { setStatus(status, 'Preferences saved.', 'ok'); }, (p) => { saving.push(p); }, { deckSize: false }));
    return d;
  }

  // ── candidates and their reasons
  async function act(fn: () => Promise<void>, ok: string | readonly Child[]): Promise<void> {
    try { await fn(); setStatus(status, ok, 'ok'); } catch (e) { setStatus(status, e instanceof Error ? e.message : String(e), 'error'); }
    await paint();
  }

  /** The unit's label as target-language text, for a sentence in the interface language. */
  const quote = (unitId: string, tag: string): HTMLElement => h('span', langProps(tag), unitLabel(unitId));

  function candidateRow(m: ReviewModel, o: IntakeOutcome, tag: string, plan: SessionPlan): HTMLElement {
    const label = unitLabel(o.unitId);
    const words = [label];
    const later = m.choices[o.unitId] === 'later';
    const actions = h('div', { class: 'row' });
    if (o.proposed) {
      actions.append(
        button('Test now', () => void act(async () => {
          const ectx = await ctx.eventContext();
          if (!ectx || !o.proposed) return;
          await addToDeck(ctx, m.identity, { unitId:o.unitId, unitKind:o.candidate.kind, ...o.proposed });
          await ctx.state.setChoice(m.identity.learnerId, o.unitId, undefined);
        }, ['Added ', quote(o.unitId, tag), ' to optional selected practice.']), { class: 'btn small', 'data-act': 'test-now', 'aria-label': `Test now: ${label}` }),
        button(later ? 'Undo "later"' : 'Later', () => void act(async () => { await ctx.state.setChoice(m.identity.learnerId, o.unitId, later ? undefined : 'later'); }, later ? 'Back in the proposals.' : 'Kept for later; it will not be added to the next session.'), { class: 'btn small', 'data-act': 'later', 'aria-label': `${later ? 'Undo "later"' : 'Later'}: ${label}` }),
      );
    }
    actions.append(button('Dismiss', () => void act(async () => {
      const ectx = await ctx.eventContext();
      if (!ectx) return;
      const r = await ctx.record([itemMarked(ectx, ctx.deps.newId(), o.unitId, 'ignore')]);
      if (r.refused.length) throw new Error(r.refused[0].issues.join('; '));
    }, ['Dismissed ', quote(o.unitId, tag), '; it will not be proposed again.']), { class: 'btn small', 'data-act': 'dismiss', 'aria-label': `Dismiss: ${label} (proposal)` }));
    const reasons = h('ul', { class: 'reasons' }, ...o.reasons.map((r) => h('li', {}, ...embedTarget(r, words, tag))));
    const rules = o.candidate.reasons.length
      ? h('ul', { class: 'reasons' }, ...o.candidate.reasons.map((r) => h('li', {}, ...embedTarget(`${r.rule} (weight ${r.weight.toFixed(2)})${r.detail ? `: ${r.detail}` : ''}`, words, tag))))
      : null;
    const cardId = o.proposed ? itemIdFor(o.unitId, o.proposed.dimension) : undefined;
    const queued = cardId ? plan.items.find(item => item.item.itemId === cardId) : undefined;
    const deferred = cardId ? plan.skipped.find(item => item.itemId === cardId) : undefined;
    const disposition = queued
      ? `This session plan: included as ${queueLabel(queued.queue)}.`
      : deferred
        ? `This session plan: not included — ${deferredLabel(deferred.code, deferred.why)}.`
        : o.proposed && (o.decision === 'test-now' || o.decision === 'test-later')
          ? 'This candidate is available for practice, but is not in this session plan.' : undefined;
    const nextSkill = nextSkillGuidance(o);
    return h('li', { class: 'candidate', 'data-unit': o.unitId, 'data-decision': o.decision, ...(later ? { 'data-choice': 'later' } : {}) },
      h('div', { class: 'row' },
        h('strong', langProps(tag), label),
        h('span', { class: 'tag' }, decisionLabel(o.decision, o)),
        o.proposed ? h('span', { class: 'muted' }, FAMILY_LABEL[o.proposed.family]) : null,
        later ? h('span', { class: 'tag' }, 'kept for later') : null),
      h('p', { class: 'reason' }, ...embedTarget(o.reasons[0] ?? '', words, tag)),
      disposition ? p(disposition, 'muted') : null,
      nextSkill ? p(nextSkill, 'muted') : null,
      h('details', { class: 'why' }, h('summary', {}, 'Why'), h('p', {}, ...embedTarget(ctx.engine.explainIntake(o), words, tag)), reasons, rules ? h('p', { class: 'muted' }, 'What the Repository saw:') : null, rules),
      actions);
  }

  function candidatesBlock(m: ReviewModel, tag: string, plan: SessionPlan): HTMLElement {
    const sec = h('section', { class: 'card', id: 'candidates', 'aria-labelledby': 'cand-h' }, h('h2', { id: 'cand-h' }, 'Practice candidates'));
    sec.append(p('These words may be useful to practice. Candidate rank compares them, then the session plan checks available word facts, your practice goals, time and new-word allowance. A high rank does not promise a place. Scheduled review cards are shown separately.'));
    sec.append(h('p', { id: 'vocabulary-recording-note' }, 'Recorded words and practice cards are separate. ', h('a', { href: '#/vocabulary' }, 'View your recorded words'), '. Words may need more reliable analysis or an answer key before they can become practice cards.'));
    if (m.candidateNote) sec.append(p(m.candidateNote, m.candidateSource === 'none' ? 'error' : 'muted'));
    if (!m.outcomes.length) { sec.append(p(m.candidateSource === 'none' ? 'No candidates are available.' : 'The Repository has no new candidates for you right now.', 'muted')); return sec; }
    const group = (title: string, items: IntakeOutcome[], open: boolean): void => {
      if (!items.length) return;
      sec.append(h('details', { class: 'group', ...(open ? { open: true } : {}) }, h('summary', {}, `${title} (${items.length})`), h('ul', { class: 'candidates' }, ...items.map((o) => candidateRow(m, o, tag, plan)))));
    };
    group('Practice candidates', m.outcomes.filter((o) => o.decision === 'test-now' || o.decision === 'test-later'), true);
    group('Lower candidate rank', m.outcomes.filter((o) => o.decision === 'low-priority' && o.proposed && !isNotExamined(o)), false);
    const unchecked = m.outcomes.filter(isNotExamined);
    group('Not yet checked', unchecked, false);
    group('Not proposed', m.outcomes.filter((o) => o.decision !== 'test-now' && o.decision !== 'test-later' && !(o.decision === 'low-priority' && o.proposed)), false);
    if (m.dismissed.length) sec.append(p(`${m.dismissed.length} unit(s) you dismissed are not proposed.`, 'muted'));
    return sec;
  }

  // ── the deck, with per-item controls
  function deckBlock(m: ReviewModel, tag: string): HTMLElement {
    const sec = h('details', { class: 'card', id: 'deck' }, h('summary', {}, `Your deck (${m.deck.length})`));
    if (!m.deck.length) { sec.append(p('Your deck is empty. GoReview adds the highest-ranked words automatically when a reliable exercise is available and your new-item limit allows it.', 'muted')); return sec; }
    const list = h('ul', { class: 'deck' });
    for (const item of m.deck) {
      const row = h('li', { 'data-item': item.itemId, 'data-status': item.status },
        h('span', langProps(tag), unitLabel(item.unitId)), ' ',
        h('span', { class: 'muted' }, `${DIMENSION_LABEL[item.dimension]} · ${item.status}${item.status === 'snoozed' && item.snoozedUntil ? ` until ${item.snoozedUntil.slice(0, 10)}` : item.history.length ? ` · due ${item.schedule.due.slice(0, 10)}` : ' · new'}`), ' ',
        h('a', { href: `#/review/history/${encodeURIComponent(item.itemId)}`, 'aria-label': `History of ${unitLabel(item.unitId)}` }, 'History'));
      const ctl = (label: string, control: Parameters<typeof ctx.engine.controlEvent>[2], done: readonly Child[]): void => {
        row.append(' ', button(label, () => void act(async () => {
          const ectx = await ctx.eventContext();
          if (!ectx) return;
          const ev = ctx.engine.controlEvent(ectx, item, control);
          if (!ev) throw new Error('That does not apply to this item.');
          await ctx.record([ev]);
        }, done), { class: 'btn small', 'data-control': control.kind, 'aria-label': `${label}: ${unitLabel(item.unitId)} (in your deck)` }));
      };
      if (item.status === 'active') {
        const until = new Date(ctx.deps.now().getTime() + 24 * 3600_000).toISOString();
        ctl('Snooze a day', { kind: 'snooze', until }, ['Snoozed ', quote(item.unitId, tag), ' until tomorrow.']);
        ctl('Suspend', { kind: 'suspend' }, ['Suspended ', quote(item.unitId, tag), '.']);
        ctl('Dismiss', { kind: 'dismiss' }, ['Dismissed ', quote(item.unitId, tag), '.']);
      } else if (item.status !== 'dismissed') ctl('Resume', { kind: 'resume' }, ['Resumed ', quote(item.unitId, tag), '.']);
      else ctl('Bring back', { kind: 'resume' }, ['Brought back ', quote(item.unitId, tag), '.']);
      list.append(row);
    }
    sec.append(list);
    return sec;
  }

  await paint();

  // E-04: the first pull of this device may finish after the home was painted; a card another device added must not stay invisible
  // until the next visit. Repaint when a sync leaves the local log with a different number of events (unless the learner is typing).
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
        const refreshed = reviewModelRevision(ctx, id) !== paintedRevision;
        if ((count !== paintedEvents || refreshed) && !typing) await paint(count === paintedEvents && refreshed);
      } while (again);
    } catch { /* the home stays as painted */ } finally { repainting = false; }
  };
  void ctx.whenSynced().then(repaintIfChanged);
  view.onDispose(ctx.onSync(() => { void repaintIfChanged(); }));
  view.onDispose(ctx.onData(() => { void repaintIfChanged(); }));
}

const DECISION_LABEL: Record<IntakeOutcome['decision'], string> = {
  'test-now': 'practice candidate', 'test-later': 'practice later', 'already-covered': 'already covered', redundant: 'not needed',
  'too-uncertain': 'not ready yet', 'needs-validation': 'needs better word facts', 'low-priority': 'lower candidate rank',
};
const decisionLabel = (d: IntakeOutcome['decision'], o?: IntakeOutcome): string => (o && isNotExamined(o) ? 'not yet checked' : DECISION_LABEL[d]);

function queueLabel(queue: SessionPlan['items'][number]['queue']): string {
  switch (queue) {
    case 'new': return 'new-word practice';
    case 'learning': return 'learning return';
    case 'due': return 'scheduled review';
    case 'remediation': return 'repair practice';
    default: return 'practice';
  }
}

function deferredLabel(code: SessionPlan['skipped'][number]['code'], detail: string): string {
  switch (code) {
    case 'beyond-micro-deck': return 'this session is full, so it waits for a later session';
    case 'new-budget-exhausted':
    case 'daily-allowance-exhausted': return 'your new-word allowance is used';
    case 'over-time-budget': return 'it does not fit the session time you set';
    case 'same-unit-in-batch': return 'another question for this word is already in this session';
    case 'facts-unavailable': return 'a reliable question could not be built yet';
    case 'knowledge-beyond-new-required': return 'GoReview waits until you have met this word while reading';
    case 'seen-evidence-insufficient': return 'another reading encounter is needed before practice';
    case 'listening-audio-unavailable': return 'suitable audio is not available';
    case 'learner-control': return 'you kept it for later';
    default: return detail;
  }
}
