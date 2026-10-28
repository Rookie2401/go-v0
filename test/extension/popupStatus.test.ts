// @vitest-environment jsdom
/**
 * The action popup's connection, language and sync lines, and its buttons, against a real background worker (and the
 * real service handler for the connected cases).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { flush } from './dom';
import { createRig, pendingEvent, type Rig } from './rig';

const html = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const text = (id: string): string => $(id).textContent ?? '';

let rig: Rig;
beforeEach(() => { document.body.innerHTML = body; rig = createRig(); });

describe('not connected', () => {
  it('says so, offers "Open GoLearn setup", and keeps sync off', async () => {
    await initPopup(document, rig.fake);
    expect(text('connection')).toBe('Not connected. Your lookups are kept on this device.');
    expect(text('open-setup')).toBe('Open GoLearn setup');
    // 2026-10-25: the language row is a select; with one language the line says where others are added
    expect($<HTMLSelectElement>('language-select').value).toBe('sq');
    expect(text('language')).toMatch(/^Albanian is the only language downloaded here; others are added in GoLearn setup\./);
    expect(text('sync')).toBe('Nothing to sync.');
    expect($<HTMLButtonElement>('sync-now').disabled).toBe(true);
  });

  it('events recorded while signed out are counted as waiting for an account', async () => {
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.content({ type: MSG.record, event: pendingEvent('libër') });
    await initPopup(document, rig.fake);
    expect(text('sync')).toBe('2 events waiting for an account');
  });

  it('"Open GoLearn setup" opens the options page', async () => {
    await initPopup(document, rig.fake);
    $('open-setup').click();
    await flush(5);
    expect(rig.fake.options.opened).toBe(1);
  });

  it('a background that does not answer is a plain line, not an exception', async () => {
    const dead = createRig().fake;
    dead.events.onMessage.listeners.clear();
    await initPopup(document, dead);
    expect(text('connection')).toBe('The background worker did not answer. Reload the extension.');
  });
});

describe('connected', () => {
  it('the language switch lists the account\'s other enrolments too, and switching to one selects it on the account (2026-10-25)', async () => {
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    const page = { id: rig.fake.runtime.id, url: `chrome-extension://${rig.fake.runtime.id}/action/popup.html` };
    // a second language enrolled on the account only (as the hosted setup app does), not on this device
    const made = await rig.fake.dispatch({ type: MSG.enrol, languageId: 'de', packId: 'pack:de', packVersion: '1', goals: [{ kind: 'reading' }] }, page) as { ok: boolean };
    expect(made.ok).toBe(true);
    await initPopup(document, rig.fake);
    const select = $<HTMLSelectElement>('language-select');
    expect([...select.options].map((o) => o.value)).toContain('de');
    expect(select.disabled).toBe(false);
    select.value = 'de';
    select.dispatchEvent(new Event('change'));
    await flush(60);
    const status = await rig.fake.dispatch({ type: MSG.status }, page) as { languageId: string };
    expect(status.languageId).toBe('de');
    expect(text('language')).toMatch(/^German/);
  });

  it('a stored address that is not the shipped one gets a one-click switch to it when unreachable; the language line says the account is unread, not "others are added in setup" (2026-10-27)', async () => {
    const r2 = createRig({ defaultServiceUrl: 'https://go-v0.example.org' });
    document.body.innerHTML = body;
    await r2.signUp();
    await r2.connect();
    await r2.fireTimers();
    const page = { id: r2.fake.runtime.id, url: `chrome-extension://${r2.fake.runtime.id}/action/popup.html` };
    // the account's languages were never read (no copy kept), and the service is now unreachable
    await r2.fake.storage.local.remove('golearn:account-languages');
    r2.offline.value = true;
    await r2.content({ type: MSG.record, event: pendingEvent() });
    await r2.fake.dispatch({ type: MSG.syncNow }, page);
    await initPopup(document, r2.fake);
    expect(text('language')).toMatch(/^Albanian is the only language on this device; the languages of your account will be listed once the service can be reached/);
    expect($('language').classList.contains('warn')).toBe(true);
    const use = $<HTMLButtonElement>('use-standard-service');
    expect(use.textContent).toBe('Use https://go-v0.example.org instead');
    use.click();
    await flush(60);
    const status = await r2.fake.dispatch({ type: MSG.status }, page) as { baseUrl?: string };
    expect(status.baseUrl).toBe('https://go-v0.example.org');
  });

  it('the account\'s languages kept from the last answer still fill the switch while the service is unreachable, and switching to one enrols it on this device (2026-10-27)', async () => {
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    const page = { id: rig.fake.runtime.id, url: `chrome-extension://${rig.fake.runtime.id}/action/popup.html` };
    await rig.fake.dispatch({ type: MSG.enrol, languageId: 'de', packId: 'pack:de', packVersion: '1', goals: [{ kind: 'reading' }] }, page);
    await rig.fake.dispatch({ type: MSG.status }, page); // online: the account's languages are read and kept
    rig.offline.value = true;
    await initPopup(document, rig.fake);
    const select = $<HTMLSelectElement>('language-select');
    expect([...select.options].map((o) => o.value)).toContain('de');
    expect(text('language')).not.toMatch(/will be listed once the service can be reached/);
    select.value = 'de';
    select.dispatchEvent(new Event('change'));
    await flush(60);
    const status = await rig.fake.dispatch({ type: MSG.status }, page) as { languageId: string };
    expect(status.languageId).toBe('de'); // the device's new enrolment, made without the service
    const local = await rig.fake.dispatch({ type: MSG.localRepo, op: 'enrolments' }, page) as { enrolments: Array<{ languageId: string; active: boolean }> };
    expect(local.enrolments.find((e) => e.languageId === 'de')?.active).toBe(true);
  });

  it('an unreachable service is named with the way to change its address (2026-10-25)', async () => {
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.offline.value = true;
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.fake.dispatch({ type: MSG.syncNow }, { id: rig.fake.runtime.id, url: `chrome-extension://${rig.fake.runtime.id}/action/popup.html` });
    await initPopup(document, rig.fake);
    expect(text('sync-detail')).toMatch(/could not be reached\. If your network blocks that name, set another address for the same service under Sign in · Service address in GoLearn setup\./);
    expect(text('sync-detail')).toContain('the service at http');
  });

  it('shows who, the language, and the sync state, and syncs on request', async () => {
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await initPopup(document, rig.fake);
    expect(text('connection')).toBe('Connected as ana@example.com');
    expect(text('open-setup')).toBe('Open GoLearn setup');
    expect($<HTMLSelectElement>('language-select').value).toBe('sq');
    expect(text('language')).toMatch(/^Albanian is the only language downloaded here/);
    expect(text('sync')).toMatch(/^Sync: 1 pending · last sync .*/);
    $('sync-now').click();
    await flush(60);
    expect(text('sync')).toMatch(/^Sync: 0 pending · last sync (just now|never)/);
    expect(text('sync')).not.toContain('never');
    expect(text('sync-detail')).toBe('');
  });

  it('after a 401 it says the sign-in is no longer accepted and offers "Sign in again"', async () => {
    await rig.signUp();
    await rig.connect();
    const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    await rig.h.api(token).deleteSession();
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.page({ type: MSG.syncNow });
    await initPopup(document, rig.fake);
    expect(text('connection')).toBe('Signed in as ana@example.com, but the service no longer accepts the sign-in.');
    expect(text('open-setup')).toBe('Sign in again');
    expect($('connection').classList.contains('warn')).toBe(true);
    expect($<HTMLButtonElement>('sync-now').disabled).toBe(true);
  });

  it('signed in but not enrolled: asks to finish setup', async () => {
    await rig.page({ type: MSG.createAccount, baseUrl: 'https://repo.example', email: 'new@example.com', password: 'correct horse battery' });
    await initPopup(document, rig.fake);
    expect(text('connection')).toBe('Connected as new@example.com');
    expect(text('open-setup')).toBe('Finish setup (choose a language)');
  });

  it('shows the offline state and the last error', async () => {
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.offline.value = true;
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.page({ type: MSG.syncNow });
    await initPopup(document, rig.fake);
    expect(text('sync-detail')).toMatch(/fetch/i);
    expect($('sync').classList.contains('warn')).toBe(true);
  });

  it('clearing the device (the setup page\'s Privacy screen sends MSG.clearLocal) also clears the unsent queue and the caches, and does not sign the learner out', async () => {
    await rig.signUp();
    await rig.connect();
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.page({ type: MSG.clearLocal });
    const keys = Object.keys(await rig.fake.local.get(null));
    expect(keys.filter((k) => k.startsWith('golearn:event:') || k.startsWith('queue:'))).toEqual([]);
    expect(keys).toContain('golearn:session'); // deleting rows does not sign the learner out
  });
});
