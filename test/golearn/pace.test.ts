/** readingPace — quiet measures from recorded dwell, lookups and rescues. A rough lower bound; never a score. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { DomainEvent, EventInput } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { COURSE, buildChapter, filler, stageRow, t, workRow } from './courseFixtures';

const U = 'u1';
const A = ids.text('es', 'a');
const B = ids.text('es', 'b');
const F = (w: string) => ids.form('es', w);

async function two(h: Harness, n = 40) {
  await buildChapter(h.store, { slug: 'a', work: 'w1', chapter: 1, sentences: filler(n) });
  await buildChapter(h.store, { slug: 'b', work: 'w2', chapter: 1, sentences: filler(n) });
  await h.store.stages.bulkPut([stageRow(0, 's1'), stageRow(1, 's2')]);
  await h.store.works.bulkPut([workRow('w1', 's1'), workRow('w2', 's2')]);
}

describe('readingPace', () => {
  it('words per minute need 30 timed sentences, and divide the words by the recorded dwell', async () => {
    const h = createHarness();
    await two(h);
    for (let i = 0; i < 29; i++) await h.viewTimed(U, 'es', A, i, 3000);
    let pace = await h.golearn.readingPace(U);
    expect(pace).toMatchObject({ basis: 'sentence-dwell', sentences: 29, trend: 'insufficient-data' });
    expect(pace.wordsPerMinute).toBeUndefined();
    await h.viewTimed(U, 'es', A, 29, 3000);
    pace = await h.golearn.readingPace(U);
    expect(pace.sentences).toBe(30);
    expect(pace.wordsPerMinute).toBe(60); // 90 words in 90 seconds
  });

  it('a view without a dwell time still counts as a sentence seen but not toward the figure', async () => {
    const h = createHarness();
    await two(h);
    for (let i = 0; i < 30; i++) await h.viewTimed(U, 'es', A, i, 6000);
    for (let i = 30; i < 40; i++) await h.view(U, 'es', A, i); // untimed
    const pace = await h.golearn.readingPace(U);
    expect(pace.sentences).toBe(40);
    expect(pace.wordsPerMinute).toBe(30); // 90 words in 180 seconds; the ten untimed sentences do not enter the figure
  });

  it('counts lookups per 100 words and rescues per 100 sentences from help in the same sitting as a view', async () => {
    const h = createHarness();
    await buildChapter(h.store, {
      slug: 'a', sentences: [0, 1, 2, 3, 4].map(() => ({
        tokens: [t('sol', 'sol', 'NOUN'), t('luna', 'luna', 'NOUN'), t('mar', 'mar', 'NOUN'), t('rio', 'rio', 'NOUN')],
        phrases: [{ pattern: ['sol', 'luna'], tokenIndexes: [0, 1] }], patterns: [{ key: 'p', tokenIndexes: [2] }],
      })),
    });
    await h.viewAll(U, 'es', A, 5); // 5 sentences · 20 words
    await h.help(U, 'es', A, 0, 0, F('sol'), 1); // 1 lookup
    await h.help(U, 'es', A, 0, 1, F('luna'), 1); // 2
    const phraseId = ids.phrase('es', ['sol', 'luna']);
    await h.bus.emit({ type: 'PhraseHelpOpened', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'ph1', sentenceId: `${A}/s1`, phraseId, phraseOccurrenceId: ids.phraseOccurrence(phraseId, `${A}/s1`, 0) } as EventInput<DomainEvent>); // 3
    await h.bus.emit({ type: 'GrammarHelpOpened', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'gr1', sentenceId: `${A}/s2`, patternId: ids.pattern('es', 'p'), tokenIds: [] } as EventInput<DomainEvent>); // 4
    await h.decoding(U, 'es', A, 3, 0, F('sol'), []); // 5
    await h.rescue(U, 'es', A, [0, 1]); // 2 sentences rescued
    await h.bus.emit({ type: 'SentenceExplanationRevealed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'ex1', sentenceId: `${A}/s1` } as EventInput<DomainEvent>); // s1 again: still one sentence
    await h.bus.emit({ type: 'EnglishRescueRevealed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'par', textId: A, sentenceIds: [`${A}/s4`], scope: 'parallel' } as EventInput<DomainEvent>); // not a sentence rescue
    const pace = await h.golearn.readingPace(U);
    expect(pace.sentences).toBe(5);
    expect(pace.lookupsPer100Words).toBe(25); // 5 lookups in 20 words
    expect(pace.rescuesPer100Sentences).toBe(40); // 2 of 5 sentences
  });

  it('help on a sentence that was never viewed is not counted (numerator and denominator describe the same sentences)', async () => {
    const h = createHarness();
    await two(h);
    await h.view(U, 'es', A, 0);
    await h.help(U, 'es', A, 5, 0, F('sol'), 1);
    expect((await h.golearn.readingPace(U)).lookupsPer100Words).toBe(0);
  });

  it('rereadSittings counts sittings in which a sentence seen before was viewed again', async () => {
    const h = createHarness();
    await two(h);
    await h.viewAll(U, 'es', A, 3, 's1');
    await h.viewAll(U, 'es', A, 3, 's2'); // reread
    await h.viewAll(U, 'es', A, 6, 's3'); // reread (and new ones)
    await h.viewAll(U, 'es', B, 2, 's4'); // nothing seen before
    expect((await h.golearn.readingPace(U)).rereadSittings).toBe(2);
  });

  describe('trend', () => {
    /** One sitting of five timed sentences at the given dwell. */
    const sitting = async (h: Harness, k: number, dwell: number) => { for (let i = 0; i < 5; i++) await h.viewTimed(U, 'es', A, i, dwell, `t${k}`); };

    it('is insufficient-data below six sittings', async () => {
      const h = createHarness();
      await two(h);
      for (let k = 0; k < 5; k++) await sitting(h, k, 3000);
      expect((await h.golearn.readingPace(U)).trend).toBe('insufficient-data');
    });

    it('compares the median of the last three sittings with the three before: faster, slower, steady (10 % band)', async () => {
      const cases: Array<[number[], string]> = [
        [[3000, 3000, 3000, 2000, 2000, 2000], 'faster'], // 60 → 90 words per minute
        [[2000, 2000, 2000, 3000, 3000, 3000], 'slower'],
        [[3000, 3000, 3000, 2800, 2800, 2800], 'steady'], // 7 % faster
        [[3000, 3000, 3000, 2700, 2700, 2700], 'faster'], // 11 % faster
      ];
      for (const [dwells, want] of cases) {
        const h = createHarness();
        await two(h);
        for (const [k, d] of dwells.entries()) await sitting(h, k, d);
        expect((await h.golearn.readingPace(U)).trend, dwells.join()).toBe(want);
      }
    });

    it('uses the median, so one odd sitting does not decide, and only the latest six sittings', async () => {
      const h = createHarness();
      await two(h);
      // an old slow sitting, then 3 steady, then 3 steady with one very fast outlier
      for (const [k, d] of [9000, 3000, 3000, 3000, 3000, 500, 3000].entries()) await sitting(h, k, d);
      expect((await h.golearn.readingPace(U)).trend).toBe('steady');
    });

    it('a sitting needs five timed sentences to have a figure of its own', async () => {
      const h = createHarness();
      await two(h);
      for (let k = 0; k < 6; k++) for (let i = 0; i < 4; i++) await h.viewTimed(U, 'es', A, i, 3000, `t${k}`);
      expect((await h.golearn.readingPace(U)).trend).toBe('insufficient-data');
    });
  });

  it('can be scoped to a text, a stage or a language', async () => {
    const h = createHarness();
    await two(h);
    await buildChapter(h.store, { slug: 'de', lang: 'de', sentences: filler(3) });
    await h.viewAll(U, 'es', A, 4, 's1');
    await h.viewAll(U, 'es', B, 2, 's2');
    await h.viewAll(U, 'de', ids.text('de', 'de'), 3, 's3');
    expect((await h.golearn.readingPace(U)).sentences).toBe(9);
    expect((await h.golearn.readingPace(U, { textId: A })).sentences).toBe(4);
    expect((await h.golearn.readingPace(U, { stageId: ids.stage(COURSE, 's2') })).sentences).toBe(2);
    expect((await h.golearn.readingPace(U, { lang: 'de' })).sentences).toBe(3);
    expect((await h.golearn.readingPace(U, { stageId: ids.stage(COURSE, 's1'), textId: B })).sentences).toBe(0); // the intersection
    expect((await h.golearn.readingPace('nobody')).sentences).toBe(0);
  });
});
