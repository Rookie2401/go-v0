// @vitest-environment jsdom
/**
 * The action popup's “Practise” button: GoPractice is a page of the extension (dist/practice/), so the button opens the extension’s own address for it,
 * with no sign-in and nothing about teams in the popup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import type { ChromeApi } from '../../packages/golearn-extension/src/platform';
import { createChromeFake } from '../extension/chromeFake';

const html = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');

afterEach(() => { document.body.innerHTML = ''; });

describe('the popup', () => {
  it('has a Practise button that opens the extension’s GoPractice page in a new tab', async () => {
    document.body.innerHTML = body;
    const fake = createChromeFake();
    const opened: string[] = [];
    (fake.runtime as unknown as { getURL: (p: string) => string }).getURL = (p) => `chrome-extension://${fake.runtime.id}/${p}`;
    (fake.tabs as unknown as { create: (p: { url: string }) => Promise<void> }).create = async (p) => { opened.push(p.url); };
    await initPopup(document, fake as unknown as ChromeApi);
    const btn = document.getElementById('practise') as HTMLButtonElement;
    expect(btn.textContent).toBe('Practise');
    expect(document.body.textContent).toContain('no account needed');
    btn.click();
    expect(opened).toEqual([`chrome-extension://${fake.runtime.id}/practice/index.html`]);
  });

  it('says plainly when the extension cannot give the practice page’s address', async () => {
    document.body.innerHTML = body;
    const fake = createChromeFake();
    await initPopup(document, fake as unknown as ChromeApi);
    (document.getElementById('practise') as HTMLButtonElement).click();
    expect(document.getElementById('error')!.textContent).toBe('GoLearn could not find the practice page.');
  });

  it('mentions no team, mission team or leader', () => {
    expect(html).not.toMatch(/team|leader/i);
  });
});
