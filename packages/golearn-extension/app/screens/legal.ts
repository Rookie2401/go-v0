/**
 * The two legal drafts as pages: the Privacy Policy is a section at the foot of #/privacy (`policySection`), and #/terms shows the
 * Terms of Use. Both texts are the drafts in docs/legal, marked “not in force” in their own first lines.
 */
import type { AppContext } from '../context';
import { h } from '../dom';
import { PRIVACY_POLICY_MD, TERMS_MD_TEXT, renderMarkdown } from '../legal';
import type { View } from './view';

/** The Privacy Policy draft as a section for the Privacy screen. */
export function policySection(): HTMLElement {
  return h('section', { class: 'card legal', id: 'privacy-policy', 'aria-label': 'Privacy Policy (draft)' }, renderMarkdown(PRIVACY_POLICY_MD, 2));
}

export function render(el: HTMLElement, _ctx: AppContext, _view: View): void {
  el.append(
    h('section', { class: 'card legal', id: 'terms-text', 'aria-label': 'Terms of Use (draft)' }, renderMarkdown(TERMS_MD_TEXT, 2)),
    h('p', { class: 'muted' }, h('a', { href: '#/privacy', id: 'terms-privacy-link' }, 'Read the Privacy Policy'), ' · ', h('a', { href: '#/settings', id: 'terms-settings-link' }, 'Back to Settings')));
}
