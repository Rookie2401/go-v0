import { describe, expect, it } from 'vitest';
import { buildFixtureText, createMemoryStore, ids, type AppStore, type CatalogText } from '../../src/core';
import { CHUNK, createLibrary, putCatalogRows, removeCatalogRows, searchCatalog, textMatcher, type SearchStats } from '../../src/library';
import { catalogRow, clock, registry, spanishStore } from './helpers';

const lib = (store: AppStore) => createLibrary({ store, adapters: registry, clock, fetch: (async () => new Response('', { status: 404 })) as typeof fetch });
const idsOf = (r: { items: CatalogText[] }) => r.items.map((x) => x.id);

describe('indexStore', () => {
  it('writes one row per stored text: bundled and personal copies, with features', async () => {
    const { store, text } = await spanishStore();
    const mine = await buildFixtureText(store, { lang: 'es', slug: 'mi-libro', title: 'Mi libro', sourceId: 'src:mine', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola', pos: 'INTJ' }] }] });
    await store.sources.put({ id: 'src:mine', title: 'Mi libro', author: 'Yo Mismo', rights: 'personal-copy', authorship: 'published' });
    await store.texts.put({ ...mine, personalCopy: true });
    await buildFixtureText(store, { lang: 'th', slug: 'otro', sentences: [{ tokens: [{ surface: 'x' }] }] });
    const l = lib(store);
    expect(await l.indexStore('es')).toBe(2);
    const a = (await l.entry(text.id))!;
    expect(a).toMatchObject({ id: text.id, lang: 'es', title: 'La muestra', stream: 'library', location: 'bundled', published: true, rights: 'rights-unverified' });
    expect(a.features.words).toBe(11);
    const b = (await l.entry(mine.id))!;
    expect(b).toMatchObject({ location: 'personal', stream: 'personal', rights: 'user-supplied', author: 'Yo Mismo' });
    expect(await store.catalog.count()).toBe(2); // the Thai text is not indexed for Spanish
    expect(idsOf(await l.search({ lang: 'es', location: 'personal' }))).toEqual([mine.id]);
    expect(idsOf(await l.search({ lang: 'es', stream: 'personal' }))).toEqual([mine.id]);
  });

  it('takes a work\'s catalogue facts from the works table', async () => {
    const { store, text } = await spanishStore();
    await store.works.put({
      id: 'work:honduras-es:muestra', courseId: 'honduras-es', lang: 'es', stageId: 'stage:honduras-es:s1', role: 'subsidiary', order: 0, title: 'La muestra', author: 'A. Autor', purpose: [],
      rights: { state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false, audiobook: 'none', verified: true },
      bibliographyVerified: false, streams: ['honduras', 'library'], domains: ['history'], variety: 'es-HN', era: '20th century', genre: 'story',
    });
    await store.texts.put({ ...text, workId: 'work:honduras-es:muestra', chapter: { index: 3 } });
    const l = lib(store);
    await l.indexStore('es');
    expect(await l.entry(text.id)).toMatchObject({
      workId: 'work:honduras-es:muestra', chapter: 3, author: 'A. Autor', stream: 'honduras', streams: ['honduras', 'library'], stageId: 'stage:honduras-es:s1',
      domains: ['history'], variety: 'es-HN', era: '20th century', genre: 'story', rights: 'verified-public-domain',
    });
    expect(idsOf(await l.search({ lang: 'es', stream: 'library' }))).toEqual([text.id]); // a secondary stream finds it too
    expect(idsOf(await l.search({ lang: 'es', domain: 'history', stageId: 'stage:honduras-es:s1' }))).toEqual([text.id]);
  });

  it('is idempotent and its cost follows the texts that changed', async () => {
    const { store, text } = await spanishStore();
    await buildFixtureText(store, { lang: 'es', slug: 'segunda', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola', pos: 'INTJ' }] }] });
    let measured = 0;
    const real = store.tokens.where.bind(store.tokens);
    store.tokens.where = (async (f: never, v: never) => { measured++; return real(f, v); }) as never;
    const l = lib(store);
    expect(await l.indexStore('es')).toBe(2);
    expect(measured).toBe(2); // each text measured once
    expect(await l.indexStore('es')).toBe(0);
    expect(measured).toBe(2); // nothing measured again
    // one text changes (a new content version): only it is re-measured
    await store.texts.put({ ...text, contentVersion: 2 });
    expect(await l.indexStore('es')).toBe(1);
    expect(measured).toBe(3);
    // a changed title is a changed catalogue fact
    await store.texts.put({ ...text, contentVersion: 2, title: 'Otro titulo' });
    expect(await l.indexStore('es')).toBe(1);
    expect((await l.entry(text.id))!.title).toBe('Otro titulo');
    expect(await store.catalog.count()).toBe(2);
    // the table and its index never drift
    expect((await l.search({ lang: 'es' })).total).toBe(2);
  });

  it('removes the rows of texts that left the store, and leaves library rows alone', async () => {
    const { store, text } = await spanishStore();
    const l = lib(store);
    await l.indexStore('es');
    await putCatalogRows(store, [catalogRow(1)]);
    await store.texts.delete(text.id);
    expect(await l.indexStore('es')).toBe(1);
    expect(await l.entry(text.id)).toBeUndefined();
    expect(idsOf(await l.search({ lang: 'es' }))).toEqual([catalogRow(1).id]);
    // a text opened from the library keeps its library row
    await buildFixtureText(store, { lang: 'es', slug: 'obra-000001', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola', pos: 'INTJ' }] }] });
    expect(await l.indexStore('es')).toBe(0);
    expect((await l.entry(catalogRow(1).id))!.location).toBe('library');
  });
});

describe('search', () => {
  const rows: CatalogText[] = [
    catalogRow(1, { title: 'Don Quijote de la Mancha', author: 'Miguel de Cervantes', stream: 'library', stageId: 'stage:honduras-es:s6', era: '17th century', genre: 'novel', published: true, variety: 'es-hist' }),
    catalogRow(2, { title: 'Novelas ejemplares', author: 'Miguel de Cervantes', stream: 'library', stageId: 'stage:honduras-es:s6', era: '17th century', genre: 'short novels', variety: 'es-hist' }),
    catalogRow(3, { title: 'Tradiciones peruanas', author: 'Ricardo Palma', stream: 'library', stageId: 'stage:honduras-es:s2', domains: ['history'], published: true }),
    catalogRow(4, { title: 'Año nuevo en Honduras', author: 'Autora Anónima', stream: 'honduras', streams: ['honduras', 'knowledge'], rights: 'course-authored', published: true, variety: 'es-HN', features: { words: 900, sentences: 90, uniqueForms: 300, meanSentenceWords: 10 } }),
    catalogRow(5, { title: 'Camino 1', stream: 'acquisition', rights: 'course-authored', location: 'bundled', features: { words: 300, sentences: 50, uniqueForms: 80, meanSentenceWords: 6 } }),
    catalogRow(6, { title: 'Mi copia', stream: 'personal', rights: 'user-supplied', location: 'personal', published: true }),
  ];
  const seeded = async () => { const store = createMemoryStore(); await putCatalogRows(store, rows, clock()); return store; };
  const q = async (store: AppStore, query: Partial<Parameters<typeof searchCatalog>[1]>) => searchCatalog(store, { lang: 'es', ...query });

  it('pages in catalogue order, with a total, an offset and a limit', async () => {
    const store = await seeded();
    const all = await q(store, {});
    expect(all.total).toBe(6);
    expect(idsOf(all)).toEqual(rows.map((r) => r.id));
    const page = await q(store, { limit: 2, offset: 2 });
    expect(page.total).toBe(6);
    expect(idsOf(page)).toEqual([rows[2].id, rows[3].id]);
    expect(idsOf(await q(store, { limit: 2, offset: 5 }))).toEqual([rows[5].id]);
    expect(idsOf(await q(store, { offset: 6 }))).toEqual([]);
    expect((await q(store, { offset: 6 })).total).toBe(6);
  });

  it('defaults to 30 and never returns more than 200', async () => {
    const store = createMemoryStore();
    await putCatalogRows(store, Array.from({ length: 450 }, (_, i) => catalogRow(i)), clock());
    expect((await q(store, {})).items).toHaveLength(30);
    expect((await q(store, { limit: 1000 })).items).toHaveLength(200);
    expect((await q(store, { limit: 0 })).items).toHaveLength(1);
    expect((await q(store, { limit: 200, offset: 400 })).items).toHaveLength(50);
    expect((await q(store, { limit: 200 })).total).toBe(450);
  });

  it('filters by stream (primary or secondary), stage, domain, variety, era, genre, author, rights, location, published', async () => {
    const store = await seeded();
    expect(idsOf(await q(store, { stream: 'honduras' }))).toEqual([rows[3].id]);
    expect(idsOf(await q(store, { stream: 'knowledge' }))).toEqual([rows[3].id]);
    expect((await q(store, { stream: 'library' })).total).toBe(3);
    expect(idsOf(await q(store, { stageId: 'stage:honduras-es:s6' }))).toEqual([rows[0].id, rows[1].id]);
    expect(idsOf(await q(store, { domain: 'history' }))).toEqual([rows[2].id]);
    expect(idsOf(await q(store, { variety: 'es-hist' }))).toEqual([rows[0].id, rows[1].id]);
    expect(idsOf(await q(store, { era: '17th century' }))).toEqual([rows[0].id, rows[1].id]);
    expect(idsOf(await q(store, { genre: 'novel' }))).toEqual([rows[0].id]);
    expect(idsOf(await q(store, { author: 'miguel DE cervantes' }))).toEqual([rows[0].id, rows[1].id]);
    expect(idsOf(await q(store, { rights: 'course-authored' }))).toEqual([rows[3].id, rows[4].id]);
    expect(idsOf(await q(store, { location: 'bundled' }))).toEqual([rows[4].id]);
    expect(idsOf(await q(store, { publishedOnly: true }))).toEqual([rows[0].id, rows[2].id, rows[3].id, rows[5].id]);
  });

  it('combines filters (all must hold) and reports an exact total', async () => {
    const store = await seeded();
    const r = await q(store, { stream: 'library', publishedOnly: true });
    expect(idsOf(r)).toEqual([rows[0].id, rows[2].id]);
    expect(r.total).toBe(2);
    expect(idsOf(await q(store, { stream: 'library', publishedOnly: true, limit: 1, offset: 1 }))).toEqual([rows[2].id]);
    expect((await q(store, { stream: 'library', publishedOnly: true, limit: 1, offset: 1 })).total).toBe(2);
    expect((await q(store, { stream: 'honduras', rights: 'verified-public-domain' }))).toEqual({ total: 0, items: [] });
    expect((await q(store, { stream: 'nonexistent' }))).toEqual({ total: 0, items: [] });
  });

  it('filters by word count', async () => {
    const store = await seeded();
    expect(idsOf(await q(store, { minWords: 500 }))).toEqual([rows[3].id]);
    expect(idsOf(await q(store, { maxWords: 300 }))).toEqual([rows[0], rows[1], rows[2], rows[4], rows[5]].map((r) => r.id));
    expect(idsOf(await q(store, { minWords: 200, maxWords: 500, stream: 'acquisition' }))).toEqual([rows[4].id]);
    expect((await q(store, { minWords: 5000 })).total).toBe(0);
  });

  it('matches text in title and author, ignoring case and accents, every word a word start', async () => {
    const store = await seeded();
    expect(idsOf(await q(store, { text: 'quijote' }))).toEqual([rows[0].id]);
    expect(idsOf(await q(store, { text: 'QUIJOTE mancha' }))).toEqual([rows[0].id]);
    expect(idsOf(await q(store, { text: 'cervantes' }))).toEqual([rows[0].id, rows[1].id]);
    expect(idsOf(await q(store, { text: 'ano nuevo' }))).toEqual([rows[3].id]); // an accent-less query finds "Año"
    expect(idsOf(await q(store, { text: 'AÑO' }))).toEqual([rows[3].id]);
    expect(idsOf(await q(store, { text: 'quij' }))).toEqual([rows[0].id]); // the start of a word
    expect(idsOf(await q(store, { text: 'jote' }))).toEqual([]); // not the middle of one
    expect(idsOf(await q(store, { text: 'ricardo palm' }))).toEqual([rows[2].id]);
    expect(idsOf(await q(store, { text: 'ca' }))).toEqual([rows[4].id]); // a short term is tested on the rows
    expect(idsOf(await q(store, { text: '   ' }))).toHaveLength(6); // blank = no condition
    expect(idsOf(await q(store, { text: 'cervantes', stream: 'library', genre: 'short novels' }))).toEqual([rows[1].id]);
    expect((await q(store, { text: 'cervantes', limit: 1 })).total).toBe(2);
  });

  it('matches Thai text anywhere in a word (no spaces to start words at)', async () => {
    const store = createMemoryStore();
    const th = (slug: string, title: string): CatalogText => ({ ...catalogRow(0), id: ids.text('th', slug), lang: 'th', title });
    await putCatalogRows(store, [th('a', 'ขนมไทย'), th('b', 'ปลาทู')], clock());
    expect(idsOf(await searchCatalog(store, { lang: 'th', text: 'ไทย' }))).toEqual([ids.text('th', 'a')]);
    expect(textMatcher('th', 'ทู')!(th('b', 'ปลาทู'))).toBe(true);
  });

  it('keeps the lists right when a row changes facets, and when rows are removed', async () => {
    const store = await seeded();
    expect((await q(store, { stream: 'library' })).total).toBe(3);
    await putCatalogRows(store, [{ ...rows[0], stream: 'honduras', title: 'Cambiado' }], clock());
    expect((await q(store, { stream: 'library' })).total).toBe(2);
    expect(idsOf(await q(store, { stream: 'honduras' }))).toEqual([rows[3].id, rows[0].id]); // a row that gains a facet joins the end of its list
    expect(idsOf(await q(store, { text: 'quijote' }))).toEqual([]);
    expect(idsOf(await q(store, { text: 'cambiado' }))).toEqual([rows[0].id]);
    expect(await removeCatalogRows(store, [rows[0].id, rows[2].id, 'text:es:ninguno'], clock())).toBe(2);
    expect((await q(store, { stream: 'library' })).total).toBe(1);
    expect((await q(store, {})).total).toBe(4);
    expect(await store.catalog.get(rows[0].id)).toBeUndefined();
  });

  it('keeps chapters in order across many posting-list chunks', async () => {
    const store = createMemoryStore();
    const many = Array.from({ length: CHUNK * 2 + 17 }, (_, i) => catalogRow(i, { stream: i % 3 === 0 ? 'honduras' : 'library' }));
    await putCatalogRows(store, many.slice(0, 100), clock());
    await putCatalogRows(store, many.slice(100), clock());
    const r = await q(store, { stream: 'honduras', limit: 200 });
    expect(r.total).toBe(many.filter((x) => x.stream === 'honduras').length);
    expect(idsOf(r)).toEqual(many.filter((x) => x.stream === 'honduras').map((x) => x.id));
    expect(idsOf(await q(store, { stream: 'honduras', limit: 5, offset: 100 }))).toEqual(many.filter((x) => x.stream === 'honduras').slice(100, 105).map((x) => x.id));
    // remove from the middle of a chunk and page again
    await removeCatalogRows(store, [many[3].id, many[150].id], clock());
    expect((await q(store, { stream: 'honduras' })).total).toBe(many.filter((x) => x.stream === 'honduras').length - 2);
  });

  it('rebuilds its index when the table was written without it', async () => {
    const store = await seeded();
    await store.catalog.put(catalogRow(99, { title: 'Escrito directamente' })); // behind the library's back
    expect((await q(store, {})).total).toBe(7);
    expect(idsOf(await q(store, { text: 'directamente' }))).toEqual([catalogRow(99).id]);
    await store.catalog.delete(rows[1].id);
    expect((await q(store, { stream: 'library' })).total).toBe(3);
    expect((await q(store, {})).total).toBe(6);
  });

  it('says which list drove each kind of query', async () => {
    const store = await seeded();
    const modes: SearchStats[] = [];
    const run = (query: Parameters<typeof searchCatalog>[1]) => searchCatalog(store, query, clock(), (s) => modes.push(s));
    await run({ lang: 'es' });
    await run({ lang: 'es', stream: 'library' });
    await run({ lang: 'es', stream: 'library', publishedOnly: true });
    await run({ lang: 'es', text: 'cervantes' });
    await run({ lang: 'es', minWords: 10 });
    expect(modes.map((m) => [m.driver, m.mode])).toEqual([['all', 'exact'], ['stream=library', 'exact'], ['stream=library', 'driven'], ['w=cer', 'driven'], ['all', 'scan']]);
  });

  it('lists the chapters of one work in chapter order, whatever order they were indexed in', async () => {
    const work = 'work:honduras-es:marianela';
    const chapters = [4, 1, 3, 2, 10, 5].map((n) => catalogRow(100 + n, { workId: work, chapter: n, title: `Marianela - Capitulo ${n}`, published: n % 2 === 0, stream: n === 3 ? 'honduras' : 'library' }));
    const store = createMemoryStore();
    await putCatalogRows(store, [...rows, ...chapters, catalogRow(200, { workId: 'work:honduras-es:otra', chapter: 1 }), catalogRow(201, { workId: work, title: 'Sin numero' }), catalogRow(202, { workId: work, title: 'Anexo' })], clock());
    const r = await q(store, { workId: work });
    expect(r.total).toBe(8);
    expect(r.items.map((x) => x.chapter)).toEqual([1, 2, 3, 4, 5, 10, undefined, undefined]); // 10 after 5; no chapter number last, by title
    expect(r.items.slice(6).map((x) => x.title)).toEqual(['Anexo', 'Sin numero']);
    expect((await q(store, { workId: work, limit: 3, offset: 2 })).items.map((x) => x.chapter)).toEqual([3, 4, 5]);
    expect((await q(store, { workId: work, limit: 3, offset: 2 })).total).toBe(8);
    expect((await q(store, { workId: work, publishedOnly: true })).items.map((x) => x.chapter)).toEqual([2, 4, 10]);
    expect((await q(store, { workId: work, stream: 'honduras' })).items.map((x) => x.chapter)).toEqual([3]);
    expect((await q(store, { workId: work, text: 'capitulo 1' })).items.map((x) => x.chapter)).toEqual([1, 10]);
    expect((await q(store, { workId: work, minWords: 100000 }))).toEqual({ total: 0, items: [] });
    expect(await q(store, { workId: 'work:honduras-es:nada' })).toEqual({ total: 0, items: [] });
    expect((await q(store, { workId: 'work:honduras-es:otra' })).items).toHaveLength(1);
    // a text that moves to another work leaves the first work's list
    await putCatalogRows(store, [{ ...chapters[0], workId: 'work:honduras-es:otra' }], clock());
    expect((await q(store, { workId: work })).total).toBe(7);
    expect((await q(store, { workId: 'work:honduras-es:otra' })).items.map((x) => x.chapter)).toEqual([1, 4]);
  });

  it('library.search routes to the same query', async () => {
    const store = await seeded();
    const l = lib(store);
    expect((await l.search({ lang: 'es', stream: 'library' })).total).toBe(3);
    expect(await l.info('es')).toBeUndefined();
  });
});
