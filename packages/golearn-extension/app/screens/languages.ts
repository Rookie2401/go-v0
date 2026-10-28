/**
 * Choose your languages: the main page, where every first run ends up. Two disclosures (the owner, 2026-10-28): LANGUAGE, with the nine
 * languages as compact rows, each with a “Download language” menu (a downloaded language says so and stays enabled, so several can be on at
 * once), and AUDIO, the guide to hearing the words (the voices on this device, Azure through a speech backend of your own, and where
 * ElevenLabs stands). Language opens by itself while no language is downloaded yet; otherwise both wait closed. Nothing else is asked
 * here: the account (optional) is on the sign-in page and under Settings.
 * A small link at the bottom leads to “How GoLearn reads pages” (the reader integration, an advanced screen).
 */
import { computeCompletion } from '../completion';
import type { AppContext } from '../context';
import { append, h, p } from '../dom';
import { takeCheckEmail, takeFlash } from '../flash';
import { checkEmailNotice } from './accountSecurity';
import { audioGuide } from './audio';
import { renderLanguageSection } from './language';
import type { View } from './view';

/** A section of the page as a disclosure whose summary is the heading. */
function disclosure(id: string, title: string, open: boolean, ...body: Array<HTMLElement | null>): HTMLDetailsElement {
  const d = h('details', { class: 'part disclosure', id }, h('summary', {}, h('h2', { id: `${id}-h` }, title)), h('div', { class: 'body' }, ...body)) as HTMLDetailsElement;
  d.open = open;
  return d;
}

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const flash = takeFlash(ctx);
  const checkEmail = takeCheckEmail(ctx);
  const [session, completion] = await Promise.all([ctx.state.getSession(), computeCompletion(ctx)]);
  if (!view.alive()) return;
  const list = h('div', { id: 'language-list' });
  const language = disclosure('languages', 'Language', !completion.language,
    p('Download the languages you want to read. Downloading sets everything up: GoLearn saves the choice on this device and installs the language’s pack, checking it as it goes. You can download several and they all stay on; the one marked Reading now is the one GoLearn records against.'),
    h('p', { class: 'account-line muted', id: 'account-line', 'data-state': session ? 'synced' : 'device' },
      session ? `Synced to your account as ${session.email}. ` : 'On this device only. ',
      h('a', { href: session ? '#/settings' : '#/signin' }, session ? 'Account settings' : 'Sign in to keep your progress across devices (optional)')),
    list);
  const audio = disclosure('audio', 'Audio', false, ...audioGuide(ctx));
  append(el, [
    flash ? h('p', { class: 'notice', id: 'flash', role: 'status' }, flash) : null,
    checkEmail ? checkEmailNotice(ctx, checkEmail.email, checkEmail.sent) : null,
    language,
    audio,
    h('p', { class: 'footer-link' }, h('a', { href: '#/reader', id: 'reader-link', 'aria-label': 'How GoLearn reads pages (the reader, under Settings)' }, 'How GoLearn reads pages')),
  ]);
  const languages = await renderLanguageSection(list, ctx, view);
  // a new device signed in to an account that already has a language: its pack downloads by itself
  void languages.ensureActive(!!flash).catch(() => undefined);
}
