/**
 * #/help: what a learner asks first, in plain words. The answers describe what GoLearn does today; the contact line appears only when the build names a support
 * address, and the install link only when the store listing exists (`supportEmail`, `extensionInstallUrl` in config.json).
 */
import type { AppContext } from '../context';
import { h } from '../dom';
import type { View } from './view';

const QUESTIONS: ReadonlyArray<readonly [string, string]> = [
  ['How do I look up a word?', 'Open a page in a language you downloaded, select the word, and press the GoLearn button in the toolbar (or Alt+Shift+G). A card shows the dictionary form, a meaning and how it is built.'],
  ['A word has no card, or the wrong one', 'The dictionaries are built from open sources by machine and no native speaker has reviewed them yet, so they can be wrong. Use This analysis is wrong on the card: a reviewer sees your report. It does not change the word for other learners.'],
  ['How do I practise what I looked up?', 'Open GoReview from the setup page. It brings back the words you met, at the moment you are about to forget them.'],
  ['Do I need an account?', 'No. Without one, everything stays on this device. With one, your record follows you between devices.'],
  ['What does GoLearn keep about the pages I read?', 'The words you looked up, and a hash of the sentence and of the page’s address. Never the text, the title or the address itself. On a Bible site it keeps the reference you were reading. The Privacy Policy has the whole list.'],
  ['How do I hear a word?', 'Open Audio on the setup page. Voices installed on your device work with no setup.'],
  ['How do I get my data, or delete it?', 'Settings has Download my data, and Delete my account. Deleting waits 14 days, in case you change your mind, and then everything held about you is erased.'],
];

export function render(el: HTMLElement, ctx: AppContext, _view: View): void {
  const { supportEmail, extensionInstallUrl } = ctx.deps.config ?? {};
  el.append(
    h('section', { class: 'part', id: 'help', 'aria-label': 'Help' },
      ctx.inExtension ? null : extensionInstallUrl
        ? h('p', { id: 'help-install' }, 'GoLearn reads pages through a browser extension for desktop Chrome. ', h('a', { href: extensionInstallUrl, id: 'link-install' }, 'Install GoLearn'), '.')
        : h('p', { id: 'help-install-none', class: 'muted' }, 'GoLearn reads pages through a browser extension for desktop Chrome. It is not on the Chrome Web Store yet.'),
      ...QUESTIONS.flatMap(([q, a]) => [h('h2', {}, q), h('p', {}, a)]),
      h('h2', {}, 'Still stuck?'),
      supportEmail
        ? h('p', { id: 'help-contact' }, 'Write to ', h('a', { href: `mailto:${supportEmail}` }, supportEmail), '.')
        : h('p', { id: 'help-contact-none', class: 'muted' }, 'There is no support address yet.')),
    h('p', { class: 'muted' }, h('a', { href: '#/privacy', id: 'help-privacy' }, 'Privacy'), ' · ', h('a', { href: '#/terms', id: 'help-terms' }, 'Terms')));
}
