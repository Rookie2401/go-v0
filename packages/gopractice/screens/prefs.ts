/**
 * Review preferences shared by Settings and the review details page. Settings keeps the deck size
 * prominent and places the remaining learning controls under a closed Advanced settings disclosure.
 * `track` receives each save as it starts so callers can wait before starting a session.
 * The keyboard shortcut preference is device-local (./uiprefs).
 */
import type { ReviewPreferences } from '../../goreview/src/types';
import type { AppContext } from '../context';
import { append, button, field, h, p, setStatus, statusLine } from '../dom';
import { DEFAULT_PREFERENCES } from '../state';
import { deckSizeControl, type DeckSizeControl } from './cardsper';
import { getUiPrefs, patchUiPrefs } from './uiprefs';

interface Stepper { root: HTMLElement; input: HTMLInputElement; set(value: number): void }

/** A clamped whole-number input with accessible fewer/more buttons and keyboard typing support. */
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

const goalNames = ['recognition', 'retrieval', 'listening', 'application'] as const;
const goalLabels: Record<typeof goalNames[number], string> = {
  recognition: 'Reading recognition', retrieval: 'Recall from meaning', listening: 'Listening recognition', application: 'Grammar and context',
};
const goalHelp: Record<typeof goalNames[number], string> = {
  recognition: 'Recognize a written word or phrase.',
  retrieval: 'Produce a word from its meaning after independent recognition evidence.',
  listening: 'Only available when listening is enabled and suitable audio exists.',
  application: 'Use contextual or grammatical practice after sufficient recognition evidence.',
};

export function prefsForm(ctx: AppContext, learnerId: string, initial: ReviewPreferences, onSaved?: (p: ReviewPreferences) => void, track?: (saving: Promise<unknown>) => void, opts: { deckSize?: boolean } = {}): HTMLElement {
  let current = initial;
  const status = statusLine();
  const maxNew = stepper('pref-max-new', 'New items per session', initial.maxNew, 0, 50, 1);
  const dailyNew = stepper('pref-daily-new', 'Automatic new items per UTC day', initial.dailyNewLimit ?? initial.maxNew, 0, 200, 1);
  const retention = stepper('pref-retention', 'Desired retention, per cent', Math.round(initial.desiredRetention * 100), 70, 97, 1);
  const listening = h('input', { type: 'checkbox', id: 'pref-listening', name: 'pref-listening', checked: initial.includeListening }) as HTMLInputElement;
  const saved = h('input', { type: 'checkbox', id: 'pref-saved', name: 'pref-saved', checked: initial.prioritizeSaved }) as HTMLInputElement;
  const goals = Object.fromEntries(goalNames.map((goal) => [goal, h('input', { type: 'checkbox', id: `pref-goal-${goal}`, name: `pref-goal-${goal}`, checked: initial.practiceGoals?.includes(goal) ?? false })])) as Record<typeof goalNames[number], HTMLInputElement>;
  listening.checked = initial.includeListening;
  saved.checked = initial.prioritizeSaved;

  function show(prefs: ReviewPreferences): void {
    current = prefs;
    maxNew.set(prefs.maxNew);
    dailyNew.set(prefs.dailyNewLimit ?? prefs.maxNew);
    retention.set(Math.round(prefs.desiredRetention * 100));
    listening.checked = prefs.includeListening;
    saved.checked = prefs.prioritizeSaved;
    for (const goal of goalNames) goals[goal].checked = prefs.practiceGoals?.includes(goal) ?? false;
  }

  async function save(): Promise<void> {
    const next = await ctx.state.updatePrefs(learnerId, current.languageId, {
      maxNew: Number(maxNew.input.value), dailyNewLimit: Number(dailyNew.input.value),
      desiredRetention: Number(retention.input.value) / 100,
      includeListening: listening.checked, prioritizeSaved: saved.checked,
      practiceGoals: goalNames.filter((goal) => goals[goal].checked),
    });
    show(next);
    setStatus(status, 'Saved on this device.', 'ok');
    onSaved?.(next);
  }
  for (const c of [maxNew.input, dailyNew.input, retention.input, listening, saved, ...Object.values(goals)]) {
    c.addEventListener('change', () => { const saving = save(); track?.(saving); void saving; });
  }

  const shortcuts = h('input', { type: 'checkbox', id: 'pref-shortcuts', name: 'pref-shortcuts', checked: true }) as HTMLInputElement;
  void getUiPrefs(ctx).then((ui) => { shortcuts.checked = ui.shortcuts; });
  shortcuts.addEventListener('change', () => { const saving = patchUiPrefs(ctx, { shortcuts: shortcuts.checked }).then(() => setStatus(status, 'Saved on this device.', 'ok')); track?.(saving); });

  const toggle = (box: HTMLInputElement, label: string, help: string): HTMLElement =>
    h('label', { class: 'toggle' }, box, h('span', {}, label, h('span', { class: 'help' }, ` ${help}`)));

  const deck: DeckSizeControl | undefined = opts.deckSize === false ? undefined
    : deckSizeControl(ctx, learnerId, current.languageId, initial.cardsPerDeck, (_n, prefs) => { current = prefs; onSaved?.(prefs); }, 'pref', { centred: true });

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
    field('Automatic new items per UTC day', dailyNew.root, 'Counted from synchronized review history. Independent offline devices can temporarily exceed the shared allowance; optional practice is separate.'),
    field('Desired retention (%)', retention.root, 'How likely you want to recall an item when it comes due. Higher means more reviews.'),
    h('fieldset', { class: 'field', id: 'pref-practice-goals' }, h('legend', {}, 'Deliberate practice goals'),
      ...goalNames.map((goal) => toggle(goals[goal], goalLabels[goal], goalHelp[goal])),
      p('Goals select one practice dimension at a time. Multiple choice and assisted answers do not establish productive mastery.', 'help')),
    toggle(listening, 'Include listening practice', 'Needs audio. Synthetic speech is practice only and is never recorded as listening evidence.'),
    toggle(saved, 'Prioritise items I saved', 'Items you marked as saved are proposed first.'),
    toggle(shortcuts, 'Keyboard shortcuts in a session', 'The keys 1 to 4 answer or grade and Space plays the audio. Turn them off if speech input or a switch device triggers them by accident; every action stays a button, and Enter and Esc still work.'),
    p('Kept on this device.', 'muted'),
    h('div', { class: 'row prefs-reset' }, reset),
  ];

  const form = h('div', { class: 'prefs', id: 'prefs-form' });
  append(form, [
    deck ? h('div', { class: 'field deck-field' }, h('span', { class: 'cap' }, 'Cards per deck'), deck, h('span', { class: 'help' }, 'Maximum questions in a batch, from 5 to 60. A batch can contain fewer eligible questions.')) : null,
    deck ? h('details', { class: 'advanced', id: 'pref-advanced' }, h('summary', {}, 'Advanced settings'), ...advanced) : h('div', { id: 'pref-advanced' }, ...advanced),
    status,
  ]);
  return form;
}
