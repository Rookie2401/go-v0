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
}

/** The three methods chrome.storage.local (and the prototype's StorageArea) already have. */
export interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** Binds a chrome.storage-style area; `list` reads every row and filters (fine for a queue measured in thousands). */
export function adaptStorageArea(a: StorageAreaLike): KeyValueArea {
  return {
    get: (k) => a.get(k),
    set: (i) => a.set(i),
    remove: (k) => a.remove(k),
    async list(prefix) { return Object.keys(await a.get(null)).filter((k) => k.startsWith(prefix)).sort(); },
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
    dump: () => Object.fromEntries([...m].map(([k, v]) => [k, structuredClone(v)])),
  };
}

export async function getOne<T>(area: KeyValueArea, key: string): Promise<T | undefined> {
  const r = await area.get(key);
  return r[key] as T | undefined;
}

/** Reads every row whose key starts with `prefix`, in key order. */
export async function getByPrefix<T>(area: KeyValueArea, prefix: string): Promise<Array<[string, T]>> {
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
