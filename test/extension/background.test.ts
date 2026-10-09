// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_ID, CONTENT_FILE, CONTEXT_MENU_ID, createBackground, explain } from '../../packages/golearn-extension/src/background/core';
import { MSG, type TabState } from '../../packages/golearn-extension/src/platform';
import { EVENT_KEY_PREFIX } from '../../packages/golearn-extension/src/store';
import { createChromeFake, emitter, type ChromeFake } from './chromeFake';
import type { MessageListener, ContentChromeApi } from '../../packages/golearn-extension/src/platform';
import { flush, selectText, setBody, stubLayout } from './dom';

(globalThis as { __GOLEARN_NO_AUTOINSTALL?: boolean }).__GOLEARN_NO_AUTOINSTALL = true;
const { install } = await import('../../packages/golearn-extension/src/content/index');
const KEY = '__goLearnExtension';

let fake: ChromeFake;
let restore: () => void;
let teardown: Array<() => void> = [];

/** Wire a content script to the fake: messaging only (no storage), its own onMessage emitter, its sends reach the background as a tab sender. */
async function startContent(): Promise<Awaited<ReturnType<typeof install>>> {
  const c = await install(fake.contentChrome(), document);
  teardown.push(() => c?.dispose());
  return c;
}

beforeEach(() => {
  fake = createChromeFake();
  restore = stubLayout();
  setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>');
  delete (globalThis as Record<string, unknown>)[KEY];
});
afterEach(() => { for (const t of teardown) t(); teardown = []; restore(); delete (globalThis as Record<string, unknown>)[KEY]; vi.restoreAllMocks(); });

describe('manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/manifest.json'), 'utf8'));
  it('is MV3 with exactly the five permissions (alarms is the new one: the 5-minute sync) and no host access', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage', 'contextMenus', 'alarms']);
    expect(manifest.options_page).toBe('app/index.html');
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined(); // injected on a gesture only, never declared
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
  });
  it('has the Alt+Shift+G command, an action popup and a service worker', () => {
    expect(manifest.commands[COMMAND_ID].suggested_key.default).toBe('Alt+Shift+G');
    expect(manifest.action.default_popup).toBe('action/popup.html');
    expect(manifest.background.service_worker).toBe('background.js');
    expect(fs.existsSync(path.resolve(__dirname, '../../packages/golearn-extension', manifest.action.default_popup))).toBe(true);
    expect(CONTENT_FILE).toBe('content.js');
  });
});

describe('background: gestures inject the content script', () => {
  it('registers the context-menu item on install', async () => {
    createBackground(fake).register();
    fake.events.onInstalled.fire();
    await flush();
    expect(fake.menus).toEqual([{ id: CONTEXT_MENU_ID, title: 'Look up with GoLearn', contexts: ['selection'] }]);
  });

  it('the context-menu item injects and asks the page to look up, handing over the browser\'s copy of the selected text', async () => {
    createBackground(fake).register();
    await startContent();
    selectText(document.getElementById('p')!, 'shtëpinë');
    fake.events.menuClicked.fire({ menuItemId: CONTEXT_MENU_ID, selectionText: 'shtëpinë' }, { id: 7 });
    await flush(80);
    expect(fake.injected).toEqual([{ target: { tabId: 7 }, files: ['content.js'] }]);
    expect(fake.messagesToTabs[0]).toMatchObject({ tabId: 7, message: { type: MSG.lookup, trigger: 'menu', selectionText: 'shtëpinë' } });
    const rows = Object.keys(await fake.local.get(null)).filter((k) => k.startsWith(EVENT_KEY_PREFIX));
    expect(rows).toHaveLength(2); // SelectionLookedUp + AnalysisShown, recorded by the background for the content script
  });

  it('Alt+Shift+G injects and looks up with keyboard focus; other commands are ignored', async () => {
    createBackground(fake).register();
    await startContent();
    selectText(document.getElementById('p')!, 'libër');
    fake.events.command.fire('some-other-command', { id: 7 });
    await flush(20);
    expect(fake.injected).toHaveLength(0);
    fake.events.command.fire(COMMAND_ID, { id: 7 });
    await flush(80);
    expect(fake.injected).toHaveLength(1);
    expect(fake.messagesToTabs[0].message).toMatchObject({ type: MSG.lookup, trigger: 'command', focus: true });
    expect(document.querySelector('[data-golearn-host]')).toBeTruthy();
  });

  it('a command without a tab falls back to the active tab', async () => {
    createBackground(fake).register();
    await startContent();
    selectText(document.getElementById('p')!, 'libër');
    fake.events.command.fire(COMMAND_ID);
    await flush(80);
    expect(fake.injected[0].target.tabId).toBe(fake.activeTabId);
  });

  it('the on/off switch in the action popup: on injects and enables, off disables; state is per tab', async () => {
    createBackground(fake).register();
    const content = await startContent();
    const on = (await fake.runtime.sendMessage({ type: MSG.setEnabled, tabId: 7, enabled: true })) as TabState;
    expect(on).toEqual({ enabled: true });
    expect(content!.isEnabled).toBe(true);
    expect(fake.injected).toHaveLength(1);
    expect(fake.badges.at(-1)).toEqual({ tabId: 7, text: 'on' });
    expect(await fake.runtime.sendMessage({ type: MSG.getState, tabId: 7 })).toEqual({ enabled: true });
    expect(await fake.runtime.sendMessage({ type: MSG.getState, tabId: 8 })).toEqual({ enabled: false });
    const off = (await fake.runtime.sendMessage({ type: MSG.setEnabled, tabId: 7, enabled: false })) as TabState;
    expect(off).toEqual({ enabled: false });
    expect(content!.isEnabled).toBe(false);
    expect(fake.badges.at(-1)).toEqual({ tabId: 7, text: '' });
  });

  it('a navigation or a closed tab clears the switch (the grant and the script are gone)', async () => {
    createBackground(fake).register();
    await startContent();
    await fake.runtime.sendMessage({ type: MSG.setEnabled, tabId: 7, enabled: true });
    fake.events.onUpdated.fire(7, { status: 'loading' });
    await flush();
    expect(await fake.runtime.sendMessage({ type: MSG.getState, tabId: 7 })).toEqual({ enabled: false });
    await fake.runtime.sendMessage({ type: MSG.setEnabled, tabId: 9, enabled: true });
    fake.events.onRemoved.fire(9);
    await flush();
    expect(await fake.runtime.sendMessage({ type: MSG.getState, tabId: 9 })).toEqual({ enabled: false });
  });
});

describe('background: failures are one line and never an uncaught error', () => {
  const denied = new Error('Cannot access contents of url "chrome://extensions/". Extension manifest must request permission to access this host.');

  it('permission denied on the switch: state carries a one-line reason, the badge shows !, nothing throws', async () => {
    fake.failInjection(denied);
    createBackground(fake).register();
    const state = (await fake.runtime.sendMessage({ type: MSG.setEnabled, tabId: 7, enabled: true })) as TabState;
    expect(state).toEqual({ enabled: false, error: 'GoLearn is not allowed to read this page.' });
    expect(fake.badges.at(-1)).toEqual({ tabId: 7, text: '!' });
    expect(fake.titles.at(-1)!.title).toContain('not allowed to read this page');
    expect(await fake.runtime.sendMessage({ type: MSG.getState, tabId: 7 })).toMatchObject({ error: 'GoLearn is not allowed to read this page.' });
    expect(fake.messagesToTabs).toHaveLength(0); // nothing was sent to a page that could not be reached
  });

  it('permission denied on the menu item and the command: no unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    fake.failInjection(denied);
    createBackground(fake).register();
    fake.events.menuClicked.fire({ menuItemId: CONTEXT_MENU_ID, selectionText: 'x' }, { id: 7 });
    fake.events.command.fire(COMMAND_ID, { id: 7 });
    await flush(50);
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(fake.badges.some((b) => b.text === '!')).toBe(true);
    expect(fake.injected).toHaveLength(0);
  });

  it('lookupNow reports the reason to its caller', async () => {
    fake.failInjection(denied);
    const bg = createBackground(fake);
    expect(await bg.lookupNow(7, 'command')).toEqual({ ok: false, message: 'GoLearn is not allowed to read this page.' });
  });

  it('injection works but nobody is listening: a plain message', async () => {
    createBackground(fake).register();
    const state = (await fake.runtime.sendMessage({ type: MSG.setEnabled, tabId: 7, enabled: true })) as TabState;
    expect(state).toEqual({ enabled: false, error: 'GoLearn could not start on this page.' });
  });

  it('turning off on a page where the script is gone is harmless', async () => {
    createBackground(fake).register();
    expect(await fake.runtime.sendMessage({ type: MSG.setEnabled, tabId: 7, enabled: false })).toEqual({ enabled: false });
  });

  it('the browser\'s wording is mapped to short plain reasons', () => {
    expect(explain(new Error('Cannot access a chrome:// URL'))).toBe('GoLearn is not allowed to read this page.');
    expect(explain(new Error('The extensions gallery cannot be scripted.'))).toBe('GoLearn is not allowed to read this page.');
    expect(explain(new Error('No tab with id: 7.'))).toBe('That tab is gone.');
    expect(explain('weird')).toBe('GoLearn could not start on this page.');
  });
});

describe('content script bootstrap', () => {
  it('installs once: a second injection reuses the controller and adds no second listener', async () => {
    const tabEvents = emitter<MessageListener>();
    const chromeApi: ContentChromeApi = { runtime: { ...fake.contentChrome().runtime, onMessage: tabEvents } };
    const a = await install(chromeApi, document);
    const b = await install(chromeApi, document);
    teardown.push(() => a?.dispose());
    expect(b).toBe(a);
    expect(tabEvents.listeners.size).toBe(1);
  });

  it('answers a lookup message with the outcome; the BACKGROUND records the encounter in chrome.storage.local', async () => {
    createBackground(fake).register();
    const content = await startContent();
    expect(content).toBeTruthy();
    selectText(document.getElementById('p')!, 'shtëpinë');
    const reply = (await fake.tabs!.sendMessage(7, { type: MSG.lookup, trigger: 'command' })) as { ok: boolean; status: string };
    expect(reply).toEqual({ ok: true, status: 'shown' });
    const stored = await fake.local.get(null);
    expect(Object.keys(stored).filter((k) => k.startsWith(EVENT_KEY_PREFIX))).toHaveLength(2);
    expect(Object.keys(stored).filter((k) => k.startsWith('golearn:metric:'))).toHaveLength(1);
    expect(Object.keys(stored)).toContain('golearn:deviceId');
    const row = Object.values(stored).find((v) => (v as { kind?: string })?.kind === 'SelectionLookedUp') as { producer: { deviceId: string; version: string } };
    expect(row.producer.deviceId).toBe(stored['golearn:deviceId']);
    expect(row.producer.version).toBe('0.1.0');
  });

  it('answers ping and ignores unknown messages', async () => {
    await startContent();
    expect(await fake.tabs!.sendMessage(7, { type: MSG.ping })).toEqual({ ok: true, enabled: false });
    expect(await fake.tabs!.sendMessage(7, { type: 'something-else' })).toBeUndefined();
  });
});
