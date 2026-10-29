// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS, HOME, ALIASES, brandMarkUrl, computeCompletion, setupComplete } from '../../packages/golearn-extension/app/app';
import { KEYS } from '../../packages/golearn-extension/app/state';
import { downloadLanguage, destroyRigs, flush, makeRig, signIn, until } from './helpers';

afterEach(() => destroyRigs());

const CHOICE = { enrolmentId: 'loc-1', languageId: 'sq', varietyId: 'sq-standard', packId: 'pack:sq' };

describe('the router and the shell', () => {
  it('draws the brand mark from app/icons/go-logo.png resolved against the page, never import.meta.url (undefined in the extension’s classic-script build, where the setup page opened blank on 2026-10-28)', async () => {
    const rig = await makeRig();
    const mask = rig.q<HTMLElement>('.topbar .go-brand-mark').style.getPropertyValue('--go-brand-mask');
    expect(mask).toMatch(/^url\("[^"]*\/icons\/go-logo\.png"\)$/);
    expect(mask).not.toContain('undefined');
    expect(mask).not.toContain('shared-brand');
    expect(brandMarkUrl(document)).toBe(new URL('icons/go-logo.png', document.baseURI).href);
    expect(brandMarkUrl({ baseURI: '' } as Document)).toBe('./icons/go-logo.png'); // no base to resolve against: the relative path, never a throw
  });

  it('renders every screen with its heading and no error, under a slim top bar with the brand, the page title, Status and the cog', async () => {
    const rig = await makeRig();
    for (const screen of [HOME, ...SCREENS]) {
      await rig.go(screen.id);
      expect(rig.app.current()).toBe(screen.id);
      expect(window.location.hash).toBe(`#/${screen.id}`);
      expect(rig.q('#screen h1').textContent).toBe(screen.title);
      expect(rig.q('#screen .body').children.length, screen.id).toBeGreaterThan(0);
      expect(rig.text(), screen.id).not.toMatch(/could not be shown/);
      expect(rig.q('.topbar .brand').textContent, screen.id).toBe('GoLearn');
      expect(rig.q('#page-title').textContent, screen.id).toBe(screen.title);
      // the cog at the top right of every page
      const cog = rig.q<HTMLAnchorElement>('#settings-link');
      expect(cog.getAttribute('href'), screen.id).toBe('#/settings');
      expect(cog.getAttribute('aria-label'), screen.id).toBe('Settings');
      expect(rig.q<HTMLAnchorElement>('#status-link').getAttribute('href'), screen.id).toBe('#/home');
    }
    await rig.go('share');
    expect(rig.q('#settings-link')).toBeTruthy();
  });

  it('there is no left rail any more', async () => {
    const rig = await makeRig();
    expect(rig.root.querySelector('.rail, #advanced-nav, .steps')).toBeNull();
  });

  it('setup is two pages, Sign in then Languages; Settings holds the advanced screens', () => {
    expect(SCREENS.map((s) => s.id)).toEqual(['signin', 'languages', 'settings', 'sync', 'privacy', 'diagnostics', 'reader']);
    expect(SCREENS.filter((s) => s.group === 'setup').map((s) => s.id)).toEqual(['signin', 'languages']);
    expect(SCREENS.filter((s) => s.group === 'advanced').map((s) => s.title)).toEqual(['Sync', 'Privacy', 'Diagnostics and updates', 'How GoLearn reads pages']);
  });

  it('the cog opens Settings, which lists the account and the advanced screens', async () => {
    const rig = await makeRig({ startRoute: 'languages' });
    expect(rig.q<HTMLAnchorElement>('#settings-link').getAttribute('href')).toBe('#/settings');
    window.location.hash = rig.q<HTMLAnchorElement>('#settings-link').getAttribute('href')!;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await until(() => rig.app.current() === 'settings');
    await rig.app.ready();
    expect(rig.q('#screen h1').textContent).toBe('Settings');
    expect(rig.q('#settings-account h2').textContent).toBe('Account');
    expect([...rig.root.querySelectorAll('#advanced-links li[data-route]')].map((li) => li.getAttribute('data-route'))).toEqual(['sync', 'privacy', 'diagnostics', 'reader']);
    expect(rig.q('#settings-link').getAttribute('aria-current')).toBe('page');
  });

  it.each(Object.keys(ALIASES))('an old link to #/%s lands on the Languages page', async (old) => {
    const rig = await makeRig({ startRoute: old });
    expect(rig.app.current()).toBe('languages');
    expect(window.location.hash).toBe('#/languages');
  });

  it('an old link followed while the app is open is rewritten, and rig.go on an old name shows the Languages page', async () => {
    const rig = await makeRig({ startRoute: 'privacy' });
    window.location.hash = '#/pack';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await until(() => rig.app.current() === 'languages');
    await rig.app.ready();
    expect(window.location.hash).toBe('#/languages');
    await rig.go('tutorial');
    expect(rig.app.current()).toBe('languages');
    expect(rig.q('#screen h1').textContent).toBe('Choose your languages');
    await rig.go('welcome');
    expect(rig.app.current()).toBe('languages');
  });

  it('a first run (no language chosen, nobody signed in) opens on Sign in, and follows a hash change', async () => {
    const rig = await makeRig();
    expect(rig.app.current()).toBe('signin');
    expect(window.location.hash).toBe('#/signin');
    window.location.hash = '#/privacy';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await until(() => rig.app.current() === 'privacy');
    await rig.app.ready();
    expect(rig.q('#screen h1').textContent).toBe('Privacy');
  });

  it('a later visit opens on the Languages page: with a language chosen on this device, or with an account', async () => {
    const chosen = await makeRig();
    expect(chosen.app.current()).toBe('signin');
    await chosen.deps.area.set({ [KEYS.choice]: CHOICE });
    await chosen.go('nonsense');
    expect(chosen.app.current()).toBe('languages');
    const signed = await makeRig();
    await signIn(signed);
    await signed.go('nonsense');
    expect(signed.app.current()).toBe('languages');
  });

  it('the sign-in page stays reachable once a language is chosen', async () => {
    const rig = await makeRig();
    await rig.deps.area.set({ [KEYS.choice]: CHOICE });
    await rig.go('signin');
    expect(rig.app.current()).toBe('signin');
    expect(rig.q('#continue-without-account')).toBeTruthy();
  });

  it('an unknown hash falls back to the default route instead of a blank page', async () => {
    const rig = await makeRig({ startRoute: 'nonsense' });
    expect(rig.app.current()).toBe('signin');
  });

  it('computes completion from what is true, not from what was clicked: the languages are done once one is downloaded and its pack installed', async () => {
    const rig = await makeRig();
    expect((await computeCompletion(rig.app.ctx)).languages).toBe(false);
    await signIn(rig);
    expect((await computeCompletion(rig.app.ctx)).languages).toBe(false); // signing in does not download a language
    await downloadLanguage(rig, 'sq');
    await until(async () => (await computeCompletion(rig.app.ctx)).languages);
    expect(setupComplete(await computeCompletion(rig.app.ctx))).toBe(true);
  });

  it('shows the compact status home once setup is complete, and Done — back to reading on every screen', async () => {
    const rig = await makeRig({ extension: true });
    // a language chosen with its pack installed (the real languages page does both, tested separately); here the state is set
    await rig.deps.area.set({ [KEYS.choice]: CHOICE });
    await rig.deps.area.set({ [KEYS.app]: { visited: [], tutorial: 'pending', tutorialStep: 0, packs: { 'pack:sq': { version: '9', ok: true, verifiedAt: '2026-10-08T00:00:00Z' } }, readerAck: false } });
    await rig.go('home');
    expect(rig.q('#status-list').children.length).toBe(2);
    expect(rig.text()).toContain('GoLearn is set up');
    // without an account the progress is on this device, and signing in is offered any time (on the sign-in page)
    expect(rig.q('#progress-mode').textContent).toContain('On this device only');
    expect(rig.q('#progress-mode').getAttribute('data-state')).toBe('device');
    expect(rig.q<HTMLAnchorElement>('#keep-progress').getAttribute('href')).toBe('#/signin');
    expect(rig.q<HTMLAnchorElement>('#practise').getAttribute('href')).toBe('../review/index.html');
    expect(rig.q('#status-list li[data-route="languages"]').textContent).toContain('Albanian');
    expect(rig.root.querySelector('a[href="#/tutorial"], a[href="#/account"], a[href="#/language"], a[href="#/pack"], a[href="#/welcome"]')).toBeNull();
    await rig.go('diagnostics');
    const done = rig.q<HTMLButtonElement>('#done-reading');
    expect(done.textContent).toBe('Done — back to reading');
    done.click();
    expect(rig.closed.count).toBe(1);
    expect(rig.q('.finish-note').textContent).toContain('close this tab');
    for (const id of ['signin', 'languages', 'settings', 'home', 'sync', 'privacy', 'reader']) {
      await rig.go(id);
      expect(rig.root.querySelector('#done-reading'), id).not.toBeNull();
    }
    await flush();
  });

  it('a pack that did not verify does not complete setup', async () => {
    const rig = await makeRig({ extension: true });
    await rig.deps.area.set({ [KEYS.choice]: CHOICE });
    await rig.deps.area.set({ [KEYS.app]: { visited: [], tutorial: 'pending', tutorialStep: 0, packs: { 'pack:sq': { version: '9', ok: false, verifiedAt: '2026-10-08T00:00:00Z' } }, readerAck: false } });
    await rig.go('home');
    expect(rig.text()).toContain('Setup is not finished');
    expect(rig.text()).toContain('Languages');
  });

  it('there is no pager between screens: no "next" or "previous" setup links', async () => {
    const rig = await makeRig();
    for (const id of ['signin', 'languages', 'settings', 'sync', 'reader']) {
      await rig.go(id);
      expect(rig.root.querySelector('.pager a.primary'), id).toBeNull();
    }
    expect(rig.root.querySelector('.pager a[href="#/pack"], .pager a[href="#/account"], .pager a[href="#/tutorial"]')).toBeNull();
  });

  it('the advanced screens lead back to Settings, Settings and Status back to the Languages page', async () => {
    const rig = await makeRig();
    await rig.go('sync');
    expect(rig.q<HTMLAnchorElement>('.pager a.btn').getAttribute('href')).toBe('#/settings');
    await rig.go('settings');
    expect(rig.q<HTMLAnchorElement>('.pager a.btn').getAttribute('href')).toBe('#/languages');
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
      expect(rig.q('.topbar').textContent, screen.id).not.toMatch(/team|leader/i);
    }
  });
});
