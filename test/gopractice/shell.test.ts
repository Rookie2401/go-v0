// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { parseHash } from '../../packages/gopractice/app';
import { KEYS } from '../../packages/gopractice/state';
import { DEFAULT_SERVICE_URL, loadConfig, resolveServiceUrl, validateServiceUrl, validateSpeechProxyBase } from '../../packages/gopractice/config';
import { cardAdded, defaultService, destroyRigs, flush, ids, makeRig, seed, type, until } from './helpers';

afterEach(() => destroyRigs());

describe('the hash router', () => {
  it('parses routes and sub-routes and refuses unknown ones', () => {
    expect(parseHash('#/review')).toEqual({ id: 'review', params: [], path: 'review' });
    expect(parseHash('#/review/session')).toEqual({ id: 'review', params: ['session'], path: 'review/session' });
    expect(parseHash('#/review/history/card%3Ax')).toMatchObject({ id: 'review', params: ['history', 'card%3Ax'] });
    expect(parseHash('#/tell')?.id).toBe('tell');
    expect(parseHash('#/settings')?.id).toBe('settings');
    expect(parseHash('#/nowhere')).toBeUndefined();
    expect(parseHash('')).toBeUndefined();
  });

  it('sends a signed-out visitor to sign-in whatever the hash says, and shows no navigation', async () => {
    window.location.hash = '#/settings';
    const rig = await makeRig();
    expect(rig.app.current()).toBe('signin');
    expect(rig.q('main').getAttribute('data-route')).toBe('signin');
    expect(rig.root.querySelector('#settings-link')).toBeNull();
    expect(rig.q('#sync-indicator').textContent).toBe('Not signed in');
  });

  it('after sign-in the header has the Go logo, the account and Settings icons, and is the same on every screen (no language, no "← GoReview"; the logo is the way home)', async () => {
    const rig = await makeRig({ signedIn: true });
    expect(rig.app.current()).toBe('review');
    expect(rig.root.querySelector('.topnav')).toBeNull();
    expect([...rig.root.querySelectorAll('header a')].map((a) => a.getAttribute('aria-label'))).toEqual(['GoReview home', 'Account', 'Settings']);
    // the Go mark (the G and the globe) as a silhouette the accent colour fills, beside the name
    const mark = rig.q<HTMLElement>('header .go-brand-mark');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.style.getPropertyValue('--go-brand-mask')).toMatch(/go-logo\.png/);
    expect(rig.root.querySelector('header .go-brand img')).toBeNull();
    expect(rig.q('header .go-brand').textContent).toBe(''); // the mark alone: the launch screen showed GO over REVIEW
    expect(rig.root.querySelector('.go-brand-word')).toBeNull();
    expect(rig.q('header .go-brand').getAttribute('aria-label')).toBe('GoReview home');
    expect(rig.q('#home-language #language-name')).toBeTruthy(); // the language stands on the home, never in the top bar
    expect(rig.root.querySelector('header .language')).toBeNull();
    expect(rig.root.querySelector('#back-home')).toBeNull();
    expect(rig.q('header .go-brand').getAttribute('href')).toBe('#/review');
    const headerOf = (): string => rig.q('header').innerHTML;
    const homeHeader = headerOf();
    await rig.go('tell');
    expect(rig.q('main h1').textContent).toBe('GoTell');
    expect(rig.root.querySelector('#back-home, .crumb')).toBeNull();
    expect(rig.root.querySelector('header .language, header #language-name, header #language-select')).toBeNull();
    expect(headerOf()).toBe(homeHeader); // the top bar does not change between screens
    await rig.go('vocabulary');
    expect(rig.q('main h1').textContent).toBe('My Vocabulary');
    expect(rig.root.querySelector('#back-home, .crumb')).toBeNull();
    await rig.go('settings');
    expect(rig.q('main h1').textContent).toBe('Settings');
    expect(rig.root.querySelector('header .language')).toBeNull();
    expect(rig.root.querySelector('main a[href="#/review"]')).toBeNull(); // no "← GoReview" on the page either
    expect(rig.q('#settings-link').getAttribute('aria-current')).toBe('page');
    await rig.go('review');
    expect(rig.q('#home-language #language-name')).toBeTruthy(); // back on the home the language is there again
    window.location.hash = '#/review';
    await until(() => rig.app.current() === 'review', 'the hashchange');
  });
});

describe('the service address', () => {
  it('accepts https anywhere and http only on a loopback host; resolves config.json, else the development default (no learner override since 2026-10-28)', async () => {
    expect(validateServiceUrl('https://r.example.org/')).toEqual({ ok: true, url: 'https://r.example.org' });
    expect(validateServiceUrl('http://localhost:8790').ok).toBe(true);
    for (const bad of ['http://example.org', 'ftp://x.org', 'https://u:p@x.org', 'https://x.org/?a=1', '', 'not a url']) expect(validateServiceUrl(bad).ok, bad).toBe(false);
    expect(resolveServiceUrl({})).toBe(DEFAULT_SERVICE_URL);
    expect(resolveServiceUrl({ serviceUrl: 'https://r.example.org' })).toBe('https://r.example.org');
    expect(await loadConfig((async () => new Response('<!doctype html>')) as unknown as typeof fetch)).toEqual({});
  });

  it('accepts only an absolute secure or loopback speech proxy and loads the normalized endpoint', async () => {
    expect(validateSpeechProxyBase('https://speech.example.org/api/speech/')).toEqual({ ok: true, url: 'https://speech.example.org/api/speech' });
    expect(validateSpeechProxyBase('http://127.0.0.1:8790/api/speech').ok).toBe(true);
    for (const bad of ['/api/speech', 'chrome-extension://abc/api/speech', 'http://speech.example.org/api/speech', 'https://u:p@speech.example.org/api/speech', 'https://speech.example.org/api/speech?q=1']) {
      expect(validateSpeechProxyBase(bad).ok, bad).toBe(false);
    }
    const fetchConfig = (async () => new Response(JSON.stringify({ speechProxyBase: 'https://speech.example.org/api/speech/' }), { status: 200 })) as unknown as typeof fetch;
    await expect(loadConfig(fetchConfig)).resolves.toMatchObject({ speechProxyBase: 'https://speech.example.org/api/speech' });
    const badConfig = (async () => new Response(JSON.stringify({ speechProxyBase: '/api/speech' }), { status: 200 })) as unknown as typeof fetch;
    await expect(loadConfig(badConfig)).resolves.not.toHaveProperty('speechProxyBase');
  });

  it('accepts a Biblia link only as a relative page beside the app or an https address (the iPhone edition ships "./biblia/index.html")', async () => {
    const cfg = (j: unknown) => (async () => new Response(JSON.stringify(j), { status: 200 })) as unknown as typeof fetch;
    await expect(loadConfig(cfg({ bibliaUrl: './biblia/index.html' }))).resolves.toMatchObject({ bibliaUrl: './biblia/index.html' });
    await expect(loadConfig(cfg({ bibliaUrl: 'https://example.org/biblia/' }))).resolves.toMatchObject({ bibliaUrl: 'https://example.org/biblia/' });
    for (const bad of ['/biblia/index.html', 'http://example.org/biblia/', 'javascript:alert(1)', '../../x.html', 42]) {
      await expect(loadConfig(cfg({ bibliaUrl: bad })), String(bad)).resolves.not.toHaveProperty('bibliaUrl');
    }
  });
});

describe('sign-in', () => {
  it('signs in, keeps the token only in gopractice:session, and never stores the password', async () => {
    const rig = await makeRig();
    await rig.signIn();
    const all = await rig.area.get(null);
    const holders = Object.entries(all).filter(([, v]) => JSON.stringify(v).includes('tok-L1')).map(([k]) => k);
    expect(holders).toEqual([KEYS.session]);
    expect(JSON.stringify(all)).not.toContain('correct-horse-battery');
    expect(rig.root.querySelector('#signin-password')).toBeNull(); // the form is gone with the screen
    expect(rig.app.current()).toBe('review');
    expect(rig.q('#sync-indicator').textContent).toMatch(/^Online/);
  });

  it('says plainly when the password is wrong and signs in nothing', async () => {
    const rig = await makeRig();
    type(rig.q<HTMLInputElement>('#signin-email'), 'ana@example.org');
    type(rig.q<HTMLInputElement>('#signin-password'), 'nope');
    rig.q('#signin-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => { const t = rig.q('#signin-form .status').textContent; return !!t && t !== 'Signing in…'; }, 'an error'); // the form says 'Signing in…' at once (2026-10-28: no service-address check before it)
    expect(rig.q('#signin-form .status').textContent).toBe('That email and password were not accepted.');
    expect((await rig.area.get(KEYS.session))[KEYS.session]).toBeUndefined();
  });

  it('reports an unreachable service without losing the form', async () => {
    const service = defaultService();
    service.allDown = true;
    const rig = await makeRig({ service });
    type(rig.q<HTMLInputElement>('#signin-email'), 'ana@example.org');
    type(rig.q<HTMLInputElement>('#signin-password'), 'x');
    rig.q('#signin-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => { const t = rig.q('#signin-form .status').textContent; return !!t && t !== 'Signing in…'; }, 'an error'); // the form says 'Signing in…' at once (2026-10-28: no service-address check before it)
    expect(rig.q('#signin-form .status').textContent).toContain('Could not reach the service');
  });

  it('has no service-address field: the password goes to config.json\'s address and nowhere else, whatever an earlier GoReview stored (2026-10-28)', async () => {
    const rig = await makeRig();
    await rig.area.set({ 'gopractice:service': { baseUrl: 'https://other.example.org' } }); // the key the field wrote until 2026-10-28
    await rig.go('signin');
    expect(rig.root.querySelector('#svc-url')).toBeNull();
    expect(rig.root.textContent).not.toContain('Service address');
    expect(await rig.app.ctx.serviceUrl()).toBe('https://repository.example.org');
  });
});

describe('switching accounts', () => {
  it('forgets the cache of the account it replaces, shows nothing of its data, and keeps its unsent events', async () => {
    const service = defaultService();
    service.addAccount('ben@example.org', 'another-long-password', 'L2', [{ languageId: 'de' }]);
    const rig = await makeRig({ service, signedIn: true });
    const a = ids('L1', 'sq');
    await seed(rig, [cardAdded(a, 'zog', 'meaning-to-form', '2026-10-01T10:00:00.000Z')]);
    const ctx = rig.app.ctx;
    await ctx.record([cardAdded(a, 'mace', 'meaning-to-form', '2026-10-02T10:00:00.000Z')]); // waits in A's queue
    expect((await rig.area.get(KEYS.profile))[KEYS.profile]).toBeTruthy();
    service.netDown = true;

    await rig.go('signin');
    type(rig.q<HTMLInputElement>('#signin-email'), 'ben@example.org');
    type(rig.q<HTMLInputElement>('#signin-password'), 'another-long-password');
    rig.q('#signin-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await until(async () => (await ctx.session())?.learnerId === 'L2', 'the switch');
    await flush(6);

    const profile = (await rig.area.get(KEYS.profile))[KEYS.profile] as { learnerId: string };
    expect(profile.learnerId).toBe('L2');
    expect((await ctx.identity())?.languageId).toBe('de');
    expect(await ctx.events()).toEqual([]); // B sees none of A's log
    const keys = Object.keys(await rig.area.get(null));
    expect(keys.some((k) => k.startsWith('u:L1:queue:'))).toBe(true); // A's unsent event was not destroyed
    expect(keys.filter((k) => k.startsWith('gopractice:candidates:L1')).length).toBe(0);
  });
});
