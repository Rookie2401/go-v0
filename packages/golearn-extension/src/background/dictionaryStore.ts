/**
 * The dictionary files a learner chose to keep for offline use ("Download for offline use" in the setup page), in the worker's own
 * IndexedDB database `golearn-dictionary` (never in chrome.storage: a whole language is tens of megabytes, and several paths read
 * chrome.storage rows by prefix or list the whole area).
 *
 * Two object stores, written together in one transaction:
 *   `files`  key = the file id (`dict/sq/s-00`, `dict/sq/forms/f-0a`: the same id the chrome.storage row of that file has, so a copy is
 *            location-independent, like the row) -> { bytes: Uint8Array AS FETCHED (a .gz file stays compressed), size, revision, lang, at }
 *   `index`  key = the file id -> { id, lang, revision, size }  (small: what a resume or a status asks, without touching the bytes)
 *
 * Opened lazily, once per worker life, on the first read after a chrome.storage miss (or the first write). Where IndexedDB is absent or
 * fails, every read answers "not here" and the worker behaves exactly as it did without this file.
 */
export const DICTIONARY_DB = 'golearn-dictionary';
const FILES = 'files';
const INDEX = 'index';

export interface StoredFile { id: string; lang: string; revision: string; size: number }

export interface DictionaryStore {
  /** The stored bytes of a file, or undefined (nothing stored, no IndexedDB, any failure). Never throws. */
  read(id: string): Promise<Uint8Array | undefined>;
  /** Store one file (bytes as fetched). Rejects when the browser refuses (quota): the caller says so. */
  write(file: StoredFile & { bytes: Uint8Array }): Promise<void>;
  /** What is stored for a language (revision and size per file). Never throws. */
  list(lang: string): Promise<StoredFile[]>;
  /** Delete the language's files, except those of `keepRevision` when given. Returns how many were removed. */
  removeLanguage(lang: string, keepRevision?: string): Promise<number>;
  /** Delete the whole database (every language). */
  destroy(): Promise<void>;
  /** False when there is no IndexedDB at all. */
  readonly available: boolean;
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed')); });
const done = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
});

export function createDictionaryStore(indexedDB: IDBFactory | undefined): DictionaryStore {
  let opening: Promise<IDBDatabase> | undefined;

  function open(): Promise<IDBDatabase> {
    if (!indexedDB) return Promise.reject(new Error('no IndexedDB'));
    if (!opening) {
      const p = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DICTIONARY_DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
          if (!db.objectStoreNames.contains(INDEX)) db.createObjectStore(INDEX);
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); if (opening === p) opening = undefined; };
          resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB could not be opened'));
        req.onblocked = () => reject(new Error('IndexedDB is blocked'));
      });
      opening = p;
      p.catch(() => { if (opening === p) opening = undefined; }); // a failed open is tried again on the next ask
    }
    return opening;
  }

  return {
    available: !!indexedDB,
    async read(id) {
      if (!indexedDB) return undefined;
      try {
        const db = await open();
        const row = await wrap(db.transaction(FILES, 'readonly').objectStore(FILES).get(id)) as { bytes?: unknown } | undefined;
        return row && row.bytes instanceof Uint8Array ? row.bytes : undefined;
      } catch { return undefined; }
    },
    async write(file) {
      const db = await open();
      const tx = db.transaction([FILES, INDEX], 'readwrite');
      const finished = done(tx);
      tx.objectStore(FILES).put({ bytes: file.bytes, size: file.size, revision: file.revision, lang: file.lang, at: Date.now() }, file.id);
      tx.objectStore(INDEX).put({ id: file.id, lang: file.lang, revision: file.revision, size: file.size } satisfies StoredFile, file.id);
      await finished;
    },
    async list(lang) {
      if (!indexedDB) return [];
      try {
        const db = await open();
        const all = await wrap(db.transaction(INDEX, 'readonly').objectStore(INDEX).getAll()) as StoredFile[];
        return all.filter((f) => f && f.lang === lang);
      } catch { return []; }
    },
    async removeLanguage(lang, keepRevision) {
      if (!indexedDB) return 0;
      try {
        const db = await open();
        const all = await wrap(db.transaction(INDEX, 'readonly').objectStore(INDEX).getAll()) as StoredFile[];
        const drop = all.filter((f) => f && f.lang === lang && (keepRevision === undefined || f.revision !== keepRevision));
        if (!drop.length) return 0;
        const tx = db.transaction([FILES, INDEX], 'readwrite');
        const finished = done(tx);
        for (const f of drop) { tx.objectStore(FILES).delete(f.id); tx.objectStore(INDEX).delete(f.id); }
        await finished;
        return drop.length;
      } catch { return 0; }
    },
    async destroy() {
      if (!indexedDB) return;
      const db = await (opening ?? Promise.resolve(undefined)).catch(() => undefined);
      opening = undefined;
      try { db?.close(); } catch { /* already closed */ }
      await new Promise<void>((resolve) => {
        try {
          const req = indexedDB.deleteDatabase(DICTIONARY_DB);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve(); // another connection still closes by itself (onversionchange above); the delete then completes
        } catch { resolve(); }
      });
    },
  };
}
