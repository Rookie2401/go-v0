/**
 * The session controls (ReviewPreferences), shared by the GoReview workspace and Settings. Saved on every change.
 * `track` is handed each save as it starts, so a caller that acts on the saved values (Start a session) can wait for them.
 * The two interface switches at the end (one-key shortcuts, the clock) are kept per device, not per learner (./uiprefs).
 */
import type { ReviewPreferences } from '../../goreview/src/types';
import type { AppContext } from '../context';
import { append, field, h, p, setStatus, statusLine } from '../dom';
import { getUiPrefs, patchUiPrefs } from './uiprefs';

export function prefsForm(ctx: AppContext, learnerId: string, initial: ReviewPreferences, onSaved?: (p: ReviewPreferences) => void, track?: (saving: Promise<unknown>) => void): HTMLElement {
  let current = initial;
  const status = statusLine();
  const num = (id: string, value: number, min: number, max: number, step: number): HTMLInputElement =>
    h('input', { type: 'number', id, name: id, min, max, step, value }) as HTMLInputElement;
  const minutes = num('pref-minutes', initial.sessionMinutes, 1, 120, 1);
  const maxNew = num('pref-max-new', initial.maxNew, 0, 50, 1);
  const retention = num('pref-retention', Math.round(initial.desiredRetention * 100), 70, 97, 1);
  const grammar = num('pref-grammar', Math.round(initial.grammarShare * 100), 0, 100, 5);
  const listening = h('input', { type: 'checkbox', id: 'pref-listening', name: 'pref-listening', ...(initial.includeListening ? { checked: true } : {}) }) as HTMLInputElement;
  const saved = h('input', { type: 'checkbox', id: 'pref-saved', name: 'pref-saved', ...(initial.prioritizeSaved ? { checked: true } : {}) }) as HTMLInputElement;
  listening.checked = initial.includeListening;
  saved.checked = initial.prioritizeSaved;

  async function save(): Promise<void> {
    const next = await ctx.state.setPrefs(learnerId, {
      languageId: current.languageId,
      sessionMinutes: Number(minutes.value), maxNew: Number(maxNew.value), desiredRetention: Number(retention.value) / 100,
      grammarShare: Number(grammar.value) / 100, includeListening: listening.checked, prioritizeSaved: saved.checked,
    });
    current = next;
    minutes.value = String(next.sessionMinutes); maxNew.value = String(next.maxNew);
    retention.value = String(Math.round(next.desiredRetention * 100)); grammar.value = String(Math.round(next.grammarShare * 100));
    setStatus(status, 'Saved on this device.', 'ok');
    onSaved?.(next);
  }
  for (const c of [minutes, maxNew, retention, grammar, listening, saved]) c.addEventListener('change', () => { const saving = save(); track?.(saving); void saving; });

  // interface switches of this device (WCAG 2.1.4 and 2.2.2): defaults are on; read when the form is built
  const shortcuts = h('input', { type: 'checkbox', id: 'pref-shortcuts', name: 'pref-shortcuts', checked: true }) as HTMLInputElement;
  const clock = h('input', { type: 'checkbox', id: 'pref-clock', name: 'pref-clock', checked: true }) as HTMLInputElement;
  void getUiPrefs(ctx).then((ui) => { shortcuts.checked = ui.shortcuts; clock.checked = ui.showClock; });
  shortcuts.addEventListener('change', () => { const saving = patchUiPrefs(ctx, { shortcuts: shortcuts.checked }).then(() => setStatus(status, 'Saved on this device.', 'ok')); track?.(saving); });
  clock.addEventListener('change', () => { const saving = patchUiPrefs(ctx, { showClock: clock.checked }).then(() => setStatus(status, 'Saved on this device.', 'ok')); track?.(saving); });

  const toggle = (box: HTMLInputElement, label: string, help: string): HTMLElement =>
    h('label', { class: 'toggle' }, box, h('span', {}, label, h('span', { class: 'help' }, ` ${help}`)));

  const form = h('div', { class: 'prefs', id: 'prefs-form' });
  append(form, [
    field('Session length (minutes)', minutes, 'The plan never exceeds this; what does not fit stays due.'),
    field('New items per session (at most)', maxNew),
    field('Desired retention (%)', retention, 'How likely you want to recall an item when it comes due. Higher means more reviews.'),
    field('Share of grammar items (%)', grammar, 'Approximate; due items are never dropped to reach it.'),
    toggle(listening, 'Include listening practice', 'Needs audio. Synthetic speech is practice only and is never recorded as listening evidence.'),
    toggle(saved, 'Prioritise items I saved', 'Items you marked as saved are proposed first.'),
    toggle(shortcuts, 'Keyboard shortcuts in a session', 'The keys 1 to 4 answer or grade and Space plays the audio. Turn them off if speech input or a switch device triggers them by accident; every action stays a button, and Enter and Esc still work.'),
    toggle(clock, 'Show the clock in a session', 'The elapsed time, counted up. Turn it off if a ticking number is distracting.'),
    p('Kept on this device.', 'muted'),
    status,
  ]);
  return form;
}
