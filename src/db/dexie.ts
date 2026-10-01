/**
 * DexieStore — the browser AppStore on Dexie 4 (IndexedDB).
 *
 * Schema is generated from INDEXES (src/core/store.ts), so `where()` on any indexed field is an
 * IndexedDB index lookup. Semantics match MemoryStore: put = upsert by id, where = equality, reads
 * return structured copies (IndexedDB clones on the way out).
 *
 * Audio bytes do NOT live on the records: `IndexedDbAssetStore` keeps them in a separate `blobs`
 * object store, content-addressed (sha256 when WebCrypto is available, FNV otherwise), and hands the
 * player object URLs.
 */
import Dexie from 'dexie';
import type { Table as DexieTable } from 'dexie';
import type { AppStore, AssetStore, Table } from '../core/store';
import { INDEXES } from '../core/store';
import { hash } from '../core/ids';

type TableName = keyof typeof INDEXES;

export const BLOBS_TABLE = 'blobs';

/** Dexie schema string for one table: primary key `id` plus every indexed field. */
export function schemaFor(): Record<string, string> {
  const schema: Record<string, string> = {};
  for (const name of Object.keys(INDEXES) as TableName[]) {
    schema[name] = ['id', ...INDEXES[name]].join(',');
  }
  schema[BLOBS_TABLE] = 'id';
  return schema;
}

/**
 * The schema as shipped in version 1 (contract v1): no `drafts` / `meta` tables, no `texts.reviewStatus`
 * and no `sentences.key` index. Written out literally (not derived from INDEXES) because INDEXES moved on;
 * an upgrade test opens a real database at this version and upgrades it.
 */
export const SCHEMA_V1: Record<string, string> = {
  users: 'id,courseId', languages: 'id', courses: 'id,lang', sources: 'id,rights', corpora: 'id,lang,kind',
  texts: 'id,corpusId,lang,kind,sourceId', sections: 'id,textId', paragraphs: 'id,textId,sectionId',
  sentences: 'id,textId,paragraphId,lang,textHash', tokens: 'id,sentenceId,textId,formId,normalized',
  lemmas: 'id,lang,lemma', analyses: 'id,tokenId,lemmaId,provenance', phrases: 'id,lang',
  phraseOccurrences: 'id,phraseId,sentenceId,textId', patterns: 'id,lang,key', patternOccurrences: 'id,patternId,sentenceId,textId',
  rescues: 'id,sentenceId,textId', events: 'id,userId,type,dedupeKey,session', encounters: 'id,userId,itemId,sentenceId,textId',
  learnerItems: 'id,userId,itemId,lang,itemKind', voices: 'id,lang,courseId,providerId', audioAssets: 'id,sourceType,lang',
  audioSegments: 'id,textId,cacheKey,voiceConfigId,status,assetId', alignments: 'id,segmentId,unitId,assetId',
  manifests: 'id,textId,voiceConfigId', audioJobs: 'id,segmentId,status', pronunciations: 'id,lang,match',
  recordings: 'id,userId,assetId', testimonies: 'id,userId,lang', revisions: 'id,testimonyId,userId',
  suggestions: 'id,testimonyId,userId,draftHash,status', [BLOBS_TABLE]: 'id',
};

/**
 * The schema as shipped in version 2 (contract v2): `drafts`, `meta`, `texts.reviewStatus`, `sentences.key`, but no
 * curriculum tables (`stages`, `works`, `notes`) and no `texts.workId` index. Written out literally for the same reason as
 * SCHEMA_V1: an upgrade test opens a real database at this version and upgrades it to version 3.
 */
export const SCHEMA_V2: Record<string, string> = {
  ...SCHEMA_V1,
  texts: 'id,corpusId,lang,kind,sourceId,reviewStatus',
  sentences: 'id,textId,paragraphId,lang,textHash,key',
  drafts: 'id,userId,lang',
  meta: 'id',
};

export const MIGRATION_V2_META_ID = 'migration:dexie-v2';

/** Loose row type for the upgrade: rows written by contract v1 lack the v2 fields. */
type LegacyRow = Record<string, unknown>;

/**
 * Version 1 to 2, without losing or rewriting anything that mattered.
 *  - New tables `drafts` and `meta` and the new indexes are created by Dexie from the v2 schema.
 *  - Text rows gain the fields contract v2 requires, with the CONSERVATIVE truth: nothing imported under v1 was
 *    ever reviewed or verified, so `reviewStatus: 'unreviewed'`, `published: false` and a reason that says why.
 *    (Re-importing the text through the v2 importer replaces these with the real values.)
 *  - Voices and audio assets: everything audio v1 could produce was fixture tone, so `isSpeech: false` and
 *    `reviewStatus: 'unreviewed'`. That keeps old fixture plays from ever counting as listening evidence.
 *  - Sentence rows are left exactly as they were (no `key`): the importer recognises and retires legacy rows.
 *  - Events, encounters, learner state, testimonies, revisions, recordings and blobs are untouched.
 * A `meta` row records when the upgrade ran and how many rows were touched.
 */
export async function upgradeToV2(tx: { table(name: string): DexieTable<LegacyRow, string> }, now = new Date().toISOString()): Promise<void> {
  const touched = { texts: 0, voices: 0, audioAssets: 0 };
  await tx.table('texts').toCollection().modify((row: LegacyRow) => {
    let changed = false;
    const fill = (key: string, value: unknown) => { if (row[key] === undefined) { row[key] = value; changed = true; } };
    fill('reviewStatus', 'unreviewed');
    fill('editorialTags', []);
    fill('prepTargets', []);
    fill('schemaVersion', 1);
    if (row.published === undefined) {
      row.published = false;
      row.unpublishedReasons = ['Imported before review tracking existed (import schema 1): re-import it with the current importer and record a review.'];
      changed = true;
    } else fill('unpublishedReasons', []);
    if (changed) touched.texts += 1;
  });
  await tx.table('voices').toCollection().modify((row: LegacyRow) => {
    let changed = false;
    if (row.reviewStatus === undefined) { row.reviewStatus = 'unreviewed'; changed = true; }
    if (row.isSpeech === undefined) { row.isSpeech = false; changed = true; }
    if (changed) touched.voices += 1;
  });
  await tx.table('audioAssets').toCollection().modify((row: LegacyRow) => {
    if (row.isSpeech === undefined) { row.isSpeech = false; touched.audioAssets += 1; }
  });
  await tx.table('meta').put({ id: MIGRATION_V2_META_ID, value: JSON.stringify({ from: 1, to: 2, touched }), updatedAt: now });
}

/** Keys IndexedDB can index. Booleans / undefined / objects are not valid keys → filter instead. */
function isIndexableKey(v: unknown): v is string | number | Date {
  return typeof v === 'string' || (typeof v === 'number' && !Number.isNaN(v)) || v instanceof Date;
}

class DexieTableAdapter<T extends { id: string }> implements Table<T> {
  private readonly indexed: Set<string>;
  constructor(private readonly table: DexieTable<T, string>, indexedFields: string[]) {
    this.indexed = new Set(indexedFields);
  }
  get(id: string) { return this.table.get(id); }
  getMany(ids: string[]) { return this.table.bulkGet(ids) as Promise<(T | undefined)[]>; }
  async put(row: T) { await this.table.put(row); }
  async bulkPut(rows: T[]) { if (rows.length) await this.table.bulkPut(rows); }
  async delete(id: string) { await this.table.delete(id); }
  all() { return this.table.toArray(); }
  async where<K extends keyof T & string>(field: K, value: T[K]): Promise<T[]> {
    if (this.indexed.has(field) && isIndexableKey(value)) {
      // Dexie's typing wants the index name as string and the key as IndexableType.
      return this.table.where(field).equals(value as never).toArray();
    }
    // Non-indexed field or a value IndexedDB cannot key (boolean, undefined): same equality semantics.
    return this.table.filter((r) => r[field] === value).toArray();
  }
  count() { return this.table.count(); }
}

interface BlobRow { id: string; mime: string; bytes: ArrayBuffer }

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out;
}

/** Content id for bytes: `sha256:<hex>` when WebCrypto exists, else `fnv:<hash>` (same as MemoryAssetStore). */
export async function contentId(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle) {
    return `sha256:${toHex(await subtle.digest('SHA-256', copyBytes(bytes)))}`;
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `fnv:${hash(s)}`;
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export class IndexedDbAssetStore implements AssetStore {
  private readonly urls = new Map<string, string>();
  constructor(private readonly blobs: DexieTable<BlobRow, string>) {}

  async put(bytes: Uint8Array, mime: string): Promise<string> {
    const id = await contentId(bytes);
    if (!(await this.blobs.get(id))) {
      const copy = copyBytes(bytes);
      await this.blobs.put({ id, mime, bytes: copy.buffer });
    }
    return id;
  }

  async get(id: string) {
    const row = await this.blobs.get(id);
    return row ? { bytes: new Uint8Array(row.bytes), mime: row.mime } : undefined;
  }

  async has(id: string) {
    return (await this.blobs.get(id)) !== undefined;
  }

  /** An object URL a browser <audio> can play; cached per id for the life of the store. */
  async url(id: string) {
    const cached = this.urls.get(id);
    if (cached) return cached;
    const row = await this.blobs.get(id);
    if (!row) return undefined;
    const bytes = new Uint8Array(row.bytes);
    let url: string;
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
      url = URL.createObjectURL(new Blob([bytes], { type: row.mime }));
    } else {
      url = toDataUrl(bytes, row.mime);
    }
    this.urls.set(id, url);
    return url;
  }

  /** Release object URLs (tests / store close). */
  revokeAll() {
    for (const url of this.urls.values()) {
      if (url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    }
    this.urls.clear();
  }
}

export interface DexieAppStore extends AppStore {
  readonly db: Dexie;
  close(): void;
  /** Delete the whole database (Settings → reset, tests). */
  destroy(): Promise<void>;
}

export function createDexieStore(name = 'go-v0'): DexieAppStore {
  const db = new Dexie(name);
  db.version(1).stores(SCHEMA_V1);
  db.version(2).stores(SCHEMA_V2).upgrade((tx) => upgradeToV2(tx as unknown as Parameters<typeof upgradeToV2>[0]));
  // Version 3 (Thai course foundation) only ADDS: the `stages`, `works` and `notes` tables and the `texts.workId` index.
  // Existing rows need no rewriting (a text without `workId` is simply not part of a ladder), so there is no upgrade step.
  db.version(3).stores(schemaFor());

  const store = {} as DexieAppStore;
  for (const tableName of Object.keys(INDEXES) as TableName[]) {
    (store as unknown as Record<string, unknown>)[tableName] = new DexieTableAdapter(
      db.table(tableName) as DexieTable<{ id: string }, string>,
      INDEXES[tableName],
    );
  }
  const assets = new IndexedDbAssetStore(db.table(BLOBS_TABLE) as DexieTable<BlobRow, string>);
  store.assets = assets;

  store.transaction = async <R,>(tables: (keyof AppStore)[], fn: () => Promise<R>): Promise<R> => {
    const names = tables.filter((t): t is TableName => t !== 'transaction' && t !== 'assets');
    if (names.length === 0) return fn();
    return db.transaction('rw', names.map((n) => db.table(n)), fn);
  };

  Object.defineProperty(store, 'db', { value: db, enumerable: false });
  store.close = () => { assets.revokeAll(); db.close(); };
  store.destroy = async () => { assets.revokeAll(); db.close(); await Dexie.delete(name); };
  return store;
}
