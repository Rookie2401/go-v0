/**
 * Settings (the cog at the top right of every page): the account (who is signed in, or that this device is on its own; sign out; a
 * link to the sign-in page) and the advanced screens: Sync, Privacy, Diagnostics and updates, How GoLearn reads pages.
 */
import type { AppContext } from '../context';
import { h, p } from '../dom';
import { renderAccountSection } from './account';
import { renderAccountDetails } from './accountSecurity';
import type { View } from './view';

/** The advanced screens, in the order Settings lists them, each with the one line that says what it is for. */
export const ADVANCED_LINKS: ReadonlyArray<{ id: string; title: string; about: string }> = [
  { id: 'sync', title: 'Sync', about: 'What is waiting to be sent to your account, and whether it is reachable.' },
  { id: 'privacy', title: 'Privacy', about: 'What GoLearn keeps, what leaves this device, and the switches for it.' },
  { id: 'diagnostics', title: 'Diagnostics and updates', about: 'Checks, the installed packs, the dictionary address, and how to update.' },
  { id: 'reader', title: 'How GoLearn reads pages', about: 'How the extension reads a page, and how to switch it on.' },
];

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const account = h('section', { class: 'part', id: 'settings-account', 'aria-labelledby': 'settings-account-h' }, h('h2', { id: 'settings-account-h' }, 'Account'));
  const advanced = h('section', { class: 'part', id: 'settings-advanced', 'aria-labelledby': 'settings-advanced-h' },
    h('h2', { id: 'settings-advanced-h' }, 'Advanced'),
    h('ul', { class: 'settings-links', id: 'advanced-links' }, ...ADVANCED_LINKS.map((l) =>
      h('li', { 'data-route': l.id }, h('a', { href: `#/${l.id}` }, l.title), h('span', { class: 'muted' }, ` — ${l.about}`)))));
  el.append(p('Your account and the advanced screens. Nothing here is needed to download a language and read.', 'muted'), account, advanced);
  await renderAccountSection(account, ctx, view, {
    async signedIn() { /* the form is on the sign-in page */ },
    async signedOut() { /* nothing else on this page depends on it */ },
  }, { form: false, intro: false });
  await renderAccountDetails(account, ctx, view);
}
