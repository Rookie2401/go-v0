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
  it('starts off, with the legend of the six underline levels and nothing about this page', async () => {
    await initPopup(document, fake);
    expect($<HTMLInputElement>('active').checked).toBe(false);
    expect($('active-status').textContent).toMatch(/^Off\. Nothing is read/);
    expect($('active-page').textContent).toBe('');
    expect($('active-legend').querySelectorAll('li')).toHaveLength(ACTIVE_LEVELS.length);
    expect($('active-legend').textContent).toMatch(/New.*Seen.*Recognized.*Familiar.*Known.*Automatic/s);
  });

  it('switching on asks the browser for the host permission inside the click; a "no" keeps Active off and says so', async () => {
    await initPopup(document, fake);
    fake.promptAnswer = false;
    change($('active'), true);
    await flush(30);
    expect(fake.permissionRequests).toEqual([{ origins: [...ACTIVE_ORIGINS] }]);
    expect($<HTMLInputElement>('active').checked).toBe(false);
    expect($('active-status').textContent).toMatch(/Site access was not allowed/);
    expect(fake.registeredScripts).toEqual([]);
  });

  it('a "yes" registers GoLearn for pages and starts it on the page in front; the popup then says what that page got', async () => {
    const popup = await initPopup(document, fake);
    pageState = { on: true, speak: true, supported: true, languageId: 'sq', scanned: 230, marked: { new: 0, seen: 16, recognized: 3, familiar: 0, known: 4, automatic: 8 }, clicks: 1, recordedWords: 18 };
    change($('active'), true);
    await flush(40);
    expect(fake.grantedOrigins).toEqual([...ACTIVE_ORIGINS]);
    expect(fake.registeredScripts.map((s) => s.id)).toEqual(['golearn-active']);
    expect(fake.messagesToTabs.some((m) => (m.message as { type: string }).type === MSG.activate)).toBe(true);
    expect($<HTMLInputElement>('active').checked).toBe(true);
    expect($('active-status').textContent).toMatch(/^On\. GoLearn scans supported pages on this device/);
    // 2026-10-25: the language by its name, and the words the analyser did not know (another language's) counted as left alone
    expect($('active-page').textContent).toBe('This page (Albanian): 230 words scanned, 31 underlined (seen 16, recognized 3, known 4, automatic 8); 18 distinct words recorded; 1 click looked up.');
    pageState = { ...pageState, skipped: 57 };
    await popup.refresh();
    expect($('active-page').textContent).toContain('; 57 not Albanian words, left alone;');
  });

  it('a page where Active read nothing shows the reason; a page without the script says to reload it', async () => {
    fake.grantOrigins(ACTIVE_ORIGINS);
    await fake.dispatch({ type: MSG.active, op: 'set', patch: { active: true } }, { id: fake.runtime.id, url: `chrome-extension://${fake.runtime.id}/action/popup.html` });
    pageState = { on: true, speak: true, supported: true, scanned: 0, marked: { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 }, clicks: 0, reason: 'GoLearn cannot tell which language this page is in, and will not guess. Choose a language in the setup page.' };
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

  it('the language switch (2026-10-25): the downloaded languages as a select, a change makes the chosen one the reading language on the device and restarts every Active page in it', async () => {
    const page = { id: fake.runtime.id, url: `chrome-extension://${fake.runtime.id}/action/popup.html` };
    // two languages chosen on this device (no account): Spanish first, German last, so German is the one in use
    await fake.dispatch({ type: MSG.localRepo, op: 'enrol', languageId: 'es', goals: [{ kind: 'reading' }] }, page);
    await fake.dispatch({ type: MSG.localRepo, op: 'enrol', languageId: 'de', goals: [{ kind: 'reading' }] }, page);
    fake.grantOrigins(ACTIVE_ORIGINS);
    await fake.dispatch({ type: MSG.active, op: 'set', patch: { active: true } }, page);
    fake.messagesToTabs.length = 0;
    await initPopup(document, fake);
    const select = $<HTMLSelectElement>('language-select');
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([['es', 'Spanish'], ['de', 'German']]);
    expect(select.value).toBe('de');
    expect(select.disabled).toBe(false);
    expect($('language').textContent).toMatch(/^German/); // "(no pack yet)" follows with the fake packs
    // the switch: Spanish becomes the device's active enrolment, the status follows, and the Active pages were told to stop and start again
    select.value = 'es';
    select.dispatchEvent(new Event('change'));
    await flush(40);
    expect(select.value).toBe('es');
    expect($('language').textContent).toMatch(/^Spanish/);
    const status = await fake.dispatch({ type: MSG.status }, page) as { languageId: string };
    expect(status.languageId).toBe('es');
    const types = fake.messagesToTabs.map((m) => (m.message as { type: string }).type);
    expect(types.indexOf(MSG.deactivate)).toBeGreaterThanOrEqual(0);
    expect(types.lastIndexOf(MSG.activate)).toBeGreaterThan(types.indexOf(MSG.deactivate));
    // a language not chosen here is refused with the way to add it
    const refused = await fake.dispatch({ type: MSG.useLanguage, languageId: 'hi' }, page) as { ok: boolean; message?: string };
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/not one of your chosen languages here\. Download it in GoLearn setup first\./);
  });

  it('with one language downloaded the select is there but disabled, and the line says where others are added', async () => {
    await initPopup(document, fake);
    const select = $<HTMLSelectElement>('language-select');
    expect(select.options).toHaveLength(1);
    expect(select.disabled).toBe(true);
    expect($('language').textContent).toMatch(/is the only language downloaded here; others are added in GoLearn setup\./);
  });

  it('the popup text describes Active page scanning, encounter data, and speech without overpromising', () => {
    expect(html).toMatch(/Active scans page text on this device/);
    expect(html).toMatch(/scan does not send or retain page text/);
    expect(html).toMatch(/records vocabulary encounters using word IDs/);
    expect(html).toMatch(/history syncs with your account/);
    expect(html).toMatch(/may speak it automatically according to your speech settings/);
    expect(html).toMatch(/Some reading apps block extensions from reading their pages/);
    expect(html).not.toMatch(/team|leader/i);
    expect(html).not.toMatch(/Brave|never sent anywhere|nothing of them is kept/i);
  });
});
