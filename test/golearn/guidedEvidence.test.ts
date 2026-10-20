/** evidence@9: production kinds `guided` and `supplied` (docs/GOTELL-GUIDED.md, package D). Nothing else in the fold changed. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { defaultPolicy, POLICY_VERSION } from '../../src/golearn';
import { PRODUCTION_ASSISTANCE, PRODUCTION_WEIGHTS } from '../../src/golearn/policy';
import { createHarness, withoutHeadCache } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);

describe('the policy constants', () => {
  it('is evidence@9 and the new kinds sit between the old ones', () => {
    expect(POLICY_VERSION).toBe('evidence@9');
    expect(PRODUCTION_ASSISTANCE).toMatchObject({ independent: 0, 'self-repaired': 1, guided: 1, assisted: 3, supplied: 3, copied: 5 });
    expect(PRODUCTION_WEIGHTS).toMatchObject({ independent: 1, 'self-repaired': 0.8, guided: 0.7, assisted: 0.4, supplied: 0.4, copied: 0.2 });
    expect(defaultPolicy.productionWeight('guided')).toBe(0.7);
    expect(defaultPolicy.productionWeight('supplied')).toBe(0.4);
    expect(defaultPolicy.productionWeight('independent')).toBeGreaterThan(defaultPolicy.productionWeight('guided'));
    expect(defaultPolicy.productionWeight('guided')).toBeGreaterThan(defaultPolicy.productionWeight('assisted'));
  });
});

describe('the fold', () => {
  it('guided is assistance 1 / weight 0.7, supplied assistance 3 / weight 0.4; independent is unchanged', async () => {
    const h = createHarness();
    await h.produce(U, 'es', F('agua'), 'guided', { sentenceText: 's1' });
    await h.produce(U, 'es', F('casa'), 'supplied', { sentenceText: 's2' });
    await h.produce(U, 'es', F('luz'), 'independent', { sentenceText: 's3' });
    const enc = async (itemId: string) => (await h.store.encounters.where('itemId', itemId)).filter((e) => e.userId === U && e.modality === 'writing');
    const [g] = await enc(F('agua'));
    expect(g).toMatchObject({ evidenceKind: 'production', productionKind: 'guided', assistance: 1, weight: 0.7 });
    const [s] = await enc(F('casa'));
    expect(s).toMatchObject({ evidenceKind: 'production', productionKind: 'supplied', assistance: 3, weight: 0.4 });
    const [i] = await enc(F('luz'));
    expect(i).toMatchObject({ productionKind: 'independent', assistance: 0, weight: 1 });
    // a guided production still counts as unassisted writing (assistance <= 1); a supplied one is assisted
    expect((await h.golearn.getItemState(U, F('agua')))!.writing).toMatchObject({ evidence: 0.7, unassisted: 1, assisted: 0 });
    expect((await h.golearn.getItemState(U, F('casa')))!.writing).toMatchObject({ evidence: 0.4, unassisted: 0, assisted: 1 });
  });

  it('queryItem tallies both new kinds as help, never as copied', async () => {
    const h = createHarness();
    await h.produce(U, 'es', F('agua'), 'guided', { sentenceText: 's1' });
    await h.produce(U, 'es', F('agua'), 'supplied', { sentenceText: 's2' });
    const q = await h.golearn.queryItem(U, { lang: 'es', itemId: F('agua') });
    expect(q.productionEvidence).toEqual({ independent: 0, selfRepaired: 0, assisted: 2, copied: 0 });
  });
});

describe('the bump rebuilds', () => {
  it('a learner stamped evidence@8 is rebuilt once into identical state, keeping the new kinds', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.understood(U, 'es', ES_STORY, [0, 1], 's1');
    await h.produce(U, 'es', F('creo'), 'independent', { sentenceText: 'a' });
    await h.produce(U, 'es', F('creo'), 'guided', { sentenceText: 'b' });
    await h.produce(U, 'es', F('perdona'), 'supplied', { sentenceText: 'c' });
    const snapshot = async () => ({
      encounters: (await h.store.encounters.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
      items: withoutHeadCache((await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1))),
    });
    const before = await snapshot();
    expect(before.encounters.filter((e) => e.productionKind === 'guided' || e.productionKind === 'supplied')).toHaveLength(2);
    expect(await h.golearn.ensureCurrent(U)).toBe(false); // already current
    await h.store.meta.put({ id: `golearn.policy:${U}`, value: 'evidence@8', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(await h.golearn.ensureCurrent(U)).toBe(true);
    expect((await h.store.meta.get(`golearn.policy:${U}`))?.value).toBe('evidence@9');
    expect(await snapshot()).toEqual(before);
    expect(await h.golearn.ensureCurrent(U)).toBe(false);
  });
});
