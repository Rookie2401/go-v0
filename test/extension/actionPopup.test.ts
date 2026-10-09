// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import { MSG, type TabState } from '../../packages/golearn-extension/src/platform';
import { buildSelectionEvent, createStorageEncounterStore } from '../../packages/golearn-extension/src/store';
import { createStorageMetricsStore } from '../../packages/golearn-extension/src/metrics';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { createChromeFake, type ChromeFake } from './chromeFake';
import { flush } from './dom';

const html = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let fake: ChromeFake;
beforeEach(() => { document.body.innerHTML = body; fake = createChromeFake(); });

const addEvent = async (word: string) => {
  const card = parseSelection({ surface: word, context: { kind: 'none', confidence: 0 } });
  const e = buildSelectionEvent({ card, readerId: 'web-generic', identity: { learnerId: 'l', enrolmentId: 'e', deviceId: 'd' }, version: '0.0.1', sessionId: 's', now: new Date() });
  await createStorageEncounterStore(fake.local).append(e);
};

describe('action popup page', () => {
  it('is a page with a script and no inline script; the language is read from the enrolment, not chosen here', () => {
    expect(document.querySelector('#language select, select#language')).toBeNull();
    expect(html).toContain('<script src="popup.js"></script>');
    expect(html).not.toMatch(/<script>[^<]/); // no inline script (extension pages forbid it)
  });

  it('shows the encounter counter from storage', async () => {
    await addEvent('libër'); await addEvent('mace');
    await initPopup(document, fake);
    expect($('count').textContent).toBe('2');
  });

  it('the switch goes through the background: on injects and shows on; permission denial shows one line', async () => {
    createBackground(fake).register();
    fake.tabListeners.add((_m, _s, send) => { send({ ok: true }); return true; });
    await initPopup(document, fake);
    const toggle = $<HTMLInputElement>('enabled');
    expect(toggle.checked).toBe(false);
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await flush(30);
    expect(toggle.checked).toBe(true);
    expect(fake.messagesToTabs.map((m) => (m.message as { type: string }).type)).toContain(MSG.enable);
    expect($('error').textContent).toBe('');

    fake.failInjection(new Error('Cannot access contents of url "chrome://settings"'));
    toggle.checked = false; toggle.dispatchEvent(new Event('change')); await flush(30);
    toggle.checked = true; toggle.dispatchEvent(new Event('change')); await flush(30);
    expect(toggle.checked).toBe(false);
    expect($('error').textContent).toBe('GoLearn is not allowed to read this page.');
  });

  it('reads the saved state for the tab when it opens', async () => {
    createBackground(fake).register();
    await fake.sessionArea.set({ [`golearn:tab:${fake.activeTabId}`]: { enabled: true } satisfies TabState });
    await initPopup(document, fake);
    expect($<HTMLInputElement>('enabled').checked).toBe(true);
  });

  it('export prints the rows and the metrics as JSON; delete needs two clicks', async () => {
    await addEvent('libër');
    await createStorageMetricsStore(fake.local).append({
      id: 'm1', at: '2026-10-08T10:00:00.000Z', readerId: 'web-generic', contextKind: 'sentence', tokenCount: 1, contextChars: 20, coldStart: true,
      t: { selectionObtained: 1 }, dt: { selectionObtained: 1 }, memory: null, outcome: 'shown',
    });
    await initPopup(document, fake);
    $('export-events').click(); await flush(10);
    const out = $<HTMLTextAreaElement>('output');
    expect(out.hidden).toBe(false);
    expect(JSON.parse(out.value)).toHaveLength(1);
    expect(JSON.parse(out.value)[0].kind).toBe('SelectionLookedUp');
    $('export-metrics').click(); await flush(10);
    const m = JSON.parse(out.value);
    expect(m.summary.count).toBe(1);
    expect(m.rows[0].id).toBe('m1');

    $('delete-all').click(); await flush(10);
    expect($('count').textContent).toBe('1'); // armed, not yet deleted
    expect($('delete-all').textContent).toMatch(/again/);
    $('delete-all').click(); await flush(20);
    expect($('count').textContent).toBe('0');
    expect(out.hidden).toBe(true);
  });

  it('A-21 the two-step delete says what the first click did in a live region, and leaving the button cancels it', async () => {
    await addEvent('zog');
    await initPopup(document, fake as never);
    const del = $<HTMLButtonElement>('delete-all');
    const note = $('delete-note');
    expect(note.getAttribute('role')).toBe('status');
    del.focus(); del.click(); await flush(10);
    expect(del.textContent).toBe('Click again to delete');
    expect(note.textContent).toMatch(/Click Delete all rows again to delete/);
    // moving on cancels: nothing is deleted, the button is back to its label, and the note says so
    del.blur(); await flush(5);
    expect(del.textContent).toBe('Delete all rows');
    expect(note.textContent).toBe('Nothing was deleted.');
    expect($('count').textContent).toBe('1');
    // a full two-click delete is announced too
    del.click(); del.click(); await flush(20);
    expect($('count').textContent).toBe('0');
    expect(note.textContent).toBe('All rows on this device were deleted.');
  });

  it('A-02 / A-05 the popup sizes its text in rem and has a dark-theme colour for error and warning text', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
    expect(style).not.toMatch(/font(-size)?:[^;}]*\d+px/);
    expect(style).toMatch(/prefers-color-scheme: dark\) \{ \.err, \.status-line\.warn \{ color: #ff9a9a; \}/);
  });
});
