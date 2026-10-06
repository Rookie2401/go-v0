// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { AppRoutes, Shell } from '../../src/ui/App';
import { makeHarness, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

describe('Home directory', () => {
  it('contains only the three primary surfaces', async () => {
    const h = await makeHarness();
    mounted = await h.mount(<Shell><AppRoutes /></Shell>);
    expect(qa(mounted.container, 'nav[aria-label="Start here"] .home__entry-name').map((x) => x.textContent)).toEqual(['Reading', 'Your path', 'GoListen', 'Scripture', 'Testimony', 'Team Texts']);
    expect(qa(mounted.container, 'a[href^="/read/"]')).toHaveLength(0);
  });
});
