/** 1. Welcome: what GoLearn is, in two sentences. No course. */
import type { AppContext } from '../context';
import { h, p } from '../dom';
import type { View } from './view';

export function render(el: HTMLElement, _ctx: AppContext, _view: View): void {
  el.append(
    p('GoLearn sits beside what you already read: select a word on a web page and it shows you the word’s dictionary form, what it means here, how it is built and how it is said, and it keeps a private record of what you met.'),
    p('It is not a course and it holds no library of its own; this short setup connects your account, picks your team’s language, installs that language’s pack and shows you how the card works.'),
    h('p', {}, h('a', { class: 'btn primary', href: '#/account' }, 'Begin with your account →')),
    p('Everything here can be skipped or repeated later, and nothing is sent anywhere until you sign in.', 'muted'),
  );
}
