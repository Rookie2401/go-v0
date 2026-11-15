// @vitest-environment node
/**
 * What the service process holds in memory (2026-11-13: the 512 MB instance ran out of it):
 *  - GET /health says how much, where the host can tell, and nothing more than before where it cannot;
 *  - a learner's ranked candidate list and ordered vocabulary leave the process when their window ends, not when someone next asks.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANDIDATE_CACHE_MS, handle, learnerCacheEntries } from '../../../packages/repository-service/src/handler';
import { createHarness, signUp } from './fakes';
import { ev, knowledgeRow, unit } from '../store/fixtures';

afterEach(() => { vi.useRealTimers(); });

describe('GET /health: memory', () => {
  const health = async (h: ReturnType<typeof createHarness>): Promise<{ status: number; body: Record<string, unknown> }> => {
    const r = await handle(new Request('http://service.test/health'), h.deps);
    return { status: r.status, body: await r.json() as Record<string, unknown> };
  };

  it('reports resident, heap and external megabytes when the host supplies them', async () => {
    const h = createHarness();
    h.deps.info = { storeKind: 'memory', startedAt: Date.now(), memory: () => ({ rssMb: 124, heapUsedMb: 41, externalMb: 3 }) };
    const r = await health(h);
    expect(r.status).toBe(200);
    expect(r.body.memory).toEqual({ rssMb: 124, heapUsedMb: 41, externalMb: 3 });
    expect(Object.keys(r.body).sort()).toEqual(['contractVersion', 'memory', 'ok', 'service', 'store', 'uptimeSec', 'version']);
  });

  it('says nothing of memory where the host does not, and a failing reading does not fail the health check', async () => {
    const h = createHarness();
    h.deps.info = { storeKind: 'memory', startedAt: Date.now() };
    expect(Object.keys((await health(h)).body)).not.toContain('memory');
    h.deps.info = { storeKind: 'memory', startedAt: Date.now(), memory: () => { throw new Error('no reading'); } };
    const r = await health(h);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).not.toContain('memory');
  });
});

describe('the per-learner lists kept in memory', () => {
  async function world() {
    const h = createHarness();
    const user = await signUp(h, 'memory@example.test');
    const rows = Array.from({ length: 12 }, (_, i) => `lemma:sq:m${String(i).padStart(2, '0')}:NOUN`);
    await h.store.putUnits(rows.map((id) => unit(id, 'verified', { label: id.split(':')[2] })));
    await h.store.putKnowledge(rows.map((id) => ({ ...knowledgeRow(user.learnerId, id), level: 'seen' as const, encounters: 1 })));
    return { h, user, rows };
  }

  it('an ordered vocabulary and a ranked candidate list leave when their window ends, with no further request', async () => {
    const { h, user } = await world();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    expect((await user.api.vocabulary({ languageId: 'sq', sort: 'alphabetical' })).ok).toBe(true);
    expect((await user.api.candidates(user.enrolmentId!, 50)).ok).toBe(true);
    expect(learnerCacheEntries(h.store, user.learnerId)).toBe(2);
    vi.advanceTimersByTime(CANDIDATE_CACHE_MS - 1000);
    expect(learnerCacheEntries(h.store, user.learnerId)).toBe(2); // still inside the window
    vi.advanceTimersByTime(2001);
    expect(learnerCacheEntries(h.store, user.learnerId)).toBe(0);
  });

  it('an older entry leaving does not take the newer one that replaced it under the same key', async () => {
    const { h, user, rows } = await world();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    expect((await user.api.vocabulary({ languageId: 'sq', sort: 'alphabetical' })).ok).toBe(true);
    vi.advanceTimersByTime(15_000);
    // the learner's log moves: the same listing is ordered again and kept under the same key
    await h.store.append(user.learnerId, [ev('memory:1', { learnerId: user.learnerId, enrolmentId: user.enrolmentId!, kind: 'EncounterRecorded', subject: { itemIds: [rows[0]] }, payload: { contextKind: 'fragment', surface: 'm00' } })]);
    expect((await user.api.vocabulary({ languageId: 'sq', sort: 'alphabetical' })).ok).toBe(true);
    expect(learnerCacheEntries(h.store, user.learnerId)).toBe(1);
    vi.advanceTimersByTime(7000); // the first entry's time is up; the second is 7 s old
    expect(learnerCacheEntries(h.store, user.learnerId)).toBe(1);
    vi.advanceTimersByTime(15_000);
    expect(learnerCacheEntries(h.store, user.learnerId)).toBe(0);
  });
});
