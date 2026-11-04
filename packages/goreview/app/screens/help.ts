/**
 * #/help: what a learner asks first, in plain words, and where to go next. Open without an account. The answers describe what the app does today; the contact
 * line appears only when the build names a support address (`supportEmail` in config.json).
 */
import type { AppContext } from '../context';
import { h } from '../dom';
import type { View } from './view';

const QUESTIONS: ReadonlyArray<readonly [string, string]> = [
  ['Where do my words come from?', 'From what you read. Look up a word with GoLearn on a web page or in Biblia, and it can come to GoReview once you have met it. You can also choose words yourself under My Vocabulary.'],
  ['Why are there no new words today?', 'GoReview only asks about words you have met and that it has checked facts for, and it keeps to the number of new words you set. The home page says which of these is holding things back. You can change the numbers in Settings.'],
  ['How does GoReview decide when a word comes back?', 'Each answer moves the word’s next review: sooner when it was hard, later when it was easy. Words you have not reached stay due until you answer them.'],
  ['What if a question is wrong?', 'Open Report an analysis error on the card. Your report goes to a reviewer, the answer does not count, and the card waits until the word is corrected. Other learners are not affected by a report.'],
  ['Why does it say a language is experimental or unreviewed?', 'The dictionaries are built from open sources by machine. No native speaker has reviewed them yet, so they can be wrong. GoReview says so rather than hide it.'],
  ['Do I need an account?', 'Inside the GoLearn extension, no: everything stays on your device. On a phone or on this website, yes, because your reviews are kept on your account so that they follow you between devices.'],
  ['What happens when I am offline?', 'Your answers are saved on this device and sent when you are back online. Due reviews keep working; finding new words needs a connection.'],
  ['How do I get my data, or delete it?', 'Settings has Download my data, and Delete my account. Deleting waits 14 days, in case you change your mind, and then everything held about you is erased.'],
];

export function render(el: HTMLElement, ctx: AppContext, _view: View): void {
  const email = ctx.deps.links?.support;
  el.append(
    h('section', { class: 'card', id: 'help', 'aria-label': 'Help' },
      ...QUESTIONS.flatMap(([q, a]) => [h('h2', {}, q), h('p', {}, a)]),
      h('h2', {}, 'Still stuck?'),
      email
        ? h('p', { id: 'help-contact' }, 'Write to ', h('a', { href: `mailto:${email}` }, email), '.')
        : h('p', { id: 'help-contact-none', class: 'muted' }, 'There is no support address yet.')),
    h('p', { class: 'muted' }, h('a', { href: '#/privacy', id: 'help-privacy' }, 'Privacy Policy'), ' · ', h('a', { href: '#/terms', id: 'help-terms' }, 'Terms')));
}
