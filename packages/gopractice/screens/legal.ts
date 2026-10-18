/**
 * #/privacy and #/terms — the Privacy Policy and the Terms of use, the drafts in docs/legal (each marked “not in force” in its own first
 * lines), rendered as plain text. Reachable without an account, from the sign-in page, from Settings and from each other.
 */
import type { AppContext } from '../context';
import { h } from '../dom';
import { PRIVACY_POLICY_MD, TERMS_MD_TEXT, renderMarkdown } from '../legal';
import type { View } from './view';

export function renderPrivacy(el: HTMLElement, _ctx: AppContext, _view: View): void {
  el.append(
    h('section', { class: 'card legal', id: 'privacy-policy', 'aria-label': 'Privacy Policy (draft)' }, renderMarkdown(PRIVACY_POLICY_MD, 2)),
    h('p', { class: 'muted' }, h('a', { href: '#/terms', id: 'link-terms' }, 'Read the Terms of use')));
}

export function renderTerms(el: HTMLElement, _ctx: AppContext, _view: View): void {
  el.append(
    h('section', { class: 'card legal', id: 'terms-text', 'aria-label': 'Terms of Use (draft)' }, renderMarkdown(TERMS_MD_TEXT, 2)),
    h('p', { class: 'muted' }, h('a', { href: '#/privacy', id: 'link-privacy-policy' }, 'Read the Privacy Policy')));
}
