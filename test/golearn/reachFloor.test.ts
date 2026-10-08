/**
 * The REACH FLOOR by what a text is (R4, docs/audits/COURSE-AUDIT-2026-10-07.md 4.3 item 8): 0.75 stays for texts written for the course
 * (controlled / adapted ladder units, Stage 0); AUTHENTIC texts (the library, Scripture) are in reach only at 0.85
 * (REACH.floorAuthentic). The "above your level" fallback - the closest three, said plainly - keeps working for both.
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText } from '../../src/core';
import { REACH } from '../../src/golearn/policy';
import { reachFloor, reachTier } from '../../src/golearn/rank';
import { routeWorld, U } from './routeWorld';
import { t } from './courseFixtures';

const offered = (recs: Array<{ textId?: string; reason: string }>) => recs.filter((r) => r.reason === 'next-input' && r.textId).map((r) => r.textId!);

describe('the floor constants and the tier', () => {
  it('0.75 for course texts, 0.85 for authentic texts and for Scripture, even under an acquisition stream', () => {
    expect(REACH.floor).toBe(0.75);
    expect(REACH.floorAuthentic).toBe(0.85);
    expect(reachFloor({ controlled: true })).toBe(0.75);
    expect(reachFloor({})).toBe(0.85);
    expect(reachFloor({ controlled: false, scripture: true })).toBe(0.85);
    expect(reachFloor({ controlled: true, scripture: true })).toBe(0.85);
  });

  it('the same coverage is in reach for a course text and out of reach for an authentic one', () => {
    expect(reachTier({ coverage: 0.8 }, reachFloor({ controlled: true }))).toBe(0);
    expect(reachTier({ coverage: 0.8 }, reachFloor({}))).toBe(2);
    expect(reachTier({ coverage: 0.85 }, reachFloor({}))).toBe(0); // at the floor: in
    expect(reachTier({ coverage: 0.8 })).toBe(0); // no floor given: the old 0.75 (Stage 0 and course texts)
  });
});

describe('recommend(): the catalogue', () => {
  it.each(['es', 'de'] as const)('%s: an authentic text at 80 % is not offered while another authentic text is in reach; a course text at 80 % is', async (lang) => {
    const w = await routeWorld(lang);
    const deps = await w.catalogue([
      w.entry('a-good', 93), w.entry('b-authentic-80', 80), w.entry('c-authentic-86', 86), w.entry('d-course-80', 80, { stream: 'acquisition' }),
      w.entry('e-scripture-80', 80, { stream: 'scripture', domains: ['theology'] }), w.entry('f-course-70', 70, { stream: 'acquisition' }),
    ]);
    const ids = offered(await w.h.golearn.recommend(U, { limit: 12, wholeLibrary: deps } as never));
    expect(ids).toContain(w.idOf('a-good'));
    expect(ids).toContain(w.idOf('c-authentic-86')); // 86 >= 85
    expect(ids).toContain(w.idOf('d-course-80')); // 80 >= 75, written for the course
    expect(ids).not.toContain(w.idOf('b-authentic-80')); // 80 < 85, authentic
    expect(ids).not.toContain(w.idOf('e-scripture-80')); // Scripture is authentic
    expect(ids).not.toContain(w.idOf('f-course-70')); // 70 < 75
  });

  it('with no authentic text in reach but a course text in reach, only what is in reach is offered (the authentic ones wait)', async () => {
    const w = await routeWorld('es');
    const deps = await w.catalogue([w.entry('a-auth-80', 80), w.entry('b-auth-84', 84), w.entry('c-course-78', 78, { stream: 'acquisition' })]);
    const recs = await w.h.golearn.recommend(U, { limit: 12, wholeLibrary: deps } as never);
    expect(offered(recs)).toEqual([w.idOf('c-course-78')]);
    expect(recs.some((r) => /above your level/.test(r.explanation))).toBe(false);
  });

  it('with nothing in reach, the closest three are offered and said plainly to be above his level - an authentic text at 80 % included', async () => {
    const w = await routeWorld('es');
    const deps = await w.catalogue([w.entry('a', 80), w.entry('b', 84), w.entry('c', 70), w.entry('d', 60), w.entry('e', 50)]);
    const recs = (await w.h.golearn.recommend(U, { limit: 12, wholeLibrary: deps } as never)).filter((r) => r.reason === 'next-input' && r.textId);
    expect(recs.map((r) => r.textId)).toEqual([w.idOf('b'), w.idOf('a'), w.idOf('c')]); // 84, 80, 70: nearest first
    for (const r of recs) {
      expect(r.explanation).toMatch(/above your level/);
      expect(r.score).toBeLessThanOrEqual(REACH.aboveLevelScore);
    }
  });

  it('the pick says which floor judged it', async () => {
    const w = await routeWorld('es');
    const deps = await w.catalogue([w.entry('a-auth', 93), w.entry('b-course', 93, { stream: 'acquisition' })]);
    const { rankWholeLibrary } = await import('../../src/golearn/candidates');
    const ctx = { store: w.h.store, bus: w.h.bus, adapters: w.h.adapters, policy: (await import('../../src/golearn')).defaultPolicy, clock: w.h.clock, listening: true,
      userLog: async (userId: string) => ({ events: await w.h.bus.history({ userId }), sittings: { get: () => undefined }, byText: new Map() }) };
    const res = await rankWholeLibrary(ctx as never, U, deps, { reach: true, limit: 5 });
    const floorOf = (slug: string) => (res.picks.find((p) => p.row.id === w.idOf(slug))!.ranked.reach as { floor: number }).floor;
    expect(floorOf('a-auth')).toBe(0.85);
    expect(floorOf('b-course')).toBe(0.75);
  });
});

describe('recommend(): texts in the store (no catalogue)', () => {
  /** Ten words: `known` of them known (sol, agua, casa, hijo ...), the rest not. */
  async function storeText(w: Awaited<ReturnType<typeof routeWorld>>, slug: string, known: number, streams?: string[]) {
    const cycle = ['sol', 'agua', 'casa', 'hijo'];
    const tokens = Array.from({ length: 10 }, (_, i) => (i < known ? t(cycle[i % 4], cycle[i % 4], 'NOUN') : t(`nuevo${i}`, `nuevo${i}`, 'NOUN')));
    const text = await buildFixtureText(w.h.store, { lang: w.lang, slug, kind: 'story', title: slug, sentences: [{ tokens }] });
    if (streams) await w.h.store.texts.put({ ...text, streams });
    return w.idOf(slug);
  }

  it('a store text written for the course (acquisition stream) at 80 % is in reach; the same text without it is above his level', async () => {
    const course = await routeWorld('es');
    const c = await storeText(course, 'course-80', 8, ['acquisition']);
    const recsC = await course.h.golearn.recommend(U, { limit: 10, wholeLibrary: false } as never);
    const pickC = recsC.find((r) => r.textId === c)!;
    expect(pickC.reason).toBe('next-input');
    expect(pickC.explanation).not.toMatch(/above your level/);

    const authentic = await routeWorld('es');
    const a = await storeText(authentic, 'plain-80', 8);
    const recsA = await authentic.h.golearn.recommend(U, { limit: 10, wholeLibrary: false } as never);
    const pickA = recsA.find((r) => r.textId === a)!;
    expect(pickA.explanation).toMatch(/above your level/); // 80 % of an authentic text: the fallback, said plainly
  });
});

describe('forgetting (R2) in the reach measure', () => {
  it('a word not met for DECAY.weeks counts half as known, is not counted twice, and nothing changes while it is fresh', async () => {
    const { reachOf } = await import('../../src/golearn/rank');
    const { DECAY } = await import('../../src/golearn/policy');
    const w = await routeWorld('es', { base: false });
    await buildFixtureText(w.h.store, { lang: 'es', slug: 'dec', kind: 'story', title: 'dec', sentences: [{ tokens: [t('luna', 'luna', 'NOUN')] }, { tokens: [t('luna', 'luna', 'NOUN')] }] });
    await w.h.understood(U, 'es', w.idOf('dec'), [0, 1], 'a');
    const lemma = 'lemma:es:luna:NOUN';
    const row = (await w.h.golearn.getItemState(U, lemma))!;
    const rows = new Map([[lemma, row as never]]);
    const profile = w.prof('x', [['luna:NOUN', 10], ['mar:NOUN', 10]]);
    const shares = { knownShare: 0, familiarShare: 0, metShare: 0 };
    const fresh = reachOf(profile, rows, shares, w.h.clock());
    expect(fresh.coverage).toBeCloseTo(0.5, 10); // luna is shown understood: 10 of 20
    expect(reachOf(profile, rows, shares).coverage).toBeCloseTo(0.5, 10); // no clock: the undecayed measure
    w.h.advance((DECAY.weeks * 7 + 1) * 86_400_000);
    const stale = reachOf(profile, rows, shares, w.h.clock());
    expect(stale.coverage).toBeCloseTo(0.25, 10); // half credit
    expect(stale.effective).toBeCloseTo(0.25, 10); // not also counted as merely met
    expect(stale.yield!).toBeGreaterThan(fresh.yield!); // it is partly to be learned again
  });
});
