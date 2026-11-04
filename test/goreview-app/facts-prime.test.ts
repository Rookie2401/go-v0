import { afterEach, describe, expect, it, vi } from 'vitest';
import { repositoryLookup, type RepositoryUnit } from '../../packages/goreview/src/facts/provider';

afterEach(() => vi.restoreAllMocks());

const repoUnit = (id: string, label = id): RepositoryUnit => ({
  unit: { unitId: id, languageId: 'sq', kind: 'lexeme', label } as never,
  relations: [], analyses: [],
});

describe('Repository unit facts priming', () => {
  it('primes a large candidate list with bounded overlap and consumes the batch answers without single-unit calls', async () => {
    const ids = Array.from({ length: 2_000 }, (_, i) => `lemma:sq:w${i}:NOUN`);
    const stored = new Map(ids.map(id => [id, repoUnit(id)]));
    let active = 0, peak = 0, batchCalls = 0, singleCalls = 0;
    const lookup = repositoryLookup({
      async unit(id) { singleCalls++; return { ok: true, data: stored.get(id)! }; },
      async units(batch) {
        batchCalls++; active++; peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 2));
        active--;
        return { ok: true, data: { units: Object.fromEntries(batch.flatMap(id => stored.has(id) ? [[id, stored.get(id)!]] : [])), missing: [] } };
      },
    });

    await lookup.prime!(ids);
    const facts = await Promise.all(ids.map(id => lookup(id)));
    expect(batchCalls).toBe(40);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(singleCalls).toBe(0);
    expect(facts.every(Boolean)).toBe(true);
  });

  it('keeps a 2,000-unit prime inside the 30-second cache window under delayed batch requests', async () => {
    const ids = Array.from({ length: 2_000 }, (_, i) => `lemma:sq:timed${i}:NOUN`);
    const stored = new Map(ids.map(id => [id, repoUnit(id)]));
    let active = 0, virtualNow = 0, batchCalls = 0, singleCalls = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => virtualNow);
    const lookup = repositoryLookup({
      async unit(id) { singleCalls++; return { ok: true, data: stored.get(id)! }; },
      async units(batch) {
        batchCalls++; active++;
        await new Promise(resolve => setTimeout(resolve, 2));
        active--;
        if (active === 0) virtualNow += 4_000; // each request costs 4 s; a four-request wave costs 4 s
        return { ok: true, data: { units: Object.fromEntries(batch.map(id => [id, stored.get(id)!])), missing: [] } };
      },
    });
    await lookup.prime!(ids);
    expect(virtualNow).toBe(40_000);
    const facts = await Promise.all(ids.map(id => lookup(id)));
    expect(facts.every(Boolean)).toBe(true);
    expect(batchCalls).toBe(40);
    expect(singleCalls).toBe(0);
  });
  it('clears unused one-shot rows when a later facts pass primes, so old values are fetched fresh', async () => {
    let version = 1;
    const lookup = repositoryLookup({
      async unit(id) { return { ok: true, data: repoUnit(id, `v${version}`) }; },
      async units(ids) { return { ok: true, data: { units: Object.fromEntries(ids.map(id => [id, repoUnit(id, `v${version}`)])), missing: [] } }; },
    });

    await lookup.prime!(['a', 'b']);
    expect((await lookup('a'))?.unit.label).toBe('v1'); // b remains unused in the one-shot batch
    version = 2;
    await lookup.prime!(['b']); // beginning a new pass drops that unused v1 value
    expect((await lookup('b'))?.unit.label).toBe('v2');
    expect((await lookup('a'))?.unit.label).toBe('v2'); // a was not primed for the new pass
  });
});
