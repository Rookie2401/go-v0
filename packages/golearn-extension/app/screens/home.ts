/** The compact status home shown once setup is complete: one line per part, each linking to its screen. */
import { computeCompletion, setupComplete } from '../completion';
import type { AppContext } from '../context';
import { append, h, p } from '../dom';
import type { View } from './view';
import { SURFACES } from '../surfaces';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const [session, progress, completion] = await Promise.all([ctx.state.getSession(), ctx.state.getProgress(), computeCompletion(ctx)]);
  if (!view.alive()) return;
  const pack = session?.languageId ? ctx.deps.packs.packFor(session.languageId) : undefined;
  const rec = pack ? progress.packs[pack.packId] : undefined;
  const profile = await ctx.state.getProfile();
  const enrolment = profile?.enrolments.find((e) => e.enrolmentId === session?.enrolmentId);
  const team = enrolment?.teamId ? ctx.deps.packs.teams().find((t) => t.teamId === enrolment.teamId)?.name ?? enrolment.teamId : undefined;
  const extVersion = ctx.deps.chrome?.runtime.getManifest?.().version;

  const row = (label: string, value: string, route: string, ok: boolean): HTMLElement =>
    h('li', { 'data-route': route, 'data-ok': String(ok) },
      h('span', { class: ok ? 'mark done' : 'mark todo', 'aria-hidden': 'true' }, ok ? '✓' : '○'),
      h('strong', {}, label), ' ', h('span', {}, value), ' ', h('a', { href: `#/${route}`, 'aria-label': `Change: ${label}` }, 'Change'));

  append(el, [
    setupComplete(completion) ? p('GoLearn is set up. Open the page you want to read, press the GoLearn button in the toolbar and select a word.') : p('Setup is not finished. The items marked ○ still need you.'),
    h('ul', { class: 'status-list', id: 'status-list' },
      row('Account', session ? `signed in as ${session.email}` : 'not signed in', 'account', completion.account),
      row('Team and language', session?.enrolmentId ? `${team ? team + ' → ' : ''}${pack?.name ?? session.languageId}` : 'no enrolment', 'team', completion.team),
      row('Language pack', pack ? (rec ? `${pack.name} ${rec.version}, ${rec.ok ? 'verified' : 'did not verify'}` : `${pack.name} ${pack.version} not installed`) : 'none chosen', 'pack', completion.pack),
      row('Reader', ctx.inExtension ? `extension installed, version ${extVersion ?? 'unknown'}` : 'extension not detected (a web page cannot check)', 'reader', completion.reader),
      row('Orientation', progress.tutorial === 'done' ? 'finished' : progress.tutorial === 'skipped' ? 'skipped' : 'not done', 'tutorial', completion.tutorial)),
    p(`Works on: ${SURFACES.filter((s) => s.status !== 'not-supported').map((s) => s.name).join('; ')}.`, 'muted'),
    h('p', {}, h('a', { class: 'btn', href: '#/tutorial' }, 'Repeat orientation'), ' ', h('a', { class: 'btn', href: '#/sync' }, 'Sync'), ' ', h('a', { class: 'btn', href: '#/privacy' }, 'Privacy'), ' ', h('a', { class: 'btn', href: '#/diagnostics' }, 'Diagnostics'), ' ', h('a', { class: 'btn', href: '#/share' }, 'Look up shared text')),
  ]);
}
