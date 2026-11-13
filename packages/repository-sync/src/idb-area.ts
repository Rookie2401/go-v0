/**
 * A `KeyValueArea` over one IndexedDB object store keyed by the string key. `list` and `getPrefix` read one key range
 * (`[prefix, prefix + '￿')`), never the rows of other prefixes; `get` of several keys is one transaction; `set` and `remove`
 * are one atomic transaction per call. The IDBFactory is injected.
 */
import type { KeyValueArea } from './area';

export interface IndexedDbAreaOptions {
  indexedDB: IDBFactory;
  /** The factory's IDBKeyRange (default: the global one). */
  keyRange?: typeof IDBKeyRange;
  /** The database name. */
  name: string;
  /** The object store name (default `kv`). */
  store?: string;
}

const done = <T>(q: IDBRequest<T>): Promise<T> => {
  const p = new Promise<T>((resolve, reject) => {
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error ?? new Error('IndexedDB request failed'));
  });
  p.catch(() => undefined); // a sibling request of an aborted transaction is reported through the transaction, not as an unhandled rejection
  return p;
};

export async function createIndexedDbArea(opts: IndexedDbAreaOptions): Promise<KeyValueArea & { close(): void }> {
  const storeName = opts.store ?? 'kv';
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = opts.indexedDB.open(opts.name, 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(storeName)) open.result.createObjectStore(storeName); };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('could not open the IndexedDB database'));
    open.onblocked = () => reject(new Error('the IndexedDB database is blocked by another connection'));
  });
  db.onversionchange = () => db.close();

  /** One transaction; resolves after it commits. */
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result: T;
    let failure: unknown;
    let failed = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failed ? failure : tx.error ?? new Error('IndexedDB transaction aborted'));
    fn(tx.objectStore(storeName)).then((r) => { result = r; }, (e) => { failed = true; failure = e; try { tx.abort(); } catch { /* finished */ } });
  });
  const prefixRange = (prefix: string): IDBKeyRange | undefined => (prefix === '' ? undefined : (opts.keyRange ?? globalThis.IDBKeyRange).bound(prefix, prefix + '￿', false, true));
  const keysOf = (keys: string | string[]): string[] => [...new Set(Array.isArray(keys) ? keys : [keys])];

  return {
    async get(keys) {
      return run('readonly', async (s) => {
        const out: Record<string, unknown> = {};
        if (keys == null) {
          const [ks, vs] = await Promise.all([done(s.getAllKeys()), done(s.getAll())]);
          ks.forEach((k, i) => { out[k as string] = vs[i]; });
          return out;
        }
        const wanted = keysOf(keys);
        const rows = await Promise.all(wanted.map((k) => done(s.get(k))));
        const present = await Promise.all(wanted.map((k, i) => (rows[i] === undefined ? done(s.count(k)) : Promise.resolve(1))));
        wanted.forEach((k, i) => { if (present[i]) out[k] = rows[i]; });
        return out;
      });
    },
    async set(items) {
      const entries = Object.entries(items);
      if (!entries.length) return;
      await run('readwrite', async (s) => { await Promise.all(entries.map(([k, v]) => done(s.put(v, k)))); });
    },
    async remove(keys) {
      const ks = keysOf(keys);
      if (!ks.length) return;
      await run('readwrite', async (s) => { await Promise.all(ks.map((k) => done(s.delete(k)))); });
    },
    async list(prefix) {
      return run('readonly', async (s) => (await done(s.getAllKeys(prefixRange(prefix)))) as string[]);
    },
    async getPrefix(prefix) {
      return run('readonly', async (s) => {
        const range = prefixRange(prefix);
        const [ks, vs] = await Promise.all([done(s.getAllKeys(range)), done(s.getAll(range))]);
        const out: Record<string, unknown> = {};
        ks.forEach((k, i) => { out[k as string] = vs[i]; });
        return out;
      });
    },
    close() { db.close(); },
  };
}
