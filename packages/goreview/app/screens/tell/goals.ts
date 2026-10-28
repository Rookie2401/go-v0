/** Writing goals: the learner's own sentences, kept as `PreferenceChanged { key: 'gotell:goal' }` events through the shell's queue. */
import { cleanGoalText, foldGoals, goalEvent, MAX_GOAL_CHARS } from '../../../../gotell/src/workspace/goals';
import { append, button, clear, h, p, setStatus, statusLine } from '../../dom';
import { tellNav, type TellEnv } from './common';

/** The goals section (used on the home page and on #/tell/goals). */
export async function goalsSection(env: TellEnv): Promise<HTMLElement> {
  const { host, view } = env;
  const box = h('section', { class: 'card', id: 'tell-goals', 'aria-labelledby': 'tell-goals-h' });
  const list = h('ul', { class: 'tell-goals', id: 'tell-goal-list' });
  const status = statusLine();
  const input = h('input', { type: 'text', id: 'tell-goal-text', name: 'goal', maxlength: MAX_GOAL_CHARS, autocomplete: 'off', 'aria-label': 'A writing goal, in your own words' }) as HTMLInputElement;

  async function paint(): Promise<void> {
    let goals = foldGoals([]);
    try { goals = foldGoals(await host.events()); } catch { setStatus(status, 'Your goals could not be read from this device.', 'error'); }
    if (!view.alive()) return;
    clear(list);
    if (!goals.length) list.append(h('li', { class: 'muted', id: 'tell-no-goals' }, 'No goals yet. A goal is something you want to be able to write, in your own words.'));
    for (const g of goals) {
      list.append(h('li', { 'data-goal': g.goalId, 'data-done': g.done ? 'true' : 'false' },
        h('span', { class: 'goal-text' }, g.text),
        g.done ? h('span', { class: 'tell-badge' }, 'done') : button('Mark done', () => { void markDone(g.goalId); }, { class: 'btn small', 'data-done-goal': g.goalId })));
    }
  }

  async function record(goal: { goalId: string; text: string; createdAt: string; done?: boolean }): Promise<boolean> {
    const ev = goalEvent({ identity: host.identity, appVersion: host.appVersion, at: host.now().toISOString(), eventId: `ev-${host.newId()}`, goal });
    const r = await host.submit([ev]);
    if (r.refused.length) { setStatus(status, `The goal was refused: ${r.refused[0].issues.join('; ')}`, 'error'); return false; }
    return true;
  }

  async function add(): Promise<void> {
    const text = cleanGoalText(input.value);
    if (!text) { setStatus(status, `Write a goal of up to ${MAX_GOAL_CHARS} characters.`, 'error'); return; }
    const goal = { goalId: `goal-${host.newId()}`, text, createdAt: host.now().toISOString() };
    if (!(await record(goal))) return;
    input.value = '';
    setStatus(status, 'Goal added. It is kept with your preferences and goes to your account when you are online.', 'ok');
    await paint();
  }

  async function markDone(goalId: string): Promise<void> {
    const goals = foldGoals(await host.events());
    const g = goals.find((x) => x.goalId === goalId);
    if (!g || g.done) return;
    if (!(await record({ ...g, done: true }))) return;
    setStatus(status, 'Marked done.', 'ok');
    await paint();
  }

  const form = h('form', { class: 'row', id: 'tell-goal-form', onsubmit: (e: Event) => { e.preventDefault(); void add(); } },
    h('label', { class: 'sr', for: 'tell-goal-text' }, 'A writing goal'),
    input,
    h('button', { id: 'tell-goal-add', class: 'btn', type: 'submit' }, 'Add goal'));
  append(box, [
    h('h2', { id: 'tell-goals-h' }, 'Your writing goals'),
    p('Your own words: what you want to be able to write. Goals shape the suggestions and guidance; they are never scored.', 'muted'),
    list, form, status,
  ]);
  await paint();
  return box;
}

export async function render(env: TellEnv): Promise<void> {
  env.el.append(tellNav('goals'), await goalsSection(env));
}
