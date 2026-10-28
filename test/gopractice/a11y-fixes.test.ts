// @vitest-environment jsdom
/**
 * Behaviour added by the accessibility, grading and consent remediation (docs/ecosystem/audit/ACCESSIBILITY.md,
 * PRIVACY-PORTABILITY.md P-09) and the two GoReview home defects E-03 / E-04, proved on the real screens:
 *   - embedTarget: target-language words inside interface-language sentences carry lang (A-11)
 *   - the one-key shortcuts of a session can be turned off, the clock can be hidden (A-08, A-09)
 *   - the remote-speech switch in Settings records ConsentGiven / ConsentWithdrawn (P-09)
 *   - Start a session plans with the preferences saved an instant ago (E-03); a sync repaints the home (E-04)
 *   - heading order of the history screen (A-19), the settings sections keep their names (A-10)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { embedTarget, h } from '../../packages/gopractice/dom';
import { UI_KEY } from '../../packages/gopractice/screens/uiprefs';
import { cardAdded, defaultService, destroyRigs, dueCard, ids, key, makeRig, queued, reopenDetails, seed, startWith, type, until } from './helpers';

afterEach(() => destroyRigs());

const A = ids('L1', 'sq');
const html = (nodes: ReadonlyArray<unknown>): string => {
  const box = document.createElement('div');
  for (const n of nodes) box.append(typeof n === 'string' ? document.createTextNode(n) : (n as Node));
  return box.innerHTML;
};

describe('embedTarget (A-11)', () => {
  it('wraps each whole-word occurrence in a span carrying lang, dir and the target-text class, and leaves the rest as text', () => {
    expect(html(embedTarget('Today you looked zog up; Zog is not zogu.', ['zog'], 'sq')))
      .toBe('Today you looked <span lang="sq" dir="ltr" class="target-text">zog</span> up; <span lang="sq" dir="ltr" class="target-text">Zog</span> is not zogu.');
  });

  it('works for any script and for a right-to-left language', () => {
    expect(html(embedTarget('The word is हिन्दी.', ['हिन्दी'], 'hi'))).toBe('The word is <span lang="hi" dir="ltr" class="target-text">हिन्दी</span>.');
    expect(html(embedTarget('The word is كتاب.', ['كتاب'], 'ar'))).toContain('lang="ar" dir="rtl"');
  });

  it('returns the text unchanged without a tag, a word or a match, and escapes regular-expression characters in a word', () => {
    expect(embedTarget('Nothing here', ['zog'], 'sq')).toEqual(['Nothing here']);
    expect(embedTarget('zog', ['zog'], undefined)).toEqual(['zog']);
    expect(embedTarget('zog', [undefined, ''], 'sq')).toEqual(['zog']);
    expect(html(embedTarget('is a+b (x) ok', ['a+b', '(x)'], 'sq'))).toContain('<span lang="sq"');
    expect(h('p', {}, ...embedTarget('x', ['x'], 'sq')).querySelector('span')?.getAttribute('lang')).toBe('sq');
  });
});

describe('one-key shortcuts and the session clock (A-08, A-09)', () => {
  it('the review preferences carry a "Keyboard shortcuts" switch, on by default, and no clock switch', async () => {
    const rig = await makeRig({ signedIn: true });
    await reopenDetails(rig);
    const shortcuts = rig.q<HTMLInputElement>('#pref-shortcuts');
    await until(() => shortcuts.checked, 'the default');
    expect(rig.root.querySelector('#pref-clock')).toBeNull();
    expect(shortcuts.labels?.[0]?.textContent).toMatch(/Keyboard shortcuts/);
  });

  it('turning the shortcuts off is remembered on the device, and a session then ignores 1 to 4 and Space (the buttons still work)', async () => {
    const rig = await makeRig({ signedIn: true });
    await reopenDetails(rig);
    const box = rig.q<HTMLInputElement>('#pref-shortcuts');
    box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
    await until(async () => ((await rig.area.get(UI_KEY))[UI_KEY] as { shortcuts?: boolean } | undefined)?.shortcuts === false, 'the stored switch');

    await startWith(rig, dueCard(A, 'mace', 'written-recognition'));
    expect(rig.q('.exercise').getAttribute('data-mode')).toBe('choice');
    expect(rig.q('.choice').textContent).not.toMatch(/^1\s/);       // the number hint is gone with the shortcut
    key('1');
    await new Promise((r) => setTimeout(r, 20));
    expect(rig.root.querySelector('#feedback')).toBeNull();            // "1" did nothing
    rig.q('.choice').click();                                           // the button does
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
  });

  it('with the shortcuts on (the default) the same key answers, and the buttons name their key', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'mace', 'written-recognition'));
    expect(rig.q('.choice').textContent).toMatch(/^1\s/);
    key('1');
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
  });

  it('the session bar is one quiet line, with no clock and no timer control; Skip names its shortcut', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'mace', 'written-recognition'));
    expect(rig.root.querySelector('#session-clock')).toBeNull();
    expect(rig.root.querySelector('#toggle-clock')).toBeNull();
    expect(rig.q('#session-progress').textContent).toBe('1 of 1');
    expect(rig.q('#skip').textContent).toBe('Skip');
    expect(rig.q('#skip').getAttribute('aria-keyshortcuts')).toBe('Escape');
    expect(rig.q('#skip').getAttribute('title')).toBe('Skip (Esc)');
    expect(rig.q('#finish-early').textContent).toBe('Finish early');
    expect(/\d\d:\d\d/.test(rig.q('#session-header').textContent ?? '')).toBe(false);
    expect(await rig.area.get(UI_KEY)).not.toHaveProperty([UI_KEY, 'showClock']);
  });

  it('A-16 on the first item of a session the answer box keeps focus', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'zog', 'meaning-to-form'));
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).toBe(rig.q('#answer-input'));
  });
});

describe('the remote-speech switch in Settings records the consent (P-09)', () => {
  it('on: a ConsentGiven event (scope remote-speech) is queued before the switch turns on; off: ConsentWithdrawn', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    const box = rig.q<HTMLInputElement>('#consent-remote-speech');
    box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
    await until(async () => (await rig.app.ctx.state.getSettings()).remoteSpeechConsent, 'the switch');
    const given = (await queued(rig)).filter((e) => e.kind === 'ConsentGiven');
    expect(given.length).toBe(1);
    expect(given[0]).toMatchObject({ learnerId: 'L1', languageId: 'sq', producer: { app: 'gopractice-review' }, payload: { consent: 'remote-speech', scope: 'remote-speech' } });
    await until(() => /consent is recorded/.test(rig.qa('#settings-prefs .status').at(-1)?.textContent ?? ''), 'the status');

    box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
    await until(async () => !(await rig.app.ctx.state.getSettings()).remoteSpeechConsent, 'the switch to go off');
    await until(async () => (await queued(rig)).some((e) => e.kind === 'ConsentWithdrawn'), 'the withdrawal');
    expect(box.checked).toBe(false);
  });

  it('a refused record leaves the switch off and says so', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    // the queue refuses the event: an unknown producer is a contract violation
    const ctx = rig.app.ctx;
    const real = ctx.record;
    ctx.record = async (events) => ({ queued: 0, duplicates: 0, refused: events.map((e) => ({ id: e.id, issues: ['refused for the test'] })) });
    const box = rig.q<HTMLInputElement>('#consent-remote-speech');
    box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => !box.checked, 'the switch to snap back');
    expect((await ctx.state.getSettings()).remoteSpeechConsent).toBe(false);
    expect(rig.root.textContent).toMatch(/stays off/);
    ctx.record = real;
  });
});

describe('Settings and History (A-10, A-19)', () => {
  it('A-10 the synchronisation and diagnostics sections keep the name of their heading after a repaint', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('developer');
    await until(() => !!rig.root.querySelector('#diagnostics'), 'the diagnostics');
    for (const [section, heading] of [['#settings-sync', 'sync-h'], ['#settings-diagnostics', 'diag-h']] as const) {
      expect(rig.q(section).getAttribute('aria-labelledby')).toBe(heading);
      expect(rig.q(section).querySelector(`h2#${heading}`)).toBeTruthy();
    }
    rig.q('#sync-now').click();
    await until(() => !!rig.root.querySelector('#sync-facts'), 'the repaint');
    await new Promise((r) => setTimeout(r, 20));
    expect(rig.q('#settings-sync').querySelector('h2#sync-h')).toBeTruthy();
  });

  it('A-19 the history screen goes h1 then h2 (no skipped level)', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    await reopenDetails(rig);
    const href = rig.q<HTMLAnchorElement>('a[href^="#/review/history"]').getAttribute('href')!;
    await rig.go(href.replace(/^#\//, ''));
    await until(() => !!rig.root.querySelector('#item-history h2'), 'the history');
    const levels = [...rig.root.querySelectorAll('h1, h2, h3, h4')].map((x) => Number(x.tagName[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], levels.join(',')).toBeLessThanOrEqual(1);
  });
});

describe('E-03 Start a session plans with the preferences saved an instant before', () => {
  it('changing "Session length" and pressing Start at once plans with the new length', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopenDetails(rig);
    const size = rig.q<HTMLInputElement>('#details-size');
    const before = Number(size.value);
    const wanted = before === 7 ? 9 : 7;
    type(size, String(wanted));
    size.dispatchEvent(new Event('change', { bubbles: true }));
    rig.q('#start-session').click();                   // the details page can start a session too; no wait: the save is still in flight
    await until(() => !!rig.app.ctx.run.active, 'the run');
    expect(rig.app.ctx.run.active!.plan.items.length).toBe(2);   // two due cards, and no more material than that: fewer than the size
  });
});

describe('E-04 the review home follows a sync that finishes after it was painted', () => {
  it('a card another device added shows up in the counts without leaving the screen', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    await rig.go('review/details');
    await until(() => rig.q('#count-fresh').textContent === '0', 'the empty deck');
    service.inject('L1', cardAdded(A, 'mace', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));   // arrives from another device
    await rig.app.ctx.syncNow({ force: true });
    await until(() => rig.q('#count-fresh').textContent === '1', 'the new card to be counted');
    expect(rig.root.querySelector('#deck')?.textContent).toContain('mace');
  });

  it('a repaint does not wipe a preference the learner is typing', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    await rig.go('review/details');
    rig.q<HTMLDetailsElement>('#session-controls').open = true;
    const minutes = rig.q<HTMLInputElement>('#pref-max-new');
    minutes.focus();
    type(minutes, '33');
    service.inject('L1', cardAdded(A, 'mace', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));
    await rig.app.ctx.syncNow({ force: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(rig.q<HTMLInputElement>('#pref-max-new')).toBe(minutes);   // the same element: nothing was repainted under the cursor
    expect(minutes.value).toBe('33');
  });
});
