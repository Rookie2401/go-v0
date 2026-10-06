/** Indexed equality queries for large offline audits. The production app already uses Dexie indexes. */
import { createMemoryStore, INDEXES, type AppStore, type Table } from '../src/core';

export function createAuditStore(): AppStore {
  const store = createMemoryStore();
  for (const name of Object.keys(INDEXES) as (keyof typeof INDEXES)[]) {
    const table = store[name] as unknown as Table<{ id: string } & Record<string, unknown>>;
    const indexes = new Map<string, Map<unknown, Set<string>>>();
    const get = table.get.bind(table), put = table.put.bind(table), bulkPut = table.bulkPut.bind(table), remove = table.delete.bind(table);
    const update = (before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, id: string) => {
      for (const [field, index] of indexes) {
        if (before) { const previous = index.get(before[field]); previous?.delete(id); if (previous?.size === 0) index.delete(before[field]); }
        if (after) { const group = index.get(after[field]) ?? new Set<string>(); group.add(id); index.set(after[field], group); }
      }
    };
    table.where = async (field, value) => {
      let index = indexes.get(field);
      if (!index) {
        index = new Map();
        for (const row of await table.all()) { const group = index.get(row[field]) ?? new Set<string>(); group.add(row.id); index.set(row[field], group); }
        indexes.set(field, index);
      }
      const rows = await table.getMany([...(index.get(value) ?? [])]);
      return rows.filter((row): row is NonNullable<typeof row> => !!row && row[field] === value).map(row => structuredClone(row));
    };
    table.put = async row => { const before = await get(row.id); await put(row); update(before, row, row.id); };
    table.bulkPut = async rows => {
      const final = [...new Map(rows.map(row => [row.id, row])).values()];
      const before = await table.getMany(final.map(row => row.id));
      await bulkPut(final); final.forEach((row, i) => update(before[i], row, row.id));
    };
    table.delete = async id => { const before = await get(id); await remove(id); update(before, undefined, id); };
  }
  return store;
}
