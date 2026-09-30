// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import { exportLearner, restoreLearner } from '../../src/backup';
import { createDexieStore } from '../../src/db/dexie';
import type { DexieAppStore } from '../../src/db/dexie';

// The Dexie transaction only allows the tables it was told about, so restore must work inside it for real.
let n = 0;
const open: DexieAppStore[] = [];
const make = () => { const s = createDexieStore(`go-backup-test-${n++}`); open.push(s); return s; };
afterEach(async () => { for (const s of open.splice(0)) await s.destroy(); });

async function seed(store: DexieAppStore) {
  await store.users.put({ id: 'u1', displayName: 'One', courseId: 'honduras-es', createdAt: '2026-01-01T00:00:00.000Z' });
  const text = await buildFixtureText(store, { lang: 'es', slug: 'u1-rev1', kind: 'testimony', corpusId: 'testimony-es', sourceId: 'src:t:u1', sentences: [{ tokens: [{ surface: 'Creo', lemma: 'creer', pos: 'VERB' }, { surface: '.', isWord: false }] }] });
  const tid = ids.testimony('u1', 'es');
  await store.testimonies.put({ id: tid, userId: 'u1', lang: 'es', title: 'T', createdAt: '2026-01-01T00:00:00.000Z', currentRevisionId: ids.revision(tid, 1) });
  await store.revisions.put({ id: ids.revision(tid, 1), testimonyId: tid, userId: 'u1', lang: 'es', number: 1, createdAt: '2026-01-01T00:00:00.000Z', fullText: 'Creo.', sentences: [], textId: text.id, acceptedSuggestionIds: [] });
  await store.drafts.put({ id: ids.draft('u1', 'es'), userId: 'u1', lang: 'es', text: 'draft', updatedAt: '2026-01-02T00:00:00.000Z', seq: 3 });
  const assetId = await store.assets.put(new Uint8Array([1, 2, 3, 200, 255]), 'audio/wav');
  await store.recordings.put({ id: 'rec1', userId: 'u1', lang: 'es', target: { text: 'Creo.' }, assetId, attempt: 1, createdAt: '2026-01-01T00:00:00.000Z' });
  await store.events.put({ type: 'TextViewed', id: 'ev1', userId: 'u1', lang: 'es', at: '2026-01-01T00:00:00.000Z', surface: 'corpus', session: 's', dedupeKey: 'k1', textId: 'x' });
}

describe('backup on the Dexie store', () => {
  it('round-trips, is idempotent, and supports replace inside a real transaction', async () => {
    const a = make();
    await seed(a);
    const file = JSON.parse(JSON.stringify(await exportLearner(a, 'u1', { includeRecordings: true })));
    const b = make();
    const first = await restoreLearner(b, file);
    expect(first.events.added).toBe(1);
    expect((await exportLearner(b, 'u1', { includeRecordings: true })).data).toEqual(file.data);
    const second = await restoreLearner(b, file);
    expect(second.changed).toBe(false);
    await b.events.put({ type: 'TextViewed', id: 'ev2', userId: 'u1', lang: 'es', at: '2026-01-03T00:00:00.000Z', surface: 'corpus', session: 's', dedupeKey: 'k2', textId: 'x' });
    const replaced = await restoreLearner(b, file, { mode: 'replace' });
    expect(replaced.removed.events).toBe(2);
    expect(await b.events.get('ev2')).toBeUndefined();
    const rec = (await b.recordings.get('rec1'))!;
    expect(Array.from((await b.assets.get(rec.assetId))!.bytes)).toEqual([1, 2, 3, 200, 255]);
  });
});
