/**
 * The first text offered to a learner who has read nothing: the opening chapter of the course's own reading path
 * (a main work, by shelf, work and chapter) comes before "easiest by estimate", within the same stated level.
 * A course without such a path keeps the old rule.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import { buildChapter, stageRow, t, workRow } from './courseFixtures';

const U = 'u1';
const long = (n: number) => Array.from({ length: n }, (_, i) => ({ tokens: [t(`w${i}a`), t(`w${i}b`), t(`w${i}c`), t(`w${i}d`), t(`w${i}e`)] }));
const short = () => [{ tokens: [t('sol'), t('luna')] }];

describe('first-text', () => {
  it('opens the reading path: chapter 1 of the first main work, even when a later chapter looks easier', async () => {
    const h = createHarness();
    await h.seed(U);
    await h.store.stages.bulkPut([stageRow(0, 's1'), stageRow(1, 's2')]);
    await h.store.works.bulkPut([workRow('path', 's1', 'spine', 0), workRow('later', 's2', 'spine', 1), workRow('side', 's1', 'subsidiary', 2)]);
    await buildChapter(h.store, { slug: 'path-1', work: 'path', chapter: 1, sentences: long(6) }); // longer, more new words
    await buildChapter(h.store, { slug: 'path-2', work: 'path', chapter: 2, sentences: short() }); // looks easiest
    await buildChapter(h.store, { slug: 'later-1', work: 'later', chapter: 1, sentences: short() });
    await buildChapter(h.store, { slug: 'side-1', work: 'side', chapter: 1, sentences: short() });
    for (const slug of ['path-1', 'path-2', 'later-1', 'side-1']) await h.store.texts.put({ ...(await h.store.texts.get(ids.text('es', slug)))!, published: true });
    const recs = await h.golearn.recommend(U, { lang: 'es' });
    expect(recs[0]).toMatchObject({ reason: 'first-text', textId: ids.text('es', 'path-1') });
    expect(recs[0].explanation).toMatch(/opens the course's own reading path/);
    expect(recs[0].explanation).not.toMatch(/easiest/);
  });

  it('without a main work the easiest text is offered, in the old words', async () => {
    const h = createHarness();
    await h.seed(U);
    await buildChapter(h.store, { slug: 'a', sentences: long(6) });
    await buildChapter(h.store, { slug: 'b', sentences: short() });
    for (const slug of ['a', 'b']) await h.store.texts.put({ ...(await h.store.texts.get(ids.text('es', slug)))!, published: true });
    const recs = await h.golearn.recommend(U, { lang: 'es' });
    expect(recs[0].reason).toBe('first-text');
    expect(recs[0].explanation).toMatch(/is the easiest published/);
  });

  it('an unpublished opening chapter is offered only in preview, and says so', async () => {
    const h = createHarness();
    await h.seed(U);
    await h.store.stages.bulkPut([stageRow(0, 's1')]);
    await h.store.works.bulkPut([workRow('path', 's1', 'spine', 0)]);
    await buildChapter(h.store, { slug: 'path-1', work: 'path', chapter: 1, sentences: short() });
    await h.store.texts.put({ ...(await h.store.texts.get(ids.text('es', 'path-1')))!, published: false, unpublishedReasons: ['awaiting review'] });
    const normal = await h.golearn.recommend(U, { lang: 'es' });
    expect(normal.every((r) => r.textId === undefined)).toBe(true);
    const preview = await h.golearn.recommend(U, { lang: 'es', includeUnpublished: true });
    expect(preview[0]).toMatchObject({ reason: 'first-text', textId: ids.text('es', 'path-1') });
    expect(preview[0].explanation).toMatch(/in preview, not published/);
  });
});
