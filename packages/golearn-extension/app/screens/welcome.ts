/**
 * Welcome: the whole of setup, on one page. Two sections.
 *   1. Choose your language: choosing one saves the choice and installs (and verifies) its pack, inline on the language’s card.
 *   2. Sign in (optional): keeps progress across devices; the status line says whether this device is on its own or synced.
 * Nothing else is asked. After sign-in whatever still needs doing for the chosen language happens by itself.
 * A small link at the bottom leads to “How GoLearn reads pages” (the reader integration, an advanced screen).
 */
import type { AppContext } from '../context';
import { h, p } from '../dom';
import { renderAccountSection } from './account';
import { renderLanguageSection } from './language';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const languageBox = h('section', { class: 'part', id: 'choose-language', 'aria-labelledby': 'choose-h' }, h('h2', { id: 'choose-h' }, 'Choose your language'));
  const signInBox = h('section', { class: 'part', id: 'sign-in', 'aria-labelledby': 'sign-h' }, h('h2', { id: 'sign-h' }, 'Sign in (optional)'));
  el.append(
    p('GoLearn sits beside what you already read: select a word on a web page and it shows you the word’s dictionary form, what it means here, how it is built and how it is said, and it keeps a private record of what you met.'),
    languageBox, signInBox,
    h('p', { class: 'footer-link' }, h('a', { href: '#/reader', id: 'reader-link', 'aria-label': 'How GoLearn reads pages (the reader, under Advanced)' }, 'How GoLearn reads pages')),
  );
  const languages = await renderLanguageSection(languageBox, ctx, view);
  await renderAccountSection(signInBox, ctx, view, {
    // everything that needs doing after sign-in happens here, with no further step for the learner
    async signedIn() { await languages.refresh(); await languages.ensureActive(); },
    async signedOut() { await languages.refresh(); },
  });
}
