// @vitest-environment jsdom
/**
 * The action popup from the setup application's side (the owner, 2026-10-28): no Practise button any more (GoPractice stays a page of the
 * extension, reached from the setup page's status home), the brand as the one way to the setup page, and nothing about teams.
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
  it('has no Practise button and opens no tab of its own; the brand (GOLEARN →) is the one button, and it opens the setup page', async () => {
    document.body.innerHTML = body;
    const fake = createChromeFake();
    const opened: string[] = [];
    (fake.tabs as unknown as { create: (p: { url: string }) => Promise<void> }).create = async (p) => { opened.push(p.url); };
    await initPopup(document, fake as unknown as ChromeApi);
    expect(document.getElementById('practise')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Practise|no account needed/);
    const buttons = [...document.querySelectorAll('button')];
    expect(buttons.map((b) => b.id)).toEqual(['open-setup']);
    expect(buttons[0].getAttribute('aria-label')).toBe('Open GoLearn setup');
    expect(buttons[0].querySelector('.go-brand-mark')).not.toBeNull();
    expect(buttons[0].textContent).toBe('GoLearn→');
    buttons[0].click();
    expect(fake.options.opened).toBe(1);
    expect(opened).toEqual([]);
  });

  it('greets first: "Welcome" stands above the brand', async () => {
    document.body.innerHTML = body;
    await initPopup(document, createChromeFake() as unknown as ChromeApi);
    const welcome = document.getElementById('welcome')!;
    expect(welcome.textContent).toBe('Welcome');
    expect(welcome.nextElementSibling?.id).toBe('open-setup');
  });

  it('mentions no team, mission team or leader', () => {
    expect(html).not.toMatch(/team|leader/i);
  });
});
