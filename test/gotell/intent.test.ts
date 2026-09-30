import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { makeWorld } from './fakes';
import { ES_PHRASE, ES_ROUGH, esAdapter, esLearnerB, esStoryA } from './fixtures';

const ENGLISH = 'When I was young I knew about Jesus but I did not understand my sin';

describe('intent(): constrained English rescue', () => {
  it('beginner: word bank from known wording, new items listed with whyNeeded, a fallback without new language', async () => {
    const w = await makeWorld([esAdapter()]);
    await esStoryA(w, 'A');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: ENGLISH });
    expect(r.proposal).toBe('joven conocer Jesús entender pecado');
    expect(r.newItems.map((n) => n.surface)).toEqual(['entender', 'pecado']);
    expect(r.newItems[0]).toMatchObject({ itemId: ids.form('es', 'entender'), gloss: 'understand' });
    expect(r.newItems[0].whyNeeded).toMatch(/understand/);
    expect(r.familiar.map((f) => f.itemId)).toEqual(expect.arrayContaining([ids.form('es', 'joven'), ids.form('es', 'jesús')]));
    // "know" is known through its lemma (conocía -> conocer)
    expect(r.familiar.map((f) => f.itemId)).toContain(ids.lemma('es', 'conocer', 'VERB'));
    expect(r.fallbackWithoutNew).toEqual({
      text: 'joven conocer Jesús',
      lossNote: expect.stringMatching(/Leaves out: understand, sin/),
    });
    expect(r.meaningNote).toMatch(/not a finished sentence/);
    expect(r.meaningNote).toMatch(/Key terms.*knew, sin/);
  });

  it('learner who knows the phrase gets it used with the right slot filler, and nothing new', async () => {
    const w = await makeWorld([esAdapter()]);
    await esLearnerB(w, 'B');
    const r = await w.gotell.intent({ userId: 'B', lang: 'es', english: ENGLISH });
    expect(r.proposal).toBe('joven conocer Jesús empecé a entender pecado');
    expect(r.newItems).toEqual([]);
    expect(r.fallbackWithoutNew).toBeUndefined();
    expect(r.familiar.map((f) => f.itemId)).toContain(ids.phrase('es', ES_PHRASE));
  });

  it('with an attempt: repairs the learner\'s own sentence, marks expansions and offers a fallback', async () => {
    const w = await makeWorld([esAdapter()]);
    await esStoryA(w, 'A');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: ENGLISH, attempt: ES_ROUGH });
    expect(r.proposal).toBe('Cuando yo era joven yo conocía de Jesús pero yo no entendía mi pecado.');
    expect(r.newItems).toEqual([expect.objectContaining({ itemId: ids.form('es', 'entendía'), surface: 'entendía' })]);
    expect(r.fallbackWithoutNew?.text).toBe(ES_ROUGH);
    expect(r.meaningNote).toMatch(/Key terms/);
    expect(r.meaningNote).not.toMatch(/does not yet include/);
  });

  it('with an attempt: names ideas the attempt leaves out; meaning-changing fixes are never applied silently', async () => {
    const w = await makeWorld([esAdapter()]);
    await esStoryA(w, 'A');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I believe in Jesus and forgiveness', attempt: 'Yo sé en Jesús.' });
    expect(r.proposal).toBe('Yo sé en Jesús.'); // "sé" -> "creo" changes a key term: left to the learner
    expect(r.meaningNote).toMatch(/does not yet include: believe, forgive/);
  });

  it('unrecognised request says so instead of inventing wording', async () => {
    const w = await makeWorld([esAdapter()]);
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I like pizza' });
    expect(r.proposal).toBe('');
    expect(r.newItems).toEqual([]);
    expect(r.meaningNote).toMatch(/not a finished sentence/);
  });
});
