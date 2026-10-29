/** The compact status home shown once setup is complete: one line per part, each linking to its screen. */
import { computeCompletion, setupComplete } from '../completion';
import type { AppContext } from '../context';
import { append, h, p } from '../dom';
import type { View } from './view';
import { SURFACES } from '../surfaces';
import { languageLabel } from './language';

/** Where GoReview lives, relative to this page, when this page is the extension's own (the build writes it to dist/review/). */
export const PRACTICE_HREF = '../review/index.html';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const [session, progress, completion, active] = await Promise.all([ctx.state.getSession(), ctx.state.getProgress(), computeCompletion(ctx), ctx.activeLanguage()]);
  if (!view.alive()) return;
  const pack = active?.languageId ? ctx.deps.packs.packFor(active.languageId) : undefined;
  const rec = pack ? progress.packs[pack.packId] : undefined;

  const row = (label: string, value: string, route: string, ok: boolean): HTMLElement =>
    h('li', { 'data-route': route, 'data-ok': String(ok) },
      h('span', { class: ok ? 'mark done' : 'mark todo', 'aria-hidden': 'true' }, ok ? '✓' : '○'),
      h('strong', {}, label), ' ', h('span', {}, value), ' ', h('a', { href: `#/${route}`, 'aria-label': `Change: ${label}` }, 'Change'));

  append(el, [
    setupComplete(completion) ? p('GoLearn is set up. Open the page you want to read, press the GoLearn button in the toolbar and select a word.') : p('Setup is not finished. Download a language on the Languages page: its pack installs by itself.'),
    h('p', { id: 'progress-mode', 'data-state': session ? 'synced' : 'device' },
      h('strong', {}, session ? 'Synced to your account' : 'On this device only'),
      session ? ` as ${session.email}.` : '. ',
      session ? null : h('a', { href: '#/signin', id: 'keep-progress' }, 'Sign in to keep your progress across devices (optional)')),
    h('ul', { class: 'status-list', id: 'status-list' },
      row('Language', active ? languageLabel(ctx, active.languageId, active.varietyId) : 'none downloaded yet', 'languages', completion.language),
      row('Language pack', pack ? (rec ? `${pack.name} ${rec.version}, ${rec.ok ? 'verified' : 'did not verify'}` : `${pack.name} ${pack.version} not installed`) : 'none downloaded', 'languages', completion.pack),
      ),
    h('p', {}, ctx.inExtension
      ? h('span', {}, h('a', { class: 'btn primary', id: 'practise', href: PRACTICE_HREF }, 'Practise'), ' ', h('a', { class: 'btn', id: 'my-vocabulary', href: `${PRACTICE_HREF}#/vocabulary` }, 'My words'))
      : h('span', { class: 'muted', id: 'practise-note' }, 'GoReview runs in the extension, on this device.'),
    ctx.inExtension ? ' ' : null, ctx.inExtension ? h('span', { class: 'muted' }, 'Review what you met and write in the language, without an account.') : null),
    p(`Works on: ${SURFACES.filter((s) => s.status !== 'not-supported').map((s) => s.name).join('; ')}.`, 'muted'),
    h('p', {}, h('a', { class: 'btn', href: '#/languages' }, 'Languages'), ' ', h('a', { class: 'btn', href: '#/sync' }, 'Sync settings'), ' ', h('a', { class: 'btn', href: '#/privacy' }, 'Privacy settings'), ' ', h('a', { class: 'btn', href: '#/diagnostics' }, 'Diagnostics'), ' ', h('a', { class: 'btn', href: '#/share' }, 'Look up shared text')),
  ]);
}
