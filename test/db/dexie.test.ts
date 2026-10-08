// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INDEXES, StoreEventBus, buildFixtureText, ids, seedBasics } from '../../src/core';
import type { AppStore, TextViewed } from '../../src/core';
import { createDexieStore, schemaFor } from '../../src/db/dexie';
import type { DexieAppStore } from '../../src/db/dexie';

let n = 0;
let store: DexieAppStore;

beforeEach(() => { store = createDexieStore(`go-test-${n++}`); });
afterEach(async () => { await store.destroy(); });

type Row = { id: string } & Record<string, unknown>;
const tableNames = Object.keys(INDEXES) as (keyof typeof INDEXES)[];
const tableOf = (name: keyof typeof INDEXES) => store[name] as unknown as {
  get(id: string): Promise<Row | undefined>;
  getMany(ids: string[]): Promise<(Row | undefined)[]>;
  put(r: Row): Promise<void>;
  bulkPut(r: Row[]): Promise<void>;
  delete(id: string): Promise<void>;
  all(): Promise<Row[]>;
  where(f: string, v: unknown): Promise<Row[]>;
  count(): Promise<number>;
};

/** A row whose every indexed field has a distinct, recognisable value, plus a nested payload. */
function sampleRow(name: string, id: string, fields: string[]): Row {
  const row: Row = { id, payload: { nested: [1, 2, { deep: 'x' }], name } };
  for (const f of fields) row[f] = `${f}:${id}`;
  return row;
}

describe('Dexie store', () => {
  it('generates the schema from INDEXES for every table plus blobs', () => {
    const schema = schemaFor();
    for (const name of tableNames) expect(schema[name]).toBe(['id', ...INDEXES[name]].join(','));
    expect(schema.blobs).toBe('id');
  });

  it.each(tableNames)('round-trips %s and filters on every indexed field', async (name) => {
    const t = tableOf(name);
    const a = sampleRow(name, 'a', INDEXES[name]);
    const b = sampleRow(name, 'b', INDEXES[name]);
    await t.put(a);
    await t.bulkPut([b]);
    expect(await t.get('a')).toEqual(a);
    expect(await t.count()).toBe(2);
    expect((await t.all()).map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(await t.getMany(['b', 'zzz', 'a'])).toEqual([b, undefined, a]);
    for (const field of INDEXES[name]) {
      const hit = await t.where(field, `${field}:a`);
      expect(hit.map((r) => r.id)).toEqual(['a']);
      expect(await t.where(field, 'no-such-value')).toEqual([]);
    }
    // put is an upsert
    await t.put({ ...a, payload: { replaced: true } });
    expect(await t.count()).toBe(2);
    expect((await t.get('a'))!.payload).toEqual({ replaced: true });
    await t.delete('a');
    expect(await t.get('a')).toBeUndefined();
    expect(await t.count()).toBe(1);
  });

  it('where() falls back to filtering for non-indexed and non-keyable values', async () => {
    await store.texts.put({ id: 't1', corpusId: 'c', lang: 'es', kind: 'story', title: 'x', sourceId: 's', importedAt: '', tags: [], editorialTags: [], prepTargets: [], reviewStatus: 'unreviewed', published: false, unpublishedReasons: [], schemaVersion: 2, generated: true, transformations: [], contentVersion: 1 });
    await store.texts.put({ id: 't2', corpusId: 'c', lang: 'es', kind: 'story', title: 'y', sourceId: 's', importedAt: '', tags: [], editorialTags: [], prepTargets: [], reviewStatus: 'unreviewed', published: false, unpublishedReasons: [], schemaVersion: 2, generated: false, transformations: [], contentVersion: 1 });
    expect((await store.texts.where('generated', true)).map((t) => t.id)).toEqual(['t1']);
    expect((await store.texts.where('title', 'y')).map((t) => t.id)).toEqual(['t2']);
    expect(await store.texts.where('corpusId', 'c')).toHaveLength(2);
  });

  it('stores real fixture content and answers textId / formId queries', async () => {
    await seedBasics(store as AppStore);
    const text = await buildFixtureText(store, {
      lang: 'es', slug: 'dexie-story',
      sentences: [
        { tokens: [{ surface: 'Yo', lemma: 'yo', pos: 'PRON' }, { surface: 'creo', lemma: 'creer', pos: 'VERB', gloss: 'believe' }, { surface: '.', isWord: false }], english: 'I believe.' },
        { tokens: [{ surface: 'Creo', lemma: 'creer', pos: 'VERB' }, { surface: '.', isWord: false }] },
      ],
    });
    expect(await store.sentences.where('textId', text.id)).toHaveLength(2);
    const creo = await store.tokens.where('formId', ids.form('es', 'creo'));
    expect(creo).toHaveLength(2);
    expect((await store.rescues.where('textId', text.id))[0].english).toBe('I believe.');
    expect(await store.users.where('courseId', 'honduras-es')).toHaveLength(1);
    expect(await store.languages.count()).toBe(7);
  });

  it('persists across a reopen of the same database name', async () => {
    const name = `go-reopen-${n++}`;
    const first = createDexieStore(name);
    await first.users.put({ id: 'u', displayName: 'A', courseId: 'c', createdAt: 'now' });
    first.close();
    const second = createDexieStore(name);
    expect((await second.users.get('u'))?.displayName).toBe('A');
    await second.destroy();
  });

  it('runs a transaction and rolls back when the callback throws', async () => {
    await store.transaction(['users'], async () => {
      await store.users.put({ id: 'u1', displayName: 'A', courseId: 'c', createdAt: '' });
      await store.users.put({ id: 'u2', displayName: 'B', courseId: 'c', createdAt: '' });
    });
    expect(await store.users.count()).toBe(2);
    await expect(store.transaction(['users'], async () => {
      await store.users.put({ id: 'u3', displayName: 'C', courseId: 'c', createdAt: '' });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await store.users.get('u3')).toBeUndefined();
  });

  it('drives the StoreEventBus: append, dedupe, history', async () => {
    const bus = new StoreEventBus(store);
    const base = { userId: 'u1', lang: 'es' as const, surface: 'corpus' as const, session: 's1' };
    const first = await bus.emit<TextViewed>({ ...base, type: 'TextViewed', textId: 't', dedupeKey: 'k1' });
    const dup = await bus.emit<TextViewed>({ ...base, type: 'TextViewed', textId: 't', dedupeKey: 'k1' });
    expect(first).not.toBeNull();
    expect(dup).toBeNull();
    expect((await bus.history({ userId: 'u1' }))).toHaveLength(1);
    expect(await store.events.where('type', 'TextViewed')).toHaveLength(1);
    // a second bus over the same database still dedupes (seen-set is rebuilt from the log)
    const bus2 = new StoreEventBus(store);
    expect(await bus2.emit<TextViewed>({ ...base, type: 'TextViewed', textId: 't', dedupeKey: 'k1' })).toBeNull();
  });
});

describe('IndexedDbAssetStore', () => {
  it('stores bytes content-addressed and idempotently', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250]);
    const id = await store.assets.put(bytes, 'audio/wav');
    expect(id).toMatch(/^(sha256|fnv):/);
    expect(await store.assets.put(new Uint8Array(bytes), 'audio/wav')).toBe(id);
    expect(await store.assets.has(id)).toBe(true);
    expect(await store.assets.has('sha256:nope')).toBe(false);
    const got = await store.assets.get(id);
    expect(got?.mime).toBe('audio/wav');
    expect([...got!.bytes]).toEqual([...bytes]);
    const other = await store.assets.put(new Uint8Array([9, 9]), 'audio/wav');
    expect(other).not.toBe(id);
  });

  it('returns a playable URL (object URL or data URL), stable per id', async () => {
    const id = await store.assets.put(new Uint8Array([10, 20, 30]), 'audio/wav');
    const url = await store.assets.url(id);
    expect(url).toMatch(/^(blob:|data:audio\/wav)/);
    expect(await store.assets.url(id)).toBe(url);
    expect(await store.assets.url('sha256:missing')).toBeUndefined();
  });
});
