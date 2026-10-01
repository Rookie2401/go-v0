/** The Spanish catalogue: shelves as stages, streams, works paged and filtered; shelves never gate and never change the reader. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANCE, buildFixtureText, createMemoryStore, ids } from '../../src/core';
import type { Work } from '../../src/core';
import {
  SPANISH_COURSE_ID, SPANISH_SHELVES, SPANISH_STREAMS, SPANISH_WORKS, THAI_COURSE_ID, THAI_STAGES, createCourseCatalog,
} from '../../src/course';

const C = SPANISH_COURSE_ID;
const U = 'u1';

async function installed() {
  const store = createMemoryStore();
  const catalog = createCourseCatalog({ store });
  await catalog.install(C);
  return { store, catalog };
}

describe('install and the ladder of shelves', () => {
  it('installs every shelf and every work; idempotent', async () => {
    const { store, catalog } = await installed();
    expect(await store.stages.count()).toBe(SPANISH_SHELVES.length);
    expect(await store.works.count()).toBe(SPANISH_WORKS.length);
    expect((await catalog.stages(C)).map((s) => s.kind)).toEqual(SPANISH_SHELVES.map(() => 'shelf'));
    const snap = async () => JSON.stringify([(await store.works.all()).sort((a, b) => (a.id < b.id ? -1 : 1)), (await store.stages.all()).sort((a, b) => (a.id < b.id ? -1 : 1))]);
    const once = await snap();
    await catalog.install(C);
    expect(await snap()).toBe(once);
  });

  it('keeps rights a person has verified, as for every course', async () => {
    const { store, catalog } = await installed();
    const w = SPANISH_WORKS.find((x) => x.rights.state === 'rights-unverified')!;
    const stored = (await store.works.get(w.id))!;
    await store.works.put({ ...stored, rights: { ...stored.rights, state: 'verified-public-domain', verified: true, verifiedBy: 'a reviewer' } });
    await catalog.install(C);
    expect((await store.works.get(w.id))!.rights).toMatchObject({ state: 'verified-public-domain', verified: true, verifiedBy: 'a reviewer' });
  });

  it('the Thai ladder is unchanged, and installing Spanish adds nothing to it', async () => {
    const { store, catalog } = await installed();
    await catalog.install(THAI_COURSE_ID);
    expect((await catalog.stages(THAI_COURSE_ID)).map((s) => s.key)).toEqual(THAI_STAGES.map((s) => s.key));
    expect((await catalog.stages(C)).length).toBe(SPANISH_SHELVES.length);
    expect((await store.works.where('courseId', THAI_COURSE_ID)).length).toBeGreaterThan(0);
    expect(await catalog.streams(THAI_COURSE_ID)).toEqual([]);
  });
});

describe('streams', () => {
  it('the Spanish streams in order, with the engine-off one kept as data; none for other courses', async () => {
    const { catalog } = await installed();
    const streams = await catalog.streams(C);
    expect(streams.map((s) => s.key)).toEqual(SPANISH_STREAMS.map((s) => s.key));
    expect(streams.map((s) => s.order)).toEqual([...streams.map((s) => s.order)].sort((a, b) => a - b));
    expect(streams.find((s) => s.key === 'listening')!.available).toBe(false);
    expect(await catalog.streams('albania-sq')).toEqual([]);
    streams[0].label = 'changed'; // a copy: the data is not shared
    expect((await catalog.streams(C))[0].label).not.toBe('changed');
  });
});

describe('findWorks', () => {
  it('pages the works of a course without returning them all, and reports the total', async () => {
    const { catalog } = await installed();
    const first = await catalog.findWorks({ courseId: C, limit: 10 });
    expect(first.total).toBe(SPANISH_WORKS.length);
    expect(first.items).toHaveLength(10);
    const second = await catalog.findWorks({ courseId: C, limit: 10, offset: 10 });
    expect(second.items.map((w) => w.id)).not.toEqual(first.items.map((w) => w.id));
    const all: Work[] = [];
    for (let o = 0; o < first.total; o += 50) all.push(...(await catalog.findWorks({ courseId: C, limit: 50, offset: o })).items);
    expect(all.map((w) => w.id)).toEqual((await catalog.works(C)).map((w) => w.id)); // the same order as works()
    expect((await catalog.findWorks({ courseId: C, limit: 100000 })).items.length).toBeLessThanOrEqual(200);
    expect((await catalog.findWorks({ courseId: C, offset: 100000 })).items).toEqual([]);
    expect((await catalog.findWorks({ courseId: 'albania-sq' })).total).toBe(0);
  });

  it('filters by stream, shelf, domain, variety and rights; each filter only narrows', async () => {
    const { catalog } = await installed();
    const total = SPANISH_WORKS.length;
    const acq = await catalog.findWorks({ courseId: C, stream: 'acquisition', limit: 200 });
    expect(acq.total).toBe(SPANISH_WORKS.filter((w) => (w.streams ?? []).includes('acquisition')).length);
    expect(acq.total).toBeGreaterThan(0);
    expect(acq.total).toBeLessThan(total);
    const shelf = await catalog.findWorks({ courseId: C, stageId: ids.stage(C, 's2'), limit: 200 });
    expect(shelf.items.every((w) => w.stageId === ids.stage(C, 's2'))).toBe(true);
    const history = await catalog.findWorks({ courseId: C, domain: 'history', limit: 200 });
    expect(history.total).toBe(SPANISH_WORKS.filter((w) => (w.domains ?? []).includes('history')).length);
    const hn = await catalog.findWorks({ courseId: C, variety: 'es-HN', limit: 200 });
    expect(hn.items.every((w) => w.variety === 'es-HN')).toBe(true);
    const unverified = await catalog.findWorks({ courseId: C, rights: 'rights-unverified', limit: 200 });
    expect(unverified.items.every((w) => w.rights.state === 'rights-unverified')).toBe(true);
    const both = await catalog.findWorks({ courseId: C, stream: 'acquisition', variety: 'es-HN', limit: 200 });
    expect(both.total).toBeLessThanOrEqual(Math.min(acq.total, hn.total));
  });

  it('text search matches title and author without regard to accents or case', async () => {
    const { catalog } = await installed();
    expect((await catalog.findWorks({ courseId: C, text: 'edad de oro' })).items.map((w) => w.title)).toContain('La Edad de Oro');
    expect((await catalog.findWorks({ courseId: C, text: 'EDAD DE ORO' })).total).toBeGreaterThan(0);
    const byAuthor = await catalog.findWorks({ courseId: C, text: 'marti' }); // the author is written with an accent
    expect(byAuthor.items.some((w) => w.author?.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('marti'))).toBe(true);
    expect((await catalog.findWorks({ courseId: C, text: 'zzzz no such work' })).total).toBe(0);
  });
});

describe('shelves never gate and never change the reader', () => {
  it('there is no current stage in a course whose stages are all shelves, even with a stored choice', async () => {
    const { store, catalog } = await installed();
    expect(await catalog.currentStage(U, C)).toBeUndefined();
    await catalog.setCurrentStage(U, C, ids.stage(C, 's3'));
    expect(await catalog.currentStage(U, C)).toBeUndefined();
    expect(await store.stages.count()).toBe(SPANISH_SHELVES.length);
  });

  it('assistanceFor returns the default word sheet for a text on any shelf, with or without a current stage', async () => {
    const { store, catalog } = await installed();
    const work = SPANISH_WORKS.find((w) => w.stageId === ids.stage(C, 's4'))!;
    const text = await buildFixtureText(store, { lang: 'es', slug: 'on-a-shelf', sentences: [{ tokens: [{ surface: 'uno' }] }] });
    await store.texts.put({ ...text, workId: work.id });
    expect((await catalog.stageOfText(text.id))!.kind).toBe('shelf');
    expect(await catalog.assistanceFor({ courseId: C, textId: text.id })).toEqual(DEFAULT_ASSISTANCE);
    expect(await catalog.assistanceFor({ courseId: C, currentStageId: ids.stage(C, 's6') })).toEqual(DEFAULT_ASSISTANCE);
    expect(await catalog.assistanceFor({ courseId: C })).toEqual(DEFAULT_ASSISTANCE);
  });

  it('textsOf works for a Spanish work like any other', async () => {
    const { store, catalog } = await installed();
    const work = SPANISH_WORKS[0];
    const t = await buildFixtureText(store, { lang: 'es', slug: 'cap-1', sentences: [{ tokens: [{ surface: 'uno' }] }] });
    await store.texts.put({ ...t, workId: work.id, chapter: { index: 1 } });
    expect((await catalog.textsOf(work.id)).map((x) => x.id)).toEqual([t.id]);
  });
});
