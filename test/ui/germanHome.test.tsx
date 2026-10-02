// @vitest-environment jsdom
// Home and Explore for the German course. Uses the same fakes as the Spanish Home test: a small in-memory library, a scripted
// GoLearn.rankLibrary, and the catalogue's streams passed to the harness.
import { afterEach, describe, expect, it } from 'vitest';
import { COURSE_DOORS } from '../../src/course/doors';
import { GERMAN_COURSE_ID, GERMAN_DOORS, GERMAN_STREAMS } from '../../src/course/german';
import { AppRoutes, Shell } from '../../src/ui/App';
import { doorsFor } from '../../src/ui/course/catalogue';
import { catalogText, flush, makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;
const german = (o: Parameters<typeof makeHarness>[0] = {}) => makeHarness({ courseId: GERMAN_COURSE_ID, streams: GERMAN_STREAMS, ...o });
const noWorks = async () => ({ total: 0, items: [] });

const LIB = [
  catalogText({ id: 'text:de:weg-1-01', lang: 'de', title: 'Anna und das Buch', stream: 'acquisition' }),
  catalogText({ id: 'text:de:gespraech-1-01', lang: 'de', title: 'Guten Tag', stream: 'conversation', streams: ['conversation', 'acquisition'] }),
  catalogText({ id: 'text:de:deutschland-1-01', lang: 'de', title: 'Mit der Bahn', stream: 'germany', streams: ['germany'] }),
];

describe('Home for the German course', () => {
  it('offers the German doors that are available, says honestly when one is empty, and never shows Listen', async () => {
    const h = await german({ library: LIB });
    h.services.catalog = { ...h.services.catalog, findWorks: noWorks }; // only the library's own texts count here
    mounted = await h.mount(app());
    await flush(8);
    const doors = qa(mounted.container, 'a.door');
    const keys = doors.map((d) => d.getAttribute('data-door'));
    expect(keys).toEqual(GERMAN_DOORS.map((d) => d.key).filter((k) => k !== 'bible')); // Bible is the Scripture entry above
    expect(keys).not.toContain('listening');
    expect(mounted.container.textContent).not.toMatch(/\bListen\b/);
    expect(q(mounted.container, '[data-testid="door-sub-conversation"]')!.textContent).toBe('1 text');
    expect(q(mounted.container, '[data-testid="door-sub-germany"]')!.textContent).toBe('1 text');
    expect(q(mounted.container, '[data-testid="door-sub-theology"]')!.textContent).toBe('Nothing here yet');
    expect(doors.find((d) => d.getAttribute('data-door') === 'germany')!.getAttribute('href')).toBe('/explore/germany');
    expect(doors.find((d) => d.getAttribute('data-door') === 'your-books')!.getAttribute('href')).toBe('/books');
    expect(mounted.container.textContent).toContain('Germany');
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
