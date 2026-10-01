/** findOccurrences — live, visible sentences containing a form, lemma, phrase or construction, bounded by `limit`. */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { Sentence } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_JOHN, ES_STORY, buildSpanish, buildSpanishScripture } from './fixtures';

const world = async (): Promise<Harness> => {
  const h = createHarness();
  await buildSpanish(h.store);
  await buildSpanishScripture(h.store);
  return h;
};
const sids = (r: Array<{ sentenceId: string }>) => r.map((x) => x.sentenceId);

describe('findOccurrences', () => {
  it('a form: the sentences whose tokens have it, with those tokens', async () => {
    const h = await world();
    const r = await h.golearn.findOccurrences({ lang: 'es', itemId: ids.form('es', 'creo') });
    expect(r).toEqual([
      { sentenceId: `${ES_STORY}/s0`, textId: ES_STORY, tokenIds: [`${ES_STORY}/s0/t1`] },
      { sentenceId: `${ES_STORY}/s2`, textId: ES_STORY, tokenIds: [`${ES_STORY}/s2/t1`] },
    ]);
  });

  it('a lemma: every form credited to it, across texts (story and scripture)', async () => {
    const h = await world();
    const r = await h.golearn.findOccurrences({ lang: 'es', itemId: ids.lemma('es', 'creer', 'VERB') });
    expect(new Set(sids(r))).toEqual(new Set([`${ES_STORY}/s0`, `${ES_STORY}/s1`, `${ES_STORY}/s2`, `${ES_JOHN}/s0`])); // creo, cree, creo, cree
    expect(r.find((x) => x.sentenceId === `${ES_STORY}/s1`)!.tokenIds).toEqual([`${ES_STORY}/s1/t2`]);
  });

  it('a phrase and a construction, through the occurrence indexes', async () => {
    const h = await world();
    const phrase = await h.golearn.findOccurrences({ lang: 'es', itemId: ids.phrase('es', ['creo', 'en', '_']) });
    expect(phrase).toEqual([
      { sentenceId: `${ES_STORY}/s0`, textId: ES_STORY, tokenIds: [`${ES_STORY}/s0/t1`, `${ES_STORY}/s0/t2`, `${ES_STORY}/s0/t3`] },
      { sentenceId: `${ES_STORY}/s2`, textId: ES_STORY, tokenIds: [`${ES_STORY}/s2/t1`, `${ES_STORY}/s2/t2`, `${ES_STORY}/s2/t3`] },
    ]);
    const pattern = await h.golearn.findOccurrences({ lang: 'es', itemId: ids.pattern('es', 'present-tense') });
    expect(sids(pattern)).toEqual([`${ES_STORY}/s0`, `${ES_STORY}/s1`]);
  });

  it('limit, textIds and language bound the answer; writing-system items and unknown items have none', async () => {
    const h = await world();
    const creer = ids.lemma('es', 'creer', 'VERB');
    expect(await h.golearn.findOccurrences({ lang: 'es', itemId: creer, limit: 2 })).toHaveLength(2);
    expect(await h.golearn.findOccurrences({ lang: 'es', itemId: creer, limit: 0 })).toEqual([]);
    expect(sids(await h.golearn.findOccurrences({ lang: 'es', itemId: creer, textIds: [ES_JOHN] }))).toEqual([`${ES_JOHN}/s0`]);
    expect(await h.golearn.findOccurrences({ lang: 'de', itemId: creer })).toEqual([]);
    expect(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.orth('es', 'class:mid') })).toEqual([]);
    expect(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.form('es', 'nunca') })).toEqual([]);
  });

  it('only live sentences: a sentence a revision retired is history, even though its tokens and occurrences are kept', async () => {
    const h = await world();
    const old = (await h.store.sentences.get(`${ES_STORY}/s0`))! as Sentence;
    await h.store.sentences.put({ ...old, retiredInVersion: 2 });
    expect(sids(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.form('es', 'creo') }))).toEqual([`${ES_STORY}/s2`]);
    expect(sids(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.phrase('es', ['creo', 'en', '_']) }))).toEqual([`${ES_STORY}/s2`]);
    expect(sids(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.pattern('es', 'present-tense') }))).toEqual([`${ES_STORY}/s1`]);
    expect(sids(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.lemma('es', 'creer', 'VERB'), textIds: [ES_STORY] }))).not.toContain(`${ES_STORY}/s0`);
  });

  it('only visible texts: unpublished ones appear only in preview', async () => {
    const h = await world();
    await buildFixtureText(h.store, { lang: 'es', slug: 'draft', published: false, sentences: [{ tokens: [{ surface: 'creo', lemma: 'creer', pos: 'VERB' }] }] });
    const draft = 'text:es:draft/s0';
    expect(sids(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.form('es', 'creo') }))).not.toContain(draft);
    expect(sids(await h.golearn.findOccurrences({ lang: 'es', itemId: ids.form('es', 'creo'), includeUnpublished: true }))).toContain(draft);
  });

  it('is read-only and deterministic', async () => {
    const h = await world();
    const before = (await h.store.sentences.count()) + (await h.store.events.count());
    const a = await h.golearn.findOccurrences({ lang: 'es', itemId: ids.lemma('es', 'creer', 'VERB') });
    const b = await h.golearn.findOccurrences({ lang: 'es', itemId: ids.lemma('es', 'creer', 'VERB') });
    expect(a).toEqual(b);
    expect((await h.store.sentences.count()) + (await h.store.events.count())).toBe(before);
  });
});
