/**
 * An in-memory AppStore with the SAME semantics as `createMemoryStore` (put = upsert of a clone, where = equality on a field,
 * every read returns clones), but with hash indexes on the fields of `INDEXES`, so that `where` costs the size of its answer and not
 * the size of the table. `createMemoryStore` scans the whole table on every `where`; that is fine for a test and impossible for a
 * learner who has read a million words (the tokens table alone is then a million rows).
 * Used by the simulation only (src/sim/engine.ts); the app uses Dexie, whose `where` is indexed in the same way.
 */
import { INDEXES, MemoryAssetStore, MemoryTable } from '../core';
import type { AppStore } from '../core';

class IndexedTable<T extends { id: string }> extends MemoryTable<T> {
  private readonly index = new Map<string, Map<unknown, Set<string>>>();

  constructor(fields: readonly string[]) {
    super();
    for (const f of fields) this.index.set(f, new Map());
  }

  private add(row: T): void {
    for (const [field, byValue] of this.index) {
      const v = (row as Record<string, unknown>)[field];
      let ids = byValue.get(v);
      if (!ids) byValue.set(v, (ids = new Set()));
      ids.add(row.id);
    }
  }

  private remove(row: T): void {
    for (const [field, byValue] of this.index) {
      const v = (row as Record<string, unknown>)[field];
      const ids = byValue.get(v);
      if (ids) { ids.delete(row.id); if (ids.size === 0) byValue.delete(v); }
    }
  }

  override async put(row: T): Promise<void> {
    const old = this.rows.get(row.id);
    if (old) this.remove(old);
    await super.put(row);
    this.add(this.rows.get(row.id)!);
  }

  override async bulkPut(rows: T[]): Promise<void> {
    for (const r of rows) await this.put(r);
  }

  override async delete(id: string): Promise<void> {
    const old = this.rows.get(id);
    if (old) this.remove(old);
    await super.delete(id);
  }

  override async where<K extends keyof T & string>(field: K, value: T[K]): Promise<T[]> {
    const byValue = this.index.get(field);
    if (!byValue) return super.where(field, value);
    const out: T[] = [];
    for (const id of byValue.get(value) ?? []) { const r = this.rows.get(id); if (r) out.push(structuredClone(r)); }
    return out;
  }
}

export function createIndexedMemoryStore(): AppStore {
  const store = {} as AppStore;
  for (const name of Object.keys(INDEXES) as (keyof typeof INDEXES)[]) {
    (store as unknown as Record<string, unknown>)[name] = new IndexedTable<{ id: string }>(INDEXES[name]);
  }
  store.assets = new MemoryAssetStore();
  store.transaction = async (_tables, fn) => fn();
  return store;
}
