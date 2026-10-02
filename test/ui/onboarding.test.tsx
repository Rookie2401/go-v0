// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { COURSES, LANGUAGE_ROWS, createMemoryStore } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { Gate } from '../../src/ui/Onboarding';
import { button, byLabel, choose, click, makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

/** A first run: languages and courses are seeded, but nobody has been created yet. */
async function firstRun() {
  const h = await makeHarness();
  const store = createMemoryStore();
  await store.languages.bulkPut(LANGUAGE_ROWS);
  await store.courses.bulkPut(COURSES);
  const services = { ...h.services, store };
  const app = <Gate services={services} user={null} course={null}><Shell><AppRoutes /></Shell></Gate>;
  return { h, store, app };
}

describe('Team onboarding', () => {
  it('opens on one choice, "Select your team"; then lists the five countries, each with the language its team learns', async () => {
    const { h, app } = await firstRun();
    mounted = await h.mount(app);
    expect(q(mounted.container, 'h1.home__title')!.textContent).toBe('Go');
    expect(mounted.container.textContent).not.toContain('Which team are you on?');
    expect(qa(mounted.container, '.onboarding__team')).toHaveLength(0);
    await click(button(mounted.container, 'Select your team'));
    expect(mounted.container.textContent).toContain('Which team are you on?');
    expect(qa(mounted.container, '.onboarding__country').map((o) => o.textContent)).toEqual(['Honduras', 'Albania', 'Thailand', 'India', 'Germany']);
    expect(qa(mounted.container, '.onboarding__lang').map((o) => o.textContent)).toEqual(['Spanish', 'Albanian', 'Thai', 'Hindi', 'German']);
    expect(q(mounted.container, 'nav')).toBeNull(); // not Home yet
    // Back returns to the first screen
    await click(button(mounted.container, 'Back'));
    expect(mounted.container.textContent).not.toContain('Which team are you on?');
    expect(button(mounted.container, 'Select your team')).toBeDefined();
  });

  it('choosing Thailand creates the learner for that course and opens Home on "Thailand team · Thai"', async () => {
    const { h, store, app } = await firstRun();
    mounted = await h.mount(app);
    expect(await store.users.count()).toBe(0);
    await click(button(mounted.container, 'Select your team'));
    await click(button(mounted.container, 'Thailand'));
    const users = await store.users.all();
    expect(users).toHaveLength(1);
    expect(users[0].courseId).toBe('thailand-th');
    expect(localStorage.getItem('go-v0:chosen-course')).toBe('thailand-th');
    expect(q(mounted.container, '.home__title')!.textContent).toBe('Go');
    expect(q(mounted.container, '.home__course')!.textContent).toBe('Thailand team · Thai');
    expect(mounted.container.textContent).not.toContain('Which team are you on?');
  });

  it('skips onboarding when a learner already exists', async () => {
    const h = await makeHarness();
    const user = (await h.store.users.get('u1'))!;
    const course = (await h.store.courses.get(user.courseId))!;
    mounted = await h.mount(<Gate services={h.services} user={user} course={course}><Shell><AppRoutes /></Shell></Gate>);
    expect(mounted.container.textContent).not.toContain('Which team are you on?');
    expect(q(mounted.container, '.home__course')!.textContent).toBe('Honduras team · Spanish');
  });

  it('Settings switches the team, and with it the course and language', async () => {
    const h = await makeHarness();
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/settings' });
    expect(byLabel<HTMLSelectElement>(mounted.container, 'Team').value).toBe('honduras-es');
    await choose(byLabel<HTMLSelectElement>(mounted.container, 'Team'), 'germany-de');
    expect((await h.store.users.get('u1'))!.courseId).toBe('germany-de');
    expect(q(mounted.container, '.who')!.textContent).toContain('DE');
    expect(mounted.container.textContent).toContain('You are learning German');
  });
});
