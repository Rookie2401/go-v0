// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS, HOME } from '../../packages/golearn-extension/app/app';
import { KEYS } from '../../packages/golearn-extension/app/state';
import { destroyRigs, flush, makeRig, signIn, until } from './helpers';

afterEach(() => destroyRigs());

describe('the router and the shell', () => {
  it('renders every screen with its heading, no error, and a left list that names all of them', async () => {
    const rig = await makeRig();
    for (const screen of [HOME, ...SCREENS]) {
      await rig.go(screen.id);
      expect(rig.app.current()).toBe(screen.id);
      expect(window.location.hash).toBe(`#/${screen.id}`);
      expect(rig.q('#screen h1').textContent).toBe(screen.title);
      expect(rig.q('#screen .body').children.length, screen.id).toBeGreaterThan(0);
      expect(rig.text(), screen.id).not.toMatch(/could not be shown/);
      expect(rig.q(`.rail li[data-route="${screen.id}"] a`).getAttribute('aria-current')).toBe('page');
    }
    const labels = [...rig.root.querySelectorAll('.rail li[data-route]')].map((li) => li.getAttribute('data-route'));
    expect(labels).toEqual(['home', 'welcome', 'language', 'pack', 'tutorial', 'reader', 'account', 'sync', 'privacy', 'diagnostics']);
  });

  it('there are nine screens besides the status home, in the order the setup needs them: language first, the account optional and last', () => {
    expect(SCREENS.map((s) => s.id)).toEqual(['welcome', 'language', 'pack', 'tutorial', 'reader', 'account', 'sync', 'privacy', 'diagnostics']);
    expect(SCREENS.find((x) => x.id === 'language')!.title).toBe('Choose your language');
    expect(SCREENS.find((x) => x.id === 'account')!.title).toMatch(/optional/);
  });

  it('an old link to the team screen lands on the language screen', async () => {
    const rig = await makeRig({ startRoute: 'team' });
    expect(rig.app.current()).toBe('language');
    expect(window.location.hash).toBe('#/language');
  });

  it('opens on the first incomplete step and follows a hash change', async () => {
    const rig = await makeRig();
    expect(rig.app.current()).toBe('welcome');
    window.location.hash = '#/privacy';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await until(() => rig.app.current() === 'privacy');
    await rig.app.ready();
    expect(rig.q('#screen h1').textContent).toBe('Privacy');
  });

  it('an unknown hash falls back to the default route instead of a blank page', async () => {
    const rig = await makeRig({ startRoute: 'nonsense' });
    expect(rig.app.current()).toBe('welcome');
  });

  it('marks completion from what is true, not from what was clicked', async () => {
    const rig = await makeRig();
    const mark = (route: string): boolean => rig.q(`.rail li[data-route="${route}"] .mark`).classList.contains('done');
    expect(mark('welcome')).toBe(true); // it is open
    expect(mark('language')).toBe(false);
    expect(mark('account')).toBe(false);
    await signIn(rig);
    expect(mark('account')).toBe(true); // an account is optional, but the mark still says what is true
    expect(mark('language')).toBe(false); // signing in does not choose a language
    expect(mark('pack')).toBe(false);
    expect(mark('tutorial')).toBe(false);
    expect(rig.q('.rail li[data-route="language"] .sr').textContent).toContain('not yet');
  });

  it('shows the compact status home once setup is complete, and Done — back to reading at the end', async () => {
    const rig = await makeRig({ extension: true });
    // no account: choose a language, install, finish the orientation (the real screens do each of these, tested separately); here the state is set
    await rig.deps.area.set({ [KEYS.choice]: { enrolmentId: 'loc-1', languageId: 'sq', varietyId: 'sq-standard', packId: 'pack:sq' } });
    await rig.deps.area.set({ [KEYS.app]: { visited: ['welcome'], tutorial: 'skipped', tutorialStep: 0, packs: { 'pack:sq': { version: '9', ok: true, verifiedAt: '2026-10-08T00:00:00Z' } }, readerAck: false } });
    await rig.go('home');
    expect(rig.q('#status-list').children.length).toBe(4);
    expect(rig.text()).toContain('GoLearn is set up');
    // without an account the progress is on this device, and the account step is offered any time
    expect(rig.q('#progress-mode').textContent).toContain('On this device only');
    expect(rig.q('#progress-mode').getAttribute('data-state')).toBe('device');
    expect(rig.q<HTMLAnchorElement>('#keep-progress').getAttribute('href')).toBe('#/account');
    expect(rig.q<HTMLAnchorElement>('#practise').getAttribute('href')).toBe('../practice/index.html');
    expect(rig.q('#status-list li[data-route="language"]').textContent).toContain('Albanian');
    // the last screen carries the Done button
    await rig.go('diagnostics');
    const done = rig.q<HTMLButtonElement>('#done-reading');
    expect(done.textContent).toBe('Done — back to reading');
    done.click();
    expect(rig.closed.count).toBe(1);
    expect(rig.q('.finish-note').textContent).toContain('close this tab');
    await flush();
  });

  it('every screen but the last has a link to the next one', async () => {
    const rig = await makeRig();
    await rig.go('language');
    expect(rig.q<HTMLAnchorElement>('.pager a.primary').getAttribute('href')).toBe('#/pack');
    await rig.go('reader');
    expect(rig.q<HTMLAnchorElement>('.pager a.primary').getAttribute('href')).toBe('#/account');
    expect(rig.root.querySelector('#done-reading')).toBeNull();
  });

  it('the status home says "Synced to your account" once an account is signed in', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.go('home');
    expect(rig.q('#progress-mode').textContent).toContain('Synced to your account');
    expect(rig.q('#progress-mode').getAttribute('data-state')).toBe('synced');
    expect(rig.root.querySelector('#keep-progress')).toBeNull();
  });

  it('no screen of the setup application mentions a team, a mission team or a leader', async () => {
    const rig = await makeRig({ extension: true });
    for (const screen of [HOME, ...SCREENS]) {
      await rig.go(screen.id);
      expect(rig.text(), screen.id).not.toMatch(/team|leader/i);
      expect(rig.q('.rail').textContent, screen.id).not.toMatch(/team|leader/i);
    }
  });
});
