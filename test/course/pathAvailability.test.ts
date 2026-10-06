import { describe, expect, it } from 'vitest';
import { buildFixtureText, createMemoryStore } from '../../src/core';
import { createCourseCatalog } from '../../src/course/catalog';
import { assertPublishedStage, StagePublicationError } from '../../src/course/curriculumPolicy';
import { loadCoursePath } from '../../src/course/pathAvailability';
import { SPANISH_SHELVES, SPANISH_WORKS } from '../../src/course/spanish';
import { createLibrary } from '../../src/library';
import { putCatalogRows } from '../../src/library/postings';
import { catalogRow, registry } from '../library/helpers';

const stage = SPANISH_SHELVES[0];
const work = { ...SPANISH_WORKS[0], stageId: stage.id, role: 'spine' as const, rights: { ...SPANISH_WORKS[0].rights, state: 'course-authored' as const, canBundle: true, verified: true } };
async function fixture() {
  const store = createMemoryStore();
  await store.stages.put(stage);
  await store.works.put(work);
  const catalog = createCourseCatalog({ store });
  const library = createLibrary({ store, adapters: registry, fetch: (async () => new Response('', { status: 404 })) as typeof fetch });
  return { store, catalog, library };
}
describe('actual published course path availability', () => {
  it('uses canonical Work placement when an older lazy index omits its stage', async () => {
    const f = await fixture();
    await putCatalogRows(f.store, [catalogRow(400, { workId: work.id, stageId: undefined, published: true })], '2026-10-04');
    const result = await loadCoursePath(f.catalog, f.library, stage.courseId);
    expect(result[0]).toMatchObject({ available: true, publishedWorks: 1 });
    expect(result[0].texts).toHaveLength(1);
  });
  it('an existing stage and its recommended works cannot masquerade as an accessible pathway', async () => {
    const f = await fixture();
    const result = await loadCoursePath(f.catalog, f.library, stage.courseId);
    expect(result[0]).toMatchObject({ available: false, publishedWorks: 0, texts: [], tokens: 0 });
    expect(result[0].works).toHaveLength(1);
    expect(() => assertPublishedStage(stage, [work], [])).toThrow(StagePublicationError);
    try { assertPublishedStage(stage, [work], []); } catch (e) { expect(e).toMatchObject({ stageId: stage.id, reasons: ['No accessible published secular acquisition text in this stage'] }); }
  });
  it('pages every accessible chapter and counts distinct works, excluding candidates, private rows and Scripture', async () => {
    const f = await fixture();
    const rows = Array.from({ length: 205 }, (_, n) => catalogRow(n, { stageId: stage.id, workId: work.id, published: true, features: { words: 2, sentences: 1, uniqueForms: 2, meanSentenceWords: 2 } }));
    rows.push(catalogRow(300, { stageId: stage.id, workId: work.id, published: false }));
    rows.push(catalogRow(301, { stageId: stage.id, workId: work.id, published: true, stream: 'scripture', streams: ['scripture'] }));
    await putCatalogRows(f.store, rows, '2026-10-04');
    const privateText = await buildFixtureText(f.store, { lang: 'es', slug: 'private-path', sentences: [{ tokens: [{ surface: 'casa', lemma: 'casa', pos: 'NOUN' }] }] });
    await f.store.texts.put({ ...privateText, workId: work.id, personalCopy: true });
    const protectedText = await buildFixtureText(f.store, { lang: 'es', slug: 'assessment-path', sentences: [{ tokens: [{ surface: 'casa', lemma: 'casa', pos: 'NOUN' }] }] });
    await f.store.texts.put({ ...protectedText, workId: work.id, readingAssessmentId: 'assessment:path' });
    await f.library.indexStore('es');
    const result = await loadCoursePath(f.catalog, f.library, stage.courseId);
    expect(result[0]).toMatchObject({ available: true, publishedWorks: 1, tokens: 410 });
    expect(result[0].texts).toHaveLength(205);
    expect(result[0].texts.map(t => t.id)).not.toContain(privateText.id);
    expect(result[0].texts.map(t => t.id)).not.toContain(protectedText.id);
  });
  it('keeps held material visible as editorial gaps and checks real accessibility when declaring publication', async () => {
    const f = await fixture();
    const text = await buildFixtureText(f.store, { lang: 'es', slug: 'held-path', sentences: [{ tokens: [{ surface: 'casa', lemma: 'casa', pos: 'NOUN' }] }] });
    await f.store.texts.put({ ...text, workId: work.id, published: false, unpublishedReasons: ['Needs native review'] });
    await f.library.indexStore('es');
    const result = await loadCoursePath(f.catalog, f.library, stage.courseId);
    expect(result[0].heldTexts.map(t => t.id)).toEqual([text.id]);
    expect(result[0].available).toBe(false);
    const published = { ...text, workId: work.id };
    expect(() => assertPublishedStage(stage, [work], [published], new Map(), () => false)).toThrow(StagePublicationError);
    expect(assertPublishedStage(stage, [work], [published])).toMatchObject({ published: true, textCount: 1, workCount: 1 });
  });
});
