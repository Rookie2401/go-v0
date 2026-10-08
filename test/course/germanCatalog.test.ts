/** The German catalogue: shelves as stages with help that fades along them; shelves never gate. */
import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids } from '../../src/core';
import { GERMAN_COURSE_ID, GERMAN_SHELVES, GERMAN_WORKS, createCourseCatalog } from '../../src/course';
import { GERMAN_ASSISTANCE, GERMAN_LADDER_SHELF } from '../../src/course/german';
import { shelfProfileSuite } from './shelfProfileSuite';

const C = GERMAN_COURSE_ID;

describe('German shelves', () => {
  it('installs every shelf and every work, all shelves, each with its own profile', async () => {
    const store = createMemoryStore();
    const catalog = createCourseCatalog({ store });
    await catalog.install(C);
    expect((await catalog.stages(C)).map((s) => s.kind)).toEqual(GERMAN_SHELVES.map(() => 'shelf'));
    expect(await store.works.count()).toBe(GERMAN_WORKS.length);
    expect(new Set(GERMAN_SHELVES.map((s) => JSON.stringify(s.assistance))).size).toBeGreaterThanOrEqual(6);
    expect((await store.stages.get(ids.stage(C, 's0')))!.assistance.englishRescue).toBe('easy');
    expect((await store.stages.get(ids.stage(C, 's12')))!.assistance.englishRescue).toBe('deep');
  });
});

shelfProfileSuite({
  name: 'German', courseId: C, lang: 'de', shelves: GERMAN_SHELVES, assistance: GERMAN_ASSISTANCE, ladderShelf: GERMAN_LADDER_SHELF, works: GERMAN_WORKS,
  definitions: true, openKeys: ['s13'], graded: true, easy: ['s0', 's1', 's2'], deep: ['s9', 's10', 's11', 's12'],
});
