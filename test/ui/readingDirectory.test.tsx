// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { AppRoutes, Shell } from '../../src/ui/App';
import { buildFixtureText } from '../../src/core';
import type { Work } from '../../src/core';
import { makeHarness, catalogText, flush, qa, q, click } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;

describe('Reading directory separation', () => {
  it('keeps Home to the three directory entries and utility links', async () => {
    const h = await makeHarness();
    mounted = await h.mount(app(), { router: '/' });
    expect(qa(mounted.container, 'nav[aria-label="Start here"] .home__entry-name').map((x) => x.textContent)).toEqual(['Reading', 'GoListen', 'Scripture', 'Testimony', 'Team Texts']);
    expect(qa(mounted.container, 'a[href^="/read/"]')).toHaveLength(0);
    expect(q(mounted.container, '[data-testid="best-next"]')).toBeNull();
  });

  it('paginates the full catalogue, excludes Scripture, and exposes a late reading row', async () => {
    const rows = Array.from({ length: 205 }, (_, i) => catalogText({ id: `text:es:reader-${i}`, title: `Reader ${i}`, stream: 'library', chapter: i + 1 }))
      .concat(catalogText({ id: 'text:es:bible-1', title: 'Bible chapter', stream: 'scripture' }));
    const h = await makeHarness({ library: rows });
    localStorage.setItem('go.read.open.es', JSON.stringify(['other', 'b:c:']));
    mounted = await h.mount(app(), { router: '/read' });
    await flush(12);
    const books = q(mounted.container, 'nav[aria-label="Books"]')!;
    expect(books.textContent).toContain('Reader 204');
    expect(books.textContent).not.toContain('Bible chapter');
    const titles = qa(books, '[data-text-id] .entry__native').map((x) => x.textContent);
    expect(titles.indexOf('Reader 4')).toBeLessThan(titles.indexOf('Reader 200'));
    expect(qa(books, '[data-text-id]')).toHaveLength(205);
  });

  it('keeps resident and lazy chapters of one work in chapter order and shows open failures', async () => {
    const workId = 'work:honduras-es:book';
    const h = await makeHarness({ library: [
      catalogText({ id: 'text:es:book-2', title: 'Book · Chapter 2', workId, chapter: 2 }),
      catalogText({ id: 'text:es:book-3', title: 'Book · Chapter 3', workId, chapter: 3 }),
    ] });
    const stage = (await h.services.catalog.stages('honduras-es'))[0];
    const work = {
      id: workId, courseId: 'honduras-es', lang: 'es', stageId: stage.id, role: 'spine' as const,
      order: 1, title: 'Book', purpose: [], bibliographyVerified: false,
      rights: { copyrightStatus: 'unknown' as const, permission: 'unknown' as const, canBundle: false, userImportOnly: true, audiobook: 'unknown' as const, verified: false },
    } as Work;
    h.services.catalog.work = async (id) => id === workId ? work : undefined;
    const resident = await buildFixtureText(h.store, { lang: 'es', slug: 'book-1', title: 'Book · Chapter 1', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola' }] }] });
    await h.store.texts.put({ ...resident, workId, chapter: { index: 1 } });
    localStorage.setItem('go.read.open.es', JSON.stringify([`s:${stage.key}`, `b:w:${workId}`]));
    h.library.open.mockRejectedValue(new Error('open failed'));
    mounted = await h.mount(app(), { router: '/read' });
    await flush(12);
    const book = q(mounted.container, `[data-group="b:w:${workId}"]`)!;
    expect(qa(book, '[data-text-id] .entry__native').map((x) => x.textContent)).toEqual(['Book · Chapter 1', 'Book · Chapter 2', 'Book · Chapter 3']);
    const chapter2 = qa<HTMLAnchorElement>(book, 'a.entry--chapter').find((link) => link.textContent?.includes('Book · Chapter 2'))!;
    await click(chapter2);
    expect(q(mounted.container, '[role="alert"]')?.textContent).toContain('open failed');
  });
});
