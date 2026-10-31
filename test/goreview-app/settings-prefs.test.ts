// @vitest-environment jsdom
/** Settings merges the current learning controls with the committed centered deck stepper and reset UX. */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../packages/goreview/app/state';
import { destroyRigs, makeRig, type, until } from './helpers';

afterEach(() => destroyRigs());

describe('review preferences in Settings', () => {
  it('shows the centered deck stepper and puts the remaining controls under closed Advanced settings', async () => {
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
    expect(deck.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const id of ['pref-max-new', 'pref-daily-new', 'pref-retention', 'pref-practice-goals', 'pref-listening', 'pref-saved', 'pref-shortcuts', 'pref-reset']) {
      expect(advanced.querySelector(`#${id}`), id).not.toBeNull();
    }
    expect(advanced.querySelector('#pref-grammar')).toBeNull();
    const controls = [...advanced.querySelectorAll('button, input')];
    expect(controls[controls.length - 1].id).toBe('pref-reset');
  });

  it('the new-item steppers follow the deck size on screen as it is stepped, until one is moved; then they stay (2026-10-30)', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    await until(() => !!rig.root.querySelector('#pref-more'), 'the deck stepper');
    const value = (id: string) => rig.q<HTMLInputElement>(id).value;
    expect([value('#pref-size'), value('#pref-max-new'), value('#pref-daily-new')]).toEqual(['10', '10', '10']);
    rig.q('#pref-more').click();
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck === 11, 'the deck size saved');
    expect([value('#pref-max-new'), value('#pref-daily-new')]).toEqual(['11', '11']); // the open form shows the follow
    rig.q('#pref-daily-new-more').click();
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).dailyNewLimit === 12, 'the day set apart');
    rig.q('#pref-more').click();
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck === 12, 'the deck size saved again');
    expect([value('#pref-max-new'), value('#pref-daily-new')]).toEqual(['11', '12']); // set apart: the deck no longer moves them
  });

  it('provides accessible steppers that save together, allow typing, and clamp at their ends', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    const prefs = () => rig.app.ctx.state.getPrefs('L1', 'sq');
    expect(rig.q<HTMLInputElement>('#pref-retention').classList.contains('stepper-value')).toBe(true);
    expect(rig.q('#pref-retention-less').getAttribute('aria-label')).toBe('Fewer: Desired retention, per cent');
    rig.q('#pref-retention-less').click();
    await until(async () => (await prefs()).desiredRetention === 0.89, 'retention saved');
    expect(rig.q<HTMLInputElement>('#pref-retention').value).toBe('89');

    rig.q('#pref-daily-new-more').click();
    await until(async () => (await prefs()).dailyNewLimit === 11, 'daily limit saved'); // from the deck size, 10, since 2026-10-30
    // listening has one switch, "Include listening practice", and the listening goal follows it (the owner, 2026-10-28)
    expect(rig.root.querySelector('#pref-goal-listening')).toBeNull();
    expect((await prefs()).practiceGoals).toContain('listening');
    rig.q<HTMLInputElement>('#pref-listening').click();
    await until(async () => (await prefs()).includeListening === false && !(await prefs()).practiceGoals?.includes('listening'), 'listening off, goal and all');
    rig.q<HTMLInputElement>('#pref-listening').click();
    await until(async () => (await prefs()).includeListening && (await prefs()).practiceGoals?.includes('listening') === true, 'listening back on');

    type(rig.q<HTMLInputElement>('#pref-max-new'), '3');
    await until(async () => (await prefs()).maxNew === 3, 'a typed value saved');
    type(rig.q<HTMLInputElement>('#pref-max-new'), '0');
    await until(async () => (await prefs()).maxNew === 0, 'the floor');
    expect(rig.q<HTMLButtonElement>('#pref-max-new-less').disabled).toBe(true);
    expect(rig.q<HTMLButtonElement>('#pref-max-new-more').disabled).toBe(false);
  });

  it('resets review preferences, deck size, and the device shortcut switch to defaults', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    const prefs = () => rig.app.ctx.state.getPrefs('L1', 'sq');
    for (let i = 0; i < 10; i++) rig.q('#pref-more').click();
    await until(async () => (await prefs()).cardsPerDeck === 20, 'deck size 20');
    type(rig.q<HTMLInputElement>('#pref-max-new'), '3');
    type(rig.q<HTMLInputElement>('#pref-daily-new'), '9');
    const goal = rig.q<HTMLInputElement>('#pref-goal-retrieval');
    goal.checked = false; goal.dispatchEvent(new Event('change'));
    const listening = rig.q<HTMLInputElement>('#pref-listening');
    expect(listening.checked).toBe(true); // on by default (the owner, 2026-10-28)
    listening.checked = false; listening.dispatchEvent(new Event('change'));
    const shortcuts = rig.q<HTMLInputElement>('#pref-shortcuts');
    shortcuts.checked = false; shortcuts.dispatchEvent(new Event('change'));
    await until(async () => !(await prefs()).includeListening && (await prefs()).maxNew === 3 && (await prefs()).dailyNewLimit === 9, 'the changes saved');
    rig.q('#pref-reset').click();
    await until(async () => (await prefs()).cardsPerDeck === 10 && (await prefs()).includeListening, 'the defaults restored');
    expect(await prefs()).toEqual(DEFAULT_PREFERENCES('sq'));
    expect(rig.q<HTMLInputElement>('#pref-size').value).toBe('10');
    expect(rig.q<HTMLInputElement>('#pref-max-new').value).toBe('10');
    expect(rig.q<HTMLInputElement>('#pref-daily-new').value).toBe('10');
    expect(rig.q<HTMLInputElement>('#pref-retention').value).toBe('90');
    expect(rig.q<HTMLInputElement>('#pref-goal-retrieval').checked).toBe(true);
    expect(rig.q<HTMLInputElement>('#pref-listening').checked).toBe(true);
    expect(rig.q<HTMLInputElement>('#pref-saved').checked).toBe(true);
    expect(rig.q<HTMLInputElement>('#pref-shortcuts').checked).toBe(true);
    expect(rig.q('#prefs-form > .status').textContent).toContain('Back to the defaults');
  });
});
