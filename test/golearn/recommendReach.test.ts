/**
 * What is RECOMMENDED next (docs/audits/B2-SIMULATION.md, "What wastes time"): names do not make a text easy, a text that teaches
 * nothing ranks below one that does, Scripture is capped in what is READ, nothing out of reach is offered while something in reach
 * exists, rereads come after new input, and a draft the ladder absorbed is not offered. A synthetic catalogue over a memory store.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { CatalogText, LearnerItemState, TextProfile } from '../../src/core';
import { defaultPolicy } from '../../src/golearn';
import { REACH } from '../../src/golearn/policy';
import { candidateFilter, learnerSnapshot, rankWholeLibrary, shortlist } from '../../src/golearn/candidates';
import type { CatalogPager } from '../../src/golearn/candidates';
import { rankLibrary, reachOf, reachTier, scriptureFactor } from '../../src/golearn/rank';
import { setLadderPathSource } from '../../src/golearn/recommend';
import type { Ctx } from '../../src/golearn/state';
import { putCatalogRows, searchCatalog } from '../../src/library/postings';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { COURSE, buildChapter, stageRow, t } from './courseFixtures';
import { profile } from './profiles';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const BASE = ids.text('es', 'base');
const idOf = (slug: string) => ids.text('es', slug);

afterEach(() => setLadderPathSource(undefined));

function ctxOf(h: Harness, over: Partial<Ctx> = {}): Ctx {
  return {
    store: h.store, bus: h.bus, adapters: h.adapters, policy: defaultPolicy, clock: h.clock, listening: true,
    userLog: async (userId) => ({ events: await h.bus.history({ userId }), sittings: { get: () => undefined }, byText: new Map() }),
    ...over,
  };
}

/** Words the learner knows, as forms AND lemmas (a lemma id is `lemma:es:<word>:<POS>`). */
const KNOWN = [['hijo', 'NOUN'], ['casa', 'NOUN'], ['agua', 'NOUN'], ['y', 'CCONJ'], ['sol', 'NOUN']] as const;

async function world(): Promise<Harness> {
  const h = createHarness();
  await h.seed(U, COURSE);
  await h.store.stages.bulkPut([1, 2, 3].map((n) => stageRow(n, `g${n}`)));
  await buildChapter(h.store, { slug: 'base', sentences: [{ tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] }, { tokens: [t('sol', 'sol', 'NOUN')] }] });
  await h.understood(U, 'es', BASE, [0, 1], 'a');
  await h.complete(U, 'es', BASE, 'a');
  await putCatalogRows(h.store, [row('base', { id: BASE })]);
  for (const [w, pos] of KNOWN) {
    await h.mark(U, 'es', ids.form('es', w), 'known', 'form');
    await h.mark(U, 'es', `lemma:es:${w}:${pos}`, 'known', 'lemma');
  }
  return h;
}

function row(slug: string, over: Partial<CatalogText> = {}): CatalogText {
  return {
    id: idOf(slug), lang: 'es', title: `Texto ${slug}`, workId: ids.work(COURSE, `w-${slug}`), stream: 'library', domains: ['history'],
    stageId: ids.stage(COURSE, 'g1'), rights: 'verified-public-domain', location: 'library', published: true,
    features: { words: 800, sentences: 60, uniqueForms: 300, meanSentenceWords: 13 }, ...over,
  };
}

/** A profile of 100 words: lemma keys like 'hijo:NOUN' with counts (the forms are the lemma words). */
const prof = (id: string, parts: Array<[string, number]>): TextProfile =>
  profile(id, parts.map(([k, n]) => [k.split(':')[0], n] as [string, number]), { lemmas: parts });

/** `known` per cent of the words are known lemmas (hijo), the rest one unknown lemma (rio_<id>). */
const at = (id: string, known: number): TextProfile => prof(id, [['hijo:NOUN', known], [`rio${id.length}:NOUN`, 100 - known]]);

const pagerOf = (h: Harness): CatalogPager => (q) => searchCatalog(h.store, q);
const depsOf = (h: Harness, profiles: Map<string, TextProfile>) => ({ pager: pagerOf(h), profileOf: async (id: string) => profiles.get(id) });

async function catalogue(h: Harness, list: Array<{ row: CatalogText; profile: TextProfile }>) {
  await putCatalogRows(h.store, list.map((x) => x.row));
  return depsOf(h, new Map(list.map((x) => [x.row.id, x.profile])));
}
const entry = (slug: string, known: number, over: Partial<CatalogText> = {}) => ({ row: row(slug, over), profile: at(idOf(slug), known) });
const rec = async (h: Harness, deps: ReturnType<typeof depsOf>, limit = 10, extra: object = {}) =>
  h.golearn.recommend(U, { limit, wholeLibrary: deps, ...extra } as never);
/** The texts offered as NEW input (the learner's own finished text may also come back as a reread; that is section 4). */
const idsOf = (recs: Array<{ textId?: string; reason?: string }>) => recs.filter((r) => r.reason === undefined || r.reason === 'next-input').map((r) => r.textId).filter((x): x is string => !!x);

// ───────────────────────────── 1. names ─────────────────────────────

describe('1. names do not make a text easy; a text that teaches nothing ranks below one that does', () => {
  const genealogy = (id: string) => prof(id, [['david:PROPN', 40], ['saul:PROPN', 30], ['hijo:NOUN', 15], ['y:CCONJ', 15]]);
  const lesson = (id: string) => prof(id, [['hijo:NOUN', 43], ['casa:NOUN', 50], ['rio:NOUN', 3], ['luna:NOUN', 2], ['mar:NOUN', 2]]); // 3 new words in 100

  it('reachOf leaves proper names and numerals out of numerator AND denominator', async () => {
    const h = await world();
    const ctx = ctxOf(h);
    const rows = new Map<string, LearnerItemState>();
    for (const [w, pos] of KNOWN) { const r = await h.golearn.getItemState(U, `lemma:es:${w}:${pos}`); if (r) rows.set(`lemma:es:${w}:${pos}`, r as LearnerItemState); }
    void ctx;
    const shares = { knownShare: 1, familiarShare: 0, metShare: 0 };
    const g = reachOf(genealogy('g'), rows, shares);
    expect(g).toMatchObject({ basis: 'lemmas', coverage: 1, yield: 0 });
    expect(g.nameShare).toBeCloseTo(0.7, 5);
    // the same words with names UNKNOWN: names change nothing, the coverage is that of the other words
    const unknownNames = reachOf(prof('g2', [['david:PROPN', 70], ['hijo:NOUN', 15], ['rio:NOUN', 15]]), rows, { knownShare: 0.15, familiarShare: 0, metShare: 0 });
    expect(unknownNames.coverage).toBeCloseTo(0.5, 5); // 15 of the 30 non-name words
    const numerals = reachOf(prof('g3', [['diez:NUM', 50], ['hijo:NOUN', 25], ['rio:NOUN', 25]]), rows, shares);
    expect(numerals.coverage).toBeCloseTo(0.5, 5);
    expect(reachTier(g)).toBe(1); // in reach, but teaches nothing
    // yield counts NEW WORDS, not tokens: one unknown word repeated 25 times (a refrain, a list) teaches one word
    const refrain = reachOf(prof('g4', [['hijo:NOUN', 50], ['casa:NOUN', 45], ['rio:NOUN', 25]]), rows, shares);
    expect(refrain.coverage).toBeCloseTo(95 / 120, 5);
    expect(refrain.yield).toBeCloseTo(1 / 120, 5);
    expect(reachTier(refrain)).toBe(1);
    // names are words too: the same new words among many names are a thinner yield
    const named = reachOf(prof('g5', [['david:PROPN', 100], ['hijo:NOUN', 50], ['rio:NOUN', 2], ['luna:NOUN', 2], ['mar:NOUN', 1]]), rows, shares);
    expect(named.coverage).toBeCloseTo(50 / 55, 5);
    expect(named.yield).toBeCloseTo(3 / 155, 5);
    expect(reachTier(named)).toBe(0);
    const mostlyNames = reachOf(prof('g6', [['david:PROPN', 300], ['hijo:NOUN', 90], ['rio:NOUN', 5], ['luna:NOUN', 5]]), rows, shares);
    expect(mostlyNames.yield).toBeCloseTo(2 / 400, 5);
    expect(reachTier(mostlyNames)).toBe(1);
    // words with no reading at all (names the analyser does not know: 1 Chronicles in Hindi) are words of the text too
    const unread = reachOf(profile('g7', [['abiud', 60], ['hijo', 98], ['rio', 2]], { lemmas: [['hijo:NOUN', 98], ['rio:NOUN', 2]] }), rows, shares);
    expect(unread.yield).toBeCloseTo(1 / 160, 5); // not 1 / 100
    expect(reachTier(unread)).toBe(1);
    expect(reachTier({ coverage: 0.6, yield: 0.4 })).toBe(2);
    expect(reachTier({ coverage: 0.93, yield: 0.07 })).toBe(0);
    expect(reachTier({ coverage: 0.93 })).toBe(0); // a measure without a yield is never "teaches nothing"
  });

  it('the old measure puts the genealogy first (names are known forms); the recommendation puts what teaches first', async () => {
    const h = await world();
    for (const f of ['david', 'saul']) await h.mark(U, 'es', ids.form('es', f), 'known', 'form'); // names he has seen: "known" forms
    const ctx = ctxOf(h);
    const cands = [
      { profile: genealogy(idOf('aaa-genealogy')), published: true, rights: 'verified-public-domain' as const },
      { profile: lesson(idOf('zzz-lesson')), published: true, rights: 'verified-public-domain' as const },
    ];
    const old = await rankLibrary(ctx, U, cands, { challenge: 'easy', limit: 5 });
    expect(old[0].textId).toBe(idOf('aaa-genealogy'));
    const now = await rankLibrary(ctx, U, cands, { challenge: 'easy', limit: 5, reach: {} });
    expect(now.map((r) => r.textId)).toEqual([idOf('zzz-lesson'), idOf('aaa-genealogy')]);
    expect(now[1].reach).toMatchObject({ tier: 1, aboveLevel: false });
    expect(now[1].reasons.join(' ')).toMatch(/teach you little/);
    expect(now[0].reach!.yield).toBeCloseTo(0.03, 5);
    expect(now[0].reach!.yield).toBeGreaterThan(REACH.minYield);
  });

  it('recommend(): a genealogy (names + known words) is offered after texts in reach that teach something', async () => {
    const h = await world();
    const deps = await catalogue(h, [
      { row: row('aaa-genealogy'), profile: genealogy(idOf('aaa-genealogy')) },
      { row: row('bbb-lesson'), profile: lesson(idOf('bbb-lesson')) },
      { row: row('ccc-lesson'), profile: lesson(idOf('ccc-lesson')) },
    ]);
    const ids3 = idsOf(await rec(h, deps));
    expect(ids3.indexOf(idOf('bbb-lesson'))).toBeLessThan(ids3.indexOf(idOf('aaa-genealogy')));
    expect(ids3.indexOf(idOf('ccc-lesson'))).toBeLessThan(ids3.indexOf(idOf('aaa-genealogy')));
    expect(ids3).toContain(idOf('aaa-genealogy')); // still offered: after, not never
  });

  it('with ONLY texts that teach nothing, they are still offered (never an empty list)', async () => {
    const h = await world();
    const deps = await catalogue(h, [{ row: row('aaa-genealogy'), profile: genealogy(idOf('aaa-genealogy')) }]);
    expect(idsOf(await rec(h, deps))).toEqual([idOf('aaa-genealogy')]);
  });
});

// ───────────────────────────── 2. Scripture ─────────────────────────────

describe('2. a soft cap on Scripture in what is READ', () => {
  const scriptureRow = (slug: string) => row(slug, { stream: 'scripture', domains: ['theology'] });

  async function readScripture(h: Harness, n: number) {
    for (let i = 0; i < n; i++) {
      const slug = `read-scr${i}`;
      await buildChapter(h.store, { slug, sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
      await putCatalogRows(h.store, [scriptureRow(slug)]);
      await h.viewAll(U, 'es', idOf(slug), 1, `s${i}`);
      await h.complete(U, 'es', idOf(slug), `s${i}`);
    }
  }

  it('the factor is 1 up to the share and falls proportionally above it, never to nothing for a learner who reads some', () => {
    expect(scriptureFactor(undefined)).toBe(1);
    expect(scriptureFactor(REACH.scriptureShare)).toBe(1);
    const half = scriptureFactor((1 + REACH.scriptureShare) / 2);
    expect(half).toBeCloseTo(1 - REACH.scripturePenalty / 2, 10);
    expect(scriptureFactor(1)).toBeCloseTo(1 - REACH.scripturePenalty, 10);
    expect(scriptureFactor(1)).toBeGreaterThan(0);
  });

  it('the snapshot measures the share of the last texts (by words) and says nothing before enough texts', async () => {
    const h = await world();
    const ctx = ctxOf(h);
    expect((await learnerSnapshot(ctx, U, 'es')).scriptureShare).toBeUndefined(); // one text read
    await readScripture(h, 4);
    const share = (await learnerSnapshot(ctx, U, 'es')).scriptureShare!;
    expect(share).toBeCloseTo(4 * 800 / (5 * 800), 5);
  });

  it('when Scripture exceeds its share of what he read, a Scripture text of equal merit is offered after another; before that it was first', async () => {
    const h = await world();
    const deps = await catalogue(h, [
      { row: scriptureRow('aaa-scripture'), profile: at(idOf('aaa-scripture'), 93) },
      { row: row('zzz-secular'), profile: at(idOf('zzz-secular'), 93) },
    ]);
    const before = idsOf(await rec(h, deps));
    expect(before[0]).toBe(idOf('aaa-scripture')); // a tie broken by id: nothing yet says too much Scripture
    await readScripture(h, 5);
    const after = await rec(h, deps);
    expect(idsOf(after)[0]).toBe(idOf('zzz-secular'));
    const scripture = after.find((r) => r.textId === idOf('aaa-scripture'))!;
    expect(scripture).toBeDefined(); // penalised, not removed
    expect(scripture.explanation).toMatch(/Scripture is already a large share/);
  });

  it('with little else in reach (the Hindi / Thai case) Scripture is still offered: the cap never leaves him with nothing', async () => {
    const h = await world();
    const deps = await catalogue(h, [
      { row: scriptureRow('aaa-scripture'), profile: at(idOf('aaa-scripture'), 93) },
      { row: scriptureRow('bbb-scripture'), profile: at(idOf('bbb-scripture'), 90) },
    ]);
    await readScripture(h, 6);
    const recs = idsOf(await rec(h, deps));
    expect(recs).toContain(idOf('aaa-scripture'));
    expect(recs).toContain(idOf('bbb-scripture'));
  });

  it('a plain ranking (no `reach`) is untouched by the cap', async () => {
    const h = await world();
    await readScripture(h, 5);
    const snap = await learnerSnapshot(ctxOf(h), U, 'es');
    const profiles = new Map([[idOf('aaa-scripture'), at(idOf('aaa-scripture'), 93)], [idOf('zzz-secular'), at(idOf('zzz-secular'), 93)]]);
    await putCatalogRows(h.store, [scriptureRow('aaa-scripture'), row('zzz-secular')]);
    const plain = await rankWholeLibrary(ctxOf(h), U, depsOf(h, profiles), { limit: 5, snapshot: snap });
    const pick = (r: typeof plain, slug: string) => r.picks.find((p) => p.row.id === idOf(slug))!.ranked;
    expect(pick(plain, 'aaa-scripture').reach).toBeUndefined();
    expect(pick(plain, 'aaa-scripture').reasons.join(' ')).not.toMatch(/large share/);
    const reach = await rankWholeLibrary(ctxOf(h), U, depsOf(h, profiles), { limit: 5, snapshot: snap, reach: true });
    expect(pick(reach, 'aaa-scripture').reach!.scripturePenalty).toBeLessThan(1);
    expect(pick(reach, 'aaa-scripture').score).toBeLessThan(pick(plain, 'aaa-scripture').score);
    expect(pick(reach, 'zzz-secular').reach!.scripturePenalty).toBe(1);
    expect(reach.picks[0].row.id).toBe(idOf('zzz-secular'));
  });
});

// ───────────────────────────── 3. out of reach, front matter ─────────────────────────────

describe('3. nothing out of reach while something in reach exists; front matter is never reading', () => {
  it('a learner who has read nothing is not told every text is above his level: the library waits for something to measure him by', async () => {
    const h = createHarness();
    await h.seed(U, COURSE);
    await h.store.stages.bulkPut([1, 2, 3].map((n) => stageRow(n, `g${n}`)));
    const deps = await catalogue(h, [entry('aaa', 40), entry('bbb', 55), entry('ccc', 65)]);
    const recs = await rec(h, deps);
    expect(recs.some((r) => /above your level/.test(r.explanation))).toBe(false);
    expect(recs.filter((r) => r.reason === 'next-input' && r.textId)).toEqual([]);
  });

  it('offers no text below the floor when any text at or above it exists', async () => {
    const h = await world();
    const deps = await catalogue(h, [entry('aaa-near', 93), entry('bbb-far', 50), entry('ccc-mid', 60), entry('ddd-edge', 76)]);
    const recs = idsOf(await rec(h, deps));
    expect(recs).toContain(idOf('aaa-near'));
    expect(recs).toContain(idOf('ddd-edge')); // 76 % is at or above the 75 % floor
    expect(recs).not.toContain(idOf('bbb-far'));
    expect(recs).not.toContain(idOf('ccc-mid'));
  });

  it('with nothing in reach, the closest few are offered and said plainly to be above his level; the ladder\'s next unit still leads', async () => {
    const h = await world();
    const list = [entry('aaa', 40), entry('bbb', 55), entry('ccc', 65), entry('ddd', 30), entry('eee', 20)];
    const deps = await catalogue(h, list);
    const recs = await rec(h, deps);
    const texts = recs.filter((r) => r.textId && r.reason === 'next-input');
    expect(texts.map((r) => r.textId)).toEqual([idOf('ccc'), idOf('bbb'), idOf('aaa')]); // the closest three, nearest first
    for (const r of texts) {
      expect(r.explanation).toMatch(/above your level/);
      expect(r.score).toBeLessThanOrEqual(REACH.aboveLevelScore);
    }
    const unit = idOf('unit-1');
    setLadderPathSource(async () => ({ steps: [{ unitId: 'u1', textId: unit, title: 'Unit one', stage: 'a1-1', published: true }], finished: false }));
    const withPath = await rec(h, deps);
    expect(withPath[0].textId).toBe(unit);
    expect(withPath[0].explanation).toMatch(/^Next on your path/);
    expect(withPath.slice(1).filter((r) => r.reason === 'next-input').every((r) => /above your level/.test(r.explanation))).toBe(true);
  });

  it('never recommends front matter or a preface — nor a work\'s chapter 0 — however easy; Scripture\'s chapter 0 is a starter selection and stays', async () => {
    const h = await world();
    const deps = await catalogue(h, [
      entry('aaa-front', 100, { title: 'Wilhelm Tell — Front matter' }),
      entry('bbb-zero', 100, { chapter: 0, title: 'Prólogo de la obra' }),
      entry('ccc-preface', 100, { title: 'La casa — Preface' }),
      entry('ddd-starter', 95, { chapter: 0, stream: 'scripture', domains: ['theology'] }),
      entry('eee-normal', 90),
    ]);
    const recs = idsOf(await rec(h, deps));
    for (const slug of ['aaa-front', 'bbb-zero', 'ccc-preface']) expect(recs).not.toContain(idOf(slug));
    expect(recs).toContain(idOf('eee-normal'));
    expect(recs).toContain(idOf('ddd-starter'));
    const snap = await learnerSnapshot(ctxOf(h), U, 'es');
    const { items, stats } = await shortlist(pagerOf(h), { lang: 'es', snapshot: snap });
    expect(items.map((r) => r.id)).not.toContain(idOf('aaa-front'));
    expect(stats.excluded).toBeGreaterThanOrEqual(3);
  });

  it('a stored text that is a work\'s chapter 0 titled "Front matter" is not offered either', async () => {
    const h = await world();
    await buildChapter(h.store, { slug: 'book-ch0', work: 'book', chapter: 0, title: 'Book — Front matter', sentences: [{ tokens: [t('hijo', 'hijo', 'NOUN'), t('y', 'y', 'CONJ')] }] });
    await buildChapter(h.store, { slug: 'book-ch1', work: 'book', chapter: 1, title: 'Book — One', sentences: [{ tokens: [t('hijo', 'hijo', 'NOUN'), t('casa', 'casa', 'NOUN')] }] });
    const recs = idsOf(await h.golearn.recommend(U, { limit: 10, wholeLibrary: false } as never));
    expect(recs).toContain(idOf('book-ch1'));
    expect(recs).not.toContain(idOf('book-ch0'));
  });
});

// ───────────────────────────── 4. rereads ─────────────────────────────

describe('4. rereads come after the new input in reach', () => {
  async function setup() {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    return h;
  }
  async function easyText(h: Harness, slug: string, words = ['dios', 'creo', 'en']) {
    await buildFixtureText(h.store, { lang: 'es', slug, sentences: [{ tokens: words.map((w) => ({ surface: w, lemma: w, pos: 'NOUN' as const })) }] });
    return idOf(slug);
  }
  const knowWords = async (h: Harness, words: string[]) => { for (const w of words) await h.mark(U, 'es', ids.form('es', w), 'known', 'form'); };
  const readSome = async (h: Harness, session = 's1') => {
    await h.viewAll(U, 'es', ES_STORY, 4, session);
    await h.report(U, 'es', ES_STORY, [0, 1, 2, 3], { session, scope: 'text', degree: 'some' });
    await h.complete(U, 'es', ES_STORY, session);
  };

  it('a reread is never first while an unread text is in reach; it follows it', async () => {
    const h = await setup();
    await readSome(h);
    await knowWords(h, ['dios', 'creo', 'en']);
    const easy = await easyText(h, 'story-easy');
    const recs = await h.golearn.recommend(U, { limit: 10 });
    const order = recs.map((r) => [r.textId, r.reason]);
    expect(order[0]).toEqual([easy, 'next-input']);
    expect(order).toContainEqual([ES_STORY, 'reread']);
    expect(order.findIndex((o) => o[1] === 'reread')).toBeGreaterThan(0);
  });

  it('with no unread text in reach, the reread may lead', async () => {
    const h = await setup();
    await readSome(h);
    const hard = await easyText(h, 'story-hard', ['xa', 'xb', 'xc', 'xd', 'xe']);
    const recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs[0]).toMatchObject({ textId: ES_STORY, reason: 'reread' });
    expect(idsOf(recs)).toContain(hard); // above his level, said so, after
    expect(recs.find((r) => r.textId === hard)!.explanation).toMatch(/above your level/);
  });

  it('never the same text twice in a row: read again in the next sitting, it is not offered a third time', async () => {
    const h = await setup();
    await readSome(h, 's1');
    await knowWords(h, ['dios', 'creo', 'en']);
    await easyText(h, 'story-easy');
    expect((await h.golearn.recommend(U, { limit: 10 })).some((r) => r.textId === ES_STORY && r.reason === 'reread')).toBe(true);
    await readSome(h, 's2'); // he followed the advice
    const recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs.some((r) => r.textId === ES_STORY)).toBe(false);
    expect(recs.length).toBeGreaterThan(0);
  });

  it('never a text read at under 75 % coverage within the last few texts (rereading what he could not read does not help)', async () => {
    const h = await setup();
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    await h.rescue(U, 'es', ES_STORY, [0, 1, 2], 's1'); // English on most of it
    await h.complete(U, 'es', ES_STORY, 's1');
    await knowWords(h, ['dios', 'creo', 'en']);
    const first = await easyText(h, 'story-easy');
    expect((await h.golearn.recommend(U, { limit: 10 })).some((r) => r.textId === ES_STORY && (r.reason === 'reread' || r.reason === 'reinforces-weak-items'))).toBe(false);
    // …but not for ever: after REACH.rereadLookback other texts the old reading is no longer "within the last few"
    for (let i = 0; i < REACH.rereadLookback; i++) {
      const slug = `story-more${i}`;
      await easyText(h, slug);
      await h.viewAll(U, 'es', idOf(slug), 1, `m${i}`);
      await h.complete(U, 'es', idOf(slug), `m${i}`);
    }
    void first;
    const later = await h.golearn.recommend(U, { limit: 20 });
    expect(later.some((r) => r.textId === ES_STORY && r.reason === 'reread')).toBe(true);
  });
});

// ───────────────────────────── 5. superseded drafts ─────────────────────────────

describe('5. a draft the ladder absorbed is not offered (it stays in the store)', () => {
  it('is excluded from the store candidates, the whole-library shortlist and the recommendations', async () => {
    const h = await world();
    await buildFixtureText(h.store, {
      lang: 'es', slug: 'camino-1-01', editorialTags: ['superseded-by-ladder'], sentences: [{ tokens: [{ surface: 'hijo', lemma: 'hijo', pos: 'NOUN' as const }, { surface: 'casa', lemma: 'casa', pos: 'NOUN' as const }] }],
    });
    await buildFixtureText(h.store, { lang: 'es', slug: 'camino-9-99', sentences: [{ tokens: [{ surface: 'hijo', lemma: 'hijo', pos: 'NOUN' as const }, { surface: 'casa', lemma: 'casa', pos: 'NOUN' as const }] }] });
    const deps = await catalogue(h, [entry('camino-1-01', 95), entry('camino-9-99', 95), entry('other', 90)]);
    const recs = idsOf(await rec(h, deps));
    expect(recs).not.toContain(idOf('camino-1-01'));
    expect(recs).toContain(idOf('camino-9-99'));
    expect(recs).toContain(idOf('other'));
    const withoutLibrary = idsOf(await h.golearn.recommend(U, { limit: 10, wholeLibrary: false } as never));
    expect(withoutLibrary).not.toContain(idOf('camino-1-01'));
    expect(withoutLibrary).toContain(idOf('camino-9-99'));
    expect((await h.store.texts.get(idOf('camino-1-01')))?.editorialTags).toContain('superseded-by-ladder'); // still in the store
    const snap = await learnerSnapshot(ctxOf(h), U, 'es');
    const { items } = await shortlist(pagerOf(h), { lang: 'es', snapshot: snap, fit: await candidateFilter(ctxOf(h)) });
    expect(items.map((r) => r.id)).not.toContain(idOf('camino-1-01'));
  });
});

describe('6. what he has read never pushes the unread out; Stage 0 scenes are not library reading', () => {
  it('a text he read (in reach by definition) does not hide every unread text: with nothing unread in reach, the closest few are still offered', async () => {
    const h = await world();
    // the text he read is a catalogue row with a profile too (in preview, the drafts he read are)
    await putCatalogRows(h.store, [row('aaa', {}), row('bbb', {}), row('ccc', {})]);
    const profiles = new Map<string, TextProfile>([[BASE, at(BASE, 100)], [idOf('aaa'), at(idOf('aaa'), 40)], [idOf('bbb'), at(idOf('bbb'), 60)], [idOf('ccc'), at(idOf('ccc'), 55)]]);
    const recs = await rec(h, depsOf(h, profiles));
    const fresh = recs.filter((r) => r.reason === 'next-input' && r.textId).map((r) => r.textId);
    expect(fresh).toEqual([idOf('bbb'), idOf('ccc'), idOf('aaa')]); // nearest first, all said to be above his level
    expect(fresh).not.toContain(BASE);
  });

  it('a Stage 0 scene in the store (tagged stage0) is never offered, read or not', async () => {
    const h = await world();
    await buildFixtureText(h.store, { lang: 'es', slug: 'stage0-es-s01', editorialTags: ['stage0'], sentences: [{ tokens: [{ surface: 'hijo', lemma: 'hijo', pos: 'NOUN' as const }] }] });
    await h.understood(U, 'es', idOf('stage0-es-s01'), [0], 'b'); // seen, never "finished" (Stage 0 does not finish texts)
    const deps = await catalogue(h, [entry('stage0-es-s01', 99), entry('other', 90)]);
    const recs = idsOf(await rec(h, deps));
    expect(recs).not.toContain(idOf('stage0-es-s01'));
    expect(recs).toContain(idOf('other'));
  });
});
