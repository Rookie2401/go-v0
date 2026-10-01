import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryStore, type AppStore, type CatalogText, type LexiconSource } from '../../src/core';
import { createLibrary } from '../../src/library';
import { buildLibrary } from '../../src/library/build';
import { clock, registry } from './helpers';
import { cleanInspect, fixtureManifest, memoryIO, serve } from './fixtures';

let out: Map<string, string>;
let small: Map<string, string>;

beforeAll(async () => {
  const { manifest, files } = fixtureManifest();
  const good = { ...manifest, entries: manifest.entries.filter((e) => ['cuento-publico', 'camino-test', 'revisado'].includes(e.slug)) };
  const a = memoryIO(files);
  await buildLibrary({ lang: 'es', manifest: good, io: a.io, adapters: registry, date: '2026-10-01', inspect: cleanInspect });
  out = a.out;
  const b = memoryIO(files);
  await buildLibrary({ lang: 'es', manifest: { ...good, entries: [good.entries[0]] }, io: b.io, adapters: registry, date: '2026-10-05', inspect: cleanInspect });
  small = b.out;
});

const make = (store: AppStore = createMemoryStore(), files = out, opts: { lexicon?: (l: 'es') => LexiconSource | undefined } = {}) => {
  const counts = new Map<string, number>();
  const library = createLibrary({ store, adapters: registry, fetch: serve(files, 'es', counts), clock, ...opts as object });
  return { store, library, counts };
};
const idsOf = (r: { items: CatalogText[] }) => r.items.map((x) => x.id);

describe('a built library, read lazily', () => {
  it('reports its info from the manifest, once', async () => {
    const { library, counts } = make();
    const info = (await library.info('es'))!;
    expect(info).toEqual({ lang: 'es', id: 'library-es@2026-10-01', texts: 5, works: 3, words: expect.any(Number), builtAt: '2026-10-01' });
    await library.info('es');
    expect(counts.get('manifest.json')).toBe(1);
    expect(await library.info('th')).toBeUndefined(); // no library for that language
  });

  it('installs only the shards a query can need, once, and keeps them across instances', async () => {
    const store = createMemoryStore();
    const first = make(store);
    expect(idsOf(await first.library.search({ lang: 'es', stream: 'acquisition' }))).toEqual(['text:es:camino-test-ch01']);
    expect([...first.counts.keys()].filter((k) => k.startsWith('index/'))).toEqual(['index/acquisition-0000.json']);
    expect(await store.catalog.count()).toBe(1);

    const r = await first.library.search({ lang: 'es', stream: 'honduras' }); // a secondary stream of the library shard
    expect(idsOf(r)).toEqual(['text:es:cuento-publico-ch01', 'text:es:cuento-publico-ch02']);
    expect(first.counts.get('index/library-0000.json')).toBe(1);
    await first.library.search({ lang: 'es', stream: 'honduras' });
    expect(first.counts.get('index/library-0000.json')).toBe(1);

    const all = await first.library.search({ lang: 'es' });
    expect(all.total).toBe(5);
    expect([...first.counts.keys()].filter((k) => k.startsWith('index/')).sort()).toEqual(['index/acquisition-0000.json', 'index/library-0000.json']);

    // another run of the app: the rows are already in the store, so nothing is fetched again
    const second = make(store);
    expect((await second.library.search({ lang: 'es', stream: 'library' })).total).toBe(4);
    expect([...second.counts.keys()].filter((k) => k.startsWith('index/'))).toEqual([]);
  });

  it('does not install library shards for a query about the texts already on the device', async () => {
    const { library, counts } = make();
    expect((await library.search({ lang: 'es', location: 'personal' })).total).toBe(0);
    expect((await library.search({ lang: 'es', location: 'bundled' })).total).toBe(0);
    expect([...counts.keys()].filter((k) => k.startsWith('index/'))).toEqual([]);
  });

  it('searches installed library rows by text, rights and publication', async () => {
    const { library } = make();
    expect(idsOf(await library.search({ lang: 'es', text: 'cuento publico' }))).toEqual(['text:es:cuento-publico-ch01', 'text:es:cuento-publico-ch02']);
    expect(idsOf(await library.search({ lang: 'es', text: 'camino' }))).toEqual(['text:es:camino-test-ch01']);
    expect((await library.search({ lang: 'es', rights: 'course-authored' })).total).toBe(1);
    expect((await library.search({ lang: 'es', rights: 'verified-public-domain' })).total).toBe(4);
    expect(idsOf(await library.search({ lang: 'es', publishedOnly: true }))).toEqual(['text:es:revisado-ch01', 'text:es:revisado-ch02']);
    expect(idsOf(await library.search({ lang: 'es', author: 'a. autor' }))).toEqual(['text:es:cuento-publico-ch01', 'text:es:cuento-publico-ch02']);
    expect((await library.search({ lang: 'es', limit: 2, offset: 1 })).items).toHaveLength(2);
  });

  it('lists the chapters of a work in order', async () => {
    const { library } = make();
    const r = await library.search({ lang: 'es', workId: 'work:honduras-es:cuento-publico' });
    expect(r.items.map((x) => [x.chapter, x.id])).toEqual([[1, 'text:es:cuento-publico-ch01'], [2, 'text:es:cuento-publico-ch02']]);
    expect((await library.search({ lang: 'es', workId: 'work:honduras-es:nada' })).total).toBe(0);
  });

  it('finds an entry that is not installed yet by installing the library', async () => {
    const { library, store } = make();
    expect(await store.catalog.count()).toBe(0);
    const row = (await library.entry('text:es:revisado-ch02'))!;
    expect(row).toMatchObject({ location: 'library', rights: 'verified-public-domain', published: true });
    expect(await store.catalog.count()).toBe(5);
    expect(await library.entry('text:es:no-existe')).toBeUndefined();
    expect(await library.entry('not-a-text-id')).toBeUndefined();
  });

  it('fetches the profile of a library text once and checks that it is that text\'s profile', async () => {
    const { library, counts } = make();
    const row = (await library.entry('text:es:cuento-publico-ch01'))!;
    const p = (await library.profile(row.id))!;
    expect(p).toMatchObject({ textId: row.id, lang: 'es', words: row.features.words });
    expect(p.forms.length).toBeGreaterThan(5);
    expect(await library.profile(row.id)).toEqual(p);
    expect(counts.get(row.profilePath!)).toBe(1);
    expect(await library.profile('text:es:no-existe')).toBeUndefined();

    // a profile file that belongs to another text is not accepted
    const swapped = new Map(out);
    swapped.set(row.profilePath!, out.get((await library.entry('text:es:cuento-publico-ch02'))!.profilePath!)!);
    const other = make(createMemoryStore(), swapped);
    expect(await other.library.profile(row.id)).toBeUndefined();
  });

  it('survives a library that is missing, unreachable or not JSON', async () => {
    const store = createMemoryStore();
    const none = createLibrary({ store, adapters: registry, fetch: (async () => new Response('x', { status: 404 })) as typeof fetch, clock });
    expect(await none.info('es')).toBeUndefined();
    expect((await none.search({ lang: 'es' })).total).toBe(0);
    // an SPA host answering every path with its index page
    const html = createLibrary({ store, adapters: registry, fetch: (async () => new Response('<!doctype html><html></html>', { status: 200 })) as typeof fetch, clock });
    expect(await html.info('es')).toBeUndefined();
    expect((await html.search({ lang: 'es' })).total).toBe(0);
    // no fetch at all
    const bare = createLibrary({ store, adapters: registry, clock, fetch: undefined });
    expect(await bare.info('es').catch(() => 'threw')).not.toBe('threw');
    // a network failure is not remembered: when the network is back the library appears
    let up = false;
    const flaky = createLibrary({ store: createMemoryStore(), adapters: registry, clock, fetch: ((u: unknown) => { if (!up) throw new TypeError('offline'); return serve(out)(u as string); }) as typeof fetch });
    expect(await flaky.info('es')).toBeUndefined();
    up = true;
    expect((await flaky.info('es'))!.texts).toBe(5);
  });

  it('keeps the texts of the store searchable when there is no library', async () => {
    const { store, library } = make(undefined, new Map());
    await store.catalog.put({ id: 'text:es:x', lang: 'es', title: 'Mi texto', stream: 'personal', rights: 'user-supplied', location: 'personal', published: true, features: { words: 5, sentences: 1, uniqueForms: 5, meanSentenceWords: 5 } });
    expect(idsOf(await library.search({ lang: 'es', text: 'texto' }))).toEqual(['text:es:x']);
  });

  it('replaces the rows of an older build when the library is rebuilt', async () => {
    const store = createMemoryStore();
    const before = make(store, out);
    expect((await before.library.search({ lang: 'es' })).total).toBe(5);
    await store.catalog.put({ id: 'text:es:mio', lang: 'es', title: 'Mio', stream: 'personal', rights: 'user-supplied', location: 'personal', published: true, features: { words: 5, sentences: 1, uniqueForms: 5, meanSentenceWords: 5 } });
    const after = make(store, small);
    const r = await after.library.search({ lang: 'es' });
    expect(idsOf(r).sort()).toEqual(['text:es:cuento-publico-ch01', 'text:es:cuento-publico-ch02', 'text:es:mio']);
    expect((await after.library.search({ lang: 'es', stream: 'acquisition' })).total).toBe(0);
    expect((await after.library.info('es'))!.id).toBe('library-es@2026-10-05');
  });
});

describe('open: import on demand', () => {
  it('imports a library text through the ordinary importer, once', async () => {
    const { store, library, counts } = make();
    const row = (await library.entry('text:es:cuento-publico-ch01'))!;
    expect(await store.texts.get(row.id)).toBeUndefined();
    const [a, b] = await Promise.all([library.open(row.id), library.open(row.id)]);
    expect(a.id).toBe(row.id);
    expect(b.id).toBe(row.id);
    expect(counts.get(row.documentPath!)).toBe(1); // concurrent opens share one fetch
    expect(a).toMatchObject({ lang: 'es', workId: 'work:honduras-es:cuento-publico', chapter: { index: 1 }, published: false, reviewStatus: 'unreviewed', sourceId: 'src:es:cuento-publico' });
    expect(a.transformations.some((t) => t.tool.startsWith('adapter-es'))).toBe(true);
    expect((await store.sentences.where('textId', row.id)).length).toBeGreaterThan(1);
    expect((await store.sources.get('src:es:cuento-publico'))!.rights).toBe('public-domain');
    // opening again does not fetch or import again
    let writes = 0;
    const real = store.sentences.bulkPut.bind(store.sentences);
    store.sentences.bulkPut = (async (rows: never[]) => { writes++; return real(rows); }) as never;
    await library.open(row.id);
    expect(counts.get(row.documentPath!)).toBe(1);
    expect(writes).toBe(0);
    // the stored text now has the same words as the profile that was built
    const p = (await library.profile(row.id))!;
    expect(p.words).toBe(row.features.words);
    // and the catalogue still lists it as a library text
    await library.indexStore('es');
    expect((await library.entry(row.id))!.location).toBe('library');
  });

  it('opens a published library text as published, and a draft as unpublished', async () => {
    const { library } = make();
    expect((await library.open('text:es:revisado-ch01')).published).toBe(true);
    const draft = await library.open('text:es:camino-test-ch01');
    expect(draft).toMatchObject({ published: false, generated: true, reviewStatus: 'unreviewed' });
  });

  it('passes the installed dictionary to the importer', async () => {
    const asked: string[] = [];
    const lexicon = (lang: 'es'): LexiconSource => { asked.push(lang); return { lang, info: async () => undefined, lookup: async () => new Map() }; };
    const { library } = make(createMemoryStore(), out, { lexicon });
    await library.open('text:es:cuento-publico-ch02');
    expect(asked).toContain('es');
  });

  it('refuses what is not a library text, or what it cannot read, with a plain message', async () => {
    const { library, store } = make();
    await expect(library.open('text:es:no-existe')).rejects.toThrow(/not in the library/);
    await store.catalog.put({ id: 'text:es:local', lang: 'es', title: 'Local', stream: 'personal', rights: 'user-supplied', location: 'personal', published: true, features: { words: 1, sentences: 1, uniqueForms: 1, meanSentenceWords: 1 } });
    await expect(library.open('text:es:local')).rejects.toThrow(/not a library text/);
    // a document that is another text
    const swapped = new Map(out);
    swapped.set('t/' + [...out.keys()].find((k) => k.endsWith('cuento-publico-ch01.json') && k.startsWith('t/'))!.slice(2), out.get([...out.keys()].find((k) => k.endsWith('cuento-publico-ch02.json') && k.startsWith('t/'))!)!);
    await expect(make(createMemoryStore(), swapped).library.open('text:es:cuento-publico-ch01')).rejects.toThrow(/is not that text/);
    // a document that is missing from the library
    const missing = new Map(out);
    for (const k of [...missing.keys()]) if (k.startsWith('t/')) missing.delete(k);
    await expect(make(createMemoryStore(), missing).library.open('text:es:cuento-publico-ch01')).rejects.toThrow(/could not be read/);
    // a document the importer rejects
    const broken = new Map(out);
    const key = [...out.keys()].find((k) => k.startsWith('t/') && k.endsWith('cuento-publico-ch01.json'))!;
    broken.set(key, JSON.stringify({ ...JSON.parse(out.get(key)!), sections: [] }));
    await expect(make(createMemoryStore(), broken).library.open('text:es:cuento-publico-ch01')).rejects.toThrow(/could not be imported/);
  });
});
