/**
 * The "Cards per deck" control: a quiet stepper (fewer, the number, more) and nothing else. Shared by Settings, the details page and
 * the home (inline, under the deck's kicker, centred). The presets 5 · 10 · 15 · 20 · 30 that used to sit under the stepper were cut on
 * the owner's request (2026-10-28); the stepper and the typed number cover every size. Each change is saved with the review
 * preferences at once (one whole number, 5 to 60) and reported to the caller, which re-plans the deck. The element returned carries
 * `setSize`, so a form that resets the preferences can show the new size without rebuilding the control.
 */
import type { ReviewPreferences } from '../../goreview/src/types';
import type { AppContext } from '../context';
import { button, h, setStatus, statusLine } from '../dom';
import { clampDeckSize, DEFAULT_CARDS_PER_DECK, MAX_CARDS_PER_DECK, MIN_CARDS_PER_DECK } from '../state';

export interface DeckSizeControl extends HTMLElement { setSize(size: number): void }

export function deckSizeControl(ctx: AppContext, learnerId: string, languageId: string, initial: number | undefined, onChange?: (size: number, prefs: ReviewPreferences) => void, idPrefix = 'deck', opts: { centred?: boolean } = {}): DeckSizeControl {
  let size = clampDeckSize(initial ?? DEFAULT_CARDS_PER_DECK);
  const status = statusLine();
  const input = h('input', { type: 'number', id: `${idPrefix}-size`, name: 'cards-per-deck', class: 'stepper-value', min: MIN_CARDS_PER_DECK, max: MAX_CARDS_PER_DECK, step: 1, inputmode: 'numeric', 'aria-label': 'Cards per deck', value: size }) as HTMLInputElement;
  const less = button('−', () => void apply(size - 1), { class: 'stepper-btn', id: `${idPrefix}-less`, 'aria-label': 'Fewer cards per deck' });
  const more = button('+', () => void apply(size + 1), { class: 'stepper-btn', id: `${idPrefix}-more`, 'aria-label': 'More cards per deck' });

  function show(): void {
    input.value = String(size);
    less.disabled = size <= MIN_CARDS_PER_DECK;
    more.disabled = size >= MAX_CARDS_PER_DECK;
  }

  async function apply(wanted: number): Promise<void> {
    const next = clampDeckSize(wanted);
    size = next;
    show();
    try {
      // one read-and-write of this preference only, so another control saving at the same moment is not overwritten
      const prefs = await ctx.state.updatePrefs(learnerId, languageId, { cardsPerDeck: next });
      setStatus(status, '');
      onChange?.(prefs.cardsPerDeck ?? next, prefs);
    } catch { setStatus(status, 'The deck size could not be saved.', 'error'); }
  }
  input.addEventListener('change', () => { void apply(Number(input.value)); });
  show();
  const root = h('div', { class: opts.centred ? 'deck-size centred' : 'deck-size', role: 'group', 'aria-label': 'Cards per deck' },
    h('div', { class: 'stepper' }, less, input, more), status) as DeckSizeControl;
  root.setSize = (n: number) => { size = clampDeckSize(n); show(); };
  return root;
}
