/**
 * The storage port of the sync client: a small key-value area. Compatible in shape with the `StorageArea` of the
 * extension prototype (`get / set / remove`) plus `list(prefix)`, so chrome.storage.local, Dexie (one table of
 * key/value rows) or localStorage can be bound later with a few lines. Every value must be structured-cloneable JSON.
 */
export interface KeyValueArea {
  /** `null` returns every row; a missing key is simply absent from the result. */
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  /** The keys that start with `prefix`, in ascending order. */
  list(prefix: string): Promise<string[]>;
  /** Every row whose key starts with `prefix`, read without the area's other rows when the area can list its keys alone (optional). */
  getPrefix?(prefix: string): Promise<Record<string, unknown>>;
}

/** The three methods chrome.storage.local (and the prototype's StorageArea) already have. */
export interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  /** chrome.storage's key listing (Chrome 130+): the keys alone, without reading a value. */
  getKeys?(): Promise<string[]>;
}

/**
 * Binds a chrome.storage-style area. `list` and `getPrefix` read the keys alone where the browser can (getKeys), then only the rows asked for
 * (2026-11-09: every list read EVERY row of the extension's storage, dictionary pages and the whole device history included, which after the
 * worker slept took 10 s and more with a large history); without it they read every row and filter, as before.
 */
export function adaptStorageArea(a: StorageAreaLike): KeyValueArea {
  return {
    get: (k) => a.get(k),
    set: (i) => a.set(i),
    remove: (k) => a.remove(k),
    async list(prefix) {
      const keys = typeof a.getKeys === 'function' ? await a.getKeys() : Object.keys(await a.get(null));
      return keys.filter((k) => k.startsWith(prefix)).sort();
    },
    async getPrefix(prefix) {
      if (typeof a.getKeys === 'function') {
        const keys = (await a.getKeys()).filter((k) => k.startsWith(prefix));
        return keys.length ? a.get(keys) : {};
      }
      return Object.fromEntries(Object.entries(await a.get(null)).filter(([k]) => k.startsWith(prefix)));
    },
  };
}

/** A Map-backed area (tests, and a fallback when nothing durable is available). Values are cloned on the way in and out. */
export function createMemoryArea(): KeyValueArea & { dump(): Record<string, unknown> } {
  const m = new Map<string, unknown>();
  return {
    async get(keys) {
      if (keys == null) return Object.fromEntries([...m].map(([k, v]) => [k, structuredClone(v)]));
      const out: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) if (m.has(k)) out[k] = structuredClone(m.get(k));
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) m.set(k, structuredClone(v)); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) m.delete(k); },
    async list(prefix) { return [...m.keys()].filter((k) => k.startsWith(prefix)).sort(); },
    async getPrefix(prefix) { return Object.fromEntries([...m].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])); },
    dump: () => Object.fromEntries([...m].map(([k, v]) => [k, structuredClone(v)])),
  };
}

export async function getOne<T>(area: KeyValueArea, key: string): Promise<T | undefined> {
  const r = await area.get(key);
  return r[key] as T | undefined;
}

/** Reads every row whose key starts with `prefix`, in key order. */
export async function getByPrefix<T>(area: KeyValueArea, prefix: string): Promise<Array<[string, T]>> {
  if (area.getPrefix) {
    const rows = await area.getPrefix(prefix);
    return Object.keys(rows).filter((k) => k.startsWith(prefix) && rows[k] !== undefined).sort().map((k) => [k, rows[k] as T]);
  }
  const keys = await area.list(prefix);
  if (!keys.length) return [];
  const rows = await area.get(keys);
  return keys.filter((k) => rows[k] !== undefined).map((k) => [k, rows[k] as T]);
}

/** A promise-chain mutex: operations run one at a time, in call order, and one failure never blocks the next. */
export function createLock(): { run<T>(fn: () => Promise<T>): Promise<T> } {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = tail.then(fn, fn);
      tail = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}
