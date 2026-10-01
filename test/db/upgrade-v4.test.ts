// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { INDEXES, ids, type CatalogText } from '../../src/core';
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, createDexieStore, schemaFor, type DexieAppStore } from '../../src/db/dexie';
import { createLibrary, putCatalogRows, searchCatalog } from '../../src/library';
import { createAdapterRegistry } from '../../src/adapters';

let n = 0;
const open: DexieAppStore[] = [];
afterEach(async () => { while (open.length) await open.pop()!.destroy(); });
const track = (s: DexieAppStore) => { open.push(s); return s; };

const row = (slug: string, over: Partial<CatalogText> = {}): CatalogText => ({
  id: ids.text('es', slug), lang: 'es', title: `Titulo ${slug}`, stream: 'library', rights: 'verified-public-domain', location: 'library', published: false,
  features: { words: 100, sentences: 10, uniqueForms: 60, meanSentenceWords: 10 }, ...over,
});

describe('schema version 4 (Spanish course foundation)', () => {
  it('adds the catalog table and its indexes to version 3, and nothing else', () => {
    const v4 = schemaFor();
    expect(v4.catalog).toBe('id,lang,stream,workId,location,stageId');
    expect(INDEXES.catalog).toEqual(['lang', 'stream', 'workId', 'location', 'stageId']);
    expect(SCHEMA_V3.catalog).toBeUndefined();
    for (const t of Object.keys(SCHEMA_V3)) expect(v4[t], t).toBe(SCHEMA_V3[t]);
    expect(Object.keys(v4).sort()).toEqual([...Object.keys(SCHEMA_V3), 'catalog'].sort());
  });
});

describe('upgrade from a version-3 database', () => {
  /** A database exactly as the Thai-course release left it: v3 schema, with a text, learner state, a work and a draft. */
  async function makeV3(name: string) {
    const db = new Dexie(name);
    db.version(1).stores(SCHEMA_V1);
    db.version(2).stores(SCHEMA_V2);
    db.version(3).stores(SCHEMA_V3);
    const text = {
      id: 'text:es:story', corpusId: 'ci-es', lang: 'es', kind: 'story', title: 'Historia', sourceId: 's', importedAt: '2026-01-01T00:00:00.000Z', tags: [], editorialTags: [], prepTargets: [],
      reviewStatus: 'approved', published: true, unpublishedReasons: [], schemaVersion: 2, generated: false, transformations: [], contentVersion: 1, workId: 'work:honduras-es:x',
    };
    await db.table('texts').put(text);
    await db.table('sentences').put({ id: 'text:es:story/s0', key: '0', textId: text.id, paragraphId: 'p', lang: 'es', index: 0, text: 'Yo creo.', normalizedText: 'yo creo.', textHash: 'h', versionAdded: 1 });
    await db.table('learnerItems').put({ id: 'u1|form:es:creo', userId: 'u1', itemId: 'form:es:creo', lang: 'es', itemKind: 'form', encounterCount: 1, textIds: [text.id] });
    await db.table('works').put({ id: 'work:honduras-es:x', courseId: 'honduras-es', stageId: 'stage:honduras-es:s0', lang: 'es', role: 'spine', order: 0, title: 'x', purpose: [], rights: {}, bibliographyVerified: false });
    await db.table('meta').put({ id: 'golearn.policy:u1', value: 'evidence@6', updatedAt: 'then' });
    const counts = Object.fromEntries(await Promise.all(Object.keys(SCHEMA_V3).map(async (t) => [t, await db.table(t).count()])));
    db.close();
    return { text, counts };
  }

  it('keeps every row, adds an empty catalog, and runs no data migration', async () => {
    const name = `go-v4-${n++}`;
    const { text, counts } = await makeV3(name);
    const up = track(createDexieStore(name));
    expect(up.db.verno).toBe(4);
    for (const table of Object.keys(counts)) expect(await up.db.table(table).count(), table).toBe(counts[table]);
    expect(await up.texts.get(text.id)).toEqual(text); // not one field added or rewritten
    expect((await up.meta.get('golearn.policy:u1'))!.value).toBe('evidence@6');
    expect((await up.learnerItems.get('u1|form:es:creo'))!.encounterCount).toBe(1);
    expect(await up.catalog.count()).toBe(0);
    expect(await up.catalog.where('stream', 'library')).toEqual([]);
  });

  it('the new table and its indexes work on the upgraded database, and the library pages through them', async () => {
    const name = `go-v4-${n++}`;
    await makeV3(name);
    const up = track(createDexieStore(name));
    await up.catalog.put(row('a'));
    expect((await up.catalog.where('stream', 'library')).map((r) => r.id)).toEqual(['text:es:a']);
    expect((await up.catalog.where('location', 'library'))).toHaveLength(1);
    expect(await up.catalog.where('stageId', 'stage:honduras-es:s0')).toEqual([]);

    // the library writes rows with their posting lists and pages them (the one catalog row put above is picked up by the self-check)
    await putCatalogRows(up, [row('b', { stream: 'honduras', workId: 'work:honduras-es:x' }), row('c', { title: 'La Edad de Oro', author: 'José Martí' })]);
    const lib = createLibrary({ store: up, adapters: createAdapterRegistry(), fetch: (async () => new Response('', { status: 404 })) as typeof fetch });
    expect(await lib.info('es')).toBeUndefined();
    const all = await lib.search({ lang: 'es' });
    expect(all.total).toBe(3);
    expect((await lib.search({ lang: 'es', stream: 'honduras' })).items.map((r) => r.id)).toEqual(['text:es:b']);
    expect((await lib.search({ lang: 'es', text: 'edad MARTI' })).items.map((r) => r.id)).toEqual(['text:es:c']);
    expect((await searchCatalog(up, { lang: 'es', limit: 2 })).items).toHaveLength(2);
    // the texts the user already had are untouched
    expect((await up.texts.get('text:es:story'))!.title).toBe('Historia');
  });

  it('reopening does not upgrade twice or lose catalogue rows', async () => {
    const name = `go-v4-${n++}`;
    await makeV3(name);
    const first = createDexieStore(name);
    await putCatalogRows(first, [row('keep')]);
    first.close();
    const second = track(createDexieStore(name));
    expect((await second.catalog.get('text:es:keep'))!.title).toBe('Titulo keep');
    expect(second.db.verno).toBe(4);
    expect((await searchCatalog(second, { lang: 'es' })).total).toBe(1);
  });
});
