/**
 * MemoryStore — in-memory AppStore for tests, probes and server-side scripts.
 * Same semantics as the Dexie store (put = upsert by id; where = equality on any field).
 */
import type { AppStore, AssetStore, Table } from './store';
import { INDEXES } from './store';
import { hash } from './ids';

export class MemoryTable<T extends { id: string }> implements Table<T> {
  readonly rows = new Map<string, T>();
  async get(id: string) { return this.rows.get(id); }
  async getMany(ids: string[]) { return ids.map((id) => this.rows.get(id)); }
  async put(row: T) { this.rows.set(row.id, structuredClone(row)); }
  async bulkPut(rows: T[]) { for (const r of rows) this.rows.set(r.id, structuredClone(r)); }
  async delete(id: string) { this.rows.delete(id); }
  async all() { return [...this.rows.values()].map((r) => structuredClone(r)); }
  async where<K extends keyof T & string>(field: K, value: T[K]) {
    const out: T[] = [];
    for (const r of this.rows.values()) if (r[field] === value) out.push(structuredClone(r));
    return out;
  }
  async count() { return this.rows.size; }
}

export class MemoryAssetStore implements AssetStore {
  private readonly blobs = new Map<string, { bytes: Uint8Array; mime: string }>();
  async put(bytes: Uint8Array, mime: string) {
    const id = `fnv:${hash(bytesToLatin1(bytes))}`;
    if (!this.blobs.has(id)) this.blobs.set(id, { bytes: new Uint8Array(bytes), mime });
    return id;
  }
  async get(id: string) { return this.blobs.get(id); }
  async has(id: string) { return this.blobs.has(id); }
  async url(id: string) {
    const b = this.blobs.get(id);
    if (!b) return undefined;
    let bin = '';
    for (let i = 0; i < b.bytes.length; i += 0x8000) bin += String.fromCharCode(...b.bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin); // btoa is global in browsers and Node ≥ 16
    return `data:${b.mime};base64,${b64}`;
  }
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

export function createMemoryStore(): AppStore {
  const store = {} as AppStore;
  for (const name of Object.keys(INDEXES) as (keyof typeof INDEXES)[]) {
    (store as unknown as Record<string, unknown>)[name] = new MemoryTable();
  }
  store.assets = new MemoryAssetStore();
  store.transaction = async (_tables, fn) => fn();
  return store;
}
