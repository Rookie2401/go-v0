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
    expect(labels).toEqual(['home', 'welcome', 'account', 'team', 'pack', 'reader', 'tutorial', 'sync', 'privacy', 'diagnostics']);
  });

  it('there are nine numbered screens besides the status home, in the order the setup needs them', () => {
    expect(SCREENS.map((s) => s.id)).toEqual(['welcome', 'account', 'team', 'pack', 'reader', 'tutorial', 'sync', 'privacy', 'diagnostics']);
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
    expect(mark('account')).toBe(false);
    expect(mark('team')).toBe(false);
    await signIn(rig);
    expect(mark('account')).toBe(true);
    expect(mark('team')).toBe(false);
    expect(mark('pack')).toBe(false);
    expect(mark('tutorial')).toBe(false);
    expect(rig.q('.rail li[data-route="team"] .sr').textContent).toContain('not yet');
  });

  it('shows the compact status home once setup is complete, and Done — back to reading at the end', async () => {
    const rig = await makeRig({ extension: true });
    await signIn(rig);
    // enrol, install, finish the orientation: the real screens do each of these (tested separately); here the state is set
    const s = (await rig.deps.area.get(KEYS.session))[KEYS.session] as Record<string, unknown>;
    await rig.deps.area.set({ [KEYS.session]: { ...s, enrolmentId: 'enr-1', languageId: 'sq' } });
    await rig.deps.area.set({ [KEYS.app]: { visited: ['welcome'], tutorial: 'skipped', tutorialStep: 0, packs: { 'pack:sq': { version: '9', ok: true, verifiedAt: '2026-10-08T00:00:00Z' } }, readerAck: false } });
    await rig.go('home');
    expect(rig.q('#status-list').children.length).toBe(5);
    expect(rig.text()).toContain('GoLearn is set up');
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
    await rig.go('account');
    expect(rig.q<HTMLAnchorElement>('.pager a.primary').getAttribute('href')).toBe('#/team');
    expect(rig.root.querySelector('#done-reading')).toBeNull();
  });
});
