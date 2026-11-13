/**
 * GoLearn Active, the privileged half: the switch needs the host permission the browser granted (never assumed), registers a dynamic
 * content script that excludes every refusing reader, tells open pages to start or stop, and turns itself off when the permission goes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { ACTIVE_KEY, ACTIVE_SCRIPT_ID, RESTART_WAIT_MS } from '../../packages/golearn-extension/src/background/active';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { ACTIVE_ORIGINS, type ActiveReply } from '../../packages/golearn-extension/src/protocol';
import { createChromeFake, PAGE_SENDER, type ChromeFake } from './chromeFake';
import { fakePacks } from './rig';

const CONTENT_SENDER = { id: 'test-ext-id', tab: { id: 7 }, url: 'https://example.test/page' };

let fake: ChromeFake;
let bg: ReturnType<typeof createBackground>;
beforeEach(() => {
  fake = createChromeFake();
  bg = createBackground(fake, { packs: fakePacks(), now: () => Date.parse('2026-10-31T09:00:00.000Z'), fetch: (async () => { throw new TypeError('no network in this test'); }) as typeof fetch });
  bg.register();
});

const page = (m: Record<string, unknown>) => fake.dispatch({ type: MSG.active, ...m }, PAGE_SENDER) as Promise<ActiveReply>;
const content = (m: Record<string, unknown>) => fake.dispatch({ type: MSG.active, ...m }, CONTENT_SENDER) as Promise<ActiveReply>;
const toTabs = () => fake.messagesToTabs.map((m) => m.message as { type: string; speak?: boolean });

describe('the switch and the permission', () => {
  it('is off by default, with nothing granted and nothing registered', async () => {
    const r = await page({ op: 'get' });
    expect(r).toMatchObject({ ok: true, settings: { active: false, speakOnClick: true }, granted: false, registered: false });
    expect(r.excluded).toBeGreaterThanOrEqual(9);
    expect(fake.registeredScripts).toEqual([]);
  });

  it('cannot be switched on before the browser granted the permission: it says so and registers nothing', async () => {
    const r = await page({ op: 'set', patch: { active: true } });
    expect(r).toMatchObject({ ok: false, error: 'permission', settings: { active: false }, granted: false, registered: false });
    expect(fake.registeredScripts).toEqual([]);
    expect(fake.permissionRequests).toEqual([]); // the worker never asks for it itself (only the popup can, inside a click)
    expect((await fake.local.get(ACTIVE_KEY))[ACTIVE_KEY]).toMatchObject({ active: false });
  });

  it('with the permission granted: registers the script (all frames, on load, every refusing reader excluded), starts the page in front, stores the switch', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    const r = await page({ op: 'set', patch: { active: true } });
    expect(r).toMatchObject({ ok: true, settings: { active: true, speakOnClick: true }, granted: true, registered: true });
    expect(fake.registeredScripts).toHaveLength(1);
    const s = fake.registeredScripts[0];
    expect(s).toMatchObject({ id: ACTIVE_SCRIPT_ID, js: ['content.js'], matches: [...ACTIVE_ORIGINS], runAt: 'document_idle', allFrames: true, persistAcrossSessions: true });
    expect(s.excludeMatches).toEqual(expect.arrayContaining(['*://read.amazon.com/*', '*://read.kobo.com/*', '*://*.readawrite.com/*', '*://*.pratilipi.com/*', '*://*.mebmarket.com/*']));
    expect(fake.injected.map((i) => i.target)).toEqual([{ tabId: 7, allFrames: true }]);
    expect(toTabs()).toEqual([{ type: MSG.activate, speak: true }]);
    expect((await fake.local.get(ACTIVE_KEY))[ACTIVE_KEY]).toEqual({ active: true, speakOnClick: true });
  });

  it('Speak on click can change while on (pages are told); switching off unregisters and tells every page', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await page({ op: 'set', patch: { active: true } });
    fake.messagesToTabs.length = 0;
    const r = await page({ op: 'set', patch: { speakOnClick: false } });
    expect(r.settings).toEqual({ active: true, speakOnClick: false });
    expect(toTabs()).toEqual([{ type: MSG.activate, speak: false }]);
    fake.messagesToTabs.length = 0;
    const off = await page({ op: 'set', patch: { active: false } });
    expect(off).toMatchObject({ ok: true, settings: { active: false, speakOnClick: false }, granted: true, registered: false });
    expect(fake.registeredScripts).toEqual([]);
    expect(toTabs()).toEqual([{ type: MSG.deactivate }]);
  });

  it('a content script may read the switches but not set them', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await page({ op: 'set', patch: { active: true } });
    const got = await content({ op: 'get' });
    expect(got).toMatchObject({ ok: true, settings: { active: true } });
    expect(JSON.stringify(got)).not.toMatch(/token|email|learnerId/);
    const denied = await content({ op: 'set', patch: { active: false } });
    expect(denied).toMatchObject({ ok: false, error: 'forbidden', settings: { active: true } });
    expect(fake.registeredScripts).toHaveLength(1);
  });

  it('when the learner withdraws the permission, Active turns itself off: on the event, and again at the next worker start', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await page({ op: 'set', patch: { active: true } });
    await fake.permissions!.remove({ origins: [...ACTIVE_ORIGINS] });
    await new Promise((r) => setTimeout(r, 20));
    expect(await page({ op: 'get' })).toMatchObject({ settings: { active: false }, granted: false, registered: false });
    // the switch stored as on, the permission gone, a new worker: restore() does not re-register
    await fake.local.set({ [ACTIVE_KEY]: { active: true, speakOnClick: true } });
    const again = createBackground(fake, { packs: fakePacks(), fetch: (async () => { throw new TypeError('no network'); }) as typeof fetch });
    await again.active.restore();
    expect(await again.active.get()).toMatchObject({ active: false, speakOnClick: true, offBy: 'browser' });
    expect(fake.registeredScripts).toEqual([]);
  });
});

describe('the browser withdraws the access and gives it back (2026-10-31: "GoLearn seems to be automatically deactivating itself")', () => {
  /** A new worker over the same browser: its listeners are not registered, only restore() runs, as at a worker start. */
  const fresh = () => createBackground(fake, { packs: fakePacks(), now: () => Date.parse('2026-10-31T09:00:00.000Z'), fetch: (async () => { throw new TypeError('no network'); }) as typeof fetch });
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('a withdrawal by the browser stops Active everywhere and records that the browser did it, and when', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await page({ op: 'set', patch: { active: true } });
    fake.messagesToTabs.length = 0;
    fake.browserWithdraws(ACTIVE_ORIGINS); // the extension menu set to "on click", an update, a reload
    await settle();
    expect((await fake.local.get(ACTIVE_KEY))[ACTIVE_KEY]).toEqual({ active: false, speakOnClick: true, offBy: 'browser', offAt: '2026-10-31T09:00:00.000Z' });
    expect(fake.registeredScripts).toEqual([]);
    expect(toTabs()).toContainEqual({ type: MSG.deactivate });
    expect(await page({ op: 'get' })).toMatchObject({ settings: { active: false, offBy: 'browser' }, granted: false });
  });

  it('when the browser gives the access back, Active comes back by itself and the record is cleared', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await page({ op: 'set', patch: { active: true, speakOnClick: false } });
    fake.browserWithdraws(ACTIVE_ORIGINS);
    await settle();
    fake.messagesToTabs.length = 0; fake.injected.length = 0;
    fake.browserGrants(ACTIVE_ORIGINS);
    await settle();
    expect((await fake.local.get(ACTIVE_KEY))[ACTIVE_KEY]).toEqual({ active: true, speakOnClick: false });
    expect(fake.registeredScripts.map((s) => s.id)).toEqual([ACTIVE_SCRIPT_ID]);
    expect(toTabs()).toEqual([{ type: MSG.activate, speak: false }]);
  });

  it('access given back while the worker slept: the next worker start brings Active back', async () => {
    await fake.local.set({ [ACTIVE_KEY]: { active: false, speakOnClick: true, offBy: 'browser', offAt: '2026-10-30T09:00:00.000Z' } });
    fake.grantOrigins(ACTIVE_ORIGINS);
    const b = fresh();
    await b.active.restore();
    expect(await b.active.get()).toEqual({ active: true, speakOnClick: true });
    expect(fake.registeredScripts).toHaveLength(1);
  });

  it('the learner\'s own off is final: the browser giving access back later does not switch Active on', async () => {
    const b = bg;
    fake.grantOrigins(ACTIVE_ORIGINS);
    await page({ op: 'set', patch: { active: true } });
    // the popup's off: withdraw the access, then the switch (the withdrawal's event arrives first)
    await fake.permissions!.remove({ origins: [...ACTIVE_ORIGINS] });
    await page({ op: 'set', patch: { active: false } });
    await settle();
    expect((await fake.local.get(ACTIVE_KEY))[ACTIVE_KEY]).toEqual({ active: false, speakOnClick: true });
    fake.browserGrants(ACTIVE_ORIGINS);
    await settle();
    expect(await b.active.get()).toEqual({ active: false, speakOnClick: true });
    expect(fake.registeredScripts).toEqual([]);
  });

  it('Speak on click changed while the browser has Active off keeps the record; an unrelated origin added does nothing', async () => {
    await fake.local.set({ [ACTIVE_KEY]: { active: false, speakOnClick: true, offBy: 'browser', offAt: '2026-10-30T09:00:00.000Z' } });
    const b = bg;
    const r = await page({ op: 'set', patch: { speakOnClick: false } });
    expect(r.settings).toEqual({ active: false, speakOnClick: false, offBy: 'browser', offAt: '2026-10-30T09:00:00.000Z' });
    fake.browserGrants(['https://go-v0.onrender.com/*']); // the setup page's speech backend, not Active's access
    await settle();
    expect((await b.active.get()).active).toBe(false);
  });

  it('the popup switching on and the browser\'s own event arriving together register once and end on', async () => {
    await fake.local.set({ [ACTIVE_KEY]: { active: false, speakOnClick: true, offBy: 'browser', offAt: '2026-10-30T09:00:00.000Z' } });
    const b = bg;
    fake.browserGrants(ACTIVE_ORIGINS); // the popup's request fires onAdded …
    const r = await page({ op: 'set', patch: { active: true } }); // … and its set arrives at once
    await settle();
    expect(r).toMatchObject({ ok: true, settings: { active: true }, registered: true });
    expect(fake.registeredScripts).toHaveLength(1);
    expect(await b.active.get()).toEqual({ active: true, speakOnClick: true });
  });
});

describe('the switch at worker start, and the manifest', () => {
  it('restore() re-registers after a worker restart when the switch is on and the permission is still there', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await fake.local.set({ [ACTIVE_KEY]: { active: true, speakOnClick: false } });
    await bg.active.restore();
    expect(fake.registeredScripts.map((s) => s.id)).toEqual([ACTIVE_SCRIPT_ID]);
    await bg.active.restore(); // idempotent
    expect(fake.registeredScripts).toHaveLength(1);
  });

  it('the manifest declares exactly the optional host permission the popup asks for, and no host permission by default', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/manifest.json'), 'utf8'));
    expect(manifest.optional_host_permissions).toEqual([...ACTIVE_ORIGINS]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });
});

describe('a language switch with Active on (2026-11-09)', () => {
  it('answers while an open page is still scanning: the page is told to start again, and the switch does not wait for it to finish', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await page({ op: 'set', patch: { active: true } });
    await fake.dispatch({ type: MSG.localRepo, op: 'enrol', languageId: 'es', goals: [{ kind: 'reading' }] }, PAGE_SENDER);
    await fake.dispatch({ type: MSG.localRepo, op: 'enrol', languageId: 'de', goals: [{ kind: 'reading' }] }, PAGE_SENDER);
    // a page whose scan never finishes (its analyser still loading, a slow answer behind it): `activate` is never answered
    fake.tabListeners.add((message, _sender, sendResponse) => {
      if ((message as { type?: string }).type === MSG.activate) return true;
      sendResponse({ ok: true });
      return undefined;
    });
    fake.messagesToTabs.length = 0;
    const t0 = Date.now();
    const r = await fake.dispatch({ type: MSG.useLanguage, languageId: 'es' }, PAGE_SENDER) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(RESTART_WAIT_MS + 1000);
    expect(toTabs().map((m) => m.type)).toEqual([MSG.deactivate, MSG.activate]);
    expect((await fake.dispatch({ type: MSG.status }, PAGE_SENDER) as { languageId: string }).languageId).toBe('es');
  });
});

describe('Reading Analysis device-only knowledge boundary', () => {
  it('reads local vocabulary with Active disabled, but refuses extension-page and foreign callers', async () => {
    const request = { type: MSG.readingProfile, languageId: 'sq', unitIds: ['form:sq:libër', 'lemma:sq:libër:NOUN'] };
    const fromContent = await fake.dispatch(request, CONTENT_SENDER) as { ok: boolean; source?: string; rows?: object };
    expect(fromContent.ok).toBe(true);
    expect(fromContent.source).toBe('device');
    expect(fromContent.rows).toBeDefined();
    expect(await fake.dispatch(request, PAGE_SENDER)).toMatchObject({ ok: false, error: 'unavailable' });
    expect(await fake.dispatch(request, { id: 'unrelated-ext', url: 'https://example.test/page' })).toMatchObject({ ok: false });
    expect((await page({ op: 'get' })).settings.active).toBe(false);
  });
});
