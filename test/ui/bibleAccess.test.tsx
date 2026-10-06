// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BibleAccess } from '../../src/ui/course/BibleAccess';
import { AppRoutes, Shell } from '../../src/ui/App';
import { flush, makeHarness, q } from './harness';

describe('Bible access', () => {
  it('identifies the linked Albanian edition and the limits of ordinary personal imports', () => {
    const html = renderToStaticMarkup(<BibleAccess lang="sq" />);
    expect(html).toContain('not bundled');
    expect(html).toContain('No approved Albanian Bible text is available in GoLearn’s Scripture library.');
    expect(html).toContain('Copyright and permission to bundle or redistribute are not established.');
    expect(html).toContain('href="https://www.bible.com/versions/3631"');
    expect(html).toContain('separate from');
    expect(html).toContain('do not yet have Bible verse navigation');
  });

  it('provides the Albanian reading route even without any imported Scripture', async () => {
    const h = await makeHarness({ courseId: 'albania-sq' });
    const mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/scripture' });
    try {
      await flush(8);
      expect(q(mounted.container, 'a[href="https://www.bible.com/versions/3631"]')?.textContent).toBe('Read on YouVersion');
      expect(mounted.container.textContent).toContain('separate from the catalogue’s ALB and historical editions');
    } finally { await mounted.unmount(); }
  });
});
