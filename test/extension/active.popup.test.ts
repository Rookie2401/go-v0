// @vitest-environment jsdom
/** The popup's GoLearn Active controls: the browser's prompt inside the learner's click, the legend, Speak on click, and withdrawing the access. */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import { ACTIVE_LEVELS } from '../../packages/golearn-extension/src/active/levels';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { ACTIVE_ORIGINS } from '../../packages/golearn-extension/src/protocol';
import { createChromeFake, type ChromeFake } from './chromeFake';
import { flush } from './dom';
import { fakePacks } from './rig';

const html = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let fake: ChromeFake;
beforeEach(() => {
  document.body.innerHTML = body;
  fake = createChromeFake();
  createBackground(fake, { packs: fakePacks(), fetch: (async () => { throw new TypeError('no network'); }) as typeof fetch }).register();
  fake.tabListeners.add((_m, _s, send) => { send({ ok: true }); return true; });
});

const change = (el: HTMLInputElement, checked: boolean): void => { el.checked = checked; el.dispatchEvent(new Event('change')); };

describe('GoLearn Active in the popup', () => {
  it('starts off, with the legend of the four underline levels and no withdraw button', async () => {
    await initPopup(document, fake);
    expect($<HTMLInputElement>('active').checked).toBe(false);
    expect($<HTMLInputElement>('speak').disabled).toBe(true);
    expect($('active-status').textContent).toMatch(/^Off\. Nothing is read/);
    expect($('active-legend').querySelectorAll('li')).toHaveLength(ACTIVE_LEVELS.length);
    expect($('active-legend').textContent).toMatch(/Met.*Understood with help.*Recognised.*Produced/s);
    expect($<HTMLButtonElement>('active-revoke').hidden).toBe(true);
  });

  it('switching on asks the browser for the host permission inside the click; a "no" keeps Active off and says so', async () => {
    await initPopup(document, fake);
    fake.promptAnswer = false;
    change($('active'), true);
    await flush(30);
    expect(fake.permissionRequests).toEqual([{ origins: [...ACTIVE_ORIGINS] }]);
    expect($<HTMLInputElement>('active').checked).toBe(false);
    expect($('active-status').textContent).toMatch(/did not allow/);
    expect(fake.registeredScripts).toEqual([]);
  });

  it('a "yes" registers GoLearn for pages: the switch stays on, Speak on click becomes available, the status says what happens now', async () => {
    await initPopup(document, fake);
    change($('active'), true);
    await flush(30);
    expect(fake.grantedOrigins).toEqual([...ACTIVE_ORIGINS]);
    expect(fake.registeredScripts.map((s) => s.id)).toEqual(['golearn-active']);
    expect($<HTMLInputElement>('active').checked).toBe(true);
    expect($<HTMLInputElement>('speak').disabled).toBe(false);
    expect($<HTMLInputElement>('speak').checked).toBe(true);
    expect($('active-status').textContent).toMatch(/^On\. Pages you open from now on are read on this device/);
    expect($<HTMLButtonElement>('active-revoke').hidden).toBe(false);
    change($('speak'), false);
    await flush(20);
    expect(fake.messagesToTabs.some((m) => (m.message as { type: string; speak?: boolean }).type === 'golearn:activate' && (m.message as { speak?: boolean }).speak === false)).toBe(true);
  });

  it('withdrawing the page access removes the permission and turns Active off', async () => {
    await initPopup(document, fake);
    change($('active'), true);
    await flush(30);
    $('active-revoke').click();
    await flush(30);
    expect(fake.grantedOrigins).toEqual([]);
    expect($<HTMLInputElement>('active').checked).toBe(false);
    expect(fake.registeredScripts).toEqual([]);
    expect($<HTMLButtonElement>('active-revoke').hidden).toBe(true);
    expect($('active-status').textContent).toMatch(/^Off\. Nothing is read/);
  });

  it('the popup text says what Active reads and never promises more than the extension does', () => {
    expect(html).toMatch(/read on this device only/);
    expect(html).toMatch(/Kindle, Kobo, readAwrite, MEB, Pratilipi/);
    expect(html).not.toMatch(/team|leader/i);
  });
});
