// @vitest-environment jsdom
/**
 * Review preferences in Settings (packages/gopractice/screens/prefs.ts): Cards per deck is a centred stepper and nothing else; the rest
 * waits under "Advanced settings", a closed disclosure, as steppers of the same kind, the switches, and "Reset to default".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../packages/gopractice/state';
import { destroyRigs, makeRig, type, until } from './helpers';

afterEach(() => destroyRigs());

describe('review preferences in Settings', () => {
  it('shows Cards per deck as a centred stepper without the preset pills, and the rest under a closed "Advanced settings"', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    const deck = rig.q('#settings-prefs .deck-size');
    expect(deck.classList.contains('centred')).toBe(true);
    expect(deck.querySelector('.pills')).toBeNull();
    expect(rig.qa('#settings-prefs .pill')).toEqual([]);
    expect(rig.q<HTMLInputElement>('#pref-size').value).toBe('10');
    const advanced = rig.q<HTMLDetailsElement>('#pref-advanced');
    expect(advanced.tagName).toBe('DETAILS');
    expect(advanced.open).toBe(false);
    expect(advanced.querySelector('summary')?.textContent).toBe('Advanced settings');
    // the deck stepper comes before the disclosure, which holds everything else
    expect(deck.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const id of ['pref-max-new', 'pref-retention', 'pref-grammar', 'pref-listening', 'pref-saved', 'pref-shortcuts', 'pref-reset']) expect(advanced.querySelector(`#${id}`), id).not.toBeNull();
    // Reset to default is the last control of the disclosure
    const controls = [...advanced.querySelectorAll('button, input')];
    expect(controls[controls.length - 1].id).toBe('pref-reset');
  });

  it('the numbers are steppers of the same kind: fewer / more buttons save at once, the number can still be typed, and the ends are clamped', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    const prefs = () => rig.app.ctx.state.getPrefs('L1', 'sq');
    expect(rig.q<HTMLInputElement>('#pref-retention').classList.contains('stepper-value')).toBe(true);
    expect(rig.q('#pref-retention-less').getAttribute('aria-label')).toBe('Fewer: Desired retention, per cent');
    rig.q('#pref-retention-less').click();
    await until(async () => (await prefs()).desiredRetention === 0.89, 'retention saved');
    expect(rig.q<HTMLInputElement>('#pref-retention').value).toBe('89');
    rig.q('#pref-max-new-more').click();
    await until(async () => (await prefs()).maxNew === 6, 'max new saved');
    rig.q('#pref-grammar-more').click();
    await until(async () => (await prefs()).grammarShare === 0.25, 'grammar share saved (steps of 5)');
    type(rig.q<HTMLInputElement>('#pref-max-new'), '3');
    await until(async () => (await prefs()).maxNew === 3, 'a typed value saved');
    type(rig.q<HTMLInputElement>('#pref-max-new'), '0');
    await until(async () => (await prefs()).maxNew === 0, 'the floor');
    expect(rig.q<HTMLButtonElement>('#pref-max-new-less').disabled).toBe(true);
    expect(rig.q<HTMLButtonElement>('#pref-max-new-more').disabled).toBe(false);
  });

  it('Reset to default puts every preference on the page back: the deck size, the numbers, the switches, and the device shortcut switch', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    const prefs = () => rig.app.ctx.state.getPrefs('L1', 'sq');
    for (let i = 0; i < 10; i++) rig.q('#pref-more').click();
    await until(async () => (await prefs()).cardsPerDeck === 20, 'deck size 20');
    type(rig.q<HTMLInputElement>('#pref-max-new'), '3');
    const listening = rig.q<HTMLInputElement>('#pref-listening');
    listening.checked = true; listening.dispatchEvent(new Event('change'));
    const shortcuts = rig.q<HTMLInputElement>('#pref-shortcuts');
    shortcuts.checked = false; shortcuts.dispatchEvent(new Event('change'));
    await until(async () => (await prefs()).includeListening && (await prefs()).maxNew === 3, 'the changes saved');
    rig.q('#pref-reset').click();
    await until(async () => (await prefs()).cardsPerDeck === 10 && !(await prefs()).includeListening, 'the defaults restored');
    expect(await prefs()).toEqual(DEFAULT_PREFERENCES('sq'));
    expect(rig.q<HTMLInputElement>('#pref-size').value).toBe('10');
    expect(rig.q<HTMLInputElement>('#pref-max-new').value).toBe('5');
    expect(rig.q<HTMLInputElement>('#pref-retention').value).toBe('90');
    expect(rig.q<HTMLInputElement>('#pref-grammar').value).toBe('20');
    expect(rig.q<HTMLInputElement>('#pref-listening').checked).toBe(false);
    expect(rig.q<HTMLInputElement>('#pref-saved').checked).toBe(true);
    expect(rig.q<HTMLInputElement>('#pref-shortcuts').checked).toBe(true);
    expect(rig.q('#prefs-form > .status').textContent).toContain('Back to the defaults');
  });
});
