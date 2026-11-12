/**
 * Settings (redesigned 2026-11-11, docs/golearn/DESIGN-SYSTEM.md): the account first (who is signed in, or that this device is on its own;
 * the name; sign out), then every other page of the application as a short list grouped by what a person wants to do, each a name and
 * one line of what is there, the whole row a link:
 *   READING        Audio; Privacy and data; Look up pasted text
 *   ADVANCED       Sync; How GoLearn reads pages; Diagnostics and updates
 * and at the foot Help, the Terms and the Privacy Policy.
 */
import type { AppContext } from '../context';
import { h } from '../dom';
import { renderAccountSection } from './account';
import { renderAccountDetails } from './accountSecurity';
import type { View } from './view';

export interface SettingsLink { id: string; title: string; about: string }

/** What a learner sets for their reading, day to day. */
export const READING_LINKS: readonly SettingsLink[] = [
  { id: 'audio', title: 'Audio', about: 'Hearing the words: the voices on this device, and remote voices.' },
  { id: 'privacy', title: 'Privacy and data', about: 'What GoLearn keeps, how much it explains, and your data: export, clear, delete.' },
  { id: 'share', title: 'Look up pasted text', about: 'Paste a word or a sentence from another app and look it up here.' },
];
/** The pages most learners never need, each with the one line that says what it is for. */
export const ADVANCED_LINKS: readonly SettingsLink[] = [
  { id: 'sync', title: 'Sync', about: 'What is waiting to be sent to your account, and whether it is reachable.' },
  { id: 'reader', title: 'How GoLearn reads pages', about: 'Where the extension works, and what it asks permission for.' },
  { id: 'diagnostics', title: 'Diagnostics and updates', about: 'Versions, installed packs and a report to copy when you ask for help.' },
];

const linkList = (id: string, links: readonly SettingsLink[]): HTMLElement =>
  h('ul', { class: 'settings-links', id }, ...links.map((l) =>
    h('li', { 'data-route': l.id }, h('a', { href: `#/${l.id}` }, h('span', { class: 'nav-title' }, l.title), h('span', { class: 'nav-about' }, l.about)))));

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const account = h('section', { class: 'part', id: 'settings-account', 'aria-labelledby': 'settings-account-h' }, h('h2', { id: 'settings-account-h' }, 'Account'));
  const reading = h('section', { class: 'part', id: 'settings-reading', 'aria-labelledby': 'settings-reading-h' },
    h('h2', { id: 'settings-reading-h' }, 'Reading'), linkList('reading-links', READING_LINKS));
  const advanced = h('section', { class: 'part', id: 'settings-advanced', 'aria-labelledby': 'settings-advanced-h' },
    h('h2', { id: 'settings-advanced-h' }, 'Advanced'), linkList('advanced-links', ADVANCED_LINKS));
  const foot = h('p', { class: 'foot-links', id: 'settings-foot' },
    h('a', { href: '#/help', id: 'settings-help' }, 'Help'), ' · ', h('a', { href: '#/terms', id: 'settings-terms' }, 'Terms of use'), ' · ', h('a', { href: '#/privacy', id: 'settings-policy' }, 'Privacy Policy'));
  el.append(account, reading, advanced, foot);
  await renderAccountSection(account, ctx, view, {
    async signedIn() { /* the form is on the sign-in page */ },
    async signedOut() { /* nothing else on this page depends on it */ },
  }, { form: false, intro: false });
  await renderAccountDetails(account, ctx, view);
  if (!view.alive()) return;
  // signed in, the account has more to it (sessions, a copy of your data, deletion, security events): each waits closed under its own name,
  // so the page stays a page of settings; the email's confirmation, which may need the learner, stays in sight
  for (const id of ['acct-sessions', 'acct-export', 'acct-delete', 'acct-events']) {
    const section = account.querySelector<HTMLElement>(`#${id}`);
    const heading = section?.querySelector(':scope > h3');
    if (!section || !heading) continue;
    const fold = h('details', { class: 'fold', id: `${id}-fold` }, h('summary', {}, heading));
    section.replaceWith(fold);
    fold.append(section);
  }
  // one line of legal links at the foot of the page: the account's own (it says they are drafts) when signed in
  const legal = account.querySelector<HTMLElement>('#legal-links');
  if (legal) { legal.classList.add('foot-links'); foot.replaceWith(legal); }
}
