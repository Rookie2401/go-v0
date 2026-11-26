/**
 * Languages: the home of the application, where every first run ends up (redesigned 2026-11-11, docs/golearn/DESIGN-SYSTEM.md).
 * The top of the page is the title and ONE thing under it (the owner, 2026-11-26: "Keep review, the header, and my account. Cut the
 * rest"): the way to GoReview, a gold pill that says "Go to GoReview" (in the extension, once there is a language to have words in).
 * The account is not on the page any more: it is the person at the top right of the bar (app.ts), as in GoReview. What was cut: the
 * small line above the title, "<language> is ready" with how to start reading (the tile of the language being read in says "Reading
 * now"; the page linked at the foot, "How GoLearn reads pages", says how to start), the sentence about the account, and "My words" (GoReview's own list, reached inside GoReview).
 * Then the languages themselves: YOUR LANGUAGES and MORE LANGUAGES, each language a tile that lists its tracks, as in GoReview
 * (screens/language.ts). The guide to hearing the words is its own page under Settings (Audio). The foot holds two quiet links: Help,
 * and “How GoLearn reads pages”.
 */
import { barIcon } from '../barIcons';
import type { AppContext } from '../context';
import { append, h } from '../dom';
import { takeCheckEmail, takeFlash } from '../flash';
import { checkEmailNotice } from './accountSecurity';
import { renderLanguageSection } from './language';
import type { View } from './view';

/** Where GoReview lives, relative to this page, when this page is the extension's own (the build writes it to dist/review/). */
export const REVIEW_HREF = '../review/index.html';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const flash = takeFlash(ctx);
  const checkEmail = takeCheckEmail(ctx);
  // one line for a screen reader only: that the language being read in is ready (screens/language.ts fills it)
  const next = h('div', { id: 'next-steps' });
  const list = h('div', { id: 'language-list' });
  // GoReview is its own app: one way to it, once there is a language to have words in (the extension only: the hosted page has no words of its own)
  const review = ctx.inExtension
    ? h('p', { class: 'home-actions', id: 'to-review', hidden: true },
      h('a', { class: 'btn primary to-goreview', id: 'open-review', href: REVIEW_HREF }, h('span', {}, 'Go to GoReview'), barIcon(ctx.deps.doc, 'arrow')))
    : null;
  const status = h('section', { class: 'home-status', id: 'languages', 'aria-label': 'GoReview' }, next, review);
  append(el, [
    flash ? h('p', { class: 'notice', id: 'flash', role: 'status' }, flash) : null,
    checkEmail ? checkEmailNotice(ctx, checkEmail.email, checkEmail.sent) : null,
    status,
    list,
    h('p', { class: 'foot-links', id: 'to-help' },
      h('a', { href: '#/help', id: 'link-help' }, 'Help'), ' · ',
      h('a', { href: '#/reader', id: 'reader-link', 'aria-label': 'How GoLearn reads pages (the reader, under Settings)' }, 'How GoLearn reads pages')),
  ]);
  const languages = await renderLanguageSection(list, ctx, view, { next, onCount: (n) => { if (review) review.hidden = n === 0; } });
  // a new device signed in to an account that already has a language: its pack downloads by itself
  void languages.ensureActive(!!flash).catch(() => undefined);
}
