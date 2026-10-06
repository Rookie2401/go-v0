import { expect, it } from 'vitest';
import { createMemoryStore, type Text } from '../../src/core';
import { createAuditStore } from '../../scripts/audit-store';

it('offline audit indexes preserve equality queries through revisions, bulk upserts and deletion', async () => {
  const stores = [createMemoryStore(), createAuditStore()];
  const row = (id: string, lang: string) => ({ id, lang }) as Text;
  for (const store of stores) {
    await store.texts.bulkPut([row('a', 'de'), row('b', 'es')]);
    await store.texts.where('lang', 'de'); // build an index before mutations
    await store.texts.put(row('a', 'hi'));
    await store.texts.bulkPut([row('b', 'de'), row('b', 'th'), row('c', 'sq')]);
    await store.texts.delete('c');
  }
  for (const lang of ['de', 'es', 'hi', 'th', 'sq'] as const) {
    const [expected, actual] = await Promise.all(stores.map(s => s.texts.where('lang', lang)));
    expect(actual).toEqual(expected);
    if (actual[0]) { actual[0].lang = 'sq'; expect((await stores[1].texts.where('lang', lang))[0].lang).toBe(lang); }
  }
});
