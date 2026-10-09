// @vitest-environment jsdom
/**
 * Smoke test of the BUILT files (run `npm run ext:build` first; skipped when dist/ is absent). The content script is
 * evaluated as a classic script in jsdom, the way chrome.scripting.executeScript runs it, and made to do a real lookup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChromeFake, emitter } from './chromeFake';
import { flush, selectText, setBody, stubLayout } from './dom';
import { MSG, type MessageListener } from '../../packages/golearn-extension/src/platform';

const dist = path.resolve(__dirname, '../../packages/golearn-extension/dist');
const have = fs.existsSync(path.join(dist, 'content.js'));
const read = (f: string): string => fs.readFileSync(path.join(dist, f), 'utf8');

describe.skipIf(!have)('the built extension', () => {
  it('has the files the manifest names, and the manifest copied is the source manifest', () => {
    const m = JSON.parse(read('manifest.json'));
    expect(m.permissions).toEqual(['activeTab', 'scripting', 'storage', 'contextMenus']);
    expect(fs.existsSync(path.join(dist, m.background.service_worker))).toBe(true);
    expect(fs.existsSync(path.join(dist, m.action.default_popup))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'content.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'action/popup.js'))).toBe(true);
  });

  it('the scripts are self-contained classic scripts: no module syntax, no eval, nothing that can send data off the device', () => {
    for (const f of ['content.js', 'background.js', 'action/popup.js']) {
      const code = read(f);
      expect(code, f).not.toMatch(/^\s*(import|export)\s/m);
      expect(code, f).not.toMatch(/\beval\s*\(|new Function\s*\(/);
      expect(code, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|navigator\.connection/);
      expect(code, f).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i); // no URL the code could call
    }
  });

  it('the content script, evaluated as the browser would, installs once and performs a lookup end to end', async () => {
    const restore = stubLayout();
    setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>');
    const fake = createChromeFake();
    const tabEvents = emitter<MessageListener>();
    fake.tabListeners = tabEvents.listeners;
    (globalThis as { chrome?: unknown }).chrome = { ...fake, runtime: { ...fake.runtime, onMessage: tabEvents } };
    delete (globalThis as Record<string, unknown>).__goLearnExtension;
    (0, eval)(read('content.js'));
    await flush(20);
    expect(tabEvents.listeners.size).toBe(1);
    selectText(document.getElementById('p')!, 'shtëpinë');
    const reply = await fake.tabs!.sendMessage(7, { type: MSG.lookup, trigger: 'command' });
    expect(reply).toEqual({ ok: true, status: 'shown' });
    expect(document.querySelectorAll('[data-golearn-host]')).toHaveLength(1);
    const rows = Object.keys(await fake.local.get(null)).filter((k) => k.startsWith('golearn:event:'));
    expect(rows).toHaveLength(1);
    (0, eval)(read('content.js')); // a second injection
    expect(tabEvents.listeners.size).toBe(1);
    (globalThis as { chrome?: unknown }).chrome = undefined;
    document.querySelector('[data-golearn-host]')?.remove();
    restore();
  });
});
