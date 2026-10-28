/**
 * The session controls (ReviewPreferences), shared by Settings and the review details page. Saved on every change.
 *
 * Settings shows one thing first: Cards per deck, a centred stepper (fewer · the number · more). Everything else sits under
 * "Advanced settings", a closed disclosure: the other numbers as the same kind of stepper (new items per session, desired
 * retention, share of grammar items), the switches, and at the bottom "Reset to default", which puts every preference on this
 * page back to the defaults (the deck size and the device's shortcut switch included). The details page, which has its own
 * deck-size control, gets the same fields flat.
 *
 * `track` is handed each save as it starts, so a caller that acts on the saved values (Start a session) can wait for them.
 * The interface switch (one-key shortcuts) is kept per device, not per learner (./uiprefs).
 */
import type { ReviewPreferences } from '../../goreview/src/types';
import type { AppContext } from '../context';
import { append, button, field, h, p, setStatus, statusLine } from '../dom';
import { DEFAULT_PREFERENCES } from '../state';
import { deckSizeControl, type DeckSizeControl } from './cardsper';
import { getUiPrefs, patchUiPrefs } from './uiprefs';

interface Stepper { root: HTMLElement; input: HTMLInputElement; set(value: number): void }

/** A whole number between `min` and `max`, stepped by its own fewer / more buttons; the number itself can be typed. Changes are 'change' events on the input. */
function stepper(id: string, label: string, value: number, min: number, max: number, step: number): Stepper {
  const input = h('input', { type: 'number', id, name: id, class: 'stepper-value', min, max, step, value, inputmode: 'numeric', 'aria-label': label }) as HTMLInputElement;
  const clamp = (v: number): number => Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : value)));
  const less = button('−', () => bump(-step), { class: 'stepper-btn', id: `${id}-less`, 'aria-label': `Fewer: ${label}` });
  const more = button('+', () => bump(step), { class: 'stepper-btn', id: `${id}-more`, 'aria-label': `More: ${label}` });
  const show = (): void => { const v = Number(input.value); less.disabled = v <= min; more.disabled = v >= max; };
  const set = (v: number): void => { input.value = String(clamp(v)); show(); };
  const bump = (d: number): void => { set(Number(input.value) + d); input.dispatchEvent(new Event('change', { bubbles: true })); };
  input.addEventListener('input', show);
  show();
  return { root: h('div', { class: 'stepper', role: 'group', 'aria-label': label }, less, input, more), input, set };
}

export function prefsForm(ctx: AppContext, learnerId: string, initial: ReviewPreferences, onSaved?: (p: ReviewPreferences) => void, track?: (saving: Promise<unknown>) => void, opts: { deckSize?: boolean } = {}): HTMLElement {
  let current = initial;
  const status = statusLine();
  const maxNew = stepper('pref-max-new', 'New items per session', initial.maxNew, 0, 50, 1);
  const retention = stepper('pref-retention', 'Desired retention, per cent', Math.round(initial.desiredRetention * 100), 70, 97, 1);
  const grammar = stepper('pref-grammar', 'Share of grammar items, per cent', Math.round(initial.grammarShare * 100), 0, 100, 5);
  const listening = h('input', { type: 'checkbox', id: 'pref-listening', name: 'pref-listening', ...(initial.includeListening ? { checked: true } : {}) }) as HTMLInputElement;
  const saved = h('input', { type: 'checkbox', id: 'pref-saved', name: 'pref-saved', ...(initial.prioritizeSaved ? { checked: true } : {}) }) as HTMLInputElement;
  listening.checked = initial.includeListening;
  saved.checked = initial.prioritizeSaved;

  /** The controls show the preferences as saved (a typed value out of range comes back clamped). */
  function show(prefs: ReviewPreferences): void {
    current = prefs;
    maxNew.set(prefs.maxNew);
    retention.set(Math.round(prefs.desiredRetention * 100));
    grammar.set(Math.round(prefs.grammarShare * 100));
    listening.checked = prefs.includeListening;
    saved.checked = prefs.prioritizeSaved;
  }

  async function save(): Promise<void> {
    const next = await ctx.state.updatePrefs(learnerId, current.languageId, {
      maxNew: Number(maxNew.input.value), desiredRetention: Number(retention.input.value) / 100,
      grammarShare: Number(grammar.input.value) / 100, includeListening: listening.checked, prioritizeSaved: saved.checked,
    });
    show(next);
    setStatus(status, 'Saved on this device.', 'ok');
    onSaved?.(next);
  }
  for (const c of [maxNew.input, retention.input, grammar.input, listening, saved]) c.addEventListener('change', () => { const saving = save(); track?.(saving); void saving; });

  // interface switches of this device (WCAG 2.1.4 and 2.2.2): defaults are on; read when the form is built
  const shortcuts = h('input', { type: 'checkbox', id: 'pref-shortcuts', name: 'pref-shortcuts', checked: true }) as HTMLInputElement;
  void getUiPrefs(ctx).then((ui) => { shortcuts.checked = ui.shortcuts; });
  shortcuts.addEventListener('change', () => { const saving = patchUiPrefs(ctx, { shortcuts: shortcuts.checked }).then(() => setStatus(status, 'Saved on this device.', 'ok')); track?.(saving); });

  const toggle = (box: HTMLInputElement, label: string, help: string): HTMLElement =>
    h('label', { class: 'toggle' }, box, h('span', {}, label, h('span', { class: 'help' }, ` ${help}`)));

  // the deck size (Settings only; the details page has its own control beside the deck)
  const deck: DeckSizeControl | undefined = opts.deckSize === false ? undefined
    : deckSizeControl(ctx, learnerId, current.languageId, initial.cardsPerDeck, (_n, prefs) => { current = prefs; onSaved?.(prefs); }, 'pref', { presets: false, centred: true });

  /** Every preference on this page back to the defaults: the review preferences of this language, and this device's shortcut switch. */
  const reset = button('Reset to default', () => {
    reset.disabled = true;
    const saving = (async () => {
      try {
        const next = await ctx.state.setPrefs(learnerId, DEFAULT_PREFERENCES(current.languageId));
        await patchUiPrefs(ctx, { shortcuts: true });
        show(next);
        shortcuts.checked = true;
        deck?.setSize(next.cardsPerDeck ?? DEFAULT_PREFERENCES(current.languageId).cardsPerDeck ?? 10);
        setStatus(status, 'Back to the defaults.', 'ok');
        onSaved?.(next);
      } catch (e) { setStatus(status, `The defaults could not be restored: ${e instanceof Error ? e.message : String(e)}`, 'error'); }
      finally { reset.disabled = false; }
    })();
    track?.(saving);
  }, { class: 'btn', id: 'pref-reset' });

  const advanced = [
    field('New items per session (at most)', maxNew.root),
    field('Desired retention (%)', retention.root, 'How likely you want to recall an item when it comes due. Higher means more reviews.'),
    field('Share of grammar items (%)', grammar.root, 'Approximate; due items are never dropped to reach it.'),
    toggle(listening, 'Include listening practice', 'Needs audio. Synthetic speech is practice only and is never recorded as listening evidence.'),
    toggle(saved, 'Prioritise items I saved', 'Items you marked as saved are proposed first.'),
    toggle(shortcuts, 'Keyboard shortcuts in a session', 'The keys 1 to 4 answer or grade and Space plays the audio. Turn them off if speech input or a switch device triggers them by accident; every action stays a button, and Enter and Esc still work.'),
    p('Kept on this device.', 'muted'),
    h('div', { class: 'row prefs-reset' }, reset),
  ];

  const form = h('div', { class: 'prefs', id: 'prefs-form' });
  append(form, [
    deck ? h('div', { class: 'field deck-field' }, h('span', { class: 'cap' }, 'Cards per deck'), deck, h('span', { class: 'help' }, 'How many cards the current deck holds, from 5 to 60. It changes the deck at once.')) : null,
    deck ? h('details', { class: 'advanced', id: 'pref-advanced' }, h('summary', {}, 'Advanced settings'), ...advanced) : h('div', { id: 'pref-advanced' }, ...advanced),
    status,
  ]);
  return form;
}
