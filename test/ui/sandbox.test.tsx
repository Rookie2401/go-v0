// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import { App, AppRoutes, Shell } from '../../src/ui/App';
import { AppProvider } from '../../src/ui/context';
import { Onboarding } from '../../src/ui/Onboarding';
import {
  forgetAzure, getPref, recallActiveUser, recallAzure, recallChosenCourse, rememberActiveUser, rememberAzure, rememberChosenCourse, resetPrefsForTests, setPref,
} from '../../src/ui/prefs';
import { activeSandbox, normalAppHref, parseSandboxName, resolveDbName, sandboxDbName, sandboxProblem, scopedKey } from '../../src/ui/sandbox';
import { fallbackKey } from '../../src/ui/testimony/draft';
import { SITTING_GAP_MS, resetSittingsForTests, sittingSession, touchSitting } from '../../src/ui/sitting';
import { click, flush, makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';

/**
 * Sandbox mode (`?sandbox=<name>`): a separate database and a namespaced localStorage, a persistent banner, and never any
 * effect on the normal library. Acceptance and import tests in the browser run here with synthetic material.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const go = (search: string, hash = '') => window.history.replaceState({}, '', `/${search}${hash}`);
const keys = () => Object.keys(localStorage).sort();

let mounted: Mounted | undefined;
beforeEach(() => { go(''); localStorage.clear(); resetPrefsForTests(); resetSittingsForTests(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; go(''); localStorage.clear(); resetPrefsForTests(); resetSittingsForTests(); });

describe('the sandbox name', () => {
  it('is read from location.search: letters, digits and dashes only; never active without the parameter', () => {
    expect(activeSandbox()).toBeUndefined();
    go('?sandbox=import-test-2');
    expect(activeSandbox()).toBe('import-test-2');
    for (const bad of ['', 'a b', 'a/b', 'a_b', '..', 'é', 'a.b']) {
      expect(parseSandboxName(`?sandbox=${encodeURIComponent(bad)}`), JSON.stringify(bad)).toBeUndefined();
    }
    expect(parseSandboxName('?other=1')).toBeUndefined();
    expect(parseSandboxName('?x=1&sandbox=Abc-9')).toBe('Abc-9');
  });

  it('a present but invalid name is a problem to report, never a silent fallback to the normal library', () => {
    expect(sandboxProblem('')).toBeUndefined();
    expect(sandboxProblem('?sandbox=ok-1')).toBeUndefined();
    expect(sandboxProblem('?sandbox=bad%20name')).toContain('not valid');
    expect(sandboxProblem('?sandbox=')).toContain('not valid');
  });

  it('names the database go-v0-sandbox-<name> and namespaces keys; without the parameter both are untouched', () => {
    expect(sandboxDbName('abc')).toBe('go-v0-sandbox-abc');
    expect(resolveDbName()).toBeUndefined(); // the normal database (default name go-v0)
    expect(resolveDbName('custom')).toBe('custom');
    expect(scopedKey('go-v0:prefs')).toBe('go-v0:prefs');
    go('?sandbox=abc');
    expect(resolveDbName('custom')).toBe('go-v0-sandbox-abc'); // the sandbox always wins
    expect(scopedKey('go-v0:prefs')).toBe('sandbox:abc:go-v0:prefs');
  });

  it('the link back is the same URL without the parameter (other parameters and the hash are kept)', () => {
    go('?sandbox=abc&keep=1', '#/read');
    expect(normalAppHref()).toBe('/?keep=1#/read');
    go('?sandbox=abc', '#/settings');
    expect(normalAppHref()).toBe('/#/settings');
  });
});

describe('every localStorage key the app uses is namespaced, and the two worlds never touch', () => {
  const writeEverything = () => {
    setPref('highlight', 'strong'); setPref('preview', true); // prefs
    rememberActiveUser('u-sandbox'); rememberChosenCourse('honduras-es'); // active user, chosen course
    rememberAzure({ key: 'k', region: 'r' }); // a remembered speech key
    touchSitting('u-sandbox', 'ses-sandbox'); // the sitting
    localStorage.setItem(fallbackKey({ userId: 'u-sandbox', lang: 'es' }), '{"text":"draft"}'); // a testimony draft's fallback copy
  };

  it('in a sandbox: all of them live under "sandbox:<name>:", and nothing is written under a normal key', () => {
    go('?sandbox=acc-1');
    writeEverything();
    expect(keys()).toEqual([
      'sandbox:acc-1:go-v0:active-user', 'sandbox:acc-1:go-v0:chosen-course', 'sandbox:acc-1:go-v0:draft-copy:u-sandbox:es', 'sandbox:acc-1:go-v0:prefs',
      'sandbox:acc-1:go-v0:sitting:u-sandbox', 'sandbox:acc-1:go-v0:speech-azure',
    ]);
    expect(keys().every((k) => k.startsWith('sandbox:acc-1:'))).toBe(true);
    // and they are readable back inside the sandbox
    expect(getPref('highlight')).toBe('strong');
    expect(recallActiveUser()).toBe('u-sandbox');
    expect(recallChosenCourse()).toBe('honduras-es');
    expect(recallAzure()).toEqual({ key: 'k', region: 'r' });
    expect(sittingSession('u-sandbox')).toBe('ses-sandbox');
  });

  it('no cross-talk: the normal app does not see sandbox data, the sandbox does not see normal data, and neither overwrites the other', () => {
    // the learner's own data
    setPref('highlight', 'off'); rememberActiveUser('u-real'); rememberChosenCourse('thailand-th'); touchSitting('u-real', 'ses-real');
    const normal = keys();
    expect(normal.every((k) => k.startsWith('go-v0:'))).toBe(true);
    const snapshot = Object.fromEntries(normal.map((k) => [k, localStorage.getItem(k)]));

    go('?sandbox=acc-1');
    resetPrefsForTests(); // forget the cached prefs: this page is another namespace
    expect(getPref('highlight')).toBe('subtle'); // the default, not the learner's 'off'
    expect(recallActiveUser()).toBeUndefined();
    expect(recallChosenCourse()).toBeUndefined();
    expect(sittingSession('u-real')).not.toBe('ses-real'); // a fresh sitting, not the learner's
    writeEverything();
    forgetAzure(); // removing the sandbox's key...
    // ...and the sandbox's writes left every normal key exactly as it was
    for (const [k, v] of Object.entries(snapshot)) expect(localStorage.getItem(k), k).toBe(v);

    go(''); // back in the normal app
    resetPrefsForTests();
    // (resetPrefsForTests clears the CURRENT namespace's prefs key: rewrite and re-check the other side)
    setPref('highlight', 'off');
    expect(getPref('highlight')).toBe('off');
    expect(recallActiveUser()).toBe('u-real');
    expect(recallChosenCourse()).toBe('thailand-th');
    expect(recallAzure()).toBeUndefined(); // the sandbox's speech key is not the learner's
    expect(sittingSession('u-real')).toBe('ses-real');
    // and two sandboxes do not see each other either
    go('?sandbox=other');
    expect(recallActiveUser()).toBeUndefined();
  });

  it('a stale in-memory sitting is never shared between namespaces when localStorage is unreadable', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      const normal = sittingSession('u1', Date.now());
      go('?sandbox=acc-1');
      const inSandbox = sittingSession('u1', Date.now());
      expect(inSandbox).not.toBe(normal);
      expect(sittingSession('u1', Date.now() + SITTING_GAP_MS - 1)).toBe(inSandbox);
    } finally { Object.defineProperty(window, 'localStorage', real); }
  });
});

describe('bootstrap opens the sandbox database', () => {
  const dbNames = async () => (await indexedDB.databases()).map((d) => d.name);
  const wipe = async () => { for (const n of await dbNames()) if (n) await new Promise<void>((r) => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = () => r(); }); };
  beforeEach(wipe);
  afterEach(wipe);

  it('with ?sandbox=<name>: database go-v0-sandbox-<name>, and the normal database is never created', async () => {
    go('?sandbox=acc-1');
    const r = await bootstrap({ courseId: 'honduras-es', skipCorpus: true, speechProxy: false });
    expect(await dbNames()).toEqual(['go-v0-sandbox-acc-1']);
    expect(await r.services.store.courses.count()).toBeGreaterThan(0); // it works: seeded like any other
    expect(keys().every((k) => k.startsWith('sandbox:acc-1:'))).toBe(true); // the first learner's team choice went to the sandbox's keys
    expect(recallChosenCourse()).toBe('honduras-es');
    go('');
    expect(recallChosenCourse()).toBeUndefined();
  });

  it('even an explicit dbName cannot send a sandbox page to the normal library', async () => {
    go('?sandbox=acc-1');
    await bootstrap({ dbName: 'go-v0', courseId: 'honduras-es', skipCorpus: true, speechProxy: false });
    expect(await dbNames()).toEqual(['go-v0-sandbox-acc-1']);
  });

  it('without the parameter: the normal database, exactly as before', async () => {
    await bootstrap({ courseId: 'honduras-es', skipCorpus: true, speechProxy: false });
    expect(await dbNames()).toEqual(['go-v0']);
    expect(keys().every((k) => k.startsWith('go-v0:'))).toBe(true);
  });

  it('an invalid name refuses to start (and opens nothing) instead of using the normal library', async () => {
    go('?sandbox=bad%20name');
    await expect(bootstrap({ courseId: 'honduras-es', skipCorpus: true, speechProxy: false })).rejects.toThrow(/not valid/);
    expect(await dbNames()).toEqual([]);
    expect(keys()).toEqual([]);
  });

  it('two sandboxes are two databases', async () => {
    go('?sandbox=one'); await bootstrap({ courseId: 'honduras-es', skipCorpus: true, speechProxy: false });
    go('?sandbox=two'); await bootstrap({ courseId: 'honduras-es', skipCorpus: true, speechProxy: false });
    expect((await dbNames()).sort()).toEqual(['go-v0-sandbox-one', 'go-v0-sandbox-two']);
  });
});

describe('the banner', () => {
  const app = () => <Shell><AppRoutes /></Shell>;
  const TEXT = 'Sandbox “acc-1” — separate test data, not your library';

  it('says what this is and links to the normal app, on every screen', async () => {
    go('?sandbox=acc-1');
    const h = await makeHarness();
    for (const route of ['/', '/read', '/scripture', '/testimony', '/settings', '/vocabulary', '/read/text:es:missing']) {
      mounted = await h.mount(app(), { router: route });
      const banners = qa(mounted.container, '[data-testid="sandbox-banner"]');
      expect(banners, route).toHaveLength(1);
      expect(banners[0].textContent).toContain(TEXT);
      const link = q<HTMLAnchorElement>(banners[0], 'a')!;
      expect(link.getAttribute('href')).toBe('/'); // the same URL without the parameter
      expect(link.textContent).toBe('Open the normal app');
      await mounted.unmount(); mounted = undefined;
    }
  });

  it('is also on the first-run screen, before any learner exists', async () => {
    go('?sandbox=acc-1');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Onboarding store={createMemoryStore()} onChosen={() => undefined} />); });
    expect(q(container, '[data-testid="sandbox-banner"]')!.textContent).toContain(TEXT);
    await act(async () => root.unmount()); container.remove();
  });

  it('never appears without the parameter (and not for an invalid one)', async () => {
    const h = await makeHarness();
    mounted = await h.mount(app(), { router: '/' });
    expect(q(mounted.container, '[data-testid="sandbox-banner"]')).toBeNull();
    await mounted.unmount();
    go('?sandbox=bad%20name');
    mounted = await h.mount(app(), { router: '/' });
    expect(q(mounted.container, '[data-testid="sandbox-banner"]')).toBeNull();
  });

  it('survives in-app navigation: the HashRouter leaves the search part alone, so the sandbox stays on', async () => {
    go('?sandbox=acc-1', '#/');
    const h = await makeHarness();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const user = (await h.store.users.get('u1'))!;
    await act(async () => {
      root.render(<AppProvider services={h.services} user={user} course={(await h.store.courses.get(user.courseId))!} session="ses-nav"><App /></AppProvider>);
    });
    await flush();
    await click(qa<HTMLAnchorElement>(container, 'a').find((a) => a.textContent === 'Settings')!);
    expect(window.location.hash).toBe('#/settings');
    expect(window.location.search).toBe('?sandbox=acc-1');
    expect(q(container, '[data-testid="sandbox-banner"]')).not.toBeNull();
    // the link back follows the learner to the page they are on (the router's pushState fires no event, so it refreshes on use)
    const stop = (e: Event) => e.preventDefault(); // jsdom cannot navigate away
    document.body.addEventListener('click', stop);
    const link = q<HTMLAnchorElement>(container, '[data-testid="sandbox-banner"] a')!;
    await click(link);
    document.body.removeEventListener('click', stop);
    expect(link.getAttribute('href')).toBe('/#/settings');
    await act(async () => root.unmount()); container.remove();
  });

  it('its preferences are the sandbox\'s own (turning preview on in a sandbox does not turn it on for the learner)', async () => {
    go('?sandbox=acc-1');
    setPref('preview', true);
    expect(localStorage.getItem('go-v0:prefs')).toBeNull();
    go(''); resetPrefsForTests();
    expect(getPref('preview')).toBe(false);
  });
});
