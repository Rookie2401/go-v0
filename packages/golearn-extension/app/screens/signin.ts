/**
 * Sign in: the first page on a first run (no language chosen, nobody signed in) and always reachable from the cog under Settings.
 * The brand, one sentence, the account form (sign in or create, email, password; the service address under a closed detail) and a
 * plain “Continue without an account”. An account is optional: it only keeps progress across devices. After sign-in, account
 * creation or “Continue without an account” the application moves to the languages page.
 */
import type { AppContext } from '../context';
import { button, h, p } from '../dom';
import { setFlash } from '../flash';
import { renderAccountSection } from './account';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const box = h('section', { class: 'signin', id: 'signin', 'aria-label': 'Sign in to GoLearn' });
  const account = h('div', { class: 'part', id: 'sign-in' });
  box.append(
    h('p', { class: 'hero-brand', 'aria-hidden': 'true' }, 'GoLearn'),
    p('GoLearn sits beside what you already read: select a word on a web page and it shows you the word’s dictionary form, what it means here, how it is built and how it is said.', 'lede'),
    account,
  );
  el.append(box);
  await renderAccountSection(account, ctx, view, {
    async signedIn(message) { setFlash(ctx, message); ctx.go('languages'); },
    async signedOut() { /* stays on this page: the form is ready for the next sign-in */ },
  }, { intro: false, quiet: true });
  box.append(
    h('div', { class: 'row skip-row' },
      button('Continue without an account', () => { ctx.go('languages'); }, { class: 'btn', id: 'continue-without-account' })),
    p('An account is optional: it only keeps your progress across devices. Everything works the same without one.', 'muted'));
}
