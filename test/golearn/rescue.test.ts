/**
 * rescueDependence — how often each kind of help was needed while reading, and whether the need is falling.
 * A progress measure in its own right (a learner whose English rescues fall from 30 in 100 sentences to 3 has made
 * progress); never a score, and silent below a minimum of reading.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { DomainEvent, EventInput } from '../../src/core';
import { RESCUE } from '../../src/golearn/policy';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { buildChapter, filler, stageRow, t, workRow } from './courseFixtures';

const U = 'u1';
const A = ids.text('es', 'a');
const B = ids.text('es', 'b');
const F = (w: string) => ids.form('es', w);

const four = () => ({ tokens: [t('sol', 'sol', 'NOUN'), t('luna', 'luna', 'NOUN'), t('mar', 'mar', 'NOUN'), t('rio', 'rio', 'NOUN')] });

async function chapters(h: Harness, n: number) {
  await buildChapter(h.store, { slug: 'a', work: 'w1', chapter: 1, sentences: Array.from({ length: n }, four) });
  await buildChapter(h.store, { slug: 'b', work: 'w2', chapter: 1, sentences: filler(10) });
  await h.store.stages.bulkPut([stageRow(0, 's1'), stageRow(1, 's2')]);
  await h.store.works.bulkPut([workRow('w1', 's1'), workRow('w2', 's2')]);
}

describe('rescueDependence', () => {
  it('keeps the kinds of help apart: word-level per 100 words, sentence-level per 100 sentences', async () => {
    const h = createHarness();
    await chapters(h, 10);
    await h.viewAll(U, 'es', A, 10); // 10 sentences · 40 words
    await h.help(U, 'es', A, 0, 0, F('sol'), 1);
    await h.help(U, 'es', A, 0, 1, F('luna'), 1);
    await h.help(U, 'es', A, 1, 0, F('sol'), 1); // 3 word lookups
    await h.bus.emit({ type: 'GrammarHelpOpened', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'g1', sentenceId: `${A}/s2`, patternId: ids.pattern('es', 'p'), tokenIds: [] } as EventInput<DomainEvent>);
    await h.decoding(U, 'es', A, 3, 0, F('sol'), []); // decoding, no romanization
    await h.decoding(U, 'es', A, 3, 1, F('luna'), [], { romanization: true }); // decoding with the transliteration rescue
    await h.rescue(U, 'es', A, [4, 5]); // English for two sentences
    await h.rescue(U, 'es', A, [4]); // the same sentence again: still one rescued sentence
    await h.bus.emit({ type: 'SentenceExplanationRevealed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'e1', sentenceId: `${A}/s6` } as EventInput<DomainEvent>);

    const r = await h.golearn.rescueDependence(U);
    expect(r.overall.sentences).toBe(10);
    expect(r.overall.words).toBe(40);
    expect(r.overall.per100Words).toEqual({ decoding: 5, romanization: 2.5, word: 7.5, phrase: 0, grammar: 2.5 });
    expect(r.overall.per100Sentences).toEqual({ explanation: 10, english: 20 });
    // sentences 0,1,2,3,4,5,6 had help; 7,8,9 had none
    expect(r.overall.unaidedSentenceShare).toBe(0.3);
    expect(r.trend).toBe('insufficient-data');
    expect(r.earlier).toBeUndefined();
  });

  it('counts help only where the same reading has a view, and a parallel text is not a sentence rescue', async () => {
    const h = createHarness();
    await chapters(h, 10);
    await h.view(U, 'es', A, 0);
    await h.help(U, 'es', A, 5, 0, F('sol'), 1); // sentence 5 was never viewed
    await h.rescue(U, 'es', A, [6]);
    await h.bus.emit({ type: 'EnglishRescueRevealed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'par', textId: A, sentenceIds: [`${A}/s0`], scope: 'parallel' } as EventInput<DomainEvent>);
    const r = await h.golearn.rescueDependence(U);
    expect(r.overall.sentences).toBe(1);
    expect(r.overall.per100Words.word).toBe(0);
    expect(r.overall.per100Sentences.english).toBe(0);
    expect(r.overall.unaidedSentenceShare).toBe(1);
  });

  it('says "falling" when English rescues drop from most sentences to few, and reports both halves', async () => {
    const h = createHarness();
    const n = RESCUE.minUnitsForTrend;
    await chapters(h, n);
    await h.viewAll(U, 'es', A, n);
    const half = n / 2;
    for (let i = 0; i < half; i++) if (i % 10 < 3) await h.rescue(U, 'es', A, [i]); // 30 in 100 early
    await h.rescue(U, 'es', A, [half + 1]); // about 3 in 100 late
    const r = await h.golearn.rescueDependence(U);
    expect(r.earlier!.per100Sentences.english).toBe(30);
    expect(r.recent!.per100Sentences.english).toBeLessThanOrEqual(4);
    expect(r.trend).toBe('falling');
    expect(r.byKind!.english).toBe('falling');
    expect(r.byKind!.word).toBe('steady'); // no lookups at all in either half
  });

  it('says "rising" and "steady" by the same rule, and nothing below the minimum of reading', async () => {
    const h = createHarness();
    const n = RESCUE.minUnitsForTrend;
    await chapters(h, n);
    await h.viewAll(U, 'es', A, n - 1);
    expect((await h.golearn.rescueDependence(U)).trend).toBe('insufficient-data');
    await h.view(U, 'es', A, n - 1);
    expect((await h.golearn.rescueDependence(U)).trend).toBe('steady'); // no rescue in either half
    for (let i = n / 2; i < n; i += 2) await h.rescue(U, 'es', A, [i]); // every other late sentence
    expect((await h.golearn.rescueDependence(U)).trend).toBe('rising');
  });

  it('a tiny change on little reading is not a trend (1 in 30 against 0 in 30 stays steady)', async () => {
    const h = createHarness();
    const n = RESCUE.minUnitsForTrend;
    await chapters(h, n);
    await h.viewAll(U, 'es', A, n);
    await h.rescue(U, 'es', A, [0]);
    const r = await h.golearn.rescueDependence(U);
    expect(r.earlier!.per100Sentences.english).toBeGreaterThan(0);
    expect(r.trend).toBe(r.earlier!.per100Sentences.english - r.recent!.per100Sentences.english >= RESCUE.minAbsoluteChange ? 'falling' : 'steady');
  });

  it('can be asked for one text, one stage or one language', async () => {
    const h = createHarness();
    await chapters(h, 10);
    await h.viewAll(U, 'es', A, 4);
    await h.viewAll(U, 'es', B, 2);
    await h.rescue(U, 'es', B, [0]);
    expect((await h.golearn.rescueDependence(U, { textId: A })).overall).toMatchObject({ sentences: 4, per100Sentences: { english: 0, explanation: 0 } });
    expect((await h.golearn.rescueDependence(U, { textId: B })).overall).toMatchObject({ sentences: 2, per100Sentences: { english: 50, explanation: 0 } });
    expect((await h.golearn.rescueDependence(U, { stageId: stageRow(1, 's2').id })).overall.sentences).toBe(2); // the stage of text B
    expect((await h.golearn.rescueDependence(U, { stageId: stageRow(0, 's1').id })).overall.sentences).toBe(4);
    expect((await h.golearn.rescueDependence(U, { lang: 'de' })).overall.sentences).toBe(0);
  });

  it('a second sitting over the same sentences is new reading, counted on its own', async () => {
    const h = createHarness();
    await chapters(h, 10);
    await h.viewAll(U, 'es', A, 3, 's1');
    await h.rescue(U, 'es', A, [0, 1, 2], 's1');
    await h.viewAll(U, 'es', A, 3, 's2'); // read again later, without help
    const r = await h.golearn.rescueDependence(U);
    expect(r.overall.sentences).toBe(6);
    expect(r.overall.per100Sentences.english).toBe(50);
  });
});
