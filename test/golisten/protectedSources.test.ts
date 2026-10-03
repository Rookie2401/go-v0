import { expect, it } from 'vitest';
import { buildFixtureText, createMemoryStore } from '../../src/core';
import { createSourceFinder } from '../../src/gotell/sources';

it('removes protected assessment wording from GoTell sources even when an old encounter remains', async () => {
  const store = createMemoryStore();
  const text = await buildFixtureText(store, { lang: 'de', slug: 'protected-source', title: 'Protected',
    sentences: [{ tokens: [{ surface: 'Guten' }, { surface: 'Tag' }] }] });
  const sentence = (await store.sentences.where('textId', text.id))[0];
  const token = (await store.tokens.where('sentenceId', sentence.id))[0];
  await store.encounters.put({id:'old-encounter',userId:'u1',lang:'de',itemId:token.formId,itemKind:'form',sentenceId:sentence.id,textId:text.id,
    surface:'corpus',modality:'reading',at:'2026-01-01T00:00:00.000Z',evidenceKind:'exposure',assistance:0,priorLevel:'unseen',weight:0});
  expect(await createSourceFinder(store).forItem('u1', token.formId)).toHaveLength(1);
  await store.texts.put({...text,listeningAssessmentId:'locked-test'});
  expect(await createSourceFinder(store).forItem('u1', token.formId)).toEqual([]);
});
