// @vitest-environment jsdom
/** GoLearn's Help page: the install line tells the truth until the store listing exists, and a contact shows only when there is one (audit 2026-11-03, P3, P4). */
import { describe, expect, it } from 'vitest';
import { render } from '../../packages/golearn-extension/app/screens/help';
import { loadConfig } from '../../packages/golearn-extension/app/config';

const page = (inExtension: boolean, config: object): HTMLElement => {
  const el = document.createElement('div');
  render(el, { inExtension, deps: { config } } as never, {} as never);
  return el;
};

describe('GoLearn Help', () => {
  it('on the website, says the extension is not in the store yet, until there is a link', () => {
    expect(page(false, {}).querySelector('#help-install-none')?.textContent).toContain('not on the Chrome Web Store yet');
    const listed = page(false, { extensionInstallUrl: 'https://chromewebstore.google.com/detail/x' });
    expect(listed.querySelector('#link-install')?.getAttribute('href')).toBe('https://chromewebstore.google.com/detail/x');
    expect(listed.querySelector('#help-install-none')).toBeNull();
  });

  it('inside the extension, says nothing about installing it', () => {
    const el = page(true, {});
    expect(el.querySelector('#help-install, #help-install-none')).toBeNull();
    expect(el.textContent).toContain('How do I practise what I looked up?');
  });

  it('shows a contact only when the build names one', () => {
    expect(page(true, {}).querySelector('#help-contact')).toBeNull();
    expect(page(true, { supportEmail: 'help@example.org' }).querySelector('#help-contact a')?.getAttribute('href')).toBe('mailto:help@example.org');
  });

  it('config takes only a real address and an https link', async () => {
    const from = (j: object) => loadConfig((async () => new Response(JSON.stringify(j))) as unknown as typeof fetch);
    expect(await from({ supportEmail: 'help@example.org', extensionInstallUrl: 'https://x.example/y' })).toMatchObject({ supportEmail: 'help@example.org', extensionInstallUrl: 'https://x.example/y' });
    const bad = await from({ supportEmail: 'x"><img>', extensionInstallUrl: 'javascript:alert(1)' });
    expect(bad.supportEmail).toBeUndefined();
    expect(bad.extensionInstallUrl).toBeUndefined();
  });
});
