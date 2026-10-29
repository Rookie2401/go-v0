/**
 * #/settings — what a learner adjusts: the links to the detail pages, the review preferences (with the profile controls and the remote-speech
 * switch), the licences and the legal drafts. The account has its own page (#/account, the person icon in the header); the service address,
 * the synchronisation counters, the diagnostics and the security events are the developer's (#/developer, the quiet line at the foot).
 */
import type { AppContext, Mode, SyncView } from '../context';
import { h, p, setStatus, shortDate, statusLine } from '../dom';
import { setRemoteSpeechConsent } from './consent';
import { licencesSection } from './licences';
import { legalLinks } from './accountSecurity';
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
 * The one quiet line at the top of the Synchronisation card (#/developer): whether the account is up to date, when something was last sent and
 * fetched, how many events wait on this device, and, if the service is not being reached, why and when the next attempt is.
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

export async function render(el: HTMLElement, ctx: AppContext, _view: View): Promise<void> {
  const mode = await ctx.mode();
  const id = await ctx.identity();
  // everything the GoReview home no longer shows is kept here, one tap away
  const moreBox = h('section', { class: 'card', id: 'settings-more', 'aria-labelledby': 'more-h' }, h('h2', { id: 'more-h' }, 'More from GoReview'),
    h('ul', { class: 'plainlinks' },
      h('li', {}, h('a', { href: '#/review/details', id: 'link-details' }, 'Review details'), h('span', { class: 'muted' }, ' · the proposals with their reasons, the deck and its controls, the counts')),
      h('li', {}, h('a', { href: '#/review/transfer', id: 'link-transfer' }, 'Transfer measures'), h('span', { class: 'muted' }, ' · research measures, not conclusions')),
      h('li', {}, h('a', { href: '#/vocabulary', id: 'link-vocabulary' }, 'Vocabulary details'), h('span', { class: 'muted' }, ' · search, filters and the unit records'))));
  const prefsBox = h('section', { class: 'card', id: 'settings-prefs', 'aria-labelledby': 'prefs-h' }, h('h2', { id: 'prefs-h' }, 'Review preferences'));
  el.append(moreBox, prefsBox, licencesSection(ctx), legalLinks(),
    h('p', { class: 'muted developer-line', id: 'developer-line' }, h('a', { href: '#/developer', id: 'link-developer' }, 'Developer information')));

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
}
