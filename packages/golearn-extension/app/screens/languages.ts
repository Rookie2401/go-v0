/**
 * Choose your languages: the main page, where every first run ends up. The six languages are compact rows, each with a
 * “Download language” menu; a downloaded language says so and stays enabled, so several can be on at once. Nothing else is asked
 * here: the account (optional) is on the sign-in page and under Settings.
 * A small link at the bottom leads to “How GoLearn reads pages” (the reader integration, an advanced screen).
 */
import type { AppContext } from '../context';
import { append, h, p } from '../dom';
import { takeFlash } from '../flash';
import { renderLanguageSection } from './language';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const flash = takeFlash(ctx);
  const session = await ctx.state.getSession();
  if (!view.alive()) return;
  const list = h('section', { class: 'part', id: 'languages', 'aria-labelledby': 'languages-h' }, h('h2', { id: 'languages-h' }, 'Languages'));
  append(el, [
    flash ? h('p', { class: 'notice', id: 'flash', role: 'status' }, flash) : null,
    p('Download the languages you want to read. Downloading sets everything up: GoLearn saves the choice on this device and installs the language’s pack, checking it as it goes. You can download several and they all stay on; the one marked Reading now is the one GoLearn records against.'),
    h('p', { class: 'account-line muted', id: 'account-line', 'data-state': session ? 'synced' : 'device' },
      session ? `Synced to your account as ${session.email}. ` : 'On this device only. ',
      h('a', { href: session ? '#/settings' : '#/signin' }, session ? 'Account settings' : 'Sign in to keep your progress across devices (optional)')),
    list,
    h('p', { class: 'footer-link' }, h('a', { href: '#/reader', id: 'reader-link', 'aria-label': 'How GoLearn reads pages (the reader, under Settings)' }, 'How GoLearn reads pages')),
  ]);
  const languages = await renderLanguageSection(list, ctx, view);
  // a new device signed in to an account that already has a language: its pack downloads by itself
  void languages.ensureActive(!!flash).catch(() => undefined);
}
