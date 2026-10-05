/**
 * Whole-library recommendations: the candidate search (candidates.ts), the whole-library factors of the ranking (rank.ts), the ladder
 * seam and the "nothing fits" advice (recommend.ts). A synthetic catalogue of a few hundred rows over a memory store.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { CatalogText, LibraryQuery, RankCandidate, TextProfile } from '../../src/core';
import { defaultPolicy } from '../../src/golearn';
import { CANDIDATES } from '../../src/golearn/policy';
import { isScripture, learnerSnapshot, rankWholeLibrary, shortlist } from '../../src/golearn/candidates';
import type { CatalogPager } from '../../src/golearn/candidates';
import { setLadderPathSource } from '../../src/golearn/recommend';
import type { Ctx } from '../../src/golearn/state';
import { putCatalogRows, searchCatalog } from '../../src/library/postings';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { COURSE, buildChapter, stageRow, t } from './courseFixtures';
import { profile } from './profiles';

const U = 'u1';
const BASE = ids.text('es', 'base');
const DOMAINS = ['history', 'science', 'travel', 'cooking'];
const idOf = (slug: string) => ids.text('es', slug);

afterEach(() => setLadderPathSource(undefined));

/** The engine context the harness' GoLearn builds, rebuilt here so the candidate search can be called directly. */
function ctxOf(h: Harness, over: Partial<Ctx> = {}): Ctx {
  return {
    store: h.store, bus: h.bus, adapters: h.adapters, policy: defaultPolicy, clock: h.clock, listening: true,
    userLog: async (userId) => ({ events: await h.bus.history({ userId }), sittings: { get: () => undefined }, byText: new Map() }),
    ...over,
  };
}

/** The learner: has read and finished one Spanish text (sol, habla understood), at the stage "g1". */
async function learner(h: Harness) {
  await h.seed(U, COURSE);
  await h.store.stages.bulkPut([1, 2, 3, 4, 5].map((n) => stageRow(n, `g${n}`)));
  await buildChapter(h.store, {
    slug: 'base', sentences: [
      { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] },
      { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] },
    ],
  });
  await h.understood(U, 'es', BASE, [0, 1], 'a');
  await h.complete(U, 'es', BASE, 'a');
  await putCatalogRows(h.store, [row(-1, { id: BASE, stageId: ids.stage(COURSE, 'g1') })]);
}

function row(i: number, over: Partial<CatalogText> = {}): CatalogText {
  return {
    id: idOf(`t${String(i).padStart(4, '0')}`), lang: 'es', title: `Texto ${i}`, workId: ids.work(COURSE, `w${i}`), stream: 'library',
    domains: [DOMAINS[Math.abs(i) % 4]], stageId: ids.stage(COURSE, i % 2 ? 'g1' : 'g2'), rights: 'verified-public-domain', location: 'library',
    published: true, features: { words: 800, sentences: 60, uniqueForms: 300, meanSentenceWords: 13 }, ...over,
  };
}

/** `known` of 100 words are "sol" (understood by the learner); the rest "rio" (never met). */
const profileOf = (id: string, known: number, o: Parameters<typeof profile>[2] = {}): TextProfile => profile(id, [['sol', known], ['rio', 100 - known]], o);
const knownOf = (i: number) => 40 + ((i * 7) % 40); // 40..79 % known

interface Built { rows: CatalogText[]; known: Map<string, number> }

/** `n` rows: the first `scripture` are Scripture, then ordinary texts of four domains, and `best` (93 % known, a rare domain, stage g5) LAST. */
function catalogue(n: number, scripture = 90): Built {
  const rows: CatalogText[] = [];
  const known = new Map<string, number>();
  for (let i = 0; i < n - 1; i++) {
    const r = i < scripture ? row(i, { stream: 'scripture', domains: ['theology'] }) : row(i);
    rows.push(r);
    known.set(r.id, knownOf(i));
  }
  const best = row(n, { id: idOf('best'), domains: ['rare'], stageId: ids.stage(COURSE, 'g5') });
  rows.push(best);
  known.set(best.id, 93);
  return { rows, known };
}

const pagerOf = (h: Harness, calls: LibraryQuery[] = []): CatalogPager => async (q) => { calls.push(q); return searchCatalog(h.store, q); };
const depsOf = (h: Harness, b: Built, calls: LibraryQuery[] = []) => ({
  pager: pagerOf(h, calls), profileOf: async (id: string) => (b.known.has(id) ? profileOf(id, b.known.get(id)!) : undefined),
});

async function world(n = 301, scripture = 90) {
  const h = createHarness();
  await learner(h);
  const b = catalogue(n, scripture);
  await putCatalogRows(h.store, b.rows);
  return { h, b, ctx: ctxOf(h) };
}

describe('the candidate search covers the whole catalogue', () => {
  it('walks every page (never one big read), keeps a bounded mixed shortlist, and finds the best text at the END of the catalogue', async () => {
    const { h, b, ctx } = await world();
    const calls: LibraryQuery[] = [];
    const all = vi_spy(h.store.catalog, 'all');
    const where = vi_spy(h.store.catalog, 'where');
    const snap = await learnerSnapshot(ctx, U, 'es');
    const { items, stats } = await shortlist(pagerOf(h, calls), { lang: 'es', snapshot: snap });
    expect(stats.seen).toBe(b.rows.length + 1); // + the base text
    expect(calls.length).toBe(Math.ceil((b.rows.length + 1) / 200) + 0);
    expect(calls.every((q) => (q.limit ?? 0) <= 200 && q.lang === 'es')).toBe(true);
    expect(all.calls + where.calls).toBe(0); // the table was never listed
    expect(items.length).toBe(CANDIDATES.shortlist);
    const positions = items.map((r) => b.rows.findIndex((x) => x.id === r.id)).filter((p) => p >= 0);
    expect(Math.max(...positions)).toBeGreaterThan(200); // not the first 40 (nor the first 200)
    expect(items.filter((r) => b.rows.findIndex((x) => x.id === r.id) >= 40).length).toBeGreaterThan(80);
    expect(items.map((r) => r.id)).toContain(idOf('best'));
  });

  it('caps Scripture at its share of the shortlist, and no one domain takes more than its share', async () => {
    const { h, ctx } = await world(301, 150);
    const snap = await learnerSnapshot(ctx, U, 'es');
    const { items, stats } = await shortlist(pagerOf(h), { lang: 'es', snapshot: snap });
    const scripture = items.filter(isScripture).length;
    expect(items.length).toBe(CANDIDATES.shortlist);
    expect(scripture).toBeLessThanOrEqual(Math.floor(CANDIDATES.shortlist * CANDIDATES.scriptureShare));
    expect(stats.scripture).toBe(scripture);
    const perDomain = new Map<string, number>();
    for (const r of items.filter((x) => !isScripture(x))) perDomain.set(r.domains![0], (perDomain.get(r.domains![0]) ?? 0) + 1);
    for (const n of perDomain.values()) expect(n).toBeLessThanOrEqual(Math.ceil(CANDIDATES.shortlist * CANDIDATES.domainShare));
    expect(perDomain.size).toBeGreaterThanOrEqual(4);
  });

  it('with nothing but Scripture to offer, Scripture fills the shortlist rather than leaving it short', async () => {
    const { h, ctx } = await world(60, 59);
    const { items } = await shortlist(pagerOf(h), { lang: 'es', snapshot: await learnerSnapshot(ctx, U, 'es'), size: 50 });
    expect(items.length).toBe(50);
    expect(items.filter(isScripture).length).toBeGreaterThan(Math.floor(50 * CANDIDATES.scriptureShare));
  });

  it('keeps places for the stated interests even when the prefilter would not favour them', async () => {
    const h = createHarness();
    await learner(h);
    const rows = Array.from({ length: 280 }, (_, i) => row(i));
    // chess texts: very short and at a far stage, so the prefilter ranks them below every ordinary history text
    const chess = Array.from({ length: 8 }, (_, i) => row(1000 + i * 4, { id: idOf(`chess${i}`), domains: ['history'], genre: 'chess', stageId: ids.stage(COURSE, 'g5'), features: { words: 20, sentences: 2, uniqueForms: 15, meanSentenceWords: 10 } }));
    await putCatalogRows(h.store, [...rows, ...chess]);
    const ctx = ctxOf(h);
    const without = await shortlist(pagerOf(h), { lang: 'es', snapshot: await learnerSnapshot(ctx, U, 'es') });
    const withInterest = await shortlist(pagerOf(h), { lang: 'es', snapshot: await learnerSnapshot(ctx, U, 'es', ['Chess']) });
    const n = (items: CatalogText[]) => items.filter((r) => r.genre === 'chess').length;
    expect(n(withInterest.items)).toBeGreaterThanOrEqual(CANDIDATES.minInterest);
    expect(n(withInterest.items)).toBeGreaterThan(n(without.items) - 1);
  });
});

describe('the personal ranking over the shortlist', () => {
  it('a text outside the learner\'s shelf wins when its personal coverage is best', async () => {
    const { h, b, ctx } = await world();
    const result = await rankWholeLibrary(ctx, U, depsOf(h, b), { limit: 10 });
    expect(result.picks[0].row.id).toBe(idOf('best'));
    expect(result.picks[0].row.stageId).toBe(ids.stage(COURSE, 'g5')); // four stages above the one he reads at
    expect(result.picks[0].ranked.reasons.join(' ')).toMatch(/93/);
    expect(result.stats.shortlisted).toBeLessThanOrEqual(CANDIDATES.shortlist);
    expect(result.stats.profiled).toBeGreaterThan(CANDIDATES.shortlist - 5);
  });

  it('never offers testimony, held-out assessment texts, or (outside preview) unpublished texts', async () => {
    const { h, b, ctx } = await world(120, 20);
    const perfect = (slug: string, over: Partial<CatalogText> = {}) => { const r = row(900, { id: idOf(slug), ...over }); b.rows.push(r); b.known.set(r.id, 93); return r; };
    const rows = [
      perfect('tes'), perfect('heldr'), perfect('heldl'), perfect('draft', { published: false }),
    ];
    const tes = await buildFixtureText(h.store, { lang: 'es', slug: 'tes', kind: 'testimony', sentences: [{ tokens: [{ surface: 'sol', lemma: 'sol', pos: 'NOUN' }] }] });
    const held = await buildFixtureText(h.store, { lang: 'es', slug: 'heldr', sentences: [{ tokens: [{ surface: 'sol', lemma: 'sol', pos: 'NOUN' }] }] });
    const heldL = await buildFixtureText(h.store, { lang: 'es', slug: 'heldl', sentences: [{ tokens: [{ surface: 'sol', lemma: 'sol', pos: 'NOUN' }] }] });
    // set through a widening cast: `readingAssessmentId` is declared by the curriculum work, not necessarily on `Text` here
    await h.store.texts.put({ ...held, ...({ readingAssessmentId: 'reading:heldout' } as object) });
    await h.store.texts.put({ ...heldL, ...({ listeningAssessmentId: 'listening:heldout' } as object) });
    void tes;
    await putCatalogRows(h.store, rows);
    for (const preview of [false, true]) {
      const r = await rankWholeLibrary(ctx, U, depsOf(h, b), { limit: 200, size: 200, includeUnpublished: preview });
      const got = r.picks.map((p) => p.row.id);
      for (const slug of ['tes', 'heldr', 'heldl']) expect(got).not.toContain(idOf(slug));
      expect(r.stats.excluded).toBeGreaterThanOrEqual(3);
      expect(got.includes(idOf("draft"))).toBe(preview);
    }
  });
});

describe('the whole-library factors (rank.ts): live only when the signal exists', () => {
  const cands = (list: Array<[string, number, Partial<RankCandidate>?, Parameters<typeof profile>[2]?]>): RankCandidate[] =>
    list.map(([id, known, extra, o]) => ({ profile: profileOf(idOf(id), known, o), published: true, rights: 'verified-public-domain', ...extra }));
  const rank = async (h: Harness, cs: RankCandidate[], signals?: object) => {
    const opts = { limit: 50, ...(signals ? { signals } : {}) };
    return (await h.golearn.rankLibrary(U, cs, opts)) as Array<Awaited<ReturnType<Harness['golearn']['rankLibrary']>>[number] & { extra?: Record<string, number> }>;
  };
  const order = (r: Array<{ textId: string }>) => r.map((x) => x.textId.replace('text:es:', ''));

  it('without signals the ranking is the old one (no extra parts, ties by id)', async () => {
    const { h } = await world(5);
    const r = await rank(h, cands([['zzz', 93], ['aaa', 93]]));
    expect(order(r)).toEqual(['aaa', 'zzz']);
    expect(r.every((x) => x.extra === undefined)).toBe(true);
  });

  it('useful unknown vocabulary: new words that recur in other unread candidates raise a text', async () => {
    const { h } = await world(5);
    const shared = { lemmas: [['rio:NOUN', 6]] as Array<[string, number]> };
    const cs = cands([['aaa', 93, {}, { lemmas: [['solo:NOUN', 6]] }], ['zzz', 93, {}, shared], ['m1', 93, {}, shared], ['m2', 93, {}, shared]]);
    expect(order(await rank(h, cs))[0]).toBe('aaa'); // a tie, broken by id
    const r = await rank(h, cs, {});
    expect(order(r)[order(r).length - 1]).toBe('aaa');
    const z = r.find((x) => x.textId === idOf('zzz'))!;
    expect(z.extra!.usefulUnknown).toBeGreaterThan(0);
    expect(z.reasons.join(' ')).toMatch(/come up again in other texts/);
    expect(r.find((x) => x.textId === idOf('aaa'))!.extra!.usefulUnknown).toBe(0);
  });

  it('overdue vocabulary: words met in reading long ago raise a text that brings them back (reading evidence only)', async () => {
    const { h } = await world(5);
    const cs = cands([['aaa', 93, {}, { lemmas: [['luna:NOUN', 6]] }], ['zzz', 93, {}, { lemmas: [['sol:NOUN', 6]] }]]);
    const fresh = await rank(h, cs, {});
    expect(fresh.every((x) => x.extra!.overdue === 0)).toBe(true); // met a moment ago: not overdue
    h.advance(30 * 86_400_000);
    const later = await rank(h, cs, {});
    expect(order(later)[0]).toBe('zzz');
    expect(later[0].extra!.overdue).toBeGreaterThan(0);
    expect(later[0].reasons.join(' ')).toMatch(/not met in reading/);
  });

  it('variety: the domain of the last texts read is stepped away from', async () => {
    const { h } = await world(5);
    const cs = cands([['aaa', 93, { domains: ['history'] }], ['zzz', 93, { domains: ['travel'] }]]);
    const r = await rank(h, cs, { recentGroups: ['history', 'cooking'] });
    expect(order(r)).toEqual(['zzz', 'aaa']);
    expect(r.find((x) => x.textId === idOf('aaa'))!.extra!.variety).toBe(0);
    expect(r[0].reasons.join(' ')).toMatch(/different subject/);
    expect(order(await rank(h, cs, { recentGroups: [] }))).toEqual(['aaa', 'zzz']); // no recent reading: no signal
  });

  it('listening availability counts only where the caller names eligible recordings', async () => {
    const { h } = await world(5);
    const cs = cands([['aaa', 93], ['zzz', 93]]);
    const r = await rank(h, cs, { listenEligible: new Set([idOf('zzz')]) });
    expect(order(r)).toEqual(['zzz', 'aaa']);
    expect(r[0].extra!.listening).toBe(1);
    expect((await rank(h, cs, {})).every((x) => x.extra?.listening === undefined)).toBe(true);
  });
});

describe('evidence@8 in the whole-library step', () => {
  async function listenWorld(kind: 'human' | 'synthetic') {
    const h = createHarness({ audioEligible: async () => true });
    await learner(h);
    // a text he HEARD (never read) with credited-or-not listening, and a candidate that has a recording
    await buildChapter(h.store, { slug: 'heard', sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
    await buildChapter(h.store, { slug: 'cand', sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
    await h.seedAudio('seg-cand', { speech: true, textId: idOf('cand'), sentenceIds: [`${idOf('cand')}/s0`] });
    await h.listen(U, 'es', idOf('heard'), [0], { kind });
    const rows = [row(2, { id: idOf('aplain') }), row(2, { id: idOf('cand') })]; // same domain, so only the recording differs
    await putCatalogRows(h.store, rows);
    const known = new Map(rows.map((r) => [r.id, 93]));
    const ctx = ctxOf(h, { audioEligible: async () => true });
    return { h, ctx, deps: { pager: pagerOf(h), profileOf: async (id: string) => (known.has(id) ? profileOf(id, 93) : undefined) } };
  }

  it('a text only HEARD is not read; credited human listening lets a recorded text rank slightly higher', async () => {
    const { ctx, deps } = await listenWorld('human');
    const snap = await learnerSnapshot(ctx, U, 'es');
    expect(snap.started.has(idOf('heard'))).toBe(false);
    expect(snap.listens).toBe(true);
    const r = await rankWholeLibrary(ctx, U, deps, { limit: 5 });
    expect(r.picks[0].row.id).toBe(idOf('cand'));
    expect((r.picks[0].ranked as { extra?: Record<string, number> }).extra?.listening).toBe(1);
    expect(r.stats.listeningChecked).toBeGreaterThan(0);
  });

  it('synthetic speech is never listening evidence: no listening signal is used', async () => {
    const { ctx, deps } = await listenWorld('synthetic');
    expect((await learnerSnapshot(ctx, U, 'es')).listens).toBe(false);
    const r = await rankWholeLibrary(ctx, U, deps, { limit: 5 });
    expect(r.stats.listeningChecked).toBe(0);
    expect(r.picks.every((p) => (p.ranked.extra?.listening) === undefined)).toBe(true);
    expect(r.picks[0].row.id).toBe(idOf('aplain')); // a tie, broken by id
  });

  it('a version without listening never uses it', async () => {
    const { h, deps } = await listenWorld('human');
    const r = await rankWholeLibrary(ctxOf(h, { audioEligible: async () => true, listening: false }), U, deps, { limit: 5 });
    expect(r.stats.listeningChecked).toBe(0);
  });
});

describe('recommend(): the ladder first, the library after, and never an empty Home', () => {
  async function recWorld() {
    const { h, b } = await world(80, 10);
    return { h, b };
  }

  it('offers the next ladder unit he may open as "Next on your path", then whole-library picks', async () => {
    const { h, b } = await recWorld();
    const steps = [
      { unitId: 'u1', textId: idOf('unit-1'), title: 'Draft unit', stage: 'a1-1', published: false },
      { unitId: 'u2', textId: idOf('unit-2'), title: 'Published unit', stage: 'a1-1', published: true },
      { unitId: 'u3', textId: idOf('unit-3'), title: 'Later unit', stage: 'a1-2', published: true },
    ];
    setLadderPathSource(async ({ completed }) => ({ steps: steps.filter((s) => !completed.has(s.textId)), finished: false }));
    const deps = depsOf(h, b);
    let recs = await h.golearn.recommend(U, { limit: 6, wholeLibrary: deps } as never);
    expect(recs[0].textId).toBe(idOf('unit-2'));
    expect(recs[0].explanation).toMatch(/^Next on your path: "Published unit"/);
    expect(recs.slice(1).some((r) => r.textId === idOf('best'))).toBe(true);
    recs = await h.golearn.recommend(U, { limit: 6, includeUnpublished: true, wholeLibrary: deps } as never);
    expect(recs[0].textId).toBe(idOf('unit-1'));
    expect(recs[0].explanation).toMatch(/in preview, not published/);
    // finishing the ladder hands over to the library
    setLadderPathSource(async () => ({ steps: [], finished: true }));
    recs = await h.golearn.recommend(U, { limit: 6, wholeLibrary: deps } as never);
    expect(recs[0].textId).toBe(idOf('best'));
    expect(recs.some((r) => /Next on your path/.test(r.explanation))).toBe(false);
  });

  it('with no ladder registered the whole library answers: the best text of the whole catalogue leads', async () => {
    const { h, b } = await recWorld();
    const recs = await h.golearn.recommend(U, { limit: 3, wholeLibrary: depsOf(h, b) } as never);
    expect(recs[0].textId).toBe(idOf('best'));
    expect(recs[0].reason).toBe('next-input');
  });

  it('when nothing is left it says what to do', async () => {
    const h = createHarness({ audioEligible: async () => false });
    await learner(h);
    await buildChapter(h.store, { slug: 'only', sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
    await h.complete(U, 'es', idOf('only'), 'b');
    const recs = await h.golearn.recommend(U, { limit: 5 });
    expect(recs).toHaveLength(1);
    expect(recs[0].textId).toBeUndefined();
    expect(recs[0].explanation).toMatch(/read every published Spanish text/);
    expect(recs[0].explanation).toMatch(/reread/);
    expect(recs[0].explanation).toMatch(/listen/);
    expect(recs[0].explanation).toMatch(/harder shelf/);
  });
});

describe('performance on a 2,000-row catalogue', () => {
  it('walks 2,000 rows in 11 pages, profiles ~120 realistic texts (350 forms each) and ranks them for a learner who knows 2,000 words', async () => {
    const h = createHarness();
    await learner(h);
    const VOCAB = 6000;
    const KNOWN = 2000;
    for (let i = 0; i < KNOWN; i++) {
      await h.mark(U, 'es', ids.form('es', `f${i}`), 'known', 'form');
      await h.mark(U, 'es', `lemma:es:f${i}:NOUN`, 'known', 'lemma');
    }
    const b = catalogue(2000, 500);
    await putCatalogRows(h.store, b.rows);
    // a Zipf-ish text of ~350 distinct forms drawn deterministically from the shared vocabulary
    const synth = (id: string): TextProfile => {
      let s = 0; for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
      const forms = new Map<string, number>();
      for (let k = 0; k < 600 && forms.size < 350; k++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const u = s / 2 ** 32; const f = `f${Math.floor(VOCAB * u * u)}`; forms.set(f, (forms.get(f) ?? 0) + 1 + (k % 3)); }
      const list = [...forms.entries()] as Array<[string, number]>;
      return profile(id, list, { lemmas: list.map(([f, n]) => [`${f}:NOUN`, n] as [string, number]) });
    };
    const ctx = ctxOf(h);
    const snap = await learnerSnapshot(ctx, U, 'es');

    const t0 = performance.now();
    const { items, stats } = await shortlist(pagerOf(h), { lang: 'es', snapshot: snap });
    const walk = performance.now() - t0;
    expect(stats.pages).toBe(Math.ceil(2001 / 200));
    expect(stats.seen).toBe(2001);
    expect(items.length).toBe(CANDIDATES.shortlist);
    expect(items.filter(isScripture).length).toBeLessThanOrEqual(30);

    const t1 = performance.now();
    const result = await rankWholeLibrary(ctx, U, { pager: pagerOf(h), profileOf: async (id) => (id === BASE ? undefined : synth(id)) }, { limit: 10 });
    const total = performance.now() - t1;
    expect(result.picks).toHaveLength(10);
    expect(result.stats.profiled).toBeGreaterThan(100);
    // eslint-disable-next-line no-console
    console.info(`[whole-library] 2000 rows: prefilter walk ${walk.toFixed(0)} ms (${stats.pages} pages); snapshot + walk + ${result.stats.profiled} profiles + ranking ${total.toFixed(0)} ms`);
    expect(total).toBeLessThan(15_000); // a loose guard; the figures are printed above
  });
}, 120_000);

/** Count calls to a store table method without changing its behaviour. */
function vi_spy<T extends object, K extends keyof T>(target: T, method: K): { calls: number } {
  const state = { calls: 0 };
  const original = target[method] as unknown as (...a: unknown[]) => unknown;
  (target as Record<string, unknown>)[method as string] = (...a: unknown[]) => { state.calls += 1; return original.apply(target, a); };
  return state;
}
