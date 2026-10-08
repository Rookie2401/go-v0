// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SPANISH_COURSE_ID, SPANISH_DOORS, SPANISH_STREAMS } from '../../src/course/spanish';
import { AppRoutes, Shell } from '../../src/ui/App';
import { doorsFor } from '../../src/ui/course/catalogue';
import { makeHarness, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

describe('Spanish Home directory', () => {
  it('keeps reading navigation under the Reading surface', async () => {
    const h = await makeHarness({ courseId: SPANISH_COURSE_ID, streams: SPANISH_STREAMS });
    mounted = await h.mount(<Shell><AppRoutes /></Shell>);
    expect(qa(mounted.container, 'nav[aria-label="Start here"] .home__entry-name').map((x) => x.textContent)).toEqual(['Reading', 'Your path', 'Scripture', 'Testimony', 'Team Texts']);
    expect(qa(mounted.container, 'a.door')).toHaveLength(0);
  });
});

describe('Spanish stream metadata', () => {
  it('keeps the configured door order and hides listening', () => {
    expect(SPANISH_STREAMS.every((s) => s.courseId === SPANISH_COURSE_ID)).toBe(true);
    expect(doorsFor(SPANISH_COURSE_ID, SPANISH_STREAMS).map((d) => d.key)).toEqual(SPANISH_DOORS.map((d) => d.key));
  });
});
