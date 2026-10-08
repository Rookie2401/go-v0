/** The Norwegian catalogue: shelves as stages with help that fades along them (no target-language definitions: there is no dictionary for them yet). */
import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids } from '../../src/core';
import { NORWEGIAN_COURSE_ID, NORWEGIAN_SHELVES, NORWEGIAN_WORKS, createCourseCatalog } from '../../src/course';
import { NORWEGIAN_ASSISTANCE, NORWEGIAN_LADDER_SHELF } from '../../src/course/norwegian';
import { shelfProfileSuite } from './shelfProfileSuite';

const C = NORWEGIAN_COURSE_ID;

describe('Norwegian shelves', () => {
  it('installs every shelf and every work, all shelves, with a gloss-first profile and no target-language definitions', async () => {
    const store = createMemoryStore();
    const catalog = createCourseCatalog({ store });
    await catalog.install(C);
    expect((await catalog.stages(C)).map((s) => s.kind)).toEqual(NORWEGIAN_SHELVES.map(() => 'shelf'));
    expect(await store.works.count()).toBe(NORWEGIAN_WORKS.length);
    expect((await store.stages.get(ids.stage(C, 's0')))!.assistance).toMatchObject({ englishRescue: 'easy', targetLanguageDefinitions: false, visibility: 'heavy' });
    expect((await store.stages.get(ids.stage(C, 's3')))!.assistance).toMatchObject({ englishRescue: 'deep', targetLanguageDefinitions: false, visibility: 'light' });
    for (const s of await catalog.stages(C)) expect(s.assistance.layers[0]).toBe('gloss');
  });
});

shelfProfileSuite({
  name: 'Norwegian', courseId: C, lang: 'nb', shelves: NORWEGIAN_SHELVES, assistance: NORWEGIAN_ASSISTANCE, ladderShelf: NORWEGIAN_LADDER_SHELF, works: NORWEGIAN_WORKS,
  definitions: false, openKeys: ['s6'], graded: false, easy: ['s0'], deep: ['s3'],
});
