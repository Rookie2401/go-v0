// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../packages/repository-store/src';
import { storeConformance } from './conformance';
import { storeProvenanceConformance } from './provenance';
import { L1, doc, ev } from './fixtures';

storeConformance('memory store', async () => createMemoryStore());
storeProvenanceConformance('memory store', async () => createMemoryStore());

describe('memory store specifics', () => {
  it('stamps recordedAt from the injected clock, once per event', async () => {
    let n = 0;
    const s = createMemoryStore({ now: () => `2026-10-08T12:00:0${n++}.000Z` });
    await s.append(L1, [ev('e1'), ev('e2')]);
    expect((await s.list({ learnerId: L1 })).map((e) => e.recordedAt)).toEqual(['2026-10-08T12:00:00.000Z', '2026-10-08T12:00:01.000Z']);
  });

  it('stamps deletedAt of a deleted document from the injected clock', async () => {
    const s = createMemoryStore({ now: () => '2026-10-08T12:00:00.000Z' });
    await s.putDocument(doc(L1, 'd1', 'x'), 0);
    await s.deleteDocument(L1, 'd1');
    expect((await s.getDocument(L1, 'd1'))!.deletedAt).toBe('2026-10-08T12:00:00.000Z');
  });

  it('copies what it is given: mutating the caller’s object afterwards changes nothing stored', async () => {
    const s = createMemoryStore();
    const event = ev('e1');
    await s.append(L1, [event]);
    (event.payload as { surface: string }).surface = 'changed';
    expect(((await s.get(L1, 'e1'))!.payload as { surface: string }).surface).toBe('shtëpinë');
  });

  it('transaction just runs fn (no rollback in memory)', async () => {
    const s = createMemoryStore();
    await expect(s.transaction(async () => { await s.append(L1, [ev('e1')]); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await s.head(L1)).toBe(1);
  });
});
