/**
 * #/review — the GoReview workspace: what is due, what intake proposes and why, the session controls, and the start of
 * a session. Sub-routes: #/review/session (the session and its summary), #/review/history/<item>, #/review/transfer.
 * Everything the learner sees about a proposal carries its reason; nothing is added to the deck without it being shown.
 */
import type { IntakeOutcome } from '../../goreview/src/types';
import type { AppContext } from '../context';
import { append, button, clear, embedTarget, h, langProps, p, setStatus, statusLine, type Child } from '../dom';
import { itemMarked } from '../events';
import { DIMENSION_LABEL, FAMILY_LABEL, unitLabel } from '../format';
import { beginSession, loadReviewModel, type ReviewModel } from '../workspace';
import { renderHistory, renderTransfer } from './history';
import { prefsForm } from './prefs';
import * as sessionScreen from './session';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View, params: string[]): Promise<void> {
  const [sub, ...rest] = params;
  if (sub === 'session') return sessionScreen.render(el, ctx, view);
  if (sub === 'history') return renderHistory(el, ctx, view, rest);
  if (sub === 'transfer') return renderTransfer(el, ctx);

  const root = h('div', { id: 'review-home' });
  el.append(root);
  const status = statusLine();
  /** Saves of the session controls still in flight: Start waits for them, so a preference changed an instant before is the one planned with. */
  let saving: Promise<unknown>[] = [];
  /** How many events the painted model was folded from; a sync that brings more repaints the home. */
  let paintedEvents = -1;

  async function paint(): Promise<void> {
    const model = await loadReviewModel(ctx);
    if (!view.alive()) return;
    paintedEvents = model?.events.length ?? -1;
    saving = [];
    clear(root);
    if (!model) {
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
    const tag = model.identity.varietyId ?? model.identity.languageId;
    root.setAttribute('lang', 'en');
    append(root, [summary(model), startBlock(model), controlsBlock(model), candidatesBlock(model, tag), deckBlock(model, tag), status]);
  }

  // ── due-review summary
  function summary(m: ReviewModel): HTMLElement {
    const c = m.counts;
    const candidates = m.outcomes.filter((o) => o.decision === 'test-now' || o.decision === 'test-later');
    const listening = !m.audio.available ? `not available: ${m.audio.reason}` : m.audio.eligibleForEvidence ? 'available (counts as listening evidence)' : 'available as practice only: synthetic speech never counts as listening evidence';
    return h('section', { class: 'card', id: 'due-summary', 'aria-labelledby': 'due-h' },
      h('h2', { id: 'due-h' }, 'Today'),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Due'), h('dd', { id: 'count-due' }, String(c.due)),
        h('dt', {}, 'Learning'), h('dd', { id: 'count-learning' }, String(c.learning)),
        h('dt', {}, 'New in your deck'), h('dd', { id: 'count-fresh' }, String(c.fresh)),
        h('dt', {}, 'New candidates'), h('dd', { id: 'count-candidates' }, String(candidates.length)),
        h('dt', {}, 'Listening'), h('dd', { id: 'listening-availability' }, listening)),
      c.suspended + c.snoozed + c.dismissed ? p(`Set aside: ${c.suspended} suspended, ${c.snoozed} snoozed, ${c.dismissed} dismissed.`, 'muted') : null,
      p(`Scheduler: ${m.algorithm}. Scheduling is retention bookkeeping, not a measure of what you know.`, 'muted'));
  }

  /**
   * The model to plan with: the one on screen, unless the saved preferences or the local log have moved on since it was painted
   * (a preference changed an instant ago, a sync brought a card from another device), in which case it is loaded again.
   */
  async function freshModel(m: ReviewModel): Promise<ReviewModel> {
    await Promise.allSettled(saving);
    try {
      const prefs = await ctx.state.getPrefs(m.identity.learnerId, m.identity.languageId);
      const events = await ctx.events(m.identity.languageId);
      if (JSON.stringify(prefs) === JSON.stringify(m.prefs) && events.length === m.events.length) return m;
      return (await loadReviewModel(ctx)) ?? m;
    } catch { return m; }
  }

  function startBlock(m: ReviewModel): HTMLElement {
    const note = p('', 'muted');
    const start = button('Start a session', () => {
      start.disabled = true;
      void (async () => {
        const r = await beginSession(ctx, await freshModel(m));
        if (!r.ok) { start.disabled = false; setStatus(status, r.message, 'info'); return; }
        ctx.run.active = r.run;
        ctx.go('review/session');
      })();
    }, { id: 'start-session', class: 'btn primary' });
    note.textContent = `Up to ${m.prefs.sessionMinutes} minutes, at most ${m.prefs.maxNew} new item(s). Due items come first; what does not fit stays due. Nothing is written until you answer.`;
    return h('section', { class: 'card' }, h('div', { class: 'row' }, start, h('a', { class: 'btn', href: '#/review/transfer', id: 'link-transfer' }, 'Transfer measures')), note);
  }

  function controlsBlock(m: ReviewModel): HTMLElement {
    const d = h('details', { class: 'card', id: 'session-controls' }, h('summary', {}, 'Session controls'),
      prefsForm(ctx, m.identity.learnerId, m.prefs, () => { setStatus(status, 'Preferences saved.', 'ok'); }, (p) => { saving.push(p); }));
    return d;
  }

  // ── candidates and their reasons
  async function act(fn: () => Promise<void>, ok: string | readonly Child[]): Promise<void> {
    try { await fn(); setStatus(status, ok, 'ok'); } catch (e) { setStatus(status, e instanceof Error ? e.message : String(e), 'error'); }
    await paint();
  }

  /** The unit's label as target-language text, for a sentence in the interface language. */
  const quote = (unitId: string, tag: string): HTMLElement => h('span', langProps(tag), unitLabel(unitId));

  function candidateRow(m: ReviewModel, o: IntakeOutcome, tag: string): HTMLElement {
    const label = unitLabel(o.unitId);
    const words = [label];
    const later = m.choices[o.unitId] === 'later';
    const actions = h('div', { class: 'row' });
    if (o.proposed) {
      actions.append(
        button('Test now', () => void act(async () => {
          const ectx = await ctx.eventContext();
          if (!ectx || !o.proposed) return;
          const reason = o.reasons[0] ?? o.decision;
          const ev = ctx.engine.cardAdded(ectx, { unitId: o.unitId, unitKind: o.candidate.kind, dimension: o.proposed.dimension, family: o.proposed.family, reasons: [reason] }, 'learner');
          const r = await ctx.record([ev]);
          if (r.refused.length) throw new Error(r.refused[0].issues.join('; '));
          await ctx.state.setChoice(m.identity.learnerId, o.unitId, undefined);
        }, ['Added ', quote(o.unitId, tag), ' to your deck.']), { class: 'btn small', 'data-act': 'test-now', 'aria-label': `Test now: ${label}` }),
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
    return h('li', { class: 'candidate', 'data-unit': o.unitId, 'data-decision': o.decision, ...(later ? { 'data-choice': 'later' } : {}) },
      h('div', { class: 'row' },
        h('strong', langProps(tag), label),
        h('span', { class: 'tag' }, decisionLabel(o.decision)),
        o.proposed ? h('span', { class: 'muted' }, FAMILY_LABEL[o.proposed.family]) : null,
        later ? h('span', { class: 'tag' }, 'kept for later') : null),
      h('p', { class: 'reason' }, ...embedTarget(o.reasons[0] ?? '', words, tag)),
      h('details', { class: 'why' }, h('summary', {}, 'Why'), h('p', {}, ...embedTarget(ctx.engine.explainIntake(o), words, tag)), reasons, rules ? h('p', { class: 'muted' }, 'What the Repository saw:') : null, rules),
      actions);
  }

  function candidatesBlock(m: ReviewModel, tag: string): HTMLElement {
    const sec = h('section', { class: 'card', id: 'candidates', 'aria-labelledby': 'cand-h' }, h('h2', { id: 'cand-h' }, 'What you met, and what is worth testing'));
    if (m.candidateNote) sec.append(p(m.candidateNote, m.candidateSource === 'none' ? 'error' : 'muted'));
    if (!m.outcomes.length) { sec.append(p(m.candidateSource === 'none' ? 'No candidates are available.' : 'The Repository has no new candidates for you right now.', 'muted')); return sec; }
    const group = (title: string, items: IntakeOutcome[], open: boolean): void => {
      if (!items.length) return;
      sec.append(h('details', { class: 'group', ...(open ? { open: true } : {}) }, h('summary', {}, `${title} (${items.length})`), h('ul', { class: 'candidates' }, ...items.map((o) => candidateRow(m, o, tag)))));
    };
    group('Worth testing', m.outcomes.filter((o) => o.decision === 'test-now' || o.decision === 'test-later'), true);
    group('Not proposed', m.outcomes.filter((o) => o.decision !== 'test-now' && o.decision !== 'test-later'), false);
    if (m.dismissed.length) sec.append(p(`${m.dismissed.length} unit(s) you dismissed are not proposed.`, 'muted'));
    return sec;
  }

  // ── the deck, with per-item controls
  function deckBlock(m: ReviewModel, tag: string): HTMLElement {
    const sec = h('details', { class: 'card', id: 'deck' }, h('summary', {}, `Your deck (${m.deck.length})`));
    if (!m.deck.length) { sec.append(p('Your deck is empty. Items arrive from the proposals above.', 'muted')); return sec; }
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
        if (count !== paintedEvents && !typing) await paint();
      } while (again);
    } catch { /* the home stays as painted */ } finally { repainting = false; }
  };
  void ctx.whenSynced().then(repaintIfChanged);
  view.onDispose(ctx.onSync(() => { void repaintIfChanged(); }));
}

const DECISION_LABEL: Record<IntakeOutcome['decision'], string> = {
  'test-now': 'test now', 'test-later': 'test later', 'already-covered': 'already covered', redundant: 'not needed',
  'too-uncertain': 'too uncertain', 'needs-validation': 'needs validation', 'low-priority': 'low priority',
};
const decisionLabel = (d: IntakeOutcome['decision']): string => DECISION_LABEL[d];
