import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids } from '../../src/core';
import { importDocuments, validateDocument, workIdOf, type CorpusDocument } from '../../src/ingest';
import { baseDoc, clock, countWrites, errorCodes, issuesOf, registry, snapshot, warningCodes } from './helpers';
import { THAI_COURSE, bookDoc, seedWorks } from './book';

// the Thai adapter's small lexicon leaves most words unanalysed: that warning is not what these tests are about
const quiet = (codes: string[]) => codes.filter((c) => c !== 'low-analysis-coverage');
const codesIn = (issues: Array<{ code: string }>) => quiet(issues.map((i) => i.code));
const withWork = (work: unknown, over: Partial<CorpusDocument> = {}): CorpusDocument => ({ ...bookDoc(over), work } as CorpusDocument);

describe('work and chapter (Text.workId / Text.chapter)', () => {
  it('a work block sets workId (default course = the first course for the language) and chapter', async () => {
    const store = createMemoryStore();
    const doc = withWork({ slug: 'mana-mani-1', chapter: { index: 3, title: 'A visit' } });
    const r = await importDocuments(store, registry, [doc], { clock });
    expect(r.ok).toBe(true);
    const t = (await store.texts.get('text:th:book-ch01'))!;
    expect(t.workId).toBe(ids.work(THAI_COURSE, 'mana-mani-1'));
    expect(t.workId).toBe('work:thailand-th:mana-mani-1');
    expect(t.chapter).toEqual({ index: 3, title: 'A visit' });
    expect(workIdOf(doc)).toBe(t.workId);

    // another language: its own first course
    const es = { ...baseDoc(), work: { slug: 'x-y' } } as CorpusDocument;
    await importDocuments(store, registry, [es], { clock });
    const e = (await store.texts.get('text:es:test-doc'))!;
    expect(e.workId).toBe('work:honduras-es:x-y');
    expect(e.chapter).toBeUndefined();
  });

  it('an explicit courseId is used; a text without a work has neither field', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [withWork({ slug: 'a', courseId: 'thailand-th', chapter: { index: 1 } }), bookDoc({ id: 'plain' })], { clock });
    const a = (await store.texts.get('text:th:book-ch01'))!;
    expect(a.workId).toBe('work:thailand-th:a');
    expect(a.chapter).toEqual({ index: 1 });
    const plain = (await store.texts.get('text:th:plain'))!;
    expect(plain.workId).toBeUndefined();
    expect(plain.chapter).toBeUndefined();
    expect(plain.personalCopy).toBe(true);
  });

  it('validation: slug, chapter index, courseId', () => {
    expect(errorCodes(withWork({ slug: 'ok-1', chapter: { index: 1 } }))).toEqual([]);
    expect(errorCodes(withWork({ slug: 'ok-1', chapter: { index: 0, title: 'Front matter' } }))).toEqual([]);
    expect(errorCodes(withWork({ slug: 'Bad_Slug' }))).toEqual(['invalid-id']);
    expect(errorCodes(withWork({ slug: '' }))).toEqual(['missing-field']);
    expect(errorCodes(withWork({}))).toEqual(['missing-field']);
    expect(errorCodes(withWork('mana-mani-1'))).toEqual(['invalid-value']);
    for (const chapter of [{ index: -1 }, { index: 1.5 }, { index: '2' }, { index: 1, title: '' }, 3, {}]) {
      expect(errorCodes(withWork({ slug: 'ok', chapter })), JSON.stringify(chapter)).toEqual(['invalid-value']);
    }
    expect(errorCodes(withWork({ slug: 'ok', courseId: 'nowhere' }))).toEqual(['invalid-value']);
    const wrongLanguage = issuesOf(withWork({ slug: 'ok', courseId: 'honduras-es' })).filter((i) => i.severity === 'error');
    expect(wrongLanguage.map((i) => i.code)).toEqual(['invalid-value']);
    expect(wrongLanguage[0].message).toMatch(/teaches "es"/);
    expect(quiet(warningCodes(withWork({ slug: 'ok', surprise: 1 })))).toEqual(['unknown-field']);
  });

  it('unknown-work warns only when the works table has works for that course, and never blocks the import', async () => {
    const noTable = withWork({ slug: 'no-such-work' });
    expect(quiet(warningCodes(noTable))).toEqual([]); // no knownWorks in the context: skipped
    const empty = validateDocument(noTable, { registry, knownWorks: new Set<string>() });
    expect(codesIn(empty)).toEqual([]);
    const otherCourse = validateDocument(noTable, { registry, knownWorks: new Set(['work:honduras-es:cuentos']) });
    expect(codesIn(otherCourse)).toEqual([]);

    const store = createMemoryStore();
    await seedWorks(store);
    const real = withWork({ slug: 'mana-mani-1' }, { id: 'real' });
    const wrong = withWork({ slug: 'no-such-work' }, { id: 'wrong' });
    const r = await importDocuments(store, registry, [real, wrong], { clock });
    expect(r.ok).toBe(true);
    expect(codesIn(r.documents[0].issues)).toEqual([]);
    expect(codesIn(r.documents[1].issues)).toEqual(['unknown-work']);
    expect(r.documents[1].issues.find((i) => i.code === 'unknown-work')).toMatchObject({ severity: 'warning', path: 'work.slug' });
    expect((await store.texts.get('text:th:wrong'))!.workId).toBe('work:thailand-th:no-such-work');
  });

  it('re-import is a no-op; changing only the work or chapter title is a metadata edit (no version bump)', async () => {
    const store = createMemoryStore();
    const doc = withWork({ slug: 'mana-mani-1', chapter: { index: 1, title: 'One' } });
    await importDocuments(store, registry, [doc], { clock });
    const before = await snapshot(store);
    const w = countWrites(store);
    const again = await importDocuments(store, registry, [doc], { clock });
    expect(again.documents[0].action).toBe('unchanged');
    expect(w.count()).toBe(0);
    expect(await snapshot(store)).toEqual(before);

    const renamed = withWork({ slug: 'mana-mani-1', chapter: { index: 1, title: 'Uno' } });
    const r = await importDocuments(store, registry, [renamed], { clock });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 1, sentencesAdded: 0, sentencesRetired: 0 });
    expect((await store.texts.get('text:th:book-ch01'))!.chapter).toEqual({ index: 1, title: 'Uno' });
    expect((await store.texts.get('text:th:book-ch01'))!.contentVersion).toBe(1);
  });

  it('a batch of chapters of one work imports together, each with its own chapter', async () => {
    const store = createMemoryStore();
    const docs = [1, 2, 3].map((n) => withWork({ slug: 'mana-mani-1', chapter: { index: n } }, { id: `book-ch0${n}` }));
    const r = await importDocuments(store, registry, docs, { clock });
    expect(r.documents.map((d) => d.action)).toEqual(['created', 'created', 'created']);
    const texts = await store.texts.where('workId', 'work:thailand-th:mana-mani-1');
    expect(texts.map((t) => t.chapter!.index).sort()).toEqual([1, 2, 3]);
  });
});
