/**
 * #/developer — what the owner and the developers need and a learner never does (moved out of Settings on 2026-10-28): the service address (read-only, among the diagnostics; the field that changed it went the same day),
 * the synchronisation state with its counters and "Sync now", the diagnostics (versions, scheduler, learner and device ids, queue counts,
 * cursors, clock skew) and the account's security events. Reached from the quiet "Developer information" line at the foot of Settings.
 */
import { CONTRACT_VERSION } from '../../../repository-contract/src';
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, shortDate, statusLine } from '../dom';
import { planCurrentDeck } from '../deckModel';
import { buildSelectionReport, selectionReportJson, type SelectionReport } from '../selectionReport';
import { loadReviewModel } from '../workspace';
import { eventsBlock } from './accountSecurity';
import { syncLine } from './settings';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  const mode = await ctx.mode();
  const id = await ctx.identity();
  const syncBox = h('section', { class: 'card', id: 'settings-sync', 'aria-labelledby': 'sync-h' }, h('h2', { id: 'sync-h' }, 'Synchronisation'));
  const diagBox = h('section', { class: 'card', id: 'settings-diagnostics', 'aria-labelledby': 'diag-h' }, h('h2', { id: 'diag-h' }, 'Diagnostics'));
  const whyBox = selectionSection(ctx, view);
  el.append(h('p', { class: 'muted' }, 'For the people who run GoReview. Nothing here is needed to learn with it.'), syncBox, diagBox, whyBox, ...(session ? [eventsBlock(ctx, view)] : []));

  // ── sync + diagnostics
  async function paintSync(): Promise<void> {
    const v = await ctx.syncView();
    if (!view.alive()) return;
    const s = v.status;
    clear(syncBox);
    const line = syncLine(v, mode, ctx.deps.now().getTime());
    append(syncBox, [
      h('h2', { id: 'sync-h' }, 'Synchronisation'),
      h('p', { id: 'sync-line', class: line.kind === 'error' ? 'error' : 'muted', 'data-kind': line.kind, role: 'status' }, line.text),
      h('dl', { class: 'facts', id: 'sync-facts' },
        h('dt', {}, 'Connection'), h('dd', {}, s ? (s.online ? 'online' : 'offline') : 'not started'),
        h('dt', {}, 'Waiting to send'), h('dd', { id: 'sync-pending' }, String(s?.pending ?? 0)),
        h('dt', {}, 'Refused by the service'), h('dd', {}, String(s?.rejected ?? 0)),
        h('dt', {}, 'Last send'), h('dd', {}, s?.lastPushAt ? shortDate(new Date(s.lastPushAt).toISOString()) : 'never'),
        h('dt', {}, 'Last fetch'), h('dd', {}, s?.lastPullAt ? shortDate(new Date(s.lastPullAt).toISOString()) : 'never'),
        h('dt', {}, 'Last error'), h('dd', { id: 'sync-error' }, s?.lastError ?? (v.authExpired ? 'sign-in expired' : 'none'))),
      h('div', { class: 'row' }, button('Sync now', () => { void (async () => { await ctx.syncNow({ force: true }); await paintSync(); })(); }, { id: 'sync-now', class: 'btn' })),
    ]);
    clear(diagBox);
    const d = await ctx.data();
    const events = id ? await ctx.events(id.languageId) : [];
    const prefs = id ? await ctx.state.getPrefs(id.learnerId, id.languageId) : undefined;
    const scheduler = prefs ? ctx.engine.scheduler(prefs) : undefined;
    const deck = id && prefs ? ctx.engine.foldDeck(events, id.languageId, prefs, ctx.deps.now().toISOString()) : [];
    const rejected = d ? (await d.queue.rejected()).length : 0;
    const rows: Array<[string, string]> = [
      ['GoReview', ctx.deps.appVersion],
      ['Event contract', String(CONTRACT_VERSION)],
      ['Service', await ctx.serviceUrl()],
      ['Scheduler', scheduler ? scheduler.algorithm : 'choose a language to see'],
      ['Scheduler parameters', scheduler ? scheduler.parametersVersion : 'choose a language to see'],
      ['Desired retention', prefs ? `${Math.round(prefs.desiredRetention * 100)}%` : '–'],
      ['Device', d?.deviceId ?? '–'],
      ['Learner', session?.learnerId ?? (mode === 'device' ? 'this device' : '–')],
      ['Session until', session ? shortDate(session.expiresAt) : '–'],
      ['Progress', mode === 'account' ? 'synced to your account' : mode === 'device' ? 'on this device only' : '–'],
      ['Language', id ? `${id.languageId}${id.varietyId ? ` (${id.varietyId})` : ''}` : '–'],
      ['Events in the local log', String(events.length)],
      ['Deck items', String(deck.length)],
      ['Waiting in the queue', String(s?.pending ?? 0)],
      ['Refused rows kept', String(rejected)],
      ['Quarantined pulled events', String(s?.quarantined ?? 0)],
      ['Fetch cursor / server head', `${s?.cursor ?? 0} / ${s?.head ?? '–'}`],
      ['Clock skew (device minus server)', s?.skewMs === undefined ? '–' : `${Math.round(s.skewMs)} ms`],
    ];
    append(diagBox, [h('h2', { id: 'diag-h' }, 'Diagnostics'), h('dl', { class: 'facts', id: 'diagnostics' }, ...rows.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)]))]);
  }
  await paintSync();
  view.onDispose(ctx.onSync(() => { void paintSync(); }));
}

/** Rows shown in the table; the copied JSON always carries every row. */
const ROW_LIMIT = 400;

/** "Why these cards": built on demand (it loads the model and plans a deck), read-only, nothing is written. */
function selectionSection(ctx: AppContext, view: View): HTMLElement {
  const box = h('section', { class: 'card', id: 'why-these-cards', 'aria-labelledby': 'why-h' }, h('h2', { id: 'why-h' }, 'Why these cards'));
  const status = statusLine();
  const result = h('div', { id: 'why-result' });
  let last: SelectionReport | undefined;

  async function build(): Promise<SelectionReport | undefined> {
    setStatus(status, 'Building the selection report…');
    try {
      const model = await loadReviewModel(ctx);
      if (!model) { setStatus(status, 'Choose a language first; there is nothing to report on yet.', 'error'); return undefined; }
      const current = await planCurrentDeck(ctx, model);
      const report = buildSelectionReport(model, current.plan);
      if (!view.alive()) return report;
      last = report;
      paint(report);
      setStatus(status, report.counts.selected + ' selected, ' + (report.rows.length - report.counts.selected) + ' not selected.', 'ok');
      return report;
    } catch (e) {
      setStatus(status, 'The report could not be built: ' + (e instanceof Error ? e.message : 'unknown error'), 'error');
      return undefined;
    }
  }

  function paint(report: SelectionReport): void {
    clear(result);
    const c = report.counts;
    const facts: Array<[string, string]> = [
      ['Vocabulary units', String(c.vocabularyUnits)], ['Knowledge rows', String(c.knowledgeRows)], ['Candidates', String(c.candidates)],
      ['Deck cards', String(c.deckCards)], ['Class cards', String(c.classCards)], ['Selected', String(c.selected)],
      ['Skipped by the planner', String(c.skipped)], ['Withheld', String(c.withheld)],
      ['Scheduler', report.policy.algorithm + ' ' + report.policy.parametersVersion], ['Priority policy', report.policy.priorityPolicyVersion],
    ];
    const shown = report.rows.slice(0, ROW_LIMIT);
    append(result, [
      h('dl', { class: 'facts', id: 'why-counts' }, ...facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('table', { class: 'why-table', id: 'why-rows' },
        h('caption', {}, 'One row per deck card, class card and candidate'),
        h('thead', {}, h('tr', {}, ...['Unit', 'Kind', 'Status', 'Code', 'Due', 'Phase'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, ...shown.map(r => h('tr', { 'data-code': r.code, 'data-status': r.status },
          h('td', {}, r.unitId), h('td', {}, r.kind), h('td', {}, r.status), h('td', {}, r.code), h('td', {}, r.due ?? '–'), h('td', {}, r.phase ?? '–'))))),
      report.rows.length > shown.length ? p('Showing the first ' + shown.length + ' of ' + report.rows.length + ' rows; the copied JSON has all of them.', 'muted') : null,
    ]);
  }

  async function copy(): Promise<void> {
    const report = last ?? await build();
    if (!report) return;
    const text = selectionReportJson(report);
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('the clipboard is not available here');
      await navigator.clipboard.writeText(text);
      setStatus(status, 'Diagnostic JSON copied (' + report.rows.length + ' rows).', 'ok');
    } catch (e) {
      setStatus(status, 'Could not copy: ' + (e instanceof Error ? e.message : 'unknown error'), 'error');
    }
  }

  append(box, [
    p('Which cards the next deck holds and the stable reason code for each card that is not in it.', 'muted'),
    h('div', { class: 'row' },
      button('Build selection report', () => { void build(); }, { id: 'why-build', class: 'btn' }),
      button('Copy diagnostic JSON', () => { void copy(); }, { id: 'why-copy', class: 'btn' })),
    status, result,
    p('The export holds unit ids and scheduling numbers only: no words, sentences, glosses, credentials or e-mail address.', 'muted'),
  ]);
  return box;
}
