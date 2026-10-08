/**
 * ORPHANS (R4, docs/audits/COURSE-AUDIT-2026-10-07.md 4.3 item 12): lemmas the ladder introduces and never meets again (the gate's
 * `orphansOf`) feed the recommender's reinforcement: a library text bringing back at least three of them that the learner has met is
 * lifted by at most ORPHAN_BOOST.max (0.1). The list is computed from the bundled ladder documents with the course adapter, exactly as
 * the gate does, and cached.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { makeLadderSource } from '../../src/ladder/bundle';
import { ladderOrphanLemmas } from '../../src/ladder/orphans';
import { measureLadder } from '../../src/ladder/gate';
import { ORPHAN_BOOST } from '../../src/golearn/policy';
import { lemmaWord, orphanLift } from '../../src/golearn/rank';
import { setLadderPathSource } from '../../src/golearn/recommend';
import { createTestAdapter } from './testAdapters';
import { routeWorld, U } from './routeWorld';
import type { RouteWorld } from './routeWorld';
import type { LearnerItemState } from '../../src/core';

afterEach(() => setLadderPathSource(undefined));

const row = (reading: string, manualMark?: 'known'): LearnerItemState => ({ reading: { level: reading }, ...(manualMark ? { manualMark } : {}) } as unknown as LearnerItemState);

describe('orphanLift (the rule)', () => {
  const profile = { lemmas: [['lemma:es:agua:NOUN', 5], ['lemma:es:casa:NOUN', 5], ['lemma:es:sol:NOUN', 5], ['lemma:es:luna:NOUN', 5], ['lemma:es:Río:NOUN', 5]] as Array<[string, number]> };
  const met = new Map([['lemma:es:agua:NOUN', row('recognized')], ['lemma:es:casa:NOUN', row('encountered')], ['lemma:es:sol:NOUN', row('unseen', 'known')], ['lemma:es:luna:NOUN', row('unseen')]]);

  it('needs at least three orphans that he has met (read, or marked known); an unmet one does not count', () => {
    expect(ORPHAN_BOOST).toEqual({ minLemmas: 3, perLemma: 0.02, max: 0.1 });
    expect(orphanLift(profile, met, new Set(['agua', 'casa']))).toBeUndefined();
    expect(orphanLift(profile, met, new Set(['agua', 'casa', 'luna']))).toBeUndefined(); // luna was never met
    expect(orphanLift(profile, met, new Set(['agua', 'casa', 'sol']))).toMatchObject({ count: 3, boost: 0.06 });
  });

  it('is bounded: at most +0.1 however many orphans', () => {
    const many = Array.from({ length: 12 }, (_, i) => [`lemma:es:w${i}:NOUN`, 1] as [string, number]);
    const rows = new Map(many.map(([l]) => [l, row('recognized')] as const));
    const lift = orphanLift({ lemmas: many }, rows, new Set(many.map(([l]) => lemmaWord(l))))!;
    expect(lift.count).toBe(12);
    expect(lift.boost).toBe(ORPHAN_BOOST.max);
  });

  it('matches lemma words the way the gate keys them: lower-cased, NFC, without the part of speech', () => {
    expect(lemmaWord('lemma:es:Río:NOUN')).toBe('río');
    expect(lemmaWord('lemma:de:anfangen:VERB')).toBe('anfangen');
    expect(orphanLift(profile, new Map([['lemma:es:Río:NOUN', row('recognized')], ['lemma:es:agua:NOUN', row('recognized')], ['lemma:es:sol:NOUN', row('recognized')]]), new Set(['río', 'agua', 'sol']))!.count).toBe(3);
  });
});

describe('recommend(): a library text that brings orphans back', () => {
  /** Two texts equal in everything the ranking measures, except that one contains agua / casa / sol (known to him) - the orphans. */
  async function setup(w: RouteWorld) {
    const withOrphans = w.prof('a-with', [['hijo:NOUN', 60], ['agua:NOUN', 12], ['casa:NOUN', 12], ['sol:NOUN', 11], ['lejos:NOUN', 5]]);
    const without = w.prof('b-without', [['hijo:NOUN', 95], ['cerca:NOUN', 5]]);
    return w.catalogue([{ row: w.row('a-with'), profile: withOrphans }, { row: w.row('b-without'), profile: without }]);
  }
  const rec = (w: RouteWorld, deps: Awaited<ReturnType<typeof setup>>) => w.h.golearn.recommend(U, { limit: 12, wholeLibrary: deps } as never);
  const score = (recs: Awaited<ReturnType<typeof rec>>, id: string) => recs.find((r) => r.textId === id)!.score;
  const register = (orphans?: () => ReadonlySet<string> | undefined) => setLadderPathSource(async () => ({ steps: [], finished: true, ...(orphans ? { orphans } : {}) }));

  it('lifts the text by at most 0.1, says why, and leaves the other text exactly as it was', async () => {
    const w = await routeWorld('es');
    const deps = await setup(w);
    const base = await rec(w, deps);
    register(() => new Set(['agua', 'casa', 'sol', 'nunca']));
    const lifted = await rec(w, deps);
    const a = w.idOf('a-with');
    const b = w.idOf('b-without');
    expect(score(lifted, a) - score(base, a)).toBeGreaterThan(0);
    expect(score(lifted, a) - score(base, a)).toBeLessThanOrEqual(ORPHAN_BOOST.max + 1e-9);
    expect(score(lifted, a) - score(base, a)).toBeCloseTo(0.06, 2); // 3 orphans x 0.02 (before the small normalisation of the score)
    expect(score(lifted, b)).toBe(score(base, b));
    expect(lifted.find((r) => r.textId === a)!.explanation).toMatch(/brings back 3 words from your course units.*agua, casa, sol/);
    expect(lifted.find((r) => r.textId === b)!.explanation).not.toMatch(/brings back/);
  });

  it('can change the order, only for a text that earns it', async () => {
    const w = await routeWorld('es');
    // b is a little more comprehensible (it peaks exactly at 93 %), a is a little below - the orphans lift a over it
    const a = w.prof('a-with', [['hijo:NOUN', 56], ['agua:NOUN', 12], ['casa:NOUN', 12], ['sol:NOUN', 10], ['lejos:NOUN', 10]]);
    const b = w.prof('b-without', [['hijo:NOUN', 93], ['cerca:NOUN', 7]]);
    const deps = await w.catalogue([{ row: w.row('a-with'), profile: a }, { row: w.row('b-without'), profile: b }]);
    const order = async () => (await rec(w, deps as never)).filter((r) => r.reason === 'next-input' && r.textId).map((r) => r.textId);
    register();
    expect((await order())[0]).toBe(w.idOf('b-without'));
    register(() => new Set(['agua', 'casa', 'sol']));
    expect((await order())[0]).toBe(w.idOf('a-with'));
  });

  it('without a list, with an empty one, or with fewer than three met orphans in the text, nothing changes', async () => {
    const w = await routeWorld('es');
    const deps = await setup(w);
    register();
    const none = await rec(w, deps);
    register(() => new Set());
    expect(await rec(w, deps)).toEqual(none);
    register(() => new Set(['agua', 'casa'])); // two met orphans only
    expect(await rec(w, deps)).toEqual(none);
    register(() => { throw new Error('the ladder could not be read'); });
    expect(await rec(w, deps)).toEqual(none); // a list that cannot be had is no list
  });

  it('a learner who has completed no text has met no orphan: the list is not even asked for', async () => {
    const w = await routeWorld('es', { base: false });
    const deps = await setup(w);
    let asked = 0;
    register(() => { asked += 1; return new Set(['agua', 'casa', 'sol']); });
    await rec(w, deps);
    expect(asked).toBe(0);
  });
});

describe('the list the ladder supplies (src/ladder/orphans.ts)', () => {
  const adapter = createTestAdapter('es');
  const doc = (id: string, text: string) => ({ schemaVersion: 2, id, lang: 'es', title: id, contentType: 'dialogue', sections: [{ paragraphs: [{ sentences: [{ text }] }] }] });
  // zorro: only unit 1, never again. luna: units 2 and 4. sol: every unit. vaca: only the last unit (nothing after it: not judged)
  const TEXTS: Record<string, string> = { u1: 'sol zorro', u2: 'sol luna', u3: 'sol gato', u4: 'sol luna', u5: 'sol perro', u6: 'sol vaca' };
  const source = () => makeLadderSource({
    ladders: { 'data/ladder/es/ladder.json': { lang: 'es', version: 1, units: Object.keys(TEXTS).map((id) => ({ id, stage: 'a1-1', kind: 'controlled', document: `units/${id}.json`, domain: 'd' })) } },
    units: Object.fromEntries(Object.entries(TEXTS).map(([id, text]) => [`data/ladder/es/units/${id}.json`, doc(id, text)])),
  });

  it('is the gate\'s own orphan set: lemmas introduced in a unit and met in no later unit, units with fewer than three after them not judged', () => {
    const orphans = ladderOrphanLemmas('es', adapter, source());
    // u1..u3 have >= 3 readable units after them; u4 has two, u5 one, u6 none
    expect([...orphans].sort()).toEqual(['gato', 'zorro']);
    expect(orphans.has('sol')).toBe(false);
    expect(orphans.has('luna')).toBe(false); // comes back in u4
    expect(orphans.has('vaca')).toBe(false); // the end of the ladder has nothing after it to come back in
  });

  it('agrees with measureLadder\'s per-unit orphan counts', () => {
    const src = source();
    const loaded = { ladder: { lang: 'es' as const, version: 1, units: [] }, head: [], units: Object.entries(TEXTS).map(([id, text]) => ({
      unit: { id, stage: 'a1-1' as const, kind: 'controlled' as const, document: `units/${id}.json`, domain: 'd' }, doc: doc(id, text) as never, status: 'ok' as const,
    })) };
    const report = measureLadder('es', loaded, { adapter });
    const gateCounts = report.rows.map((r) => r.orphans);
    expect(gateCounts.slice(0, 3)).toEqual([1, 0, 1]); // zorro; none; gato
    expect(ladderOrphanLemmas('es', adapter, src).size).toBe(gateCounts.reduce<number>((n, c) => n + (c ?? 0), 0));
  });

  it('is computed once per ladder and adapter (cached), and is empty for a language without a ladder', () => {
    const src = source();
    expect(ladderOrphanLemmas('es', adapter, src)).toBe(ladderOrphanLemmas('es', adapter, src));
    expect(ladderOrphanLemmas('de', createTestAdapter('de'), makeLadderSource()).size).toBe(0);
  });
});
