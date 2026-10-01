/**
 * A sentence a revision retired is history. The importer keeps its phrase and pattern occurrence rows (as it keeps its tokens and
 * analyses) so a rebuild can recreate the evidence; nothing learner-facing may offer or count them.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { Sentence } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_JOHN, ES_STORY, buildSpanish, buildSpanishScripture } from './fixtures';

const U = 'u1';
const S0 = `${ES_STORY}/s0`; // "Yo creo en Dios." — carries the phrase "creo en _" and the pattern "present-tense"
const LIVE = `${ES_STORY}/s2`; // "Yo creo en Jesús." — the same phrase, still live

/** A revision that replaces sentence 0 (the importer keeps the retired sentence's tokens, analyses AND occurrences). */
async function reviseSentence0(h: Harness) {
  const text = (await h.store.texts.get(ES_STORY))!;
  await h.store.texts.put({ ...text, contentVersion: 2 });
  const old = (await h.store.sentences.get(S0))!;
  await h.store.sentences.put({ ...old, retiredInVersion: 2 });
  const fresh: Sentence = { ...old, id: `${S0}@2`, key: `${old.key}@2`, versionAdded: 2 };
  delete fresh.retiredInVersion;
  await h.store.sentences.put(fresh);
}

async function world(withOccurrences: boolean): Promise<Harness> {
  const h = createHarness();
  await buildSpanish(h.store);
  await buildSpanishScripture(h.store);
  await h.viewAll(U, 'es', ES_STORY, 4, 's1');
  await h.understood(U, 'es', ES_STORY, [1, 2], 's2');
  await h.viewAll(U, 'es', ES_JOHN, 2, 's3', 'scripture');
  await h.golearn.settled();
  await reviseSentence0(h);
  if (!withOccurrences) {
    for (const o of await h.store.phraseOccurrences.where('sentenceId', S0)) await h.store.phraseOccurrences.delete(o.id);
    for (const o of await h.store.patternOccurrences.where('sentenceId', S0)) await h.store.patternOccurrences.delete(o.id);
  }
  return h;
}

describe('retired sentences keep their occurrences, but nothing learner-facing sees them', () => {
  it('precondition: the retired sentence really carries a phrase and a pattern occurrence', async () => {
    const h = await world(true);
    expect((await h.store.phraseOccurrences.where('sentenceId', S0)).length).toBeGreaterThan(0);
    expect((await h.store.patternOccurrences.where('sentenceId', S0)).length).toBeGreaterThan(0);
    expect((await world(false).then((x) => x.store.phraseOccurrences.where('sentenceId', S0))).length).toBe(0);
  });

  it('coverage, forecast, support, recommendations, scripture readiness and progress of the current text are identical with and without those rows', async () => {
    const a = await world(true);
    const b = await world(false);
    const read = async (h: Harness) => JSON.stringify({
      coverage: await h.golearn.coverage(U, ES_STORY),
      forecast: await h.golearn.predictDifficulty(U, ES_STORY),
      sentence: await h.golearn.sentenceSupport(U, LIVE),
      tokenLive: await h.golearn.tokenSupport(U, `${LIVE}/t1`, 5),
      recommend: await h.golearn.recommend(U, { limit: 20, includeUnpublished: true }),
      readiness: await h.golearn.scriptureReadiness(U, ES_STORY),
      progress: await h.golearn.readingProgress(U, ES_STORY),
    });
    expect(await read(a)).toBe(await read(b));

    // and the retired phrase / pattern are not counted in what the learner is told about the current text
    const cov = await a.golearn.coverage(U, ES_STORY);
    expect(cov.wordTokens).toBe(11); // 15 words, 4 of which belong to the retired sentence
    const support = await a.golearn.tokenSupport(U, `${LIVE}/t1`, 3);
    expect(support.phrases.map((p) => p.occurrence.sentenceId)).toEqual([LIVE]);
  });

  it('support for a token of the retired sentence offers neither phrase nor pattern, and its sentence is not an example of other words', async () => {
    const h = await world(true);
    const retired = await h.golearn.tokenSupport(U, `${S0}/t1`, 3);
    expect(retired.phrases).toEqual([]);
    expect(retired.patterns).toEqual([]);
    const live = await h.golearn.tokenSupport(U, `${LIVE}/t1`, 3);
    expect(live.knownExamples).not.toContain(S0);
    expect(live.knownExamples).toContain(`${ES_STORY}/s1`); // the other live sentence with the same lemma (creer)
  });

  it('the fold still reads a retired sentence by id: help and reports on it keep creating evidence, and a rebuild recreates it', async () => {
    const h = await world(true);
    const phrase = ids.phrase('es', ['creo', 'en', '_']);
    const before = await h.golearn.getItemState(U, phrase);
    expect(before?.encounterCount).toBeGreaterThan(0);
    await h.golearn.rebuild(U);
    expect(await h.golearn.getItemState(U, phrase)).toEqual(before);
    const pattern = ids.pattern('es', 'present-tense');
    const snap = JSON.stringify(await h.golearn.getItemState(U, pattern));
    await h.golearn.rebuild(U);
    expect(JSON.stringify(await h.golearn.getItemState(U, pattern))).toBe(snap);
  });
});
