/** The learner's language tracks and installable language catalogue. */
import type { AppContext } from '../context';
import { h } from '../dom';
import { languageSettings } from './account';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const page = h('section', { class: 'home account-page languages-page', 'aria-label': 'Languages' });
  el.append(page);
  const list = await languageSettings(ctx, view);
  if (list && view.alive()) page.append(list);
}
