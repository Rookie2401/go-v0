/** #/settings — preferences, account, service address, synchronisation, diagnostics, licences and attribution. */
import { CONTRACT_VERSION } from '../../repository-contract/src';
import type { AppContext, Mode, SyncView } from '../context';
import { validateServiceUrl } from '../config';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import { setRemoteSpeechConsent } from './consent';
import { licencesSection } from './licences';
import { legalLinks, renderAccountDetails } from './accountSecurity';
import { prefsForm } from './prefs';
import { profileControls } from '../profiles';
import type { View } from './view';

/** "just now", "40 s ago", "5 min ago", "3 h ago"; a date beyond a day. */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return shortDate(new Date(at).toISOString());
}

/**
 * The one quiet line at the top of the Synchronisation card: whether the account is up to date, when something was last sent and fetched, how many
 * events wait on this device, and, if the service is not being reached, why and when the next attempt is.
 */
export function syncLine(v: SyncView, mode: Mode, now: number): { text: string; kind: 'ok' | 'info' | 'error' } {
  if (mode === 'none') return { text: 'Not signed in.', kind: 'info' };
  if (mode === 'device') return { text: 'On this device only: nothing is sent anywhere.', kind: 'info' };
  if (v.authExpired) return { text: 'Sign in again to sync. Nothing on this device was lost.', kind: 'error' };
  const s = v.status;
  if (!s) return { text: 'Sync has not started yet.', kind: 'info' };
  const waiting = s.pending ? `${s.pending} waiting on this device` : 'nothing waiting';
  const sent = s.lastPushAt ? `sent ${ago(s.lastPushAt, now)}` : 'nothing sent yet';
  const fetched = s.lastPullAt ? `fetched ${ago(s.lastPullAt, now)}` : 'nothing fetched yet';
  if (!s.online) return { text: `Offline · ${waiting} · will send when the connection returns`, kind: 'info' };
  if (s.lastError) {
    const retry = s.nextRetryAt === undefined || s.nextRetryAt <= now ? 'trying again now' : `trying again in ${Math.max(1, Math.round((s.nextRetryAt - now) / 1000))} s`;
    return { text: `Not reaching the service: ${s.lastError} · ${waiting} · ${retry}`, kind: 'error' };
  }
  if (v.syncing) return { text: `Syncing · ${waiting}`, kind: 'info' };
  return { text: `${s.pending ? 'Waiting to send' : 'Up to date'} · ${sent} · ${fetched} · ${waiting}`, kind: s.pending ? 'info' : 'ok' };
}

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  const mode = await ctx.mode();
  const id = await ctx.identity();
  // everything the GoReview home no longer shows is kept here, one tap away
  const moreBox = h('section', { class: 'card', id: 'settings-more', 'aria-labelledby': 'more-h' }, h('h2', { id: 'more-h' }, 'More from GoReview'),
    h('ul', { class: 'plainlinks' },
      h('li', {}, h('a', { href: '#/review/details', id: 'link-details' }, 'Review details'), h('span', { class: 'muted' }, ' · the proposals with their reasons, the deck and its controls, the counts')),
      h('li', {}, h('a', { href: '#/review/transfer', id: 'link-transfer' }, 'Transfer measures'), h('span', { class: 'muted' }, ' · research measures, not conclusions')),
      h('li', {}, h('a', { href: '#/vocabulary', id: 'link-vocabulary' }, 'Vocabulary details'), h('span', { class: 'muted' }, ' · search, filters and the unit records'))));
  const prefsBox = h('section', { class: 'card', id: 'settings-prefs', 'aria-labelledby': 'prefs-h' }, h('h2', { id: 'prefs-h' }, 'Review preferences'));
  const accountBox = h('section', { class: 'card', id: 'settings-account', 'aria-labelledby': 'acct-h' }, h('h2', { id: 'acct-h' }, 'Account'));
  const serviceBox = h('section', { class: 'card', id: 'settings-service', 'aria-labelledby': 'svc-h' }, h('h2', { id: 'svc-h' }, 'Service address (only used if you sign in)'));
  const syncBox = h('section', { class: 'card', id: 'settings-sync', 'aria-labelledby': 'sync-h' }, h('h2', { id: 'sync-h' }, 'Synchronisation'));
  const diagBox = h('section', { class: 'card', id: 'settings-diagnostics', 'aria-labelledby': 'diag-h' }, h('h2', { id: 'diag-h' }, 'Diagnostics'));
  const accountMore = h('div', { id: 'settings-account-more' });
  el.append(moreBox, prefsBox, accountBox, accountMore, serviceBox, syncBox, diagBox, licencesSection(ctx), legalLinks());
  // an account: confirmation, sessions, the data download, deletion with its grace period, and the security events
  if (session) renderAccountDetails(accountMore, ctx, view);

  // ── preferences
  if (id) {
    const prefs = await ctx.state.getPrefs(id.learnerId, id.languageId);
    prefsBox.append(p(`These apply to ${id.languageId}${id.varietyId ? ` (${id.varietyId})` : ''}, the active language.`, 'muted'), prefsForm(ctx, id.learnerId, prefs));
  } else prefsBox.append(p(mode === 'device' ? 'Choose a language in GoLearn setup to set preferences.' : 'Sign in and choose a language to set preferences.', 'muted'));
  prefsBox.append(await profileControls(ctx));
  const settings = await ctx.state.getSettings();
  const consent = h('input', { type: 'checkbox', id: 'consent-remote-speech', name: 'remote-speech' }) as HTMLInputElement;
  consent.checked = settings.remoteSpeechConsent;
  const consentStatus = statusLine();
  // the switch records ConsentGiven / ConsentWithdrawn through the event queue (screens/consent.ts); when the record cannot be made it stays off
  consent.addEventListener('change', () => {
    const wanted = consent.checked;
    void setRemoteSpeechConsent(ctx, wanted).then((r) => {
      consent.checked = r.settings.remoteSpeechConsent;
      if (!r.ok) setStatus(consentStatus, r.message, 'error');
      else setStatus(consentStatus, wanted ? 'Remote speech is allowed on this device. Your consent is recorded.' : r.recorded ? 'Remote speech is off. Your withdrawal is recorded.' : 'Remote speech is off.', 'ok');
    }, () => { consent.checked = !wanted; setStatus(consentStatus, 'The switch could not be changed.', 'error'); });
  });
  prefsBox.append(h('label', { class: 'toggle' }, consent, h('span', {}, 'Allow my text to be sent to a remote speech service ', h('span', { class: 'help' }, '(only for listening practice; off by default; the browser\'s own voices do not need this)'))), consentStatus);

  // ── account
  const out = statusLine();
  if (session) {
    append(accountBox, [
      h('p', { id: 'settings-email' }, `Signed in as ${session.email}`),
      h('p', { class: 'muted' }, `Learner ${session.learnerId} · session until ${shortDate(session.expiresAt)}`),
      h('div', { class: 'row' },
        button('Sign out', () => void signOut(false), { id: 'sign-out', class: 'btn' }),
        button('Sign out and remove this device\'s data', () => void signOut(true), { id: 'sign-out-forget', class: 'btn' })),
      p('Signing out sends what is waiting when it can. Removing this device\'s data also deletes the local copy of your events and any events that could not be sent.', 'muted'),
      out,
    ]);
  } else if (mode === 'device') {
    // no account: the data is on this device. The account is offered, and clearing the device is its own deliberate step
    const clearOut = statusLine();
    let armed = false;
    const clearBtn = button('Clear local data', () => {
      void (async () => {
        if (!armed) {
          armed = true;
          clearBtn.textContent = 'Click again to clear';
          setStatus(clearOut, 'This removes your reviews, drafts, preferences and the on-device record kept on this device. An account, if you have one, is not touched. Move on to cancel.', 'info');
          return;
        }
        armed = false;
        clearBtn.textContent = 'Clear local data';
        const n = await ctx.clearLocalData();
        setStatus(clearOut, `Cleared the local data on this device (${n} row${n === 1 ? '' : 's'}).`, 'ok');
      })();
    }, { id: 'clear-local', class: 'btn' });
    clearBtn.addEventListener('blur', () => { if (armed) { armed = false; clearBtn.textContent = 'Clear local data'; setStatus(clearOut, 'Nothing was cleared.', 'info'); } });
    append(accountBox, [
      h('p', { id: 'settings-device-only' }, 'On this device only.'),
      p('Your reviews and drafts are kept on this device, and nothing is sent anywhere. An account is optional; it only keeps your progress across devices.', 'muted'),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/signin', id: 'settings-keep-progress' }, 'Keep your progress across devices (optional)'), clearBtn),
      clearOut,
    ]);
  } else accountBox.append(p('Not signed in.', 'muted'), h('a', { class: 'btn primary', href: '#/signin' }, 'Sign in'));
  async function signOut(forget: boolean): Promise<void> {
    const r = await ctx.signOut({ forget });
    if (r.pendingLeft && !forget) setStatus(out, `${r.pendingLeft} event(s) could not be sent and stay on this device under your account.`, 'info');
    // back to the device alone where there is one (nothing was removed); the hosted copy has nothing to show without an account
    ctx.go((await ctx.mode()) === 'device' ? 'review' : 'signin');
  }

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
