/**
 * #/tell — the GoTell writing workspace. It needs no review history: it starts from the Repository API and the learner's
 * local area, nothing else. Sub-routes:
 *
 *   #/tell                       home: mode, drafts, goals, connection
 *   #/tell/prompts[/<mode>]      the prompt picker
 *   #/tell/write/<draftId>       the writer
 *   #/tell/goals                 writing goals
 *   #/tell/privacy               what is kept, export, remote-assistance switch, device cleanup
 */
import type { AppContext } from '../context';
import { append, h, p } from '../dom';
import { createTellEngine } from '../tellEngine';
import type { View } from './view';
import type { TellEnv } from './tell/common';
import * as goalsScreen from './tell/goals';
import * as homeScreen from './tell/home';
import { makeHost } from './tell/host';
import { tellOverrides } from './tell/overrides';
import * as privacyScreen from './tell/privacy';
import * as promptsScreen from './tell/prompts';
import { ensureStyles } from './tell/styles';
import * as writeScreen from './tell/write';

export async function render(el: HTMLElement, ctx: AppContext, view: View, params: string[] = []): Promise<void> {
  const id = await ctx.identity();
  if (!id) {
    append(el, [p('Choose a language first: GoTell writes in one language at a time.'), h('div', { class: 'notice', id: 'tell-no-language' }, 'You have no language yet. Set one up in GoLearn; it appears here after the next sync.')]);
    return;
  }
  ensureStyles(ctx.deps.doc);
  const host = await makeHost(ctx, id);
  let engine;
  try { engine = await (tellOverrides.engine ?? createTellEngine)(ctx, id); } catch (e) {
    append(el, [h('p', { class: 'error', id: 'tell-engine-error' }, `The writing workspace could not start: ${e instanceof Error ? e.message : String(e)}`)]);
    return;
  }
  if (!view.alive()) return;
  const env: TellEnv = { el, ctx, view, id, host, engine, tag: id.varietyId ?? id.languageId };

  const [sub, ...rest] = params;
  switch (sub) {
    case 'write': await writeScreen.render(env, rest); return;
    case 'prompts': await promptsScreen.render(env, rest); return;
    case 'goals': await goalsScreen.render(env); return;
    case 'privacy': await privacyScreen.render(env); return;
    default: await homeScreen.render(env);
  }
}
