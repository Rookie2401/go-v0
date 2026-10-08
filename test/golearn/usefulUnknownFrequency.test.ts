/**
 * R9: usefulUnknown (rank.ts) prefers CORPUS frequency (the dictionary's frequency.json) when a table is at hand, and is exactly the old
 * in-shortlist rule when none is: same scores, same order, same reasons.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { RankCandidate } from '../../src/core';
import { frequencyTableOf } from '../../src/dict';
import { USEFUL_PER_MILLION, setCorpusFrequencySource } from '../../src/golearn/rank';
import { WHOLE_RANKING } from '../../src/golearn/policy';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { COURSE, buildChapter, stageRow, t } from './courseFixtures';
import { profile } from './profiles';

const U = 'u1';
const idOf = (slug: string) => ids.text('es', slug);
afterEach(() => setCorpusFrequencySource(undefined));

/** The learner: has read and finished one Spanish text (sol, habla understood). */
async function world(): Promise<Harness> {
  const h = createHarness();
  await h.seed(U, COURSE);
  await h.store.stages.bulkPut([1, 2, 3].map((n) => stageRow(n, `g${n}`)));
  await buildChapter(h.store, {
    slug: 'base', sentences: [
      { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] },
      { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] },
    ],
  });
  const base = idOf('base');
  await h.understood(U, 'es', base, [0, 1], 'a');
  await h.complete(U, 'es', base, 'a');
  return h;
}

type Lemmas = Array<[string, number]>;
/** Every candidate is 93 % "sol" (known) and 7 % something else, with the lemma list given: a tie on everything but usefulUnknown. */
const cands = (list: Array<[string, Lemmas]>): RankCandidate[] =>
  list.map(([id, lemmas]) => ({ profile: profile(idOf(id), [['sol', 93], ['otra', 7]], { lemmas }), published: true, rights: 'verified-public-domain' }));
type Ranked = Array<Awaited<ReturnType<Harness['golearn']['rankLibrary']>>[number] & { extra?: Record<string, number> }>;
const rank = async (h: Harness, cs: RankCandidate[], signals?: object) =>
  (await h.golearn.rankLibrary(U, cs, { limit: 50, ...(signals ? { signals } : {}) })) as Ranked;
const order = (r: Ranked) => r.map((x) => x.textId.replace('text:es:', ''));

// `rio` recurs in three unread candidates (so the shortlist rule calls it useful) but is RARE in the corpus; `raro` is in one text only
// but is COMMON in the corpus.
const shared: Lemmas = [['rio:NOUN', 6]];
const set = () => cands([['a1', [['raro:NOUN', 6]]], ['z1', shared], ['m1', shared], ['m2', shared]]);
const table = frequencyTableOf('es', [['raro', 500], ['rio', 2], ['sol', 900]]);

describe('usefulUnknown by corpus frequency', () => {
  it('the shortlist rule (no table): the lemma that recurs in three unread texts is useful, the common one in one text is not', async () => {
    const h = await world();
    const r = await rank(h, set(), {});
    expect(order(r)[order(r).length - 1]).toBe('a1');
    expect(r.find((x) => x.textId === idOf('z1'))!.extra!.usefulUnknown).toBeGreaterThan(0);
    expect(r.find((x) => x.textId === idOf('a1'))!.extra!.usefulUnknown).toBe(0);
    expect(r.find((x) => x.textId === idOf('z1'))!.reasons.join(' ')).toMatch(/come up again in other texts/);
  });

  it('with a table the CORPUS decides: the common word raises its text, the rare one that merely recurs does not', async () => {
    const h = await world();
    const r = await rank(h, set(), { frequency: table });
    expect(order(r)[0]).toBe('a1'); // the order changed
    const a = r.find((x) => x.textId === idOf('a1'))!;
    expect(a.extra!.usefulUnknown).toBeGreaterThan(0);
    expect(a.reasons.join(' ')).toMatch(/common ones across the library/);
    for (const id of ['z1', 'm1', 'm2']) expect(r.find((x) => x.textId === idOf(id))!.extra!.usefulUnknown).toBe(0);
  });

  it('works with a single unread candidate (the shortlist rule needs three texts, the corpus does not)', async () => {
    const h = await world();
    const one = cands([['solo', [['raro:NOUN', 6]]]]);
    expect((await rank(h, one, {}))[0].extra?.usefulUnknown).toBeUndefined(); // the part is off: fewer than usefulMinTexts unread texts
    expect((await rank(h, one, { frequency: table }))[0].extra!.usefulUnknown).toBeGreaterThan(0);
  });

  it('a word he already knows is never useful, however common; the threshold is USEFUL_PER_MILLION', async () => {
    const h = await world();
    expect(USEFUL_PER_MILLION).toBe(20);
    const cs = cands([['known', [['sol:NOUN', 6]]], ['edge', [['limite:NOUN', 6]]], ['below', [['casi:NOUN', 6]]]]);
    const r = await rank(h, cs, { frequency: frequencyTableOf('es', [['sol', 900], ['limite', 20], ['casi', 19.99]]) });
    const part = (id: string) => r.find((x) => x.textId === idOf(id))!.extra!.usefulUnknown;
    expect(part('known')).toBe(0);
    expect(part('edge')).toBeGreaterThan(0);
    expect(part('below')).toBe(0);
  });

  it('the default table comes from setCorpusFrequencySource(lang => table); signals.frequency overrides it', async () => {
    const h = await world();
    setCorpusFrequencySource((lang) => (lang === 'es' ? table : undefined));
    expect(order(await rank(h, set(), {}))[0]).toBe('a1');
    setCorpusFrequencySource((lang) => (lang === 'de' ? table : undefined)); // another language: no table for Spanish
    expect(order(await rank(h, set(), {}))[3]).toBe('a1');
    setCorpusFrequencySource(() => table);
    const other = frequencyTableOf('es', [['rio', 500], ['raro', 1]]);
    expect(order(await rank(h, set(), { frequency: other }))[0]).not.toBe('a1');
  });
});

describe('FALLBACK: no frequency file means exactly the old result', () => {
  it('no table, an empty table, a source that has none: identical scores, order, parts and reasons', async () => {
    const h = await world();
    const base = await rank(h, set(), {});
    const empty = await rank(h, set(), { frequency: frequencyTableOf('es', []) });
    setCorpusFrequencySource(() => undefined);
    const none = await rank(h, set(), {});
    expect(empty).toEqual(base);
    expect(none).toEqual(base);
    // and the old numbers themselves: three unread texts share `rio`, so the gate stays at usefulMinTexts
    expect(WHOLE_RANKING.usefulMinTexts).toBe(3);
    const two = await rank(h, cands([['z1', shared], ['m1', shared]]), {});
    expect(two.every((x) => x.extra?.usefulUnknown === undefined)).toBe(true); // fewer than usefulMinTexts unread candidates: the part is off, as before
  });

  it('without signals at all there are no extra parts, with or without a default source', async () => {
    const h = await world();
    setCorpusFrequencySource(() => table);
    const r = await rank(h, set());
    expect(r.every((x) => x.extra === undefined)).toBe(true);
  });
});
