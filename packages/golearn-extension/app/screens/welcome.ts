/** 1. Welcome: what GoLearn is, in two sentences. No course, no account, no team. */
import type { AppContext } from '../context';
import { h, p } from '../dom';
import type { View } from './view';

export function render(el: HTMLElement, _ctx: AppContext, _view: View): void {
  el.append(
    p('GoLearn sits beside what you already read: select a word on a web page and it shows you the word’s dictionary form, what it means here, how it is built and how it is said, and it keeps a private record of what you met.'),
    p('It is not a course and it holds no library of its own. This short setup lets you choose your language, installs that language’s pack, shows you how the card works and checks the reader. An account is optional and comes last; it only keeps your progress across devices.'),
    h('p', {}, h('a', { class: 'btn primary', href: '#/language' }, 'Start: pick a language →')),
    p('Everything here can be skipped or repeated later. Nothing is sent anywhere unless you sign in.', 'muted'),
  );
}
