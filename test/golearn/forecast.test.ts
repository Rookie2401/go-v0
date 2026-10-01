/** predictDifficulty — what a text will be like for this learner; derived from evidence, honest about what it cannot know. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { DomainEvent, EventInput } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { buildChapter, t } from './courseFixtures';

const U = 'u1';
const book1 = ids.text('es', 'book-1');
const book2 = ids.text('es', 'book-2');
const prior = ids.text('es', 'prior');
const ph = ids.text('es', 'ph');
const other = ids.text('es', 'other');

const PHRASE = ids.phrase('es', ['gracias', 'a', '_']);

/** Words and sentences chosen so every category of the forecast has a known member. */
async function build(h: Harness) {
  // the learner has already shown "yo leo el" (and so "lee", through the lemma) twice
  await buildChapter(h.store, {
    slug: 'prior', sentences: [
      { tokens: [t('Yo', 'yo', 'PRON'), t('leo', 'leer', 'VERB'), t('el', 'el', 'DET')], patterns: [{ key: 'present', title: 'Present tense', tokenIndexes: [1] }] },
      { tokens: [t('Yo', 'yo', 'PRON'), t('leo', 'leer', 'VERB'), t('el', 'el', 'DET')] },
    ],
  });
  // a phrase met twice, with help both times
  await buildChapter(h.store, {
    slug: 'ph', sentences: [0, 1, 2].map(() => ({
      tokens: [t('gracias', 'gracia', 'NOUN'), t('a', 'a', 'ADP'), t('Dios', 'Dios', 'PROPN')],
      phrases: [{ pattern: ['gracias', 'a', '_'], display: 'gracias a …', tokenIndexes: [0, 1, 2] }],
    })),
  });
  await buildChapter(h.store, {
    slug: 'book-1', work: 'book', chapter: 1, title: 'El libro', sentences: [
      { tokens: [t('Yo', 'yo', 'PRON'), t('leo', 'leer', 'VERB'), t('el', 'el', 'DET'), t('libro', 'libro', 'NOUN', 'book')], patterns: [{ key: 'present', title: 'Present tense', tokenIndexes: [1] }] },
      { tokens: [t('Pedro', 'Pedro', 'PROPN'), t('lee', 'leer', 'VERB'), t('el', 'el', 'DET'), t('libro', 'libro', 'NOUN', 'book'), t('mesa', 'mesa', 'NOUN')], patterns: [{ key: 'past', title: 'Past tense', tokenIndexes: [1] }] },
      { tokens: [t('zorro', 'zorro', 'NOUN'), t('cuarto', 'cuarto', 'NOUN'), t('rana', 'rana', 'NOUN'), t('xyzzy')] },
      {
        tokens: [t('gracias', 'gracia', 'NOUN'), t('a', 'a', 'ADP'), t('Dios', 'Dios', 'PROPN')],
        phrases: [{ pattern: ['gracias', 'a', '_'], display: 'gracias a …', tokenIndexes: [0, 1, 2] }],
      },
    ],
  });
  await buildChapter(h.store, { slug: 'book-2', work: 'book', chapter: 2, sentences: [{ tokens: [t('mesa', 'mesa', 'NOUN')] }] });
  await buildChapter(h.store, { slug: 'other', sentences: [{ tokens: [t('cuarto', 'cuarto', 'NOUN'), t('cuarto', 'cuarto', 'NOUN'), t('rana', 'rana', 'NOUN')] }] });
  // varieties: a human override that tags two tokens of book-1
  const tag = async (tokenId: string, lemma: string, register: Array<'colloquial' | 'regional-isan' | 'standard'>) => {
    await h.store.analyses.put({
      id: `an:${tokenId}:human`, tokenId, lang: 'es', lemmaId: ids.lemma('es', lemma, 'NOUN'), pos: 'NOUN', morph: {}, confidence: 1, provenance: 'human',
      analyzer: 'human:test', createdAt: '2026-01-01T00:00:00.000Z', register,
    });
  };
  await tag(`${book1}/s2/t1`, 'cuarto', ['regional-isan']);
  await tag(`${book1}/s1/t4`, 'mesa', ['colloquial', 'standard']);
}

const phraseHelp = (h: Harness, textId: string, i: number, session: string) =>
  h.bus.emit({
    type: 'PhraseHelpOpened', userId: U, lang: 'es', surface: 'corpus', session, dedupeKey: `ph:${textId}:${i}:${session}`,
    sentenceId: `${textId}/s${i}`, phraseId: PHRASE, phraseOccurrenceId: ids.phraseOccurrence(PHRASE, `${textId}/s${i}`, 0),
  } as EventInput<DomainEvent>);

async function learner(): Promise<Harness> {
  const h = createHarness();
  await build(h);
  await h.understood(U, 'es', prior, [0, 1], 'p1');
  await h.view(U, 'es', ph, 0, 'p2');
  await phraseHelp(h, ph, 0, 'p2');
  await h.view(U, 'es', ph, 1, 'p3');
  await phraseHelp(h, ph, 1, 'p3');
  return h;
}

describe('predictDifficulty', () => {
  it('reports coverage, the categories of unknown words, weak phrases, new constructions, varieties and unanalysed words', async () => {
    const h = await learner();
    const f = await h.golearn.predictDifficulty(U, book1);
    expect(f.textId).toBe(book1);
    expect(f.userId).toBe(U);
    expect(f.coverage).toEqual(await h.golearn.coverage(U, book1));
    expect(f.coverage.wordTokens).toBe(16);

    // shown-known: yo, leo, el (s0), el, lee (s1; through the lemma 'leer') = 5 of 16 words
    expect(f.predictedCoverage).toBeCloseTo(5 / 16, 4);

    expect(f.properNouns.map((x) => [x.surface, x.count])).toEqual([['Pedro', 1]]);
    // libro: twice in the text · mesa: once here and once in chapter 2 of the same book · cuarto: three times across the library
    expect(f.newUsefulWords.map((x) => [x.surface, x.count])).toEqual([['libro', 2], ['cuarto', 1], ['mesa', 1]]);
    // zorro: nowhere else · rana: twice in the library but a different book · xyzzy: unanalysed
    expect(f.rareWords.map((x) => [x.surface, x.count])).toEqual([['rana', 1], ['xyzzy', 1], ['zorro', 1]]);
    expect(f.newUsefulWords.find((x) => x.surface === 'libro')).toMatchObject({ itemId: ids.form('es', 'libro'), itemKind: 'form', gloss: 'book' });

    // the phrase was met twice and needed help both times; the sentence of this text has it once
    expect(f.weakPhrases).toEqual([{ itemId: PHRASE, itemKind: 'phrase', surface: 'gracias a …', count: 1 }]);
    // "present" was met in the prior text; "past" never
    expect(f.newConstructions).toEqual([{ itemId: ids.pattern('es', 'past'), itemKind: 'pattern', surface: 'Past tense', count: 1 }]);

    expect(f.varieties).toEqual({ 'regional-isan': 1, colloquial: 1 }); // 'standard' is not a variety
    expect(f.newUsefulWords.find((x) => x.surface === 'cuarto')!.register).toEqual(['regional-isan']);
    expect(f.unanalysedWords).toBe(1);
  });

  it('says what it cannot know in `limits`, and the summary uses the stated shape', async () => {
    const h = await learner();
    const f = await h.golearn.predictDifficulty(U, book1);
    expect(f.limits[0]).toBe("No frequency data: 'useful' means repeated in this text, this book or your library");
    expect(f.limits.some((l) => /1 of 16 words \(6\.3 %\) have no analysis/.test(l))).toBe(true); // above 5 %
    expect(f.limits.some((l) => /very little/.test(l))).toBe(true); // the learner has met very few words
    expect(f.summary).toBe('Predicted coverage 31.3 % (an estimate). 3 new useful words · 3 rare words · 1 weak phrase · 1 new construction.');
  });

  it('lists no analysis line when unanalysed words are few, and still always states the frequency limit', async () => {
    const h = createHarness();
    await buildChapter(h.store, { slug: 'solo', sentences: [{ tokens: [t('uno', 'uno', 'NUM'), t('dos', 'dos', 'NUM'), t('tres', 'tres', 'NUM')] }] });
    const f = await h.golearn.predictDifficulty(U, ids.text('es', 'solo'));
    expect(f.limits.filter((l) => /no analysis/.test(l))).toHaveLength(0);
    expect(f.limits[0]).toMatch(/^No frequency data/);
    expect(f.predictedCoverage).toBe(0);
    expect(f.rareWords.map((x) => x.surface)).toEqual(['dos', 'tres', 'uno']); // equal counts: by surface
  });

  it('the weak-phrase verdict follows the last two encounters: a later help-free meeting clears it', async () => {
    const h = await learner();
    expect((await h.golearn.predictDifficulty(U, book1)).weakPhrases).toHaveLength(1);
    await h.view(U, 'es', ph, 2, 'p4'); // met again in a later sitting, no help
    expect((await h.golearn.predictDifficulty(U, book1)).weakPhrases).toHaveLength(0);
  });

  it('restricts itself to the given sentences, and is deterministic', async () => {
    const h = await learner();
    const only = await h.golearn.predictDifficulty(U, book1, { sentenceIds: [`${book1}/s2`] });
    expect(only.coverage.wordTokens).toBe(4);
    expect(only.rareWords.map((x) => x.surface)).toEqual(['rana', 'xyzzy', 'zorro']);
    expect(only.newUsefulWords.map((x) => x.surface)).toEqual(['cuarto']);
    expect(only.properNouns).toEqual([]);
    const a = await h.golearn.predictDifficulty(U, book1);
    const b = await h.golearn.predictDifficulty(U, book1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a forecast is not exposure: it emits nothing and changes no learner state', async () => {
    const h = await learner();
    const events = (await h.store.events.all()).length;
    const items = (await h.store.learnerItems.where('userId', U)).length;
    const encounters = (await h.store.encounters.where('userId', U)).length;
    await h.golearn.predictDifficulty(U, book1);
    await h.golearn.predictDifficulty(U, book2);
    expect((await h.store.events.all()).length).toBe(events);
    expect((await h.store.learnerItems.where('userId', U)).length).toBe(items);
    expect((await h.store.encounters.where('userId', U)).length).toBe(encounters);
  });

  it('forgets retired sentences when counting where a word occurs, and rejects an unknown text', async () => {
    const h = await learner();
    // "cuarto" was useful because of the library: retire the other text's sentence and it is no longer
    const row = (await h.store.sentences.where('textId', other))[0];
    await h.store.sentences.put({ ...row, retiredInVersion: 2 });
    const f = await h.golearn.predictDifficulty(U, book1);
    expect(f.rareWords.map((x) => x.surface)).toContain('cuarto');
    await expect(h.golearn.predictDifficulty(U, 'text:es:nope')).rejects.toThrow(/unknown text/);
  });
});
