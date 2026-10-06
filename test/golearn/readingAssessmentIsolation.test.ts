import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import { createLibrary } from '../../src/library';
import { buildLibrary } from '../../src/library/build';
import { createSourceFinder } from '../../src/gotell/sources';
import { createHarness } from './harness';
import { profile } from './profiles';
import { COURSE, cleanInspect, courseDocuments, entry, memoryIO } from '../library/fixtures';
import { putCatalogRows } from '../../src/library/postings';
import { importDocuments } from '../../src/ingest';
import { baseDoc } from '../ingest/helpers';
import { parseShard } from '../../src/library/format';
import { catalogRow } from '../library/helpers';

async function fixture(protectedAtStart = true) {
  const h = createHarness();
  await h.seed();
  const text = await buildFixtureText(h.store, { lang: 'es', slug: 'heldout-reading', sentences: [{ tokens: [{ surface: 'casa', lemma: 'casa', pos: 'NOUN' }] }] });
  if (protectedAtStart) await h.store.texts.put({ ...text, readingAssessmentId: 'reading:heldout' });
  const library = createLibrary({ store: h.store, adapters: h.adapters, fetch: (async () => new Response('', { status: 404 })) as typeof fetch });
  return { ...h, text, library };
}

describe('held-out reading isolation at actual runtime entry points', () => {
  it('withdraws an obsolete publication decision without changing wording or content version', async () => {
    const h = createHarness();
    const doc = baseDoc();
    doc.generated = true; doc.source.authorship = 'generated';
    await importDocuments(h.store, h.adapters, [doc]);
    const id = ids.text(doc.lang, doc.id), before = (await h.store.texts.get(id))!;
    await h.store.texts.put({ ...before, published: true, unpublishedReasons: [] });
    const result = await importDocuments(h.store, h.adapters, [doc]);
    expect(result.documents[0].action).toBe('updated');
    const after = (await h.store.texts.get(id))!;
    expect(after.published).toBe(false);
    expect(after.contentVersion).toBe(before.contentVersion);
    expect(after.unpublishedReasons.join(' ')).toMatch(/native-speaker/);
  });
  it('drops protected remote index rows while retaining the ordinary row', () => {
    const ordinary = catalogRow(1, { published: true });
    const raw = { schema: 1, rows: [ordinary, { ...catalogRow(2), readingAssessmentId: 'reading:heldout' }, { ...catalogRow(3), listeningAssessmentId: 'listening:heldout' }] };
    expect(parseShard(raw, 'es')).toEqual([ordinary]);
  });
  it('cannot import an assessment role without its protected registry identity', async () => {
    const h = createHarness();
    const doc = { ...baseDoc(), curriculum: { lifecycle: 'candidate' as const, role: 'assessment' as const, registers: ['standard' as const], rejectionReasons: [], provenance: { kind: 'original' as const }, audio: { state: 'unavailable' as const, rightsCleared: false } } };
    const result = await importDocuments(h.store, h.adapters, [doc]);
    expect(result.documents[0].action).toBe('rejected');
    expect(await h.store.texts.count()).toBe(0);
  });
  it('never enters recommendation, occurrence, ranking or ordinary library paths even in preview', async () => {
    const h = await fixture();
    expect((await h.golearn.recommend('u1', { includeUnpublished: true, targetTextId: h.text.id })).map(r => r.textId)).not.toContain(h.text.id);
    expect(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.form('es', 'casa'), includeUnpublished: true })).toEqual([]);
    expect(await h.golearn.rankLibrary('u1', [{ profile: profile(h.text.id, [['casa', 1]]), published: true, rights: 'course-authored' }])).toEqual([]);
    await expect(h.golearn.predictDifficulty('u1', h.text.id)).rejects.toThrow(/protected/i);
    expect(await h.library.indexStore('es')).toBe(0);
    expect((await h.library.search({ lang: 'es', publishedOnly: false })).items).toEqual([]);
    expect(await h.library.profile(h.text.id)).toBeUndefined();
    await expect(h.library.open(h.text.id)).rejects.toThrow(/protected assessment/i);
  });
  it('ordinary folder input and a raw-log rebuild cannot convert assessment reading into vocabulary evidence', async () => {
    const h = await fixture();
    await h.view('u1', 'es', h.text.id, 0);
    await h.report('u1', 'es', h.text.id, [0]);
    await h.help('u1', 'es', h.text.id, 0, 0, ids.form('es', 'casa'), 1);
    await h.rescue('u1', 'es', h.text.id, [0]);
    await h.golearn.settled();
    expect(await h.store.events.count()).toBeGreaterThan(0);
    expect(await h.store.encounters.count()).toBe(0);
    expect(await h.store.learnerItems.count()).toBe(0);
    await h.golearn.rebuild('u1');
    expect(await h.store.encounters.count()).toBe(0);
    expect(await h.store.learnerItems.count()).toBe(0);
  });
  it('protection withdraws old index/source examples and derived training evidence while retaining raw history', async () => {
    const h = await fixture(false);
    await h.understood('u1', 'es', h.text.id, [0]);
    await h.golearn.settled();
    expect(await h.store.encounters.count()).toBeGreaterThan(0);
    expect(await createSourceFinder(h.store).forItem('u1', ids.form('es', 'casa'))).toHaveLength(1);
    await h.library.indexStore('es');
    expect(await h.library.entry(h.text.id)).toBeTruthy();
    const oldRow = (await h.library.entry(h.text.id))!;
    await putCatalogRows(h.store, [{ ...oldRow, location: 'library' }], h.clock());
    const rawCount = await h.store.events.count();
    await h.store.texts.put({ ...h.text, readingAssessmentId: 'reading:heldout' });
    expect(await h.library.entry(h.text.id)).toBeUndefined();
    expect((await h.library.search({ lang: 'es' })).items.map(row => row.id)).not.toContain(h.text.id);
    expect(await createSourceFinder(h.store).forItem('u1', ids.form('es', 'casa'))).toEqual([]);
    await h.golearn.invalidateProtectedAssessments();
    expect(await h.store.encounters.count()).toBe(0);
    expect(await h.store.learnerItems.count()).toBe(0);
    expect(await h.store.events.count()).toBe(rawCount);
    await h.library.indexStore('es');
    expect(await h.library.entry(h.text.id)).toBeUndefined();
    expect((await h.library.search({ lang: 'es' })).items.map(row => row.id)).not.toContain(h.text.id);
  });
  it('ordinary library construction refuses protected documents before writing their text or profiles', async () => {
    const documents = JSON.parse(courseDocuments(false)) as Array<Record<string, unknown>>;
    documents[0].readingAssessmentId = 'reading:heldout';
    const m = memoryIO({ 'assessment.json': JSON.stringify(documents) });
    const h = createHarness();
    await expect(buildLibrary({ lang: 'es', adapters: h.adapters, date: '2026-10-04', inspect: cleanInspect, io: m.io, manifest: { schema: 1, lang: 'es', entries: [entry({ slug: 'assessment', rights: COURSE, source: { file: 'assessment.json', kind: 'documents' } })] } })).rejects.toThrow(/protected assessment/i);
    expect([...m.out.keys()].some(path => path.includes('documents/') || path.includes('profiles/'))).toBe(false);
  });
});
