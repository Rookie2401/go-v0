/**
 * #/developer — what the owner and the developers need and a learner never does (moved out of Settings on 2026-10-28): the service address,
 * the synchronisation state with its counters and "Sync now", the diagnostics (versions, scheduler, learner and device ids, queue counts,
 * cursors, clock skew) and the account's security events. Reached from the quiet "Developer information" line at the foot of Settings.
 */
import { CONTRACT_VERSION } from '../../repository-contract/src';
import type { AppContext } from '../context';
import { validateServiceUrl } from '../config';
import { append, button, clear, field, h, setStatus, shortDate, statusLine } from '../dom';
import { eventsBlock } from './accountSecurity';
import { syncLine } from './settings';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  const mode = await ctx.mode();
  const id = await ctx.identity();
  const serviceBox = h('section', { class: 'card', id: 'settings-service', 'aria-labelledby': 'svc-h' }, h('h2', { id: 'svc-h' }, 'Service address (only used if you sign in)'));
  const syncBox = h('section', { class: 'card', id: 'settings-sync', 'aria-labelledby': 'sync-h' }, h('h2', { id: 'sync-h' }, 'Synchronisation'));
  const diagBox = h('section', { class: 'card', id: 'settings-diagnostics', 'aria-labelledby': 'diag-h' }, h('h2', { id: 'diag-h' }, 'Diagnostics'));
  el.append(h('p', { class: 'muted' }, 'For the people who run GoReview. Nothing here is needed to learn with it.'), serviceBox, syncBox, diagBox, ...(session ? [eventsBlock(ctx, view)] : []));

  // ── service address
  const url = h('input', { type: 'url', id: 'settings-svc-url', name: 'svc-url', autocomplete: 'off', spellcheck: 'false', value: await ctx.serviceUrl() }) as HTMLInputElement;
  const svcStatus = statusLine();
  append(serviceBox, [
    field('Go Repository service', url, 'https, or http on localhost for development. Leave empty to use the default.'),
    h('div', { class: 'row' }, button('Use this address', () => {
      void (async () => {
        const raw = url.value.trim();
        if (raw) { const c = validateServiceUrl(raw); if (!c.ok) { setStatus(svcStatus, c.message, 'error'); return; } }
        const r = await ctx.saveService(raw || undefined);
        if (!r.ok) { setStatus(svcStatus, r.message, 'error'); return; }
        url.value = await ctx.serviceUrl();
        setStatus(svcStatus, `Service address set to ${url.value}. Sign in again if you changed service.`, 'ok');
      })();
    }, { id: 'settings-svc-save', class: 'btn' })), svcStatus,
  ]);

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
      ['GoPractice', ctx.deps.appVersion],
      ['Event contract', String(CONTRACT_VERSION)],
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
