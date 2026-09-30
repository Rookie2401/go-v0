// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { BLOBS_TABLE, MIGRATION_V2_META_ID, SCHEMA_V1, createDexieStore, schemaFor, upgradeToV2 } from '../../src/db/dexie';
import type { DexieAppStore } from '../../src/db/dexie';

let n = 0;
let store: DexieAppStore;
beforeEach(() => { store = createDexieStore(`go-v2-${n++}`); });
afterEach(async () => { await store.destroy(); });

describe('schema version 2', () => {
  it('declares both versions and adds drafts, meta and the new indexes', () => {
    const schema = schemaFor();
    expect(schema.drafts).toBe('id,userId,lang');
    expect(schema.meta).toBe('id');
    expect(schema.texts).toContain('reviewStatus');
    expect(schema.sentences).toContain('key');
    expect(SCHEMA_V1.drafts).toBeUndefined();
    expect(SCHEMA_V1.meta).toBeUndefined();
    expect(SCHEMA_V1.texts).not.toContain('reviewStatus');
    expect(SCHEMA_V1.sentences).not.toContain('key');
    expect(store.db.verno).toBe(2);
  });

  it('stores drafts and meta rows and finds drafts by learner + language', async () => {
    await store.drafts.put({ id: ids.draft('u1', 'es'), userId: 'u1', lang: 'es', text: 'Yo creo.', updatedAt: 'now', seq: 3, basedOnRevisionId: 'r1' });
    await store.drafts.put({ id: ids.draft('u1', 'de'), userId: 'u1', lang: 'de', text: 'Ich glaube.', updatedAt: 'now', seq: 1 });
    await store.meta.put({ id: 'policy:u1', value: 'evidence@2', updatedAt: 'now' });
    expect((await store.drafts.where('userId', 'u1')).map((d) => d.lang).sort()).toEqual(['de', 'es']);
    expect((await store.drafts.where('lang', 'es'))[0].seq).toBe(3);
    expect((await store.meta.get('policy:u1'))!.value).toBe('evidence@2');
  });
});

describe('upgrade from a version-1 database', () => {
  /** A database exactly as the first release left it: v1 schema, rows as contract v1 wrote them. */
  async function makeV1(name: string) {
    const db = new Dexie(name);
    db.version(1).stores(SCHEMA_V1);
    await db.table('users').put({ id: 'u1', displayName: 'Ana', courseId: 'honduras-es', createdAt: '2026-01-01T00:00:00.000Z' });
    await db.table('texts').bulkPut([
      { id: 'text:es:old-story', corpusId: 'ci-es', lang: 'es', kind: 'story', title: 'Old story', sourceId: 's', importedAt: '2026-01-01T00:00:00.000Z', tags: ['mission'], generated: true, transformations: [], contentVersion: 2 },
      { id: 'text:es:old-john', corpusId: 'bible-es', lang: 'es', kind: 'scripture', title: 'Juan 3', sourceId: 's', importedAt: '2026-01-01T00:00:00.000Z', tags: [], generated: false, transformations: [], contentVersion: 1 },
    ]);
    const sentence = { id: 'text:es:old-story/s0', textId: 'text:es:old-story', paragraphId: 'p', lang: 'es', index: 0, text: 'Yo creo en Dios.', normalizedText: 'yo creo en dios.', textHash: 'h0' };
    await db.table('sentences').put(sentence);
    await db.table('voices').put({ id: 'es-HN:fixture:default', lang: 'es', providerId: 'fixture', voiceId: 'fixture-voice', requestedLocale: 'es-HN', actualLocale: 'es-419', approved: false });
    await db.table('audioAssets').put({ id: 'asset:1', sourceType: 'generated-tts', lang: 'es', locale: 'es-419', mime: 'audio/wav', sampleRate: 22050, channels: 1, durationMs: 800, bytes: 4, checksum: 'x', createdAt: '2026-01-01T00:00:00.000Z' });
    await db.table('events').bulkPut([
      { id: 'ev:1', type: 'TextViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 's', dedupeKey: 'k1', at: '2026-01-02T00:00:00.000Z', textId: 'text:es:old-story' },
      { id: 'ev:2', type: 'AudioSegmentCompleted', userId: 'u1', lang: 'es', surface: 'listen', session: 's', dedupeKey: 'k2', at: '2026-01-02T00:01:00.000Z', textId: 'text:es:old-story', segmentId: 'seg:1', sentenceIds: ['text:es:old-story/s0'], speed: 1, transcriptVisible: true, replayCount: 0, revealedTranscript: false, revealedTranslation: false },
    ]);
    await db.table('encounters').put({ id: 'enc:1', userId: 'u1', itemId: 'form:es:creo', sentenceId: 'text:es:old-story/s0', textId: 'text:es:old-story' });
    await db.table('testimonies').put({ id: 'tst:u1:es', userId: 'u1', lang: 'es', title: 'My testimony', createdAt: '2026-01-03T00:00:00.000Z' });
    await db.table('revisions').put({ id: 'tst:u1:es/r1', testimonyId: 'tst:u1:es', userId: 'u1', lang: 'es', number: 1, createdAt: '2026-01-03T00:00:00.000Z', fullText: 'Yo creo en Dios.', sentences: [], acceptedSuggestionIds: [] });
    await db.table(BLOBS_TABLE).put({ id: 'asset:1', mime: 'audio/wav', bytes: new Uint8Array([1, 2, 3, 4]).buffer });
    const counts = Object.fromEntries(await Promise.all(Object.keys(SCHEMA_V1).map(async (t) => [t, await db.table(t).count()])));
    db.close();
    return { sentence, counts };
  }

  it('keeps every row, adds the new tables, and marks old content conservatively', async () => {
    const name = `go-upgrade-${n++}`;
    const { sentence, counts } = await makeV1(name);
    const up = createDexieStore(name);
    try {
      // nothing was lost: every v1 table has exactly the rows it had
      for (const table of Object.keys(counts)) expect(await up.db.table(table).count(), table).toBe(counts[table]);
      expect(up.db.verno).toBe(2);

      // events and encounters are untouched
      expect((await up.events.get('ev:2'))!.type).toBe('AudioSegmentCompleted');
      expect(await up.encounters.get('enc:1')).toEqual({ id: 'enc:1', userId: 'u1', itemId: 'form:es:creo', sentenceId: 'text:es:old-story/s0', textId: 'text:es:old-story' });
      // sentences are left exactly as written (no invented key: the importer retires legacy rows itself)
      expect(await up.sentences.get(sentence.id)).toEqual(sentence);
      // testimony history and audio bytes survive
      expect((await up.revisions.get('tst:u1:es/r1'))!.fullText).toBe('Yo creo en Dios.');
      expect([...(await up.assets.get('asset:1'))!.bytes]).toEqual([1, 2, 3, 4]);

      // texts: nothing imported under v1 was ever reviewed or verified, so they are unpublished, with a reason
      const story = (await up.texts.get('text:es:old-story'))!;
      expect(story).toMatchObject({ title: 'Old story', tags: ['mission'], generated: true, contentVersion: 2, reviewStatus: 'unreviewed', published: false, schemaVersion: 1, editorialTags: [], prepTargets: [] });
      expect(story.unpublishedReasons[0]).toMatch(/Imported before review tracking/);
      expect((await up.texts.get('text:es:old-john'))!.published).toBe(false);

      // fixture audio can never have been speech
      expect(await up.voices.get('es-HN:fixture:default')).toMatchObject({ isSpeech: false, reviewStatus: 'unreviewed', approved: false });
      expect((await up.audioAssets.get('asset:1'))!.isSpeech).toBe(false);

      // the upgrade left a record of what it did
      const meta = (await up.meta.get(MIGRATION_V2_META_ID))!;
      expect(JSON.parse(meta.value)).toEqual({ from: 1, to: 2, touched: { texts: 2, voices: 1, audioAssets: 1 } });

      // new tables and indexes work on the upgraded database
      await up.drafts.put({ id: ids.draft('u1', 'es'), userId: 'u1', lang: 'es', text: 'x', updatedAt: 'now', seq: 1 });
      expect(await up.drafts.where('userId', 'u1')).toHaveLength(1);
      expect((await up.texts.where('reviewStatus', 'unreviewed')).map((t) => t.id).sort()).toEqual(['text:es:old-john', 'text:es:old-story']);
    } finally {
      await up.destroy();
    }
  });

  it('does not touch rows written after the upgrade, and reopening does not upgrade twice', async () => {
    const name = `go-upgrade-${n++}`;
    await makeV1(name);
    const first = createDexieStore(name);
    await first.texts.put({
      id: 'text:es:new', corpusId: 'ci-es', lang: 'es', kind: 'story', title: 'New', sourceId: 's', importedAt: 'now', tags: [], editorialTags: [], prepTargets: [],
      reviewStatus: 'reviewed', published: true, unpublishedReasons: [], schemaVersion: 2, generated: false, transformations: [], contentVersion: 1,
    });
    await first.texts.get('text:es:new'); // opening the database ran the upgrade
    const metaBefore = await first.meta.get(MIGRATION_V2_META_ID);
    first.close();
    const second = createDexieStore(name);
    try {
      expect(await second.texts.get('text:es:new')).toMatchObject({ reviewStatus: 'reviewed', published: true });
      expect(await second.meta.get(MIGRATION_V2_META_ID)).toEqual(metaBefore);
      expect(second.db.verno).toBe(2);
    } finally {
      await second.destroy();
    }
  });

  it('fills only what is missing in a partially upgraded row', async () => {
    const rows: Record<string, Array<Record<string, unknown>>> = {
      texts: [{ id: 't', published: true, reviewStatus: 'approved' }],
      voices: [{ id: 'v', reviewStatus: 'reviewed', isSpeech: true }],
      audioAssets: [{ id: 'a', isSpeech: true }],
      meta: [],
    };
    const tx = {
      table: (name: string) => ({
        toCollection: () => ({ modify: async (fn: (r: Record<string, unknown>) => void) => { for (const r of rows[name]) fn(r); } }),
        put: async (r: Record<string, unknown>) => { rows[name].push(r); },
      }),
    };
    await upgradeToV2(tx as never, '2026-02-02T00:00:00.000Z');
    expect(rows.texts[0]).toMatchObject({ published: true, reviewStatus: 'approved', editorialTags: [], prepTargets: [], unpublishedReasons: [], schemaVersion: 1 });
    expect(rows.voices[0]).toEqual({ id: 'v', reviewStatus: 'reviewed', isSpeech: true });
    expect(rows.audioAssets[0]).toEqual({ id: 'a', isSpeech: true });
    expect(rows.meta[0]).toMatchObject({ id: MIGRATION_V2_META_ID, updatedAt: '2026-02-02T00:00:00.000Z' });
  });
});
