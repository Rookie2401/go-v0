/**
 * The session controls (ReviewPreferences), shared by the GoReview workspace and Settings. Saved on every change.
 * `track` is handed each save as it starts, so a caller that acts on the saved values (Start a session) can wait for them.
 * The interface switch at the end (one-key shortcuts) is kept per device, not per learner (./uiprefs).
 */
import type { ReviewPreferences } from '../../goreview/src/types';
import type { AppContext } from '../context';
import { append, field, h, p, setStatus, statusLine } from '../dom';
import { deckSizeControl } from './cardsper';
import { getUiPrefs, patchUiPrefs } from './uiprefs';

export function prefsForm(ctx: AppContext, learnerId: string, initial: ReviewPreferences, onSaved?: (p: ReviewPreferences) => void, track?: (saving: Promise<unknown>) => void, opts: { deckSize?: boolean } = {}): HTMLElement {
  let current = initial;
  const status = statusLine();
  const num = (id: string, value: number, min: number, max: number, step: number): HTMLInputElement =>
    h('input', { type: 'number', id, name: id, min, max, step, value }) as HTMLInputElement;
  const maxNew = num('pref-max-new', initial.maxNew, 0, 50, 1);
  const retention = num('pref-retention', Math.round(initial.desiredRetention * 100), 70, 97, 1);
  const grammar = num('pref-grammar', Math.round(initial.grammarShare * 100), 0, 100, 5);
  const listening = h('input', { type: 'checkbox', id: 'pref-listening', name: 'pref-listening', ...(initial.includeListening ? { checked: true } : {}) }) as HTMLInputElement;
  const saved = h('input', { type: 'checkbox', id: 'pref-saved', name: 'pref-saved', ...(initial.prioritizeSaved ? { checked: true } : {}) }) as HTMLInputElement;
  listening.checked = initial.includeListening;
  saved.checked = initial.prioritizeSaved;

  async function save(): Promise<void> {
    const next = await ctx.state.updatePrefs(learnerId, current.languageId, {
      maxNew: Number(maxNew.value), desiredRetention: Number(retention.value) / 100,
      grammarShare: Number(grammar.value) / 100, includeListening: listening.checked, prioritizeSaved: saved.checked,
    });
    current = next;
    maxNew.value = String(next.maxNew);
    retention.value = String(Math.round(next.desiredRetention * 100)); grammar.value = String(Math.round(next.grammarShare * 100));
    setStatus(status, 'Saved on this device.', 'ok');
    onSaved?.(next);
  }
  for (const c of [maxNew, retention, grammar, listening, saved]) c.addEventListener('change', () => { const saving = save(); track?.(saving); void saving; });

  // interface switches of this device (WCAG 2.1.4 and 2.2.2): defaults are on; read when the form is built
  const shortcuts = h('input', { type: 'checkbox', id: 'pref-shortcuts', name: 'pref-shortcuts', checked: true }) as HTMLInputElement;
  void getUiPrefs(ctx).then((ui) => { shortcuts.checked = ui.shortcuts; });
  shortcuts.addEventListener('change', () => { const saving = patchUiPrefs(ctx, { shortcuts: shortcuts.checked }).then(() => setStatus(status, 'Saved on this device.', 'ok')); track?.(saving); });

  const toggle = (box: HTMLInputElement, label: string, help: string): HTMLElement =>
    h('label', { class: 'toggle' }, box, h('span', {}, label, h('span', { class: 'help' }, ` ${help}`)));

  const form = h('div', { class: 'prefs', id: 'prefs-form' });
  append(form, [
    opts.deckSize === false ? null : h('div', { class: 'field' }, h('span', { class: 'cap' }, 'Cards per deck'), deckSizeControl(ctx, learnerId, current.languageId, initial.cardsPerDeck, (_n, prefs) => { current = prefs; onSaved?.(prefs); }, 'pref'), h('span', { class: 'help' }, 'How many cards the current deck holds, from 5 to 60. It changes the deck at once.')),
    field('New items per session (at most)', maxNew),
    field('Desired retention (%)', retention, 'How likely you want to recall an item when it comes due. Higher means more reviews.'),
    field('Share of grammar items (%)', grammar, 'Approximate; due items are never dropped to reach it.'),
    toggle(listening, 'Include listening practice', 'Needs audio. Synthetic speech is practice only and is never recorded as listening evidence.'),
    toggle(saved, 'Prioritise items I saved', 'Items you marked as saved are proposed first.'),
    toggle(shortcuts, 'Keyboard shortcuts in a session', 'The keys 1 to 4 answer or grade and Space plays the audio. Turn them off if speech input or a switch device triggers them by accident; every action stays a button, and Enter and Esc still work.'),
    p('Kept on this device.', 'muted'),
    status,
  ]);
  return form;
}
