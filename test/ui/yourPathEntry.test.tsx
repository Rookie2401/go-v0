// @vitest-environment jsdom
/** The "Your path" entry on Home: listed for a language with a bundled ladder (data/ladder/<lang>/ladder.json), not otherwise. */
import { afterEach, describe, expect, it } from 'vitest';
import { GERMAN_COURSE_ID, GERMAN_STREAMS } from '../../src/course/german';
import { AppRoutes, Shell } from '../../src/ui/App';
import { hasLadder } from '../../src/ui/read/hasLadder';
import { makeLadderSource } from '../../src/ladder/bundle';
import { makeHarness, qa } from './harness';
import type { Mounted } from './harness';

const app = () => <Shell><AppRoutes /></Shell>;
let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const homeNames = (m: Mounted) => qa(m.container, 'nav[aria-label="Start here"] .home__entry-name').map((x) => x.textContent);

describe('Your path on Home', () => {
  it('is listed after Reading for a language with a ladder (Spanish) and links to /path', async () => {
    expect(hasLadder('es')).toBe(true);
    const h = await makeHarness();
    mounted = await h.mount(app(), { router: '/' });
    expect(homeNames(mounted)).toEqual(['Reading', 'Your path', 'Scripture', 'Testimony', 'Team Texts']);
    expect(qa(mounted.container, 'nav[aria-label="Start here"] a').map((a) => a.getAttribute('href'))).toContain('/path');
  });

  it('is listed for German too, now that it has a ladder; a language with no bundled ladder has none', async () => {
    expect(hasLadder('de')).toBe(true);
    expect(hasLadder('de', makeLadderSource())).toBe(false); // no ladder files at all
    const h = await makeHarness({ courseId: GERMAN_COURSE_ID, streams: GERMAN_STREAMS });
    mounted = await h.mount(app(), { router: '/' });
    expect(homeNames(mounted)).toContain('Your path');
  });
});
