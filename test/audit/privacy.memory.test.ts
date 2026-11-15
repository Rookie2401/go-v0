// @vitest-environment node
/**
 * Privacy audit: what the service PROCESS keeps of a learner in memory. Since 2026-11-11 the sorted vocabulary order and the candidate ranking are kept
 * per learner for a short window (handler.ts `orderCaches`, `candidateCaches`), so that the pages of one walk do not each rank the whole list. They are
 * keyed by learner and never served to anyone else; this file pins that they also do not outlive the learner (an erased account) or their window.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_CACHE_MS, forgetLearnerCaches, learnerCacheEntries } from '../../packages/repository-service/src/handler';
import { runMaintenance } from '../../packages/repository-service/src/purge';
import { PASSWORD, STORE_KINDS, createStack, lookup, raw, signUp, type Learner, type Stack, type StoreKind } from './privacy.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

/** One sorted vocabulary page and one candidates page: each leaves an entry in its cache. */
async function read(who: Learner): Promise<void> {
  const v = await who.api.vocabulary({ languageId: 'sq', sort: 'alphabetical', limit: 10 });
  expect(v.ok).toBe(true);
  const c = await who.api.candidates(who.enrolmentId, 10);
  expect(c.ok).toBe(true);
}

describe.each(STORE_KINDS)('what the process keeps of a learner in memory — %s store', (kind) => {
  async function world() {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    const b = await signUp(s, 'bravo@example.com', 'b-phone');
    expect((await a.api.appendEvents([lookup(a)])).ok).toBe(true);
    expect((await b.api.appendEvents([lookup(b)])).ok).toBe(true);
    await read(a);
    await read(b);
    expect(learnerCacheEntries(s.store, a.learnerId)).toBe(2);
    expect(learnerCacheEntries(s.store, b.learnerId)).toBe(2);
    return { s, a, b };
  }

  it('DELETE /me drops the learner\'s cached lists at once and leaves the other learner\'s', async () => {
    const { s, a, b } = await world();
    expect((await a.api.deleteMe(a.email)).ok).toBe(true);
    expect(learnerCacheEntries(s.store, a.learnerId)).toBe(0);
    expect(learnerCacheEntries(s.store, b.learnerId)).toBe(2);
  });

  it('the scheduled purge reports each erased learner, and the host\'s hook drops their cached lists', async () => {
    const { s, a, b } = await world();
    const asked = await raw(s, 'DELETE', '/me', { token: a.token, body: { learnerId: a.learnerId, password: PASSWORD } });
    expect(asked.status).toBe(202);
    s.clock.set(new Date(Date.parse(asked.body.deletionDueAt) + 1000).toISOString());
    const erased: string[] = [];
    const r = await runMaintenance(s.store, { now: s.clock.now, onErased: (id) => { erased.push(id); forgetLearnerCaches(s.store, id); } });
    expect(r.purged).toBe(1);
    expect(erased).toEqual([a.learnerId]);
    expect(learnerCacheEntries(s.store, a.learnerId)).toBe(0);
    expect(learnerCacheEntries(s.store, b.learnerId)).toBe(2);
  });

  it('an entry past its window is dropped by the next insert of anyone, not kept behind a quiet key', async () => {
    const { s, a, b } = await world();
    s.clock.advance(CANDIDATE_CACHE_MS + 1);
    await read(b); // b's own entries are replaced; a asked for nothing
    expect(learnerCacheEntries(s.store, a.learnerId)).toBe(0);
    expect(learnerCacheEntries(s.store, b.learnerId)).toBe(2);
  });
});
