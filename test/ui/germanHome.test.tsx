// @vitest-environment jsdom
// Home and Explore for the German course. Uses the same fakes as the Spanish Home test: a small in-memory library, a scripted
// GoLearn.rankLibrary, and the catalogue's streams passed to the harness.
import { afterEach, describe, expect, it } from 'vitest';
import { COURSE_DOORS } from '../../src/course/doors';
import { GERMAN_COURSE_ID, GERMAN_DOORS, GERMAN_STREAMS } from '../../src/course/german';
import { AppRoutes, Shell } from '../../src/ui/App';
import { doorsFor } from '../../src/ui/course/catalogue';
import { catalogText, flush, makeHarness, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;
const german = (o: Parameters<typeof makeHarness>[0] = {}) => makeHarness({ courseId: GERMAN_COURSE_ID, streams: GERMAN_STREAMS, ...o });

const LIB = [
  catalogText({ id: 'text:de:weg-1-01', lang: 'de', title: 'Anna und das Buch', stream: 'acquisition' }),
  catalogText({ id: 'text:de:gespraech-1-01', lang: 'de', title: 'Guten Tag', stream: 'conversation', streams: ['conversation', 'acquisition'] }),
  catalogText({ id: 'text:de:deutschland-1-01', lang: 'de', title: 'Mit der Bahn', stream: 'germany', streams: ['germany'] }),
];

describe('German Home directory', () => {
  it('keeps the three primary surfaces and no catalogue doors', async () => {
    const h = await german({ library: LIB });
    mounted = await h.mount(app());
    await flush(8);
    // "Your path" is the ladder entry, shown because the German course has a ladder (hasLadder): a primary surface, not a door
    expect(qa(mounted.container, 'nav[aria-label="Start here"] .home__entry-name').map((x) => x.textContent)).toEqual(['Reading', 'Your path', 'Scripture', 'Testimony', 'Team Texts']);
    expect(qa(mounted.container, 'a.door')).toHaveLength(0);
  });
});

describe('doors are a per-course table', () => {
  it('each course with a door list gets its own; a course without one gets a door per available stream', () => {
    expect(COURSE_DOORS[GERMAN_COURSE_ID]).toBe(GERMAN_DOORS);
    expect(doorsFor(GERMAN_COURSE_ID, GERMAN_STREAMS).map((d) => d.key)).toEqual(GERMAN_DOORS.map((d) => d.key));
    const other = doorsFor('some-course', GERMAN_STREAMS).map((d) => d.key);
    expect(other).toEqual(GERMAN_STREAMS.filter((s) => s.available && s.kind !== 'personal').map((s) => s.key));
    expect(other).not.toContain('listening');
  });
});
