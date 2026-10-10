// @vitest-environment jsdom
/**
 * The popup's one GoLearn Active switch: on asks the browser's prompt inside the learner's click and registers for pages; off withdraws
 * the page access as well; the legend; and what Active found on the page in front.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import { ACTIVE_LEVELS } from '../../packages/golearn-extension/src/active/levels';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { ACTIVE_ORIGINS } from '../../packages/golearn-extension/src/protocol';
import { createChromeFake, type ChromeFake } from './chromeFake';
import { flush } from './dom';
import { fakePacks } from './rig';

const html = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let fake: ChromeFake;
/** What the content script in tab 7 answers: a ping with Active's state, when `pageState` is set. */
let pageState: Record<string, unknown> | undefined;
beforeEach(() => {
  document.body.innerHTML = body;
  fake = createChromeFake();
  pageState = undefined;
  createBackground(fake, { packs: fakePacks(), fetch: (async () => { throw new TypeError('no network'); }) as typeof fetch }).register();
  fake.tabListeners.add((m, _s, send) => {
    if ((m as { type?: string }).type === MSG.ping) send(pageState ? { ok: true, enabled: true, active: true, activeState: pageState } : { ok: true, enabled: false, active: false });
    else send({ ok: true });
    return true;
  });
});

const change = (el: HTMLInputElement, checked: boolean): void => { el.checked = checked; el.dispatchEvent(new Event('change')); };

describe('GoLearn Active in the popup', () => {
  it('starts off, with the legend of the four underline levels and nothing about this page', async () => {
    await initPopup(document, fake);
    expect($<HTMLInputElement>('active').checked).toBe(false);
    expect($('active-status').textContent).toMatch(/^Off\. Nothing is read/);
    expect($('active-page').textContent).toBe('');
    expect($('active-legend').querySelectorAll('li')).toHaveLength(ACTIVE_LEVELS.length);
    expect($('active-legend').textContent).toMatch(/New.*Met.*Understood with help.*Recognised.*Produced/s);
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

  it('a "yes" registers GoLearn for pages and starts it on the page in front; the popup then says what that page got', async () => {
    await initPopup(document, fake);
    pageState = { on: true, speak: true, supported: true, languageId: 'sq', scanned: 230, marked: { met: 16, assisted: 3, known: 4, produced: 8 }, clicks: 1 };
    change($('active'), true);
    await flush(40);
    expect(fake.grantedOrigins).toEqual([...ACTIVE_ORIGINS]);
    expect(fake.registeredScripts.map((s) => s.id)).toEqual(['golearn-active']);
    expect(fake.messagesToTabs.some((m) => (m.message as { type: string }).type === MSG.activate)).toBe(true);
    expect($<HTMLInputElement>('active').checked).toBe(true);
    expect($('active-status').textContent).toMatch(/^On\. Every page you open is read on this device/);
    expect($('active-page').textContent).toBe('This page (sq): 230 words read, 31 underlined (met 16, understood with help 3, recognised 4, produced 8); 1 click looked up.');
  });

  it('a page where Active read nothing shows the reason; a page without the script says to reload it', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await fake.dispatch({ type: MSG.active, op: 'set', patch: { active: true } }, { id: fake.runtime.id, url: `chrome-extension://${fake.runtime.id}/action/popup.html` });
    pageState = { on: true, speak: true, supported: true, scanned: 0, marked: { met: 0, assisted: 0, known: 0, produced: 0 }, clicks: 0, reason: 'GoLearn cannot tell which language this page is in, and will not guess. Choose a language in the setup page.' };
    await initPopup(document, fake);
    expect($('active-page').textContent).toMatch(/^This page: GoLearn cannot tell which language/);
    fake.tabListeners.clear();
    const h = await initPopup(document, fake);
    await h.refresh();
    expect($('active-page').textContent).toMatch(/not running here yet\. Reload the page/);
  });

  it('switching off withdraws the page access and unregisters: one switch, nothing left behind', async () => {
    await initPopup(document, fake);
    change($('active'), true);
    await flush(30);
    expect(fake.grantedOrigins).toHaveLength(2);
    change($('active'), false);
    await flush(30);
    expect(fake.grantedOrigins).toEqual([]);
    expect(fake.registeredScripts).toEqual([]);
    expect(fake.messagesToTabs.some((m) => (m.message as { type: string }).type === MSG.deactivate)).toBe(true);
    expect($<HTMLInputElement>('active').checked).toBe(false);
    expect($('active-status').textContent).toMatch(/^Off\. Nothing is read/);
    expect($('active-page').textContent).toBe('');
  });

  it('the popup text says what Active reads and never promises more than the extension does', () => {
    expect(html).toMatch(/read on this device only/);
    expect(html).toMatch(/never sent anywhere/);
    expect(html).toMatch(/Kindle, Kobo, readAwrite, MEB, Pratilipi/);
    expect(html).not.toMatch(/team|leader/i);
  });
});
