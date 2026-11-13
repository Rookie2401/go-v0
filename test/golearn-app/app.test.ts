// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS, HOME_ID, ALIASES, backOf, brandMarkUrl, computeCompletion, setupComplete } from '../../packages/golearn-extension/app/app';
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

  it('renders every screen with ONE heading (its title) and no error, under a slim top bar with the brand and the two places, Languages and Settings (2026-11-11)', async () => {
    const rig = await makeRig();
    for (const screen of SCREENS) {
      await rig.go(screen.id);
      expect(rig.app.current()).toBe(screen.id);
      expect(window.location.hash).toBe(`#/${screen.id}`);
      expect(rig.root.querySelectorAll('#screen h1'), screen.id).toHaveLength(1);
      expect(rig.q('#screen h1').textContent).toBe(screen.title);
      expect(rig.q('#page-title').tagName, screen.id).toBe('H1'); // the page's title is its heading: the bar does not say it again
      expect(rig.q('#screen .body').children.length, screen.id).toBeGreaterThan(0);
      expect(rig.text(), screen.id).not.toMatch(/could not be shown/);
      expect(rig.q('.topbar .brand').textContent, screen.id).toBe('GoLearn');
      expect(rig.root.querySelector('.topbar #page-title, .topbar .page-title'), screen.id).toBeNull();
      // the two places, named in words, on every page; the one the page belongs to is marked
      const languages = rig.q<HTMLAnchorElement>('#languages-link');
      const settings = rig.q<HTMLAnchorElement>('#settings-link');
      expect([languages.getAttribute('href'), languages.textContent], screen.id).toEqual(['#/languages', 'Languages']);
      expect([settings.getAttribute('href'), settings.textContent], screen.id).toEqual(['#/settings', 'Settings']);
      expect(languages.getAttribute('aria-current'), screen.id).toBe(screen.id === HOME_ID ? 'page' : null);
      expect(settings.getAttribute('aria-current'), screen.id).toBe(screen.group === 'settings' || screen.group === 'advanced' ? 'page' : null);
      expect(rig.root.querySelector('#status-link'), screen.id).toBeNull(); // the Status page is gone
    }
    await rig.go('share');
    expect(rig.q('#settings-link').getAttribute('aria-current')).toBe('page'); // reached from Settings
  });

  it('there is no left rail any more', async () => {
    const rig = await makeRig();
    expect(rig.root.querySelector('.rail, #advanced-nav, .steps')).toBeNull();
  });

  it('setup is two pages, Sign in then Languages; Settings holds the advanced screens', () => {
    expect(SCREENS.map((s) => s.id)).toEqual(['signin', 'languages', 'settings', 'audio', 'privacy', 'sync', 'diagnostics', 'reader']);
    expect(SCREENS.filter((s) => s.group === 'setup').map((s) => s.id)).toEqual(['signin', 'languages']);
    expect(SCREENS.filter((s) => s.group === 'advanced').map((s) => s.title)).toEqual(['Audio', 'Privacy and data', 'Sync', 'Diagnostics and updates', 'How GoLearn reads pages']);
  });

  it('Settings holds the account and every other page, grouped by what a person wants to do', async () => {
    const rig = await makeRig({ startRoute: 'languages' });
    expect(rig.q<HTMLAnchorElement>('#settings-link').getAttribute('href')).toBe('#/settings');
    window.location.hash = rig.q<HTMLAnchorElement>('#settings-link').getAttribute('href')!;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await until(() => rig.app.current() === 'settings');
    await rig.app.ready();
    expect(rig.q('#screen h1').textContent).toBe('Settings');
    expect(rig.q('#settings-account h2').textContent).toBe('Account');
    expect([...rig.root.querySelectorAll('#settings-reading h2, #settings-advanced h2')].map((x) => x.textContent)).toEqual(['Reading', 'Advanced']);
    expect([...rig.root.querySelectorAll('#reading-links li[data-route]')].map((li) => li.getAttribute('data-route'))).toEqual(['audio', 'privacy', 'share']);
    expect([...rig.root.querySelectorAll('#advanced-links li[data-route]')].map((li) => li.getAttribute('data-route'))).toEqual(['sync', 'reader', 'diagnostics']);
    // each row is one link: a name and one line of what is there
    for (const a of rig.root.querySelectorAll<HTMLAnchorElement>('.settings-links a')) {
      expect(a.querySelector('.nav-title')!.textContent!.length).toBeGreaterThan(2);
      expect(a.querySelector('.nav-about')!.textContent!.length).toBeGreaterThan(10);
    }
    expect([...rig.root.querySelectorAll<HTMLAnchorElement>('#settings-foot a')].map((a) => a.getAttribute('href'))).toEqual(['#/help', '#/terms', '#/privacy']);
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
    expect(rig.q('#screen h1').textContent).toBe('Languages');
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
    expect(rig.q('#screen h1').textContent).toBe('Privacy and data');
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

  it('the Languages page is the home: it says where the learner stands, and the old Status page leads to it (2026-11-11)', async () => {
    const rig = await makeRig({ extension: true });
    // a language chosen with its pack installed (the real languages page does both, tested separately); here the state is set
    await rig.deps.area.set({ [KEYS.choice]: CHOICE });
    await rig.deps.area.set({ [KEYS.app]: { visited: [], tutorial: 'pending', tutorialStep: 0, packs: { 'pack:sq': { version: '9', ok: true, verifiedAt: '2026-10-08T00:00:00Z' } }, readerAck: false } });
    await rig.go('home');
    expect(rig.app.current()).toBe('languages');
    expect(window.location.hash).toBe('#/languages');
    await until(() => rig.root.querySelector('#next-note'));
    // what the learner reads in, once, at the top; then the account line; then the one way to GoReview
    expect(rig.q('#next-note .lede').textContent).toContain('Albanian is ready');
    expect(rig.q('#account-line').textContent).toContain('On this device only');
    expect(rig.q('#account-line').getAttribute('data-state')).toBe('device');
    expect(rig.q<HTMLAnchorElement>('#account-line a').getAttribute('href')).toBe('#/signin');
    expect(rig.q<HTMLAnchorElement>('#open-review').getAttribute('href')).toBe('../review/index.html');
    expect(rig.q('#to-review').hidden).toBe(false);
    expect(rig.q<HTMLAnchorElement>('#my-vocabulary').getAttribute('href')).toBe('../review/index.html#/vocabulary'); // GoReview's list of the learner's words
    expect(rig.q('#open-review').classList.contains('primary')).toBe(false); // a way out to another app is not this page's main action
    // the downloaded language stands under Your languages, the rest under Add a language
    expect(rig.q('#my-languages h2').textContent).toBe('Your languages');
    expect(rig.q('#more-languages h2').textContent).toBe('Add a language');
    const order = [...rig.q('#language-cards').children].map((li) => li.id || li.getAttribute('data-language'));
    expect(order.slice(0, 3)).toEqual(['my-languages', 'sq', 'more-languages']);
    expect(rig.root.querySelector('a[href="#/tutorial"], a[href="#/account"], a[href="#/language"], a[href="#/pack"], a[href="#/welcome"], a[href="#/home"]')).toBeNull();
    await rig.go('diagnostics');
    const done = rig.q<HTMLButtonElement>('#done-reading');
    expect(done.textContent).toBe('Done — back to reading');
    expect(done.classList.contains('bar')).toBe(true); // a bar across the screen, its words centred (the owner, 2026-10-28)
    expect(done.classList.contains('primary')).toBe(false); // the quiet kind: a page's own action is the one filled button on it
    done.click();
    expect(rig.closed.count).toBe(1);
    expect(rig.q('.finish-note').textContent).toContain('close this tab');
    for (const id of ['signin', 'languages', 'settings', 'audio', 'sync', 'privacy', 'reader']) {
      await rig.go(id);
      expect(rig.root.querySelector('#done-reading'), id).not.toBeNull();
    }
    await flush();
  });

  it('a first run says what to do first; “Review your words” waits until there is a language', async () => {
    const rig = await makeRig({ extension: true, startRoute: 'languages' });
    await until(() => rig.root.querySelector('#first-note'));
    expect(rig.q('#first-note .lede').textContent).toBe('Choose the language you want to read.');
    expect(rig.root.querySelector('#next-note')).toBeNull();
    expect(rig.q('#to-review').hidden).toBe(true);
    expect(rig.q('#my-languages').hidden).toBe(true);
    expect(rig.q('#more-languages h2').textContent).toBe('Choose a language');
  });

  it('a pack that did not verify is not “ready”: the page says so on its row and offers Retry', async () => {
    const rig = await makeRig({ extension: true });
    await rig.deps.area.set({ [KEYS.choice]: CHOICE });
    await rig.deps.area.set({ [KEYS.app]: { visited: [], tutorial: 'pending', tutorialStep: 0, packs: { 'pack:sq': { version: '9', ok: false, verifiedAt: '2026-10-08T00:00:00Z' } }, readerAck: false } });
    await rig.go('languages');
    await until(() => rig.root.querySelector('[data-language="sq"] .mine'));
    expect(rig.root.querySelector('#next-note')).toBeNull();
    const state = rig.q('[data-language="sq"] .dl-state');
    expect(state.textContent).toBe('Downloaded · did not verify');
    expect(state.classList.contains('sr')).toBe(false); // a problem is said in sight
    expect(rig.root.querySelector('[data-language="sq"] [data-action="retry"]')).not.toBeNull();
    expect(setupComplete(await computeCompletion(rig.app.ctx))).toBe(false);
  });

  it('there is no pager between screens: no "next" or "previous" setup links', async () => {
    const rig = await makeRig();
    for (const id of ['signin', 'languages', 'settings', 'sync', 'reader']) {
      await rig.go(id);
      expect(rig.root.querySelector('.pager a.primary'), id).toBeNull();
    }
    expect(rig.root.querySelector('.pager a[href="#/pack"], .pager a[href="#/account"], .pager a[href="#/tutorial"]')).toBeNull();
  });

  it('a page under Settings has its way back above its heading; the two places of the top bar have none', async () => {
    const rig = await makeRig();
    for (const id of ['audio', 'privacy', 'sync', 'diagnostics', 'reader', 'share', 'terms']) {
      await rig.go(id);
      const back = rig.q<HTMLAnchorElement>('.crumb a');
      expect([back.getAttribute('href'), back.textContent], id).toEqual(['#/settings', '‹ Settings']);
      expect(rig.q('.crumb').nextElementSibling?.tagName, id).toBe('H1');
    }
    await rig.go('help');
    expect(rig.q<HTMLAnchorElement>('.crumb a').getAttribute('href')).toBe('#/languages');
    for (const id of ['languages', 'settings', 'signin']) {
      await rig.go(id);
      expect(rig.root.querySelector('.crumb'), id).toBeNull();
    }
    expect(backOf(SCREENS.find((x) => x.id === 'settings')!)).toBeUndefined();
    // the foot holds the way back to reading and nothing else
    await rig.go('sync');
    expect(rig.root.querySelectorAll('.pager a')).toHaveLength(0);
  });

  it('the Languages page says "Synced to your account" once an account is signed in', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.go('settings');
    await rig.go('languages');
    expect(rig.q('#account-line').textContent).toContain('Synced to your account');
    expect(rig.q('#account-line').getAttribute('data-state')).toBe('synced');
    expect(rig.q<HTMLAnchorElement>('#account-line a').getAttribute('href')).toBe('#/settings');
  });

  it('no screen of the setup application mentions a team, a mission team or a leader', async () => {
    const rig = await makeRig({ extension: true });
    for (const screen of SCREENS) {
      await rig.go(screen.id);
      expect(rig.text(), screen.id).not.toMatch(/team|leader/i);
      expect(rig.q('.topbar').textContent, screen.id).not.toMatch(/team|leader/i);
    }
  });
});
