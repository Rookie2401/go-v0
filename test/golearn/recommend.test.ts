import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import {
  ES_GEN, ES_JOHN, ES_PREP, ES_STORY, buildSpanish, buildSpanishPrep, buildSpanishScripture,
} from './fixtures';

const U = 'u1';

async function readStory(h: Harness, sessions = ['s1', 's2', 's3']) {
  for (const s of sessions) for (let i = 0; i < 4; i++) await h.view(U, 'es', ES_STORY, i, s);
}

async function setup() {
  const h = createHarness();
  await h.seed(U, 'honduras-es');
  await buildSpanish(h.store);
  await buildSpanishScripture(h.store);
  await buildSpanishPrep(h.store);
  return h;
}

describe('recommend()', () => {
  it('a brand-new learner gets nothing that is a stretch (and nothing is invented)', async () => {
    const h = await setup();
    const texts = await h.store.texts.count();
    const sentences = await h.store.sentences.count();
    expect(await h.golearn.recommend(U)).toEqual([]);
    expect(await h.store.texts.count()).toBe(texts);
    expect(await h.store.sentences.count()).toBe(sentences); // recommend never generates text
  });

  it('suggests listening to a text the learner can already read, until they can follow it by ear', async () => {
    const h = await setup();
    await readStory(h);
    const recs = await h.golearn.recommend(U);
    const listen = recs.find((r) => r.textId === ES_STORY);
    expect(listen?.reason).toBe('listen-to-read-text');
    expect(listen?.band).toBe('comfortable');
    expect(listen!.score).toBeGreaterThan(0);
    expect(listen!.explanation.length).toBeGreaterThan(0);

    for (const s of ['l1', 'l2', 'l3']) await h.listen(U, 'es', ES_STORY, [0, 1, 2, 3], { session: s });
    expect((await h.golearn.recommend(U)).find((r) => r.textId === ES_STORY)).toBeUndefined();
  });

  it('suggests an unread text made of familiar words as an easy story, and honours interests', async () => {
    const h = await setup();
    await readStory(h);
    await buildFixtureText(h.store, {
      lang: 'es', slug: 'story-03', tags: ['daily-life'],
      sentences: [{ tokens: [{ surface: 'Yo', lemma: 'yo', pos: 'PRON' }, { surface: 'creo', lemma: 'creer', pos: 'VERB' }, { surface: 'en', lemma: 'en', pos: 'ADP' }, { surface: 'Dios', lemma: 'Dios', pos: 'PROPN' }, { surface: '.', isWord: false }] }],
    });
    await buildFixtureText(h.store, {
      lang: 'es', slug: 'story-04', tags: ['mission'],
      sentences: [{ tokens: [{ surface: 'Dios', lemma: 'Dios', pos: 'PROPN' }, { surface: 'perdona', lemma: 'perdonar', pos: 'VERB' }, { surface: 'el', lemma: 'el', pos: 'DET' }, { surface: 'pecado', lemma: 'pecado', pos: 'NOUN' }] }],
    });
    const plain = await h.golearn.recommend(U);
    const easy = plain.filter((r) => r.reason === 'easy-story').map((r) => r.textId);
    expect(easy).toContain('text:es:story-03');
    const boosted = await h.golearn.recommend(U, { interests: ['daily-life'] });
    const s3 = (list: typeof plain) => list.find((r) => r.textId === 'text:es:story-03')!.score;
    expect(s3(boosted)).toBeGreaterThan(s3(plain));
    expect(plain.length).toBeLessThanOrEqual(5);
    expect((await h.golearn.recommend(U, { limit: 1 }))).toHaveLength(1);
    const sorted = plain.map((r) => r.score);
    expect([...sorted].sort((a, b) => b - a)).toEqual(sorted);
  });

  it('with a scripture target, recommends existing preparatory texts (generated ones flagged, never created)', async () => {
    const h = await setup();
    await buildSpanishPrep(h.store, true, 'prep-generated');
    await readStory(h);
    const before = await h.store.texts.count();
    const recs = await h.golearn.recommend(U, { targetTextId: ES_JOHN, limit: 10 });
    const prep = recs.filter((r) => r.reason === 'prepares-scripture').map((r) => r.textId);
    expect(prep).toContain(ES_PREP);
    expect(prep).toContain(ES_GEN);
    const top = recs.find((r) => r.textId === ES_PREP)!;
    expect(top.reinforces).toContain(ids.lemma('es', 'amar', 'VERB'));
    expect(top.score).toBeGreaterThan(0.5);
    expect(await h.store.texts.count()).toBe(before);
  });

  it('suggests revisiting scripture once it is reachable and was read with help', async () => {
    const h = await setup();
    await readStory(h);
    await h.view(U, 'es', ES_JOHN, 0, 'j1', 'scripture');
    await h.view(U, 'es', ES_JOHN, 1, 'j1', 'scripture');
    await h.rescue(U, 'es', ES_JOHN, [0, 1], 'j1');
    // learn the missing words from story-02 / more reading so the passage becomes workable
    for (const s of ['p1', 'p2', 'p3', 'p4']) { await h.view(U, 'es', ES_PREP, 0, s); await h.view(U, 'es', ES_PREP, 1, s); }
    for (const w of ['todo', 'aquel', 'que', 'él']) await h.mark(U, 'es', ids.form('es', w), 'known');
    const john = await h.golearn.coverage(U, ES_JOHN);
    expect(['comfortable', 'productive-challenge']).toContain(john.band);
    const rec = (await h.golearn.recommend(U, { limit: 10 })).find((r) => r.textId === ES_JOHN);
    expect(rec?.reason).toBe('revisit-scripture');
  });

  it('suggests rehearsing a testimony that has an accepted revision', async () => {
    const h = await setup();
    await h.store.testimonies.put({ id: 'tst1', userId: U, lang: 'es', title: 'Mi historia', createdAt: '2026-01-01T00:00:00.000Z', currentRevisionId: 'tst1/r1' });
    await h.store.testimonies.put({ id: 'tst2', userId: U, lang: 'es', title: 'Borrador', createdAt: '2026-01-01T00:00:00.000Z' });
    const recs = await h.golearn.recommend(U);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ reason: 'rehearse-testimony', testimonyId: 'tst1' });
    expect(recs[0].textId).toBeUndefined();
  });

  it('returns nothing for a user whose language cannot be determined', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    expect(await h.golearn.recommend('ghost')).toEqual([]);
  });
});
