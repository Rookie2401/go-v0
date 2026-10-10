/**
 * GoLearn Active, the privileged half: the switch needs the host permission the browser granted (never assumed), registers a dynamic
 * content script that excludes every refusing reader, tells open pages to start or stop, and turns itself off when the permission goes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { ACTIVE_KEY, ACTIVE_SCRIPT_ID } from '../../packages/golearn-extension/src/background/active';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { ACTIVE_ORIGINS, type ActiveReply } from '../../packages/golearn-extension/src/protocol';
import { createChromeFake, PAGE_SENDER, type ChromeFake } from './chromeFake';
import { fakePacks } from './rig';

const CONTENT_SENDER = { id: 'test-ext-id', tab: { id: 7 }, url: 'https://example.test/page' };

let fake: ChromeFake;
let bg: ReturnType<typeof createBackground>;
beforeEach(() => {
  fake = createChromeFake();
  bg = createBackground(fake, { packs: fakePacks(), fetch: (async () => { throw new TypeError('no network in this test'); }) as typeof fetch });
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
    expect(await again.active.get()).toEqual({ active: false, speakOnClick: true });
    expect(fake.registeredScripts).toEqual([]);
  });

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
