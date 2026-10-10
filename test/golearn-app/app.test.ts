// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS, HOME, ALIASES } from '../../packages/golearn-extension/app/app';
import { KEYS } from '../../packages/golearn-extension/app/state';
import { chooseOnWelcome, destroyRigs, flush, makeRig, signIn, until } from './helpers';

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
    expect(labels).toEqual(['home', 'welcome', 'sync', 'privacy', 'diagnostics', 'reader']);
  });

  it('setup is one screen, Welcome; the rest are advanced', () => {
    expect(SCREENS.map((s) => s.id)).toEqual(['welcome', 'sync', 'privacy', 'diagnostics', 'reader']);
    expect(SCREENS.filter((s) => s.group === 'setup').map((s) => s.id)).toEqual(['welcome']);
    expect(SCREENS.filter((s) => s.group === 'advanced').map((s) => s.title)).toEqual(['Sync', 'Privacy', 'Diagnostics and updates', 'How GoLearn reads pages']);
  });

  it('the navigation no longer lists the old setup steps', async () => {
    const rig = await makeRig();
    const rail = rig.q('.rail').textContent ?? '';
    for (const gone of ['Choose your language', 'Install the pack', 'Orientation', 'Reader integration', 'Keep your progress']) expect(rail).not.toContain(gone);
    expect(rail).toContain('Welcome');
    expect(rail).toContain('Advanced');
  });

  it('the Advanced group starts collapsed, opens for one of its screens, and stays as the learner left it', async () => {
    const rig = await makeRig();
    const adv = (): HTMLDetailsElement => rig.q<HTMLDetailsElement>('#advanced-nav');
    expect(adv().open).toBe(false);
    expect([...adv().querySelectorAll('li[data-route]')].map((li) => li.getAttribute('data-route'))).toEqual(['sync', 'privacy', 'diagnostics', 'reader']);
    await rig.go('privacy');
    expect(adv().open).toBe(true);
    await rig.go('welcome');
    expect(adv().open).toBe(false);
    // the learner opens it by hand: it stays open when another refresh redraws the list
    adv().open = true;
    adv().dispatchEvent(new Event('toggle'));
    await rig.go('home');
    expect(adv().open).toBe(true);
  });

  it.each(Object.keys(ALIASES))('an old link to #/%s lands on Welcome', async (old) => {
    const rig = await makeRig({ startRoute: old });
    expect(rig.app.current()).toBe('welcome');
    expect(window.location.hash).toBe('#/welcome');
  });

  it('an old link followed while the app is open is rewritten, and rig.go on an old name shows Welcome', async () => {
    const rig = await makeRig({ startRoute: 'privacy' });
    window.location.hash = '#/pack';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await until(() => rig.app.current() === 'welcome');
    await rig.app.ready();
    expect(window.location.hash).toBe('#/welcome');
    await rig.go('tutorial');
    expect(rig.app.current()).toBe('welcome');
    expect(rig.q('#screen h1').textContent).toBe('Welcome');
  });

  it('opens on Welcome while setup is not done and follows a hash change', async () => {
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

  it('marks completion from what is true, not from what was clicked: Welcome is done once a language is chosen and its pack installed', async () => {
    const rig = await makeRig();
    const mark = (): boolean => rig.q('.rail li[data-route="welcome"] .mark').classList.contains('done');
    expect(mark()).toBe(false);
    expect(rig.q('.rail li[data-route="welcome"] .sr').textContent).toContain('not yet');
    await signIn(rig);
    expect(mark()).toBe(false); // signing in does not choose a language
    await chooseOnWelcome(rig, 'sq');
    await until(() => mark());
    expect(rig.q('.rail li[data-route="welcome"] .sr').textContent).toContain('done');
    // the advanced screens carry no marks
    expect(rig.root.querySelector('.rail li[data-route="sync"] .mark')).toBeNull();
  });

  it('shows the compact status home once setup is complete, and Done — back to reading on every screen', async () => {
    const rig = await makeRig({ extension: true });
    // a language chosen with its pack installed (the real Welcome screen does both, tested separately); here the state is set
    await rig.deps.area.set({ [KEYS.choice]: { enrolmentId: 'loc-1', languageId: 'sq', varietyId: 'sq-standard', packId: 'pack:sq' } });
    await rig.deps.area.set({ [KEYS.app]: { visited: [], tutorial: 'pending', tutorialStep: 0, packs: { 'pack:sq': { version: '9', ok: true, verifiedAt: '2026-10-08T00:00:00Z' } }, readerAck: false } });
    await rig.go('home');
    expect(rig.q('#status-list').children.length).toBe(2);
    expect(rig.text()).toContain('GoLearn is set up');
    // without an account the progress is on this device, and signing in is offered any time (on Welcome)
    expect(rig.q('#progress-mode').textContent).toContain('On this device only');
    expect(rig.q('#progress-mode').getAttribute('data-state')).toBe('device');
    expect(rig.q<HTMLAnchorElement>('#keep-progress').getAttribute('href')).toBe('#/welcome');
    expect(rig.q<HTMLAnchorElement>('#practise').getAttribute('href')).toBe('../practice/index.html');
    expect(rig.q('#status-list li[data-route="welcome"]').textContent).toContain('Albanian');
    expect(rig.root.querySelector('a[href="#/tutorial"], a[href="#/account"], a[href="#/language"], a[href="#/pack"]')).toBeNull();
    await rig.go('diagnostics');
    const done = rig.q<HTMLButtonElement>('#done-reading');
    expect(done.textContent).toBe('Done — back to reading');
    done.click();
    expect(rig.closed.count).toBe(1);
    expect(rig.q('.finish-note').textContent).toContain('close this tab');
    for (const id of ['welcome', 'home', 'sync', 'privacy', 'reader']) {
      await rig.go(id);
      expect(rig.root.querySelector('#done-reading'), id).not.toBeNull();
    }
    await flush();
  });

  it('a pack that did not verify does not complete setup', async () => {
    const rig = await makeRig({ extension: true });
    await rig.deps.area.set({ [KEYS.choice]: { enrolmentId: 'loc-1', languageId: 'sq', varietyId: 'sq-standard', packId: 'pack:sq' } });
    await rig.deps.area.set({ [KEYS.app]: { visited: [], tutorial: 'pending', tutorialStep: 0, packs: { 'pack:sq': { version: '9', ok: false, verifiedAt: '2026-10-08T00:00:00Z' } }, readerAck: false } });
    await rig.go('home');
    expect(rig.text()).toContain('Setup is not finished');
    expect(rig.text()).toContain('Welcome');
  });

  it('there is no pager between screens: no "next" or "previous" setup links', async () => {
    const rig = await makeRig();
    for (const id of ['welcome', 'sync', 'reader']) {
      await rig.go(id);
      expect(rig.root.querySelector('.pager a.primary'), id).toBeNull();
    }
    expect(rig.root.querySelector('.pager a[href="#/pack"], .pager a[href="#/account"], .pager a[href="#/tutorial"]')).toBeNull();
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
