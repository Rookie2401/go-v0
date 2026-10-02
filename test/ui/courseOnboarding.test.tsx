// @vitest-environment jsdom
// Uses: the real createCourseCatalog on the (empty) memory store the first run starts with; everything else is the harness.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COURSES, LANGUAGE_ROWS, createMemoryStore } from '../../src/core';
import { THAI_COURSE_ID, THAI_STAGES, createCourseCatalog } from '../../src/course';
import { AppRoutes, Shell } from '../../src/ui/App';
import { Gate } from '../../src/ui/Onboarding';
import { button, byLabel, choose, click, makeHarness, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

async function firstRun() {
  const h = await makeHarness();
  const store = createMemoryStore();
  await store.languages.bulkPut(LANGUAGE_ROWS);
  await store.courses.bulkPut(COURSES);
  // no course was known at startup, so nothing has installed a ladder
  const services = { ...h.services, store, catalog: createCourseCatalog({ store }) };
  return { h, store, services, app: <Gate services={services} user={null} course={null}><Shell><AppRoutes /></Shell></Gate> };
}

describe('choosing a team on a first run', () => {
  it('Thailand: Home shows the "Reading ladder" door at once, and /course has its stages (no reload)', async () => {
    const { h, store, services, app } = await firstRun();
    expect(await services.catalog.stages(THAI_COURSE_ID)).toHaveLength(0);
    mounted = await h.mount(app);
    await choose(byLabel<HTMLSelectElement>(mounted.container, 'Team'), THAI_COURSE_ID);
    await click(button(mounted.container, 'Begin'));
    const door = qa(mounted.container, 'a.home__entry').find((a) => a.getAttribute('href') === '/course')!;
    expect(door).toBeDefined();
    expect(door.textContent).toContain('Reading ladder');
    expect(door.textContent).toContain(THAI_STAGES[0].label);
    expect((await store.stages.all()).length).toBe(THAI_STAGES.length);
  });

  it('prepares the chosen course before Home: its texts are asked for once, "Preparing your texts…" shows meanwhile, and Home opens when it is done', async () => {
    const { h, services } = await firstRun();
    const calls: string[] = [];
    let done!: () => void;
    const prepared = new Promise<void>((resolve) => { done = resolve; });
    const withContent = { ...services, content: { ensureCourse: async (courseId: string) => { calls.push(courseId); await services.catalog.install(courseId); await prepared; } } };
    mounted = await h.mount(<Gate services={withContent} user={null} course={null}><Shell><AppRoutes /></Shell></Gate>);
    await choose(byLabel<HTMLSelectElement>(mounted.container, 'Team'), THAI_COURSE_ID);
    await click(button(mounted.container, 'Begin'));
    expect(calls).toEqual([THAI_COURSE_ID]);
    // still on the first-run screen, saying what it is doing; the button cannot be pressed twice
    expect(mounted.container.querySelector('[data-testid="preparing"]')?.textContent).toBe('Preparing your texts…');
    expect(button(mounted.container, 'Begin').disabled).toBe(true);
    expect(qa(mounted.container, 'a.home__entry')).toHaveLength(0);
    done();
    await vi.waitFor(() => expect(qa(mounted!.container, 'a.home__entry').length).toBeGreaterThan(0));
    expect(mounted.container.querySelector('[data-testid="preparing"]')).toBeNull();
    expect(calls).toEqual([THAI_COURSE_ID]);
  });

  it('Honduras: no ladder door', async () => {
    const { h, app } = await firstRun();
    mounted = await h.mount(app);
    await click(button(mounted.container, 'Begin'));
    expect(qa(mounted.container, 'a').some((a) => a.getAttribute('href') === '/course')).toBe(false);
  });
});
