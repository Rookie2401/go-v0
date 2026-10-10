// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import { createChromeFake, type ChromeFake } from './chromeFake';

const html = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let fake: ChromeFake;
beforeEach(() => { document.body.innerHTML = body; fake = createChromeFake(); });

describe('action popup page', () => {
  it('is a page with a script and no inline script; the language is read from the enrolment, not chosen here', () => {
    expect(document.querySelector('#language select, select#language')).toBeNull();
    expect(html).toContain('<script src="popup.js"></script>');
    expect(html).not.toMatch(/<script>[^<]/); // no inline script (extension pages forbid it)
  });

  it('has one switch (GoLearn Active) and no housekeeping controls: no per-tab switch, no export, no delete, no counter to read (the owner, 2026-10-09)', async () => {
    await initPopup(document, fake);
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect($('active')).toBeTruthy();
    for (const id of ['enabled', 'speak', 'active-revoke', 'count', 'export-events', 'export-metrics', 'delete-all', 'delete-note', 'output']) expect(document.getElementById(id), id).toBeNull();
    expect([...document.querySelectorAll('button')].map((b) => b.id).sort()).toEqual(['open-setup', 'practise', 'sync-now']);
    expect(html).toMatch(/export and deletion are in the setup page under Privacy/);
  });

  it('A-02 / A-05 the popup sizes its text in rem and has a dark-theme colour for error and warning text', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
    expect(style).not.toMatch(/font(-size)?:[^;}]*\d+px/);
    expect(style).toMatch(/prefers-color-scheme: dark\) \{ \.err, \.status-line\.warn \{ color: #ff9a9a; \}/);
  });
});
