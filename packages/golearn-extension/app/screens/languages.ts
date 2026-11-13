/**
 * Languages: the home of the application, where every first run ends up (redesigned 2026-11-11, docs/golearn/DESIGN-SYSTEM.md).
 * The top of the page says where the learner stands, once: the language they read in and what to do with it (or, on a first run, what
 * to do first), whether their progress is on this device only or synced to their account, and the way out to another app, GoReview
 * (“Review your words” and, beside it, the quiet “My words” for its vocabulary list; in the extension). Then the languages themselves: YOUR LANGUAGES and ADD A LANGUAGE (screens/language.ts).
 * Nothing waits behind a closed section: the page's purpose is on the page. The guide to hearing the words is its own page under
 * Settings (Audio). The foot holds two quiet links: Help, and “How GoLearn reads pages”.
 */
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
  const session = await ctx.state.getSession();
  if (!view.alive()) return;
  const next = h('div', { id: 'next-steps' });
  const list = h('div', { id: 'language-list' });
  // GoReview is its own app: one plain way to it, once there is a language to have words in (the extension only: the hosted page has no words of its own)
  const review = ctx.inExtension
    ? h('p', { class: 'home-actions', id: 'to-review', hidden: true },
      h('a', { class: 'btn', id: 'open-review', href: REVIEW_HREF }, 'Review your words'),
      h('a', { class: 'quiet-link', id: 'my-vocabulary', href: `${REVIEW_HREF}#/vocabulary` }, 'My words'))
    : null;
  const status = h('section', { class: 'home-status', id: 'languages', 'aria-label': 'Where you stand' },
    next,
    h('p', { class: 'account-line muted', id: 'account-line', 'data-state': session ? 'synced' : 'device' },
      session ? `Synced to your account as ${session.email}. ` : 'On this device only. ',
      h('a', { href: session ? '#/settings' : '#/signin' }, session ? 'Account settings' : 'Sign in to keep your progress across devices (optional)')),
    review);
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
