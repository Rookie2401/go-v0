// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '../../packages/golearn-extension/app/screens/reader';
import type { AppContext } from '../../packages/golearn-extension/app/context';

describe('GoLearn hosted mobile companion guidance', () => {
  it('links to the existing share lookup and gives distinct Android and iOS home-screen steps', async () => {
    const el = document.createElement('main');
    const ctx = {
      deps: { chrome: undefined, config: { bibliaUrl: undefined } },
      changed() {},
    } as unknown as AppContext;

    await render(el, ctx, {} as never);

    expect(el.querySelector('#mobile-share-link')?.getAttribute('href')).toBe('#/share');
    const mobile = el.querySelector('#mobile-companion')?.textContent ?? '';
    expect(mobile).toContain('Android: Chrome');
    expect(mobile).toContain('Install app');
    expect(mobile).toContain('iPhone or iPad: Chrome');
    expect(mobile).toContain('Add to Home Screen');
    expect(mobile).toContain('Android only');
  });

  it('describes Active as persistent optional site access and explains account sync', async () => {
    const el = document.createElement('main');
    const ctx = {
      deps: { chrome: { runtime: { getManifest: () => ({ version: 'test' }) } }, config: { bibliaUrl: undefined } },
    } as unknown as AppContext;

    await render(el, ctx, {} as never);

    const text = el.textContent ?? '';
    expect(text).toContain('turn on “GoLearn Active”');
    expect(text).toContain('until you switch Active off or revoke access');
    expect(text).toContain('optional site access');
    expect(text).toContain('lookup and mark events sync to your GoLearn account');
    expect(text).not.toContain('There are no host permissions');
    expect(text).not.toContain('GoLearn on for this tab');
  });
});
