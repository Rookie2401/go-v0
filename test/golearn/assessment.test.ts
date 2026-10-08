/**
 * The unseen-text check (R7): when it is due, which text it uses, how long that text stays out of recommendation, and the event it
 * leaves (readiness data, never item evidence, folded nowhere else).
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { CatalogText, UnseenCheckRecorded } from '../../src/core';
import { defaultPolicy } from '../../src/golearn';
import {
  CHECK_EVERY, CHECK_MIN_GAP_DAYS, chooseUnseen, checkResultLine, dueForCheck, finishedSinceLastCheck, latestUnseenCheck, loadCheckHistory,
  pendingCheck, pickUnseenText, recordUnseenCheck, reportedByCheck, startUnseenCheck, unseenChecks,
} from '../../src/golearn/assessment';
import type { CheckHistory, UnseenCandidate } from '../../src/golearn/assessment';
import { HELD_OUT_DAYS, heldOutIds } from '../../src/golearn/heldout';
import { recommend } from '../../src/golearn/recommend';
import type { Ctx } from '../../src/golearn/state';
import { UNSEEN_MIN_WORDS, recordUnseenReading, validateRuntimeUnseenText } from '../../src/course/readingAssessment';
import { putCatalogRows, searchCatalog } from '../../src/library/postings';
import { READINESS } from '../../src/golearn';
import { COURSE, buildChapter, stageRow, t, workRow } from './courseFixtures';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { profile } from './profiles';

const U = 'u1';
const DAY = 86_400_000;
const NOW = '2026-03-01T10:00:00.000Z';
const at = (days: number) => new Date(Date.parse(NOW) + days * DAY).toISOString();

// ───────────────────────────── when it is due ─────────────────────────────

const done = (n: number, startDay = -40): CheckHistory['completions'] => Array.from({ length: n }, (_, i) => ({ textId: `x${i}`, at: at(startDay + i * 0.1) }));

describe('dueForCheck', () => {
  it('is due after CHECK_EVERY (8) finished texts, not before', () => {
    expect(CHECK_EVERY).toBe(8);
    expect(dueForCheck({ now: NOW, completions: done(7), checks: [] })).toBe(false);
    expect(dueForCheck({ now: NOW, completions: done(8), checks: [] })).toBe(true);
  });

  it('counts distinct texts: finishing one text again is not another text', () => {
    const twice = [...done(7), { textId: 'x0', at: at(-30) }, { textId: 'x0', at: at(-29) }];
    expect(finishedSinceLastCheck({ now: NOW, completions: twice, checks: [] })).toBe(7);
    expect(dueForCheck({ now: NOW, completions: twice, checks: [] })).toBe(false);
  });

  it('counts only texts finished since the last check, and the check text itself never counts', () => {
    const checks = [{ textId: 'chk', at: at(-20) }];
    const before = done(8, -40); // all before the check
    expect(dueForCheck({ now: NOW, completions: before, checks })).toBe(false);
    const after = [...done(7, -19), { textId: 'chk', at: at(-10) }]; // the check text's own completion is not one of the eight
    expect(finishedSinceLastCheck({ now: NOW, completions: after, checks })).toBe(7);
    expect(dueForCheck({ now: NOW, completions: after, checks })).toBe(false);
    expect(dueForCheck({ now: NOW, completions: [...after, { textId: 'y', at: at(-9) }], checks })).toBe(true);
  });

  it('is at most once in 7 days, however many texts were finished', () => {
    expect(CHECK_MIN_GAP_DAYS).toBe(7);
    const completions = done(20, -3);
    expect(dueForCheck({ now: NOW, completions, checks: [{ textId: 'c', at: at(-6.9 - 4) }] })).toBe(true); // 10.9 days ago, finished since? none after
    const recent = [{ textId: 'c', at: at(-6) }];
    expect(dueForCheck({ now: NOW, completions: done(20, -5), checks: recent })).toBe(false); // six days ago
    expect(dueForCheck({ now: at(1.5), completions: done(20, -5), checks: recent })).toBe(true); // seven and a half days
  });

  it('is never due while a check is pending, or when the clock is unreadable', () => {
    expect(dueForCheck({ now: NOW, completions: done(12), checks: [], pendingTextId: 'p' })).toBe(false);
    expect(dueForCheck({ now: 'garbage', completions: done(12), checks: [] })).toBe(false);
  });
});

// ───────────────────────────── which text ─────────────────────────────

const cand = (id: string, coverage: number, over: Partial<UnseenCandidate> = {}): UnseenCandidate => ({ textId: id, title: id, words: 300, coverage, scripture: false, seen: false, ...over });

describe('chooseUnseen (the pick rule)', () => {
  it('takes only reach coverage from 0.88 to 0.95, ends included', () => {
    expect(chooseUnseen([cand('lo', 0.879), cand('hi', 0.951)])).toBeUndefined();
    expect(chooseUnseen([cand('a', 0.88)])?.textId).toBe('a');
    expect(chooseUnseen([cand('b', 0.95)])?.textId).toBe('b');
  });

  it('never a text he has read, nor Scripture, nor a Stage 0 scene, nor one under 120 words, nor an ineligible one', () => {
    const bad = [
      cand('read', 0.915, { seen: true }), cand('scr', 0.915, { scripture: true }), cand('s0', 0.915, { stage0: true }),
      cand('short', 0.915, { words: UNSEEN_MIN_WORDS - 1 }), cand('inel', 0.915, { ineligible: true }),
    ];
    expect(chooseUnseen(bad)).toBeUndefined();
    expect(chooseUnseen([...bad, cand('ok', 0.9, { words: UNSEEN_MIN_WORDS })])?.textId).toBe('ok');
  });

  it('takes authentic and controlled texts alike (the candidate does not say which)', () => {
    expect(chooseUnseen([cand('controlled', 0.9, { stageId: 'stage:g1' })])?.textId).toBe('controlled');
  });

  it('prefers the middle of the band and is deterministic in whatever order the candidates come', () => {
    const list = [cand('edge', 0.88), cand('mid', 0.92), cand('near', 0.93), cand('t1', 0.9), cand('t2', 0.93)];
    const first = chooseUnseen(list)!;
    expect(first.textId).toBe('mid');
    expect(chooseUnseen([...list].reverse())!.textId).toBe('mid');
    // equal distance from the middle: a stable hash decides, never the order
    const tie = [cand('a', 0.9), cand('b', 0.9), cand('c', 0.9)];
    const pick = chooseUnseen(tie)!.textId;
    expect(chooseUnseen([...tie].reverse())!.textId).toBe(pick);
    expect(chooseUnseen([tie[1], tie[2], tie[0]])!.textId).toBe(pick);
  });
});

// ───────────────────────────── the library, held out for 60 days ─────────────────────────────

const idOf = (slug: string) => ids.text('es', slug);
const BASE = idOf('base');

function ctxOf(h: Harness): Ctx {
  return {
    store: h.store, bus: h.bus, adapters: h.adapters, policy: defaultPolicy, clock: h.clock, listening: true,
    userLog: async (userId) => ({ events: await h.bus.history({ userId }), sittings: { get: () => undefined }, byText: new Map() }),
  };
}

function row(slug: string, over: Partial<CatalogText> = {}): CatalogText {
  return {
    id: idOf(slug), lang: 'es', title: `Texto ${slug}`, workId: ids.work(COURSE, `w-${slug}`), stream: 'library', domains: ['history'],
    stageId: ids.stage(COURSE, 'g1'), rights: 'verified-public-domain', location: 'library', published: true,
    features: { words: 400, sentences: 30, uniqueForms: 200, meanSentenceWords: 13 }, ...over,
  };
}

/** `known` of 100 words are "sol" (understood by the learner); the rest "rio" (never met). */
const prof = (slug: string, known: number) => profile(idOf(slug), [['sol', known], ['rio', 100 - known]]);

interface Spec { slug: string; known: number; over?: Partial<CatalogText> }
const SPECS: Spec[] = [
  { slug: 'a93', known: 93 },
  { slug: 'd89', known: 89 },
  { slug: 'low80', known: 80 },
  { slug: 'high97', known: 97 },
  { slug: 'scr93', known: 93, over: { stream: 'scripture', domains: ['theology'] } },
  { slug: 'short93', known: 93, over: { features: { words: 100, sentences: 8, uniqueForms: 60, meanSentenceWords: 12 } } },
  { slug: 'work93', known: 93, over: { workId: ids.work(COURSE, 'w-base') } }, // another chapter of a work he has read
];

async function world() {
  const h = createHarness();
  await h.seed(U, COURSE);
  await h.store.stages.bulkPut([stageRow(1, 'g1'), stageRow(2, 'g2')]);
  await h.store.works.bulkPut([workRow('w1', 'g1')]);
  await buildChapter(h.store, { slug: 'base', work: 'w-base', chapter: 1, sentences: [{ tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] }, { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] }] });
  await h.understood(U, 'es', BASE, [0, 1], 'a');
  await h.complete(U, 'es', BASE, 'a');
  const rows = [row('base', { workId: ids.work(COURSE, 'w-base') }), ...SPECS.map((s) => row(s.slug, s.over))];
  await putCatalogRows(h.store, rows);
  const known = new Map(SPECS.map((s) => [idOf(s.slug), s.known]));
  const deps = {
    pager: (q: Parameters<typeof searchCatalog>[1]) => searchCatalog(h.store, q),
    profileOf: async (id: string) => (known.has(id) ? prof(id.replace('text:es:', ''), known.get(id)!) : undefined),
  };
  return { h, ctx: ctxOf(h), deps };
}

describe('pickUnseenText over a library', () => {
  it('picks the in-band, never-read, non-Scripture text of enough words (nothing else qualifies)', async () => {
    const { h, ctx, deps } = await world();
    const pick = await pickUnseenText(ctx, U, 'es', h.clock(), deps);
    expect(pick?.textId).toBe(idOf('a93'));
    expect(pick!.coverage).toBeGreaterThanOrEqual(0.88);
    expect(pick!.coverage).toBeLessThanOrEqual(0.95);
    // deterministic: the same state gives the same text
    expect((await pickUnseenText(ctx, U, 'es', h.clock(), deps))?.textId).toBe(idOf('a93'));
  });

  it('says so when nothing is at his reach (writes nothing)', async () => {
    const { h, ctx, deps } = await world();
    const only = { ...deps, profileOf: async (id: string) => (id === idOf('low80') ? prof('low80', 80) : id === idOf('high97') ? prof('high97', 97) : undefined) };
    expect(await pickUnseenText(ctx, U, 'es', h.clock(), only)).toBeUndefined();
    expect(await h.store.meta.all()).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: expect.stringContaining('unseen-heldout') })]));
  });
});

describe('the chosen text is held out for 60 days', () => {
  it('startUnseenCheck holds it out: the next pick, the whole-library step and recommend() all leave it alone', async () => {
    const { h, ctx, deps } = await world();
    const before = await recommend(ctx, U, { limit: 20, lang: 'es', wholeLibrary: deps });
    const pending = await startUnseenCheck(ctx, U, 'es', h.clock(), deps, ids.stage(COURSE, 'g1'));
    expect(pending).toMatchObject({ textId: idOf('a93'), lang: 'es', stageId: ids.stage(COURSE, 'g1') });
    expect(pending!.coverageAtPick).toBeGreaterThanOrEqual(0.88);
    expect((await heldOutIds(ctx, U, h.clock())).has(idOf('a93'))).toBe(true);
    // a second start returns the same pending check, not another text
    expect((await startUnseenCheck(ctx, U, 'es', h.clock(), deps))?.textId).toBe(idOf('a93'));
    expect((await pendingCheck(ctx, U, 'es', h.clock()))?.textId).toBe(idOf('a93'));
    // the next pick (after the pending check is let go) is another text
    await ctx.store.meta.delete(`unseen-check:${encodeURIComponent(U)}:es`);
    expect((await pickUnseenText(ctx, U, 'es', h.clock(), deps))?.textId).toBe(idOf('d89'));
    const after = await recommend(ctx, U, { limit: 20, lang: 'es', wholeLibrary: deps });
    expect(after.map((r) => r.textId)).not.toContain(idOf('a93'));
    expect(before.map((r) => r.textId)).toContain(idOf('a93')); // it WAS offered until it was held out
  });

  it('for 60 days from the pick, then the hold ends', async () => {
    const { h, ctx, deps } = await world();
    const start = h.clock();
    await startUnseenCheck(ctx, U, 'es', start, deps);
    const day = (n: number) => new Date(Date.parse(start) + n * DAY).toISOString();
    expect(HELD_OUT_DAYS).toBe(60);
    expect((await heldOutIds(ctx, U, day(59))).has(idOf('a93'))).toBe(true);
    expect((await heldOutIds(ctx, U, day(61))).has(idOf('a93'))).toBe(false);
    // once expired, the whole-library step may offer it again
    const later = await pickUnseenText(ctx, U, 'es', day(61), deps);
    expect(later?.textId).toBe(idOf('a93'));
  });
});

// ───────────────────────────── the result and its event ─────────────────────────────

describe('recordUnseenCheck', () => {
  it('leaves one UnseenCheckRecorded event of the stated shape and the result line, and changes nothing else', async () => {
    const { h, ctx, deps } = await world();
    const pending = (await startUnseenCheck(ctx, U, 'es', h.clock(), deps, ids.stage(COURSE, 'g1')))!;
    await h.golearn.settled();
    const items = JSON.stringify(await h.store.learnerItems.all());
    const encounters = (await h.store.encounters.all()).length;
    const { result, record } = await recordUnseenCheck(ctx, U, pending, 2, 3, h.clock());
    await h.golearn.settled();

    const events = (await h.store.events.where('type', 'UnseenCheckRecorded')) as UnseenCheckRecorded[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'UnseenCheckRecorded', userId: U, lang: 'es', textId: idOf('a93'), promptsRight: 2, promptsTotal: 3, coverageAtPick: pending.coverageAtPick, stageId: ids.stage(COURSE, 'g1'),
    });
    expect(typeof events[0].at).toBe('string');
    expect(result).toMatchObject({ textId: idOf('a93'), promptsRight: 2, promptsTotal: 3 });
    expect(checkResultLine({ promptsRight: 2, promptsTotal: 3, coverageAtPick: 0.914 })).toBe('Unseen text: 2 of 3 right, 91 % of words known at the start');
    // never item evidence: the folder did not touch the learner's items or encounters
    expect(JSON.stringify(await h.store.learnerItems.all())).toBe(items);
    expect((await h.store.encounters.all()).length).toBe(encounters);
    // the pending check is over, the text stays held out, and the record has the shape STAGE_CONTRACTS declares
    expect(await pendingCheck(ctx, U, 'es', h.clock())).toBeUndefined();
    expect((await heldOutIds(ctx, U, h.clock())).has(idOf('a93'))).toBe(true);
    expect(record.exitEvidence).toEqual({ kind: 'unseen-reading', measures: ['comprehension'], certification: false });
    expect(record).toMatchObject({ cefrCertification: false, dimension: 'reading' });
    expect(record.values.comprehension).toBeCloseTo(2 / 3);
    expect(await latestUnseenCheck(ctx, U, 'es')).toMatchObject({ promptsRight: 2, promptsTotal: 3 });
    expect(await unseenChecks(ctx, U, 'es')).toHaveLength(1);
  });

  it('refuses numbers that cannot be a result, and records nothing', async () => {
    const { h, ctx, deps } = await world();
    const pending = (await startUnseenCheck(ctx, U, 'es', h.clock(), deps))!;
    await expect(recordUnseenCheck(ctx, U, pending, 4, 3, h.clock())).rejects.toThrow(/invalid/);
    await expect(recordUnseenCheck(ctx, U, pending, 0, 0, h.clock())).rejects.toThrow(/invalid/);
    expect(await h.store.events.where('type', 'UnseenCheckRecorded')).toHaveLength(0);
    expect(await pendingCheck(ctx, U, 'es', h.clock())).toBeDefined();
  });

  it('the history that makes the next check due is read from the log: eight finished texts after it, a week later', async () => {
    const { h, ctx, deps } = await world();
    const pending = (await startUnseenCheck(ctx, U, 'es', h.clock(), deps))!;
    await recordUnseenCheck(ctx, U, pending, 3, 3, h.clock());
    expect(dueForCheck(await loadCheckHistory(ctx, U, 'es', h.clock()))).toBe(false);
    for (let i = 0; i < 8; i++) {
      await buildChapter(h.store, { slug: `fin${i}`, sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
      await h.complete(U, 'es', idOf(`fin${i}`), `fin${i}`);
    }
    h.advance(3 * DAY);
    expect(dueForCheck(await loadCheckHistory(ctx, U, 'es', h.clock()))).toBe(false); // eight texts, but under a week
    h.advance(5 * DAY);
    expect(dueForCheck(await loadCheckHistory(ctx, U, 'es', h.clock()))).toBe(true);
  });
});

// ───────────────────────────── the validators ─────────────────────────────

describe('readingAssessment: a runtime-picked text', () => {
  const facts = (over: object = {}) => ({ id: 'text:es:x', lang: 'es' as const, words: 300, ...over });
  const ctxFor = (over: object = {}, heldOut = true) => ({ userId: U, text: facts(over), encounteredTextIds: new Set<string>(), heldOut });

  it('accepts an ordinary, unread, held-out text of enough words', () => {
    expect(validateRuntimeUnseenText(ctxFor())).toEqual([]);
  });
  it('rejects Scripture, a personal copy, a protected assessment text, a Stage 0 scene, a short text, an encountered text or work, and a text not held out', () => {
    expect(validateRuntimeUnseenText(ctxFor({ kind: 'scripture' })).join()).toMatch(/Scripture/);
    expect(validateRuntimeUnseenText(ctxFor({ personalCopy: true })).join()).toMatch(/personal/);
    expect(validateRuntimeUnseenText(ctxFor({ readingAssessmentId: 'r1' })).join()).toMatch(/protected/);
    expect(validateRuntimeUnseenText(ctxFor({ editorialTags: ['stage0'] })).join()).toMatch(/Stage 0/);
    expect(validateRuntimeUnseenText(ctxFor({ words: 119 })).join()).toMatch(/120 words/);
    expect(validateRuntimeUnseenText({ ...ctxFor(), encounteredTextIds: new Set(['text:es:x']) }).join()).toMatch(/encountered/);
    expect(validateRuntimeUnseenText({ ...ctxFor({ workId: 'w' }), encounteredWorkIds: new Set(['w']) }).join()).toMatch(/encountered/);
    expect(validateRuntimeUnseenText(ctxFor({}, false)).join()).toMatch(/held out/);
  });
  it('records the lookups, rescue use and reading time as exit-evidence measures when the reader counted them', () => {
    const r = recordUnseenReading(ctxFor(), { promptsRight: 3, promptsTotal: 3, coverageAtPick: 0.9, lookupCount: 6, wordCount: 300, rescueUses: 1, readingTimeSeconds: 240 }, NOW);
    expect(r.exitEvidence).toEqual({ kind: 'unseen-reading', measures: ['comprehension', 'lookups', 'rescue-use', 'reading-time'], certification: false });
    expect(r.values).toEqual({ comprehension: 1, lookups: 2, 'rescue-use': 1, 'reading-time': 240 });
    expect(() => recordUnseenReading(ctxFor({ kind: 'scripture' }), { promptsRight: 1, promptsTotal: 1, coverageAtPick: 0.9 }, NOW)).toThrow(/Scripture/);
  });
});

// ───────────────────────────── the readiness wiring ─────────────────────────────

describe('stageReadiness reads the check as one report of comprehension', () => {
  it('maps the share right to the four-button degrees, never a level', () => {
    expect(READINESS.reportedComprehension.share).toBe(0.8);
    expect(reportedByCheck({ promptsRight: 3, promptsTotal: 3 })).toBe('most');
    expect(reportedByCheck({ promptsRight: 4, promptsTotal: 5 })).toBe('most');
    expect(reportedByCheck({ promptsRight: 2, promptsTotal: 3 })).toBe('some');
    expect(reportedByCheck({ promptsRight: 1, promptsTotal: 3 })).toBe('little');
    expect(reportedByCheck({ promptsRight: 0, promptsTotal: 0 })).toBe('little');
  });

  it('two said reports plus a good check make the three reports the signal needs, and a poor check pulls it below 80 %', async () => {
    const mk = async (right: number) => {
      const h = createHarness();
      await h.seed(U, COURSE);
      await h.store.stages.bulkPut([stageRow(1, 'g1')]);
      await h.store.works.bulkPut([workRow('w1', 'g1')]);
      await buildChapter(h.store, { slug: 'r1', work: 'w1', chapter: 1, sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
      await buildChapter(h.store, { slug: 'r2', work: 'w1', chapter: 2, sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
      for (const slug of ['r1', 'r2']) await h.report(U, 'es', idOf(slug), [], { session: slug, scope: 'text', degree: 'all' });
      const base = await h.golearn.stageReadiness(U, COURSE, ids.stage(COURSE, 'g1'));
      await h.bus.emit<UnseenCheckRecorded>({
        type: 'UnseenCheckRecorded', userId: U, lang: 'es', surface: 'home', session: 'chk', dedupeKey: `chk:${right}`,
        textId: idOf('elsewhere'), promptsRight: right, promptsTotal: 3, coverageAtPick: 0.91,
      });
      await h.golearn.settled();
      const withCheck = await h.golearn.stageReadiness(U, COURSE, ids.stage(COURSE, 'g1'));
      return { base: base.signals.find((s) => s.key === 'reported-comprehension')!, withCheck: withCheck.signals.find((s) => s.key === 'reported-comprehension')! };
    };
    const good = await mk(3);
    expect(good.base.status).toBe('insufficient-data');
    expect(good.withCheck).toMatchObject({ status: 'met', value: 1 });
    expect(good.withCheck.explanation).toMatch(/unseen-text check counts as one of them \(3 of 3 right\)/);
    const poor = await mk(1);
    expect(poor.withCheck.status).toBe('not-met');
    expect(poor.withCheck.explanation).not.toMatch(/\bB[12]\b|\bA[12]\b|\bC[12]\b|CEFR|level/i);
  });
});
